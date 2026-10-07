'use strict';
/* Vue Boîte à outils montée sur jsdom, branchée sur le vrai cœur hôte via le pont (faux AE). */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadHost, makeDom, hostEvalScript, app } = require('./helpers');
const { FakeComp } = require('./fake-ae');

const SCRIPTS = ['js/siming.js', 'js/icons.js', 'js/ui/dom.js', 'js/ui/controls.js', 'js/bridge.js', 'js/keys.js', 'tools/toolbox.js'];

/** Comp « Rig » active (1920 × 1080) : A, B, C (100 × 100) en [100, 100], [500, 300], [900, 900]. */
function rig() {
    const comp = new FakeComp(300, 'Rig');
    app.project.activeItem = comp;
    app.project.items.push(comp);
    const A = comp.addLayer('A');
    const B = comp.addLayer('B');
    const C = comp.addLayer('C');
    comp.layer(1).position.setValue([100, 100]);
    comp.layer(2).position.setValue([500, 300]);
    comp.layer(3).position.setValue([900, 900]);
    return { comp, A, B, C };
}

/** opts.node : faux module child_process exposé par un faux cep_node (Node de CEP). */
async function setup(opts) {
    opts = opts || {};
    const s = rig();
    if (opts.prepare) opts.prepare(s);
    const { sandbox } = loadHost();
    const win = makeDom(SCRIPTS);
    if (opts.node) win.cep_node = { require: (name) => (name === 'child_process' ? opts.node : null) };
    const counter = { calls: 0 };
    const bridge = win.SIMING.createBridge(hostEvalScript(sandbox, counter));
    const status = win.SIMING.ui.statusLine();
    const section = win.document.createElement('section');
    section.className = 's-view';
    section.tabIndex = -1;
    const view = win.document.createElement('div');
    view.className = 's-view-body';
    section.append(view);
    win.document.body.append(section, status);
    const keys = win.SIMING.keys;
    keys.attach(win.document);
    const api = win.SIMING.toolDefs.toolbox.mount(view, {
        bridge, ui: win.SIMING.ui, status, settings: win.SIMING.settings, keys,
        meta: { id: 'toolbox', name: 'Boîte à outils', icon: 'boite', version: '1.0.0' },
    });
    await api.ready;
    const $ = (sel) => view.querySelector(sel);
    const $$ = (sel) => Array.from(view.querySelectorAll(sel));
    const click = async (el, init) => {
        if (init) el.dispatchEvent(new win.MouseEvent('click', Object.assign({ bubbles: true, cancelable: true }, init)));
        else el.click();
        await api.idle();
    };
    const key = async (init, target) => { (target || win.document).dispatchEvent(new win.KeyboardEvent('keydown', Object.assign({ bubbles: true, cancelable: true }, init))); await api.idle(); };
    return { s, win, view, section, api, status, counter, keys, sandbox, $, $$, click, key };
}

