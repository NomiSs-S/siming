'use strict';
/* Vue Libellés montée sur jsdom, branchée sur le vrai cœur hôte via le pont (faux AE). */
const assert = require('assert');
const { loadHost, makeDom, hostEvalScript, labelScene } = require('./helpers');

const SCRIPTS = ['js/siming.js', 'js/icons.js', 'js/ui/dom.js', 'js/ui/controls.js', 'js/bridge.js', 'js/keys.js', 'tools/labels.js'];

async function setup(opts) {
    opts = opts || {};
    const s = labelScene();
    if (opts.prepare) opts.prepare(s);
    const { sandbox } = loadHost();
    const win = makeDom(SCRIPTS);
    for (const [k, v] of Object.entries(opts.storage || {})) win.localStorage.setItem(k, v);
    const counter = { calls: 0 };
    const bridge = win.SIMING.createBridge(hostEvalScript(sandbox, counter));
    const status = win.SIMING.ui.statusLine();
    const section = win.document.createElement('section');
    section.className = 's-view';
    section.tabIndex = -1;
    const view = win.document.createElement('div');
    view.className = 's-view-body';
    section.append(view);
    win.document.body.append(section, status);
    const keys = win.SIMING.keys;
    keys.attach(win.document);
    const api = win.SIMING.toolDefs.labels.mount(view, {
        bridge, ui: win.SIMING.ui, status, settings: win.SIMING.settings, keys,
        meta: { id: 'labels', name: 'Libellés', icon: 'etiquette', version: '1.0.0' },
    });
    await api.ready;
    const doc = win.document;
    const $ = (sel) => view.querySelector(sel);
    const $$ = (sel) => Array.from(view.querySelectorAll(sel));
    const click = async (el) => { el.click(); await api.idle(); };
    const key = async (init, target) => { (target || doc).dispatchEvent(new win.KeyboardEvent('keydown', Object.assign({ bubbles: true, cancelable: true }, init))); await api.idle(); };
    const picker = () => doc.querySelector('[data-role=label-picker]');
    const pick = async (v) => { picker().querySelector('[data-label="' + v + '"]').click(); await api.idle(); };
    const row = (name) => $$('.s-lrow').find((r) => r.querySelector('.s-row-name').textContent === name);
    const groups = () => $$('.s-lgroup').map((g) => g.querySelector('.s-lgroup-name').textContent + ' ' + g.querySelector('.s-counter').textContent);
    const rules = () => JSON.parse(win.localStorage.getItem('siming.labels.rules'));
    return { s, win, doc, view, section, api, status, counter, keys, $, $$, click, key, picker, pick, row, groups, rules };
}

