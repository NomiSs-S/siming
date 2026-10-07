'use strict';
/* Pages HTML, tools.json, panneau isolé et démarrage complet (faux CSInterface). */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { CLIENT, EXT, scene, loadHost, makeDom, hostEvalScript } = require('./helpers');

const BASE = ['js/siming.js', 'js/icons.js', 'js/ui/dom.js', 'js/ui/controls.js', 'js/ui/rail.js',
    'js/bridge.js', 'js/keys.js', 'js/hub.js', 'js/standalone.js'];
const LIST = JSON.parse(fs.readFileSync(path.join(CLIENT, 'tools.json'), 'utf8'));

/** Branche le démarrage sur le disque et le faux AE. */
function bootable(win, sandbox, opts) {
    opts = opts || {};
    win.SIMING.readJson = (url) => JSON.parse(fs.readFileSync(path.join(CLIENT, url), 'utf8'));
    win.SIMING.loadScript = async (src) => { win.eval(fs.readFileSync(path.join(CLIENT, src), 'utf8')); };
    if (!opts.cs) return null;
    const opened = [];
    win.SystemPath = { EXTENSION: 'extension' };
    win.CSInterface = class {
        evalScript(script, cb) { hostEvalScript(sandbox)(script, cb); }
        getSystemPath() { return EXT; }
        getHostEnvironment() { return { appSkinInfo: { panelBackgroundColor: { color: { red: 35, green: 35, blue: 35 } } } }; }
        addEventListener() {}
        requestOpenExtension(id) { opened.push(id); }
        getExtensionID() { return opts.extensionId || 'com.siming.hub'; }
        getOSInformation() { return opts.os || 'Windows 10'; }
        registerKeyEventsInterest(json) { opened.interests.push(JSON.parse(json)); }
    };
    Object.defineProperty(opened, 'interests', { value: [] });   // touches réclamées à AE (hors comparaisons)
    return opened;
}

