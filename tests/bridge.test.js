'use strict';
/* Pont client -> hôte, de bout en bout sur le faux AE (sans DOM). */
const assert = require('assert');
const vm = require('vm');
const { scene, loadHost, loadClientScripts, hostEvalScript } = require('./helpers');

function clientContext() {
    const win = { console };
    win.window = win;
    vm.createContext(win);
    loadClientScripts(win, ['js/siming.js', 'js/bridge.js']);
    return win;
}

module.exports = function (test) {
    test('pont : siming.status à travers le pont', async () => {
        const { sandbox } = loadHost();
        const win = clientContext();
        const bridge = win.SIMING.createBridge(hostEvalScript(sandbox));
        const st = await bridge.call('siming', 'status', {});
        assert.deepEqual(st.tools, ['quicktools', 'unparent']);
        assert.deepEqual(st.errors, []);
    });

    test('pont : pick puis detach agissent sur les calques', async () => {
        const s = scene(); s.comp.select(s.P);
        const { sandbox } = loadHost();
        const bridge = clientContext().SIMING.createBridge(hostEvalScript(sandbox));
        const st0 = await bridge.call('unparent', 'pick', {});
        const st1 = await bridge.call('unparent', 'detach', { compId: st0.comp.id, targetId: st0.target.id, ids: [s.A.id] });
        assert.strictEqual(s.A.parent, null);
        assert.strictEqual(st1.status.text, '« A » détaché · Ctrl+Z pour annuler');
    });

    test('pont : arguments hostiles transmis sans injection', async () => {
        const { sandbox } = loadHost();
        vm.runInContext("SIMING.registerTool('demo', { echo: function (a) { return a; } });", sandbox);
        const bridge = clientContext().SIMING.createBridge(hostEvalScript(sandbox));
        const args = { s: '");$.global.PWNED=1;("', q: "l'été \\ \n é" };
        assert.deepEqual(await bridge.call('demo', 'echo', args), args);
        assert.strictEqual(sandbox.PWNED, undefined);
    });

    test("pont : erreur de l'hôte -> promesse rejetée avec son message", async () => {
        const { sandbox } = loadHost();
        const bridge = clientContext().SIMING.createBridge(hostEvalScript(sandbox));
        await assert.rejects(bridge.call('nope', 'x', {}), /Outil inconnu : nope/);
    });

    test('pont : « EvalScript error. » et réponse illisible -> erreurs claires', async () => {
        const win = clientContext();
        const failing = win.SIMING.createBridge((script, cb) => setTimeout(() => cb('EvalScript error.'), 0));
        await assert.rejects(failing.call('siming', 'status', {}), /Erreur du script hôte/);
        const garbage = win.SIMING.createBridge((script, cb) => setTimeout(() => cb('%E0%A4%A'), 0));
        await assert.rejects(garbage.call('siming', 'status', {}), /illisible/);
    });

    test('réglages : lecture, écriture, repli sans localStorage', () => {
        const win = clientContext();
        assert.strictEqual(win.SIMING.settings.get('x', 'défaut'), 'défaut');
        win.SIMING.settings.set('x', 'y');   // pas de localStorage ici : ne lève pas
        const store = {};
        win.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } };
        win.SIMING.settings.set('lastTool', 'unparent');
        assert.strictEqual(store['siming.lastTool'], 'unparent');
        assert.strictEqual(win.SIMING.settings.get('lastTool', ''), 'unparent');
        assert.strictEqual(win.SIMING.plural(2, 'enfant', 'enfants'), '2 enfants');
    });
};
