'use strict';
/* Onglet Claude (tools/claude.js) : faux accès Node, faux processus Claude Code, faux After Effects. */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { scene, loadHost, makeDom, hostEvalScript, app } = require('./helpers');

const SCRIPTS = ['js/siming.js', 'js/icons.js', 'js/ui/dom.js', 'js/ui/controls.js', 'js/bridge.js', 'js/keys.js',
    'js/mcp/server.js', 'js/claude/stream.js', 'js/claude/markdown.js', 'js/claude/observe.js', 'js/claude/cli.js', 'tools/claude.js'];

const tick = (ms) => new Promise((r) => setTimeout(r, ms || 5));
async function until(fn, what) {
    for (let i = 0; i < 200; i++) { if (fn()) return; await tick(); }
    throw new Error('attente trop longue : ' + what);
}

/** Faux accès du hub (vrais fichiers dans un dossier temporaire) et faux spawn. */
function fakeEnv(win, dir) {
    const listeners = {};
    const env = {
        fs, path, crypto, userData: dir, file: win.SIMING.mcp.configFile(path, dir),
        platform: process.platform, procEnv: { HOME: dir, USERPROFILE: dir },
        emitted: [], children: [], opened: 0, urls: [], execs: [],
        on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
        emit(type, data) { env.emitted.push({ type, data }); },
        fire(type, data) { (listeners[type] || []).forEach((fn) => fn(data)); },
        openService() { env.opened++; },
        openUrl(u) { env.urls.push(u); },
        execFile(file, args, opts, cb) { env.execs.push({ file, args }); setTimeout(() => cb(new Error('absent'), '', ''), 0); },
        spawn(file, args, opts) {
            const child = new EventEmitter();
            child.stdout = new EventEmitter();
            child.stderr = new EventEmitter();
            child.written = [];
            child.stdin = { write: (s) => { child.written.push(JSON.parse(s)); return true; }, on() {} };
            child.kill = () => { setTimeout(() => child.emit('exit', null), 0); return true; };
            child.args = args;
            child.opts = opts;
            child.say = (obj) => child.stdout.emit('data', JSON.stringify(obj) + '\n');
            env.children.push(child);
            return child;
        },
    };
    return env;
}

async function setup(opts) {
    const o = opts || {};
    const win = o.win || makeDom(SCRIPTS);
    const dir = o.dir || fs.mkdtempSync(path.join(os.tmpdir(), 'siming-tab-'));
    const exe = path.join(dir, 'claude-fake.exe');
    fs.writeFileSync(exe, '');
    win.SIMING.settings.set('claudeCode.path', o.missing ? path.join(dir, 'absent.exe') : exe);
    win.SIMING.claude.TAB = { poll: 10, serviceWait: 5 };
    const { sandbox } = loadHost();
    const env = o.env === null ? null : fakeEnv(win, dir);
    const status = win.SIMING.ui.statusLine();
    const body = win.document.createElement('div');
    win.document.getElementById('app').append(body, status);
    const ctx = { bridge: win.SIMING.createBridge(hostEvalScript(sandbox)), ui: win.SIMING.ui, status, settings: win.SIMING.settings, keys: win.SIMING.keys, claude: env };
    const api = win.SIMING.toolDefs.claude.mount(body, ctx);
    if (api.ready) await api.ready;
    const $ = (sel) => body.querySelector(sel);
    const $$ = (sel) => Array.from(body.querySelectorAll(sel));
    const type = (text) => { $('[data-role=claude-input]').value = text; };
    const child = () => env.children[env.children.length - 1];
    const emitted = (t) => env.emitted.filter((e) => e.type === t);
    return { win, dir, env, api, status, body, $, $$, type, child, emitted, exe };
}