module.exports = function (test) {
    test('vue libellés : départ, onglets, carte vide, bouton principal inactif, raccourcis', async () => {
        const t = await setup();
        assert.deepEqual(t.$$('[data-role=labels-tabs] .s-seg-btn').map((b) => b.textContent), ['Calques', 'Règles']);
        assert.deepEqual(t.$$('[data-role=scope] .s-seg-btn').map((b) => b.classList.contains('is-on')), [true, false]);
        assert.strictEqual(t.$('[data-role=analyze] .s-card-title').textContent, 'Analyser la sélection');
        assert.ok(t.$('[data-role=analyze]').classList.contains('is-empty'));
        assert.strictEqual(t.$('[data-role=primary]').disabled, true);
        assert.strictEqual(t.$('[data-role=recap-section]').hidden, true);
        assert.strictEqual(t.$('[data-pane=rules]').hidden, true);
        assert.ok(/clique la carte/.test(t.status.text), t.status.text);
        assert.deepEqual(t.keys.binding('labels.apply'), { code: 'Enter', label: 'Entrée', user: false });
        assert.deepEqual(t.keys.actions().filter((a) => a.group === 'Libellés').map((a) => a.id), ['labels.apply', 'labels.analyze', 'labels.quick']);
        await t.click(t.$$('[data-role=scope] .s-seg-btn')[1]);
        assert.strictEqual(t.$('[data-role=analyze] .s-card-title').textContent, 'Analyser la composition');
        assert.strictEqual(t.win.localStorage.getItem('siming.labels.scope'), 'comp');
        assert.strictEqual(t.counter.calls, 1, 'seulement init : rien d\'automatique');
    });

    test('vue libellés : analyser la sélection, récapitulatif groupé par règle, appliquer', async () => {
        const t = await setup({ prepare: (s) => s.comp.select(s.L.title, s.L.logo, s.L.shape) });
        await t.click(t.$('[data-role=analyze]'));
        assert.strictEqual(t.$('[data-role=analyze] .s-card-title').textContent, 'Pub');
        assert.strictEqual(t.status.text, '3 calques analysés · 3 libellés à changer');
        assert.deepEqual(t.groups(), ['Mot-clé « logo » 1', 'Texte 1', 'Forme 1'], 'mots-clés d\'abord, puis natures');
        assert.strictEqual(t.$('[data-rule="type:text"] [data-role=rule-swatch]').value, 2);
        assert.strictEqual(t.row('LOGO_client.png').querySelectorAll('.s-swatch')[1].style.backgroundColor, 'rgb(74, 164, 76)', 'vert d\'AE');
        assert.strictEqual(t.$('[data-role=primary]').textContent, 'Appliquer 3 libellés');
        await t.click(t.$('[data-role=primary]'));
        assert.deepEqual([t.s.L.title.label, t.s.L.logo.label, t.s.L.shape.label], [2, 9, 8]);
        assert.strictEqual(t.status.text, '3 libellés posés · Ctrl+Z pour annuler');
        assert.strictEqual(t.$('[data-role=recap] .s-empty').textContent, 'Tout a déjà la bonne couleur');
        assert.strictEqual(t.$('[data-role=primary]').disabled, true);
        await t.click(t.$$('[data-role=filter] .s-seg-btn')[1]);
        assert.deepEqual(t.$$('.s-lrow .s-tag').map((e) => e.textContent), ['déjà bon', 'déjà bon', 'déjà bon']);
    });

    test('vue libellés : corriger une ligne à la main (couleur, Ne pas changer), Échap ferme le sélecteur', async () => {
        const t = await setup({ storage: { 'siming.labels.scope': 'comp' } });
        await t.click(t.$('[data-role=analyze]'));
        assert.strictEqual(t.$('[data-role=primary]').textContent, 'Appliquer 13 libellés');
        await t.click(t.row('Titre'));
        assert.ok(t.picker(), 'sélecteur ouvert');
        assert.strictEqual(t.picker().querySelectorAll('.s-picker-grid .s-picker-cell').length, 16);
        assert.ok(t.picker().querySelector('[data-label="2"]').classList.contains('is-on'), 'couleur proposée cochée');
        assert.strictEqual(t.picker().querySelector('.s-picker-name').textContent, 'Jaune');
        await t.pick(5);
        assert.strictEqual(t.picker(), null, 'fermé après le choix');
        assert.strictEqual(t.row('Titre').querySelector('.s-tag').textContent, 'à la main');
        await t.click(t.row('Forme 1'));
        await t.pick(-1);
        assert.strictEqual(t.row('Forme 1').querySelector('.s-tag').textContent, 'inchangé', 'reste listé');
        assert.strictEqual(t.$('[data-role=primary]').textContent, 'Appliquer 12 libellés');
        await t.click(t.row('Nul 1'));
        await t.key({ key: 'Escape', code: 'Escape' });
        assert.strictEqual(t.picker(), null, 'Échap ferme sans choisir');
        assert.strictEqual(t.row('Nul 1').querySelector('.s-tag'), null);
        await t.click(t.$('[data-role=primary]'));
        assert.deepEqual([t.s.L.title.label, t.s.L.shape.label, t.s.L.nul.label], [5, 0, 1]);
        assert.strictEqual(t.status.text, '12 libellés posés · Ctrl+Z pour annuler');
    });

    test('vue libellés : plusieurs calques à la fois (Ctrl, Maj, nom de groupe), une couleur pour toute la sélection en un geste', async () => {
        const t = await setup({ storage: { 'siming.labels.scope': 'comp' } });
        await t.click(t.$('[data-role=analyze]'));
        const ev = (type, target, init) => target.dispatchEvent(new t.win.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, button: 0 }, init)));
        const modClick = (name, mod) => { const r = t.row(name); ev('pointerdown', r, { [mod]: true }); ev('click', r, { [mod]: true, detail: 1 }); };
        const sel = () => t.$$('.s-lrow.is-selected').map((r) => r.querySelector('.s-row-name').textContent);
        modClick('Titre', 'ctrlKey');
        modClick('Forme 1', 'ctrlKey');
        assert.strictEqual(t.picker(), null, 'Ctrl + clic : sélection, pas de sélecteur');
        assert.deepEqual(sel(), ['Titre', 'Forme 1']);
        assert.ok(/2 calques sélectionnés/.test(t.status.text), t.status.text);
        ev('pointerdown', t.row('Forme 1'));
        assert.ok(t.picker(), 'appuyer sur une ligne sélectionnée : couleurs ouvertes');
        assert.strictEqual(t.picker().querySelector('.is-on'), null, 'couleurs proposées différentes : aucune cochée');
        ev('pointerup', t.picker().querySelector('[data-label="12"]'));
        assert.strictEqual(t.picker(), null);
        assert.deepEqual(['Titre', 'Forme 1'].map((n) => t.row(n).querySelectorAll('.s-swatch')[1].getAttribute('data-label')), ['12', '12']);
        assert.deepEqual(['Titre', 'Forme 1'].map((n) => t.row(n).querySelector('.s-tag').textContent), ['à la main', 'à la main']);
        assert.ok(/2 calques → Marron/.test(t.status.text), t.status.text);
        assert.deepEqual(sel(), ['Titre', 'Forme 1'], 'sélection gardée');
        await t.key({ key: 'Escape', code: 'Escape' });
        assert.deepEqual(sel(), [], 'Échap : désélectionné');
        modClick('Titre', 'ctrlKey');
        modClick('Nul 1', 'shiftKey');
        assert.deepEqual(sel(), ['Titre', 'Forme 1', 'Plan 01.mov', 'Musique.wav', 'Solide gris', 'Nul 1'], 'Maj + clic : plage');
        await t.click(t.$('[data-rule="word:0"] [data-role=group-select]'));
        assert.deepEqual(sel(), ['Logo animé', 'LOGO_client.png', 'marque.png'], 'nom de groupe : tout le groupe');
        await t.click(t.row('marque.png'));
        await t.pick(0);
        assert.strictEqual(t.$('[data-role=primary]').textContent, 'Appliquer 10 libellés', 'les 3 logos restent sans étiquette');
        ev('pointerdown', t.row('Caméra 1'));
        assert.deepEqual(sel(), [], 'appuyer sur une ligne hors sélection : on repart de cette ligne seule');
        await t.key({ key: 'Escape', code: 'Escape' });
        await t.click(t.$('[data-role=primary]'));
        assert.deepEqual([t.s.L.title.label, t.s.L.shape.label, t.s.L.logo.label, t.s.L.camera.label], [12, 12, 0, 4]);
    });

    test('vue libellés : la pastille d\'un groupe change la règle (gardée), ré-analyse en gardant les choix à la main', async () => {
        const t = await setup({ storage: { 'siming.labels.scope': 'comp' } });
        await t.click(t.$('[data-role=analyze]'));
        await t.click(t.row('Plan 01.mov'));
        await t.pick(3);
        await t.click(t.$('[data-rule="type:text"] [data-role=rule-swatch]'));
        await t.pick(14);
        await t.api.idle();
        assert.strictEqual(t.rules().types.text, 14, 'règle enregistrée');
        assert.strictEqual(t.status.text, '13 calques analysés · 13 libellés à changer');
        assert.strictEqual(t.$('[data-rule="type:text"] [data-role=rule-swatch]').value, 14);
        assert.ok(t.row('Plan 01.mov').querySelector('.s-tag.is-manual'), 'choix à la main gardé');
        assert.strictEqual(t.api.getState().entries.find((e) => e.name === 'Titre').proposed, 14);
        assert.strictEqual(t.$('[data-type=text] [data-role=type-swatch]').value, 14, 'onglet Règles à jour');
    });

    test('vue libellés : onglet Règles (ajouter, saisir, retirer un mot-clé, nature, rétablir), ré-analyse au retour', async () => {
        const t = await setup({ prepare: (s) => s.comp.select(s.L.video, s.L.logo) });
        await t.click(t.$('[data-role=analyze]'));
        await t.click(t.$$('[data-role=labels-tabs] .s-seg-btn')[1]);
        assert.strictEqual(t.$('[data-pane=layers]').hidden, true);
        assert.strictEqual(t.win.localStorage.getItem('siming.labels.tab'), 'rules');
        assert.deepEqual(t.$$('[data-role=word-input]').map((i) => i.value), ['logo', 'fond, bg, background, arrière-plan']);
        assert.strictEqual(t.$$('[data-role=type-swatch]').length, 12);
        assert.strictEqual(t.$('[data-type=video] .s-swatch-name').textContent, 'Fuchsia');
        await t.click(t.$('[data-role=add-word]'));
        const input = t.$$('[data-role=word-input]')[2];
        assert.strictEqual(t.doc.activeElement, input, 'focus dans le nouveau champ');
        assert.strictEqual(t.rules().words[2].label, 3, 'première couleur libre : Bleu-vert');
        input.value = 'plan';
        input.dispatchEvent(new t.win.Event('input', { bubbles: true }));
        await t.click(t.$('[data-type=image] [data-role=type-swatch]'));
        await t.pick(16);
        assert.strictEqual(t.rules().types.image, 16);
        await t.click(t.$$('[data-role=word-remove]')[0]);
        assert.deepEqual(t.rules().words.map((w) => w.words), ['fond, bg, background, arrière-plan', 'plan']);
        const calls = t.counter.calls;
        await t.click(t.$$('[data-role=labels-tabs] .s-seg-btn')[0]);
        assert.strictEqual(t.counter.calls, calls + 1, 'règles changées : ré-analyse au retour');
        assert.deepEqual(t.groups(), ['Mot-clé « plan » 1', 'Image 1']);
        assert.strictEqual(t.api.getState().entries.find((e) => e.name === 'LOGO_client.png').proposed, 16);
        await t.click(t.$$('[data-role=labels-tabs] .s-seg-btn')[1]);
        await t.click(t.$('[data-role=rules-reset]'));
        assert.deepEqual(t.rules().words.map((w) => w.words), ['logo', 'fond, bg, background, arrière-plan']);
        assert.strictEqual(t.rules().types.image, 11);
        assert.strictEqual(t.status.text, 'Règles par défaut rétablies');
    });

    test('vue libellés : règles gardées d\'un lancement à l\'autre, Entrée applique, analyser et appliquer', async () => {
        const stored = JSON.stringify({ words: [], types: { text: 7, bidon: 3 } });
        const t = await setup({ storage: { 'siming.labels.rules': stored }, prepare: (s) => s.comp.select(s.L.title, s.L.logo) });
        assert.strictEqual(t.api.getRules().types.text, 7);
        assert.strictEqual(t.api.getRules().types.shape, 8, 'nature absente : défaut');
        assert.deepEqual(t.api.getRules().words, []);
        await t.click(t.$('[data-role=analyze]'));
        assert.deepEqual(t.groups(), ['Texte 1', 'Image 1'], 'sans mot-clé, LOGO_client.png reste une image');
        t.section.focus();
        await t.key({ key: 'Enter', code: 'Enter' }, t.section);
        assert.deepEqual([t.s.L.title.label, t.s.L.logo.label], [7, 11], 'Entrée = appliquer');
        t.s.comp.select(t.s.L.shape);
        t.keys.setBinding('labels.quick', { code: 'KeyL', label: 'L' });
        await t.key({ key: 'l', code: 'KeyL' });
        await t.api.idle();
        assert.strictEqual(t.s.L.shape.label, 8, 'analyser et appliquer d\'un coup');
        assert.strictEqual(t.status.text, '1 libellé posé · Ctrl+Z pour annuler');
        t.section.hidden = true;
        const calls = t.counter.calls;
        await t.key({ key: 'l', code: 'KeyL' });
        assert.strictEqual(t.counter.calls, calls, 'vue cachée : raccourci inactif');
    });
};
