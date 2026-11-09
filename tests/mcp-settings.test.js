'use strict';
/* Claude Code, Réglages › Claude du hub (js/mcp/settings.js) : interrupteur, état, commande, jeton, port. */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { loadHost, makeDom, hostEvalScript } = require('./helpers');

const SCRIPTS = ['js/siming.js', 'js/icons.js', 'js/ui/dom.js', 'js/ui/controls.js', 'js/ui/rail.js',
    'js/bridge.js', 'js/keys.js', 'js/mcp/server.js', 'js/mcp/settings.js', 'js/hub.js'];

/** Faux accès du hub : vrais fichiers (dossier temporaire), événements notés. */
function fakeEnv(win) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'siming-hub-claude-'));
    const listeners = {};
    const env = {
        fs, path, crypto, file: win.SIMING.mcp.configFile(path, dir),
        emitted: [], opened: 0,
        on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
        emit(type, data) { env.emitted.push(type); },
        openService() { env.opened++; },
        fire(type, data) { (listeners[type] || []).forEach((fn) => fn(data)); },
    };
    return env;
}

function setup(opts) {
    const o = opts || {};
    const win = makeDom(SCRIPTS);
    win.SIMING.mcp.TIMING = { answer: 10, start: 20 };
    const env = o.env === null ? null : fakeEnv(win);
    if (env && o.cfg) win.SIMING.mcp.writeConfig(fs, path, env.file, o.cfg);
    const { sandbox } = loadHost();
    const hub = win.SIMING.startHub({
        root: win.document.getElementById('app'),
        list: { version: '1.4.0', repository: 'OWNER/siming', tools: [{ id: 'demo', name: 'Démo', icon: 'ancre', version: '0.1.0', script: 'tools/demo.js' }] },
        bridge: win.SIMING.createBridge(hostEvalScript(sandbox)), openExtension: null, claude: env,
    });
    const $ = (sel) => win.document.querySelector(sel);
    const pane = $('[data-pane=claude]');
    const cfg = () => win.SIMING.mcp.readConfig(fs, env.file);
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    return { win, hub, env, $, pane, cfg, wait };
}

