'use strict';
/* Vue Boîte à outils montée sur jsdom, branchée sur le vrai cœur hôte via le pont (faux AE). */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadHost, makeDom, hostEvalScript, app } = require('./helpers');
const { FakeComp, FakeFile, FakeFolder, FootageItem, FileSource } = require('./fake-ae');

const SCRIPTS = ['js/siming.js', 'js/icons.js', 'js/ui/dom.js', 'js/ui/controls.js', 'js/bridge.js', 'js/psd/reader.js', 'js/psd/shapes.js', 'js/psd/settings.js', 'js/keys.js', 'tools/toolbox.js'];

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

/** opts.node : faux module child_process exposé par un faux cep_node (Node de CEP) ; opts.modules : autres
 *  modules Node (fs…), lus à l'appel ; opts.batch : réponse d'importBatch (appel intercepté, ses arguments sont dans batches). */
async function setup(opts) {
    opts = opts || {};
    const s = rig();
    if (opts.prepare) opts.prepare(s);
    const { sandbox } = loadHost();
    const win = makeDom(SCRIPTS);
    if (opts.node || opts.modules) win.cep_node = { require: (name) => (name === 'child_process' && opts.node) || (opts.modules && opts.modules[name]) || null };
    const counter = { calls: 0 };
    const bridge = win.SIMING.createBridge(hostEvalScript(sandbox, counter));
    const status = win.SIMING.ui.statusLine();
    const said = [];   // tous les messages de statut
    const setStatus = status.set;
    status.set = (message, level) => { said.push(message); setStatus(message, level); };
    const batches = [], lists = [];   // arguments d'importBatch (appel intercepté) et de list (transmis à l'hôte)
    const call = bridge.call;
    bridge.call = (tool, fn, args) => {
        if (tool === 'psdimport' && fn === 'list') lists.push(args);
        if (tool !== 'psdimport' || fn !== 'importBatch') return call(tool, fn, args);
        batches.push(args);
        return Promise.resolve(opts.batch || { imported: [], status: { text: 'importé', level: 'ok' } });
    };
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
        bridge, ui: win.SIMING.ui, status, settings: win.SIMING.settings, keys, openSettings: opts.openSettings,
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
    return { s, win, view, section, api, status, said, batches, lists, counter, keys, sandbox, $, $$, click, key };
}

