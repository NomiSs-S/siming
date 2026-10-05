'use strict';
/* Vue Unparent montée sur jsdom, branchée sur le vrai cœur hôte via le pont (faux AE). */
const assert = require('assert');
const { scene, otherComp, loadHost, makeDom, hostEvalScript } = require('./helpers');

const SCRIPTS = ['js/siming.js', 'js/icons.js', 'js/ui/dom.js', 'js/ui/controls.js', 'js/bridge.js', 'tools/unparent.js'];

async function setup(opts) {
    opts = opts || {};
    const s = scene();
    if (opts.select !== false) s.comp.select(s.P);
    if (opts.prepare) opts.prepare(s);
    const { sandbox } = loadHost();
    const win = makeDom(SCRIPTS);
    const counter = { calls: 0 };
    const bridge = opts.bridge ? opts.bridge(win) : win.SIMING.createBridge(hostEvalScript(sandbox, counter));
    const status = win.SIMING.ui.statusLine();
    const view = win.document.createElement('section');
    view.tabIndex = -1;
    win.document.body.append(view, status);
    const api = win.SIMING.toolDefs.unparent.mount(view, {
        bridge, ui: win.SIMING.ui, status, settings: win.SIMING.settings,
        meta: { id: 'unparent', name: 'Unparent', icon: 'delier', version: '2.0.0' },
    });
    await api.ready;
    const $ = (sel) => view.querySelector(sel);
    const $$ = (sel) => Array.from(view.querySelectorAll(sel));
    const click = async (el) => { el.click(); await api.idle(); };
    return { s, win, view, api, status, counter, $, $$, click };
}
const rowNames = (t) => t.$$('.s-row-name').map((e) => e.textContent).join(',');

