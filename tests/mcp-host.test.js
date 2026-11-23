'use strict';
/* Claude Code, cœur hôte (host/tools/mcp.jsx) : exécuter du code, lire projet, comp, propriétés, frame. */
const assert = require('assert');
const fs = require('fs');
const { loadHost, callHost, scene, labelScene, app } = require('./helpers');

const call = (sandbox, fn, args) => {
    const env = callHost(sandbox, 'mcp', fn, args);
    if (!env.ok) throw new Error(env.error.message);
    return env.data;
};

module.exports = function (test) {
    test('mcp.run : valeur de retour, journal, un seul groupe d\'annulation nommé', () => {
        const { sandbox } = loadHost();
        const s = scene();
        const r = call(sandbox, 'run', {
            code: 'var c = app.project.activeItem; log("calques", c.numLayers); log({ a: [1, 2] });\n' +
                  'c.layer(1).name = "Racine"; return { nom: c.name, n: c.numLayers, liste: [true, null] };',
            undoName: 'Renommer le parent',
        });
        assert.strictEqual(r.ok, true);
        assert.deepEqual(r.value, { nom: 'Comp 1', n: 5, liste: [true, null] });
        assert.deepEqual(r.logs, ['calques 5', '{"a":[1,2]}']);
        assert.strictEqual(r.undo, 'Claude : Renommer le parent');
        assert.deepEqual(app.undoGroups, ['Claude : Renommer le parent']);
        assert.strictEqual(app.undoDepth, 0);
        assert.strictEqual(s.P.name, 'Racine');
    });

    test('mcp.run : objets d\'After Effects décrits, nombres exacts, fonctions, sans retour = null', () => {
        const { sandbox } = loadHost();
        scene();
        const r = call(sandbox, 'run', { code: 'var c = app.project.activeItem; return { calque: c.layer(2), tiers: 1 / 3, f: function () {} };' });
        assert.strictEqual(r.value.calque.name, 'A');
        assert.strictEqual(r.value.calque.index, 2);
        assert.ok(r.value.calque.$type, 'type de l\'objet');
        assert.strictEqual(r.value.tiers, 1 / 3, 'pas d\'arrondi sur les valeurs de Claude');
        assert.ok(!('f' in r.value), 'fonction d\'un objet omise');
        assert.deepEqual(call(sandbox, 'run', { code: 'return [function () {}];' }).value, ['[fonction]']);
        assert.strictEqual(call(sandbox, 'run', { code: 'var x = 1;' }).value, null);
        assert.strictEqual(call(sandbox, 'run', { code: 'return app.project.activeItem.layer(1).transform.property("ADBE Position").value;' }).value.length, 2);
    });

    test('mcp.run : erreur d\'exécution rendue avec le journal, groupe fermé ; syntaxe ; code vide', () => {
        const { sandbox } = loadHost();
        scene();
        const r = call(sandbox, 'run', { code: 'log("avant"); app.project.activeItem.layer(99);' });
        assert.strictEqual(r.ok, false);
        assert.ok(/out of range/.test(r.error), r.error);
        assert.deepEqual(r.logs, ['avant']);
        assert.strictEqual(app.undoDepth, 0);
        const bad = call(sandbox, 'run', { code: 'var = ;' });
        assert.strictEqual(bad.ok, false);
        assert.strictEqual(bad.syntax, true);
        assert.ok(/^Erreur de syntaxe/.test(bad.error));
        assert.strictEqual(call(sandbox, 'run', { code: '   ' }).error, 'Code vide');
    });

    test('mcp.run : journal borné, nom d\'annulation nettoyé', () => {
        const { sandbox, S } = loadHost();
        const r = call(sandbox, 'run', { code: 'for (var i = 0; i < 510; i++) log(i);' });
        assert.strictEqual(r.logs.length, 501);
        assert.strictEqual(r.logs[500], '… 10 ligne(s) de journal en plus');
        const core = S.getTool('mcp')._core;
        assert.strictEqual(core.undoName('  ligne 1\nligne 2 '), 'Claude : ligne 1 ligne 2');
        assert.strictEqual(core.undoName(''), 'Claude : script');
        assert.ok(core.undoName('x'.repeat(100)).length < 75);
    });

    test('mcp.project : éléments, nature, dossier, comp active, filtres et limite', () => {
        const { sandbox } = loadHost();
        const { comp } = labelScene();
        const p = call(sandbox, 'project', {});
        assert.strictEqual(p.open, true);
        assert.deepEqual(p.activeItem, { id: 400, name: 'Pub', kind: 'comp' });
        const pub = p.items.find((it) => it.id === 400);
        assert.deepEqual([pub.kind, pub.width, pub.height, pub.frameRate, pub.numLayers], ['comp', 1920, 1080, 25, comp.numLayers]);
        assert.strictEqual(p.matched, p.items.length);
        assert.strictEqual(p.truncated, undefined);
        const comps = call(sandbox, 'project', { kind: 'comp' });
        assert.deepEqual(comps.items.map((it) => it.name), ['Pub']);
        assert.deepEqual(call(sandbox, 'project', { name: 'pu' }).items.map((it) => it.id), [400]);
        const one = call(sandbox, 'project', { limit: 1 });
        assert.strictEqual(one.items.length, 1);
    });

    test('mcp.comp : calques, nature, parent, transformation, sélection ; comp introuvable', () => {
        const { sandbox } = loadHost();
        const s = scene();
        s.comp.select(s.B);
        s.B.transform.children.find((c) => c.matchName === 'ADBE Opacity').keys.push({ time: 0, value: 0 }, { time: 1, value: 100 });
        const c = call(sandbox, 'comp', {});
        assert.deepEqual([c.id, c.name, c.width, c.frameRate, c.numLayers], [100, 'Comp 1', 1920, 25, 5]);
        assert.deepEqual(c.layers.map((l) => l.name), ['Parent', 'A', 'B', 'C', 'D']);
        const b = c.layers[2];
        assert.strictEqual(b.parent, 1);
        assert.strictEqual(b.kind, 'other');
        assert.strictEqual(b.selected, true);
        assert.deepEqual(b.transform.scale, [100, 100]);
        assert.deepEqual(b.animated, ['Transform > Opacity (2)']);
        assert.deepEqual(c.selection.layers, [3]);
        assert.strictEqual(c.layers[0].parent, undefined);
        const missing = callHost(sandbox, 'mcp', 'comp', { compId: 999 });
        assert.strictEqual(missing.ok, false);
        assert.ok(/introuvable : 999/.test(missing.error.message));
        app.project.activeItem = null;
        assert.ok(/Aucune composition active/.test(callHost(sandbox, 'mcp', 'comp', {}).error.message));
        assert.strictEqual(call(sandbox, 'comp', { compId: 100, limit: 2 }).layers.length, 2);
    });

    test('mcp.comp : nature des calques (celle de Libellés, « null »)', () => {
        const { sandbox } = loadHost();
        labelScene();
        const kinds = call(sandbox, 'comp', {}).layers.map((l) => l.kind);
        assert.deepEqual(kinds, ['text', 'text', 'shape', 'image', 'image', 'image', 'video', 'solid', 'null', 'adjustment', 'audio', 'precomp', 'camera']);
    });

    test('mcp.properties : arbre, profondeur, chemin, keyframes, expression ; erreurs claires', () => {
        const { sandbox } = loadHost();
        const s = scene();
        const pos = s.A.transform.children.find((c) => c.matchName === 'ADBE Position');
        pos.keys.push({ time: 0, value: [0, 0] }, { time: 2, value: [100, 50] });
        const op = s.A.transform.children.find((c) => c.matchName === 'ADBE Opacity');
        op.expression = 'wiggle(2, 10)';
        op.expressionEnabled = true;
        const all = call(sandbox, 'properties', { layerName: 'A' });
        assert.deepEqual(all.layer, { index: 2, id: s.A.id, name: 'A' });
        const tr = all.tree.children.find((c) => c.matchName === 'ADBE Transform Group');
        const p = tr.children.find((c) => c.matchName === 'ADBE Position');
        assert.strictEqual(p.numKeys, 2);
        assert.strictEqual(p.keys, undefined, 'détail des keyframes sur demande');
        assert.strictEqual(tr.children.find((c) => c.matchName === 'ADBE Opacity').expression, 'wiggle(2, 10)');
        const shallow = call(sandbox, 'properties', { layerIndex: 2, depth: 1 });
        assert.ok(shallow.tree.children.every((c) => !c.children), 'profondeur 1 : groupes non dépliés');
        const one = call(sandbox, 'properties', { layerId: s.A.id, path: ['ADBE Transform Group', 'Position'], keys: true });
        assert.strictEqual(one.tree.matchName, 'ADBE Position');
        assert.deepEqual(one.tree.keys.map((k) => [k.time, k.value]), [[0, [0, 0]], [2, [100, 50]]]);
        assert.ok(/introuvable : « Nope » dans Transform/.test(callHost(sandbox, 'mcp', 'properties', { layerIndex: 2, path: ['Transform', 'Nope'] }).error.message));
        assert.ok(/layerIndex, layerId ou layerName/.test(callHost(sandbox, 'mcp', 'properties', {}).error.message));
        assert.ok(/Calque introuvable/.test(callHost(sandbox, 'mcp', 'properties', { layerIndex: 42 }).error.message));
        s.comp.addLayer('A');
        assert.ok(/2 calques s'appellent « A »/.test(callHost(sandbox, 'mcp', 'properties', { layerName: 'A' }).error.message));
    });

    test('mcp.context : projet, comp active, calques et propriétés sélectionnés ; sans comp', () => {
        const { sandbox } = loadHost();
        const s = scene();
        s.comp.time = 3.4;
        s.comp.select(s.A, s.C);
        const pos = s.A.transform.children.find((c) => c.matchName === 'ADBE Position');
        pos.keys.push({ time: 0, value: [0, 0] }, { time: 1, value: [10, 0] });
        pos.selected = true;
        const ctx = call(sandbox, 'context', {});
        assert.deepEqual(ctx.project, { name: null, path: null, dirty: null });
        assert.deepEqual([ctx.comp.id, ctx.comp.name, ctx.comp.width, ctx.comp.height, ctx.comp.frameRate, ctx.comp.duration, ctx.comp.time, ctx.comp.numLayers],
            [100, 'Comp 1', 1920, 1080, 25, 10, 3.4, 5]);
        assert.deepEqual(ctx.layers.map((l) => [l.index, l.id, l.name]), [[2, s.A.id, 'A'], [4, s.C.id, 'C']]);
        assert.strictEqual(ctx.layers[0].kind, 'other');
        assert.deepEqual(ctx.properties, [{ layer: 2, path: 'Transform › Position', numKeys: 2 }]);
        app.project.activeItem = null;
        const none = call(sandbox, 'context', {});
        assert.strictEqual(none.comp, null);
        assert.deepEqual([none.layers, none.properties], [[], []]);
    });

    test('mcp.activeComp : id et nom, null sans comp active', () => {
        const { sandbox } = loadHost();
        assert.strictEqual(call(sandbox, 'activeComp', {}), null);
        scene();
        assert.deepEqual(call(sandbox, 'activeComp', {}), { id: 100, name: 'Comp 1' });
    });

    test('mcp.snapshot : paquets de calques, clés stables, effet #1, valeur personnalisée, keyframes', () => {
        const { sandbox, S } = loadHost();
        const s = scene();
        const fx = S.getTool('mcp');   // pour vérifier que l'API existe
        assert.ok(fx.snapshot);
        // Effet sur A, propriété à valeur personnalisée sur B, keyframes et expression sur C
        call(sandbox, 'run', { code: 'app.project.activeItem.layer(2).property("ADBE Effect Parade").addProperty("ADBE Slider Control");' });
        s.B.transform.children.find((c) => c.matchName === 'ADBE Opacity').valueType = 'CUSTOM_VALUE';
        const sc = s.C.transform.children.find((c) => c.matchName === 'ADBE Scale');
        sc.keys.push({ time: 0, value: [100, 100] }, { time: 1, value: [50, 50] });
        const rot = s.C.transform.children.find((c) => c.matchName === 'ADBE Rotate Z');
        rot.expression = 'time * 10';
        rot.expressionEnabled = true;
        s.A.parent = null;
        const first = call(sandbox, 'snapshot', { compId: 100, from: 1, count: 2 });
        assert.deepEqual([first.comp.id, first.comp.name, first.comp.numLayers], [100, 'Comp 1', 5]);
        assert.deepEqual(first.layers.map((l) => l.name), ['Parent', 'A']);
        assert.strictEqual(first.next, 3);
        const a = first.layers[1];
        assert.deepEqual([a.id, a.index, a.parent, a.enabled, a.locked], [s.A.id, 2, null, true, false]);
        const pos = a.props['ADBE Transform Group/ADBE Position'];
        assert.deepEqual(pos, { path: 'Transform › Position', value: [0, 0] });
        const slider = a.props['ADBE Effect Parade/#1/ADBE Slider Control-0001'];
        assert.ok(slider, Object.keys(a.props).join(', '));
        assert.strictEqual(slider.path, 'Effects › Slider Control › Slider');
        assert.deepEqual(a.effects, [{ key: 'ADBE Effect Parade/#1', name: 'Slider Control', matchName: 'ADBE Slider Control', enabled: true }]);
        const rest = call(sandbox, 'snapshot', { compId: 100, from: first.next, count: 20 });
        assert.deepEqual(rest.layers.map((l) => l.name), ['B', 'C', 'D']);
        assert.strictEqual(rest.next, null);
        assert.strictEqual(rest.layers[0].parent, s.P.id);
        assert.strictEqual(rest.layers[0].props['ADBE Transform Group/ADBE Opacity'].value, '[valeur personnalisée]');
        const c = rest.layers[1];
        const scale = c.props['ADBE Transform Group/ADBE Scale'];
        assert.deepEqual(scale.keys.map((k) => [k.time, k.value]), [[0, [100, 100]], [1, [50, 50]]]);
        assert.strictEqual(scale.keys[0].selected, undefined, 'sélection des keyframes hors photo');
        assert.strictEqual(c.props['ADBE Transform Group/ADBE Rotate Z'].expression, 'time * 10');
        const again = call(sandbox, 'snapshot', { compId: 100, from: 1, count: 20 });
        assert.deepEqual(Object.keys(again.layers[1].props), Object.keys(a.props), 'mêmes clés d\'une photo à l\'autre');
        assert.strictEqual(call(sandbox, 'snapshot', { compId: 100, from: 1, count: 99 }).layers.length, 5, 'au plus 20 par paquet');
        assert.strictEqual(app.undoGroups.length, 1, 'la photo n\'ouvre pas de groupe d\'annulation');
    });

    test('mcp.snapshot : au-delà de 300 calques, seulement la sélection et les ids demandés', () => {
        const { sandbox } = loadHost();
        const s = scene();
        for (let i = 0; i < 300; i++) s.comp.addLayer('X' + i);
        s.comp.select(s.B);
        const r = call(sandbox, 'snapshot', { compId: 100, from: 1, count: 20, ids: [s.D.id] });
        assert.strictEqual(r.limited, true);
        assert.deepEqual(r.layers.map((l) => l.name), ['B', 'D']);
        assert.strictEqual(r.next, null);
    });

    test('mcp.frame : PNG rendu dans le dossier temporaire, à l\'instant demandé', () => {
        const { sandbox } = loadHost();
        const s = scene();
        s.comp.time = 1;
        const f = call(sandbox, 'frame', { time: 2 });
        assert.ok(/[\\/]SIMING[\\/]claude-\d+\.png$/.test(f.path), f.path);
        assert.ok(fs.existsSync(f.path));
        assert.deepEqual(s.comp.frames, [2]);
        assert.deepEqual([f.comp.id, f.time, f.frame], [100, 2, 50]);
        const again = call(sandbox, 'frame', {});
        assert.ok(!fs.existsSync(f.path) || f.path === again.path, 'ancienne frame retirée');
        assert.deepEqual(s.comp.frames, [2, 1]);
        fs.unlinkSync(again.path);
    });
};
