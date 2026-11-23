'use strict';
/* Onglet Claude, observation (js/claude/observe.js) : différence entre deux photos d'une comp. */
const assert = require('assert');
const { makeDom } = require('./helpers');

const load = () => makeDom(['js/siming.js', 'js/claude/observe.js']).SIMING.claude;
const copy = (x) => JSON.parse(JSON.stringify(x));

const COMP = { id: 42, name: 'MAIN_16x9', width: 1920, height: 1080, duration: 20, frameRate: 25, numLayers: 2 };

function layer(id, index, name, extra) {
    return Object.assign({
        id, index, name, kind: 'image', parent: null, inPoint: 0, outPoint: 20, startTime: 0,
        enabled: true, solo: false, shy: false, locked: false, threeD: false,
        props: {
            'ADBE Transform Group/ADBE Position': { path: 'Transformation › Position', value: [960, 540] },
            'ADBE Transform Group/ADBE Scale': { path: 'Transformation › Échelle', value: [100, 100] },
            'ADBE Transform Group/ADBE Opacity': { path: 'Transformation › Opacité', value: 100 },
        },
        effects: [], masks: [],
    }, extra || {});
}

function shots() {
    const before = { comp: copy(COMP), layers: [layer(118, 3, 'LOGO', { source: { id: 7, name: 'logo.ai' } }), layer(120, 5, 'Titre', { kind: 'text' })] };
    return { before, after: copy(before) };
}

