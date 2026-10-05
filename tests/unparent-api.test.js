'use strict';
/* API publique d'Unparent, appelée exactement comme par le pont (SIMING.call). */
const assert = require('assert');
const { scene, otherComp, loadHost, callHost, app } = require('./helpers');

function host() {
    const { sandbox } = loadHost();
    return (fn, args) => {
        const env = callHost(sandbox, 'unparent', fn, args);
        assert.strictEqual(env.ok, true, env.error && env.error.message);
        return env.data;
    };
}
const ids = (s) => ({ compId: s.comp && s.comp.id, targetId: s.target && s.target.id });
const rowNames = (st) => st.entries.map((e) => e.name).join(',');

module.exports = function (test) {
    test('API init : rien de ciblé, message de départ, parents en attente listés', () => {
        const call = host();
        otherComp();
        const st = call('init', {});
        assert.strictEqual(st.target, null);
        assert.strictEqual(st.comp, null);
        assert.strictEqual(st.status.level, 'info');
        assert.ok(/carte Parent/.test(st.status.text), st.status.text);
        assert.strictEqual(st.pending.length, 1);
        assert.strictEqual(st.report, null);
    });

    test('API pick : sans comp active -> erreur', () => {
        const st = host()('pick', {});
        assert.strictEqual(st.status.level, 'error');
        assert.ok(/Aucune composition active/.test(st.status.text));
    });

    test('API pick : rien de sélectionné et aucun parent courant -> erreur', () => {
        scene();
        const st = host()('pick', {});
        assert.strictEqual(st.target, null);
        assert.strictEqual(st.status.level, 'error');
        assert.ok(/sélectionné/.test(st.status.text));
    });

    test('API pick : parent sélectionné -> état complet', () => {
        const s = scene(); s.comp.select(s.P);
        const st = host()('pick', {});
        assert.deepEqual(st.comp, { id: 100, name: 'Comp 1' });
        assert.deepEqual(st.target, { id: s.P.id, name: 'Parent' });
        assert.strictEqual(rowNames(st), 'A,B,D');
        assert.strictEqual(st.plan.primary.label, 'Détacher les 2 restants');
        assert.strictEqual(st.plan.secondary.label, 'Rattacher 1 détaché');
        assert.strictEqual(st.plan.banner, '1 enfant détaché sur 3');
        assert.strictEqual(st.status.level, 'info');
        assert.strictEqual(st.status.text, '3 enfants : 2 lié(s), 1 détaché(s)');
    });

    test('API pick : sans sélection, ré-analyse le parent courant', () => {
        const s = scene(); s.comp.select(s.P);
        const call = host();
        const first = call('pick', {});
        s.comp.select();
        s.A.parent = null;                 // modifié à la main dans AE, sans balise
        const st = call('pick', ids(first));
        assert.strictEqual(st.target.name, 'Parent');
        assert.strictEqual(rowNames(st), 'B,D');
        assert.ok(/mise à jour/.test(st.status.text), st.status.text);
    });

    test('API detach : un enfant -> « « A » détaché »', () => {
        const s = scene(); s.comp.select(s.P);
        const call = host();
        const st0 = call('pick', {});
        const st = call('detach', Object.assign(ids(st0), { ids: [s.A.id] }));
        assert.strictEqual(s.A.parent, null);
        assert.strictEqual(st.status.text, '« A » détaché · Ctrl+Z pour annuler');
        assert.strictEqual(st.status.level, 'ok');
        assert.deepEqual(st.report, { done: 1, skipped: [] });
        assert.strictEqual(st.entries.filter((e) => e.name === 'A')[0].state, 'detached');
    });

    test('API detach puis restore : tout le cycle, libellés et bandeau', () => {
        const s = scene(); s.comp.select(s.P);
        const call = host();
        const st0 = call('pick', {});
        const st1 = call('detach', Object.assign(ids(st0), { ids: st0.plan.primary.ids }));
        assert.strictEqual(st1.status.text, '2 enfants détachés · Ctrl+Z pour annuler');
        assert.strictEqual(st1.plan.primary.label, 'Rattacher les 3 enfants');
        assert.ok(/librement/.test(st1.plan.banner));
        const st2 = call('restore', Object.assign(ids(st1), { ids: st1.plan.primary.ids }));
        assert.strictEqual(st2.status.text, '3 enfants rattachés · Ctrl+Z pour annuler');
        assert.strictEqual(s.D.comment, 'note perso');
        assert.strictEqual(st2.plan.banner, '');
    });

    test('API : comp active changée -> aucun effet, message warn', () => {
        const s = scene(); s.comp.select(s.P);
        const call = host();
        const st0 = call('pick', {});
        const o = otherComp();
        app.project.activeItem = o.comp;
        const st = call('detach', Object.assign(ids(st0), { ids: [s.A.id] }));
        assert.strictEqual(s.A.parent, s.P);
        assert.strictEqual(st.status.level, 'warn');
        assert.strictEqual(st.status.text, 'La composition active a changé : clique sur la carte Parent');
        assert.strictEqual(st.target.name, 'Parent', 'la vue garde le parent courant');
    });

    test('API : liste vide -> warn, rien ne change', () => {
        const s = scene(); s.comp.select(s.P);
        const call = host();
        const st0 = call('pick', {});
        const st = call('restore', Object.assign(ids(st0), { ids: [] }));
        assert.strictEqual(st.status.text, 'Aucun enfant à rattacher');
        assert.strictEqual(st.status.level, 'warn');
        assert.strictEqual(app.undoGroups.length, 0);
    });

    test('API : calque verrouillé -> rapport, statut warn « 1 ignoré(s) »', () => {
        const s = scene(); s.comp.select(s.P); s.A.locked = true;
        const call = host();
        const st0 = call('pick', {});
        const st = call('detach', Object.assign(ids(st0), { ids: st0.plan.primary.ids }));
        assert.strictEqual(st.report.done, 1);
        assert.ok(/verrouillé/.test(st.report.skipped[0]));
        assert.strictEqual(st.status.level, 'warn');
        assert.strictEqual(st.status.text, '1 enfant détaché · 1 ignoré(s) · Ctrl+Z pour annuler');
    });

    test('API refresh : parent supprimé ou comp supprimée -> warn, sans erreur', () => {
        const s = scene(); s.comp.select(s.P);
        const call = host();
        const st0 = call('pick', {});
        s.comp.removeLayer(s.P);
        const st1 = call('refresh', ids(st0));
        assert.strictEqual(st1.status.level, 'warn');
        assert.ok(/Le parent n'existe plus dans « Comp 1 »/.test(st1.status.text), st1.status.text);
        assert.strictEqual(st1.target, null);
        app.project.items = [];
        const st2 = call('refresh', ids(st0));
        assert.strictEqual(st2.comp, null);
        assert.ok(/n'existe plus/.test(st2.status.text));
        const st3 = call('detach', Object.assign(ids(st0), { ids: [s.A.id] }));
        assert.strictEqual(st3.status.level, 'warn');
    });

    test('API restorePending : rattache un groupe dans une autre comp, garde le parent courant', () => {
        const s = scene(); s.comp.select(s.P);
        const o = otherComp();
        const call = host();
        const st0 = call('pick', {});
        assert.strictEqual(st0.pending.length, 1);
        const g = st0.pending[0];
        assert.deepEqual(g, { compId: 200, compName: 'Comp 2', parentName: 'Tete', found: true, ids: [o.E1.id, o.E2.id] });
        const st = call('restorePending', Object.assign(ids(st0), { pendingCompId: g.compId, ids: g.ids, parentName: g.parentName }));
        assert.strictEqual(o.E1.parent, o.T);
        assert.strictEqual(st.status.text, '2 enfants rattachés à « Tete » · Ctrl+Z pour annuler');
        assert.deepEqual(st.pending, []);
        assert.strictEqual(st.target.name, 'Parent');
        const gone = call('restorePending', { pendingCompId: 999, ids: [1], parentName: 'X' });
        assert.strictEqual(gone.status.level, 'warn');
    });

    test('API : noms hostiles (guillemets, antislash, retour à la ligne, HTML) intacts', () => {
        const s = scene(); s.comp.select(s.P);
        s.A.name = 'Bras "G" l\'été \\ <b>x</b>\nfin';
        const call = host();
        const st0 = call('pick', {});
        assert.ok(st0.entries.some((e) => e.name === s.A.name));
        const st = call('detach', Object.assign(ids(st0), { ids: [s.A.id] }));
        assert.strictEqual(st.status.text, '« ' + s.A.name + ' » détaché · Ctrl+Z pour annuler');
    });
};
