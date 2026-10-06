'use strict';
/* Libellés : API hôte à travers le routeur (analyser, appliquer), faux After Effects. */
const assert = require('assert');
const { loadHost, callHost, labelScene, app } = require('./helpers');

function call(sandbox, fn, args) {
    const env = callHost(sandbox, 'labels', fn, args);
    assert.ok(env.ok, env.error && env.error.message);
    return env.data;
}

/** proposed par nom de calque. */
const proposals = (s) => Object.fromEntries(s.entries.map((e) => [e.name, e.proposed]));

module.exports = function (test) {
    test('libellés api : init donne la palette (Préférences), les natures et les règles par défaut', () => {
        const { sandbox } = loadHost();
        app.preferences.names[8] = 'Logos client';       // étiquette n° 9 renommée
        app.preferences.labels[8] = 'FF00AA00';
        const s = call(sandbox, 'init', {});
        assert.strictEqual(s.palette.length, 17);
        assert.deepEqual(s.palette[0], { index: 0, color: null, name: 'Aucune' });
        assert.deepEqual(s.palette[1], { index: 1, color: '#B53838', name: 'Rouge' }, 'nom d\'origine anglais -> français');
        assert.deepEqual(s.palette[9], { index: 9, color: '#00AA00', name: 'Logos client' }, 'nom et couleur personnalisés');
        assert.strictEqual(s.palette[16].name, 'Vert foncé');
        assert.strictEqual(s.types[0].name, 'Texte');
        assert.strictEqual(s.keep, -1);
        assert.strictEqual(s.defaults.types.video, 13);
        assert.deepEqual(s.entries, []);
        assert.strictEqual(s.status.level, 'info');
    });

    test('libellés api : analyse de la sélection et de la composition, règles par défaut', () => {
        const { sandbox } = loadHost();
        assert.strictEqual(call(sandbox, 'analyze', { scope: 'selection' }).status.level, 'error', 'aucune comp active');
        const { comp, L } = labelScene();
        const none = call(sandbox, 'analyze', { scope: 'selection' });
        assert.strictEqual(none.status.level, 'warn');
        assert.ok(/Aucun calque sélectionné dans « Pub »/.test(none.status.text));
        comp.select(L.title, L.logo);
        const sel = call(sandbox, 'analyze', { scope: 'selection' });
        assert.deepEqual(sel.comp, { id: 400, name: 'Pub' });
        assert.deepEqual(sel.ids, [L.title.id, L.logo.id]);
        assert.deepEqual(sel.entries[1], { id: L.logo.id, name: 'LOGO_client.png', type: 'image', rule: 'word:0', reason: 'mot « logo »', current: 0, proposed: 9 });
        assert.strictEqual(sel.status.text, '2 calques analysés · 2 libellés à changer');
        const all = call(sandbox, 'analyze', { scope: 'comp' });
        assert.deepEqual(proposals(all), {
            'Titre': 2, 'Logo animé': 9, 'Forme 1': 8, 'LOGO_client.png': 9, 'marque.png': 9, 'bg_ciel.jpg': 1,
            'Plan 01.mov': 13, 'Solide gris': 1, 'Nul 1': 1, 'Calque d\'effets': 10, 'Musique.wav': 7,
            'Scène 1': 15, 'Caméra 1': 4,
        });
        assert.strictEqual(all.scope, 'comp');
        assert.strictEqual(all.status.text, '13 calques analysés · 13 libellés à changer');
    });

    test('libellés api : règles de la vue, ré-analyse des mêmes calques par identifiants', () => {
        const { sandbox } = loadHost();
        const { comp, L } = labelScene();
        L.shape.label = 8;
        const rules = { words: [{ words: 'plan', label: 14 }], types: { text: -1, shape: 8 } };
        const s = call(sandbox, 'analyze', { scope: 'comp', rules });
        const p = proposals(s);
        assert.strictEqual(p['Plan 01.mov'], 14, 'mot-clé de la vue');
        assert.strictEqual(p['LOGO_client.png'], 11, 'plus de règle logo : nature image');
        assert.strictEqual(p['Titre'], -1, 'texte : ne pas changer');
        assert.strictEqual(s.status.text, '13 calques analysés · 10 libellés à changer', 'déjà bon et « ne pas changer » non comptés');
        comp.select();
        comp.removeLayer(L.video);
        const again = call(sandbox, 'analyze', { compId: 400, ids: [L.video.id, L.logo.id], rules });
        assert.deepEqual(again.ids, [L.logo.id], 'calque supprimé ignoré, sélection vide sans effet');
        const gone = call(sandbox, 'analyze', { compId: 400, ids: [L.video.id] });
        assert.strictEqual(gone.status.level, 'warn');
        assert.strictEqual(call(sandbox, 'analyze', { compId: 999, ids: [1] }).status.level, 'warn');
    });

    test('libellés api : appliquer pose les étiquettes en un seul Ctrl+Z et renvoie la nouvelle analyse', () => {
        const { sandbox } = loadHost();
        const { L } = labelScene();
        const ids = [L.title.id, L.logo.id, L.shape.id];
        const s = call(sandbox, 'apply', {
            compId: 400, ids,
            changes: [{ id: L.title.id, label: 2 }, { id: L.logo.id, label: 5 }, { id: L.shape.id, label: -1 }, { id: 9999, label: 3 }],
        });
        assert.deepEqual([L.title.label, L.logo.label, L.shape.label], [2, 5, 0], 'Ne pas changer : rien posé');
        assert.deepEqual(app.undoGroups, ['Libellés : appliquer']);
        assert.strictEqual(app.undoDepth, 0);
        assert.deepEqual(s.report, { done: 2, skipped: ['calque n°9999 : introuvable'] });
        assert.strictEqual(s.status.text, '2 libellés posés · 1 ignoré(s) · Ctrl+Z pour annuler');
        assert.strictEqual(s.status.level, 'warn');
        assert.deepEqual(s.entries.map((e) => [e.name, e.current, e.proposed]), [['Titre', 2, 2], ['LOGO_client.png', 5, 9], ['Forme 1', 0, 8]]);
        const ok = call(sandbox, 'apply', { compId: 400, changes: [{ id: L.shape.id, label: 8 }] });
        assert.strictEqual(ok.status.text, '1 libellé posé · Ctrl+Z pour annuler');
        assert.strictEqual(ok.status.level, 'ok');
        assert.deepEqual(ok.ids, [L.shape.id], 'sans ids : les calques changés');
        const nothing = call(sandbox, 'apply', { compId: 400, ids, changes: [] });
        assert.strictEqual(nothing.status.text, 'Aucun libellé à changer');
        assert.strictEqual(app.undoGroups.length, 2, 'rien à poser : pas de groupe d\'annulation');
        assert.strictEqual(call(sandbox, 'apply', { compId: 999, changes: [{ id: 1, label: 2 }] }).status.level, 'warn');
    });
};