module.exports = function (test) {
    test('vue boîte à outils : sections, réglages par défaut, comp active lue, gestes dans le registre', async () => {
        const t = await setup();
        assert.deepEqual(t.$$('.s-section-label').map((e) => e.textContent), ['Frame', 'Séquencer', 'Créer', 'Format de la compo', 'Zone de travail', 'Calques']);
        assert.strictEqual(t.$('[data-role=format-variants] .s-action-label').textContent, 'Décliner dans les 3 autres formats');
        assert.strictEqual(t.$('[data-role=primary]'), null, 'gestes rapides : pas de bouton principal');
        assert.deepEqual(t.$$('.s-bar-value').map((e) => e.textContent), ['2 im', '1']);
        assert.deepEqual(t.$$('[data-role=seq-mode] .s-seg-btn').map((b) => b.classList.contains('is-on')), [true, false, false]);
        assert.deepEqual(t.$$('[data-role=formats] .s-format').map((b) => b.getAttribute('data-format')), ['16:9', '4:5', '1:1', '9:16']);
        assert.deepEqual(t.$$('.s-format.is-on').map((b) => b.getAttribute('data-format')), ['16:9'], 'format de la comp active allumé');
        assert.strictEqual(t.$('[data-role=format-section] .s-label-hint').textContent, '1920 × 1080');
        assert.ok(t.$('[data-role=bg-color]').classList.contains('is-auto'), 'fond : couleur de la comp par défaut');
        const ids = t.keys.actions().filter((a) => a.group === 'Boîte à outils').map((a) => a.id);
        assert.strictEqual(ids.length, 25, ids.join(' '));
        assert.ok(ids.includes('toolbox.frame-export-alt') && ids.includes('toolbox.reveal-alt') && ids.includes('toolbox.format-9x16-copy'), 'variantes Alt aussi dans le registre');
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
        assert.deepEqual(t.$$('[data-role=seq-mode] .s-seg-btn').map((b) => b.getAttribute('aria-label')), ['Cascade', 'Inverse', 'Aléatoire'], 'pictos seuls, nom pour les lecteurs d\'écran');
        assert.deepEqual(t.$$('[data-role=seq-mode] .s-seg-btn').map((b) => b.getAttribute('data-icon')), ['seqCascade', 'seqReverse', 'seqRandom']);
        assert.strictEqual(t.$('[data-role=sequence] svg path').getAttribute('d'), t.win.SIMING.ICONS.seqReverse[0].path, 'le bouton montre le mode choisi');
        assert.strictEqual(t.$('[data-role=seq-layers]'), null, 'un seul bouton : plus de Calques / Keyframes');
        await t.click(t.$('[data-role=sequence]'));
        assert.strictEqual(t.status.text, '3 calques séquencés en ordre inverse, écart 3 images · Ctrl+Z pour annuler');
        assert.deepEqual([t.s.A, t.s.B, t.s.C].map((l) => Math.round(l.startTime * 25)), [6, 3, 0]);
        assert.ok(t.$('[data-role=sequence]').classList.contains('is-last'));
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

    test('vue boîte à outils : exporter la frame à côté du projet, Alt = la montrer (Node, code de sortie 1 accepté ; sinon l\'hôte)', async () => {
        const dir = path.join(os.tmpdir(), 'siming-fake-projet-vue');
        const runs = [];
        const node = { execFile: (file, args, opts, cb) => { runs.push({ file, args }); setTimeout(() => cb(Object.assign(new Error('exit 1'), { code: 1 }), '', ''), 0); } };
        const t = await setup({ node, prepare: (s) => { s.comp.time = 0.4; } });
        await t.click(t.$('[data-role=frame-export]'));
        assert.strictEqual(t.status.level, 'warn', 'projet jamais enregistré');
        app.project.file = new (require('./fake-ae').FakeFile)(path.join(dir, 'Projet.aep'));
        await t.click(t.$('[data-role=frame-export]'));
        assert.strictEqual(t.status.text, 'Frame enregistrée à côté du projet : Frames/Rig_00010.png');
        assert.strictEqual(runs.length, 0, 'clic simple : rien n\'est montré');
        await t.click(t.$('[data-role=frame-export]'), { altKey: true });
        assert.strictEqual(t.status.text, 'Frame enregistrée à côté du projet : Frames/Rig_00010.png · montrée');
        assert.strictEqual(t.status.level, 'ok', 'explorer.exe sort en code 1 : pas une erreur');
        assert.deepEqual([runs[0].file, runs[0].args[0]], ['explorer.exe', '/select,']);
        t.section.focus();
        await t.key({ key: 'Enter', code: 'Enter' }, t.section);
        assert.strictEqual(runs.length, 2, 'Entrée rejoue la variante Alt');
        const h = await setup();                                       // sans Node : l'hôte montre la frame
        await h.click(h.$('[data-role=frame-export]'), { altKey: true });
        assert.strictEqual(h.status.level, 'ok', h.status.text);
        assert.ok(h.sandbox.system.calls.some((c) => c.startsWith('explorer.exe /select, ')), h.sandbox.system.calls.join(' | '));
        fs.rmSync(dir, { recursive: true, force: true });
        fs.rmSync(path.join(os.tmpdir(), 'siming-fake-ae'), { recursive: true, force: true });
    });

    test('vue boîte à outils : Alt + clic sur Afficher la source = fichier dans l\'Explorateur ; clic = panneau Projet', async () => {
        const { FootageItem, FileSource, FakeFile } = require('./fake-ae');
        const { ROOT } = require('./helpers');
        const runs = [];
        const node = { execFile: (file, args, opts, cb) => { runs.push({ file, args }); setTimeout(() => cb(null, '', ''), 0); } };
        const t = await setup({ node, prepare: (s) => {
            const item = new FootageItem('package.json', new FileSource(new FakeFile(path.join(ROOT, 'package.json')), true));
            app.project.items.push(item);
            s.comp.select(s.comp.addLayer('Données', { source: item }));
        } });
        await t.click(t.$('[data-role=reveal]'), { altKey: true });
        assert.strictEqual(t.status.text, '« package.json » montré dans l\'Explorateur');
        assert.deepEqual(runs[0].args, ['/select,', path.join(ROOT, 'package.json')]);
        await t.click(t.$('[data-role=reveal]'));
        assert.strictEqual(t.status.text, 'Source « package.json » sélectionnée dans le panneau Projet');
        assert.strictEqual(runs.length, 1);
    });

    test('vue boîte à outils : décliner les formats (bouton, Alt sur une case), zone de travail, expressions en keyframes', async () => {
        const t = await setup({ prepare: (s) => {
            s.A.inPoint = 1; s.A.outPoint = 3;
            s.comp.select(s.A);
        } });
        await t.click(t.$('[data-role=format-variants]'));
        assert.strictEqual(t.status.text, '3 compositions créées : Rig 4x5, Rig 1x1, Rig 9x16 · Ctrl+Z pour annuler');
        assert.deepEqual([t.s.comp.width, t.s.comp.height], [1920, 1080], 'original intact');
        await t.click(t.$('[data-role=format-9x16]'), { altKey: true });
        assert.strictEqual(t.status.text, '1 composition créée : Rig 9x16 · Ctrl+Z pour annuler');
        assert.deepEqual(t.$$('.s-format.is-on').map((b) => b.getAttribute('data-format')), ['16:9'], 'la comp active reste en 16:9');
        await t.click(t.$('[data-role=work-selection]'));
        assert.deepEqual([t.s.comp.workAreaStart, t.s.comp.workAreaDuration], [1, 2]);
        await t.click(t.$('[data-role=work-trim]'));
        assert.deepEqual([t.s.comp.duration, t.s.comp.displayStartTime], [2, 1]);
        await t.click(t.$('[data-role=crop]'));
        assert.strictEqual(t.status.text, 'Composition recadrée sur 1 calque : 100 × 100 · Ctrl+Z pour annuler');
        assert.deepEqual([t.s.comp.width, t.s.comp.height], [100, 100]);
        assert.strictEqual(t.$('[data-role=format-section] .s-label-hint').textContent, '100 × 100', 'taille relue');
        const pos = t.s.comp.layer(1).position;
        pos.expression = '[0, time]';
        pos._state.exprFn = (time) => [0, Math.round(time * 100)];
        pos.selected = true;
        await t.click(t.$('[data-role=bake]'));
        assert.ok(/^1 expression convertie en \d+ keyframes/.test(t.status.text), t.status.text);
        assert.strictEqual(pos.expressionEnabled, false);
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

    /** Dossier réel PROJ/02_RESSOURCES/02_ASSET/{1.psd, 2.psd} + projet ; 2.psd est déjà un métrage du projet. */
    function psdTree() {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'siming-vue-psd-'));
        const asset = path.join(root, 'PROJ', '02_RESSOURCES', '02_ASSET');
        const projet = path.join(root, 'PROJ', '03_PROJET');
        fs.mkdirSync(asset, { recursive: true });
        fs.mkdirSync(projet, { recursive: true });
        for (const n of ['1.psd', '2.psd']) fs.writeFileSync(path.join(asset, n), 'x');
        fs.writeFileSync(path.join(projet, 'p.aep'), 'x');
        app.project.file = new FakeFile(path.join(projet, 'p.aep'));
        app.project.items.push(new FootageItem('Fond/2.psd', new FileSource(new FakeFile(path.join(asset, '2.psd')), true)));
        return { root, asset, p1: path.join(asset, '1.psd'), p2: path.join(asset, '2.psd'), cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
    }

    /** Faux fs (lecture asynchrone seulement, comme le veut la vue) + faux lecteur : read(buffer) rend { file },
     *  shapes(doc) rend [{ from: file }]. */
    function fakePsd(win, failOn) {
        const reads = [];
        const fsx = { readFile: (p, cb) => { reads.push(p); setTimeout(() => cb(null, Buffer.from(p)), 0); } };
        win.SIMING.psd.read = (buf) => { if (failOn && String(buf) === failOn) throw new Error('PSD tronqué'); return { file: String(buf) }; };
        win.SIMING.psd.shapes = (doc) => [{ from: doc.file }];
        return { fsx, reads };
    }

    test('vue boîte à outils : Importer les PSD remplace la vue par la liste (2.psd décochée, déjà importé), Tout, un seul appel d\'import', async () => {
        const tree = psdTree();
        try {
            const holder = {};
            const t = await setup({ modules: holder, batch: { imported: [{ name: '1', compId: 1 }, { name: '2', compId: 2 }], status: { text: '2 PSD importés · 0 textes · 0 formes · Ctrl+Z pour annuler', level: 'ok' } } });
            const psd = fakePsd(t.win);
            holder.fs = psd.fsx;
            t.win.localStorage.setItem('siming.labels.rules', JSON.stringify({ words: [], types: { shape: 5 } }));
            const sectionsBefore = t.$$('.s-stack').length;
            assert.ok(t.$('[data-role=layers-section] [data-role=psd-import]'), 'bouton dans la section Calques');
            assert.strictEqual(t.$('[data-role=psd-import] .s-action-label').textContent, 'Importer les PSD');
            assert.strictEqual(t.$('[data-role=psd-import] svg path').getAttribute('d'), t.win.SIMING.ICONS.importer[0].path);
            await t.click(t.$('[data-role=psd-import]'));
            assert.ok(t.$('[data-role=psd-pane]'));
            assert.ok(t.$$('.s-stack').filter((e) => e.getAttribute('data-role') !== 'psd-pane').every((e) => e.hidden), 'le contenu de la boîte est caché');
            // carte du dossier : son nom en titre, chemin complet en infobulle ; un clic la change
            assert.strictEqual(t.$('[data-role=psd-folder] .s-card-title').textContent, path.basename(tree.asset));
            assert.ok(t.$('[data-role=psd-folder]').title.startsWith(tree.asset + '\n'));
            assert.strictEqual(t.$('[data-role=psd-folder] .s-card-icon svg path').getAttribute('d'), t.win.SIMING.ICONS.dossier[0].path);
            assert.deepEqual(t.$$('[data-role=psd-list] .s-check-row:not(.is-all)').map((r) => r.querySelector('.s-row-name').textContent), ['1.psd', '2.psd']);
            assert.deepEqual(t.$$('[data-role=psd-list] .s-check-row:not(.is-all) input').map((i) => i.checked), [true, false]);
            assert.strictEqual(t.$$('[data-role=psd-list] .s-check-row:not(.is-all)')[1].querySelector('.s-pill').textContent, 'déjà importé');
            assert.strictEqual(t.$$('[data-role=psd-list] .s-pill').length, 1);
            assert.strictEqual(t.status.text, '2 PSD trouvés');
            assert.strictEqual(t.$$('.s-btn-primary').length, 1, 'un seul bouton principal à l\'écran');
            assert.strictEqual(t.$('[data-role=primary]').textContent, 'Importer 1 PSD');
            assert.strictEqual(t.$('[data-role=primary]').disabled, false);
            assert.strictEqual(t.$('[data-role=psd-cancel]').textContent, 'Annuler');
            // case « Tous les PSD » : à moitié cochée, compte « 1 / 2 »
            assert.strictEqual(t.$('[data-role=check-all] .s-check-count').textContent, '1 / 2');
            assert.strictEqual(t.$('[data-role=check-all] input').indeterminate, true);
            await t.click(t.$('[data-role=check-all] input'));
            assert.strictEqual(t.$('[data-role=primary]').textContent, 'Importer 2 PSD');
            await t.click(t.$('[data-role=check-all] input'));
            assert.strictEqual(t.$('[data-role=check-all] .s-check-count').textContent, '0 / 2');
            assert.strictEqual(t.$('[data-role=primary]').textContent, 'Importer 0 PSD');
            assert.strictEqual(t.$('[data-role=primary]').disabled, true, 'rien de coché : bouton inactif');
            await t.click(t.$('[data-role=check-all] input'));
            t.said.length = 0;
            await t.click(t.$('[data-role=primary]'));
            assert.deepEqual(t.said.filter((m) => /Lecture/.test(m)), ['Lecture des PSD… (1 / 2)', 'Lecture des PSD… (2 / 2)']);
            assert.deepEqual(psd.reads, [tree.p1, tree.p2], 'lus un par un, dans l\'ordre');
            assert.strictEqual(t.batches.length, 1, 'importBatch appelé une fois');
            assert.deepEqual(t.batches[0].items, [{ path: tree.p1, dir: '', shapes: [{ from: tree.p1 }] }, { path: tree.p2, dir: '', shapes: [{ from: tree.p2 }] }]);
            assert.deepEqual(t.batches[0].rules, { words: [], types: { shape: 5 } }, 'règles de l\'outil Libellés');
            assert.strictEqual(t.$('[data-role=psd-pane]'), null, 'retour à la vue normale');
            assert.strictEqual(t.$$('.s-stack').length, sectionsBefore);
            assert.ok(t.$$('.s-stack').every((e) => !e.hidden));
            assert.strictEqual(t.status.text, '2 PSD importés · 0 textes · 0 formes · Ctrl+Z pour annuler');
            assert.strictEqual(t.status.level, 'ok');
            assert.ok(t.$('[data-role=psd-import]').classList.contains('is-last'));
        } finally { tree.cleanup(); }
    });

    test('vue boîte à outils : règles de Libellés absentes ou illisibles -> rules null (l\'hôte prend ses règles par défaut)', async () => {
        const tree = psdTree();
        try {
            const holder = {};
            const t = await setup({ modules: holder });
            holder.fs = fakePsd(t.win).fsx;
            await t.click(t.$('[data-role=psd-import]'));
            await t.click(t.$('[data-role=primary]'));
            assert.strictEqual(t.batches[0].rules, null);
            t.win.localStorage.setItem('siming.labels.rules', '{pas du json');
            await t.click(t.$('[data-role=psd-import]'));
            await t.click(t.$('[data-role=primary]'));
            assert.strictEqual(t.batches[1].rules, null);
        } finally { tree.cleanup(); }
    });

    test('vue boîte à outils : un PSD qui ne se lit pas devient un item en erreur, les autres continuent', async () => {
        const tree = psdTree();
        try {
            const holder = {};
            const t = await setup({ modules: holder });
            const psd = fakePsd(t.win, tree.p1);
            holder.fs = psd.fsx;
            await t.click(t.$('[data-role=psd-import]'));
            await t.click(t.$('[data-role=check-all] input'));
            await t.click(t.$('[data-role=primary]'));
            assert.deepEqual(t.batches[0].items, [{ path: tree.p1, dir: '', error: 'PSD tronqué' }, { path: tree.p2, dir: '', shapes: [{ from: tree.p2 }] }]);
            const lost = await setup({ modules: { fs: { readFile: (p, cb) => setTimeout(() => cb(new Error('EACCES')), 0) } } });
            await lost.click(lost.$('[data-role=psd-import]'));
            await lost.click(lost.$('[data-role=primary]'));
            assert.deepEqual(lost.batches[0].items, [{ path: tree.p1, dir: '', error: 'EACCES' }]);
        } finally { tree.cleanup(); }
    });

    test('vue boîte à outils : sans Node, lecture impossible (erreur) et la liste reste ouverte', async () => {
        const tree = psdTree();
        try {
            const t = await setup();
            await t.click(t.$('[data-role=psd-import]'));
            await t.click(t.$('[data-role=primary]'));
            assert.strictEqual(t.status.text, 'Lecture des PSD impossible : Node n\'est pas activé dans ce panneau');
            assert.strictEqual(t.status.level, 'error');
            assert.strictEqual(t.batches.length, 0);
            assert.ok(t.$('[data-role=psd-pane]'), 'la liste reste là');
            assert.strictEqual(t.$('[data-role=primary]').disabled, false, 'commandes réactivées');
        } finally { tree.cleanup(); }
    });

    test('vue boîte à outils : Annuler et Échap ferment la liste ; Entrée rouvre la liste, pas pendant qu\'elle est ouverte', async () => {
        const tree = psdTree();
        try {
            const t = await setup();
            await t.click(t.$('[data-role=psd-import]'));
            const calls = t.counter.calls;
            t.section.focus();
            await t.key({ key: 'Enter', code: 'Enter' }, t.section);
            assert.strictEqual(t.counter.calls, calls, 'Entrée ne rejoue rien tant que la liste est ouverte');
            assert.ok(t.$('[data-role=psd-pane]'));
            await t.key({ key: 'Escape', code: 'Escape' }, t.section);
            assert.strictEqual(t.$('[data-role=psd-pane]'), null, 'Échap = Annuler');
            assert.ok(t.$$('.s-stack').every((e) => !e.hidden));
            assert.strictEqual(t.batches.length, 0);
            await t.key({ key: 'Escape', code: 'Escape' }, t.section);   // liste fermée : Échap ne fait rien
            await t.key({ key: 'Enter', code: 'Enter' }, t.section);
            assert.ok(t.$('[data-role=psd-pane]'), 'Entrée rejoue le geste : la liste se rouvre');
            await t.click(t.$('[data-role=psd-cancel]'));
            assert.strictEqual(t.$('[data-role=psd-pane]'), null);
            assert.strictEqual(t.keys.binding('toolbox.psd-cancel').code, 'Escape');
        } finally { tree.cleanup(); }
    });

    test('vue boîte à outils : clic sur la carte du dossier relance la liste sur le dossier choisi ; annulé, rien ne change', async () => {
        const tree = psdTree();
        const other = fs.mkdtempSync(path.join(os.tmpdir(), 'siming-vue-psd-b-'));
        try {
            for (const n of ['b.psd', 'a.psd', 'x.txt']) fs.writeFileSync(path.join(other, n), 'x');
            const t = await setup();
            await t.click(t.$('[data-role=psd-import]'));
            FakeFolder.selectResult = null;
            await t.click(t.$('[data-role=psd-folder]'));
            assert.ok(t.$('[data-role=psd-folder]').title.startsWith(tree.asset + '\n'), 'dialogue annulé');
            FakeFolder.selectResult = new FakeFolder(other);
            await t.click(t.$('[data-role=psd-folder]'));
            assert.strictEqual(t.$('[data-role=psd-folder] .s-card-title').textContent, path.basename(other));
            assert.ok(t.$('[data-role=psd-folder]').title.startsWith(other + '\n'));
            assert.deepEqual(t.$$('[data-role=psd-list] .s-check-row:not(.is-all) .s-row-name').map((e) => e.textContent), ['a.psd', 'b.psd']);
            assert.strictEqual(t.$('[data-role=primary]').textContent, 'Importer 2 PSD');
            assert.strictEqual(t.status.text, '2 PSD trouvés');
        } finally { FakeFolder.selectResult = null; tree.cleanup(); fs.rmSync(other, { recursive: true, force: true }); }
    });

    test('vue boîte à outils : la fenêtre de dossier de CEP (Explorateur) passe avant celle d\'After, ouverte sur le dossier courant', async () => {
        const tree = psdTree();
        const other = fs.mkdtempSync(path.join(os.tmpdir(), 'siming-vue-psd-c-'));
        try {
            fs.writeFileSync(path.join(other, 'z.psd'), 'x');
            const t = await setup();
            const asked = [];
            let answer = { err: 0, data: [] };
            t.win.cep = { fs: { showOpenDialogEx: (multi, dir, title, from) => { asked.push({ multi, dir, title, from }); return answer; } } };
            FakeFolder.selectResult = new FakeFolder(tree.asset);   // la fenêtre d'After ne doit pas servir
            await t.click(t.$('[data-role=psd-import]'));
            await t.click(t.$('[data-role=psd-folder]'));
            assert.deepEqual(asked, [{ multi: false, dir: true, title: 'Choisis le dossier des PSD', from: tree.asset }]);
            assert.ok(t.$('[data-role=psd-folder]').title.startsWith(tree.asset + '\n'), 'annulée : rien ne change');
            answer = { err: 0, data: [other] };
            await t.click(t.$('[data-role=psd-folder]'));
            assert.strictEqual(t.$('[data-role=psd-folder] .s-card-title').textContent, path.basename(other));
            assert.strictEqual(t.$('[data-role=primary]').textContent, 'Importer 1 PSD');
            // erreur de CEP : la fenêtre d'After prend le relais
            answer = { err: 1, data: [] };
            await t.click(t.$('[data-role=psd-folder]'));
            assert.strictEqual(t.$('[data-role=psd-folder] .s-card-title').textContent, path.basename(tree.asset));
        } finally { FakeFolder.selectResult = null; tree.cleanup(); fs.rmSync(other, { recursive: true, force: true }); }
    });

    test('vue boîte à outils : M1, chaque PSD attend une image peinte avant sa lecture (progression visible)', async () => {
        const tree = psdTree();
        try {
            const holder = {};
            const t = await setup({ modules: holder });
            const psd = fakePsd(t.win);
            holder.fs = psd.fsx;
            const frames = [];
            t.win.requestAnimationFrame = (cb) => { frames.push(t.said[t.said.length - 1]); setTimeout(cb, 0); return frames.length; };
            await t.click(t.$('[data-role=psd-import]'));
            await t.click(t.$('[data-role=check-all] input'));
            await t.click(t.$('[data-role=primary]'));
            assert.deepEqual(frames.slice(0, 2), ['Lecture des PSD… (1 / 2)', 'Lecture des PSD… (2 / 2)'], 'une image par PSD, après son message');
            assert.deepEqual(psd.reads, [tree.p1, tree.p2]);
            assert.strictEqual(t.batches.length, 1);
        } finally { tree.cleanup(); }
    });

    test('vue boîte à outils : PSD trouvé dans un dossier vide -> « Aucun PSD dans ce dossier »', async () => {
        const tree = psdTree();
        try {
            for (const n of ['1.psd', '2.psd']) fs.rmSync(path.join(tree.asset, n));
            const t = await setup();
            await t.click(t.$('[data-role=psd-import]'));
            assert.strictEqual(t.$('[data-role=psd-list] .s-empty').textContent, 'Aucun PSD dans ce dossier');
        } finally { tree.cleanup(); }
    });

    test('vue boîte à outils : projet non enregistré -> liste vide, statut de l\'hôte, carte « Choisir le dossier » proposée', async () => {
        const t = await setup();
        await t.click(t.$('[data-role=psd-import]'));
        assert.ok(t.$('[data-role=psd-pane]'));
        assert.strictEqual(t.$('[data-role=psd-list] .s-empty').textContent, 'Aucun dossier : clique sur la carte au-dessus pour le choisir', 'M2 : pas « aucun PSD » sans dossier');
        assert.strictEqual(t.status.text, 'Projet non enregistré : choisis le dossier des PSD');
        assert.strictEqual(t.$('[data-role=primary]').disabled, true);
        assert.strictEqual(t.$('[data-role=primary]').textContent, 'Importer 0 PSD');
        const card = t.$('[data-role=psd-folder]');
        assert.ok(card.classList.contains('is-empty'), 'carte en pointillés');
        assert.strictEqual(card.querySelector('.s-card-title').textContent, 'Choisir le dossier des PSD');
        assert.strictEqual(card.title, 'Choisir le dossier des PSD');
        assert.strictEqual(t.$('[data-role=check-all]'), null, 'pas de case « Tous » sans PSD');
    });

    // ------------------------------------------------------------------------
    //  Sous-dossiers, réglages de l'import (js/psd/settings.js), icône Réglages
    // ------------------------------------------------------------------------

    /** psdTree + PSD en sous-dossiers : SOUS/a.psd, SOUS/PROF/b.psd, ZED/c.psd. */
    function groupedTree() {
        const tree = psdTree();
        for (const [d, n] of [['SOUS', 'a.psd'], [path.join('SOUS', 'PROF'), 'b.psd'], ['ZED', 'c.psd']]) {
            fs.mkdirSync(path.join(tree.asset, d), { recursive: true });
            fs.writeFileSync(path.join(tree.asset, d, n), 'x');
        }
        return tree;
    }
    const rowsText = (t) => t.$$('[data-role=psd-list] > *').map((e) => (e.classList.contains('s-check-group') ? '# ' : e.classList.contains('is-all') ? '* ' : '') + (e.querySelector('.s-row-name') || e).textContent);

    test('vue boîte à outils : sous-dossiers des PSD en groupes avec leur chemin relatif ; Tous les PSD et le compte restent globaux', async () => {
        const tree = groupedTree();
        try {
            const t = await setup();
            await t.click(t.$('[data-role=psd-import]'));
            assert.deepEqual(rowsText(t), ['* Tous les PSD', '# 02_ASSET', '1.psd', '2.psd', '# SOUS', 'a.psd', '# SOUS/PROF', 'b.psd', '# ZED', 'c.psd']);
            assert.strictEqual(t.$('[data-role=check-all] .s-check-count').textContent, '4 / 5', '2.psd est déjà importé');
            assert.strictEqual(t.$('[data-role=primary]').textContent, 'Importer 4 PSD');
            assert.strictEqual(t.$$('[data-role=check-group] input').length, 0, 'intitulés sans case');
            assert.strictEqual(t.$$('[data-role=check-group]')[2].title, 'SOUS/PROF');
            assert.strictEqual(t.status.text, '5 PSD trouvés');
            await t.click(t.$('[data-role=check-all] input'));   // 4 / 5 -> tout
            assert.strictEqual(t.$('[data-role=primary]').textContent, 'Importer 5 PSD');
        } finally { tree.cleanup(); }
    });

    test('vue boîte à outils : sans sous-dossier, aucun intitulé de groupe', async () => {
        const tree = psdTree();
        try {
            const t = await setup();
            await t.click(t.$('[data-role=psd-import]'));
            assert.strictEqual(t.$$('[data-role=check-group]').length, 0);
        } finally { tree.cleanup(); }
    });

    test('vue boîte à outils : l\'import transmet le dir de chaque PSD, le chutier et les étapes des réglages', async () => {
        const tree = groupedTree();
        try {
            const holder = {};
            const t = await setup({ modules: holder });
            const psd = fakePsd(t.win);
            holder.fs = psd.fsx;
            t.win.localStorage.setItem('siming.psd.bin', 'Import/PSD');
            t.win.localStorage.setItem('siming.psd.step.anchors', '0');
            t.win.localStorage.setItem('siming.psd.step.crop', '0');
            await t.click(t.$('[data-role=psd-import]'));
            await t.click(t.$('[data-role=check-all] input'));
            await t.click(t.$('[data-role=primary]'));
            const b = t.batches[0];
            assert.deepEqual(b.items.map((i) => [path.basename(i.path), i.dir]), [['1.psd', ''], ['2.psd', ''], ['a.psd', 'SOUS'], ['b.psd', 'SOUS/PROF'], ['c.psd', 'ZED']]);
            assert.strictEqual(b.bin, 'Import/PSD');
            assert.deepEqual(b.steps, { texts: true, shapes: true, labels: true, crop: false, anchors: false });
        } finally { tree.cleanup(); }
    });

    test('vue boîte à outils : réglages par défaut -> chutier 02_ASSET et toutes les étapes transmis', async () => {
        const tree = psdTree();
        try {
            const holder = {};
            const t = await setup({ modules: holder });
            holder.fs = fakePsd(t.win).fsx;
            await t.click(t.$('[data-role=psd-import]'));
            await t.click(t.$('[data-role=primary]'));
            assert.strictEqual(t.batches[0].bin, '02_ASSET');
            assert.deepEqual(t.batches[0].steps, { texts: true, shapes: true, labels: true, crop: true, anchors: true });
        } finally { tree.cleanup(); }
    });

    test('vue boîte à outils : étape « formes » coupée -> PSD non lus (Node inutile), shapes null, importBatch appelé', async () => {
        const tree = psdTree();
        try {
            const t = await setup();   // aucun module Node
            t.win.localStorage.setItem('siming.psd.step.shapes', '0');
            await t.click(t.$('[data-role=psd-import]'));
            await t.click(t.$('[data-role=primary]'));
            assert.strictEqual(t.batches.length, 1);
            assert.deepEqual(t.batches[0].items, [{ path: tree.p1, dir: '', shapes: null }]);
            assert.strictEqual(t.batches[0].steps.shapes, false);
            assert.ok(!t.said.some((m) => /Lecture|Node/.test(m)), 'ni lecture ni erreur Node');
        } finally { tree.cleanup(); }
    });

    test('vue boîte à outils : le réglage « Dossier des PSD » est transmis à la liste, et une liste ouverte est relue quand il change', async () => {
        const tree = psdTree();
        const autre = path.join(tree.root, 'PROJ', '02_RESSOURCES', 'Autre');
        try {
            fs.mkdirSync(autre, { recursive: true });
            for (const n of ['z.psd', 'y.psd']) fs.writeFileSync(path.join(autre, n), 'x');
            const t = await setup();
            t.win.localStorage.setItem('siming.psd.sourcePath', 'Mes/PSD');
            await t.click(t.$('[data-role=psd-import]'));
            assert.deepEqual(t.lists[0], { sourcePath: 'Mes/PSD' });
            assert.strictEqual(t.$('[data-role=psd-folder]').classList.contains('is-empty'), true, 'introuvable : carte vide');
            t.win.localStorage.setItem('siming.psd.sourcePath', '02_RESSOURCES/Autre');
            t.view.closest('.s-view').dispatchEvent(new t.win.Event('pointerenter'));
            await t.api.idle();
            assert.deepEqual(t.lists[1], { sourcePath: '02_RESSOURCES/Autre' });
            assert.deepEqual(t.$$('[data-role=psd-list] .s-check-row:not(.is-all) .s-row-name').map((e) => e.textContent), ['y.psd', 'z.psd']);
            t.view.closest('.s-view').dispatchEvent(new t.win.Event('pointerenter'));
            await t.api.idle();
            assert.strictEqual(t.lists.length, 2, 'réglage inchangé : pas de relecture');
        } finally { tree.cleanup(); }
    });

    test('vue boîte à outils : un dossier choisi à la main n\'est pas remplacé quand le réglage change', async () => {
        const tree = psdTree();
        const other = fs.mkdtempSync(path.join(os.tmpdir(), 'siming-vue-psd-d-'));
        try {
            fs.writeFileSync(path.join(other, 'm.psd'), 'x');
            const t = await setup();
            await t.click(t.$('[data-role=psd-import]'));
            FakeFolder.selectResult = new FakeFolder(other);
            await t.click(t.$('[data-role=psd-folder]'));
            t.win.localStorage.setItem('siming.psd.sourcePath', 'Ailleurs');
            t.view.closest('.s-view').dispatchEvent(new t.win.Event('pointerenter'));
            await t.api.idle();
            assert.deepEqual(t.$$('[data-role=psd-list] .s-check-row:not(.is-all) .s-row-name').map((e) => e.textContent), ['m.psd']);
            assert.deepEqual(t.lists.map((l) => Object.keys(l)), [['sourcePath'], ['folder']]);
            await t.click(t.$('[data-role=psd-cancel]'));
            await t.click(t.$('[data-role=psd-import]'));
            assert.deepEqual(t.lists[2], { folder: other }, 'rouverte sur le dossier choisi');
        } finally { FakeFolder.selectResult = null; tree.cleanup(); fs.rmSync(other, { recursive: true, force: true }); }
    });

    test('vue boîte à outils : l\'icône Réglages de la liste ouvre Réglages sur l\'onglet Import PSD ; absente sans ctx.openSettings', async () => {
        const tree = psdTree();
        try {
            const opened = [];
            const t = await setup({ openSettings: (tab) => opened.push(tab) });
            assert.strictEqual(t.$('[data-role=psd-settings]'), null, 'pas dans la boîte, seulement dans la liste');
            await t.click(t.$('[data-role=psd-import]'));
            const gear = t.$('[data-role=psd-settings]');
            assert.ok(gear);
            assert.strictEqual(gear.title, 'Réglages de l\'import');
            assert.strictEqual(gear.getAttribute('aria-label'), 'Réglages de l\'import');
            assert.strictEqual(gear.querySelector('svg path').getAttribute('d'), t.win.SIMING.ICONS.reglages[0].path);
            assert.ok(gear.classList.contains('s-icon-btn'), 'cible de 32 px');
            await t.click(gear);
            assert.deepEqual(opened, ['psd']);
            assert.ok(t.$('[data-role=psd-pane]'), 'la liste reste ouverte');
            const bare = await setup();
            await bare.click(bare.$('[data-role=psd-import]'));
            assert.ok(bare.$('[data-role=psd-pane]'));
            assert.strictEqual(bare.$('[data-role=psd-settings]'), null, 'panneau isolé : pas d\'icône');
        } finally { tree.cleanup(); }
    });
};