module.exports = function (test) {
    test('pages : index.html et tool.html ne référencent que des fichiers existants', () => {
        for (const page of ['index.html', 'tool.html']) {
            const html = fs.readFileSync(path.join(CLIENT, page), 'utf8');
            const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
            assert.ok(refs.length >= 9, page);
            for (const ref of refs) assert.ok(fs.existsSync(path.join(CLIENT, ref)), page + ' -> ' + ref);
        }
        assert.ok(/SIMING\.boot\('hub'\)/.test(fs.readFileSync(path.join(CLIENT, 'index.html'), 'utf8')));
        assert.ok(/SIMING\.boot\('standalone'\)/.test(fs.readFileSync(path.join(CLIENT, 'tool.html'), 'utf8')));
    });

    test('tools.json : version, outils avec script, icône et cœur hôte existants', () => {
        assert.ok(/^\d+\.\d+\.\d+$/.test(LIST.version));
        assert.ok(/^[A-Za-z0-9-]+\/siming$/.test(LIST.repository));
        const win = makeDom(['js/siming.js', 'js/icons.js']);
        for (const t of LIST.tools) {
            assert.ok(fs.existsSync(path.join(CLIENT, t.script)), t.script);
            assert.ok(win.SIMING.ICONS[t.icon], 'icône ' + t.icon);
            assert.ok(fs.existsSync(path.join(EXT, 'host', 'tools', t.id + '.jsx')), 'cœur hôte de ' + t.id);
            assert.ok(/^\d+\.\d+\.\d+$/.test(t.version), t.id);
        }
    });

    test('aide des outils : en fiches (intro, groupes, fiches nommées), pictos existants', () => {
        const win = makeDom(BASE.concat(LIST.tools.map((t) => t.script)));
        const ease = ['in', 'out', 'both'];
        for (const t of LIST.tools) {
            const help = win.SIMING.toolDefs[t.id].help;
            assert.ok(help && typeof help === 'object' && help.intro && help.groups.length, t.id + ' : aide en fiches');
            for (const g of help.groups) {
                assert.ok(g.title && g.items.length, t.id + ' : groupe titré et non vide');
                for (const it of g.items) {
                    assert.ok(it.name, t.id + ' : fiche sans nom');
                    if (it.icon) assert.ok(win.SIMING.ICONS[it.icon], t.id + ' : picto inconnu ' + it.icon);
                    else assert.ok(ease.includes(it.ease) || Number.isInteger(it.step), t.id + ' : fiche sans picto ni numéro : ' + it.name);
                    assert.ok(!it.text || it.text.length <= 170, t.id + ' : texte trop long pour une fiche : ' + it.name);
                }
            }
        }
    });

    test('CSInterface.js : bibliothèque Adobe présente', () => {
        const src = fs.readFileSync(path.join(CLIENT, 'lib', 'CSInterface.js'), 'utf8');
        assert.ok(/function CSInterface\(/.test(src));
        assert.ok(/evalScript/.test(src) && /requestOpenExtension/.test(src));
    });

    test('panneau isolé : outil déduit de l\'identifiant d\'extension ou de ?tool=', () => {
        const win = makeDom(BASE, 'http://localhost/tool.html?tool=unparent');
        assert.strictEqual(win.SIMING.standaloneToolId({ getExtensionID: () => 'com.siming.tool.renommer' }), 'renommer');
        assert.strictEqual(win.SIMING.standaloneToolId(null), 'unparent');
        assert.strictEqual(win.SIMING.standaloneToolId({ getExtensionID: () => 'com.siming.hub' }), 'unparent');
    });

    test('panneau isolé : un outil seul, sa propre ligne de statut, pas de rail ni de bouton « panneau »', async () => {
        scene();
        const { sandbox } = loadHost();
        const win = makeDom(BASE.concat(['tools/unparent.js']));
        const app = win.SIMING.startStandalone({
            root: win.document.getElementById('app'), list: LIST, toolId: 'unparent',
            bridge: win.SIMING.createBridge(hostEvalScript(sandbox)),
        });
        await app.ready;
        assert.strictEqual(win.document.querySelector('.s-rail'), null);
        assert.ok(win.document.querySelector('.s-app.is-standalone'));
        assert.strictEqual(win.document.querySelector('[data-role=open-standalone]'), null);
        assert.ok(win.document.querySelector('[data-role=card]'));
        assert.ok(/carte Parent/.test(app.status.text));
        const unknown = win.SIMING.startStandalone({ root: win.document.getElementById('app'), list: LIST, toolId: 'nope', bridge: null });
        assert.strictEqual(unknown.status.level, 'error');
    });

    test('démarrage hub : CSInterface présent, cœur hôte prêt, Unparent monté', async () => {
        scene();
        const { sandbox } = loadHost();
        const win = makeDom(BASE);
        const opened = bootable(win, sandbox, { cs: true });
        const app = await win.SIMING.boot('hub');
        assert.ok(win.document.querySelector('.s-rail'));
        assert.strictEqual(app.current, 'quicktools', 'Quick Tools : premier outil, affiché à la première ouverture');
        assert.strictEqual(app.status.level, 'info', app.status.text);
        app.views.get('unparent').querySelector('[data-role=open-standalone]').click();
        assert.deepEqual(opened, ['com.siming.tool.unparent']);
        const last = () => opened.interests[opened.interests.length - 1];
        assert.ok(last().some((k) => k.keyCode === 0x31 && !k.ctrlKey), 'touches du panneau réclamées à AE (1 = Afficher Unparent)');
        win.SIMING.keys.setBinding('hub.settings', { code: 'Ctrl+Alt+Digit5', label: 'Ctrl + Alt + 5' });
        await Promise.resolve();
        assert.ok(last().some((k) => k.keyCode === 0x35 && k.ctrlKey && k.altKey), 'nouveau raccourci réclamé aussitôt');
    });

    test('démarrage hub sans After Effects : le panneau s\'affiche et signale le cœur hôte', async () => {
        const { sandbox } = loadHost();
        const win = makeDom(BASE);
        bootable(win, sandbox);
        const app = await win.SIMING.boot('hub');
        assert.ok(win.document.querySelector('.s-rail'));
        assert.strictEqual(app.status.level, 'warn');
        assert.ok(/Cœur hôte/.test(app.status.text), app.status.text);
    });

    test('démarrage : une erreur du hub s\'affiche dans la page au lieu d\'une page blanche', async () => {
        const { sandbox } = loadHost();
        const win = makeDom(BASE);
        bootable(win, sandbox);
        win.SIMING.startHub = () => { throw new Error('rail cassé'); };
        const app = await win.SIMING.boot('hub');
        assert.strictEqual(app, null);
        assert.strictEqual(win.document.getElementById('app').textContent, 'SIMING : démarrage impossible (rail cassé)');
    });

    test('démarrage panneau isolé : outil tiré de l\'identifiant d\'extension', async () => {
        scene();
        const { sandbox } = loadHost();
        const win = makeDom(BASE, 'http://localhost/tool.html');
        bootable(win, sandbox, { cs: true, extensionId: 'com.siming.tool.unparent' });
        const app = await win.SIMING.boot('standalone');
        assert.ok(win.document.querySelector('.s-app.is-standalone [data-role=card]'));
        assert.strictEqual(app.status.level, 'info', app.status.text);
    });
};
