'use strict';
/* Claude Code, protocole MCP (js/mcp/protocol.js) : JSON-RPC, outils, erreurs, file d'attente. */
const assert = require('assert');
const { makeDom } = require('./helpers');

/** Gestionnaire avec un faux cœur hôte : answers[`${tool}.${fn}`] = données ou fonction(args). */
function setup(answers, opts) {
    const win = makeDom(['js/siming.js', 'js/mcp/server.js', 'js/mcp/protocol.js']);
    const mcp = win.SIMING.mcp;
    const calls = [];
    const activity = [];
    const call = async (tool, fn, args, o) => {
        calls.push({ tool, fn, args, timeoutMs: o && o.timeoutMs });
        const a = answers[tool + '.' + fn];
        if (a === undefined) throw new Error('Fonction inconnue : ' + tool + '.' + fn);
        return typeof a === 'function' ? a(args) : a;
    };
    const handle = mcp.createHandler(Object.assign({ call, version: '9.9.9', onActivity: (x) => activity.push(x) }, opts || {}));
    let id = 0;
    const rpc = (method, params) => handle({ jsonrpc: '2.0', id: ++id, method, params });
    const tool = async (name, args) => (await rpc('tools/call', { name, arguments: args })).result;
    return { mcp, handle, rpc, tool, calls, activity };
}

