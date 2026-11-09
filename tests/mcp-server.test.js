'use strict';
/* Claude Code, service et serveur (js/mcp/server.js, service.js) : HTTP réel sur 127.0.0.1,
 * cœur hôte du faux AE, réglages sur disque, événements CEP simulés. */
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { EXT, CLIENT, scene, loadHost, makeDom, hostEvalScript } = require('./helpers');

const SCRIPTS = ['js/siming.js', 'js/bridge.js', 'js/mcp/protocol.js', 'js/mcp/server.js', 'js/mcp/service.js'];
const TOKEN = 'ab'.repeat(24);

/** Port libre de la machine. */
function freePort() {
    return new Promise((resolve) => {
        const s = net.createServer();
        s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
    });
}

/** PNG complet w × h (pixels gris). */
function makePng(w, h) {
    const chunk = (type, data) => {
        const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
        const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
        const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
        return Buffer.concat([len, td, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0;
    const raw = Buffer.alloc((w + 1) * h, 0x80);
    for (let y = 0; y < h; y++) raw[y * (w + 1)] = 0;
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
        chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** POST / GET brut (en-têtes libres, Host compris). */
function request(port, opts) {
    return new Promise((resolve, reject) => {
        const body = opts.body === undefined ? '' : (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body));
        const headers = Object.assign({ 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, opts.headers || {});
        if (opts.token !== null) headers.Authorization = 'Bearer ' + (opts.token || TOKEN);
        const req = http.request({ host: '127.0.0.1', port, path: opts.path || '/mcp', method: opts.method || 'POST', headers, agent: false }, (res) => {
            let text = '';
            res.setEncoding('utf8');
            res.on('data', (c) => { text += c; });
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, json: text ? JSON.parse(text) : null }));
        });
        req.on('error', reject);
        req.end(body);
    });
}

/** Service démarré dans une fenêtre jsdom, CEP simulé. */
async function startService(cfg) {
    const { sandbox } = loadHost();
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'siming-claude-'));
    const win = makeDom(SCRIPTS);
    const mcp = win.SIMING.mcp;
    const file = mcp.configFile(path, userData);
    if (cfg) mcp.writeConfig(fs, path, file, cfg);
    const listeners = {};
    const events = [];
    win.SystemPath = { USER_DATA: 'userData', EXTENSION: 'extension' };
    win.CSEvent = function (type, scope) { this.type = type; this.scope = scope; this.data = ''; };
    const cs = {
        evalScript: hostEvalScript(sandbox),
        getSystemPath: (k) => (k === 'userData' ? userData : EXT),
        addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
        dispatchEvent: (ev) => {
            events.push({ type: ev.type, data: JSON.parse(ev.data) });
            (listeners[ev.type] || []).forEach((fn) => fn(ev));
        },
    };
    const readJson = (url) => JSON.parse(fs.readFileSync(path.join(CLIENT, url), 'utf8'));
    const service = await mcp.startService({ cs, req: require, readJson });
    const send = async (type) => { (listeners[type] || []).forEach((fn) => fn({ type, data: '' })); await service.apply(); };
    const last = (type) => events.filter((e) => e.type === type).pop();
    return { win, mcp, service, file, events, last, send, sandbox };
}

