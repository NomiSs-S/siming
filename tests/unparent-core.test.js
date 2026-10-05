'use strict';
/*
 * Cœur Unparent (fonctions _core). Les objets viennent d'un autre contexte vm :
 * on compare les structures avec deepEqual (non strict).
 */
const assert = require('assert');
const { FakeComp } = require('./fake-ae');
const { scene, otherComp, loadUnparent, app } = require('./helpers');

const names = (entries) => entries.map((e) => e.name).sort().join(',');
const byName = (entries, n) => entries.filter((e) => e.name === n)[0];

module.exports = function (test) {
    // ---------------------------------------------------------------- balises
    test('parseTag lit une balise en fin de commentaire', () => {
        const { core } = loadUnparent();
        assert.deepEqual(core.parseTag('note [UP|12|Parent]'), { parentId: 12, parentName: 'Parent' });
        assert.strictEqual(core.parseTag('pas de balise'), null);
        assert.strictEqual(core.parseTag(''), null);
        assert.strictEqual(core.parseTag('[UP|12|Parent] puis du texte'), null);
    });

    test('addTag / removeTag conservent le commentaire existant', () => {
        const { core } = loadUnparent();
        assert.strictEqual(core.addTag('', 5, 'P'), '[UP|5|P]');
        assert.strictEqual(core.addTag('note', 5, 'P'), 'note [UP|5|P]');
        assert.strictEqual(core.addTag('note [UP|1|Ancien]', 5, 'P'), 'note [UP|5|P]');
        assert.strictEqual(core.removeTag('note [UP|5|P]'), 'note');
        assert.strictEqual(core.removeTag('[UP|5|P]'), '');
    });

    test('les balises supportent les noms avec ] et |', () => {
        const { core } = loadUnparent();
        const c = core.addTag('', 7, 'Nom [x] | y');
        assert.deepEqual(core.parseTag(c), { parentId: 7, parentName: 'Nom [x] | y' });
    });

    test("layerId utilise Layer.id, sinon l'index (AE < 22)", () => {
        const { S } = loadUnparent();
        const comp = new FakeComp(300, 'Sans id', { noIds: true });
        comp.addLayer('X');
        assert.strictEqual(S.ae.layerId(comp.layer(1)), 1);
        const s = scene();
        assert.strictEqual(S.ae.layerId(s.comp.layer(1)), s.P.id);
    });

    // ---------------------------------------------------------------- analyse
    test('analyze liste les enfants liés et détachés, sans le parent ni les autres', () => {
        const { core } = loadUnparent();
        const s = scene();
        const entries = core.analyze(s.comp, s.comp.layer(1));
        assert.strictEqual(names(entries), 'A,B,D');
        assert.strictEqual(byName(entries, 'A').state, 'linked');
        assert.strictEqual(byName(entries, 'D').state, 'detached');
    });

    test('resolveTarget : aucun calque sélectionné', () => {
        const { core } = loadUnparent();
        const s = scene();
        const r = core.resolveTarget(s.comp);
        assert.strictEqual(r.target, null);
        assert.ok(/sélectionné/.test(r.error), r.error);
    });

    test('resolveTarget : calque sans enfant', () => {
        const { core } = loadUnparent();
        const s = scene();
        s.comp.select(s.C);
        const r = core.resolveTarget(s.comp);
        assert.strictEqual(r.target.name, 'C');
        assert.strictEqual(r.entries.length, 0);
        assert.ok(/aucun enfant/.test(r.error), r.error);
    });

    test('resolveTarget : le parent sélectionné est ciblé', () => {
        const { core } = loadUnparent();
        const s = scene();
        s.comp.select(s.P);
        const r = core.resolveTarget(s.comp);
        assert.strictEqual(r.target.name, 'Parent');
        assert.strictEqual(names(r.entries), 'A,B,D');
        assert.strictEqual(r.error, undefined);
    });

    test("resolveTarget : un enfant détaché sélectionné remonte à son parent d'origine", () => {
        const { core } = loadUnparent();
        const s = scene();
        s.comp.select(s.D);
        const r = core.resolveTarget(s.comp);
        assert.strictEqual(r.target.name, 'Parent');
        assert.ok(/parent d.origine/.test(r.note), r.note);
    });

    // ---------------------------------------------------------------- détacher
    test('detach : parent à null, balise posée, mémoire remplie, undo équilibré', () => {
        const { core } = loadUnparent();
        const s = scene();
        s.A.comment = 'commentaire A';
        const report = core.detach(s.comp, [s.A.id, s.B.id]);
        assert.strictEqual(report.done, 2);
        assert.deepEqual(report.skipped, []);
        assert.strictEqual(s.A.parent, null);
        assert.strictEqual(s.A.comment, 'commentaire A [UP|' + s.P.id + '|Parent]');
        assert.strictEqual(s.B.comment, '[UP|' + s.P.id + '|Parent]');
        assert.deepEqual(core.memory['100:' + s.A.id], { parentId: s.P.id, parentName: 'Parent' });
        assert.strictEqual(app.undoDepth, 0);
        assert.deepEqual(app.undoGroups, ['Unparent : détacher']);
    });

    test('detach : calque verrouillé ignoré et signalé, les autres traités', () => {
        const { core } = loadUnparent();
        const s = scene();
        s.A.locked = true;
        const report = core.detach(s.comp, [s.A.id, s.B.id]);
        assert.strictEqual(report.done, 1);
        assert.strictEqual(report.skipped.length, 1);
        assert.ok(/A : calque verrouillé/.test(report.skipped[0]), report.skipped[0]);
        assert.strictEqual(s.B.parent, null);
    });

    test('detach : calque déjà détaché ou introuvable signalé', () => {
        const { core } = loadUnparent();
        const s = scene();
        const report = core.detach(s.comp, [s.D.id, 424242]);
        assert.strictEqual(report.done, 0);
        assert.ok(/D : déjà détaché/.test(report.skipped[0]), report.skipped[0]);
        assert.ok(/424242 : introuvable/.test(report.skipped[1]), report.skipped[1]);
    });

    // ---------------------------------------------------------------- rattacher
    test('restore : parent réaffecté, balise retirée, mémoire nettoyée', () => {
        const { core } = loadUnparent();
        const s = scene();
        s.A.comment = 'commentaire A';
        core.detach(s.comp, [s.A.id, s.B.id]);
        const report = core.restore(s.comp, [s.A.id, s.B.id]);
        assert.strictEqual(report.done, 2);
        assert.deepEqual(report.skipped, []);
        assert.strictEqual(s.A.parent, s.P);
        assert.strictEqual(s.B.parent, s.P);
        assert.strictEqual(s.A.comment, 'commentaire A');
        assert.strictEqual(s.B.comment, '');
        assert.strictEqual(core.memory['100:' + s.A.id], undefined);
        assert.strictEqual(app.undoDepth, 0);
        assert.strictEqual(app.undoGroups[app.undoGroups.length - 1], 'Unparent : rattacher');
    });

    test("restore après redémarrage d'AE : la balise seule suffit", () => {
        const { core } = loadUnparent();
        const s = scene();
        const report = core.restore(s.comp, [s.D.id]);
        assert.strictEqual(report.done, 1);
        assert.strictEqual(s.D.parent, s.P);
        assert.strictEqual(s.D.comment, 'note perso');
    });

    test('restore : parent renommé, retrouvé par identifiant', () => {
        const { core } = loadUnparent();
        const s = scene();
        s.P.name = 'Parent v2';
        const report = core.restore(s.comp, [s.D.id]);
        assert.strictEqual(report.done, 1, report.skipped.join(' / '));
        assert.strictEqual(s.D.parent, s.P);
    });

    test('restore : identifiants réattribués (projet rouvert), retrouvé par nom unique', () => {
        const { core } = loadUnparent();
        const s = scene();
        const oldId = s.P.id;
        s.P.id = 5000;
        s.C.id = oldId;
        const report = core.restore(s.comp, [s.D.id]);
        assert.strictEqual(report.done, 1, report.skipped.join(' / '));
        assert.strictEqual(s.D.parent, s.P);
    });

    test('restore : parent disparu, calque ignoré avec message, balise conservée', () => {
        const { core } = loadUnparent();
        const s = scene();
        s.comp.removeLayer(s.P);
        const report = core.restore(s.comp, [s.D.id]);
        assert.strictEqual(report.done, 0);
        assert.ok(/introuvable/.test(report.skipped[0]), report.skipped[0]);
        assert.strictEqual(s.D.parent, null);
        assert.ok(/\[UP\|/.test(s.D.comment));
        assert.strictEqual(app.undoDepth, 0);
    });

    test('restore : calque sans lien mémorisé ignoré', () => {
        const { core } = loadUnparent();
        const s = scene();
        const report = core.restore(s.comp, [s.C.id]);
        assert.strictEqual(report.done, 0);
        assert.ok(/aucun lien mémorisé/.test(report.skipped[0]), report.skipped[0]);
    });

    test('cycle complet : détacher, rattacher, re-détacher sans résidu', () => {
        const { core } = loadUnparent();
        const s = scene();
        core.detach(s.comp, [s.A.id]);
        core.restore(s.comp, [s.A.id]);
        core.detach(s.comp, [s.A.id]);
        assert.strictEqual(s.A.comment, '[UP|' + s.P.id + '|Parent]');
        core.restore(s.comp, [s.A.id]);
        assert.strictEqual(s.A.comment, '');
        assert.strictEqual(s.A.parent, s.P);
    });

    // ---------------------------------------------------------------- plan d'action
    const L = (id) => ({ id, name: 'L' + id, state: 'linked' });
    const X = (id) => ({ id, name: 'X' + id, state: 'detached' });

    test('planActions : tout lié -> détacher tout, pas de secondaire ni de bandeau', () => {
        const { core } = loadUnparent();
        const p = core.planActions([L(1), L(2), L(3)]);
        assert.strictEqual(p.primary.action, 'detach');
        assert.deepEqual(p.primary.ids, [1, 2, 3]);
        assert.strictEqual(p.primary.label, 'Détacher les 3 enfants');
        assert.strictEqual(p.secondary, null);
        assert.strictEqual(p.banner, '');
    });

    test('planActions : mixte -> détacher les restants + rattacher les détachés', () => {
        const { core } = loadUnparent();
        const p = core.planActions([L(1), X(2), L(3), X(4)]);
        assert.strictEqual(p.primary.label, 'Détacher les 2 restants');
        assert.deepEqual(p.primary.ids, [1, 3]);
        assert.strictEqual(p.secondary.action, 'restore');
        assert.deepEqual(p.secondary.ids, [2, 4]);
        assert.strictEqual(p.secondary.label, 'Rattacher les 2 détachés');
        assert.strictEqual(p.banner, '2 enfants détachés sur 4');
    });

    test('planActions : tout détaché -> rattacher tout, bandeau « parent libre »', () => {
        const { core } = loadUnparent();
        const p = core.planActions([X(1), X(2)]);
        assert.strictEqual(p.primary.action, 'restore');
        assert.strictEqual(p.primary.label, 'Rattacher les 2 enfants');
        assert.strictEqual(p.secondary, null);
        assert.strictEqual(p.banner, 'Tous les enfants sont détachés : le parent bouge librement');
    });

    test('planActions : singuliers et liste vide', () => {
        const { core } = loadUnparent();
        assert.strictEqual(core.planActions([L(1)]).primary.label, 'Détacher 1 enfant');
        assert.strictEqual(core.planActions([X(1)]).primary.label, 'Rattacher 1 enfant');
        const m = core.planActions([L(1), X(2)]);
        assert.strictEqual(m.primary.label, 'Détacher le dernier lié');
        assert.strictEqual(m.secondary.label, 'Rattacher 1 détaché');
        assert.strictEqual(m.banner, '1 enfant détaché sur 2');
        const e = core.planActions([]);
        assert.strictEqual(e.primary, null);
        assert.strictEqual(e.banner, '');
    });

    // ---------------------------------------------------------------- en attente
    test('findPending : groupe les détachés par comp et parent, exclut le parent ciblé', () => {
        const { core } = loadUnparent();
        const s = scene();
        const o = otherComp();
        assert.strictEqual(core.findPending(app.project, null, null).length, 2);
        const groups = core.findPending(app.project, s.comp.id, s.P.id);
        assert.strictEqual(groups.length, 1);
        assert.strictEqual(groups[0].parentName, 'Tete');
        assert.strictEqual(groups[0].compName, 'Comp 2');
        assert.strictEqual(groups[0].found, true);
        assert.deepEqual(groups[0].ids, [o.E1.id, o.E2.id]);
    });

    test('findPending : ignore les calques re-liés à la main, signale un parent disparu', () => {
        const { core } = loadUnparent();
        const s = scene();
        const o = otherComp();
        o.E2.parent = o.T;
        assert.deepEqual(core.findPending(app.project, s.comp.id, s.P.id)[0].ids, [o.E1.id]);
        o.comp.removeLayer(o.T);
        const groups = core.findPending(app.project, s.comp.id, s.P.id);
        assert.strictEqual(groups.length, 1);
        assert.strictEqual(groups[0].found, false);
        assert.strictEqual(groups[0].parentName, 'Tete');
        assert.deepEqual(core.findPending(null, null, null), []);
    });
};
