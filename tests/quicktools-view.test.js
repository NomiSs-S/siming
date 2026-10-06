'use strict';
/* Vue Quick Tools montée sur jsdom, branchée sur le vrai cœur hôte via le pont (faux AE). */
const assert = require('assert');
const { loadHost, makeDom, hostEvalScript, app } = require('./helpers');
const { FakeComp } = require('./fake-ae');

const SCRIPTS = ['js/siming.js', 'js/icons.js', 'js/ui/dom.js', 'js/ui/controls.js', 'js/bridge.js', 'js/keys.js', 'tools/quicktools.js'];

/** Comp « Rig » active : A (100 × 50) en [100, 100] avec Position animée, B (100 × 100) en [500, 300], C (10 × 10). */
function rig() {
    const comp = new FakeComp(300, 'Rig');
    app.project.activeItem = comp;
    app.project.items.push(comp);
    const A = comp.addLayer('A', { rect: { top: 0, left: 0, width: 100, height: 50 } });
    const B = comp.addLayer('B', { rect: { top: 0, left: 0, width: 100, height: 100 } });
    const C = comp.addLayer('C', { rect: { top: 0, left: 0, width: 10, height: 10 } });
    comp.layer(1).position.setValueAtTime(0, [100, 100]);
    comp.layer(1).position.setValueAtTime(1, [300, 100]);
    comp.layer(2).position.setValue([500, 300]);
    comp.layer(3).position.setValue([900, 900]);
    return { comp, A, B, C, L: (i) => comp.layer(i) };
}

async function setup(opts) {
    opts = opts || {};
    const s = rig();
    if (opts.prepare) opts.prepare(s);
    const { sandbox } = loadHost();
    const win = makeDom(SCRIPTS);
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
    keys.attach(win.document);   // comme le hub ou le panneau isolé
    const api = win.SIMING.toolDefs.quicktools.mount(view, {
        bridge, ui: win.SIMING.ui, status, settings: win.SIMING.settings, keys,
        meta: { id: 'quicktools', name: 'Quick Tools', icon: 'eclair', version: '1.0.0' },
    });
    await api.ready;
    const $ = (sel) => view.querySelector(sel);
    const $$ = (sel) => Array.from(view.querySelectorAll(sel));
    const click = async (el) => { el.click(); await api.idle(); };
    const key = async (init, target) => { (target || win.document).dispatchEvent(new win.KeyboardEvent('keydown', Object.assign({ bubbles: true, cancelable: true }, init))); await api.idle(); };
    return { s, win, view, section, api, status, counter, keys, $, $$, click, key };
}