module.exports = function (test) {
    test('mcp serveur : contrôle des requêtes (hôte local, pas de navigateur, jeton exact)', () => {
        const { SIMING } = makeDom(['js/mcp/server.js']);
        const ok = { host: '127.0.0.1:47821', authorization: 'Bearer ' + TOKEN };
        assert.strictEqual(SIMING.mcp.checkRequest(ok, TOKEN), null);
        assert.strictEqual(SIMING.mcp.checkRequest(Object.assign({}, ok, { host: 'localhost:47821' }), TOKEN), null);
        assert.strictEqual(SIMING.mcp.checkRequest(Object.assign({}, ok, { host: 'evil.example:47821' }), TOKEN).status, 403);
        assert.strictEqual(SIMING.mcp.checkRequest(Object.assign({}, ok, { origin: 'https://evil.example' }), TOKEN).status, 403);
        assert.ok(/Jeton/.test(SIMING.mcp.checkRequest(Object.assign({}, ok, { authorization: 'Bearer ' + TOKEN + 'x' }), TOKEN).message));
        assert.strictEqual(SIMING.mcp.checkRequest({ host: '127.0.0.1' }, TOKEN).status, 403);
        assert.strictEqual(SIMING.mcp.checkRequest(ok, '').status, 403, 'sans jeton réglé : tout est refusé');
    });

    test('mcp serveur : réglages lus avec défauts, écrits, commande Claude Code', () => {
        const { SIMING } = makeDom(['js/mcp/server.js']);
        const mcp = SIMING.mcp;
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'siming-cfg-'));
        const file = mcp.configFile(path, dir);
        assert.strictEqual(file, path.join(dir, 'SIMING', 'claude.json'));
        assert.deepEqual(mcp.readConfig(fs, file), { enabled: false, port: 47821, token: '' });
        mcp.writeConfig(fs, path, file, { enabled: true, port: 48000, token: TOKEN });
        assert.deepEqual(mcp.readConfig(fs, file), { enabled: true, port: 48000, token: TOKEN });
        fs.writeFileSync(file, '{"enabled":"oui","port":80,"token":"<script>"}');
        assert.deepEqual(mcp.readConfig(fs, file), { enabled: false, port: 47821, token: '' });
        assert.ok(/^[0-9a-f]{48}$/.test(mcp.newToken(require('crypto'))));
        assert.strictEqual(mcp.addCommand({ port: 48000, token: TOKEN }),
            'claude mcp add --scope user --transport http siming http://127.0.0.1:48000/mcp --header "Authorization: Bearer ' + TOKEN + '"');
        assert.strictEqual(mcp.removeCommand(), 'claude mcp remove --scope user siming');
        const other = mcp.otherPort(47821);
        assert.ok(other !== 47821 && other >= 47000 && other < 49000);
    });

    test('mcp serveur : PNG complet attendu (bloc IEND), taille lue', async () => {
        const { SIMING } = makeDom(['js/mcp/server.js']);
        const mcp = SIMING.mcp;
        const png = makePng(8, 5);
        assert.strictEqual(mcp.isCompletePng(png), true);
        assert.strictEqual(mcp.isCompletePng(png.subarray(0, png.length - 4)), false);
        assert.deepEqual(mcp.pngSize(png), { width: 8, height: 5 });
        const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'siming-png-')), 'f.png');
        fs.writeFileSync(file, png.subarray(0, 40));
        setTimeout(() => fs.writeFileSync(file, png), 30);
        assert.strictEqual((await mcp.waitForPng(fs, file, { intervalMs: 10 })).length, png.length);
        await assert.rejects(mcp.waitForPng(fs, file + '.absent', { timeoutMs: 30, intervalMs: 10 }), /pas rendue/);
    });

    test('mcp service : éteint par défaut, état publié, aucun port ouvert', async () => {
        const s = await startService(null);
        const st = s.last('com.siming.mcp.state').data;
        assert.deepEqual([st.enabled, st.running, st.port, st.error], [false, false, null, null]);
        assert.strictEqual(st.version, JSON.parse(fs.readFileSync(path.join(CLIENT, 'tools.json'), 'utf8')).version);
    });

    test('mcp service : HTTP de bout en bout sur le faux After Effects', async () => {
        const port = await freePort();
        const s = await startService({ enabled: true, port, token: TOKEN });
        try {
            assert.deepEqual([s.service.state.running, s.service.state.port], [true, port]);
            const sc = scene();
            const init = await request(port, { body: { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } } });
            assert.strictEqual(init.status, 200);
            assert.ok(/application\/json/.test(init.headers['content-type']));
            assert.strictEqual(init.json.result.serverInfo.name, 'siming');
            assert.strictEqual((await request(port, { body: { jsonrpc: '2.0', method: 'notifications/initialized' } })).status, 202);
            const comp = await request(port, { body: { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_comp', arguments: {} } } });
            const data = JSON.parse(comp.json.result.content[0].text);
            assert.deepEqual(data.layers.map((l) => l.name), ['Parent', 'A', 'B', 'C', 'D']);
            const run = await request(port, { body: { jsonrpc: '2.0', id: 3, method: 'tools/call', params: {
                name: 'run_extendscript', arguments: { code: 'app.project.activeItem.layer(2).name = "Bras"; log("fait"); return 1 + 1;', undoName: 'Renommer' } } } });
            assert.deepEqual(JSON.parse(run.json.result.content[0].text), { value: 2, undo: 'Claude : Renommer', logs: ['fait'] });
            assert.strictEqual(sc.A.name, 'Bras');
            assert.deepEqual(s.last('com.siming.mcp.activity').data, { tool: 'run_extendscript', text: 'Claude : Renommer', level: 'ok' });
            const batch = await request(port, { body: [{ jsonrpc: '2.0', id: 4, method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/cancelled' }] });
            assert.deepEqual(batch.json, [{ jsonrpc: '2.0', id: 4, result: {} }]);
        } finally {
            await s.service.stop();
        }
    });

    test('mcp service : capture_frame lit le PNG rendu, l\'envoie en image et le retire', async () => {
        const port = await freePort();
        const s = await startService({ enabled: true, port, token: TOKEN });
        try {
            const sc = scene();
            const png = makePng(64, 36);
            let rendered = null;
            sc.comp.saveFrameToPng = (t, f) => { rendered = f.fsName; fs.writeFileSync(f.fsName, png); };
            const r = await request(port, { body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'capture_frame', arguments: { time: 1 } } } });
            const [info, image] = r.json.result.content;
            assert.strictEqual(image.type, 'image');
            assert.strictEqual(image.mimeType, 'image/png');
            assert.strictEqual(Buffer.from(image.data, 'base64').length, png.length);
            assert.deepEqual(JSON.parse(info.text).rendered, [64, 36]);
            assert.strictEqual(JSON.parse(info.text).frame, 25);
            assert.ok(!fs.existsSync(rendered), 'frame temporaire retirée');
        } finally {
            await s.service.stop();
        }
    });

    test('mcp service : refus HTTP (jeton, navigateur, hôte, méthode, adresse, JSON)', async () => {
        const port = await freePort();
        const s = await startService({ enabled: true, port, token: TOKEN });
        try {
            const ping = { jsonrpc: '2.0', id: 1, method: 'ping' };
            assert.strictEqual((await request(port, { body: ping })).status, 200);
            assert.strictEqual((await request(port, { body: ping, token: 'cd'.repeat(24) })).status, 403);
            assert.strictEqual((await request(port, { body: ping, token: null })).status, 403);
            assert.strictEqual((await request(port, { body: ping, headers: { Origin: 'https://evil.example' } })).status, 403);
            assert.strictEqual((await request(port, { body: ping, headers: { Host: 'evil.example:' + port } })).status, 403);
            const get = await request(port, { method: 'GET' });
            assert.deepEqual([get.status, get.headers.allow], [405, 'POST']);
            assert.strictEqual((await request(port, { body: ping, path: '/' })).status, 404);
            const bad = await request(port, { body: '{pas du json' });
            assert.deepEqual([bad.status, bad.json.error.code], [400, -32700]);
        } finally {
            await s.service.stop();
        }
    });

    test('mcp service : réglages relus (éteindre ferme le port, nouveau jeton), port déjà pris', async () => {
        const port = await freePort();
        const s = await startService({ enabled: true, port, token: TOKEN });
        const ping = { jsonrpc: '2.0', id: 1, method: 'ping' };
        try {
            const other = 'cd'.repeat(24);
            s.mcp.writeConfig(fs, path, s.file, { enabled: true, port, token: other });
            await s.send('com.siming.mcp.reload');
            assert.strictEqual((await request(port, { body: ping })).status, 403, 'ancien jeton refusé');
            assert.strictEqual((await request(port, { body: ping, token: other })).status, 200);
            s.mcp.writeConfig(fs, path, s.file, { enabled: false, port, token: other });
            await s.send('com.siming.mcp.reload');
            assert.strictEqual(s.last('com.siming.mcp.state').data.running, false);
            await assert.rejects(request(port, { body: ping, token: other }), /ECONNREFUSED/);
            // Port pris par un autre programme
            const busy = http.createServer();
            await new Promise((r) => busy.listen(port, '127.0.0.1', r));
            try {
                s.mcp.writeConfig(fs, path, s.file, { enabled: true, port, token: other });
                await s.send('com.siming.mcp.reload');
                const st = s.last('com.siming.mcp.state').data;
                assert.deepEqual([st.running, st.errorCode], [false, 'EADDRINUSE']);
                assert.ok(/déjà pris/.test(st.error));
            } finally {
                await new Promise((r) => busy.close(r));
            }
            const before = s.events.length;
            await s.send('com.siming.mcp.ping');
            assert.ok(s.events.length > before, 'ping : état republié');
        } finally {
            await s.service.stop();
        }
    });

    test('mcp service : délai dépassé -> message clair (After Effects occupé)', async () => {
        const { SIMING } = makeDom(SCRIPTS);
        await assert.rejects(SIMING.mcp.withTimeout(new Promise(() => {}), 20), /n'a pas répondu en 0 s/);
        assert.strictEqual(await SIMING.mcp.withTimeout(Promise.resolve(5), 20), 5);
    });
};
