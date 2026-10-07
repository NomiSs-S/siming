'use strict';
/* Utilitaires DOM, icônes générées et jetons de la charte. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { makeDom, CLIENT } = require('./helpers');
const { buildIconsSource, OUT } = require('../tools/build-icons');

const SCRIPTS = ['js/siming.js', 'js/icons.js', 'js/ui/dom.js'];

module.exports = function (test) {
    test('icônes : icons.js est à jour avec docs/design/icons.json', () => {
        assert.strictEqual(fs.readFileSync(OUT, 'utf8'), buildIconsSource(),
            'relancer node tools/build-icons.js');
    });

    test('icônes : les 50 icônes de la charte sont présentes', () => {
        const win = makeDom(SCRIPTS);
        const names = Object.keys(win.SIMING.ICONS);
        assert.strictEqual(names.length, 50);
        for (const n of ['lier', 'delier', 'cibler', 'rafraichir', 'reglages', 'aide', 'menu', 'plus', 'eclair', 'keyframe', 'ressort', 'etiquette', 'panneau', 'alignLeft', 'distBottom',
            'boite', 'appareil', 'fond', 'source', 'texte', 'exporter', 'decliner', 'zone', 'rogner', 'figer']) {
            assert.ok(names.includes(n), n);
        }
    });

    test('h : classe, texte, attributs, écouteurs, enfants imbriqués, valeurs vides ignorées', () => {
        const win = makeDom(SCRIPTS);
        const { h } = win.SIMING.ui;
        let clicks = 0;
        const el = h('button', { class: 's-btn', type: 'button', 'data-role': 'x', disabled: false, hidden: true, title: null, onclick: () => clicks++ },
            'a', [h('span', { text: '<b>b</b>' }), ['c', null, false]], undefined);
        assert.strictEqual(el.className, 's-btn');
        assert.strictEqual(el.getAttribute('data-role'), 'x');
        assert.strictEqual(el.hasAttribute('disabled'), false);
        assert.strictEqual(el.hasAttribute('hidden'), true);
        assert.strictEqual(el.hasAttribute('title'), false);
        assert.strictEqual(el.textContent, 'a<b>b</b>c');
        assert.strictEqual(el.querySelector('b'), null, 'le texte n\'est jamais interprété comme du HTML');
        el.hidden = false;
        el.click();
        assert.strictEqual(clicks, 1);
    });

    test('icon : tracés, pointillés, taille, icône inconnue vide', () => {
        const win = makeDom(SCRIPTS);
        const { icon } = win.SIMING.ui;
        const lier = icon('lier');
        assert.strictEqual(lier.getAttribute('class'), 's-icon');
        assert.strictEqual(lier.getAttribute('width'), '16');
        assert.strictEqual(lier.getAttribute('stroke'), 'currentColor');
        assert.strictEqual(lier.querySelectorAll('path').length, 1);
        const nul = icon('null', 18);
        assert.strictEqual(nul.getAttribute('width'), '18');
        assert.strictEqual(nul.querySelector('rect').getAttribute('stroke-dasharray'), '2 2');
        assert.strictEqual(nul.querySelector('path').hasAttribute('stroke-dasharray'), false);
        assert.strictEqual(icon('inexistante').childNodes.length, 0);
    });

    test('charte.css : jetons et mesures de la charte', () => {
        const css = fs.readFileSync(path.join(CLIENT, 'css', 'charte.css'), 'utf8');
        for (const token of ['--accent: #2A6FC0', '--bg-panel: #232323', '--warn-soft: #3A2F1C', '--accent-soft: #2A3A4E']) {
            assert.ok(css.includes(token), token);
        }
        const rule = (sel) => (css.match(new RegExp('(^|\\n)' + sel.replace(/\./g, '\\.') + ' \\{([^}]*)\\}')) || [])[2] || '';
        assert.ok(/height: 32px/.test(rule('.s-row')), '.s-row 32 px');
        assert.ok(/height: 40px/.test(rule('.s-btn-primary')), '.s-btn-primary 40 px');
        assert.ok(/height: 56px/.test(rule('.s-card')), '.s-card 56 px');
        assert.ok(/height: 48px/.test(rule('.s-rail')), '.s-rail 48 px');
        assert.ok(/width: 44px; height: 40px/.test(rule('.s-rail-btn')), '.s-rail-btn 44 × 40');
        assert.ok(/height: 24px/.test(rule('.s-status')), '.s-status 24 px');
        assert.ok(/\[hidden\] \{ display: none !important; \}/.test(css), '[hidden] retire vraiment l\'élément');
    });
};
