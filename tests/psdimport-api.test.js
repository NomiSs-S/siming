'use strict';
/* API hôte d'Import PSD (dossier, liste des PSD, calques de forme), appelée comme par le pont, sur le faux AE. */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadHost, callHost, app } = require('./helpers');
const { FootageItem, FileSource, FakeFile, FakeFolder, FakeComp, BlendingMode, CompItem, FolderItem } = require('./fake-ae');

const MENU_COMMANDS_DEFAULT = app.menuNames;   // commandes d'un After Effects en anglais (remises avant chaque scène)

function host() {
    const { sandbox } = loadHost();
    const call = (fn, args) => {
        const env = callHost(sandbox, 'psdimport', fn, args);
        assert.strictEqual(env.ok, true, env.error && env.error.message);
        return env.data;
    };
    return { call, sandbox };
}

/** Arborescence réelle dans le dossier temporaire :
 *  PROJ/02_RESSOURCES/02_ASSET/{1.psd, 2.psd, 10.psd, notes.txt, SOUS/}, PROJ/03_PROJET/p.aep. */
function tree() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'siming-psd-'));
    const asset = path.join(root, 'PROJ', '02_RESSOURCES', '02_ASSET');
    const projet = path.join(root, 'PROJ', '03_PROJET');
    fs.mkdirSync(path.join(asset, 'SOUS'), { recursive: true });
    fs.mkdirSync(projet, { recursive: true });
    for (const n of ['10.psd', '2.psd', '1.psd', 'notes.txt']) fs.writeFileSync(path.join(asset, n), 'x');
    fs.writeFileSync(path.join(projet, 'p.aep'), 'x');
    return { root, asset, projet, aep: path.join(projet, 'p.aep'), cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

const withTree = (fn) => () => {
    const t = tree();
    try { fn(t); } finally { t.cleanup(); }
};

module.exports = function (test) {
    test('Import PSD : list trouve 02_RESSOURCES/02_ASSET depuis le projet, PSD seulement, tri naturel', withTree((t) => {
        const { call } = host();
        app.project.file = new FakeFile(t.aep);
        const r = call('list', {});
        assert.strictEqual(r.folder, t.asset);
        assert.deepStrictEqual(r.files.map((f) => f.name), ['1.psd', '2.psd', '10.psd']);
        assert.strictEqual(r.files[0].path, path.join(t.asset, '1.psd'));
        assert.ok(r.files.every((f) => f.imported === false));
        assert.strictEqual(r.status.level, 'ok');
    }));

    test('Import PSD : imported vaut true quand un métrage du projet a ce PSD pour fichier (sans la casse)', withTree((t) => {
        const { call } = host();
        app.project.file = new FakeFile(t.aep);
        // After Effects nomme le métrage « calque/fichier.psd », mais sa source est le PSD lui-même
        app.project.items.push(new FootageItem('Fond/1.psd', new FileSource(new FakeFile(path.join(t.asset, '1.psd')), true)));
        app.project.items.push(new FootageItem('2.psd', new FileSource(new FakeFile(path.join(t.asset, '2.psd').toUpperCase()), true)));
        app.project.items.push(new FootageItem('Solide', {}));   // sans fichier : ignoré
        const r = call('list', {});
        assert.deepStrictEqual(r.files.map((f) => [f.name, f.imported]), [['1.psd', true], ['2.psd', true], ['10.psd', false]]);
    }));

    test('Import PSD : list avec folder explicite liste ce dossier ; un dossier absent donne un avertissement', withTree((t) => {
        const { call } = host();
        const r = call('list', { folder: t.asset });
        assert.strictEqual(r.folder, t.asset);
        assert.strictEqual(r.files.length, 3);
        const gone = call('list', { folder: path.join(t.root, 'nulle-part') });
        assert.deepStrictEqual(gone.files, []);
        assert.strictEqual(gone.status.level, 'warn');
        const empty = call('list', { folder: path.join(t.asset, 'SOUS') });
        assert.deepStrictEqual(empty.files, []);
        assert.strictEqual(empty.status.level, 'warn');
    }));

    test('Import PSD : RF4, projet non enregistré -> aucun dossier, statut info', () => {
        const { call } = host();
        app.project.file = null;
        const r = call('list', {});
        assert.deepStrictEqual(r.files, []);
        assert.strictEqual(r.folder, null);
        assert.strictEqual(r.status.text, 'Projet non enregistré : choisis le dossier des PSD');
        assert.strictEqual(r.status.level, 'info');
    });

    test('Import PSD : RF4, arborescence sans 02_RESSOURCES/02_ASSET -> dossier introuvable', withTree((t) => {
        const { call } = host();
        const autre = fs.mkdtempSync(path.join(os.tmpdir(), 'siming-psd-autre-'));
        try {
            fs.mkdirSync(path.join(autre, 'a', 'b'), { recursive: true });
            fs.writeFileSync(path.join(autre, 'a', 'b', 'p.aep'), 'x');
            app.project.file = new FakeFile(path.join(autre, 'a', 'b', 'p.aep'));
            const r = call('list', {});
            assert.strictEqual(r.folder, null);
            assert.deepStrictEqual(r.files, []);
            assert.strictEqual(r.status.text, 'Dossier 02_RESSOURCES/02_ASSET introuvable : choisis le dossier des PSD');
        } finally {
            fs.rmSync(autre, { recursive: true, force: true });
        }
    }));

    test('Import PSD : la remontée s\'arrête après 3 dossiers parents', withTree((t) => {
        const { call } = host();
        // projet à 4 niveaux sous PROJ : p.aep dans PROJ/a/b/c/d -> PROJ est le 4e parent : trop loin
        const deep = path.join(t.root, 'PROJ', 'a', 'b', 'c', 'd');
        fs.mkdirSync(deep, { recursive: true });
        fs.writeFileSync(path.join(deep, 'p.aep'), 'x');
        app.project.file = new FakeFile(path.join(deep, 'p.aep'));
        assert.strictEqual(call('list', {}).folder, null);
        // à 3 niveaux (PROJ/a/b/c) : trouvé
        const near = path.join(t.root, 'PROJ', 'a', 'b', 'c');
        fs.writeFileSync(path.join(near, 'p.aep'), 'x');
        app.project.file = new FakeFile(path.join(near, 'p.aep'));
        assert.strictEqual(call('list', {}).folder, t.asset);
    }));

    test('Import PSD : pickFolder renvoie le dossier choisi, départ = dossier du projet (selectDlg), null si annulé', withTree((t) => {
        const { call } = host();
        app.project.file = new FakeFile(t.aep);
        FakeFolder.selectResult = new FakeFolder(t.asset);
        assert.deepStrictEqual(call('pickFolder', {}), { folder: t.asset });
        assert.strictEqual(FakeFolder.selectCalls.length, 1);
        assert.strictEqual(FakeFolder.selectCalls[0].start.fsName, t.projet);
        assert.strictEqual(FakeFolder.selectCalls[0].prompt, 'Choisis le dossier des PSD');
        call('pickFolder', { from: t.asset });
        assert.strictEqual(FakeFolder.selectCalls[1].start.fsName, t.asset);
        FakeFolder.selectResult = null;
        assert.deepStrictEqual(call('pickFolder', {}), { folder: null });
    }));

    test('Import PSD : pickFolder, from absent du disque -> repli sur le dossier du projet', withTree((t) => {
        const { call } = host();
        app.project.file = new FakeFile(t.aep);
        call('pickFolder', { from: path.join(t.root, 'nulle-part') });
        assert.strictEqual(FakeFolder.selectCalls[0].start.fsName, t.projet);
    }));

    test('Import PSD : pickFolder, projet non enregistré et sans from -> dialogue statique, sans départ', withTree((t) => {
        const { call } = host();
        app.project.file = null;
        FakeFolder.selectResult = new FakeFolder(t.asset);
        assert.deepStrictEqual(call('pickFolder', {}), { folder: t.asset });
        assert.strictEqual(FakeFolder.selectCalls.length, 1);
        assert.strictEqual(FakeFolder.selectCalls[0].start, null);
        // from existant mais projet non enregistré : le départ est from
        call('pickFolder', { from: t.root });
        assert.strictEqual(FakeFolder.selectCalls[1].start.fsName, t.root);
    }));

    test('Import PSD : naturalCompare (nombres, casse, zéros en tête départagés) et isPsdName', () => {
        const { sandbox } = host();
        const core = sandbox.SIMING.getTool('psdimport')._core;
        const cmp = core.naturalCompare;
        assert.ok(cmp('2.psd', '10.psd') < 0);
        assert.ok(cmp('a2.psd', 'a10.psd') < 0);
        assert.strictEqual(cmp('Fond.psd', 'fond.psd') < 0 || cmp('Fond.psd', 'fond.psd') > 0, true);   // jamais 0 : déterministe
        assert.ok(cmp('Fond.psd', 'fond.psd') !== cmp('fond.psd', 'Fond.psd'));
        assert.ok(cmp('01.psd', '1.psd') !== 0);
        assert.strictEqual(cmp('01.psd', '1.psd'), -cmp('1.psd', '01.psd'));
        assert.strictEqual(cmp('a.psd', 'a.psd'), 0);
        assert.ok(cmp('b.psd', 'A2.psd') > 0);
        assert.strictEqual(core.isPsdName('x.PSD'), true);
        assert.strictEqual(core.isPsdName('._x.psd'), false);
        assert.strictEqual(core.isPsdName('notes.txt'), false);
    });

    // ------------------------------------------------------------------------
    //  replaceWithShape : calque de forme d'après le JSON
    // ------------------------------------------------------------------------

    /** Forme de la Task 2 : rectangle arrondi 859 × 203, contour de 2 px (boîte de pixels 861 × 205 en 759, 272). */
    const shapeOf = (over) => Object.assign({
        match: { name: 'Rectangle 1', nth: 0 },
        box: { left: 759, top: 272, right: 1620, bottom: 477 },
        opacity: 100, fillOpacity: 100, blend: 'normal', hidden: false,
        paths: [{ type: 'rect', center: [1189.5, 374.5], size: [859, 203], rotation: 0, roundness: 55 }],
        fill: { type: 'solid', color: [0.2, 0.4, 0.6] },
        stroke: { width: 2, color: [1, 0.5, 0], align: 'center' },
        styles: [],
    }, over || {});

    const setState = (st, matchName, v) => { st.transform.children.find((c) => c.matchName === matchName).value = v; };

    /** Comp 1920 × 1080 : « Haut », le calque PSD « Rectangle 1 » (index 2, ancre [430.5, 102.5],
     *  position [1189.5, 374.5] sauf `pos`, métrage de `size` px, 861 × 205 par défaut = sa boîte), « Bas ».
     *  `layer` : champs d'état du calque PSD. */
    function psdScene(opts) {
        const o = opts || {};
        const { sandbox } = host();
        app.undoGroups = [];
        app.commands = [];
        app.menuNames = MENU_COMMANDS_DEFAULT;
        const comp = new FakeComp(100, 'PSD', { width: 1920, height: 1080 });
        app.project.activeItem = comp;
        comp.addLayer('Haut');
        const size = o.size || [861, 205];
        const source = new FootageItem('Rectangle 1/1.psd', {}, { width: size[0], height: size[1] });
        const st = comp.addLayer('Rectangle 1', Object.assign({ startTime: 1, inPoint: 1.5, outPoint: 6, source }, o.layer || {}));
        setState(st, 'ADBE Anchor Point', [430.5, 102.5]);
        setState(st, 'ADBE Position', o.pos || [1189.5, 374.5]);
        if (o.scale) setState(st, 'ADBE Scale', o.scale);
        if (o.rotation) setState(st, 'ADBE Rotate Z', o.rotation);
        if (o.opacity !== undefined) setState(st, 'ADBE Opacity', o.opacity);
        comp.addLayer('Bas');
        const core = sandbox.SIMING.getTool('psdimport')._core;
        return { comp, st, core, run: (shape) => core.replaceWithShape(comp, comp.layer(2), shape) };
    }

    const groupOf = (layer, n) => layer.property('ADBE Root Vectors Group').property(n);
    const itemOf = (layer, n, match) => groupOf(layer, n).property('ADBE Vectors Group').property(match);
    const trProp = (layer, n, match) => groupOf(layer, n).property('ADBE Vector Transform Group').property(match);
    /** Valeur copiée hors du bac à sable (les tableaux du moteur hôte ont un autre prototype). */
    const plain = (v) => JSON.parse(JSON.stringify(v));
    const names = (comp) => comp.layers.map((s) => s.name);

    test('Import PSD : replaceWithShape recrée le rectangle arrondi en calque de forme au même index (RF1)', () => {
        const { comp, st, run } = psdScene({ opacity: 80 });
        st.blendingMode = BlendingMode.MULTIPLY;
        const out = run(shapeOf({ blend: 'multiply', opacity: 80 }));
        assert.ok(out, 'un calque de forme');
        assert.deepStrictEqual(names(comp), ['Haut', 'Rectangle 1', 'Bas']);
        assert.strictEqual(comp.numLayers, 3);
        assert.ok(comp.layers.indexOf(st) < 0, 'original supprimé');
        const layer = comp.layer(2);
        assert.strictEqual(layer._state.kind, 'shape');
        assert.strictEqual(out.index, 2);
        assert.deepStrictEqual(plain(layer.property('ADBE Transform Group').property('ADBE Anchor Point').value), [0, 0]);
        assert.deepStrictEqual(plain(layer.property('ADBE Transform Group').property('ADBE Position').value), [0, 0]);
        assert.strictEqual(layer.property('ADBE Transform Group').property('ADBE Opacity').value, 80);
        assert.strictEqual(layer.blendingMode, BlendingMode.MULTIPLY);
        assert.strictEqual(layer.enabled, true);
        assert.strictEqual(layer.locked, false);
        assert.strictEqual(layer.startTime, 1);
        assert.strictEqual(layer.inPoint, 1.5);
        assert.strictEqual(layer.outPoint, 6);
        // un groupe : tracé, contour, remplissage (dans cet ordre)
        assert.strictEqual(layer.property('ADBE Root Vectors Group').numProperties, 1);
        const contents = groupOf(layer, 1).property('ADBE Vectors Group');
        assert.deepStrictEqual([1, 2, 3].map((i) => contents.property(i).matchName),
            ['ADBE Vector Shape - Rect', 'ADBE Vector Graphic - Stroke', 'ADBE Vector Graphic - Fill']);
        const rect = 'ADBE Vector Shape - Rect';
        assert.deepStrictEqual(plain(itemOf(layer, 1, rect).property('ADBE Vector Rect Size').value), [859, 203]);
        assert.deepStrictEqual(plain(itemOf(layer, 1, rect).property('ADBE Vector Rect Position').value), [1189.5, 374.5]);
        assert.strictEqual(itemOf(layer, 1, rect).property('ADBE Vector Rect Roundness').value, 55);
        assert.deepStrictEqual(plain(itemOf(layer, 1, 'ADBE Vector Graphic - Fill').property('ADBE Vector Fill Color').value), [0.2, 0.4, 0.6, 1]);
        assert.strictEqual(itemOf(layer, 1, 'ADBE Vector Graphic - Fill').property('ADBE Vector Fill Opacity').value, 100);
        const stroke = itemOf(layer, 1, 'ADBE Vector Graphic - Stroke');
        assert.deepStrictEqual(plain(stroke.property('ADBE Vector Stroke Color').value), [1, 0.5, 0, 1]);
        assert.strictEqual(stroke.property('ADBE Vector Stroke Width').value, 2);
        // pas de rotation : le groupe garde sa transformation d'origine
        assert.strictEqual(trProp(layer, 1, 'ADBE Vector Rotation').value, 0);
        assert.deepStrictEqual(plain(trProp(layer, 1, 'ADBE Vector Anchor').value), [0, 0]);
        assert.deepStrictEqual(plain(trProp(layer, 1, 'ADBE Vector Position').value), [0, 0]);
        assert.deepStrictEqual(app.undoGroups, [], 'aucun groupe d\'annulation ouvert ici : c\'est l\'appelant qui le fait');
    });

    test('Import PSD : replaceWithShape, métrage à la taille du document (calque de forme importé par After) -> la forme est à sa place', () => {
        // After importe un calque de forme en 1920 × 1080, ancre et position au centre, tracé en masque
        const { comp, st, run } = psdScene({ size: [1920, 1080], pos: [960, 540] });
        setState(st, 'ADBE Anchor Point', [960, 540]);
        const out = run(shapeOf({ canvas: { width: 1920, height: 1080 } }));
        assert.ok(out, 'un calque de forme');
        const layer = comp.layer(2);
        assert.deepStrictEqual(plain(layer.property('ADBE Transform Group').property('ADBE Position').value), [0, 0]);
        assert.deepStrictEqual(plain(itemOf(layer, 1, 'ADBE Vector Shape - Rect').property('ADBE Vector Rect Position').value), [1189.5, 374.5]);
        // décalé de +100, +50 dans la compo : la forme suit
        const moved = psdScene({ size: [1920, 1080], pos: [1060, 590] });
        setState(moved.st, 'ADBE Anchor Point', [960, 540]);
        assert.ok(moved.run(shapeOf({ canvas: { width: 1920, height: 1080 } })));
        assert.deepStrictEqual(plain(moved.comp.layer(2).property('ADBE Transform Group').property('ADBE Position').value), [100, 50]);
    });

    test('Import PSD : replaceWithShape, métrage ni à la taille de la boîte ni à celle du document -> panne visible, calque intact', () => {
        const { comp, st, core, run } = psdScene({ size: [1000, 600] });
        assert.strictEqual(run(shapeOf({ canvas: { width: 1920, height: 1080 } })), null);
        assert.ok(comp.layers.indexOf(st) >= 0);
        assert.strictEqual(core.lastFailure().name, 'Mismatch');
    });

    test('Import PSD : replaceWithShape, RF3, calque PSD décalé dans la compo -> la forme suit (position du calque)', () => {
        const { comp, run } = psdScene({ pos: [1289.5, 424.5] });   // +100, +50
        const out = run(shapeOf());
        assert.ok(out);
        const layer = comp.layer(2);
        const pos = plain(layer.property('ADBE Transform Group').property('ADBE Position').value);
        assert.deepStrictEqual(pos, [100, 50]);
        // position du rectangle dans la compo = position du calque + position du rectangle
        const rectPos = plain(itemOf(layer, 1, 'ADBE Vector Shape - Rect').property('ADBE Vector Rect Position').value);
        assert.deepStrictEqual([pos[0] + rectPos[0], pos[1] + rectPos[1]], [1289.5, 424.5]);
    });

    test('Import PSD : replaceWithShape, RF5, calque verrouillé et masqué -> forme verrouillée et masquée, original supprimé', () => {
        const { comp, st, run } = psdScene({ layer: { locked: true, enabled: false } });
        const out = run(shapeOf());
        assert.ok(out);
        assert.ok(comp.layers.indexOf(st) < 0);
        const layer = comp.layer(2);
        assert.strictEqual(layer.locked, true);
        assert.strictEqual(layer.enabled, false);
        assert.deepStrictEqual(names(comp), ['Haut', 'Rectangle 1', 'Bas']);
    });

    test('Import PSD : replaceWithShape reprend le parent du calque PSD', () => {
        const { comp, st, run } = psdScene();
        const boss = comp.addLayer('Parent');
        st.parent = boss;
        assert.ok(run(shapeOf()));
        const idx = comp.layers.indexOf(boss) + 1;
        const layer = comp.layer(2);
        assert.strictEqual(layer.parent.index, idx);
    });

    test('Import PSD : replaceWithShape refuse un calque PSD mis à l\'échelle ou tourné, et le laisse intact', () => {
        for (const o of [{ scale: [50, 50] }, { scale: [100, 80] }, { rotation: 15 }]) {
            const { comp, st, run } = psdScene(o);
            assert.strictEqual(run(shapeOf()), null);
            assert.deepStrictEqual(names(comp), ['Haut', 'Rectangle 1', 'Bas']);
            assert.strictEqual(comp.layers[1], st);
        }
    });

    test('Import PSD : replaceWithShape, contour intérieur ou extérieur -> null (le contour d\'After est centré), calque intact', () => {
        for (const align of ['inside', 'outside']) {
            const { comp, st, run } = psdScene();
            assert.strictEqual(run(shapeOf({ stroke: { width: 4, color: [0, 0, 0], align } })), null);
            assert.strictEqual(comp.numLayers, 3);
            assert.strictEqual(comp.layers[1], st);
        }
    });

    test('Import PSD : replaceWithShape sans contour ni remplissage, opacité du fond sur les deux', () => {
        const a = psdScene();
        const bare = a.run(shapeOf({ fill: null, stroke: null }));
        assert.ok(bare);
        assert.strictEqual(a.comp.layer(2).property('ADBE Root Vectors Group').property(1).property('ADBE Vectors Group').numProperties, 1);
        const b = psdScene();
        assert.ok(b.run(shapeOf({ fillOpacity: 40 })));
        const layer = b.comp.layer(2);
        assert.strictEqual(itemOf(layer, 1, 'ADBE Vector Graphic - Fill').property('ADBE Vector Fill Opacity').value, 40);
        assert.strictEqual(itemOf(layer, 1, 'ADBE Vector Graphic - Stroke').property('ADBE Vector Stroke Opacity').value, 40);
    });

    test('Import PSD : replaceWithShape, rectangle tourné -> la rotation est sur le groupe, autour du centre', () => {
        const { comp, run } = psdScene();
        assert.ok(run(shapeOf({ paths: [{ type: 'rect', center: [1189.5, 374.5], size: [859, 203], rotation: 30, roundness: 0 }] })));
        const layer = comp.layer(2);
        assert.strictEqual(trProp(layer, 1, 'ADBE Vector Rotation').value, 30);
        assert.deepStrictEqual(plain(trProp(layer, 1, 'ADBE Vector Anchor').value), [1189.5, 374.5]);
        assert.deepStrictEqual(plain(trProp(layer, 1, 'ADBE Vector Position').value), [1189.5, 374.5]);
        assert.deepStrictEqual(plain(itemOf(layer, 1, 'ADBE Vector Shape - Rect').property('ADBE Vector Rect Position').value), [1189.5, 374.5]);
    });

    test('Import PSD : replaceWithShape, ellipse tournée -> rotation sur le groupe', () => {
        const { comp, run } = psdScene();
        assert.ok(run(shapeOf({ paths: [{ type: 'ellipse', center: [900, 300], size: [200, 100], rotation: -45 }] })));
        assert.strictEqual(trProp(comp.layer(2), 1, 'ADBE Vector Rotation').value, -45);
        assert.deepStrictEqual(trProp(comp.layer(2), 1, 'ADBE Vector Anchor').value, [900, 300]);
    });

    test('Import PSD : replaceWithShape, sous-tracés sans contour : un seul groupe, tous les tracés, un seul remplissage', () => {
        const { comp, run } = psdScene();
        const paths = [
            { type: 'ellipse', center: [900, 300], size: [200, 100], rotation: 0 },
            { type: 'path', vertices: [[10, 20], [110, 20], [60, 90]], inTangents: [[0, 0], [0, 0], [5, 5]], outTangents: [[1, 2], [0, 0], [0, 0]], closed: true },
            { type: 'path', vertices: [[0, 0], [50, 50]], inTangents: [[0, 0], [0, 0]], outTangents: [[0, 0], [0, 0]], closed: false },
        ];
        assert.ok(run(shapeOf({ paths, stroke: null })));
        const layer = comp.layer(2);
        assert.strictEqual(layer.property('ADBE Root Vectors Group').numProperties, 1);
        const contents = groupOf(layer, 1).property('ADBE Vectors Group');
        assert.deepStrictEqual([1, 2, 3, 4].map((i) => contents.property(i).matchName),
            ['ADBE Vector Shape - Ellipse', 'ADBE Vector Shape - Group', 'ADBE Vector Shape - Group', 'ADBE Vector Graphic - Fill']);
        const e = contents.property(1);
        assert.deepStrictEqual(plain(e.property('ADBE Vector Ellipse Size').value), [200, 100]);
        assert.deepStrictEqual(plain(e.property('ADBE Vector Ellipse Position').value), [900, 300]);
        const p = plain(contents.property(2).property('ADBE Vector Shape').value);
        assert.deepStrictEqual(p.vertices, [[10, 20], [110, 20], [60, 90]]);
        assert.deepStrictEqual(p.inTangents, [[0, 0], [0, 0], [5, 5]]);
        assert.deepStrictEqual(p.outTangents, [[1, 2], [0, 0], [0, 0]]);
        assert.strictEqual(p.closed, true);
        assert.strictEqual(contents.property(3).property('ADBE Vector Shape').value.closed, false);
    });

    test('Import PSD : replaceWithShape, deux rectangles (Rectangle 3) : un groupe, deux tracés, un remplissage ; chacun garde sa taille', () => {
        const { comp, run } = psdScene();
        const paths = [
            { type: 'rect', center: [800, 300], size: [100, 50], rotation: 0, roundness: 0 },
            { type: 'rect', center: [900, 320], size: [60, 40], rotation: 0, roundness: 8 },
        ];
        assert.ok(run(shapeOf({ paths, stroke: null, fillOpacity: 40 })));
        const layer = comp.layer(2);
        assert.strictEqual(layer.property('ADBE Root Vectors Group').numProperties, 1);
        const contents = groupOf(layer, 1).property('ADBE Vectors Group');
        assert.deepStrictEqual([1, 2, 3].map((i) => contents.property(i).matchName),
            ['ADBE Vector Shape - Rect', 'ADBE Vector Shape - Rect', 'ADBE Vector Graphic - Fill']);
        assert.deepStrictEqual(plain(contents.property(1).property('ADBE Vector Rect Size').value), [100, 50]);
        assert.deepStrictEqual(plain(contents.property(2).property('ADBE Vector Rect Position').value), [900, 320]);
        assert.strictEqual(contents.property(2).property('ADBE Vector Rect Roundness').value, 8);
        assert.strictEqual(contents.property(3).property('ADBE Vector Fill Opacity').value, 40);
    });

    test('Import PSD : replaceWithShape, plusieurs sous-tracés avec contour, ou dont un est tourné -> null, calque intact', () => {
        const rect = { type: 'rect', center: [800, 300], size: [100, 50], rotation: 0, roundness: 0 };
        const cases = [
            shapeOf({ paths: [rect, Object.assign({}, rect, { center: [900, 320] })] }),                                 // contour présent
            shapeOf({ paths: [rect, Object.assign({}, rect, { rotation: 20 })], stroke: null }),                         // un sous-tracé tourné
            shapeOf({ paths: [rect, { type: 'ellipse', center: [1, 1], size: [2, 2], rotation: -5 }], stroke: null }),   // idem, ellipse
        ];
        for (const shape of cases) {
            const { comp, st, core, run } = psdScene();
            assert.strictEqual(run(shape), null);
            assert.strictEqual(comp.numLayers, 3);
            assert.strictEqual(comp.layers[1], st);
            assert.strictEqual(core.lastFailure(), null, 'un refus n\'est pas une panne');
        }
    });

    test('Import PSD : replaceWithShape, dégradé -> refus (null) sans rien créer ; panne distincte du refus (lastFailure)', () => {
        const { comp, st, core, run } = psdScene();
        const grad = { type: 'gradient', kind: 'linear', angle: 0, stops: [{ pos: 0, color: [1, 0, 0] }, { pos: 1, color: [0, 0, 1] }], opacityStops: [] };
        assert.strictEqual(run(shapeOf({ fill: grad })), null);
        assert.strictEqual(core.lastFailure(), null, 'refus : pas de panne');
        assert.deepStrictEqual(names(comp), ['Haut', 'Rectangle 1', 'Bas']);
        assert.strictEqual(comp.layers[1], st);
        // panne imprévue (contour sans couleur) : tout est défait, la raison est gardée
        assert.strictEqual(run(shapeOf({ stroke: { width: 2, align: 'center' } })), null);
        const f = core.lastFailure();
        assert.ok(f && typeof f.name === 'string' && f.name.length > 0 && typeof f.message === 'string' && f.message.length > 0);
        assert.strictEqual(comp.numLayers, 3, 'pas de calque de forme à demi construit');
        assert.strictEqual(comp.layers[1], st);
        // l'état est remis à zéro à chaque appel
        assert.ok(run(shapeOf()));
        assert.strictEqual(core.lastFailure(), null);
    });

    test('Import PSD : replaceWithShape, panne en cours de route : calque verrouillé rétabli, original intact', () => {
        const { comp, st, core, run } = psdScene({ layer: { locked: true } });
        assert.strictEqual(run(shapeOf({ stroke: { width: 2, align: 'center' } })), null);
        assert.ok(core.lastFailure());
        assert.strictEqual(comp.layers[1], st);
        assert.strictEqual(st.locked, true);
        assert.strictEqual(comp.numLayers, 3);
    });

    test('Import PSD : replaceWithShape, contour : limite des angles de Photoshop (100)', () => {
        const { comp, run } = psdScene();
        assert.ok(run(shapeOf()));
        assert.strictEqual(itemOf(comp.layer(2), 1, 'ADBE Vector Graphic - Stroke').property('ADBE Vector Stroke Miter Limit').value, 100);
    });

    test('Import PSD : replaceWithShape, modes de fusion PSD -> BlendingMode ; inconnu ou absent d\'After -> null, calque intact', () => {
        const table = { normal: 'NORMAL', multiply: 'MULTIPLY', screen: 'SCREEN', overlay: 'OVERLAY', colorDodge: 'COLOR_DODGE', linearDodge: 'LINEAR_DODGE', luminosity: 'LUMINOSITY' };
        for (const key of Object.keys(table)) {
            const { comp, run } = psdScene();
            assert.ok(run(shapeOf({ blend: key })), key);
            assert.strictEqual(comp.layer(2).blendingMode, BlendingMode[table[key]], key);
        }
        for (const key of ['nimporte', 'subtract']) {   // subtract : énumération absente du faux AE
            const { comp, st, run } = psdScene();
            assert.strictEqual(run(shapeOf({ blend: key })), null, key);
            assert.strictEqual(comp.numLayers, 3);
            assert.strictEqual(comp.layers[1], st);
        }
    });

    test('Import PSD : replaceWithShape, chemin inconnu ou JSON sans boîte -> null, rien de créé', () => {
        const a = psdScene();
        assert.strictEqual(a.run(shapeOf({ paths: [{ type: 'star' }] })), null);
        assert.strictEqual(a.comp.numLayers, 3);
        const b = psdScene();
        assert.strictEqual(b.run(shapeOf({ box: undefined })), null);
        assert.strictEqual(b.comp.numLayers, 3);
        for (const box of [{ left: NaN, top: 272, right: 1620, bottom: 477 }, { left: 759, top: '272', right: 1620, bottom: 477 }, { left: 759, top: 272, right: Infinity, bottom: 477 }, { left: 759 }]) {
            const c = psdScene();
            assert.strictEqual(c.run(shapeOf({ box })), null, JSON.stringify(box));
            assert.strictEqual(c.comp.numLayers, 3);
        }
    });
    // ------------------------------------------------------------------------
    //  Styles de calque (menu Calque › Styles de calque, puis valeurs par matchName)
    // ------------------------------------------------------------------------

    const styleGlow = (over) => Object.assign({ kind: 'outerGlow', scale: 100, blend: 'screen', color: [1, 1, 1], opacity: 43,
        technique: 'softer', size: 8, spread: 5, range: 50, jitter: 10, noise: 3 }, over || {});
    const styleShadow = (over) => Object.assign({ kind: 'dropShadow', scale: 100, blend: 'multiply', color: [0, 0.5, 1], opacity: 60,
        angle: 120, useGlobalLight: true, distance: 6, size: 9, spread: 20, noise: 4, layerConceals: true }, over || {});
    const lsGroup = (layer, g) => layer.property('ADBE Layer Styles').property(g);
    const lsVal = (layer, g, p) => plain(lsGroup(layer, g).property(g + '/' + p).value);
    /** Scène des PSD + un calque de forme vide (index 1) pour tester applyStyles seul. */
    function styleScene() {
        const s = psdScene();
        s.comp.addLayer('Forme', { kind: 'shape' });
        s.comp.layers.unshift(s.comp.layers.pop());
        return Object.assign(s, { shapeLayer: s.comp.layer(1) });
    }

    test('Import PSD : applyStyles, lueur externe -> commande « Outer Glow » lancée une fois, valeurs posées, retour 1', () => {
        const { comp, core, shapeLayer } = styleScene();
        assert.strictEqual(core.applyStyles(comp, shapeLayer, [styleGlow()]), 1);
        assert.deepStrictEqual(app.commands, [9103]);
        assert.strictEqual(lsVal(shapeLayer, 'outerGlow', 'opacity'), 43);
        assert.deepStrictEqual(lsVal(shapeLayer, 'outerGlow', 'color'), [1, 1, 1, 1]);
        assert.strictEqual(lsVal(shapeLayer, 'outerGlow', 'mode2'), BlendingMode.SCREEN);
        assert.strictEqual(lsVal(shapeLayer, 'outerGlow', 'blur'), 8);
        assert.strictEqual(lsVal(shapeLayer, 'outerGlow', 'chokeMatte'), 5);
        assert.strictEqual(lsVal(shapeLayer, 'outerGlow', 'inputRange'), 50);
        assert.strictEqual(lsVal(shapeLayer, 'outerGlow', 'shadingNoise'), 10);
        assert.strictEqual(lsVal(shapeLayer, 'outerGlow', 'noise'), 3);
        assert.strictEqual(lsVal(shapeLayer, 'outerGlow', 'glowTechnique'), 1);
        assert.strictEqual(comp.selection.length, 0, 'sélection rendue vide');
    });

    test('Import PSD : applyStyles, aucun style -> aucune commande, 0', () => {
        const { comp, core, shapeLayer } = styleScene();
        assert.strictEqual(core.applyStyles(comp, shapeLayer, []), 0);
        assert.deepStrictEqual(app.commands, []);
    });

    test('Import PSD : applyStyles, menus d\'une autre langue (noms inconnus) -> 0, sans erreur ni commande', () => {
        const { comp, core, shapeLayer } = styleScene();
        app.menuNames = {};
        assert.strictEqual(core.applyStyles(comp, shapeLayer, [styleGlow(), styleShadow()]), 0);
        assert.deepStrictEqual(app.commands, []);
    });

    test('Import PSD : applyStyles, noms français des menus reconnus', () => {
        const { comp, core, shapeLayer } = styleScene();
        app.menuNames = { 'Lueur externe': 9103, 'Ombre portée': 9101 };
        assert.strictEqual(core.applyStyles(comp, shapeLayer, [styleShadow(), styleGlow()]), 2);
        assert.deepStrictEqual(app.commands, [9101, 9103]);
    });

    test('Import PSD : applyStyles, ombre portée -> mode, couleur, angle (lumière globale), distance, étendue, taille, bruit, creusement', () => {
        const { comp, core, shapeLayer } = styleScene();
        assert.strictEqual(core.applyStyles(comp, shapeLayer, [styleShadow()]), 1);
        const v = (p) => lsVal(shapeLayer, 'dropShadow', p);
        assert.strictEqual(v('mode2'), BlendingMode.MULTIPLY);
        assert.deepStrictEqual(v('color'), [0, 0.5, 1, 1]);
        assert.strictEqual(v('opacity'), 60);
        assert.strictEqual(v('useGlobalAngle'), 0, 'angle toujours local');
        assert.strictEqual(v('localLightingAngle'), 120);
        assert.strictEqual(v('distance'), 6);
        assert.strictEqual(v('chokeMatte'), 20);
        assert.strictEqual(v('blur'), 9);
        assert.strictEqual(v('noise'), 4);
        assert.strictEqual(v('layerConceals'), 1);
    });

    test('Import PSD : applyStyles, les six autres sortes de style, dans l\'ordre donné', () => {
        const { comp, core, shapeLayer } = styleScene();
        const styles = [
            styleShadow({ kind: 'innerShadow', layerConceals: undefined, useGlobalLight: false }),
            styleGlow({ kind: 'innerGlow', source: 'edge', technique: 'precise' }),
            { kind: 'bevelEmboss', scale: 100, blend: 'screen', color: [1, 1, 1], opacity: 75, shadowBlend: 'multiply', shadowColor: [0, 0, 0], shadowOpacity: 50,
                style: 'inner', technique: 'smooth', direction: 'up', angle: 120, altitude: 30, useGlobalLight: true, size: 5, depth: 100, soften: 2 },
            { kind: 'satin', scale: 100, blend: 'multiply', color: [0, 0, 0], opacity: 50, angle: 19, distance: 11, size: 14, invert: true },
            { kind: 'colorOverlay', scale: 100, blend: 'normal', color: [1, 0, 0], opacity: 80 },
            { kind: 'stroke', scale: 100, blend: 'normal', color: [0, 1, 0], opacity: 90, size: 3, position: 'center' },
        ];
        assert.strictEqual(core.applyStyles(comp, shapeLayer, styles), 6);
        assert.deepStrictEqual(app.commands, [9102, 9104, 9105, 9106, 9107, 9109]);
        assert.strictEqual(lsVal(shapeLayer, 'innerShadow', 'useGlobalAngle'), 0);
        assert.strictEqual(lsVal(shapeLayer, 'innerGlow', 'glowTechnique'), 2);
        assert.strictEqual(lsVal(shapeLayer, 'bevelEmboss', 'highlightOpacity'), 75);
        assert.strictEqual(lsVal(shapeLayer, 'bevelEmboss', 'shadowOpacity'), 50);
        assert.strictEqual(lsVal(shapeLayer, 'bevelEmboss', 'shadowMode'), BlendingMode.MULTIPLY);
        assert.strictEqual(lsVal(shapeLayer, 'bevelEmboss', 'localLightingAltitude'), 30);
        assert.strictEqual(lsVal(shapeLayer, 'bevelEmboss', 'strengthRatio'), 100);
        assert.strictEqual(lsVal(shapeLayer, 'bevelEmboss', 'softness'), 2);
        assert.strictEqual(lsVal(shapeLayer, 'chromeFX', 'distance'), 11);
        assert.strictEqual(lsVal(shapeLayer, 'chromeFX', 'invert'), 1);
        assert.deepStrictEqual(lsVal(shapeLayer, 'solidFill', 'color'), [1, 0, 0, 1]);
        assert.strictEqual(lsVal(shapeLayer, 'solidFill', 'opacity'), 80);
        assert.strictEqual(lsVal(shapeLayer, 'frameFX', 'size'), 3);
        assert.strictEqual(lsVal(shapeLayer, 'frameFX', 'style'), 3);
    });

    test('Import PSD : replaceWithShape + lueur externe -> la forme a la lueur (opacité 43), l\'original est supprimé', () => {
        const { comp, st, core, run } = psdScene();
        const out = run(shapeOf({ styles: [styleGlow()] }));
        assert.ok(out);
        assert.strictEqual(core.lastFailure(), null);
        assert.ok(comp.layers.indexOf(st) < 0, 'original supprimé');
        assert.deepStrictEqual(names(comp), ['Haut', 'Rectangle 1', 'Bas']);
        const layer = comp.layer(2);
        assert.strictEqual(lsVal(layer, 'outerGlow', 'opacity'), 43);
        assert.deepStrictEqual(app.commands, [9103]);
        assert.strictEqual(comp.selection.length, 0);
    });

    test('Import PSD : replaceWithShape, menus inconnus -> original gardé, forme retirée, panne notée', () => {
        const { comp, st, core, run } = psdScene();
        app.menuNames = {};
        assert.strictEqual(run(shapeOf({ styles: [styleGlow()] })), null);
        const f = core.lastFailure();
        assert.ok(f && f.message.length > 0, 'systématique : l\'utilisateur doit le voir');
        assert.strictEqual(comp.numLayers, 3);
        assert.strictEqual(comp.layers[1], st);
        assert.strictEqual(comp.selection.length, 0);
    });

    test('Import PSD : replaceWithShape, propriété de style introuvable (matchName faux) -> retour arrière, original gardé, panne notée', () => {
        const defs = require('./fake-ae-props').LAYER_STYLE_DEFS.solidFill;
        const saved = defs.props;
        defs.props = saved.filter((p) => p !== 'opacity');   // le faux After n'a pas « solidFill/opacity »
        try {
            const { comp, st, core, run } = psdScene({ layer: { locked: true } });
            assert.strictEqual(run(shapeOf({ styles: [{ kind: 'colorOverlay', blend: 'normal', color: [1, 0, 0], opacity: 50 }] })), null);
            const f = core.lastFailure();
            assert.ok(f && /solidFill\/opacity/.test(f.message), f && f.message);
            assert.strictEqual(comp.numLayers, 3);
            assert.strictEqual(comp.layers[1], st);
            assert.strictEqual(st.locked, true);
            assert.strictEqual(comp.selection.length, 0);
        } finally {
            defs.props = saved;
        }
    });

    test('Import PSD : replaceWithShape, incrustation en dégradé, style inconnu ou deux styles de même sorte -> refus silencieux', () => {
        const grad = { kind: 'gradientOverlay', scale: 100, blend: 'normal', opacity: 100, angle: 90, reverse: false, gradientType: 'linear',
            gradientScale: 100, align: true, offset: [0, 0], stops: [{ location: 0, color: [0, 0, 0] }, { location: 1, color: [1, 1, 1] }], opacityStops: [] };
        const cases = [[grad], [styleGlow(), grad], [{ kind: 'nimporte' }], [styleGlow(), styleGlow({ opacity: 10 })]];
        for (const styles of cases) {
            const { comp, st, core, run } = psdScene();
            assert.strictEqual(run(shapeOf({ styles })), null);
            assert.strictEqual(core.lastFailure(), null, 'refus, pas panne');
            assert.deepStrictEqual(app.commands, [], 'rien n\'a été lancé');
            assert.strictEqual(comp.numLayers, 3);
            assert.strictEqual(comp.layers[1], st);
        }
    });
    // ---- Tour de correction 1 : champs de style refusés ou reportés, lumière globale, blend de la forme ----

    const bevelOf = (over) => Object.assign({ kind: 'bevelEmboss', scale: 100, blend: 'screen', color: [1, 1, 1], opacity: 75, shadowBlend: 'multiply',
        shadowColor: [0, 0, 0], shadowOpacity: 50, style: 'inner', technique: 'smooth', direction: 'up', angle: 120, altitude: 30,
        useGlobalLight: false, size: 5, depth: 100, soften: 0 }, over || {});

    test('Import PSD : applyStyles, biseautage hors défauts (extérieur, ciseau dur, vers le bas) et lueur interne depuis le centre -> reportés', () => {
        const { comp, core, shapeLayer } = styleScene();
        const styles = [bevelOf({ style: 'strokeEmboss', technique: 'chiselHard', direction: 'down' }), styleGlow({ kind: 'innerGlow', source: 'center' })];
        assert.strictEqual(core.applyStyles(comp, shapeLayer, styles), 2);
        assert.strictEqual(lsVal(shapeLayer, 'bevelEmboss', 'bevelStyle'), 5);
        assert.strictEqual(lsVal(shapeLayer, 'bevelEmboss', 'bevelTechnique'), 2);
        assert.strictEqual(lsVal(shapeLayer, 'bevelEmboss', 'bevelDirection'), 2);
        assert.strictEqual(lsVal(shapeLayer, 'innerGlow', 'innerGlowSource'), 1);
        // valeurs par défaut de Photoshop
        const b = styleScene();
        assert.strictEqual(b.core.applyStyles(b.comp, b.shapeLayer, [bevelOf({ style: 'outer' }), styleGlow({ kind: 'innerGlow', source: 'edge' })]), 2);
        assert.strictEqual(lsVal(b.shapeLayer, 'bevelEmboss', 'bevelStyle'), 1);
        assert.strictEqual(lsVal(b.shapeLayer, 'bevelEmboss', 'bevelTechnique'), 1);
        assert.strictEqual(lsVal(b.shapeLayer, 'bevelEmboss', 'bevelDirection'), 1);
        assert.strictEqual(lsVal(b.shapeLayer, 'innerGlow', 'innerGlowSource'), 2);
    });

    test('Import PSD : replaceWithShape, valeur de style sans équivalent (biseautage, lueur, mode de fusion inconnu) -> refus silencieux', () => {
        const cases = [
            [bevelOf({ style: 'inconnu' })], [bevelOf({ technique: 'inconnu' })], [bevelOf({ direction: 'inconnu' })],
            [styleGlow({ kind: 'innerGlow', source: 'inconnu' })], [styleGlow({ technique: 'inconnu' })],
            [styleGlow({ blend: 'nimporte' })], [styleShadow({ blend: 'Zzzz' })], [bevelOf({ shadowBlend: 'nimporte' })], [bevelOf({ blend: 'subtract' })],
            [{ kind: 'stroke', blend: 'normal', color: [0, 0, 0], opacity: 100, size: 3, position: 'inconnu' }],
        ];
        for (const styles of cases) {
            const { comp, st, core, run } = psdScene();
            assert.strictEqual(run(shapeOf({ styles })), null, JSON.stringify(styles[0]));
            assert.strictEqual(core.lastFailure(), null, 'refus, pas panne');
            assert.deepStrictEqual(app.commands, [], 'rien n\'a été lancé');
            assert.strictEqual(comp.numLayers, 3);
            assert.strictEqual(comp.layers[1], st);
        }
        // un mode connu d'After (« subtract » n'existe pas dans ce faux After, « overlay » si) reste accepté
        const ok = psdScene();
        assert.ok(ok.run(shapeOf({ styles: [styleGlow({ blend: 'overlay' })] })));
    });

    test('Import PSD : lumière globale, l\'angle est toujours écrit en local, « utiliser l\'angle global » coupé', () => {
        const { comp, core, shapeLayer } = styleScene();
        const styles = [styleShadow({ useGlobalLight: true, angle: 90 }), bevelOf({ useGlobalLight: true, angle: 90, altitude: 20 })];
        assert.strictEqual(core.applyStyles(comp, shapeLayer, styles), 2);
        assert.strictEqual(lsVal(shapeLayer, 'dropShadow', 'useGlobalAngle'), 0);
        assert.strictEqual(lsVal(shapeLayer, 'dropShadow', 'localLightingAngle'), 90);
        assert.strictEqual(lsVal(shapeLayer, 'bevelEmboss', 'useGlobalAngle'), 0);
        assert.strictEqual(lsVal(shapeLayer, 'bevelEmboss', 'localLightingAngle'), 90);
        assert.strictEqual(lsVal(shapeLayer, 'bevelEmboss', 'localLightingAltitude'), 20);
    });

    test('Import PSD : applyStyles ignore les entrées nulles et rend la sélection de l\'utilisateur', () => {
        const { comp, core, shapeLayer } = styleScene();
        comp.layer(3).selected = true;
        comp.layer(4).selected = true;
        const before = comp.selectedLayers.map((l) => l.index).sort();
        assert.strictEqual(core.applyStyles(comp, shapeLayer, [null, undefined, styleGlow(), null]), 1);
        assert.deepStrictEqual(comp.selectedLayers.map((l) => l.index).sort(), before);
        assert.strictEqual(comp.selectedLayers.some((l) => l.index === 1), false, 'le calque de forme n\'est pas resté sélectionné');
    });

    test('Import PSD : replaceWithShape sur le vrai PSD (Rectangle 1) n\'est pas refusé pour son mode de fusion ; mul / scrn -> MULTIPLY / SCREEN', () => {
        const reader = require('../extension/client/js/psd/reader.js');
        require('../extension/client/js/psd/styles.js');
        const shapesOf = require('../extension/client/js/psd/shapes.js');
        const bytes = fs.readFileSync(path.join(__dirname, 'fixtures/psd/planche-test.psd'));
        const rect1 = (doc) => shapesOf(doc).filter((s) => s.match.name === 'Rectangle 1' && s.match.nth === 0)[0];
        const real = rect1(reader.read(bytes));
        assert.ok(real, 'forme lue');
        assert.strictEqual(real.blend, 'normal');
        const a = psdScene();
        assert.ok(a.run(real), 'le vrai Rectangle 1 est recréé');
        assert.strictEqual(a.comp.layer(2).blendingMode, BlendingMode.NORMAL);
        for (const [code, mode] of [['mul ', 'MULTIPLY'], ['scrn', 'SCREEN'], ['over', 'OVERLAY'], ['div ', 'COLOR_DODGE'], ['lddg', 'LINEAR_DODGE']]) {
            const doc = reader.read(bytes);
            const layer = doc.layers.filter((l) => l.name === 'Rectangle 1')[0];
            layer.blend = code;
            const shape = rect1(doc);
            const s = psdScene();
            assert.ok(s.run(shape), code);
            assert.strictEqual(s.comp.layer(2).blendingMode, BlendingMode[mode], code);
        }
    });

    // ---- Revue finale : vrais descripteurs jusqu'à l'hôte, taille du métrage, compo active, limite des angles ----

    test('Import PSD : C1, lueur externe en code Photoshop (Md = Scrn) -> shapes() -> replaceWithShape pose une lueur en SCREEN', () => {
        const reader = require('../extension/client/js/psd/reader.js');
        require('../extension/client/js/psd/styles.js');
        const shapesOf = require('../extension/client/js/psd/shapes.js');
        const doc = reader.read(fs.readFileSync(path.join(__dirname, 'fixtures/psd/planche-test.psd')));
        const layer = doc.layers.filter((l) => l.name === 'Rectangle 1')[0];
        const linear = { _class: 'ShpC', 'Nm  ': 'Linéaire', 'Crv ': [{ _class: 'CrPt', Hrzn: 0, Vrtc: 0 }, { _class: 'CrPt', Hrzn: 255, Vrtc: 255 }] };
        layer.blocks.lfx2 = { _class: 'null', masterFXSwitch: true, OrGl: {
            _class: 'OrGl', enab: true, present: true, 'Md  ': { enum: 'BlnM', v: 'Scrn' },
            'Clr ': { _class: 'RGBC', 'Rd  ': 255, 'Grn ': 255, 'Bl  ': 255 }, Opct: { unit: '#Prc', v: 43 },
            GlwT: { enum: 'BETE', v: 'SfBL' }, Ckmt: { unit: '#Pxl', v: 0 }, blur: { unit: '#Pxl', v: 29 }, TrnS: linear,
        } };
        const shape = shapesOf(doc).filter((s) => s.match.name === 'Rectangle 1')[0];
        assert.ok(shape, 'forme lue');
        const { comp, core, run } = psdScene();
        assert.ok(run(shape), 'forme recréée');
        assert.strictEqual(core.lastFailure(), null);
        assert.strictEqual(lsVal(comp.layer(2), 'outerGlow', 'mode2'), BlendingMode.SCREEN);
        assert.strictEqual(lsVal(comp.layer(2), 'outerGlow', 'opacity'), 43);
    });

    test('Import PSD : C1, « Rectangle » de 7.psd (lueur en Écran) passe les contrôles de l\'hôte (sauté si le fichier manque)', () => {
        const REAL = process.env.SIMING_PSD_SAMPLES ? process.env.SIMING_PSD_SAMPLES + '/7.psd' : '';
        if (!fs.existsSync(REAL)) return;
        const reader = require('../extension/client/js/psd/reader.js');
        require('../extension/client/js/psd/styles.js');
        const shapesOf = require('../extension/client/js/psd/shapes.js');
        const shape = shapesOf(reader.read(fs.readFileSync(REAL))).filter((s) => s.match.name === 'Rectangle ')[0];
        assert.ok(shape, 'forme lue');
        assert.deepStrictEqual(shape.styles.map((st) => [st.kind, st.blend]), [['outerGlow', 'screen']]);
        const { comp, core, run } = psdScene({ size: [shape.box.right - shape.box.left, shape.box.bottom - shape.box.top] });
        assert.ok(run(shape), 'non refusé');
        assert.strictEqual(core.lastFailure(), null);
        assert.strictEqual(lsVal(comp.layer(2), 'outerGlow', 'mode2'), BlendingMode.SCREEN);
    });

    test('Import PSD : I4, métrage d\'une autre taille que la boîte du PSD -> panne visible, calque PSD gardé ; 1 px toléré', () => {
        for (const size of [[900, 205], [861, 240], [863, 205]]) {
            const { comp, st, core, run } = psdScene({ size });
            assert.strictEqual(run(shapeOf()), null, JSON.stringify(size));
            const f = core.lastFailure();
            assert.ok(f && f.name === 'Mismatch' && /boîte/.test(f.message), JSON.stringify(f));
            assert.strictEqual(comp.numLayers, 3, 'rien de créé');
            assert.strictEqual(comp.layers[1], st);
        }
        for (const size of [[862, 204], [860, 206]]) {
            const { core, run } = psdScene({ size });
            assert.ok(run(shapeOf()), 'anticrénelage : ' + JSON.stringify(size));
            assert.strictEqual(core.lastFailure(), null);
        }
        // pas un métrage (source absente) : panne aussi
        const { core, run } = psdScene({ layer: { source: null } });
        assert.strictEqual(run(shapeOf()), null);
        assert.strictEqual(core.lastFailure().name, 'Mismatch');
    });

    test('Import PSD : I4, importBatch, métrage plus grand que la boîte (styles fusionnés par After) -> « forme en erreur »', () => {
        const { call } = importScene();
        app.importRecipes[PSD_A] = { layers: [{ name: 'Rectangle 1', size: [1021, 365] }] };
        const r = call('importBatch', { items: [{ path: PSD_A, shapes: [shapeOf()] }], rules: RULES });
        assert.strictEqual(r.status.text, '1 PSD importé · 0 textes · 0 formes · 1 forme en erreur · Ctrl+Z pour annuler');
        assert.deepStrictEqual(kinds(itemById(r.imported[0].compId)), ['av'], 'le calque PSD reste');
    });

    test('Import PSD : I5, compo restée hors du viewer -> PSD illisible, rien lancé, la compo active d\'avant intacte', () => {
        const real = FakeComp.prototype.openInViewer;
        FakeComp.prototype.openInViewer = function () { app.viewerOpens.push(this.id); return null; };   // le viewer ne change pas
        try {
            const { call, before } = importScene();
            before.addLayer('Animé', { psdText: 'Animé' });
            before.select(before.layers[0]);
            const r = call('importBatch', { items: [{ path: PSD_A, shapes: [shapeOf({ styles: [styleGlow()] })] }], rules: RULES });
            assert.deepStrictEqual(r.status, { text: '0 PSD importés · 0 textes · 0 formes · 1 PSD illisible · Ctrl+Z pour annuler', level: 'warn' });
            assert.deepStrictEqual(app.commands, [], 'aucune commande de menu');
            assert.deepStrictEqual(kinds(before), ['av'], 'compo d\'avant intacte');
            assert.deepStrictEqual(app.project.items.map((it) => it.name), ['Avant'], 'import retiré');
        } finally {
            FakeComp.prototype.openInViewer = real;
        }
    });

    test('Import PSD : I5, applyStyles refuse de lancer un menu si la compo active n\'est pas celle du calque', () => {
        const { comp, st, core, run } = psdScene();
        const other = new FakeComp(77, 'Autre');
        app.project.activeItem = other;
        assert.strictEqual(run(shapeOf({ styles: [styleGlow()] })), null);
        assert.ok(core.lastFailure(), 'panne visible');
        assert.deepStrictEqual(app.commands, []);
        assert.strictEqual(comp.layers[1], st);
        assert.strictEqual(comp.numLayers, 3);
    });

    test('Import PSD : M6, limite des angles du contour reprise du PSD', () => {
        const { comp, run } = psdScene();
        assert.ok(run(shapeOf({ stroke: { width: 2, color: [1, 0.5, 0], align: 'center', miterLimit: 4 } })));
        assert.strictEqual(itemOf(comp.layer(2), 1, 'ADBE Vector Graphic - Stroke').property('ADBE Vector Stroke Miter Limit').value, 4);
    });

    // ------------------------------------------------------------------------
    //  importBatch : import du lot (compo, formes, textes, libellés), sur le faux importFile
    // ------------------------------------------------------------------------

    const PSD_A = path.join(os.tmpdir(), 'siming-import-test', '1.psd');
    const PSD_B = path.join(os.tmpdir(), 'siming-import-test', '2.psd');
    const RULES = { words: [], types: { shape: 5, text: 6, precomp: 7, image: 8 } };
    const TEXTS_ONLY = { 'Convert to Editable Text': 3799 };   // After sans les menus de styles de calque

    /** Projet avec une compo « Avant » active ; `importRecipes` fabrique la compo importée de chaque chemin
     *  (par défaut : compo « <nom> » > précompo « <nom> » > Rectangle 1, PourQUOI ???, Calque 0). */
    function importScene() {
        const { call } = host();
        app.undoGroups = [];
        app.commands = [];
        const before = new FakeComp(50, 'Avant');
        app.project.items.push(before);
        app.project.activeItem = before;
        return { call, before };
    }
    const itemById = (id) => app.project.items.filter((it) => it.id === id)[0];
    const folders = (name) => app.project.items.filter((it) => it instanceof FolderItem && it.name === name);
    const kinds = (comp) => comp.layers.map((s) => s.kind);
    const fillOf = (layer) => plain(itemOf(layer, 1, 'ADBE Vector Graphic - Fill').property('ADBE Vector Fill Color').value);

    test('Import PSD : importBatch importe la compo, remplace la forme, convertit le texte, pose les libellés, un seul groupe d\'annulation', () => {
        const { call, before } = importScene();
        const r = call('importBatch', { items: [{ path: PSD_A, shapes: [shapeOf()] }], rules: RULES });
        assert.deepStrictEqual(r.status, { text: '1 PSD importé · 1 texte · 1 forme · Ctrl+Z pour annuler', level: 'ok' });
        assert.deepStrictEqual(app.undoGroups, ['Boîte à outils : importer les PSD']);
        assert.strictEqual(app.undoDepth, 0);
        assert.strictEqual(r.imported.length, 1);
        assert.strictEqual(r.imported[0].name, '1');
        const outer = itemById(r.imported[0].compId);
        assert.ok(outer instanceof CompItem);
        const inner = outer.layers[0].source;
        assert.ok(inner instanceof CompItem && inner.id !== outer.id, 'la précompo du groupe');
        assert.deepStrictEqual(inner.layers.map((s) => s.name), ['Rectangle 1', 'PourQUOI ???', 'Calque 0']);
        assert.deepStrictEqual(kinds(inner), ['shape', 'text', 'av']);
        assert.strictEqual(inner.layers[1].text, 'PourQUOI ???');
        // libellés d'après les règles, sur tous les calques des compos importées
        assert.deepStrictEqual(inner.layers.map((s) => s.label), [5, 6, 8]);
        assert.strictEqual(outer.layers[0].label, 7);
        // panneau Projet : dossier 02_ASSET créé à la racine, compo et dossier « 1 Calques » dedans
        const asset = folders('02_ASSET');
        assert.strictEqual(asset.length, 1);
        assert.strictEqual(asset[0].parentFolder, null, 'à la racine');
        assert.strictEqual(outer.parentFolder, asset[0]);
        assert.strictEqual(folders('1 Calques').length, 1);
        assert.strictEqual(folders('1 Calques')[0].parentFolder, asset[0]);
        // la compo active d'origine est rouverte
        assert.strictEqual(app.project.activeItem, before);
        assert.ok(app.viewerOpens.indexOf(inner.id) >= 0, 'les textes se convertissent dans la compo ouverte dans le viewer');
        assert.strictEqual(before.layers.length, 0, 'rien n\'a été fait dans la compo qui était active');
    });

    test('Import PSD : importBatch, à la fin, ancre de chaque calque au centre de sa boîte, sans rien déplacer ; calque verrouillé laissé', () => {
        const { call } = importScene();
        app.importRecipes[PSD_A] = { layers: [{ name: '1', group: { layers: [{ name: 'Rectangle 1' }, { name: 'Calque 0' }, { name: 'Fixe', locked: true }] } }] };
        const ref = new FakeComp(999, 'Réf').addLayer('Réf');      // transformation d'un calque neuf, avant l'ancre
        const tr0 = (st, m) => plain(st.transform.children.find((c) => c.matchName === m).value);
        const pos0 = tr0(ref, 'ADBE Position'), anc0 = tr0(ref, 'ADBE Anchor Point');
        const r = call('importBatch', { items: [{ path: PSD_A, shapes: [shapeOf()] }], rules: RULES });
        const outer = itemById(r.imported[0].compId), inner = outer.layers[0].source;
        const trOf = (comp, i) => comp.layer(i).property('ADBE Transform Group');
        const centre = (comp, i) => { const b = comp.layer(i).sourceRectAtTime(0, false); return [b.left + b.width / 2, b.top + b.height / 2]; };
        for (const [comp, i] of [[outer, 1], [inner, 1], [inner, 2]]) {
            assert.deepStrictEqual(plain(trOf(comp, i).property('ADBE Anchor Point').value).slice(0, 2), centre(comp, i), comp.name + ' ' + i);
        }
        // Calque 0 (métrage) : position - ancre inchangée, donc rien n'a bougé à l'écran
        const pos = plain(trOf(inner, 2).property('ADBE Position').value), anc = plain(trOf(inner, 2).property('ADBE Anchor Point').value);
        assert.deepStrictEqual([pos[0] - anc[0], pos[1] - anc[1]], [pos0[0] - anc0[0], pos0[1] - anc0[1]]);
        // verrouillé : pas touché
        assert.deepStrictEqual(plain(trOf(inner, 3).property('ADBE Anchor Point').value), anc0);
    });

    /** Précompo « Groupe » (1920 × 1080, dans le projet) affichée dans « Planche » par un calque verrouillé, ancre et
     *  position au centre. layers : [{ name, rect, pos, parent? }] dans la précompo (ancre [0, 0]). */
    function cropScene(layers) {
        const { sandbox } = host();
        app.project.items = [];
        const sub = new FakeComp(500, 'Groupe');
        const main = new FakeComp(501, 'Planche');
        app.project.items.push(sub, main);
        const states = {};
        for (const l of layers) {
            const st = sub.addLayer(l.name, { rect: l.rect });
            setState(st, 'ADBE Position', l.pos);
            if (l.parent) st.parent = states[l.parent];
            states[l.name] = st;
        }
        const holder = main.addLayer('Groupe', { source: sub, locked: true });
        setState(holder, 'ADBE Anchor Point', [960, 540]);
        setState(holder, 'ADBE Position', [960, 540]);
        const core = sandbox.SIMING.getTool('psdimport')._core;
        return { sub, main, states, holder, crop: () => core.cropPrecomp(sub, [main.layer(1)]) };
    }
    const valueOf = (st, m) => plain(st.transform.children.find((c) => c.matchName === m).value);

    test('Import PSD : cropPrecomp, la précompo prend la taille de son contenu, rien ne bouge dans la planche', () => {
        const { sub, states, holder, crop } = cropScene([
            { name: 'A', rect: { left: 0, top: 0, width: 100, height: 100 }, pos: [300, 400] },
            { name: 'B', rect: { left: 0, top: 0, width: 50, height: 20 }, pos: [700, 200] },
            { name: 'Enfant', rect: { left: 0, top: 0, width: 10, height: 10 }, pos: [20, 20], parent: 'A' },
        ]);
        assert.strictEqual(crop(), true);
        assert.deepStrictEqual([sub.width, sub.height], [450, 300], 'de 300, 200 à 750, 500');
        assert.deepStrictEqual(valueOf(states.A, 'ADBE Position'), [0, 200]);
        assert.deepStrictEqual(valueOf(states.B, 'ADBE Position'), [400, 0]);
        assert.deepStrictEqual(valueOf(states.Enfant, 'ADBE Position'), [20, 20], 'un enfant suit son parent');
        // ancre reposée (After l'aurait remise à l'échelle), position inchangée : A est toujours en 300, 400 dans la planche
        assert.deepStrictEqual(valueOf(holder, 'ADBE Anchor Point'), [660, 340]);
        assert.deepStrictEqual(valueOf(holder, 'ADBE Position'), [960, 540]);
        assert.strictEqual(holder.locked, true, 'verrou rétabli');
    });

    test('Import PSD : cropPrecomp, le contenu qui dépasse de la compo reste coupé ; compo déjà pleine -> rien', () => {
        const over = cropScene([{ name: 'A', rect: { left: 0, top: 0, width: 200, height: 100 }, pos: [1800, -50] }]);
        assert.strictEqual(over.crop(), true);
        assert.deepStrictEqual([over.sub.width, over.sub.height], [120, 50], 'de 1800, 0 à 1920, 50');
        const full = cropScene([{ name: 'Fond', rect: { left: 0, top: 0, width: 1920, height: 1080 }, pos: [0, 0] }]);
        assert.strictEqual(full.crop(), false);
        assert.deepStrictEqual([full.sub.width, full.sub.height], [1920, 1080]);
        assert.deepStrictEqual(valueOf(full.holder, 'ADBE Anchor Point'), [960, 540]);
    });

    test('Import PSD : importBatch, sans forme (shapes null) les textes et libellés se font quand même', () => {
        const { call } = importScene();
        const r = call('importBatch', { items: [{ path: PSD_A, shapes: null }], rules: RULES });
        assert.strictEqual(r.status.text, '1 PSD importé · 1 texte · 0 formes · Ctrl+Z pour annuler');
        const inner = itemById(r.imported[0].compId).layers[0].source;
        assert.deepStrictEqual(kinds(inner), ['av', 'text', 'av']);
        assert.deepStrictEqual(inner.layers.map((s) => s.label), [8, 6, 8]);
    });

    test('Import PSD : importBatch, un item avec error compte comme PSD illisible, statut en avertissement', () => {
        const { call } = importScene();
        const r = call('importBatch', { items: [{ path: PSD_B, shapes: null, error: 'PSD illisible' }, { path: PSD_A, shapes: [shapeOf()] }], rules: RULES });
        assert.deepStrictEqual(r.status, { text: '1 PSD importé · 1 texte · 1 forme · 1 PSD illisible · Ctrl+Z pour annuler', level: 'warn' });
        assert.deepStrictEqual(r.imported.map((i) => i.name), ['1']);
        assert.deepStrictEqual(app.undoGroups, ['Boîte à outils : importer les PSD']);
    });

    test('Import PSD : importBatch, tous illisibles -> rien dans le projet, pas de groupe d\'annulation, pas de Ctrl+Z', () => {
        const { call, before } = importScene();
        const r = call('importBatch', { items: [{ path: PSD_A, shapes: null, error: 'x' }, { shapes: null }], rules: RULES });
        assert.deepStrictEqual(r.status, { text: '0 PSD importés · 0 textes · 0 formes · 2 PSD illisibles', level: 'warn' });
        assert.deepStrictEqual(r.imported, []);
        assert.deepStrictEqual(app.undoGroups, []);
        assert.strictEqual(folders('02_ASSET').length, 0);
        assert.strictEqual(app.project.numItems, 1);
        assert.strictEqual(app.project.activeItem, before);
        assert.deepStrictEqual(call('importBatch', { items: [], rules: RULES }).status, { text: '0 PSD importés · 0 textes · 0 formes', level: 'ok' });
    });

    test('Import PSD : importBatch, une exception d\'After sur un PSD le compte illisible et le lot continue', () => {
        const { call, before } = importScene();
        app.importRecipes[PSD_A] = { throws: 'File format not supported' };
        const r = call('importBatch', { items: [{ path: PSD_A, shapes: null }, { path: PSD_B, shapes: [shapeOf()] }], rules: RULES });
        assert.deepStrictEqual(r.status, { text: '1 PSD importé · 1 texte · 1 forme · 1 PSD illisible · Ctrl+Z pour annuler', level: 'warn' });
        assert.deepStrictEqual(r.imported.map((i) => i.name), ['2']);
        assert.strictEqual(app.undoDepth, 0, 'groupe d\'annulation fermé');
        assert.strictEqual(app.project.activeItem, before);
    });

    test('Import PSD : importBatch, deux PSD s\'additionnent et partagent un seul dossier 02_ASSET', () => {
        const { call } = importScene();
        const r = call('importBatch', { items: [{ path: PSD_A, shapes: [shapeOf()] }, { path: PSD_B, shapes: [shapeOf()] }], rules: RULES });
        assert.strictEqual(r.status.text, '2 PSD importés · 2 textes · 2 formes · Ctrl+Z pour annuler');
        assert.deepStrictEqual(r.imported.map((i) => i.name), ['1', '2']);
        assert.strictEqual(folders('02_ASSET').length, 1);
        assert.ok(r.imported.every((i) => itemById(i.compId).parentFolder === folders('02_ASSET')[0]));
        assert.deepStrictEqual(app.undoGroups, ['Boîte à outils : importer les PSD']);
    });

    test('Import PSD : importBatch, rang nth dans le parcours en profondeur (précompo à sa place, autre fichier et groupes non comptés)', () => {
        const { call } = importScene();
        app.importRecipes[PSD_A] = { layers: [
            { name: 'Rectangle 1' },                                                       // rang 0
            { name: 'Groupe', group: { layers: [{ name: 'Rectangle 1' }, { name: 'Fond' }] } },   // son Rectangle 1 : rang 1
            { name: 'Rectangle 1', from: 'autre.psd' },                                   // autre fichier : pas compté
            { name: 'Rectangle 1' },                                                       // rang 2
        ] };
        const red = { type: 'solid', color: [1, 0, 0] }, green = { type: 'solid', color: [0, 1, 0] };
        const r = call('importBatch', { items: [{ path: PSD_A, shapes: [
            shapeOf({ match: { name: 'Rectangle 1', nth: 1 }, fill: green }),
            shapeOf({ match: { name: 'Rectangle 1', nth: 2 }, fill: red }),
        ] }], rules: RULES });
        assert.strictEqual(r.status.text, '1 PSD importé · 0 textes · 2 formes · Ctrl+Z pour annuler');
        const outer = itemById(r.imported[0].compId);
        const inner = outer.layers[1].source;
        assert.deepStrictEqual(kinds(outer), ['av', 'av', 'av', 'shape']);
        assert.deepStrictEqual(kinds(inner), ['shape', 'av']);
        assert.deepStrictEqual(fillOf(inner.layer(1)), [0, 1, 0, 1]);
        assert.deepStrictEqual(fillOf(outer.layer(4)), [1, 0, 0, 1]);
        assert.strictEqual(outer.layers[2].name, 'Rectangle 1', 'celui d\'un autre fichier est resté');
    });

    test('Import PSD : importBatch, le nom du métrage est coupé au DERNIER « / »', () => {
        const { call } = importScene();
        app.importRecipes[PSD_A] = { layers: [{ name: 'A/B' }, { name: 'A/B' }] };
        const r = call('importBatch', { items: [{ path: PSD_A, shapes: [shapeOf({ match: { name: 'A/B', nth: 1 } })] }], rules: RULES });
        assert.strictEqual(r.status.text, '1 PSD importé · 0 textes · 1 forme · Ctrl+Z pour annuler');
        assert.deepStrictEqual(kinds(itemById(r.imported[0].compId)), ['av', 'shape']);
    });

    test('Import PSD : importBatch, refus voulu jamais cité, panne imprévue comptée « forme en erreur » (calque PSD gardé)', () => {
        const refusal = importScene();
        const gradient = shapeOf({ fill: { type: 'gradient' } });
        const a = refusal.call('importBatch', { items: [{ path: PSD_A, shapes: [gradient] }], rules: RULES });
        assert.deepStrictEqual(a.status, { text: '1 PSD importé · 1 texte · 0 formes · Ctrl+Z pour annuler', level: 'ok' });

        app.reset();
        const { call } = importScene();
        app.menuNames = TEXTS_ONLY;      // pas de menu de styles : panne systématique de la forme à styles
        const b = call('importBatch', { items: [{ path: PSD_A, shapes: [shapeOf({ styles: [styleGlow()] })] }], rules: RULES });
        assert.deepStrictEqual(b.status, { text: '1 PSD importé · 1 texte · 0 formes · 1 forme en erreur · Ctrl+Z pour annuler', level: 'warn' });
        const inner = itemById(b.imported[0].compId).layers[0].source;
        assert.deepStrictEqual(kinds(inner), ['av', 'text', 'av'], 'le calque PSD reste');
        // refus et panne mêlés, avec un PSD illisible : l'ordre des morceaux est fixe
        app.reset();
        const c = importScene();
        app.menuNames = TEXTS_ONLY;
        const m = c.call('importBatch', { items: [{ path: PSD_B, shapes: null, error: 'x' }, { path: PSD_A, shapes: [shapeOf({ styles: [styleGlow()] })] }], rules: RULES });
        assert.strictEqual(m.status.text, '1 PSD importé · 1 texte · 0 formes · 1 PSD illisible · 1 forme en erreur · Ctrl+Z pour annuler');
    });

    test('Import PSD : importBatch, dossier 02_ASSET : celui de la racine d\'abord, puis n\'importe où, sinon créé à la racine', () => {
        const rootAsset = new FolderItem('02_ASSET');
        const divers = new FolderItem('Divers');
        const nested = new FolderItem('02_ASSET', divers);
        // les deux existent : celui de la racine
        const both = importScene();
        app.project.items.push(divers, nested, rootAsset);
        const a = both.call('importBatch', { items: [{ path: PSD_A, shapes: null }], rules: RULES });
        assert.strictEqual(itemById(a.imported[0].compId).parentFolder, rootAsset);
        assert.strictEqual(folders('02_ASSET').length, 2, 'rien de créé');
        // seulement l'imbriqué
        app.reset();
        const only = importScene();
        app.project.items.push(divers, nested);
        const b = only.call('importBatch', { items: [{ path: PSD_A, shapes: null }], rules: RULES });
        assert.strictEqual(itemById(b.imported[0].compId).parentFolder, nested);
        assert.strictEqual(folders('02_ASSET').length, 1, 'rien de créé');
    });

    test('Import PSD : importBatch, sans compo active au départ, ne plante pas', () => {
        const { call } = importScene();
        app.project.activeItem = null;
        const r = call('importBatch', { items: [{ path: PSD_A, shapes: [shapeOf()] }], rules: RULES });
        assert.strictEqual(r.status.text, '1 PSD importé · 1 texte · 1 forme · Ctrl+Z pour annuler');
    });

    test('Import PSD : importBatch, calque verrouillé : la forme et le texte sont traités comme ailleurs', () => {
        const { call } = importScene();
        app.importRecipes[PSD_A] = { layers: [{ name: 'Rectangle 1', locked: true }, { name: 'Titre', psdText: 'Titre' }] };
        const r = call('importBatch', { items: [{ path: PSD_A, shapes: [shapeOf()] }], rules: RULES });
        const outer = itemById(r.imported[0].compId);
        assert.deepStrictEqual(kinds(outer), ['shape', 'text']);
        assert.strictEqual(outer.layers[0].locked, true, 'verrou reporté sur la forme');
        assert.strictEqual(r.status.text, '1 PSD importé · 1 texte · 1 forme · Ctrl+Z pour annuler');
    });

    test('Import PSD : importBatch, les styles de calque se posent sur la forme dans la compo importée (viewer), pas dans la compo active d\'avant', () => {
        const { call, before } = importScene();
        const r = call('importBatch', { items: [{ path: PSD_A, shapes: [shapeOf({ styles: [styleGlow()] })] }], rules: RULES });
        assert.strictEqual(r.status.text, '1 PSD importé · 1 texte · 1 forme · Ctrl+Z pour annuler');
        const inner = itemById(r.imported[0].compId).layers[0].source;
        assert.strictEqual(lsVal(inner.layer(1), 'outerGlow', 'opacity'), 43);
        assert.strictEqual(before.layers.length, 0);
        assert.strictEqual(app.project.activeItem, before);
    });

    test('Import PSD : importBatch, commande « Convertir en texte modifiable » introuvable -> signalé une seule fois pour le lot, avertissement', () => {
        const { call } = importScene();
        app.menuNames = {};
        const one = call('importBatch', { items: [{ path: PSD_A, shapes: [shapeOf()] }], rules: RULES });
        assert.deepStrictEqual(one.status, { text: '1 PSD importé · 0 textes · 1 forme · textes non convertis (commande introuvable dans cette langue d\'After Effects) · Ctrl+Z pour annuler', level: 'warn' });
        assert.deepStrictEqual(kinds(itemById(one.imported[0].compId).layers[0].source), ['shape', 'av', 'av']);
        const two = call('importBatch', { items: [{ path: PSD_A, shapes: null }, { path: PSD_B, shapes: null, error: 'x' }, { path: PSD_B, shapes: null }], rules: RULES });
        assert.strictEqual(two.status.text, '2 PSD importés · 0 textes · 0 formes · 1 PSD illisible · textes non convertis (commande introuvable dans cette langue d\'After Effects) · Ctrl+Z pour annuler');
        // rien à convertir (aucun calque de métrage PSD) : pas de manque signalé
        app.importRecipes[PSD_B] = { layers: [{ name: 'Vide', group: { layers: [] } }] };
        const none = call('importBatch', { items: [{ path: PSD_B, shapes: null }], rules: RULES });
        assert.deepStrictEqual(none.status, { text: '1 PSD importé · 0 textes · 0 formes · Ctrl+Z pour annuler', level: 'ok' });
    });

    test('Import PSD : importBatch, « formes en erreur » au pluriel', () => {
        const { call } = importScene();
        app.menuNames = TEXTS_ONLY;
        app.importRecipes[PSD_A] = { layers: [{ name: 'Rectangle 1' }, { name: 'Rectangle 1' }] };
        const r = call('importBatch', { items: [{ path: PSD_A, shapes: [
            shapeOf({ styles: [styleGlow()] }), shapeOf({ match: { name: 'Rectangle 1', nth: 1 }, styles: [styleGlow()] }),
        ] }], rules: RULES });
        assert.strictEqual(r.status.text, '1 PSD importé · 0 textes · 0 formes · 2 formes en erreur · Ctrl+Z pour annuler');
    });

    test('Import PSD : importBatch, une exception APRÈS l\'import retire ce que ce PSD a créé (compos, métrages, « N Calques », 02_ASSET neuf) et le compte illisible', () => {
        const real = FakeComp.prototype.openInViewer;
        FakeComp.prototype.openInViewer = function () {
            if (this.name === '1') throw new Error('viewer indisponible');
            return real.call(this);
        };
        try {
            // seul PSD : le projet retrouve son état d'avant
            const { call, before } = importScene();
            const alone = call('importBatch', { items: [{ path: PSD_A, shapes: [shapeOf()] }], rules: RULES });
            assert.deepStrictEqual(alone.status, { text: '0 PSD importés · 0 textes · 0 formes · 1 PSD illisible · Ctrl+Z pour annuler', level: 'warn' });
            assert.deepStrictEqual(alone.imported, []);
            assert.deepStrictEqual(app.project.items.map((it) => it.name), ['Avant']);
            assert.strictEqual(app.project.activeItem, before);
            assert.strictEqual(app.undoDepth, 0);
            // avec un second PSD : lui seul reste, dans un 02_ASSET recréé
            app.reset();
            const s = importScene();
            const both = s.call('importBatch', { items: [{ path: PSD_A, shapes: null }, { path: PSD_B, shapes: [shapeOf()] }], rules: RULES });
            assert.strictEqual(both.status.text, '1 PSD importé · 1 texte · 1 forme · 1 PSD illisible · Ctrl+Z pour annuler');
            assert.deepStrictEqual(app.project.items.map((it) => it.name).sort(), ['02_ASSET', '2', '2', '2 Calques', 'Avant', 'Calque 0/2.psd', 'PourQUOI ???/2.psd', 'Rectangle 1/2.psd']);
            assert.strictEqual(folders('02_ASSET').length, 1);
            assert.strictEqual(itemById(both.imported[0].compId).parentFolder, folders('02_ASSET')[0]);
        } finally {
            FakeComp.prototype.openInViewer = real;
        }
    });
};