module.exports = function (test) {
    test('vue quicktools : quatre sections, valeurs par défaut, statut de départ', async () => {
        const t = await setup();
        assert.deepEqual(t.$$('.s-section-label').map((e) => e.textContent), ['Lissage de vitesse', 'Elastic', 'Ancrage', 'Aligner', 'Répartir']);
        assert.deepEqual(t.$$('.s-bar-value').map((e) => e.textContent), ['33 %', '33 %', '33 %']);
        assert.strictEqual(t.$$('[data-role^=ease-apply-]').length, 3);
        assert.strictEqual(t.$('[data-role=primary]'), null, 'pas de bouton principal');
        assert.strictEqual(t.$('[data-role=elastic]').textContent, 'Appliquer Elastic');
        assert.strictEqual(t.$('[data-role=elastic-remove]').getAttribute('aria-label'), 'Retirer Elastic');
        assert.deepEqual(['in', 'out', 'both'].map((m) => t.$('[data-role=ease-apply-' + m + '] .s-ease-key-fill').getAttribute('d')), ['M8 2.5l5.5 5.5L8 13.5z', 'M8 2.5L2.5 8 8 13.5z', 'M8 2.5l5.5 5.5L8 13.5 2.5 8z'], 'entrée = moitié droite (le mouvement part), sortie = gauche (il arrive), entier');
        const groups = t.keys.actions().filter((a) => a.group === 'Quick Tools').map((a) => a.id);
        assert.strictEqual(groups.length, 27, 'un raccourci réglable par geste');
        assert.deepEqual(t.keys.binding('quicktools.anchor.5'), { code: 'Numpad5', label: 'Pavé 5', user: false });
        assert.deepEqual(t.keys.binding('quicktools.replay'), { code: 'Enter', label: 'Entrée', user: false });
        assert.strictEqual(t.keys.binding('quicktools.align-left'), null, 'sans touche par défaut');
        assert.strictEqual(t.$$('.is-last').length, 0, 'aucun geste encore');
        assert.strictEqual(t.$('[data-role=point9]').value, 5);
        assert.deepEqual(t.$$('[data-role=align-to] .s-seg-btn').map((b) => b.classList.contains('is-on')), [true, false]);
        assert.strictEqual(t.$$('[data-role=align-row] button').length, 6);
        assert.strictEqual(t.$$('[data-role=dist-row] button').length, 6);
        assert.strictEqual(t.status.level, 'info');
        assert.ok(/Sélectionne des keyframes ou des calques/.test(t.status.text), t.status.text);
        assert.strictEqual(t.counter.calls, 1);
    });

    test('vue quicktools : lissage par le picto et par la barre, valeur mémorisée', async () => {
        const t = await setup({ prepare: (s) => { s.L(1).position.setSelectedAtKey(2, true); s.L(1).position.selected = true; } });
        await t.click(t.$('[data-role=ease-apply-in]'));
        assert.strictEqual(t.status.text, '1 keyframe lissée, entrée 33 % · Ctrl+Z pour annuler');
        assert.strictEqual(t.status.level, 'ok');
        const bar = t.$('[data-role=ease-out]');
        bar.dispatchEvent(new t.win.WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));   // 34 : applique aussi
        await t.api.idle();
        assert.strictEqual(t.status.text, '1 keyframe lissée, sortie 34 % · Ctrl+Z pour annuler');
        assert.strictEqual(t.win.localStorage.getItem('siming.quicktools.easeOut'), '34');
        assert.strictEqual(t.s.L(1).position.keyInTemporalEase(2)[0].influence, 34, '« sortie » = arrivée du mouvement = côté entrant de la keyframe');
        assert.strictEqual(t.s.L(1).position.keyOutTemporalEase(2)[0].influence, 33, '« entrée » posée avant = côté sortant');
        const again = await setup({ prepare: (s) => { s.L(1).position.setSelectedAtKey(2, true); s.L(1).position.selected = true; } });
        assert.strictEqual(again.$('[data-role=ease-out]').value, 33, 'autre fenêtre jsdom : réglages à part');
    });

    test('vue quicktools : Elastic appliqué puis retiré, Entrée = rejouer le dernier geste (pas dans un champ)', async () => {
        const t = await setup({ prepare: (s) => { s.L(1).position.selected = true; } });
        const calls = t.counter.calls;
        t.section.focus();
        await t.key({ key: 'Enter', code: 'Enter' }, t.section);
        assert.strictEqual(t.counter.calls, calls, 'aucun geste encore : Entrée ne fait rien');
        await t.click(t.$('[data-role=elastic]'));
        assert.strictEqual(t.status.text, 'Elastic appliqué à 1 propriété · Ctrl+Z pour annuler');
        assert.ok(t.s.L(1).effect('Elastic Controller'));
        assert.ok(t.$('[data-role=elastic]').classList.contains('is-last'));
        await t.click(t.$('[data-role=elastic-remove]'));
        assert.strictEqual(t.status.text, 'Elastic retiré de 1 propriété · Ctrl+Z pour annuler');
        assert.strictEqual(t.s.L(1).effect('Elastic Controller'), null);
        assert.deepEqual(t.$$('.is-last').map((e) => e.getAttribute('data-role')), ['elastic-remove'], 'un seul dernier geste');
        await t.click(t.$('[data-role=elastic]'));
        t.section.focus();
        await t.key({ key: 'Enter', code: 'Enter' }, t.section);
        assert.ok(/Elastic appliqué/.test(t.status.text), 'Entrée sur la section = rejouer Appliquer Elastic : ' + t.status.text);
        await t.key({ key: 'Enter', code: 'Enter' }, t.$('[data-role=elastic-remove]'));
        assert.ok(/Elastic appliqué/.test(t.status.text), 'Entrée sur un bouton : le navigateur clique, pas de rejeu ici (jsdom ne clique pas)');
        const input = t.$('[data-role=ease-in] .s-bar-input');
        t.$('[data-role=ease-in]').dispatchEvent(new t.win.MouseEvent('dblclick', { bubbles: true }));
        input.value = '80';
        await t.key({ key: 'Enter', code: 'Enter' }, input);
        assert.strictEqual(input.hidden, true);
        assert.ok(/keyframe/.test(t.status.text), 'Entrée dans le champ = valider la saisie (lissage), pas le rejeu : ' + t.status.text);
        assert.ok(t.$('[data-role=ease-apply-in]').classList.contains('is-last'), 'la saisie devient le dernier geste');
        assert.strictEqual(t.$('[data-role=ease-in]').value, 80);
    });

    test('vue quicktools : point d\'ancrage à la souris et au pavé numérique, keyframes décalées, case mémorisée, vue cachée inerte', async () => {
        const t = await setup({ prepare: (s) => { s.comp.select(s.A); } });
        await t.click(t.$('[data-cell="9"]'));
        assert.strictEqual(t.status.text, 'Point d\'ancrage placé sur 1 calque · Ctrl+Z pour annuler');
        assert.deepEqual(t.s.L(1).anchorPoint.value, [100, 0]);
        assert.strictEqual(t.s.L(1).position.numKeys, 2, 'position animée : aucune keyframe créée');
        assert.deepEqual([t.s.L(1).position.keyValue(1), t.s.L(1).position.keyValue(2)], [[200, 100], [400, 100]], 'les deux keyframes décalées');
        assert.strictEqual(t.win.localStorage.getItem('siming.quicktools.anchorCell'), '9');
        await t.key({ key: '1', code: 'Numpad1' });
        assert.deepEqual(t.s.L(1).anchorPoint.value, [0, 50]);
        assert.strictEqual(t.$('[data-role=point9]').value, 1);
        const calls = t.counter.calls;
        await t.key({ key: '1', code: 'Digit1' });
        assert.strictEqual(t.counter.calls, calls, 'rangée de chiffres : réservée au hub');
        t.section.hidden = true;
        await t.key({ key: '5', code: 'Numpad5' });
        assert.strictEqual(t.counter.calls, calls, 'vue cachée : le pavé ne fait rien');
    });

    test('vue quicktools : raccourci choisi dans Réglages (mémoire commune), touche par défaut reprise', async () => {
        const t = await setup({ prepare: (s) => { s.comp.select(s.A, s.B); } });
        t.keys.setBinding('quicktools.align-left', { code: 'KeyL', label: 'L' });
        await t.key({ key: 'l', code: 'KeyL' });
        assert.strictEqual(t.status.text, '2 calques alignés à gauche · Ctrl+Z pour annuler');
        assert.ok(t.$('[data-role=align-left]').classList.contains('is-last'), 'le raccourci est un geste comme un autre');
        assert.deepEqual(t.keys.setBinding('quicktools.elastic', { code: 'Numpad5' }), ['Ancrage : centre'], 'la touche du pavé change de geste');
        const calls = t.counter.calls;
        await t.key({ key: '5', code: 'Numpad5' });
        assert.strictEqual(t.counter.calls, calls + 1);
        assert.ok(/Aucune propriété animée/.test(t.status.text), t.status.text);
        assert.strictEqual(t.$('[data-role=point9]').value, 5, 'ancrage inchangé');
    });

    test('vue quicktools : aligner sur la sélection puis la composition, répartir, dialogue des ignorés', async () => {
        const t = await setup({ prepare: (s) => { s.comp.select(s.A, s.B); } });
        await t.click(t.$('[data-role=align-left]'));
        assert.strictEqual(t.status.text, '2 calques alignés à gauche · Ctrl+Z pour annuler');
        assert.deepEqual(t.s.L(2).position.value, [100, 300]);
        await t.click(t.$$('[data-role=align-to] .s-seg-btn')[1]);
        assert.strictEqual(t.win.localStorage.getItem('siming.quicktools.alignTo'), 'comp');
        await t.click(t.$('[data-role=align-right]'));
        assert.strictEqual(t.status.text, '2 calques alignés à droite de la composition · Ctrl+Z pour annuler');
        t.section.focus();
        await t.key({ key: 'Enter' }, t.section);
        assert.strictEqual(t.status.text, '2 calques alignés à droite de la composition · Ctrl+Z pour annuler', "Entrée rejoue l'alignement");
        await t.click(t.$('[data-role=dist-top]'));
        assert.strictEqual(t.status.level, 'warn');
        assert.ok(/au moins 3 calques/.test(t.status.text));
        assert.strictEqual(t.win.document.querySelector('[data-role=dialog]'), null, 'rien d\'ignoré : pas de dialogue');
        t.s.C.locked = true;
        t.s.comp.select(t.s.A, t.s.B, t.s.C);
        await t.click(t.$('[data-role=dist-top]'));
        const dialog = t.win.document.querySelector('[data-role=dialog]');
        assert.ok(dialog, 'calque verrouillé : dialogue');
        assert.strictEqual(dialog.querySelector('li').textContent, 'C : calque verrouillé');
        t.win.document.querySelector('[data-role=dialog-ok]').click();
    });

    test('vue quicktools : un seul appel à la fois, commandes réactivées ensuite', async () => {
        const t = await setup({ prepare: (s) => { s.comp.select(s.A, s.B); } });
        const before = t.counter.calls;
        t.$('[data-role=align-top]').click();
        t.$('[data-role=align-bottom]').click();
        await t.api.idle();
        assert.strictEqual(t.counter.calls, before + 1, 'second clic ignoré pendant l\'appel');
        assert.strictEqual(t.$('[data-role=align-top]').disabled, false);
        assert.strictEqual(t.$('[data-role=elastic]').disabled, false);
    });
};
