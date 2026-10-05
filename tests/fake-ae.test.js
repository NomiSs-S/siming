'use strict';
/* Le faux After Effects imite bien les pièges d'ExtendScript. */
const assert = require('assert');
const vm = require('vm');
const { createSandbox, app } = require('./fake-ae');
const { scene } = require('./helpers');

module.exports = function (test) {
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