module.exports = function (test) {
    test('onglet Claude : sans Node, dans After Effects seulement', async () => {
        const t = await setup({ env: null });
        assert.ok(/After Effects seulement/.test(t.$('[data-role=claude-unavailable]').textContent));
    });

    test('onglet Claude : Claude Code introuvable -> aide d\'installation, chercher à nouveau', async () => {
        const t = await setup({ missing: true });
        assert.strictEqual(t.$('[data-role=claude-missing]').hidden, false);
        assert.ok(t.$('[data-role=claude-input]').closest('[hidden]'), 'fil masqué');
        t.$('[data-role=claude-install]').click();
        assert.ok(/claude-code/.test(t.env.urls[0]));
        t.win.SIMING.settings.set('claudeCode.path', t.exe);
        t.$('[data-role=claude-locate]').click();
        await until(() => t.$('[data-role=claude-missing]').hidden, 'Claude trouvé');
    });

    test('onglet Claude : envoi = contexte préfixé, bulle, flux de texte, ligne d\'outil, fin ; serveur activé', async () => {
        const t = await setup();
        const s = scene();
        s.comp.select(s.A);
        t.type('Déplace le logo');
        t.$('[data-role=claude-send]').click();
        await until(() => t.env.children.length && t.child().written.length, 'message écrit');
        const c = t.child();
        assert.strictEqual(c.opts.env.MCP_TOOL_TIMEOUT, '900000');
        assert.ok(c.opts.cwd.endsWith(path.join('SIMING', 'claude-work')));
        assert.ok(fs.existsSync(c.opts.cwd), 'dossier de travail créé');
        const cfg = t.win.SIMING.mcp.readConfig(fs, t.env.file);
        assert.strictEqual(cfg.enabled, true, 'serveur MCP activé par l\'onglet');
        assert.ok(t.emitted('com.siming.mcp.reload').length);
        const mcpCfg = JSON.parse(c.args[c.args.indexOf('--mcp-config') + 1]);
        assert.strictEqual(mcpCfg.mcpServers.siming.headers['X-Siming-Client'], t.api.clientId);
        assert.strictEqual(mcpCfg.mcpServers.siming.headers.Authorization, 'Bearer ' + cfg.token);
        assert.ok(!c.args.includes('--resume'));
        const msg = c.written[0].message.content;
        assert.ok(msg.startsWith('<contexte_ae>\n'), msg);
        assert.ok(/Comp active : Comp 1 \(id 100\)/.test(msg) && /2 « A »/.test(msg), msg);
        assert.ok(msg.endsWith('\n\nDéplace le logo'));
        assert.strictEqual(t.$('.s-msg-user .s-msg-text').textContent, 'Déplace le logo');
        assert.strictEqual(t.$('[data-role=claude-context] summary').textContent, 'Comp 1 · 1 calque sélectionné');
        assert.strictEqual(t.$('[data-role=claude-input]').value, '');
        assert.strictEqual(t.$('[data-role=claude-send]').disabled, true, 'occupé');
        assert.strictEqual(t.$('[data-role=claude-stop]').hidden, false);
        c.say({ type: 'system', subtype: 'init', session_id: 'sess-1', model: 'claude-opus-5-5' });
        c.say({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Je ' } } });
        c.say({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'regarde' } } });
        assert.strictEqual(t.$$('.s-msg-claude .s-msg-text').pop().textContent, 'Je regarde');
        c.say({ type: 'assistant', message: { content: [{ type: 'text', text: 'Je **regarde**.' }, { type: 'tool_use', id: 'tu1', name: 'mcp__siming__run_extendscript', input: { code: 'return 1;', undoName: 'Logo en bas' } }] } });
        assert.strictEqual(t.$('.s-msg-claude strong').textContent, 'regarde');
        assert.strictEqual(t.$('[data-role=claude-tool] summary').textContent, '…Claude : Logo en bas');
        assert.ok(/1 action/.test(t.status.text), t.status.text);
        c.say({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tu1', content: [{ type: 'text', text: '{"value":1}' }, { type: 'image', source: { media_type: 'image/png', data: 'AAAA' } }] }] } });
        assert.ok(t.$('[data-role=claude-tool]').classList.contains('is-ok'));
        assert.strictEqual(t.$('[data-role=claude-tool-result]').textContent, '{"value":1}');
        assert.strictEqual(t.$('[data-role=claude-thumb]').getAttribute('src'), 'data:image/png;base64,AAAA');
        c.say({ type: 'result', subtype: 'success', is_error: false, result: 'C\'est fait', session_id: 'sess-1' });
        assert.strictEqual(t.$('[data-role=claude-send]').disabled, false);
        assert.strictEqual(t.$('[data-role=claude-stop]').hidden, true);
        assert.deepEqual([t.status.level, t.status.text], ['ok', 'Claude a fini (1 action)']);
        assert.strictEqual(t.$('[data-role=claude-model-label]').textContent, 'claude-opus-5-5');
        const saved = JSON.parse(fs.readFileSync(t.api.threadFile, 'utf8'));
        assert.strictEqual(saved.sessionId, 'sess-1');
        assert.deepEqual(saved.items.map((i) => i.type), ['user', 'claude', 'tool']);
        assert.ok(!JSON.stringify(saved).includes('AAAA'), 'images non enregistrées');
        // Second message : même processus
        t.type('Merci');
        t.$('[data-role=claude-send]').click();
        await until(() => c.written.length === 2, 'second message');
        assert.strictEqual(t.env.children.length, 1);
    });

    test('onglet Claude : question de Claude -> carte, clic sur un choix -> réponse émise, saisie réactivée', async () => {
        const t = await setup();
        scene();
        t.type('Vas-y');
        t.$('[data-role=claude-send]').click();
        await until(() => t.env.children.length, 'processus');
        t.env.fire('com.siming.mcp.ask', { id: 'q1', client: 'tab-autre', question: 'Pas pour moi' });
        assert.strictEqual(t.$('[data-role=claude-question]'), null, 'question d\'un autre onglet ignorée');
        t.env.fire('com.siming.mcp.ask', { id: 'q2', client: t.api.clientId, question: 'Je prends STORY ?', options: [{ label: 'Oui' }, { label: 'Non' }], multiple: false, allowText: true });
        assert.strictEqual(t.$('[data-role=claude-question] .s-question-text').textContent, 'Je prends STORY ?');
        assert.strictEqual(t.$('[data-role=claude-input]').disabled, true);
        t.$$('[data-role=claude-option]')[0].click();
        assert.deepEqual(t.emitted('com.siming.mcp.answer').pop().data, { id: 'q2', text: 'Oui' });
        assert.strictEqual(t.$('[data-role=claude-input]').disabled, false);
        assert.strictEqual(t.$('[data-role=claude-question-answer]').textContent, 'Ta réponse : Oui');
        // Réponse libre, puis question annulée par Arrêter
        t.env.fire('com.siming.mcp.ask', { id: 'q3', client: t.api.clientId, question: 'Quel nom ?', options: [] });
        const free = t.$$('[data-role=claude-answer-text]').pop();
        free.value = 'LOGO_final';
        t.$$('[data-role=claude-answer]').pop().click();
        assert.deepEqual(t.emitted('com.siming.mcp.answer').pop().data, { id: 'q3', text: 'LOGO_final' });
        t.env.fire('com.siming.mcp.ask', { id: 'q4', client: t.api.clientId, question: 'Encore ?' });
        t.$('[data-role=claude-stop]').click();
        assert.deepEqual(t.emitted('com.siming.mcp.answer').pop().data, { id: 'q4', cancelled: true });
        await until(() => t.$('[data-role=claude-stop]').hidden, 'arrêt');
        assert.strictEqual(t.status.level, 'warn');
        assert.ok(/Arrêté/.test(t.status.text), t.status.text);
    });

    test('onglet Claude : erreur de connexion -> bouton Se connecter qui ouvre un terminal', async () => {
        const t = await setup();
        scene();
        t.type('Salut');
        t.$('[data-role=claude-send]').click();
        await until(() => t.env.children.length && t.child().written.length, 'envoi');
        t.child().say({ type: 'result', subtype: 'success', is_error: true, result: 'Invalid API key · Please run /login' });
        assert.strictEqual(t.$('[data-role=claude-login]').hidden, false);
        assert.strictEqual(t.status.level, 'error');
        t.$('[data-role=claude-login-btn]').click();
        const run = t.env.execs.pop();
        const expected = t.win.SIMING.claude.loginCommand(t.env.platform, t.exe);
        assert.deepEqual([run.file, Array.from(run.args)], [expected.file, Array.from(expected.args)]);
    });

    test('onglet Claude : processus mort en plein travail -> sortie de l\'état occupé, reprise par --resume', async () => {
        const t = await setup();
        scene();
        t.type('Long travail');
        t.$('[data-role=claude-send]').click();
        await until(() => t.env.children.length && t.child().written.length, 'envoi');
        t.child().say({ type: 'system', subtype: 'init', session_id: 'sess-9' });
        t.child().stderr.emit('data', 'plantage\n');
        t.child().emit('exit', 3);
        assert.strictEqual(t.$('[data-role=claude-send]').disabled, false);
        assert.strictEqual(t.status.level, 'warn');
        assert.ok(/code 3/.test(t.status.text) && /plantage/.test(t.status.text), t.status.text);
        t.type('On reprend');
        t.$('[data-role=claude-send]').click();
        await until(() => t.env.children.length === 2 && t.child().written.length, 'relance');
        const args = t.child().args;
        assert.strictEqual(args[args.indexOf('--resume') + 1], 'sess-9');
    });

    test('onglet Claude : Observer, photo au début et à la fin -> pastille jointe au message suivant', async () => {
        const t = await setup();
        const s = scene();
        t.$('[data-role=claude-observe]').click();
        await until(() => t.$('[data-role=claude-observe]').classList.contains('is-on') && !t.$('[data-role=claude-observe]').disabled, 'observation lancée');
        s.A.transform.children.find((c) => c.matchName === 'ADBE Position').value = [1720, 980];
        s.B.name = 'Bras';
        t.$('[data-role=claude-observe]').click();
        await until(() => t.$('[data-role=claude-observation]'), 'pastille');
        assert.strictEqual(t.$('[data-role=claude-observation]').textContent, 'Observation : 2 changements');
        assert.ok(!t.$('[data-role=claude-observe]').classList.contains('is-on'));
        t.type('Fais pareil sur Comp 2');
        t.$('[data-role=claude-send]').click();
        await until(() => t.env.children.length && t.child().written.length, 'envoi');
        const msg = t.child().written[0].message.content;
        assert.ok(/<observation comp="Comp 1 \(id 100\)">/.test(msg), msg);
        assert.ok(/Transform › Position \(ADBE Position\) : \[0,0\] → \[1720,980\]/.test(msg), msg);
        assert.ok(/renommé « B » → « Bras »/.test(msg), msg);
        assert.strictEqual(t.$('[data-role=claude-chip]'), null, 'pastille consommée');
        assert.ok(/Observation$/.test(t.$('[data-role=claude-context] summary').textContent));
        // Rien changé : pas de pastille ; pastille supprimable
        t.child().say({ type: 'result', is_error: false, result: 'ok' });
        t.$('[data-role=claude-observe]').click();
        await until(() => !t.$('[data-role=claude-observe]').disabled && t.$('[data-role=claude-observe]').classList.contains('is-on'), 'seconde observation');
        t.$('[data-role=claude-observe]').click();
        await until(() => /aucun changement/.test(t.status.text), 'aucun changement');
        assert.strictEqual(t.$('[data-role=claude-chip]'), null);
    });

    test('onglet Claude : Observer suit une autre comp ouverte pendant l\'observation', async () => {
        const t = await setup();
        scene();
        const { otherComp } = require('./helpers');
        const o = otherComp();
        t.$('[data-role=claude-observe]').click();
        await until(() => !t.$('[data-role=claude-observe]').disabled, 'observation lancée');
        app.project.activeItem = o.comp;
        await t.api.poll();
        o.T.name = 'Tête';
        t.$('[data-role=claude-observe]').click();
        await until(() => t.$('[data-role=claude-observation]'), 'pastille');
        t.$('[data-role=claude-observation]').click();
        assert.ok(/<observation comp="Comp 2 \(id 200\)">/.test(t.$('[data-role=claude-chip] pre').textContent));
        t.$('[data-role=claude-chip-remove]').click();
        assert.strictEqual(t.$('[data-role=claude-chip]'), null);
    });

    test('onglet Claude : nouvelle conversation (confirmée) efface le fil et le fichier ; fil restauré au montage', async () => {
        const t = await setup();
        scene();
        t.type('Bonjour');
        t.$('[data-role=claude-send]').click();
        await until(() => t.env.children.length && t.child().written.length, 'envoi');
        t.child().say({ type: 'system', subtype: 'init', session_id: 'sess-r' });
        t.child().say({ type: 'assistant', message: { content: [{ type: 'text', text: 'Salut' }] } });
        t.child().say({ type: 'result', is_error: false, result: 'Salut', session_id: 'sess-r' });
        // Réouverture du hub : même dossier de l'utilisateur
        const again = await setup({ dir: t.dir });
        assert.deepEqual(again.$$('.s-msg-text').map((m) => m.textContent), ['Bonjour', 'Salut']);
        again.type('Encore');
        again.$('[data-role=claude-send]').click();
        await until(() => again.env.children.length && again.child().written.length, 'envoi repris');
        assert.strictEqual(again.child().args[again.child().args.indexOf('--resume') + 1], 'sess-r');
        again.child().say({ type: 'result', is_error: false, result: 'ok', session_id: 'sess-r' });
        // Nouvelle conversation : Annuler garde tout, OK efface
        again.$('[data-role=claude-new]').click();
        await tick();
        again.win.document.querySelector('[data-role=dialog-cancel]').click();
        await tick();
        assert.strictEqual(again.$$('.s-msg').length, 3);
        again.$('[data-role=claude-new]').click();
        await tick();
        again.win.document.querySelector('[data-role=dialog-ok]').click();
        await until(() => !again.$$('.s-msg').length, 'fil vidé');
        assert.ok(!fs.existsSync(again.api.threadFile), 'fichier du fil effacé');
        again.type('Neuf');
        again.$('[data-role=claude-send]').click();
        await until(() => again.env.children.length === 2 && again.child().written.length, 'nouvelle session');
        assert.ok(!again.child().args.includes('--resume'));
    });
};