module.exports = function (test) {
    test('vue boîte à outils : sections, réglages par défaut, comp active lue, gestes dans le registre', async () => {
        const t = await setup();
        assert.deepEqual(t.$$('.s-section-label').map((e) => e.textContent), ['Frame', 'Séquencer', 'Créer', 'Format de la compo', 'Calques']);
        assert.strictEqual(t.$('[data-role=primary]'), null, 'gestes rapides : pas de bouton principal');
        assert.deepEqual(t.$$('.s-bar-value').map((e) => e.textContent), ['2 im', '1']);
        assert.deepEqual(t.$$('[data-role=seq-mode] .s-seg-btn').map((b) => b.classList.contains('is-on')), [true, false, false]);
        assert.deepEqual(t.$$('[data-role=formats] .s-format').map((b) => b.getAttribute('data-format')), ['16:9', '4:5', '1:1', '9:16']);
        assert.deepEqual(t.$$('.s-format.is-on').map((b) => b.getAttribute('data-format')), ['16:9'], 'format de la comp active allumé');
        assert.strictEqual(t.$('[data-role=format-section] .s-label-hint').textContent, '1920 × 1080');
        assert.ok(t.$('[data-role=bg-color]').classList.contains('is-auto'), 'fond : couleur de la comp par défaut');
        const ids = t.keys.actions().filter((a) => a.group === 'Boîte à outils').map((a) => a.id);
        assert.strictEqual(ids.length, 12, ids.join(' '));
        assert.deepEqual(t.keys.binding('toolbox.replay'), { code: 'Enter', label: 'Entrée', user: false });
        assert.strictEqual(t.keys.binding('toolbox.frame'), null, 'sans touche par défaut');
        assert.strictEqual(t.status.level, 'info');
        assert.strictEqual(t.counter.calls, 1);
    });

    test('vue boîte à outils : séquencer avec le mode et l\'écart choisis (mémorisés), Entrée rejoue', async () => {
        const t = await setup({ prepare: (s) => s.comp.select(s.A, s.B, s.C) });
        await t.click(t.$$('[data-role=seq-mode] .s-seg-btn')[1]);   // Inverse
        assert.strictEqual(t.win.localStorage.getItem('siming.toolbox.mode'), 'reverse');
        t.$('[data-role=seq-gap]').dispatchEvent(new t.win.WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
        assert.strictEqual(t.win.localStorage.getItem('siming.toolbox.gap'), '3');
        await t.click(t.$('[data-role=seq-layers]'));
        assert.strictEqual(t.status.text, '3 calques séquencés en ordre inverse, écart 3 images · Ctrl+Z pour annuler');
        assert.deepEqual([t.s.A, t.s.B, t.s.C].map((l) => Math.round(l.startTime * 25)), [6, 3, 0]);
        assert.ok(t.$('[data-role=seq-layers]').classList.contains('is-last'));
        await t.click(t.$$('[data-role=seq-mode] .s-seg-btn')[0]);   // Cascade, puis Entrée = même geste, nouveau mode
        t.section.focus();
        await t.key({ key: 'Enter', code: 'Enter' }, t.section);
        assert.deepEqual([t.s.A, t.s.B, t.s.C].map((l) => Math.round(l.startTime * 25)), [0, 3, 6]);
        const again = await setup();
        assert.strictEqual(again.$('[data-role=seq-gap]').value, 2, 'autre fenêtre jsdom : réglages à part');
    });

    test('vue boîte à outils : copier la frame, par le Node du panneau sinon par l\'hôte ; erreur de copie affichée', async () => {
        const t = await setup();
        app.preferences.scriptWrite = true;
        await t.click(t.$('[data-role=frame]'));
        assert.strictEqual(t.status.text, 'Frame 1920 × 1080 copiée dans le presse-papier : colle-la où tu veux');
        assert.strictEqual(t.status.level, 'ok');
        assert.strictEqual(t.sandbox.system.calls.length, 1, 'sans Node : system.callSystem de l\'hôte');
        assert.deepEqual(t.s.comp.frames, [0]);
        const runs = [];
        const node = { execFile: (file, args, opts, cb) => { runs.push({ file, args, hide: opts.windowsHide }); setTimeout(() => cb(null, '', ''), 0); } };
        const n = await setup({ node });
        await n.click(n.$('[data-role=frame]'));
        assert.strictEqual(n.status.level, 'ok', n.status.text);
        assert.strictEqual(runs.length, 1);
        assert.strictEqual(runs[0].file, 'powershell.exe');
        assert.strictEqual(runs[0].hide, true, 'aucune fenêtre');
        assert.ok(/frame-\d+\.png/.test(runs[0].args[runs[0].args.length - 1]));
        assert.strictEqual(n.sandbox.system.calls.length, 0, 'Node présent : l\'hôte ne lance rien');
        const broken = { execFile: (file, args, opts, cb) => setTimeout(() => cb(new Error('exit 1'), '', 'Accès refusé'), 0) };
        const b = await setup({ node: broken });
        await b.click(b.$('[data-role=frame]'));
        assert.strictEqual(b.status.text, 'Copie impossible : Accès refusé');
        assert.strictEqual(b.status.level, 'error');
        app.preferences.scriptWrite = false;
        await b.click(b.$('[data-role=frame]'));
        assert.strictEqual(b.status.level, 'warn');
        assert.ok(/Autoriser les scripts à écrire des fichiers/.test(b.status.text));
        fs.rmSync(path.join(os.tmpdir(), 'siming-fake-ae'), { recursive: true, force: true });
    });

    test('vue boîte à outils : format, comp relue quand le pointeur entre dans la vue', async () => {
        const t = await setup();
        await t.click(t.$('[data-role=format-4x5]'));
        assert.deepEqual([t.s.comp.width, t.s.comp.height], [1080, 1350]);
        assert.deepEqual(t.$$('.s-format.is-on').map((b) => b.getAttribute('data-format')), ['4:5']);
        assert.strictEqual(t.$('[data-role=format-section] .s-label-hint').textContent, '1080 × 1350');
        t.s.comp.width = 1000; t.s.comp.height = 1000;              // changé dans AE, hors du panneau
        t.section.dispatchEvent(new t.win.Event('pointerenter'));
        await t.api.idle();
        assert.deepEqual(t.$$('.s-format.is-on').map((b) => b.getAttribute('data-format')), ['1:1']);
        app.project.activeItem = null;
        t.section.dispatchEvent(new t.win.Event('pointerenter'));
        await t.api.idle();
        assert.deepEqual(t.$$('.s-format.is-on'), []);
        assert.strictEqual(t.$('[data-role=format-section] .s-label-hint').textContent, 'aucune composition');
        t.section.hidden = true;
        const calls = t.counter.calls;
        t.section.dispatchEvent(new t.win.Event('pointerenter'));
        await t.api.idle();
        assert.strictEqual(t.counter.calls, calls, 'vue cachée : pas de lecture');
    });

    test('vue boîte à outils : couleur du fond choisie (mémorisée) puis Alt + clic = couleur de la comp ; null relié', async () => {
        const t = await setup({ prepare: (s) => s.comp.select(s.A, s.B) });
        await t.click(t.$('[data-role=bg-color]'));
        assert.strictEqual(t.win.localStorage.getItem('siming.toolbox.bgColor'), '#336699');
        assert.ok(!t.$('[data-role=bg-color]').classList.contains('is-auto'));
        assert.ok(/#336699/.test(t.$('[data-role=bg-color]').title));
        await t.click(t.$('[data-role=background]'));
        assert.ok(/Fond #336699 ajouté/.test(t.status.text), t.status.text);
        await t.click(t.$('[data-role=bg-color]'), { altKey: true });
        assert.strictEqual(t.win.localStorage.getItem('siming.toolbox.bgColor'), '');
        assert.ok(t.$('[data-role=bg-color]').classList.contains('is-auto'));
        t.s.comp.select(t.s.A, t.s.B);
        await t.click(t.$('[data-role=null]'));
        assert.strictEqual(t.status.text, 'Null « Contrôle » relié à 2 calques · Ctrl+Z pour annuler');
        t.sandbox.pickedColor = -1;                                  // sélecteur annulé : rien ne change
        await t.click(t.$('[data-role=bg-color]'));
        assert.strictEqual(t.win.localStorage.getItem('siming.toolbox.bgColor'), '');
    });

    test('vue boîte à outils : éléments ignorés en dialogue, un seul appel à la fois', async () => {
        const t = await setup({ prepare: (s) => { s.comp.addLayer('Titre', { kind: 'text', text: 'Titre' }); s.comp.select(s.comp.layers[3]); } });
        await t.click(t.$('[data-role=reveal]'));
        const dialog = t.win.document.querySelector('[data-role=dialog]');
        assert.ok(dialog);
        assert.strictEqual(dialog.querySelector('li').textContent, 'Titre : pas de source (texte, forme, caméra, lumière)');
        t.win.document.querySelector('[data-role=dialog-ok]').click();
        const before = t.counter.calls;
        t.$('[data-role=format-1x1]').click();
        t.$('[data-role=format-9x16]').click();
        await t.api.idle();
        assert.strictEqual(t.counter.calls, before + 1, 'second clic ignoré pendant l\'appel');
        assert.strictEqual(t.$('[data-role=null]').disabled, false, 'commandes réactivées');
    });
};