module.exports = function (test) {
    test('Réglages › Claude : quatrième onglet ; sans Node, une explication', () => {
        const t = setup({ env: null });
        const tabs = Array.from(t.win.document.querySelectorAll('[data-role=settings-tabs] .s-seg-btn')).map((b) => b.textContent);
        assert.deepEqual(tabs, ['Outils', 'Raccourcis', 'Général', 'Claude']);
        assert.ok(t.$('[data-role=claude-unavailable]'));
        assert.strictEqual(t.$('[data-role=claude-enabled]'), null);
    });

    test('Réglages › Claude : éteint par défaut, rien d\'écrit, service pas sollicité', async () => {
        const t = setup();
        assert.ok(t.$('[data-role=claude-enabled] .s-seg-btn[data-index="0"]').classList.contains('is-on'));
        assert.strictEqual(t.$('[data-role=claude-setup]').hidden, true);
        assert.ok(/^Éteint/.test(t.$('[data-role=claude-state]').textContent));
        assert.ok(!fs.existsSync(t.env.file));
        await t.wait(50);
        assert.deepEqual([t.env.emitted, t.env.opened], [[], 0]);
    });

    test('Réglages › Claude : Activé écrit un jeton, prévient le service, montre la commande', () => {
        const t = setup();
        t.$('[data-role=claude-enabled] .s-seg-btn[data-index="1"]').click();
        const cfg = t.cfg();
        assert.strictEqual(cfg.enabled, true);
        assert.ok(/^[0-9a-f]{48}$/.test(cfg.token));
        assert.deepEqual(t.env.emitted, ['com.siming.mcp.reload']);
        assert.strictEqual(t.$('[data-role=claude-setup]').hidden, false);
        assert.ok(t.$('[data-role=claude-command]').textContent.includes('Bearer ' + cfg.token));
        assert.ok(t.$('[data-role=claude-command]').textContent.includes('http://127.0.0.1:47821/mcp'));
        assert.strictEqual(t.hub.status.level, 'ok');
        assert.ok(/Démarrage/.test(t.$('[data-role=claude-state]').textContent));
        t.$('[data-role=claude-enabled] .s-seg-btn[data-index="0"]').click();
        assert.strictEqual(t.cfg().enabled, false);
        assert.strictEqual(t.cfg().token, cfg.token, 'jeton gardé : la commande reste valable');
    });

    test('Réglages › Claude : état du service (actif, appels), activité dans la ligne de statut', () => {
        const t = setup({ cfg: { enabled: true, port: 47821, token: 'ab'.repeat(24) } });
        assert.deepEqual(t.env.emitted, ['com.siming.mcp.ping'], 'à l\'ouverture : demande l\'état');
        t.env.fire('com.siming.mcp.state', { enabled: true, running: true, port: 47821, calls: 2 });
        const row = t.$('[data-role=claude-state]');
        assert.strictEqual(row.getAttribute('data-level'), 'ok');
        assert.strictEqual(row.textContent, 'Actif sur cet ordinateur, port 47821 · 2 appels');
        t.env.fire('com.siming.mcp.activity', { text: 'Claude : Titre animé', level: 'ok' });
        assert.strictEqual(t.hub.status.text, 'Claude : Titre animé');
        assert.ok(/3 appels/.test(row.textContent));
        t.env.fire('com.siming.mcp.state', { enabled: true, running: false, error: 'Serveur : boum' });
        assert.deepEqual([row.getAttribute('data-level'), row.textContent], ['error', 'Serveur : boum']);
    });

    test('Réglages › Claude : service muet -> lancé par le hub, puis « introuvable »', async () => {
        const t = setup({ cfg: { enabled: true, port: 47821, token: 'ab'.repeat(24) } });
        await t.wait(60);
        assert.strictEqual(t.env.opened, 1, 'extension invisible demandée');
        assert.ok(/Service introuvable/.test(t.$('[data-role=claude-state]').textContent));
        t.env.fire('com.siming.mcp.state', { enabled: true, running: true, port: 47821, calls: 0 });
        assert.ok(/^Actif/.test(t.$('[data-role=claude-state]').textContent));
    });

    test('Réglages › Claude : port pris -> « Changer de port » ; nouveau jeton', () => {
        const token = 'ab'.repeat(24);
        const t = setup({ cfg: { enabled: true, port: 47821, token } });
        const portBtn = t.$('[data-role=claude-port]');
        assert.strictEqual(portBtn.hidden, true);
        t.env.fire('com.siming.mcp.state', { enabled: true, running: false, errorCode: 'EADDRINUSE', error: 'Port 47821 déjà pris par un autre programme' });
        assert.strictEqual(portBtn.hidden, false);
        portBtn.click();
        const port = t.cfg().port;
        assert.ok(port !== 47821);
        assert.ok(t.$('[data-role=claude-command]').textContent.includes(':' + port + '/mcp'));
        assert.strictEqual(t.hub.status.level, 'warn');
        t.$('[data-role=claude-token]').click();
        assert.notStrictEqual(t.cfg().token, token);
        assert.ok(t.$('[data-role=claude-command]').textContent.includes(t.cfg().token));
        assert.ok(/Nouveau jeton/.test(t.hub.status.text));
    });

    test('Réglages › Claude : copier la commande (presse-papier, sinon message)', async () => {
        const t = setup({ cfg: { enabled: true, port: 47821, token: 'ab'.repeat(24) } });
        t.$('[data-role=claude-copy]').click();
        await t.wait(0);
        assert.strictEqual(t.hub.status.level, 'warn', 'jsdom : ni presse-papier ni commande Copier');
        const copied = [];
        Object.defineProperty(t.win.navigator, 'clipboard', { configurable: true, value: { writeText: async (x) => { copied.push(x); } } });
        t.$('[data-role=claude-copy]').click();
        await t.wait(0);
        assert.deepEqual(copied, [t.$('[data-role=claude-command]').textContent]);
        assert.strictEqual(t.hub.status.text, 'Commande copiée : colle-la dans un terminal');
    });

    test('Réglages › Claude : état calculé (éteint, actif, erreur, introuvable, démarrage)', () => {
        const { SIMING } = makeDom(SCRIPTS);
        const st = SIMING.mcp.serviceState;
        const on = { enabled: true, port: 5000 };
        assert.strictEqual(st({ enabled: false }, null).level, 'info');
        assert.strictEqual(st(on, { running: true, port: 5000, calls: 1 }).text, 'Actif sur cet ordinateur, port 5000 · 1 appel');
        assert.strictEqual(st(on, { running: true, port: 4000 }).level, 'info', 'ancien port : en cours de changement');
        assert.strictEqual(st(on, { missing: true }).level, 'error');
        assert.ok(/Démarrage/.test(st(on, null).text));
    });
};
