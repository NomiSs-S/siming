'use strict';
/* Fonctions pures de Quick Tools (ancrage, matrices 2D, alignement, répartition, lissage, Elastic). */
const assert = require('assert');
const { loadHost } = require('./helpers');

function core() {
    const { S } = loadHost();
    const tool = S.getTool('quicktools');
    if (!tool) throw new Error('outil hôte « quicktools » non chargé');
    return tool._core;
}
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, (msg || '') + ' attendu ' + b + ', obtenu ' + a);
const nearVec = (v, w, msg) => v.forEach((x, i) => near(x, w[i], (msg || '') + ' [' + i + ']'));

module.exports = function (test) {
    test('quicktools : cible du point d\'ancrage selon la case (pavé numérique)', () => {
        const c = core();
        const rect = { left: 10, top: 20, width: 100, height: 50 };
        nearVec(c.anchorTarget(rect, 1), [10, 70], 'bas gauche');
        nearVec(c.anchorTarget(rect, 3), [110, 70], 'bas droite');
        nearVec(c.anchorTarget(rect, 5), [60, 45], 'centre');
        nearVec(c.anchorTarget(rect, 7), [10, 20], 'haut gauche');
        nearVec(c.anchorTarget(rect, 9), [110, 20], 'haut droite');
        nearVec(c.anchorTarget(rect, '8'), [60, 20], 'haut centre, chaîne');
        nearVec(c.anchorTarget(rect, 42), [60, 45], 'case inconnue : centre');
    });

    test('quicktools : compensation de position (échelle et rotation du calque)', () => {
        const c = core();
        nearVec(c.compensate([10, 0], [100, 100], 0), [10, 0]);
        nearVec(c.compensate([10, 0], [200, 100], 0), [20, 0], 'échelle 200 % en X');
        nearVec(c.compensate([10, 0], [200, 100], 90), [0, 20], 'puis rotation 90°');
        nearVec(c.compensate([0, 10], [100, 50], 180), [0, -5], 'échelle 50 % en Y, rotation 180°');
    });

    test('quicktools : matrices 2D, boîte d\'un calque, chaîne de parents, inverse', () => {
        const c = core();
        const M = c.layerMatrix({ position: [500, 300], anchor: [50, 25], scale: [100, 100], rotation: 0 });
        nearVec(c.matApply(M, [0, 0]), [450, 275]);
        let b = c.bounds({ left: 0, top: 0, width: 100, height: 50 }, M);
        nearVec([b.left, b.top, b.right, b.bottom], [450, 275, 550, 325]);
        const R = c.layerMatrix({ position: [500, 300], anchor: [50, 25], scale: [100, 100], rotation: 90 });
        b = c.bounds({ left: 0, top: 0, width: 100, height: 50 }, R);
        nearVec([b.left, b.top, b.right, b.bottom], [475, 250, 525, 350], 'rectangle tourné de 90°');
        const parent = c.layerMatrix({ position: [100, 100], anchor: [0, 0], scale: [200, 200], rotation: 0 });
        const child = c.layerMatrix({ position: [10, 0], anchor: [0, 0], scale: [100, 100], rotation: 0 });
        nearVec(c.matApply(c.matMul(parent, child), [0, 0]), [120, 100], 'enfant dans un parent à 200 %');
        nearVec(c.matLinearInverse(parent, [20, 0]), [10, 0], 'déplacement comp -> espace du parent');
        nearVec(c.matLinearInverse([0, 0, 0, 0, 5, 5], [3, 4]), [3, 4], 'matrice dégénérée : inchangé');
    });

    test('quicktools : union, alignement sur la sélection et sur la composition', () => {
        const c = core();
        const A = { left: 0, top: 0, right: 100, bottom: 100 };
        const B = { left: 200, top: 50, right: 300, bottom: 150 };
        const u = c.union([A, B]);
        assert.deepEqual(u, { left: 0, top: 0, right: 300, bottom: 150 });
        assert.deepEqual(c.alignDeltas([A, B], 'left', u), [[0, 0], [-200, 0]]);
        assert.deepEqual(c.alignDeltas([A, B], 'right', u), [[200, 0], [0, 0]]);
        assert.deepEqual(c.alignDeltas([A, B], 'centerX', u), [[100, 0], [-100, 0]]);
        assert.deepEqual(c.alignDeltas([A, B], 'top', u), [[0, 0], [0, -50]]);
        assert.deepEqual(c.alignDeltas([A, B], 'centerY', u), [[0, 25], [0, -25]]);
        assert.deepEqual(c.alignDeltas([A, B], 'bottom', u), [[0, 50], [0, 0]]);
        const comp = { left: 0, top: 0, right: 1920, bottom: 1080 };
        assert.deepEqual(c.alignDeltas([A], 'right', comp), [[1820, 0]]);
        assert.deepEqual(c.alignDeltas([A], 'centerY', comp), [[0, 490]]);
    });

    test('quicktools : répartition, extrêmes fixes, ordre d\'entrée conservé', () => {
        const c = core();
        const box = (l, t) => ({ left: l, top: t, right: l + 10, bottom: t + 10 });
        assert.deepEqual(c.distributeDeltas([box(100, 0), box(0, 0), box(10, 0)], 'left'), [[0, 0], [0, 0], [40, 0]]);
        assert.deepEqual(c.distributeDeltas([box(0, 0), box(0, 30), box(0, 100)], 'bottom'), [[0, 0], [0, 20], [0, 0]]);
        assert.deepEqual(c.distributeDeltas([box(0, 0), box(0, 30)], 'top'), [[0, 0], [0, 0]], 'moins de 3 : rien');
        assert.deepEqual(c.distributeDeltas([box(0, 0), box(0, 0), box(0, 0), box(0, 90)], 'centerY'),
            [[0, 0], [0, 30], [0, 60], [0, 0]], 'égalités : ordre d\'entrée');
    });

    test('quicktools : influence bornée, tableaux d\'ease, détection Elastic, expression', () => {
        const c = core();
        assert.strictEqual(c.clampInfluence(0), 0.1);
        assert.strictEqual(c.clampInfluence(150), 100);
        assert.strictEqual(c.clampInfluence('75'), 75);
        near(c.clampInfluence('abc'), 33.333, 'invalide : lissage d\'AE');
        const eases = c.easeList(2, 75);
        assert.strictEqual(eases.length, 2);
        assert.deepEqual([eases[1].speed, eases[1].influence], [0, 75]);
        assert.strictEqual(c.isElastic('amp = effect("Elastic Controller")(1) / 200;'), true);
        assert.strictEqual(c.isElastic(''), false);
        assert.strictEqual(c.isElastic('value'), false);
        assert.ok(/velocityAtTime\(key\(n\)\.time - thisComp\.frameDuration\/10\)/.test(c.ELASTIC_EXPRESSION));
        assert.ok(/effect\("Elastic Controller"\)\(3\) \/ 10/.test(c.ELASTIC_EXPRESSION));
        assert.strictEqual(c.isElastic(c.ELASTIC_EXPRESSION), true);
        assert.ok(/presets[\\/]ElasticController\.ffx$/.test(c.presetPath()), c.presetPath());
    });

    test('géométrie : boîte d\'un tracé de masque (courbes comprises), partie commune de deux boîtes', () => {
        const G = loadHost().S.geom;
        const box = (b) => [b.left, b.top, b.right, b.bottom];
        const square = [[10, 20], [60, 20], [60, 70], [10, 70]];
        assert.deepEqual(box(G.pathBounds(square, null, null, true)), [10, 20, 60, 70]);
        // Segment courbe de (0, 0) à (100, 0), tangentes vers le haut : le sommet est à y = -45
        const curve = G.pathBounds([[0, 0], [100, 0]], [[0, 0], [0, -60]], [[0, -60], [0, 0]], false);
        box(curve).forEach((x, i) => near(x, [0, -45, 100, 0][i], 'courbe [' + i + ']'));
        const open = G.pathBounds([[0, 0], [100, 0], [100, 100]], [[0, 0], [0, 0], [0, 0]], [[0, 0], [0, 0], [-300, 0]], false);
        assert.deepEqual(box(open), [0, 0, 100, 100], 'tracé ouvert : pas de segment de retour');
        assert.strictEqual(G.pathBounds([], null, null, true), null);
        assert.deepEqual(box(G.intersect({ left: 0, top: 0, right: 60, bottom: 60 }, { left: 40, top: 40, right: 100, bottom: 100 })), [40, 40, 60, 60]);
        assert.strictEqual(G.intersect({ left: 0, top: 0, right: 10, bottom: 10 }, { left: 20, top: 20, right: 30, bottom: 30 }), null);
    });
};
