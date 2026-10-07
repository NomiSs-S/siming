'use strict';
/* API publique de Quick Tools, appelée comme par le pont (SIMING.call), sur le faux AE. */
const assert = require('assert');
const { loadHost, callHost, app } = require('./helpers');
const { FakeComp, KeyframeInterpolationType } = require('./fake-ae');

function host() {
    const { sandbox } = loadHost();
    const call = (fn, args) => {
        const env = callHost(sandbox, 'quicktools', fn, args);
        assert.strictEqual(env.ok, true, env.error && env.error.message);
        return env.data;
    };
    return { call, sandbox };
}

/** Comp « Rig » active (1920 × 1080) : A (100 × 50) en [100, 100], B (100 × 100) en [500, 300], C (10 × 10) en [900, 900]. */
function rig() {
    const comp = new FakeComp(300, 'Rig');
    app.project.activeItem = comp;
    app.project.items.push(comp);
    const A = comp.addLayer('A', { rect: { top: 0, left: 0, width: 100, height: 50 } });
    const B = comp.addLayer('B', { rect: { top: 0, left: 0, width: 100, height: 100 } });
    const C = comp.addLayer('C', { rect: { top: 0, left: 0, width: 10, height: 10 } });
    comp.layer(1).position.setValue([100, 100]);
    comp.layer(2).position.setValue([500, 300]);
    comp.layer(3).position.setValue([900, 900]);
    return { comp, A, B, C, L: (i) => comp.layer(i) };
}

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, (msg || '') + ' attendu ' + b + ', obtenu ' + a);
const nearVec = (v, w, msg) => v.forEach((x, i) => near(x, w[i], (msg || '') + ' [' + i + ']'));