module.exports = function (test) {
    test('vue : état de départ (carte vide, bouton inactif, sections absentes)', async () => {
        const t = await setup({ select: false, prepare: (s) => { s.D.comment = ''; } });   // sans D détaché, rien n'est en attente
        assert.ok(t.$('[data-role=card]').classList.contains('is-empty'));
        assert.ok(/Prendre le calque/.test(t.$('.s-card-title').textContent));
        assert.ok(/carte Parent/.test(t.status.text), t.status.text);
        assert.strictEqual(t.status.level, 'info');
        assert.strictEqual(t.$('[data-role=primary]').disabled, true);
        assert.strictEqual(t.$('[data-role=secondary]').hidden, true);
        assert.strictEqual(t.$('[data-role=banner]').hidden, true);
        assert.strictEqual(t.$('[data-role=children]').hidden, true);
        assert.strictEqual(t.$('[data-role=pending]').hidden, true);
    });

    test('vue : clic sur la carte = prendre la sélection, tout est à jour', async () => {
        const t = await setup();
        await t.click(t.$('[data-role=card]'));
        assert.ok(!t.$('[data-role=card]').classList.contains('is-empty'));
        assert.strictEqual(t.$('.s-card-title').textContent, 'Parent');
        assert.strictEqual(t.$('.s-card-sub').textContent, '3 enfants · Comp 1');
        assert.strictEqual(rowNames(t), 'A,B,D');
        assert.deepEqual(t.$$('.s-pill').map((p) => p.textContent), ['lié', 'lié', 'détaché']);
        assert.strictEqual(t.$('[data-role=primary]').textContent, 'Détacher les 2 restants');
        assert.strictEqual(t.$('[data-role=primary]').disabled, false);
        assert.strictEqual(t.$('[data-role=secondary]').hidden, false);
        assert.strictEqual(t.$('[data-role=secondary]').textContent, 'Rattacher 1 détaché');
        assert.strictEqual(t.$('.s-banner-text').textContent, '1 enfant détaché sur 3');
        assert.strictEqual(t.$('.s-counter').textContent, '1 / 3 détaché');
        assert.deepEqual(t.$$('.s-seg-btn').map((b) => b.textContent), ['Tous3', 'Liés2', 'Détachés1']);
        assert.strictEqual(t.status.text, '3 enfants : 2 lié(s), 1 détaché(s)');
    });

    test('vue : clic sur une ligne = action immédiate sur cet enfant', async () => {
        const t = await setup();
        await t.click(t.$('[data-role=card]'));
        await t.click(t.$$('.s-row')[0]);
        assert.strictEqual(t.s.A.parent, null);
        assert.strictEqual(t.status.text, '« A » détaché · Ctrl+Z pour annuler');
        assert.strictEqual(t.status.level, 'ok');
        await t.click(t.$$('.s-row')[0]);
        assert.strictEqual(t.s.A.parent, t.s.P, 'un second clic rattache');
    });

    test('vue : bouton principal puis « Rattacher », bandeau « parent libre »', async () => {
        const t = await setup();
        await t.click(t.$('[data-role=card]'));
        await t.click(t.$('[data-role=primary]'));
        assert.strictEqual(t.s.B.parent, null);
        assert.strictEqual(t.$('[data-role=primary]').textContent, 'Rattacher les 3 enfants');
        assert.strictEqual(t.$('[data-role=secondary]').hidden, true);
        assert.ok(/librement/.test(t.$('.s-banner-text').textContent));
        await t.click(t.$('[data-role=primary]'));
        assert.strictEqual(t.s.D.comment, 'note perso');
        assert.strictEqual(t.$('[data-role=banner]').hidden, true);
    });

    test('vue : bouton secondaire = rattacher les détachés seulement', async () => {
        const t = await setup();
        await t.click(t.$('[data-role=card]'));
        await t.click(t.$('[data-role=secondary]'));
        assert.strictEqual(t.s.D.parent, t.s.P);
        assert.strictEqual(t.status.text, '« D » rattaché · Ctrl+Z pour annuler');
    });

    test('vue : filtre Détachés puis clic sur la ligne filtrée', async () => {
        const t = await setup();
        await t.click(t.$('[data-role=card]'));
        t.$$('.s-seg-btn')[2].click();
        assert.strictEqual(rowNames(t), 'D');
        await t.click(t.$$('.s-row')[0]);
        assert.strictEqual(t.s.D.parent, t.s.P);
        assert.strictEqual(t.$('.s-empty').textContent, 'Aucun enfant dans ce filtre');
        t.$$('.s-seg-btn')[1].click();
        assert.strictEqual(rowNames(t), 'A,B,D');
    });

    test('vue : une seule requête à la fois (double clic rapide)', async () => {
        const t = await setup();
        const before = t.counter.calls;
        t.$('[data-role=card]').click();
        t.$('[data-role=card]').click();
        await t.api.idle();
        assert.strictEqual(t.counter.calls - before, 1);
        assert.strictEqual(t.$('[data-role=card]').disabled, false, 'commandes réactivées');
    });

    test('vue : parents en attente rattachés en un clic', async () => {
        const t = await setup({ prepare: () => otherComp() });
        assert.strictEqual(t.$('[data-role=pending]').hidden, false, 'visible dès le départ');
        await t.click(t.$('[data-role=card]'));
        const items = t.$$('[data-role=pending-item]');
        assert.strictEqual(items.length, 1);
        assert.strictEqual(items[0].querySelector('.s-pending-name').textContent, 'Rattacher 2 enfants à « Tete »');
        await t.click(items[0]);
        assert.strictEqual(t.status.text, '2 enfants rattachés à « Tete » · Ctrl+Z pour annuler');
        assert.strictEqual(t.$('[data-role=pending]').hidden, true);
    });

    test('vue : calques ignorés -> dialogue de la charte', async () => {
        const t = await setup({ prepare: (s) => { s.A.locked = true; } });
        await t.click(t.$('[data-role=card]'));
        await t.click(t.$('[data-role=primary]'));
        const dlg = t.win.document.querySelector('[data-role=dialog]');
        assert.ok(dlg, 'dialogue affiché');
        assert.ok(/verrouillé/.test(dlg.querySelector('li').textContent));
        assert.strictEqual(t.status.level, 'warn');
        t.win.document.querySelector('[data-role=dialog-ok]').click();
        assert.strictEqual(t.win.document.querySelector('[data-role=dialog]'), null);
    });

    test('vue : erreur du pont -> statut erreur, commandes réutilisables', async () => {
        const t = await setup({ bridge: (win) => win.SIMING.createBridge((s, cb) => setTimeout(() => cb('EvalScript error.'), 0)) });
        assert.strictEqual(t.status.level, 'error');
        assert.strictEqual(t.status.text, 'Erreur du script hôte');
        assert.strictEqual(t.$('[data-role=card]').disabled, false);
        assert.strictEqual(t.$('[data-role=primary]').disabled, true);
    });

    test('vue : Entrée déclenche le bouton principal', async () => {
        const t = await setup();
        await t.click(t.$('[data-role=card]'));
        t.view.dispatchEvent(new t.win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await t.api.idle();
        assert.strictEqual(t.s.A.parent, null);
    });

    test('vue : un nom de calque contenant du HTML reste du texte', async () => {
        const t = await setup({ prepare: (s) => { s.A.name = '<b>gras</b> "A"'; } });
        await t.click(t.$('[data-role=card]'));
        assert.strictEqual(t.$$('.s-row-name')[0].textContent, '<b>gras</b> "A"');
        assert.strictEqual(t.view.querySelector('.s-row-name b'), null);
    });
};