module.exports = function (test) {
    test('observation : rien changé -> aucune différence', () => {
        const C = load();
        const { before, after } = shots();
        assert.deepEqual(Array.from(C.diffComp(before, after)), []);
        assert.strictEqual(C.countChanges([{ comp: before.comp, changes: [] }]), 0);
    });

    test('observation : position et échelle changées -> lignes avant → après, sous le calque', () => {
        const C = load();
        const { before, after } = shots();
        after.layers[0].props['ADBE Transform Group/ADBE Position'].value = [1720, 980];
        after.layers[0].props['ADBE Transform Group/ADBE Scale'].value = [45, 45];
        const changes = C.diffComp(before, after);
        assert.deepEqual(changes.map((c) => c.kind), ['prop', 'prop']);
        assert.strictEqual(changes[0].layer.id, 118);
        const text = C.observationText([{ comp: after.comp, changes }]);
        assert.ok(text.startsWith('<observation comp="MAIN_16x9 (id 42)">\n'), text);
        assert.ok(text.trim().endsWith('</observation>'));
        assert.ok(text.includes('Calque 3 « LOGO » (id 118, source logo.ai id 7) :'), text);
        assert.ok(text.includes('  Transformation › Position (ADBE Position) : [960,540] → [1720,980]'), text);
        assert.ok(text.includes('  Transformation › Échelle (ADBE Scale) : [100,100] → [45,45]'), text);
        assert.strictEqual(C.countChanges([{ comp: after.comp, changes }]), 2);
    });

    test('observation : effet ajouté listé avec ses réglages, sans lignes de propriété en double', () => {
        const C = load();
        const { before, after } = shots();
        const t = after.layers[1];
        t.effects.push({ key: 'ADBE Effect Parade/#1', name: 'Lueur', matchName: 'ADBE Glo2', enabled: true });
        t.props['ADBE Effect Parade/#1/ADBE Glo2-0003'] = { path: 'Effets › Lueur › Rayon', value: 25 };
        t.props['ADBE Effect Parade/#1/ADBE Glo2-0004'] = { path: 'Effets › Lueur › Intensité', value: 1.4 };
        const changes = C.diffComp(before, after);
        assert.deepEqual(changes.map((c) => c.kind), ['effectAdded']);
        const text = C.observationText([{ comp: after.comp, changes }]);
        assert.ok(text.includes('Calque 5 « Titre » (id 120) :'), text);
        assert.ok(text.includes('effet ajouté « Lueur » (ADBE Glo2) : Rayon 25, Intensité 1.4'), text);
        // L'effet retiré, et un effet inséré avant un autre ne décale pas les réglages
        const back = C.diffComp(after, before);
        assert.deepEqual(back.map((c) => c.kind), ['effectRemoved']);
        const two = copy(after);
        two.layers[1].effects = [{ key: 'ADBE Effect Parade/#1', name: 'Flou', matchName: 'ADBE Gaussian Blur 2', enabled: true },
            { key: 'ADBE Effect Parade/#2', name: 'Lueur', matchName: 'ADBE Glo2', enabled: true }];
        two.layers[1].props = Object.assign({}, before.layers[1].props, {
            'ADBE Effect Parade/#1/ADBE Gaussian Blur 2-0001': { path: 'Effets › Flou › Flou', value: 10 },
            'ADBE Effect Parade/#2/ADBE Glo2-0003': { path: 'Effets › Lueur › Rayon', value: 30 },
            'ADBE Effect Parade/#2/ADBE Glo2-0004': { path: 'Effets › Lueur › Intensité', value: 1.4 },
        });
        const shifted = C.diffComp(after, two);
        assert.deepEqual(shifted.map((c) => c.kind).sort(), ['effectAdded', 'prop']);
        const prop = shifted.find((c) => c.kind === 'prop');
        assert.deepEqual([prop.path, prop.before, prop.after], ['Effets › Lueur › Rayon', 25, 30]);
    });

    test('observation : keyframes ajoutées (nombre et temps), expression posée', () => {
        const C = load();
        const { before, after } = shots();
        const pos = after.layers[0].props['ADBE Transform Group/ADBE Position'];
        delete pos.value;
        pos.keys = [{ time: 0, value: [960, 540], inType: 'linear', outType: 'linear' }, { time: 1.2, value: [1720, 980], inType: 'bezier', outType: 'bezier' }];
        after.layers[0].props['ADBE Transform Group/ADBE Opacity'].expression = 'wiggle(2, 10)';
        const changes = C.diffComp(before, after);
        assert.deepEqual(changes.map((c) => c.kind), ['keys', 'expression']);
        assert.deepEqual(Array.from(changes[0].added), [0, 1.2]);
        const text = C.observationText([{ comp: after.comp, changes }]);
        assert.ok(/Position \(ADBE Position\) : 2 keyframes ajoutées \(0 s, 1\.2 s\)/.test(text), text);
        assert.ok(text.includes('1.2 s = [1720,980] (bezier)'), text);
        assert.ok(text.includes('Opacité (ADBE Opacity) : expression posée : wiggle(2, 10)'), text);
    });

    test('observation : calque ajouté, supprimé, renommé, parent, interrupteur, réglage de comp', () => {
        const C = load();
        const { before, after } = shots();
        after.layers.push(layer(130, 1, 'Nouveau', { kind: 'shape' }));
        after.layers[1].name = 'Titre 2';
        after.layers[1].parent = 118;
        after.layers[0].enabled = false;
        after.comp.duration = 15;
        const changes = C.diffComp(before, after);
        const kinds = changes.map((c) => c.kind);
        for (const k of ['comp', 'layerAdded', 'renamed', 'parent', 'switch']) assert.ok(kinds.includes(k), k + ' dans ' + kinds);
        const text = C.observationText([{ comp: after.comp, changes }], { newItems: ['logo_v2.ai'] });
        assert.ok(text.includes('Comp : durée 20 → 15'), text);
        assert.ok(text.includes('Calque 1 « Nouveau » (id 130) :\n  calque ajouté (shape)'), text);
        assert.ok(text.includes('renommé « Titre » → « Titre 2 »'), text);
        assert.ok(text.includes('parent : aucun → 3 « LOGO » (id 118)'), text);
        assert.ok(text.includes('interrupteur enabled : true → false'), text);
        assert.ok(text.includes('Éléments ajoutés au projet : logo_v2.ai'), text);
        const gone = copy(before);
        gone.layers.pop();
        const removed = C.diffComp(before, gone);
        assert.deepEqual(removed.map((c) => c.kind), ['layerRemoved']);
        assert.ok(C.observationText([{ comp: gone.comp, changes: removed }]).includes('calque supprimé'));
    });

    test('observation : photo limitée (plus de 300 calques) : pas de faux ajouts, le texte le dit', () => {
        const C = load();
        const { before, after } = shots();
        before.limited = true;
        after.limited = true;
        after.layers.push(layer(999, 8, 'Sélectionné après'));
        const changes = C.diffComp(before, after);
        assert.deepEqual(changes, []);
        const text = C.observationText([{ comp: after.comp, changes, limited: true }]);
        assert.ok(/seuls les calques sélectionnés/.test(text), text);
    });
};