module.exports = function (test) {
    test('mcp protocole : initialize (version négociée), ping, notifications et réponses ignorées', async () => {
        const t = setup({});
        const init = (await t.rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'claude-code' } })).result;
        assert.strictEqual(init.protocolVersion, '2025-03-26');
        assert.deepEqual(init.capabilities, { tools: { listChanged: false } });
        assert.strictEqual(init.serverInfo.name, 'siming');
        assert.strictEqual(init.serverInfo.version, '9.9.9');
        assert.ok(/ExtendScript = JavaScript ES3/.test(init.instructions));
        assert.ok(/SVG importé qui contient du texte/.test(init.instructions), 'plantage SVG d\'After Effects 2026 signalé');
        assert.ok(/After Effects a sans doute planté/.test(init.instructions));
        assert.strictEqual((await t.rpc('initialize', { protocolVersion: '1999-01-01' })).result.protocolVersion, t.mcp.PROTOCOL_VERSIONS[0]);
        assert.deepEqual((await t.rpc('ping')).result, {});
        assert.strictEqual(await t.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
        assert.strictEqual(await t.handle({ jsonrpc: '2.0', id: 4, result: {} }), null);
    });

    test('mcp protocole : requête invalide, méthode inconnue, outil inconnu', async () => {
        const t = setup({});
        assert.strictEqual((await t.handle([1])).error.code, -32600);
        assert.strictEqual((await t.handle({ jsonrpc: '2.0', id: 3 })).error.code, -32600);
        const unknown = await t.rpc('resources/list');
        assert.strictEqual(unknown.error.code, -32601);
        assert.ok(/resources\/list/.test(unknown.error.message));
        assert.strictEqual((await t.rpc('tools/call', { name: 'nope' })).error.code, -32602);
    });

    test('mcp protocole : tools/list, six outils décrits, sans détail interne', async () => {
        const t = setup({});
        const { tools } = (await t.rpc('tools/list')).result;
        assert.deepEqual(tools.map((x) => x.name), ['get_project', 'get_comp', 'get_properties', 'run_extendscript', 'capture_frame', 'siming_tool']);
        for (const x of tools) {
            assert.strictEqual(x.inputSchema.type, 'object', x.name);
            assert.ok(x.description.length > 40, x.name);
            assert.ok(!('host' in x), 'champ interne « host » retiré : ' + x.name);
        }
        assert.deepEqual(tools[3].inputSchema.required, ['code']);
        assert.strictEqual(tools[0].annotations.readOnlyHint, true);
        assert.strictEqual(tools[3].annotations.destructiveHint, true);
        assert.ok(/quicktools \/ ease/.test(tools[5].description) && /toolbox \/ nullFor/.test(tools[5].description));
    });

    test('mcp protocole : outils de lecture = fonction du cœur hôte, réponse en JSON', async () => {
        const t = setup({ 'mcp.comp': (a) => ({ id: a.compId, layers: [] }), 'mcp.project': { open: true } });
        const r = await t.tool('get_comp', { compId: 7 });
        assert.deepEqual(JSON.parse(r.content[0].text), { id: 7, layers: [] });
        assert.strictEqual(r.isError, undefined);
        assert.deepEqual(t.calls[0], { tool: 'mcp', fn: 'comp', args: { compId: 7 }, timeoutMs: 60000 });
        await t.tool('get_project');
        assert.deepEqual(t.calls[1].args, {}, 'arguments absents = objet vide');
        assert.deepEqual(t.activity.map((a) => [a.text, a.level]), [['Claude : lit une composition', 'ok'], ['Claude : lit le projet', 'ok']]);
    });

    test('mcp protocole : erreur du cœur hôte ou délai dépassé -> résultat en erreur, pas d\'exception', async () => {
        const t = setup({ 'mcp.comp': () => { throw new Error('Composition introuvable : 9'); } });
        const r = await t.tool('get_comp', { compId: 9 });
        assert.strictEqual(r.isError, true);
        assert.strictEqual(r.content[0].text, 'Erreur : Composition introuvable : 9');
        assert.strictEqual(t.activity[0].level, 'warn');
    });

    test('mcp protocole : run_extendscript, réussite, échec (ligne, rappel ES3, journal), délai', async () => {
        let next;
        const t = setup({ 'mcp.run': () => next });
        next = { ok: true, value: { n: 3 }, logs: ['salut'], undo: 'Claude : Titre' };
        const ok = await t.tool('run_extendscript', { code: 'return 3;', undoName: 'Titre', timeoutSeconds: 1000 });
        assert.deepEqual(JSON.parse(ok.content[0].text), { value: { n: 3 }, undo: 'Claude : Titre', logs: ['salut'] });
        assert.deepEqual(t.calls[0].args, { code: 'return 3;', undoName: 'Titre' });
        assert.strictEqual(t.calls[0].timeoutMs, 600000, 'délai borné à 600 s');
        assert.strictEqual(t.activity[0].text, 'Claude : Titre');
        next = { ok: false, error: 'undefined is not an object', line: 4, logs: ['avant'], undo: 'Claude : script' };
        const bad = await t.tool('run_extendscript', { code: 'x.y = 1;' });
        assert.strictEqual(bad.isError, true);
        const text = bad.content[0].text;
        assert.ok(/^Erreur : undefined is not an object \(ligne 4\)/.test(text), text);
        assert.ok(/reste en place, dans le groupe « Claude : script »/.test(text));
        assert.ok(/Journal :\navant/.test(text));
        next = { ok: false, syntax: true, error: 'Erreur de syntaxe : Expected: ;', logs: [] };
        assert.ok(/ES3/.test((await t.tool('run_extendscript', { code: 'let a = 1' })).content[0].text));
        const empty = await t.tool('run_extendscript', { code: '  ' });
        assert.strictEqual(empty.isError, true);
        assert.strictEqual(t.calls.length, 3, 'code vide : After Effects pas dérangé');
    });

    test('mcp protocole : siming_tool, geste connu, inconnu, statut d\'erreur', async () => {
        let next = { status: { text: 'Lissé 4 keyframes', level: 'ok' }, report: { done: 4 }, comp: { id: 1 } };
        const t = setup({ 'quicktools.ease': () => next });
        const ok = await t.tool('siming_tool', { tool: 'quicktools', action: 'ease', args: { mode: 'both', influence: 60 } });
        assert.deepEqual(JSON.parse(ok.content[0].text), { status: { text: 'Lissé 4 keyframes', level: 'ok' }, report: { done: 4 } });
        assert.deepEqual(t.calls[0].args, { mode: 'both', influence: 60 });
        next = { status: { text: 'Aucune keyframe sélectionnée', level: 'error' } };
        assert.strictEqual((await t.tool('siming_tool', { tool: 'quicktools', action: 'ease' })).isError, true);
        const unknown = await t.tool('siming_tool', { tool: 'quicktools', action: 'presetPath' });
        assert.strictEqual(unknown.isError, true);
        assert.ok(/geste inconnu/.test(unknown.content[0].text));
        assert.strictEqual(t.calls.length, 2, 'geste hors catalogue jamais appelé');
        assert.strictEqual((await t.tool('siming_tool', { tool: 'unparent', action: 'detach' })).isError, true);
    });

    test('mcp protocole : capture_frame rend une image ; sans capture, une erreur', async () => {
        const seen = [];
        const t = setup({}, { capture: async (a) => { seen.push(a); return { info: { frame: 12 }, data: 'iVBOR', mimeType: 'image/png' }; } });
        const r = await t.tool('capture_frame', { compId: 3, time: 0.5, maxSize: 5000 });
        assert.deepEqual(seen, [{ compId: 3, time: 0.5, maxSize: 2048 }]);
        assert.deepEqual(r.content[1], { type: 'image', data: 'iVBOR', mimeType: 'image/png' });
        assert.deepEqual(JSON.parse(r.content[0].text), { frame: 12 });
        const none = setup({});
        assert.strictEqual((await none.tool('capture_frame', {})).isError, true);
    });

    test('mcp protocole : un appel à la fois, réponse trop longue tronquée', async () => {
        let running = 0, most = 0;
        const slow = async () => { running++; most = Math.max(most, running); await new Promise((r) => setTimeout(r, 15)); running--; return { big: 'x'.repeat(130000) }; };
        const t = setup({ 'mcp.comp': slow, 'mcp.project': slow });
        const [a] = await Promise.all([t.tool('get_comp'), t.tool('get_project'), t.tool('get_comp')]);
        assert.strictEqual(most, 1, 'appels jamais simultanés');
        assert.ok(a.content[0].text.length < 121000);
        assert.ok(/réponse tronquée/.test(a.content[0].text));
    });
};
