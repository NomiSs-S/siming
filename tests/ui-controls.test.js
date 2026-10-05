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
};
