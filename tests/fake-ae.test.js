'use strict';
/* Le faux After Effects imite bien les pièges d'ExtendScript. */
const assert = require('assert');
const vm = require('vm');
const { createSandbox, app, KeyframeEase, KeyframeInterpolationType, CameraLayerRef } = require('./fake-ae');
const { scene } = require('./helpers');

module.exports = function (test) {
    test('faux AE : propriétés, keyframes, ease par dimension, sélection', () => {
        const s = scene();
        const L = s.comp.layer(2);                          // A
        const pos = L.position;
        assert.strictEqual(pos.propertyDepth, 2);
        assert.strictEqual(pos.propertyGroup(2).name, 'A');
        pos.setValueAtTime(0, [0, 0]);
        pos.setValueAtTime(1, [100, 50]);
        assert.deepEqual(pos.valueAtTime(0.5), [50, 25]);
        s.comp.time = 1;
        assert.deepEqual(pos.value, [100, 50]);
        assert.throws(() => pos.setValue([1, 1]), /keyframes/);
        pos.setSelectedAtKey(2, true);
        assert.deepEqual(pos.selectedKeys, [2]);
        pos.selected = true;
        assert.deepEqual(s.comp.selectedProperties.map((p) => p.name), ['Position']);
        pos.setTemporalEaseAtKey(2, [new KeyframeEase(0, 75)], [new KeyframeEase(0, 75)]);   // spatiale : un seul
        assert.strictEqual(pos.keyInTemporalEase(2)[0].influence, 75);
        assert.throws(() => pos.setTemporalEaseAtKey(2, [new KeyframeEase(0, 1), new KeyframeEase(0, 1)]), /1 KeyframeEase/);
        const sc = L.scale;
        sc.setValueAtTime(0, [100, 100]);
        assert.throws(() => sc.setTemporalEaseAtKey(1, [new KeyframeEase(0, 50)]), /2 KeyframeEase/);   // échelle 2D : deux
        assert.throws(() => new KeyframeEase(0, 0), /influence/);
        sc.setInterpolationTypeAtKey(1, KeyframeInterpolationType.HOLD);
        assert.strictEqual(sc.keyOutInterpolationType(1), KeyframeInterpolationType.HOLD);
    });

    test('faux AE : dimensions séparées, expression, verrou', () => {
        const s = scene();
        const L = s.comp.layer(2);
        assert.strictEqual(L.transform.property('ADBE Position_0'), null, 'X Position cachée tant que non séparée');
        L.position.dimensionsSeparated = true;
        assert.throws(() => L.position.setValue([1, 2]), /separated/);
        L.transform.property('ADBE Position_0').setValue(42);
        assert.strictEqual(L.property('X Position').value, 42);
        L.position.expression = 'value';
        assert.strictEqual(L.position.expressionEnabled, true);
        s.A.locked = true;
        assert.throws(() => { s.comp.layer(2).position.expression = ''; }, /locked/);
    });

    test('faux AE : effets, préréglage sur les calques sélectionnés, caméra sans boîte', () => {
        const s = scene();
        const A = s.comp.layer(2), B = s.comp.layer(3);
        assert.strictEqual(A.effect('Elastic Controller'), null);
        const file = { name: 'ElasticController.ffx', exists: true, fsName: 'x' };
        s.comp.select(s.B);
        A.applyPreset(file);                                // AE applique aux calques sélectionnés : B, pas A
        assert.strictEqual(A.effect('Elastic Controller'), null);
        assert.strictEqual(B.effect('Elastic Controller').property(1).value, 20);
        assert.strictEqual(B.effect(1).property('Decay').value, 60);
        assert.deepEqual(app.presetsApplied, [{ file: 'ElasticController.ffx', layers: ['B'] }]);
        s.comp.select();
        A.applyPreset(file);                                // rien de sélectionné : le calque appelé
        assert.strictEqual(A.effect('Elastic Controller').name, 'Elastic Controller');
        A.effect('Elastic Controller').remove();
        assert.strictEqual(A.property('ADBE Effect Parade').numProperties, 0);
        assert.throws(() => A.applyPreset({ name: 'x.ffx', exists: false }), /not found/);
        A.selected = true;
        assert.deepEqual(s.comp.selectedLayers.map((l) => l.name), ['A']);
        s.comp.addLayer('Cam', { kind: 'camera' });
        const cam = s.comp.layer(6);
        assert.ok(cam instanceof CameraLayerRef);
        assert.strictEqual(typeof cam.sourceRectAtTime, 'undefined');
        assert.deepEqual(A.sourceRectAtTime(0, false), { top: 0, left: 0, width: 100, height: 100 });
    });

    test('faux AE : un calque est un nouvel objet à chaque accès', () => {
        const s = scene();
        assert.notStrictEqual(s.comp.layer(1), s.comp.layer(1));
        assert.strictEqual(s.comp.layer(1).index, 1);
        assert.strictEqual(s.comp.layer(2).parent.name, 'Parent');
    });

    test('faux AE : verrou et cycle lèvent une erreur', () => {
        const s = scene();
        s.A.locked = true;
        assert.throws(() => { s.comp.layer(2).parent = null; }, /locked/);
        assert.throws(() => { s.comp.layer(1).parent = s.comp.layer(3); }, /cycle/);
    });

    test('faux AE : projet indexé à partir de 1, reset vide tout', () => {
        scene();
        assert.strictEqual(app.project.numItems, 1);
        assert.strictEqual(app.project.item(1).name, 'Comp 1');
        app.reset();
        assert.strictEqual(app.project.numItems, 0);
        assert.strictEqual(app.project.activeItem, null);
    });

    test('bac à sable : $.global est le contexte global', () => {
        const sb = createSandbox();
        vm.runInContext('$.global.X = 42;', sb);
        assert.strictEqual(vm.runInContext('X', sb), 42);
    });
};
