'use strict';
/* Composants de la charte, sur jsdom. */
const assert = require('assert');
const { makeDom } = require('./helpers');

const SCRIPTS = ['js/siming.js', 'js/icons.js', 'js/ui/dom.js', 'js/ui/controls.js'];

function setup() {
    const win = makeDom(SCRIPTS);
    return { win, ui: win.SIMING.ui, doc: win.document };
}

module.exports = function (test) {
    test('sectionTitle et toolHeader', () => {
        const { ui } = setup();
        const sec = ui.sectionTitle('Enfants', { counter: true });
        assert.strictEqual(sec.querySelector('.s-section-label').textContent, 'Enfants');
        assert.ok(sec.counter);
        assert.strictEqual(ui.sectionTitle('Parent').counter, null);
        let help = 0, open = 0;
        const head = ui.toolHeader({ title: 'Unparent', onHelp: () => help++, onOpenStandalone: () => open++ });
        assert.strictEqual(head.querySelector('.s-title').textContent, 'Unparent');
        head.querySelector('[data-role=help]').click();
        head.querySelector('[data-role=open-standalone]').click();
        assert.deepEqual([help, open], [1, 1]);
        assert.strictEqual(ui.toolHeader({ title: 'X', onHelp() {} }).querySelector('[data-role=open-standalone]'), null);
    });

    test('primaryButton : libellé, activation, clic', () => {
        const { ui } = setup();
        let clicks = 0;
        const b = ui.primaryButton({ label: 'Détacher', onClick: () => clicks++ });
        assert.strictEqual(b.getAttribute('data-role'), 'primary');
        b.set({ label: 'Détacher les 3 enfants', enabled: false });
        b.click();
        assert.strictEqual(clicks, 0, 'désactivé : aucun effet');
        b.set({ enabled: true });
        b.click();
        assert.strictEqual(clicks, 1);
        assert.strictEqual(b.textContent, 'Détacher les 3 enfants');
    });

    test('card : états vide et rempli, clic', () => {
        const { ui } = setup();
        let clicks = 0;
        const c = ui.card({ onClick: () => clicks++ });
        c.set({ title: 'Prendre le calque sélectionné', subtitle: 'aide', empty: true, color: '#B53838' });
        assert.ok(c.classList.contains('is-empty'));
        assert.ok(c.querySelector('.s-card-icon svg'));
        const swatch = c.querySelector('.s-card-swatch');
        assert.strictEqual(swatch.hidden, true, 'carte vide : pas de carré de couleur');
        c.set({ title: 'CTRL_Main', subtitle: '6 enfants · Rig', empty: false, color: '#E4D84C' });
        assert.ok(!c.classList.contains('is-empty'));
        assert.strictEqual(c.querySelector('.s-card-title').textContent, 'CTRL_Main');
        assert.strictEqual(c.querySelector('.s-card-sub').textContent, '6 enfants · Rig');
        assert.strictEqual(swatch.hidden, false, 'carré de la couleur d\'étiquette');
        assert.ok(/#E4D84C|rgb\(228, 216, 76\)/i.test(swatch.style.backgroundColor), swatch.style.backgroundColor);
        c.set({ title: 'CTRL_Main', subtitle: '6 enfants · Rig', empty: false, color: null });
        assert.strictEqual(swatch.hidden, true, 'étiquette « Aucune » : pas de carré');
        c.click();
        assert.strictEqual(clicks, 1);
    });

    test('banner : absent quand vide, présent avec un texte', () => {
        const { ui } = setup();
        const b = ui.banner();
        assert.strictEqual(b.hidden, true);
        b.set('2 enfants détachés sur 3');
        assert.strictEqual(b.hidden, false);
        assert.strictEqual(b.querySelector('.s-banner-text').textContent, '2 enfants détachés sur 3');
        b.set('');
        assert.strictEqual(b.hidden, true);
    });

    test('segmented : sélection au clic, onChange, libellés avec nombres', () => {
        const { ui } = setup();
        const picked = [];
        const seg = ui.segmented({ labels: ['Tous', 'Liés', 'Détachés'], onChange: (i) => picked.push(i) });
        const btns = seg.querySelectorAll('.s-seg-btn');
        assert.strictEqual(btns.length, 3);
        assert.ok(btns[0].classList.contains('is-on'));
        btns[2].click();
        assert.strictEqual(seg.selected, 2);
        assert.deepEqual(picked, [2]);
        assert.strictEqual(btns[2].getAttribute('aria-selected'), 'true');
        seg.setLabels([{ label: 'Tous', count: 3 }, { label: 'Liés', count: 2 }, 'Détachés']);
        assert.strictEqual(btns[0].textContent, 'Tous3');
        assert.strictEqual(btns[0].querySelector('.s-seg-count').textContent, '3');
        assert.strictEqual(btns[2].textContent, 'Détachés');
        seg.select(1);
        assert.deepEqual(picked, [2], 'select() ne déclenche pas onChange');
    });

    test('rowList : lignes cliquables, tonalité, vide', () => {
        const { ui } = setup();
        const got = [];
        const list = ui.rowList({ emptyText: 'Rien ici', onRow: (r, i) => got.push([r.key, i, r.extra]) });
        list.setRows([
            { key: '1', name: 'A', icon: 'lier', tone: 'linked', pill: 'lié', action: 'Détacher', title: 'Détacher « A »', extra: 'x' },
            { key: '2', name: '<i>B</i>', icon: 'delier', tone: 'detached', pill: 'détaché', action: 'Rattacher' },
        ]);
        const rows = list.querySelectorAll('.s-row');
        assert.strictEqual(rows.length, 2);
        assert.ok(rows[0].querySelector('.s-pill').classList.contains('is-linked'));
        assert.strictEqual(rows[0].title, 'Détacher « A »');
        assert.strictEqual(rows[1].querySelector('.s-row-name').textContent, '<i>B</i>');
        assert.strictEqual(rows[1].querySelector('i'), null);
        rows[0].click();
        assert.deepEqual(got, [['1', 0, 'x']]);
        list.setRows([]);
        assert.strictEqual(list.querySelector('.s-empty').textContent, 'Rien ici');
    });

    test('statusLine : texte, niveau, niveau inconnu -> info', () => {
        const { ui } = setup();
        const st = ui.statusLine({ right: 'v1.0.0' });
        st.set('fait', 'ok');
        assert.strictEqual(st.text, 'fait');
        assert.strictEqual(st.level, 'ok');
        assert.strictEqual(st.getAttribute('data-level'), 'ok');
        assert.strictEqual(st.querySelector('.s-status-right').textContent, 'v1.0.0');
        st.set('oups', 'inconnu');
        assert.strictEqual(st.level, 'info');
    });

    test('dialog : titre, message, liste, fermeture par OK et par Échap', async () => {
        const { ui, doc, win } = setup();
        const done = ui.dialog({ title: 'Calques ignorés', message: '1 calque :', items: ['A : calque verrouillé'] });
        const box = doc.querySelector('[data-role=dialog]');
        assert.strictEqual(box.querySelector('.s-dialog-title').textContent, 'Calques ignorés');
        assert.strictEqual(box.querySelectorAll('li').length, 1);
        doc.querySelector('[data-role=dialog-ok]').click();
        await done;
        assert.strictEqual(doc.querySelector('[data-role=dialog]'), null);
        const second = ui.dialog({ title: 'Aide', message: 'ligne 1\nligne 2' });
        doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await second;
        assert.strictEqual(doc.querySelector('.s-dialog-backdrop'), null);
    });

    test('valueBar : rendu, bornes, set, molette, clavier', () => {
        const { ui, win } = setup();
        const changes = [];
        const bar = ui.valueBar({ label: 'Entrée', min: 1, max: 100, unit: ' %', value: 33, defaultValue: 33, onChange: (v) => changes.push(v) });
        assert.strictEqual(bar.querySelector('.s-bar-label').textContent, 'Entrée');
        assert.strictEqual(bar.querySelector('.s-bar-value').textContent, '33 %');
        assert.strictEqual(bar.value, 33);
        bar.set(250);
        assert.strictEqual(bar.value, 100, 'borné au maximum');
        assert.strictEqual(bar.querySelector('.s-bar-fill').style.width, '100%');
        assert.deepEqual(changes, [], 'set() ne déclenche pas onChange');
        bar.dispatchEvent(new win.WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }));                  // vers le bas : -1
        assert.strictEqual(bar.value, 99);
        bar.dispatchEvent(new win.WheelEvent('wheel', { deltaY: -100, shiftKey: true, bubbles: true, cancelable: true })); // haut + Maj : +10, borné
        assert.strictEqual(bar.value, 100);
        bar.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        assert.strictEqual(bar.value, 99);
        bar.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true }));
        assert.strictEqual(bar.value, 89);
        bar.dispatchEvent(new win.WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }));
        bar.set(1);
        bar.dispatchEvent(new win.WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }));                  // déjà au minimum : rien
        assert.deepEqual(changes, [99, 100, 99, 89, 88]);
    });

    test('valueBar : glissé (clic = saut, Maj = précision), Alt + clic = défaut, double-clic = saisie', () => {
        const { ui, win, doc } = setup();
        const inputs = [], changes = [];
        const bar = ui.valueBar({ label: 'Sortie', min: 0, max: 100, value: 10, defaultValue: 33, onInput: (v) => inputs.push(v), onChange: (v) => changes.push(v) });
        doc.body.append(bar);
        bar.getBoundingClientRect = () => ({ left: 0, width: 200, top: 0, height: 30, right: 200, bottom: 30 });
        const pe = (type, x, extra) => bar.dispatchEvent(new win.PointerEvent(type, Object.assign({ clientX: x, button: 0, pointerId: 1, bubbles: true }, extra || {})));
        pe('pointerdown', 100);
        assert.strictEqual(bar.value, 50, 'clic = saut à la position');
        assert.ok(bar.classList.contains('is-dragging'));
        pe('pointermove', 150);
        assert.strictEqual(bar.value, 75);
        pe('pointermove', 170, { shiftKey: true });
        assert.strictEqual(bar.value, 76, 'Maj : dixième du déplacement');
        pe('pointerup', 170);
        assert.ok(!bar.classList.contains('is-dragging'));
        assert.deepEqual(inputs, [50, 75, 76]);
        assert.deepEqual(changes, [76], 'onChange une fois, au relâchement');
        pe('pointerdown', 20, { altKey: true });
        assert.strictEqual(bar.value, 33, 'Alt + clic = valeur par défaut');
        assert.deepEqual(changes, [76, 33]);
        bar.dispatchEvent(new win.MouseEvent('dblclick', { bubbles: true }));
        const input = bar.querySelector('.s-bar-input');
        assert.strictEqual(input.hidden, false);
        assert.strictEqual(input.value, '33');
        input.value = '42,5';
        input.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        assert.strictEqual(input.hidden, true);
        assert.strictEqual(bar.value, 42.5);
        assert.deepEqual(changes, [76, 33, 42.5]);
        bar.dispatchEvent(new win.MouseEvent('dblclick', { bubbles: true }));
        input.value = '7';
        input.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        assert.strictEqual(bar.value, 42.5, 'Échap annule');
        assert.strictEqual(input.hidden, true);
    });

    test('point9 : neuf cases dans l\'ordre du pavé, clic et set', () => {
        const { ui } = setup();
        const picks = [];
        const p9 = ui.point9({ value: 5, onPick: (n) => picks.push(n) });
        const cells = Array.from(p9.querySelectorAll('.s-point9-cell'));
        assert.deepEqual(cells.map((c) => c.getAttribute('data-cell')), ['7', '8', '9', '4', '5', '6', '1', '2', '3']);
        assert.ok(cells[4].classList.contains('is-on'), 'centre choisi au départ');
        cells[8].click();
        assert.deepEqual(picks, [3]);
        assert.ok(cells[8].classList.contains('is-on') && !cells[4].classList.contains('is-on'));
        assert.strictEqual(p9.value, 3);
        p9.set(7);
        assert.ok(cells[0].classList.contains('is-on'));
        assert.strictEqual(cells[0].title, 'Haut gauche');
    });
};
