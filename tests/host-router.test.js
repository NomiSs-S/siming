'use strict';
/* Routeur SIMING.call, helpers After Effects, chargement des outils hôtes. */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { loadHost, callHost, scene, otherComp, app } = require('./helpers');

function withDemo(sandbox) {
    vm.runInContext(
        "SIMING.registerTool('demo', {" +
        "  echo: function (a) { return a; }," +
        "  boom: function () { throw new Error('cassé'); }," +
        "  nothing: function () {}," +
        "  _secret: function () { return 1; }" +
        "});", sandbox);
}

module.exports = function (test) {
    test('routeur : appel réussi, données intactes (accents, guillemets, retours à la ligne)', () => {
        const { sandbox } = loadHost();
        withDemo(sandbox);
        const args = { nom: 'Bras "G" l\'été \\ é\nfin', n: [1, 2], ok: true };
        const env = callHost(sandbox, 'demo', 'echo', args);
        assert.strictEqual(env.ok, true);
        assert.deepEqual(env.data, args);
    });

    test('routeur : une fonction sans retour donne data = null', () => {
        const { sandbox } = loadHost();
        withDemo(sandbox);
        assert.deepEqual(callHost(sandbox, 'demo', 'nothing', {}), { ok: true, data: null });
    });

    test('routeur : outil ou fonction inconnus, fonction privée, erreur attrapée', () => {
        const { sandbox } = loadHost();
        withDemo(sandbox);
        assert.ok(/Outil inconnu : nope/.test(callHost(sandbox, 'nope', 'x').error.message));
        assert.ok(/Fonction inconnue : demo.absente/.test(callHost(sandbox, 'demo', 'absente').error.message));
        assert.ok(/Fonction inconnue : demo._secret/.test(callHost(sandbox, 'demo', '_secret').error.message));
        const boom = callHost(sandbox, 'demo', 'boom');
        assert.strictEqual(boom.ok, false);
        assert.strictEqual(boom.error.message, 'cassé');
    });

    test('routeur : arguments illisibles -> erreur JSON, pas de plantage', () => {
        const { sandbox } = loadHost();
        withDemo(sandbox);
        const raw = vm.runInContext('SIMING.call("demo","echo","%7Bpas%20du%20json")', sandbox);
        const env = JSON.parse(decodeURIComponent(raw));
        assert.strictEqual(env.ok, false);
        assert.ok(/JSON invalide/.test(env.error.message));
    });

    test('siming.status liste les outils chargés, sans erreur', () => {
        const { sandbox } = loadHost();
        const env = callHost(sandbox, 'siming', 'status');
        assert.strictEqual(env.ok, true);
        assert.deepEqual(env.data.errors, []);
        assert.ok(Array.isArray(env.data.tools));
    });

    test('loadTools : un outil hôte cassé est signalé sans bloquer les autres', () => {
        const { sandbox } = loadHost();
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'siming-'));
        fs.writeFileSync(path.join(dir, 'a-casse.jsx'), "throw new Error('module cassé');");
        fs.writeFileSync(path.join(dir, 'b-ok.jsx'), "SIMING.registerTool('bok', { ping: function () { return 'pong'; } });");
        vm.runInContext('SIMING.loadTools(new Folder(' + JSON.stringify(dir) + '))', sandbox);
        const st = callHost(sandbox, 'siming', 'status').data;
        assert.ok(st.errors.some((e) => /a-casse\.jsx : .*module cassé/.test(e)), st.errors.join(' | '));
        assert.strictEqual(callHost(sandbox, 'bok', 'ping').data, 'pong');
    });

    test('ae : comp active, recherche par id et par nom, comp par id', () => {
        const { S } = loadHost();
        const s = scene();
        otherComp();
        assert.strictEqual(S.ae.getActiveComp().name, 'Comp 1');
        assert.strictEqual(S.ae.findLayerById(s.comp, s.B.id).name, 'B');
        assert.strictEqual(S.ae.findLayerById(s.comp, 99999), null);
        assert.strictEqual(S.ae.findLayersByName(s.comp, 'A').length, 1);
        assert.strictEqual(S.ae.findCompById(200).name, 'Comp 2');
        assert.strictEqual(S.ae.findCompById(999), null);
        assert.ok(S.ae.sameLayer(s.comp.layer(1), s.comp.layer(1)));
        app.project.activeItem = { name: 'métrage' };
        assert.strictEqual(S.ae.getActiveComp(), null);
    });

    test('ae.undo : groupe fermé même si la fonction lève', () => {
        const { S } = loadHost();
        assert.throws(() => S.ae.undo('test', () => { throw new Error('boom'); }), /boom/);
        assert.strictEqual(app.undoDepth, 0);
        assert.strictEqual(S.ae.undo('test', () => 42), 42);
    });

    test('plural', () => {
        const { S } = loadHost();
        assert.strictEqual(S.plural(1, 'enfant', 'enfants'), '1 enfant');
        assert.strictEqual(S.plural(0, 'enfant', 'enfants'), '0 enfants');
    });
};