module.exports = function (test) {
    test('API init : message de départ, sans comp -> erreur', () => {
        const { call } = host();
        const st = call('init', {});
        assert.strictEqual(st.status.level, 'info');
        assert.strictEqual(st.report, null);
        assert.strictEqual(call('ease', { mode: 'in', influence: 50 }).status.level, 'error');
        assert.strictEqual(call('anchor', { cell: 5 }).status.level, 'error');
    });

    test('API ease : « entrée » = départ du mouvement (côté sortant de la keyframe), arrivée conservée ; échelle 2D = deux ease', () => {
        const r = rig();
        const pos = r.L(1).position;
        pos.setValueAtTime(0, [0, 0]);
        pos.setValueAtTime(1, [100, 100]);
        pos.setSelectedAtKey(1, true);
        pos.selected = true;
        const { call } = host();
        const st = call('ease', { mode: 'in', influence: 75 });
        assert.strictEqual(st.status.text, '1 keyframe lissée, entrée 75 % · Ctrl+Z pour annuler');
        assert.strictEqual(st.status.level, 'ok');
        assert.deepEqual(st.report, { done: 1, skipped: [] });
        const p = r.L(1).position;
        assert.strictEqual(p.keyOutInterpolationType(1), KeyframeInterpolationType.BEZIER, 'le mouvement part de la keyframe : côté sortant');
        assert.strictEqual(p.keyInInterpolationType(1), KeyframeInterpolationType.LINEAR, 'côté entrant non touché');
        assert.deepEqual([p.keyOutTemporalEase(1)[0].speed, p.keyOutTemporalEase(1)[0].influence], [0, 75]);
        near(p.keyInTemporalEase(1)[0].influence, 16.666666667, 'ease entrant conservé');
        assert.deepEqual(app.undoGroups, ['Quick Tools : lisser']);
        pos.setSelectedAtKey(1, false);
        pos.setSelectedAtKey(2, true);
        call('ease', { mode: 'out', influence: 60 });
        assert.strictEqual(p.keyInInterpolationType(2), KeyframeInterpolationType.BEZIER, '« sortie » = arrivée sur la keyframe : côté entrant');
        assert.strictEqual(p.keyOutInterpolationType(2), KeyframeInterpolationType.LINEAR);
        assert.strictEqual(p.keyInTemporalEase(2)[0].influence, 60);
        pos.setSelectedAtKey(2, false);

        const sc = r.L(2).scale;
        sc.setValueAtTime(0, [100, 100]);
        sc.setSelectedAtKey(1, true);
        sc.selected = true;
        pos.selected = false;
        const st2 = call('ease', { mode: 'both', influence: 150 });
        assert.strictEqual(st2.status.text, '1 keyframe lissée, entrée et sortie 100 % · Ctrl+Z pour annuler');
        const s2 = r.L(2).scale;
        assert.strictEqual(s2.keyInTemporalEase(1).length, 2);
        assert.strictEqual(s2.keyOutTemporalEase(1)[1].influence, 100);
        assert.strictEqual(s2.keyOutInterpolationType(1), KeyframeInterpolationType.BEZIER);
    });

    test('API ease : maintien et calque verrouillé ignorés, sélection vide', () => {
        const r = rig();
        const pos = r.L(1).position;
        pos.setValueAtTime(0, [0, 0]);
        pos.setValueAtTime(1, [100, 100]);
        pos.setInterpolationTypeAtKey(1, KeyframeInterpolationType.HOLD);
        pos.setSelectedAtKey(1, true);
        pos.setSelectedAtKey(2, true);
        pos.selected = true;
        const rot = r.L(2).rotation;
        rot.setValueAtTime(0, 0);
        rot.setSelectedAtKey(1, true);
        rot.selected = true;
        r.B.locked = true;
        const { call } = host();
        const st = call('ease', { mode: 'out', influence: 60 });
        assert.strictEqual(st.report.done, 1);
        assert.strictEqual(st.report.skipped.length, 2);
        assert.ok(/Position n°1 : keyframe en maintien/.test(st.report.skipped[0]), st.report.skipped[0]);
        assert.ok(/Rotation n°1 : .*locked/.test(st.report.skipped[1]), st.report.skipped[1]);
        assert.strictEqual(st.status.level, 'warn');
        assert.ok(/2 ignoré\(s\) · Ctrl\+Z/.test(st.status.text), st.status.text);
        pos.setSelectedAtKey(1, false);
        pos.setSelectedAtKey(2, false);
        rot.setSelectedAtKey(1, false);
        const empty = call('ease', { mode: 'in', influence: 50 });
        assert.strictEqual(empty.status.level, 'warn');
        assert.ok(/Aucune keyframe sélectionnée/.test(empty.status.text));
        assert.strictEqual(empty.report, null);
    });

    test('API elastic : effet posé par le préréglage sur le bon calque, sélection rétablie, expression de l\'auteur', () => {
        const r = rig();
        const pos = r.L(1).position;
        pos.setValueAtTime(0, [0, 0]);
        pos.setValueAtTime(1, [100, 100]);
        pos.selected = true;
        r.L(2).scale.selected = true;                       // sélectionnée mais sans keyframe : pas une cible
        r.comp.select(r.A, r.B);                            // deux calques sélectionnés avant l'action
        const { call } = host();
        const st = call('elastic', {});
        assert.strictEqual(st.status.text, 'Elastic appliqué à 1 propriété · Ctrl+Z pour annuler');
        assert.deepEqual(app.presetsApplied, [{ file: 'ElasticController.ffx', layers: ['A'] }], 'préréglage sur A seul');
        assert.deepEqual(r.comp.selectedLayers.map((l) => l.name), ['A', 'B'], 'sélection rétablie');
        const fx = r.L(1).effect('Elastic Controller');
        assert.deepEqual([fx.property(1).value, fx.property(2).value, fx.property(3).value], [20, 40, 60]);
        assert.strictEqual(r.L(2).effect('Elastic Controller'), null);
        const p = r.L(1).position;
        assert.ok(/effect\("Elastic Controller"\)\(1\) \/ 200/.test(p.expression));
        assert.strictEqual(p.expressionEnabled, true);
        assert.deepEqual(app.undoGroups, ['Quick Tools : Elastic']);
        call('elastic', {});                                 // seconde fois : l'effet n'est pas doublé
        assert.strictEqual(app.presetsApplied.length, 1);
        assert.strictEqual(r.L(1).property('ADBE Effect Parade').numProperties, 1);
    });

    test('API elastic : préréglage introuvable, calque verrouillé, rien d\'animé', () => {
        const r = rig();
        const pos = r.L(1).position;
        pos.setValueAtTime(0, [0, 0]);
        pos.selected = true;
        const { call, sandbox } = host();
        const RealFile = sandbox.File;
        sandbox.File = function () { return { exists: false, name: 'x', fsName: 'x' }; };
        let st = call('elastic', {});
        assert.strictEqual(st.report.done, 0);
        assert.ok(/préréglage introuvable/.test(st.report.skipped[0]), st.report.skipped[0]);
        assert.strictEqual(st.status.level, 'warn');
        assert.ok(!/Ctrl\+Z/.test(st.status.text), 'rien de fait : pas de Ctrl+Z');
        sandbox.File = RealFile;
        r.A.locked = true;
        st = call('elastic', {});
        assert.ok(/calque verrouillé/.test(st.report.skipped[0]));
        r.A.locked = false;
        pos.selected = false;
        r.L(2).scale.selected = true;
        st = call('elastic', {});
        assert.ok(/Aucune propriété animée/.test(st.status.text));
    });

    test('API elasticRemove : expression vidée, effet retiré seulement s\'il ne sert plus', () => {
        const r = rig();
        const pos = r.L(1).position, rot = r.L(1).rotation;
        pos.setValueAtTime(0, [0, 0]);
        rot.setValueAtTime(0, 0);
        pos.selected = true;
        rot.selected = true;
        const { call } = host();
        call('elastic', {});
        assert.ok(r.L(1).effect('Elastic Controller'));
        rot.selected = false;
        let st = call('elasticRemove', {});
        assert.strictEqual(st.status.text, 'Elastic retiré de 1 propriété · Ctrl+Z pour annuler');
        assert.strictEqual(r.L(1).position.expression, '');
        assert.ok(r.L(1).effect('Elastic Controller'), 'Rotation cite encore l\'effet');
        pos.selected = false;
        rot.selected = true;
        st = call('elasticRemove', {});
        assert.strictEqual(r.L(1).effect('Elastic Controller'), null, 'plus personne : effet retiré');
        st = call('elasticRemove', {});
        assert.ok(/Aucune propriété élastique/.test(st.status.text));
    });

    test('API anchor : point d\'ancrage placé, position compensée (échelle, rotation, 3D, séparé, animé)', () => {
        const r = rig();
        r.comp.select(r.A);
        const { call } = host();
        let st = call('anchor', { cell: 5 });
        assert.strictEqual(st.status.text, 'Point d\'ancrage placé sur 1 calque · Ctrl+Z pour annuler');
        nearVec(r.L(1).anchorPoint.value, [50, 25]);
        nearVec(r.L(1).position.value, [150, 125]);
        assert.deepEqual(app.undoGroups, ['Quick Tools : point d\'ancrage']);

        r.L(1).scale.setValue([200, 200]);
        r.L(1).rotation.setValue(90);
        call('anchor', { cell: 9 });                        // delta [50, -25] -> R90·S2 = [50, 100]
        nearVec(r.L(1).anchorPoint.value, [100, 0]);
        nearVec(r.L(1).position.value, [200, 225]);

        const D = r.comp.addLayer('D', { threeD: true, rect: { top: 0, left: 0, width: 40, height: 40 } });
        r.L(4).position.setValue([10, 10, 7]);
        r.comp.select(D);
        call('anchor', { cell: 1 });
        nearVec(r.L(4).anchorPoint.value, [0, 40, 0]);
        nearVec(r.L(4).position.value, [10, 50, 7], 'Z conservé');

        r.L(2).position.dimensionsSeparated = true;
        r.L(2).property('ADBE Position_0').setValue(500);
        r.L(2).property('ADBE Position_1').setValueAtTime(0, 300);   // Y animée
        r.comp.time = 2;
        r.comp.select(r.B);
        call('anchor', { cell: 3 });
        near(r.L(2).property('ADBE Position_0').value, 600);
        near(r.L(2).property('ADBE Position_1').valueAtTime(2), 400);
        assert.strictEqual(r.L(2).property('ADBE Position_1').numKeys, 1, 'aucune keyframe ajoutée : la keyframe existante est décalée');
        near(r.L(2).property('ADBE Position_1').keyValue(1), 400);
    });

    test('API anchor : calque animé, keyframes décalées sans en créer, tangentes conservées, échelle et ancrage animés', () => {
        const r = rig();
        const pos = r.L(1).position;                        // A 100 × 50, ancrage [0, 0]
        pos.setValueAtTime(0, [100, 100]);
        pos.setValueAtTime(1, [300, 100]);
        pos.setSpatialTangentsAtKey(1, [10, 0], [12, 0]);  // tangentes à la main sur la 1re keyframe
        r.comp.time = 0.5;
        r.comp.select(r.A);
        const { call } = host();
        let st = call('anchor', { cell: 5 });               // cible [50, 25]
        assert.strictEqual(st.status.text, 'Point d\'ancrage placé sur 1 calque · Ctrl+Z pour annuler');
        nearVec(r.L(1).anchorPoint.value, [50, 25]);
        assert.strictEqual(r.L(1).position.numKeys, 2, 'aucune keyframe ajoutée');
        nearVec(r.L(1).position.keyValue(1), [150, 125], 'keyframe 1 décalée');
        nearVec(r.L(1).position.keyValue(2), [350, 125], 'keyframe 2 décalée');
        assert.deepEqual([r.L(1).position.keyInSpatialTangent(1), r.L(1).position.keyOutSpatialTangent(1)], [[10, 0], [12, 0]], 'tangentes conservées');
        assert.strictEqual(r.L(1).position.keySpatialAutoBezier(1), false);
        assert.strictEqual(r.L(1).position.keySpatialAutoBezier(2), true, 'keyframe automatique laissée automatique');
        nearVec(r.L(1).position.valueAtTime(0.5), [250, 125], 'rien ne bouge à l\'écran à l\'instant courant');

        // Échelle animée : chaque keyframe de position est compensée avec l'échelle à son instant
        const sc = r.L(2).scale, posB = r.L(2).position;    // B 100 × 100 en [500, 300]
        sc.setValueAtTime(0, [100, 100]);
        sc.setValueAtTime(1, [200, 200]);
        posB.setValueAtTime(0, [500, 300]);
        posB.setValueAtTime(1, [500, 300]);
        r.comp.time = 0;
        r.comp.select(r.B);
        call('anchor', { cell: 5 });                        // delta [50, 50]
        nearVec(r.L(2).position.keyValue(1), [550, 350], 'à 100 %');
        nearVec(r.L(2).position.keyValue(2), [600, 400], 'à 200 %');
        assert.strictEqual(r.L(2).position.numKeys, 2);

        // Ancrage animé : toutes ses keyframes reçoivent le même décalage, la position statique bouge d'autant
        const apC = r.L(3).anchorPoint;                     // C 10 × 10 en [900, 900]
        apC.setValueAtTime(0, [0, 0]);
        apC.setValueAtTime(1, [5, 5]);
        r.comp.select(r.C);
        st = call('anchor', { cell: 9 });                   // cible [10, 0] depuis [0, 0] : delta [10, 0]
        assert.strictEqual(r.L(3).anchorPoint.numKeys, 2);
        nearVec(r.L(3).anchorPoint.keyValue(1), [10, 0]);
        nearVec(r.L(3).anchorPoint.keyValue(2), [15, 5]);
        nearVec(r.L(3).position.value, [910, 900]);
        assert.strictEqual(r.L(3).position.numKeys, 0, 'position statique : pas de keyframe');
    });

    test('API anchor : caméra, calque verrouillé, case inconnue, rien de sélectionné', () => {
        const r = rig();
        r.comp.addLayer('Cam', { kind: 'camera' });
        r.C.locked = true;
        r.comp.select(r.comp.layers[3], r.C, r.A);
        const { call } = host();
        let st = call('anchor', { cell: 7 });
        assert.strictEqual(st.report.done, 1);
        assert.deepEqual(st.report.skipped, ['Cam : pas de boîte visible (caméra ou lumière)', 'C : calque verrouillé']);
        assert.strictEqual(st.status.level, 'warn');
        st = call('anchor', { cell: 12 });
        assert.ok(/Case inconnue/.test(st.status.text));
        r.comp.select();
        st = call('anchor', { cell: 5 });
        assert.ok(/Aucun calque sélectionné/.test(st.status.text));
    });

    test('API align : sur la sélection et sur la composition, calque parenté, sélection insuffisante', () => {
        const r = rig();
        r.comp.select(r.A, r.B);
        const { call } = host();
        let st = call('align', { edge: 'left', relative: 'selection' });
        assert.strictEqual(st.status.text, '2 calques alignés à gauche · Ctrl+Z pour annuler');
        nearVec(r.L(1).position.value, [100, 100], 'A déjà à gauche');
        nearVec(r.L(2).position.value, [100, 300], 'B ramené sur le bord gauche de A');
        st = call('align', { edge: 'bottom', relative: 'selection' });
        nearVec(r.L(1).position.value, [100, 350], 'A descendu : bas de A (150) sur bas de B (400)');
        st = call('align', { edge: 'right', relative: 'comp' });
        assert.strictEqual(st.status.text, '2 calques alignés à droite de la composition · Ctrl+Z pour annuler');
        nearVec(r.L(1).position.value, [1820, 350]);
        nearVec(r.L(2).position.value, [1820, 300]);
        st = call('align', { edge: 'centerY', relative: 'comp' });
        nearVec(r.L(2).position.value, [1820, 490]);
        assert.deepEqual(app.undoGroups, ['Quick Tools : aligner', 'Quick Tools : aligner', 'Quick Tools : aligner', 'Quick Tools : aligner']);

        // C parenté à B (B à 200 %) : un déplacement comp de -d vaut -d/2 dans l'espace de B
        r.L(2).scale.setValue([200, 200]);
        r.L(2).position.setValue([100, 100]);
        r.L(3).parent = r.L(2);
        r.L(3).position.setValue([10, 0]);                // boîte comp : gauche 120, haut 100
        r.comp.select(r.C);
        st = call('align', { edge: 'left', relative: 'comp' });
        nearVec(r.L(3).position.value, [-50, 0], 'delta comp -120 -> -60 dans le parent');

        r.comp.select(r.A);
        st = call('align', { edge: 'left', relative: 'selection' });
        assert.ok(/au moins 2 calques/.test(st.status.text));
        assert.strictEqual(st.report, null);
        r.comp.select();
        st = call('align', { edge: 'left', relative: 'comp' });
        assert.ok(/au moins 1 calque/.test(st.status.text));
        st = call('align', { edge: 'diagonal', relative: 'comp' });
        assert.ok(/Alignement inconnu/.test(st.status.text));
    });

    test('API distribute : extrêmes fixes, calques ignorés listés, moins de 3 calques', () => {
        const r = rig();
        r.L(1).position.setValue([0, 0]);                  // bords gauches 0, 10, 100
        r.L(2).position.setValue([100, 0]);
        r.L(3).position.setValue([10, 0]);
        r.comp.select(r.A, r.B, r.C);
        const { call } = host();
        let st = call('distribute', { edge: 'left' });
        assert.strictEqual(st.status.text, '3 calques répartis, bords gauches · Ctrl+Z pour annuler');
        nearVec(r.L(3).position.value, [50, 0]);
        nearVec(r.L(1).position.value, [0, 0]);
        nearVec(r.L(2).position.value, [100, 0]);
        assert.deepEqual(app.undoGroups, ['Quick Tools : répartir']);
        r.C.locked = true;
        st = call('distribute', { edge: 'centerX' });
        assert.ok(/au moins 3 calques/.test(st.status.text));
        assert.deepEqual(st.report, { done: 0, skipped: ['C : calque verrouillé'] }, 'raison transmise au dialogue');
    });

    test('API anchor et align avec masques : seule la partie visible compte (ajouter, intersection, soustraire, inversé, étendue)', () => {
        const r = rig();
        const quad = (l, t, rr, b) => [[l, t], [rr, t], [rr, b], [l, b]];
        const { call } = host();
        const anchorWith = (masks, cell) => {
            r.A.masks = masks;
            r.L(1).anchorPoint.setValue([0, 0]);
            r.L(1).position.setValue([100, 100]);
            r.comp.select(r.A);
            const st = call('anchor', { cell });
            return { st, ap: r.L(1).anchorPoint.value };
        };
        assert.deepEqual(anchorWith([{ mode: 'ADD', vertices: quad(50, 0, 100, 50) }], 5).ap, [75, 25], 'centre de la partie visible (A fait 100 × 50)');
        assert.deepEqual(anchorWith([{ mode: 'ADD', vertices: quad(50, 0, 100, 50) }], 1).ap, [50, 50], 'bas gauche de la partie visible');
        assert.deepEqual(anchorWith([{ mode: 'ADD', vertices: quad(80, 20, 300, 300) }], 5).ap, [90, 35], 'masque qui dépasse : coupé au calque');
        assert.deepEqual(anchorWith([{ mode: 'SUBTRACT', vertices: quad(0, 0, 50, 50) }], 5).ap, [50, 25], 'soustraire : tout le calque');
        assert.deepEqual(anchorWith([{ mode: 'ADD', vertices: quad(0, 0, 60, 40) }, { mode: 'INTERSECT', vertices: quad(40, 10, 100, 50) }], 7).ap, [40, 10], 'ajouter puis intersection');
        assert.deepEqual(anchorWith([{ mode: 'ADD', inverted: true, vertices: quad(0, 0, 10, 10) }], 7).ap, [0, 0], 'masque inversé : tout le calque');
        assert.deepEqual(anchorWith([{ mode: 'ADD', vertices: quad(50, 10, 90, 40), expansion: 5 }], 9).ap, [95, 5], 'étendue du masque comprise');
        assert.deepEqual(anchorWith([{ mode: 'NONE', vertices: quad(0, 0, 10, 10) }], 5).ap, [50, 25], 'masque sans mode : ignoré');
        const out = anchorWith([{ mode: 'ADD', vertices: quad(500, 500, 600, 600) }], 5);
        assert.deepEqual(out.st.report.skipped, ['A : rien de visible : ses masques sont hors du calque']);
        // Aligner à gauche : le bord visible de A (masque de 50 à 100) sert de référence
        r.A.masks = [{ mode: 'ADD', vertices: quad(50, 0, 100, 50) }];
        r.L(1).anchorPoint.setValue([0, 0]);
            r.L(1).position.setValue([100, 100]);
        r.comp.select(r.A, r.B);
        call('align', { edge: 'left', relative: 'selection' });
        assert.deepEqual(r.L(2).position.value, [150, 300], 'B aligné sur le bord visible de A (100 + 50)');
        assert.deepEqual(r.L(1).position.value, [100, 100]);
    });
};
