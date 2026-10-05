# SIMING 1.0.0 : plan, partie 2 (interface)

> Suite de `2026-10-05-siming-cep-1-0-0.md` (lire d'abord l'en-tête, les Global Constraints et la Review Focus de ce fichier). Tâches 7 à 11.

---

### Task 7: Charte CSS, utilitaires DOM et icônes

**Files:**
- Create: `extension/client/css/charte.css`, `extension/client/js/ui/dom.js`, `tools/build-icons.js`, `extension/client/js/icons.js` (généré), `tests/ui-dom.test.js`
- Modify: `tests/run.js` (FILES), `tests/helpers.js` (ajout de `makeDom`)

**Interfaces:**
- Consumes: `window.SIMING` (Tâche 6), `docs/design/icons.json` (tracés : primitives `path`, `circle [cx,cy,r]`, `rect [x,y,w,h,rx]`, `dash [on,off]|null`).
- Produces :
  - `SIMING.ICONS` : `{ nom: Primitive[] }` (21 icônes) ;
  - `SIMING.ui.h(tag, props, ...children) -> Element` : `props.class` → `className`, `props.text` → `textContent`, `onXxx` (fonction) → écouteur `xxx`, `true` → attribut vide, `false/null/undefined` → ignoré, autre → attribut ; enfants imbriqués aplatis, chaînes en nœuds texte ;
  - `SIMING.ui.icon(name, size = 16) -> SVGElement` (classe `s-icon`, `stroke="currentColor"`) ;
  - classes CSS utilisées par les tâches suivantes : `.s-app .s-views .s-view .s-view-body .s-stack .s-error .s-hint .s-rail .s-rail-btn .is-active .s-rail-spacer .s-menu .s-menu-item .s-header .s-title .s-header-actions .s-icon-btn .s-section .s-counter .s-btn .s-btn-primary .s-card .is-empty .s-card-text .s-card-title .s-card-sub .s-card-icon .s-banner .s-seg .s-seg-btn .is-on .s-seg-count .s-rows .s-row .s-row-icon .s-row-name .s-pill .s-row-action .is-linked .is-detached .s-empty .s-pending .s-pending-btn .s-pending-name .s-pending-comp .s-status .s-dot .s-status-text .s-status-right .s-dialog-backdrop .s-dialog .s-dialog-title .s-dialog-msg .s-dialog-list .s-dialog-actions .s-choices .s-choice .s-about` ;
  - `helpers.makeDom(files, url?) -> window` jsdom (origine `http://localhost/` par défaut, pour `localStorage`).

- [ ] **Step 1: Ajouter `makeDom` à `tests/helpers.js`**

```js
/** Fenêtre jsdom avec des scripts du panneau chargés (chemins relatifs à extension/client/). */
function makeDom(files, url) {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<!doctype html><html lang="fr"><head></head><body><div id="app"></div></body></html>',
        { runScripts: 'outside-only', url: url || 'http://localhost/index.html' });
    return loadClientScripts(dom.window, files || []);
}
```

Export : `module.exports = { ROOT, EXT, HOST, CLIENT, scene, otherComp, loadHost, callHost, loadUnparent, loadClientScripts, hostEvalScript, makeDom, app };`

- [ ] **Step 2: Écrire les tests `tests/ui-dom.test.js`**

```js
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

    test('icônes : les 21 icônes de la charte sont présentes', () => {
        const win = makeDom(SCRIPTS);
        const names = Object.keys(win.SIMING.ICONS);
        assert.strictEqual(names.length, 21);
        for (const n of ['lier', 'delier', 'cibler', 'rafraichir', 'reglages', 'aide', 'menu', 'plus']) {
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
```

- [ ] **Step 3: Ajouter le fichier à `tests/run.js` et vérifier l'échec**

Ajouter `'./ui-dom.test.js',` à la fin de `FILES`.

Run: `node tests/run.js`
Expected: ÉCHEC (`tools/build-icons` introuvable).

- [ ] **Step 4: Écrire `tools/build-icons.js` et générer `icons.js`**

```js
'use strict';
/* Génère extension/client/js/icons.js depuis docs/design/icons.json (source des tracés).
 * node tools/build-icons.js   (relancer après toute modification d'une icône) */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'docs', 'design', 'icons.json');
const OUT = path.join(ROOT, 'extension', 'client', 'js', 'icons.js');

function buildIconsSource() {
    const all = JSON.parse(fs.readFileSync(SRC, 'utf8'));
    const icons = {};
    for (const [name, prims] of Object.entries(all)) {
        if (!name.startsWith('_')) icons[name] = prims;
    }
    return '/* GÉNÉRÉ par tools/build-icons.js depuis docs/design/icons.json : ne pas éditer. */\n' +
        '(function (global) {\n' +
        '    \'use strict\';\n' +
        '    const SIMING = global.SIMING = global.SIMING || {};\n' +
        '    SIMING.ICONS = ' + JSON.stringify(icons, null, 4).replace(/\n/g, '\n    ') + ';\n' +
        '})(window);\n';
}

module.exports = { buildIconsSource, OUT };

if (require.main === module) {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, buildIconsSource(), 'utf8');
    console.log('Icônes écrites : ' + OUT);
}
```

Run: `node tools/build-icons.js`
Expected: `Icônes écrites : …extension/client/js/icons.js`

- [ ] **Step 5: Écrire `extension/client/js/ui/dom.js`**

```js
/*
 * SIMING : utilitaires DOM du panneau.
 *   ui.h(tag, props, ...enfants)  crée un élément (textes toujours en textContent)
 *   ui.icon(nom, taille)          icône SVG de la charte (couleur = currentColor)
 */
(function (global) {
    'use strict';

    const SIMING = global.SIMING = global.SIMING || {};
    const ui = SIMING.ui = SIMING.ui || {};
    const SVG_NS = 'http://www.w3.org/2000/svg';

    ui.h = function (tag, props, ...children) {
        const el = global.document.createElement(tag);
        if (props) {
            for (const [key, value] of Object.entries(props)) {
                if (value === undefined || value === null || value === false) continue;
                if (key === 'class') el.className = value;
                else if (key === 'text') el.textContent = value;
                else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
                else if (value === true) el.setAttribute(key, '');
                else el.setAttribute(key, String(value));
            }
        }
        for (const child of children.flat(Infinity)) {
            if (child === undefined || child === null || child === false) continue;
            el.append(child.nodeType ? child : String(child));
        }
        return el;
    };

    ui.icon = function (name, size) {
        const doc = global.document;
        const px = String(size || 16);
        const svg = doc.createElementNS(SVG_NS, 'svg');
        const attrs = {
            class: 's-icon', width: px, height: px, viewBox: '0 0 16 16', fill: 'none',
            stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linecap': 'round',
            'stroke-linejoin': 'round', 'aria-hidden': 'true',
        };
        for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, v);
        let dash = null;
        for (const prim of (SIMING.ICONS && SIMING.ICONS[name]) || []) {
            if (Object.prototype.hasOwnProperty.call(prim, 'dash')) { dash = prim.dash; continue; }
            let el = null;
            if (prim.path) {
                el = doc.createElementNS(SVG_NS, 'path');
                el.setAttribute('d', prim.path);
            } else if (prim.circle) {
                el = doc.createElementNS(SVG_NS, 'circle');
                el.setAttribute('cx', prim.circle[0]); el.setAttribute('cy', prim.circle[1]); el.setAttribute('r', prim.circle[2]);
            } else if (prim.rect) {
                el = doc.createElementNS(SVG_NS, 'rect');
                el.setAttribute('x', prim.rect[0]); el.setAttribute('y', prim.rect[1]);
                el.setAttribute('width', prim.rect[2]); el.setAttribute('height', prim.rect[3]);
                if (prim.rect[4]) el.setAttribute('rx', prim.rect[4]);
            }
            if (!el) continue;
            if (dash) el.setAttribute('stroke-dasharray', dash.join(' '));
            svg.appendChild(el);
        }
        return svg;
    };
})(window);
```

- [ ] **Step 6: Écrire `extension/client/css/charte.css`**

```css
/* SIMING : charte graphique (docs/CHARTE-GRAPHIQUE.md). Jetons, puis composants. */

:root {
    --bg-deep: #161616;
    --bg-inset: #1B1B1B;
    --bg-bar: #1D1D1D;
    --bg-panel: #232323;
    --bg-hover: #2A2A2A;
    --bg-surface: #2C2C2C;
    --bg-control: #343434;
    --segment-on: #3E3E3E;
    --line: #3B3B3B;
    --text-strong: #EDEDED;
    --text: #DADADA;
    --text-muted: #9A9A9A;
    --icon-rest: #8A8A8A;
    --accent: #2A6FC0;
    --accent-hover: #3079CF;
    --accent-press: #245FA6;
    --accent-text: #5AA6F5;
    --accent-soft: #2A3A4E;
    --ok: #63C285;
    --warn: #E3A33B;
    --warn-soft: #3A2F1C;
    --error: #E5675B;
    --radius: 4px;
    --font: system-ui, 'Segoe UI', -apple-system, sans-serif;
    --mono: Consolas, 'Cascadia Mono', ui-monospace, monospace;
}

* { box-sizing: border-box; }
[hidden] { display: none !important; }
html, body { margin: 0; height: 100%; }
body { background: var(--bg-panel); color: var(--text); font: 12px/1.35 var(--font); user-select: none; overflow: hidden; }
button { font: inherit; color: inherit; }
button:focus-visible, input:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 1px; }
.s-icon { flex: none; display: block; }

/* Structure */
.s-app { display: flex; flex-direction: column; height: 100vh; min-width: 260px; }
.s-views { flex: 1; min-height: 0; overflow-y: auto; }
.s-view { display: flex; flex-direction: column; gap: 8px; padding: 12px; min-height: 100%; }
.s-view:focus { outline: none; }
.s-view.is-busy { cursor: progress; }
.s-view-body { display: flex; flex-direction: column; gap: 8px; flex: 1; min-height: 0; }
.s-stack { display: flex; flex-direction: column; gap: 8px; }
.s-error { padding: 12px; border-radius: var(--radius); background: var(--warn-soft); color: var(--warn); }
.s-hint { font-size: 11px; color: var(--text-muted); }

/* Rail d'outils */
.s-rail { position: relative; display: flex; align-items: center; gap: 2px; height: 48px; padding: 0 4px; background: var(--bg-bar); border-bottom: 1px solid var(--bg-deep); flex: none; }
.s-rail-btn { width: 44px; height: 40px; border: 0; border-radius: var(--radius); background: transparent; color: var(--icon-rest); display: flex; align-items: center; justify-content: center; cursor: pointer; flex: none; }
.s-rail-btn:hover { background: #262626; color: var(--text); }
.s-rail-btn.is-active { background: var(--bg-surface); color: var(--accent-text); box-shadow: inset 0 -2px 0 var(--accent-text); }
.s-rail-spacer { flex: 1; }
.s-menu { position: absolute; top: 46px; right: 50px; z-index: 10; min-width: 180px; padding: 4px; background: var(--bg-surface); border: 1px solid #444; border-radius: var(--radius); box-shadow: 0 6px 18px rgba(0, 0, 0, .45); display: flex; flex-direction: column; gap: 1px; }
.s-menu-item { height: 32px; border: 0; border-radius: 3px; background: transparent; display: flex; align-items: center; gap: 8px; padding: 0 10px; text-align: left; cursor: pointer; }
.s-menu-item:hover { background: var(--accent); color: #fff; }

/* En-tête et sections */
.s-header { display: flex; align-items: center; justify-content: space-between; min-height: 32px; }
.s-title { font-size: 13px; font-weight: 600; color: var(--text-strong); }
.s-header-actions { display: flex; gap: 2px; }
.s-icon-btn { width: 32px; height: 32px; border: 0; border-radius: var(--radius); background: transparent; color: var(--icon-rest); display: flex; align-items: center; justify-content: center; cursor: pointer; }
.s-icon-btn:hover { background: #2E2E2E; color: var(--text); }
.s-section { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; font-size: 10px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--text-muted); }
.s-counter { font-family: var(--mono); letter-spacing: 0; text-transform: none; font-weight: 400; }

/* Boutons */
.s-btn { height: 32px; padding: 0 14px; border: 1px solid #444; border-radius: var(--radius); background: var(--bg-control); display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; width: 100%; }
.s-btn:hover { background: #3C3C3C; border-color: #4C4C4C; }
.s-btn:active { background: #2A2A2A; }
.s-btn:disabled { opacity: .38; cursor: default; }
.s-btn-primary { height: 40px; font-size: 13px; font-weight: 600; color: #fff; background: var(--accent); border-color: var(--accent); }
.s-btn-primary:hover { background: var(--accent-hover); border-color: var(--accent-hover); }
.s-btn-primary:active { background: var(--accent-press); border-color: var(--accent-press); }
.s-btn-primary:disabled { background: var(--bg-control); border-color: var(--bg-control); color: var(--text-muted); opacity: 1; }

/* Carte cliquable */
.s-card { width: 100%; height: 56px; display: flex; align-items: center; gap: 12px; padding: 0 12px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--bg-surface); text-align: left; cursor: pointer; }
.s-card:hover { background: #303030; border-color: #5A5A5A; }
.s-card-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.s-card-title { font-size: 13px; font-weight: 600; color: var(--text-strong); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.s-card-sub { font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.s-card-icon { color: var(--icon-rest); display: flex; order: 2; }
.s-card.is-empty { background: transparent; border-style: dashed; border-color: #4A4A4A; }
.s-card.is-empty .s-card-icon { order: 0; }
.s-card.is-empty .s-card-title { color: var(--text); }
.s-card.is-empty:hover { background: #1E2A38; border-color: var(--accent-text); }
.s-card.is-empty:hover .s-card-icon { color: var(--accent-text); }

/* Bandeau */
.s-banner { display: flex; align-items: center; gap: 8px; min-height: 30px; padding: 6px 10px; border-radius: var(--radius); background: var(--warn-soft); color: var(--warn); font-size: 11px; }

/* Segmenté */
.s-seg { display: flex; gap: 2px; padding: 2px; background: var(--bg-inset); border: 1px solid var(--line); border-radius: var(--radius); }
.s-seg-btn { flex: 1; height: 26px; border: 0; border-radius: 3px; background: transparent; color: var(--text-muted); display: flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; }
.s-seg-btn:hover { background: #262626; color: var(--text); }
.s-seg-btn.is-on { background: var(--segment-on); color: var(--text-strong); }
.s-seg-count { font-family: var(--mono); font-size: 10px; opacity: .7; }

/* Liste à lignes */
.s-rows { flex: 1; min-height: 96px; overflow-y: auto; padding: 3px; display: flex; flex-direction: column; gap: 1px; background: var(--bg-inset); border: 1px solid #2F2F2F; border-radius: var(--radius); }
.s-row { width: 100%; height: 32px; flex: none; border: 0; border-radius: 3px; background: transparent; display: flex; align-items: center; gap: 10px; padding: 0 10px; text-align: left; cursor: pointer; }
.s-row:hover { background: var(--bg-hover); }
.s-row-icon { display: flex; }
.s-row-icon.is-linked { color: var(--accent-text); }
.s-row-icon.is-detached { color: var(--warn); }
.s-row-name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.s-pill { font-size: 10px; padding: 2px 8px; border-radius: 9px; }
.s-pill.is-linked { background: var(--accent-soft); color: #BFDBFA; }
.s-pill.is-detached { background: var(--warn-soft); color: var(--warn); }
.s-row-action { display: none; font-size: 11px; font-weight: 600; }
.s-row-action.is-linked { color: var(--accent-text); }
.s-row-action.is-detached { color: var(--warn); }
.s-row:hover .s-pill { display: none; }
.s-row:hover .s-row-action { display: inline; }
.s-empty { padding: 16px; text-align: center; font-size: 11px; color: #777; }

/* Parents en attente */
.s-pending { display: flex; flex-direction: column; gap: 4px; }
.s-pending-btn { height: 36px; justify-content: space-between; background: #262626; border-color: var(--line); }
.s-pending-btn:hover { border-color: var(--warn); background: #2E2A22; }
.s-pending-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.s-pending-comp { font-family: var(--mono); font-size: 10px; color: var(--text-muted); flex: none; }

/* Ligne de statut */
.s-status { height: 24px; flex: none; display: flex; align-items: center; gap: 8px; padding: 0 10px; background: var(--bg-bar); border-top: 1px solid var(--bg-deep); font-size: 11px; color: #BDBDBD; }
.s-dot { width: 6px; height: 6px; border-radius: 3px; background: #777; flex: none; }
.s-status[data-level="ok"] .s-dot { background: var(--ok); }
.s-status[data-level="warn"] .s-dot { background: var(--warn); }
.s-status[data-level="error"] .s-dot { background: var(--error); }
.s-status-text { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.s-status-right { font-family: var(--mono); font-size: 10px; color: #777; }

/* Dialogue */
.s-dialog-backdrop { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0, 0, 0, .5); }
.s-dialog { width: 100%; max-width: 320px; max-height: 100%; overflow: auto; display: flex; flex-direction: column; gap: 10px; padding: 14px; background: var(--bg-surface); border: 1px solid #444; border-radius: var(--radius); box-shadow: 0 8px 24px rgba(0, 0, 0, .5); user-select: text; }
.s-dialog-title { font-size: 13px; font-weight: 600; color: var(--text-strong); }
.s-dialog-msg { white-space: pre-line; color: var(--text); }
.s-dialog-list { margin: 0; padding-left: 18px; font-family: var(--mono); font-size: 11px; color: var(--text-muted); }
.s-dialog-actions { display: flex; justify-content: flex-end; }
.s-dialog-actions .s-btn { width: auto; min-width: 96px; }

/* Réglages */
.s-choices { display: flex; flex-direction: column; gap: 1px; }
.s-choice { display: flex; align-items: center; gap: 10px; height: 30px; padding: 0 8px; border-radius: 3px; cursor: pointer; }
.s-choice:hover { background: var(--bg-hover); }
.s-choice input { accent-color: var(--accent); margin: 0; width: 16px; height: 16px; }
.s-about { display: grid; grid-template-columns: 1fr auto; gap: 6px 12px; margin: 0; }
.s-about dt { color: var(--text); }
.s-about dd { margin: 0; font-family: var(--mono); color: var(--text-muted); }
```

- [ ] **Step 7: Lancer les tests**

Run: `node tests/run.js`
Expected: `68 réussi(s), 0 échoué(s)`.

- [ ] **Step 8: Commit**

```bash
git add extension/client tools/build-icons.js tests
git commit -m "feat(interface): charte CSS, utilitaires DOM et icônes SVG"
```

---

### Task 8: Composants de la charte

**Files:**
- Create: `extension/client/js/ui/controls.js`, `tests/ui-controls.test.js`
- Modify: `tests/run.js` (FILES)

**Interfaces:**
- Consumes: `ui.h`, `ui.icon` (Tâche 7).
- Produces (dans `SIMING.ui`, chaque fonction renvoie un élément DOM enrichi) :
  - `sectionTitle(label, { counter? }) -> el` (`el.counter` = span ou `null`) ;
  - `toolHeader({ title, onHelp, onOpenStandalone? }) -> el` (boutons `[data-role=help]`, `[data-role=open-standalone]`) ;
  - `button({ label, onClick, role? }) -> <button class="s-btn">` ;
  - `primaryButton({ label?, onClick, role = "primary" }) -> el` + `el.set({ label?, enabled? })` ;
  - `card({ onClick, role = "card" }) -> el` + `el.set({ title, subtitle, empty })` ;
  - `banner({ role = "banner" }) -> el` + `el.set(text)` (texte vide → `hidden`) ;
  - `segmented({ labels, onChange, role = "segmented" }) -> el` + `el.setLabels([string | { label, count }])`, `el.select(i)`, `el.selected` ;
  - `rowList({ onRow, emptyText, role = "rows" }) -> el` + `el.setRows([{ key, name, icon, tone: "linked"|"detached", pill, action, title, ...données libres }])` ; `onRow(row, index)` ;
  - `statusLine({ right?, role = "status" }) -> el` + `el.set(text, level)`, `el.text`, `el.level`, attribut `data-level` ;
  - `dialog({ title, message?, items?, okLabel? }) -> Promise` (résolue à la fermeture ; Entrée, Échap, clic hors boîte ou OK ferment).

- [ ] **Step 1: Écrire les tests `tests/ui-controls.test.js`**

```js
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
        c.set({ title: 'Prendre le calque sélectionné', subtitle: 'aide', empty: true });
        assert.ok(c.classList.contains('is-empty'));
        assert.ok(c.querySelector('.s-card-icon svg'));
        c.set({ title: 'CTRL_Main', subtitle: '6 enfants · Rig', empty: false });
        assert.ok(!c.classList.contains('is-empty'));
        assert.strictEqual(c.querySelector('.s-card-title').textContent, 'CTRL_Main');
        assert.strictEqual(c.querySelector('.s-card-sub').textContent, '6 enfants · Rig');
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
```

- [ ] **Step 2: Ajouter le fichier à `tests/run.js` et vérifier l'échec**

Ajouter `'./ui-controls.test.js',` à la fin de `FILES`.

Run: `node tests/run.js`
Expected: ÉCHEC (`extension/client/js/ui/controls.js` introuvable).

- [ ] **Step 3: Écrire `extension/client/js/ui/controls.js`**

```js
/*
 * SIMING : composants de la charte (docs/CHARTE-GRAPHIQUE.md § 6).
 * Chaque fonction crée et renvoie un élément DOM, enrichi de quelques méthodes.
 */
(function (global) {
    'use strict';

    const SIMING = global.SIMING;
    const ui = SIMING.ui;
    const h = ui.h;

    /** Titre de section en petites majuscules, compteur facultatif à droite. */
    ui.sectionTitle = function (label, opts) {
        const counter = (opts && opts.counter) ? h('span', { class: 's-counter' }) : null;
        const el = h('div', { class: 's-section' }, h('span', { class: 's-section-label', text: label }), counter);
        el.counter = counter;
        return el;
    };

    /** En-tête d'outil : titre, « Ouvrir dans un panneau » (facultatif), aide. */
    ui.toolHeader = function ({ title, onHelp, onOpenStandalone }) {
        const actions = h('div', { class: 's-header-actions' });
        if (onOpenStandalone) {
            actions.append(h('button', {
                class: 's-icon-btn', type: 'button', title: 'Ouvrir dans un panneau',
                'aria-label': 'Ouvrir dans un panneau', 'data-role': 'open-standalone', onclick: onOpenStandalone,
            }, ui.icon('plus')));
        }
        actions.append(h('button', {
            class: 's-icon-btn', type: 'button', title: 'Aide', 'aria-label': 'Aide', 'data-role': 'help', onclick: onHelp,
        }, ui.icon('aide')));
        return h('div', { class: 's-header' }, h('span', { class: 's-title', text: title }), actions);
    };

    /** Bouton secondaire (32 px, pleine largeur). */
    ui.button = function ({ label, onClick, role }) {
        return h('button', { class: 's-btn', type: 'button', 'data-role': role, onclick: onClick, text: label || '' });
    };

    /** Bouton principal (40 px, bleu). Un seul par outil. */
    ui.primaryButton = function ({ label, onClick, role }) {
        const b = h('button', { class: 's-btn s-btn-primary', type: 'button', 'data-role': role || 'primary', onclick: onClick, text: label || '' });
        b.set = function ({ label: text, enabled }) {
            if (text !== undefined) b.textContent = text;
            if (enabled !== undefined) b.disabled = !enabled;
        };
        return b;
    };

    /** Carte cliquable (56 px) : vide = invitation à agir, remplie = objet courant. */
    ui.card = function ({ onClick, role }) {
        const icon = h('span', { class: 's-card-icon' });
        const title = h('span', { class: 's-card-title' });
        const sub = h('span', { class: 's-card-sub' });
        const el = h('button', { class: 's-card', type: 'button', 'data-role': role || 'card', onclick: onClick },
            icon, h('span', { class: 's-card-text' }, title, sub));
        el.set = function ({ title: t, subtitle, empty }) {
            title.textContent = t || '';
            sub.textContent = subtitle || '';
            el.classList.toggle('is-empty', !!empty);
            icon.replaceChildren(ui.icon(empty ? 'cibler' : 'rafraichir', empty ? 20 : 16));
            el.title = empty ? 'Prendre le calque sélectionné dans la timeline' : 'Reprendre la sélection';
        };
        return el;
    };

    /** Bandeau ambre ; absent (hidden) quand il n'a rien à dire. */
    ui.banner = function (opts) {
        const text = h('span', { class: 's-banner-text' });
        const el = h('div', { class: 's-banner', 'data-role': (opts && opts.role) || 'banner', hidden: true },
            ui.icon('delier', 14), text);
        el.set = function (t) {
            text.textContent = t || '';
            el.hidden = !t;
        };
        return el;
    };

    /** Sélecteur segmenté (2 à 4 choix courts). */
    ui.segmented = function ({ labels, onChange, role }) {
        const el = h('div', { class: 's-seg', role: 'tablist', 'data-role': role || 'segmented' });
        const buttons = labels.map((label, i) => h('button', {
            class: 's-seg-btn', type: 'button', role: 'tab', 'data-index': i,
            onclick: () => { el.select(i); if (onChange) onChange(i); },
        }));
        el.append(...buttons);
        el.selected = 0;
        el.setLabels = function (items) {
            items.forEach((item, i) => {
                const b = buttons[i];
                if (!b) return;
                const label = typeof item === 'string' ? item : item.label;
                b.replaceChildren(label);
                if (typeof item !== 'string' && item.count !== undefined && item.count !== null) {
                    b.append(h('span', { class: 's-seg-count', text: String(item.count) }));
                }
            });
        };
        el.select = function (i) {
            el.selected = i;
            buttons.forEach((b, k) => {
                b.classList.toggle('is-on', k === i);
                b.setAttribute('aria-selected', String(k === i));
            });
        };
        el.setLabels(labels);
        el.select(0);
        return el;
    };

    /** Liste à lignes de 32 px, chaque ligne entièrement cliquable. */
    ui.rowList = function ({ onRow, emptyText, role }) {
        const el = h('div', { class: 's-rows', 'data-role': role || 'rows' });
        el.setRows = function (rows) {
            el.replaceChildren();
            if (rows.length === 0) {
                el.append(h('div', { class: 's-empty', text: emptyText || 'Rien à afficher' }));
                return;
            }
            rows.forEach((row, i) => {
                const tone = row.tone ? ' is-' + row.tone : '';
                el.append(h('button', {
                    class: 's-row', type: 'button', 'data-key': row.key, title: row.title,
                    onclick: () => { if (onRow) onRow(row, i); },
                },
                h('span', { class: 's-row-icon' + tone }, ui.icon(row.icon, 14)),
                h('span', { class: 's-row-name', text: row.name }),
                h('span', { class: 's-pill' + tone, text: row.pill }),
                h('span', { class: 's-row-action' + tone, text: row.action })));
            });
        };
        return el;
    };

    /** Ligne de statut : pastille, message, texte à droite. Niveaux info / ok / warn / error. */
    ui.statusLine = function (opts) {
        const text = h('span', { class: 's-status-text' });
        const right = (opts && opts.right) ? h('span', { class: 's-status-right', text: opts.right }) : null;
        const el = h('div', { class: 's-status', 'data-role': (opts && opts.role) || 'status' },
            h('span', { class: 's-dot' }), text, right);
        el.set = function (message, level) {
            const lv = ['info', 'ok', 'warn', 'error'].includes(level) ? level : 'info';
            el.text = message || '';
            el.level = lv;
            text.textContent = el.text;
            text.title = el.text;
            el.setAttribute('data-level', lv);
        };
        el.set('', 'info');
        return el;
    };

    /** Fenêtre de dialogue de la charte (remplace alert). Résout la promesse à la fermeture. */
    ui.dialog = function ({ title, message, items, okLabel }) {
        const doc = global.document;
        return new Promise((resolve) => {
            let backdrop = null;
            const onKey = (e) => {
                if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); close(); }
            };
            function close() {
                if (!backdrop) return;
                backdrop.remove();
                backdrop = null;
                doc.removeEventListener('keydown', onKey);
                resolve();
            }
            const ok = h('button', { class: 's-btn s-btn-primary', type: 'button', 'data-role': 'dialog-ok', onclick: close, text: okLabel || 'OK' });
            const box = h('div', { class: 's-dialog', role: 'dialog', 'aria-modal': 'true', 'data-role': 'dialog' },
                h('div', { class: 's-dialog-title', text: title || '' }),
                message ? h('div', { class: 's-dialog-msg', text: message }) : null,
                (items && items.length) ? h('ul', { class: 's-dialog-list' }, items.map((it) => h('li', { text: it }))) : null,
                h('div', { class: 's-dialog-actions' }, ok));
            backdrop = h('div', { class: 's-dialog-backdrop', onclick: (e) => { if (e.target === backdrop) close(); } }, box);
            doc.body.append(backdrop);
            doc.addEventListener('keydown', onKey);
            ok.focus();
        });
    };
})(window);
```

- [ ] **Step 4: Lancer les tests**

Run: `node tests/run.js`
Expected: `76 réussi(s), 0 échoué(s)`.

- [ ] **Step 5: Commit**

```bash
git add extension/client/js/ui/controls.js tests
git commit -m "feat(interface): composants de la charte (carte, boutons, segmenté, liste, statut, dialogue)"
```

---

### Task 9: Vue Unparent

**Files:**
- Create: `extension/client/tools/unparent.js`, `tests/unparent-view.test.js`
- Modify: `tests/run.js` (FILES)

**Interfaces:**
- Consumes: API hôte Unparent (Tâche 5, forme `State`), `SIMING.createBridge` (Tâche 6), composants (Tâche 8).
- Produces: `SIMING.toolDefs.unparent = { help: string, mount(view, ctx) -> { ready: Promise, idle() -> Promise, getState() -> State|null } }` avec `ctx = { bridge, ui, status, settings, meta }`. Rôles DOM : `[data-role=card]`, `[data-role=banner]`, `[data-role=primary]`, `[data-role=secondary]`, `[data-role=children]`, `[data-role=filter]`, `[data-role=rows]`, `[data-role=pending]`, `[data-role=pending-item]`.

- [ ] **Step 1: Écrire les tests `tests/unparent-view.test.js`**

```js
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
        const t = await setup({ select: false });
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
```

- [ ] **Step 2: Ajouter le fichier à `tests/run.js` et vérifier l'échec**

Ajouter `'./unparent-view.test.js',` à la fin de `FILES`.

Run: `node tests/run.js`
Expected: ÉCHEC (`extension/client/tools/unparent.js` introuvable).

- [ ] **Step 3: Écrire `extension/client/tools/unparent.js`**

```js
/*
 * SIMING : vue de l'outil Unparent (charte « tout tombe sous la souris »).
 * Toute la logique After Effects est côté hôte (host/tools/unparent.jsx) :
 * chaque geste appelle l'API et redessine la vue avec l'état complet renvoyé.
 */
(function (global) {
    'use strict';

    const SIMING = global.SIMING;
    const ui = SIMING.ui;
    const h = ui.h;

    const HELP = [
        '1. Sélectionne un calque parent dans la timeline, puis clique sur la carte Parent.',
        '   Sans sélection, un clic sur la carte remet simplement la liste à jour.',
        '2. Le gros bouton détache tous les enfants ; il devient ensuite « Rattacher ».',
        '3. Un clic sur une ligne détache ou rattache cet enfant seul, tout de suite.',
        '4. « En attente dans le projet » liste les autres parents dont des enfants sont encore détachés.',
        '',
        'Les enfants ne bougent pas, et chaque action s\'annule d\'un seul Ctrl+Z.',
        'Un enfant détaché garde une balise [UP|id|parent] en fin de commentaire : c\'est sa mémoire.',
    ].join('\n');

    const FILTERS = ['all', 'linked', 'detached'];
    const MAX_PENDING = 3;

    function mount(view, ctx) {
        let state = null;
        let filter = 'all';
        let busy = null;

        const ids = () => ({
            compId: state && state.comp ? state.comp.id : null,
            targetId: state && state.target ? state.target.id : null,
        });

        // --- Construction -----------------------------------------------------------
        const card = ui.card({ onClick: () => run('pick', ids()) });
        const banner = ui.banner();
        const primary = ui.primaryButton({ label: 'Détacher', onClick: () => runPlan('primary') });
        const secondary = ui.button({ role: 'secondary', onClick: () => runPlan('secondary') });
        secondary.hidden = true;
        const childrenTitle = ui.sectionTitle('Enfants', { counter: true });
        const seg = ui.segmented({
            role: 'filter', labels: ['Tous', 'Liés', 'Détachés'],
            onChange: (i) => { filter = FILTERS[i]; renderRows(); },
        });
        const rows = ui.rowList({ emptyText: 'Aucun enfant dans ce filtre', onRow: (row) => onRow(row.entry) });
        const children = h('div', { class: 's-stack', 'data-role': 'children', hidden: true }, childrenTitle, seg, rows);
        const pending = h('div', { class: 's-pending', 'data-role': 'pending', hidden: true });

        view.append(
            ui.sectionTitle('Parent'), card,
            h('div', { class: 's-stack' }, banner, primary, secondary),
            children, pending);

        view.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' || e.defaultPrevented) return;
            if (e.target && e.target.tagName === 'BUTTON') return;   // le bouton focalisé gère Entrée lui-même
            if (!primary.disabled) { e.preventDefault(); primary.click(); }
        });

        // --- Appels à l'hôte -------------------------------------------------------------
        function setBusy(on) {
            view.classList.toggle('is-busy', on);
            view.querySelectorAll('button').forEach((b) => { b.disabled = on; });
            if (!on) primary.disabled = !(state && state.plan && state.plan.primary);
        }

        function run(fn, args) {
            if (busy) return busy;
            setBusy(true);
            busy = ctx.bridge.call('unparent', fn, args || {})
                .then(render)
                .catch((e) => { ctx.status.set(e.message, 'error'); })
                .finally(() => { busy = null; setBusy(false); });
            return busy;
        }

        function runPlan(which) {
            const p = state && state.plan ? state.plan[which] : null;
            if (!p) return null;
            return run(p.action, Object.assign(ids(), { ids: p.ids }));
        }

        function onRow(entry) {
            return run(entry.state === 'linked' ? 'detach' : 'restore', Object.assign(ids(), { ids: [entry.id] }));
        }

        // --- Rendu -------------------------------------------------------------------------
        function render(s) {
            state = s;
            const t = s.target;
            card.set(t
                ? { title: t.name, subtitle: SIMING.plural(s.entries.length, 'enfant', 'enfants') + ' · ' + s.comp.name, empty: false }
                : { title: 'Prendre le calque sélectionné', subtitle: 'Sélectionne un parent dans la timeline, puis clique ici', empty: true });
            banner.set(s.plan.banner);
            primary.set(s.plan.primary ? { label: s.plan.primary.label, enabled: true } : { label: 'Détacher', enabled: false });
            secondary.hidden = !s.plan.secondary;
            if (s.plan.secondary) secondary.textContent = s.plan.secondary.label;
            children.hidden = !t;
            const total = s.entries.length;
            const nD = s.plan.nDetached;
            childrenTitle.counter.textContent = total ? nD + ' / ' + total + ' détaché' + (nD > 1 ? 's' : '') : '';
            seg.setLabels([
                { label: 'Tous', count: total },
                { label: 'Liés', count: s.plan.nLinked },
                { label: 'Détachés', count: nD },
            ]);
            renderRows();
            renderPending();
            ctx.status.set(s.status.text, s.status.level);
            if (s.report && s.report.skipped && s.report.skipped.length) {
                ui.dialog({
                    title: 'Calques ignorés',
                    message: SIMING.plural(s.report.skipped.length, 'calque n\'a pas été traité :', 'calques n\'ont pas été traités :'),
                    items: s.report.skipped,
                });
            }
            return s;
        }

        function renderRows() {
            if (!state) return;
            const list = state.entries.filter((e) => filter === 'all' || e.state === filter);
            rows.setRows(list.map((e) => {
                const linked = e.state === 'linked';
                return {
                    key: String(e.id), entry: e, name: e.name,
                    icon: linked ? 'lier' : 'delier', tone: linked ? 'linked' : 'detached',
                    pill: linked ? 'lié' : 'détaché', action: linked ? 'Détacher' : 'Rattacher',
                    title: (linked ? 'Détacher « ' : 'Rattacher « ') + e.name + ' »',
                };
            }));
        }

        function renderPending() {
            const groups = state ? state.pending : [];
            pending.replaceChildren();
            pending.hidden = groups.length === 0;
            if (!groups.length) return;
            pending.append(ui.sectionTitle('En attente dans le projet'));
            groups.slice(0, MAX_PENDING).forEach((g) => {
                pending.append(h('button', {
                    class: 's-btn s-pending-btn', type: 'button', 'data-role': 'pending-item',
                    title: 'Composition « ' + g.compName + ' »' + (g.found ? '' : ' · parent introuvable'),
                    onclick: () => run('restorePending', Object.assign(ids(), { pendingCompId: g.compId, ids: g.ids, parentName: g.parentName })),
                },
                h('span', { class: 's-pending-name', text: 'Rattacher ' + SIMING.plural(g.ids.length, 'enfant', 'enfants') + ' à « ' + g.parentName + ' »' }),
                h('span', { class: 's-pending-comp', text: g.compName })));
            });
            if (groups.length > MAX_PENDING) {
                pending.append(h('div', { class: 's-hint', text: '+ ' + SIMING.plural(groups.length - MAX_PENDING, 'autre parent', 'autres parents') + ' en attente' }));
            }
        }

        const ready = run('init', {});
        return {
            ready,
            idle: () => busy || Promise.resolve(state),
            getState: () => state,
        };
    }

    SIMING.registerTool('unparent', { help: HELP, mount });
})(window);
```

- [ ] **Step 4: Lancer les tests**

Run: `node tests/run.js`
Expected: `88 réussi(s), 0 échoué(s)`.

- [ ] **Step 5: Commit**

```bash
git add extension/client/tools/unparent.js tests
git commit -m "feat(unparent): vue v2 (carte, bouton qui suit l'état, lignes cliquables, en attente)"
```

---

### Task 10: Rail, hub, réglages et thème

**Files:**
- Create: `extension/client/js/ui/rail.js`, `extension/client/js/hub.js`, `tests/hub.test.js`
- Modify: `extension/client/js/siming.js` (thème), `tests/run.js` (FILES)

**Interfaces:**
- Consumes: composants (Tâche 8), `SIMING.toolDefs` (Tâche 9).
- Produces :
  - `ui.rail({ tools, onSelect(id), onSettings() }) -> el` + `el.setActive(id)`, `el.layout()`, `el.overflow` (outils masqués) ; boutons `[data-tool=<id>]`, `[data-tool=__settings]`, `[data-role=rail-more]`, menu `[data-role=rail-menu]` ;
  - `SIMING.mountTool(view, meta, ctx, { onOpenStandalone? }) -> api|null` (en-tête + corps, erreurs isolées) ;
  - `SIMING.startHub({ root, list, bridge, openExtension? }) -> hub` avec `hub = { show(id), status, rail, views: Map, mounted: { id: api }, current, ready: Promise }` ; `list = { version, repository, tools: [{ id, name, icon, version, script }] }` ;
  - `SIMING.setPanelColor(r, g, b) -> delta` (décale les gris de la charte, |delta| ≤ 16) et `SIMING.applyTheme(cs)`.

- [ ] **Step 1: Écrire les tests `tests/hub.test.js`**

```js
'use strict';
/* Hub : rail, pile de vues, réglages, à propos, outils cassés, clavier, débordement, thème. */
const assert = require('assert');
const { loadHost, makeDom, hostEvalScript } = require('./helpers');

const SCRIPTS = ['js/siming.js', 'js/icons.js', 'js/ui/dom.js', 'js/ui/controls.js', 'js/ui/rail.js',
    'js/bridge.js', 'js/hub.js', 'tools/unparent.js'];

const LIST = {
    version: '1.0.0', repository: 'OWNER/siming',
    tools: [
        { id: 'unparent', name: 'Unparent', icon: 'delier', version: '2.0.0', script: 'tools/unparent.js' },
        { id: 'demo', name: 'Démo', icon: 'ancre', version: '0.1.0', script: 'tools/demo.js' },
        { id: 'casse', name: 'Cassé', icon: 'null', version: '0.1.0', script: 'tools/casse.js' },
        { id: 'absent', name: 'Absent', icon: 'menu', version: '0.1.0', script: 'tools/absent.js' },
    ],
};

function setup(opts) {
    opts = opts || {};
    const { sandbox } = loadHost();
    const win = opts.win || makeDom(SCRIPTS);
    win.SIMING.registerTool('demo', { help: 'aide démo', mount(view) { view.append('vue démo'); return {}; } });
    win.SIMING.registerTool('casse', { help: '', mount() { throw new Error('boum'); } });
    const opened = [];
    const hub = win.SIMING.startHub({
        root: win.document.getElementById('app'), list: LIST,
        bridge: win.SIMING.createBridge(hostEvalScript(sandbox)),
        openExtension: opts.noOpen ? null : (id) => opened.push(id),
    });
    const $ = (sel) => win.document.querySelector(sel);
    return { win, hub, opened, $ };
}
const visible = (hub) => Array.from(hub.views.entries()).filter(([, v]) => !v.hidden).map(([k]) => k);

module.exports = function (test) {
    test('hub : rail dans l\'ordre de tools.json + Réglages, premier outil affiché', async () => {
        const t = setup();
        await t.hub.ready;
        const ids = Array.from(t.win.document.querySelectorAll('.s-rail-btn[data-tool]')).map((b) => b.getAttribute('data-tool'));
        assert.deepEqual(ids, ['unparent', 'demo', 'casse', 'absent', '__settings']);
        assert.strictEqual(t.hub.current, 'unparent');
        assert.deepEqual(visible(t.hub), ['unparent']);
        assert.ok(t.$('.s-rail-btn[data-tool=unparent]').classList.contains('is-active'));
        assert.strictEqual(t.$('.s-status-right').textContent, 'v1.0.0');
    });

    test('hub : clic sur le rail change d\'outil et mémorise le dernier', () => {
        const t = setup();
        t.$('.s-rail-btn[data-tool=demo]').click();
        assert.strictEqual(t.hub.current, 'demo');
        assert.deepEqual(visible(t.hub), ['demo']);
        assert.strictEqual(t.win.localStorage.getItem('siming.lastTool'), 'demo');
        const again = setup({ win: t.win });
        assert.strictEqual(again.hub.current, 'demo', 'redémarre sur le dernier outil');
    });

    test('hub : réglage « outil au lancement »', () => {
        const t = setup();
        t.$('.s-rail-btn[data-tool=__settings]').click();
        const radio = t.win.document.querySelector('[data-role=start-tool] input[value=unparent]');
        radio.checked = true;
        radio.dispatchEvent(new t.win.Event('change'));
        assert.strictEqual(t.win.localStorage.getItem('siming.startTool'), 'unparent');
        t.$('.s-rail-btn[data-tool=demo]').click();
        const again = setup({ win: t.win });
        assert.strictEqual(again.hub.current, 'unparent');
    });

    test('hub : touches 1…n changent d\'outil, sauf dans un champ', () => {
        const t = setup();
        t.win.document.dispatchEvent(new t.win.KeyboardEvent('keydown', { key: '2', bubbles: true }));
        assert.strictEqual(t.hub.current, 'demo');
        const input = t.win.document.querySelector('[data-role=start-tool] input');
        input.dispatchEvent(new t.win.KeyboardEvent('keydown', { key: '1', bubbles: true }));
        assert.strictEqual(t.hub.current, 'demo');
    });

    test('hub : outil cassé ou sans script isolé, les autres fonctionnent', async () => {
        const t = setup();
        await t.hub.ready;
        assert.ok(/Erreur au démarrage de « Cassé » : boum/.test(t.hub.views.get('casse').textContent));
        assert.ok(/introuvable/.test(t.hub.views.get('absent').textContent));
        t.$('.s-rail-btn[data-tool=demo]').click();
        assert.ok(/vue démo/.test(t.hub.views.get('demo').textContent));
    });

    test('hub : à propos liste SIMING et chaque outil avec sa version', () => {
        const t = setup();
        const about = t.$('[data-role=about]').textContent;
        assert.ok(about.includes('SIMING') && about.includes('1.0.0'));
        assert.ok(about.includes('Unparent') && about.includes('2.0.0'));
    });

    test('hub : « Ouvrir dans un panneau » et aide', () => {
        const t = setup();
        t.hub.views.get('unparent').querySelector('[data-role=open-standalone]').click();
        assert.deepEqual(t.opened, ['com.siming.tool.unparent']);
        t.hub.views.get('demo').querySelector('[data-role=help]').click();
        const dlg = t.$('[data-role=dialog]');
        assert.ok(/Démo 0\.1\.0/.test(dlg.querySelector('.s-dialog-title').textContent));
        assert.strictEqual(dlg.querySelector('.s-dialog-msg').textContent, 'aide démo');
        const sansPanneau = setup({ noOpen: true });
        assert.strictEqual(sansPanneau.hub.views.get('unparent').querySelector('[data-role=open-standalone]'), null);
    });

    test('rail : débordement vers le menu « … »', () => {
        const t = setup();
        const rail = t.hub.rail;
        Object.defineProperty(rail, 'clientWidth', { value: 4 * 46, configurable: true });
        rail.layout();
        assert.strictEqual(t.$('[data-role=rail-more]').hidden, false);
        assert.deepEqual(rail.overflow.map((x) => x.id), ['demo', 'casse', 'absent']);
        t.$('[data-role=rail-more]').click();
        const items = t.win.document.querySelectorAll('[data-role=rail-menu] .s-menu-item');
        assert.strictEqual(items.length, 3);
        items[0].click();
        assert.strictEqual(t.hub.current, 'demo');
        assert.strictEqual(t.$('[data-role=rail-menu]').hidden, true);
    });

    test('thème : setPanelColor décale les gris, borné à ±16', () => {
        const t = setup();
        const style = t.win.document.documentElement.style;
        assert.strictEqual(t.win.SIMING.setPanelColor(35, 35, 35), 0);
        assert.strictEqual(style.getPropertyValue('--bg-panel'), 'rgb(35, 35, 35)');
        assert.strictEqual(t.win.SIMING.setPanelColor(60, 60, 60), 16);
        assert.strictEqual(style.getPropertyValue('--bg-panel'), 'rgb(51, 51, 51)');
        const handlers = [];
        let color = { red: 40, green: 40, blue: 40 };
        const cs = {
            getHostEnvironment: () => ({ appSkinInfo: { panelBackgroundColor: { color } } }),
            addEventListener: (name, fn) => handlers.push([name, fn]),
        };
        t.win.SIMING.applyTheme(cs);
        assert.strictEqual(style.getPropertyValue('--bg-panel'), 'rgb(40, 40, 40)');
        assert.strictEqual(handlers[0][0], 'com.adobe.csxs.events.ThemeColorChanged');
        color = { red: 30, green: 30, blue: 30 };
        handlers[0][1]();
        assert.strictEqual(style.getPropertyValue('--bg-panel'), 'rgb(30, 30, 30)');
    });
};
```

- [ ] **Step 2: Ajouter le fichier à `tests/run.js` et vérifier l'échec**

Ajouter `'./hub.test.js',` à la fin de `FILES`.

Run: `node tests/run.js`
Expected: ÉCHEC (`extension/client/js/ui/rail.js` introuvable).

- [ ] **Step 3: Ajouter le thème à `extension/client/js/siming.js`**

Insérer avant la dernière ligne `})(window);` :

```js

    // --- Thème : suivre la couleur de panneau d'After Effects --------------------
    // Gris de la charte (valeur 0-255 d'un gris neutre), décalés ensemble.
    const SHADES = {
        '--bg-deep': 0x16, '--bg-inset': 0x1B, '--bg-bar': 0x1D, '--bg-panel': 0x23,
        '--bg-hover': 0x2A, '--bg-surface': 0x2C, '--bg-control': 0x34, '--segment-on': 0x3E, '--line': 0x3B,
    };
    const BASE = 0x23;
    const MAX_DELTA = 16;   // au-delà, le texte clair de la charte deviendrait illisible

    /** Décale les gris de la charte vers la couleur de panneau d'AE. Renvoie le décalage appliqué. */
    SIMING.setPanelColor = function (r, g, b) {
        const grey = Math.round((r + g + b) / 3);
        const delta = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, grey - BASE));
        const style = global.document.documentElement.style;
        for (const [name, v] of Object.entries(SHADES)) {
            const x = Math.max(0, Math.min(255, v + delta));
            style.setProperty(name, 'rgb(' + x + ', ' + x + ', ' + x + ')');
        }
        return delta;
    };

    /** Applique la couleur de panneau d'AE et suit ses changements (cs = CSInterface). */
    SIMING.applyTheme = function (cs) {
        function apply() {
            try {
                const c = cs.getHostEnvironment().appSkinInfo.panelBackgroundColor.color;
                SIMING.setPanelColor(c.red, c.green, c.blue);
            } catch (e) { /* hors After Effects : on garde la charte */ }
        }
        apply();
        try { cs.addEventListener('com.adobe.csxs.events.ThemeColorChanged', apply); } catch (e) { /* idem */ }
    };
```

- [ ] **Step 4: Écrire `extension/client/js/ui/rail.js`**

```js
/*
 * SIMING : rail d'outils horizontal (48 px, boutons 44 × 40).
 * Les outils qui ne tiennent pas passent dans le menu « … » ; Réglages reste à droite.
 */
(function (global) {
    'use strict';

    const SIMING = global.SIMING;
    const ui = SIMING.ui;
    const h = ui.h;
    const SLOT = 46;   // bouton 44 + espacement 2

    ui.rail = function ({ tools, onSelect, onSettings }) {
        const el = h('nav', { class: 's-rail', 'data-role': 'rail', 'aria-label': 'Outils' });
        const buttons = new Map();

        tools.forEach((tool, i) => {
            const b = h('button', {
                class: 's-rail-btn', type: 'button', 'data-tool': tool.id,
                title: tool.name + ' (' + (i + 1) + ')', 'aria-label': tool.name,
                onclick: () => onSelect(tool.id),
            }, ui.icon(tool.icon, 18));
            buttons.set(tool.id, b);
            el.append(b);
        });

        const menu = h('div', { class: 's-menu', 'data-role': 'rail-menu', hidden: true });
        const more = h('button', {
            class: 's-rail-btn', type: 'button', 'data-role': 'rail-more', title: 'Autres outils',
            'aria-label': 'Autres outils', hidden: true,
            onclick: () => {
                menu.replaceChildren(...el.overflow.map((tool) => h('button', {
                    class: 's-menu-item', type: 'button',
                    onclick: () => { menu.hidden = true; onSelect(tool.id); },
                }, ui.icon(tool.icon, 16), tool.name)));
                menu.hidden = !menu.hidden;
            },
        }, ui.icon('menu', 18));
        const settings = h('button', {
            class: 's-rail-btn', type: 'button', 'data-tool': '__settings', title: 'Réglages',
            'aria-label': 'Réglages', onclick: onSettings,
        }, ui.icon('reglages', 18));
        buttons.set('__settings', settings);
        el.append(h('span', { class: 's-rail-spacer' }), more, settings, menu);

        el.overflow = [];

        el.setActive = function (id) {
            buttons.forEach((b, key) => b.classList.toggle('is-active', key === id));
        };

        /** Range les outils qui ne tiennent pas dans « … » (sans mise en page : tout visible). */
        el.layout = function () {
            const width = el.clientWidth;
            el.overflow = [];
            if (!width) {
                tools.forEach((tool) => { buttons.get(tool.id).hidden = false; });
                more.hidden = true;
                return;
            }
            const fit = Math.max(1, Math.floor((width - 2 * SLOT - 8) / SLOT));
            tools.forEach((tool, i) => {
                const hide = i >= fit;
                buttons.get(tool.id).hidden = hide;
                if (hide) el.overflow.push(tool);
            });
            more.hidden = el.overflow.length === 0;
            if (more.hidden) menu.hidden = true;
        };

        return el;
    };
})(window);
```

- [ ] **Step 5: Écrire `extension/client/js/hub.js`**

```js
/*
 * SIMING : hub (panneau principal). Rail, une vue par outil, Réglages, statut commun.
 *   SIMING.startHub({ root, list, bridge, openExtension }) -> hub
 */
(function (global) {
    'use strict';

    const SIMING = global.SIMING;
    const ui = SIMING.ui;
    const h = ui.h;
    const SETTINGS = '__settings';

    /** Monte un outil dans `view` (en-tête + corps). Renvoie l'API du montage ou null. */
    SIMING.mountTool = function (view, meta, ctx, opts) {
        const def = SIMING.toolDefs[meta.id];
        if (!def) {
            view.append(h('div', { class: 's-error', text: 'Outil « ' + meta.name + ' » introuvable : ' + meta.script }));
            return null;
        }
        view.append(ui.toolHeader({
            title: meta.name,
            onHelp: () => ui.dialog({ title: meta.name + ' ' + meta.version, message: def.help || '' }),
            onOpenStandalone: opts && opts.onOpenStandalone,
        }));
        const body = h('div', { class: 's-view-body' });
        view.append(body);
        try {
            return def.mount(body, Object.assign({ meta }, ctx)) || {};
        } catch (e) {
            body.append(h('div', { class: 's-error', text: 'Erreur au démarrage de « ' + meta.name + ' » : ' + e.message }));
            ctx.status.set('Outil « ' + meta.name + ' » en erreur : ' + e.message, 'warn');
            return null;
        }
    };

    SIMING.startHub = function ({ root, list, bridge, openExtension }) {
        const tools = list.tools;
        const status = ui.statusLine({ right: 'v' + list.version });
        const views = new Map();
        const mounted = {};
        const rail = ui.rail({ tools, onSelect: (id) => show(id), onSettings: () => show(SETTINGS) });
        const stack = h('main', { class: 's-views' });
        root.replaceChildren(h('div', { class: 's-app' }, rail, stack, status));

        const ctx = { bridge, ui, status, settings: SIMING.settings };
        for (const meta of tools) {
            const view = h('section', { class: 's-view', 'data-tool': meta.id, tabindex: '-1', hidden: true });
            stack.append(view);
            views.set(meta.id, view);
            mounted[meta.id] = SIMING.mountTool(view, meta, ctx, {
                onOpenStandalone: openExtension ? () => openExtension('com.siming.tool.' + meta.id) : null,
            });
        }

        const settingsView = h('section', { class: 's-view', 'data-tool': SETTINGS, hidden: true });
        stack.append(settingsView);
        views.set(SETTINGS, settingsView);
        buildSettings(settingsView, list);

        const hub = { show, status, rail, views, mounted, current: null, ready: null };

        function show(id) {
            if (!views.has(id)) id = tools.length ? tools[0].id : SETTINGS;
            views.forEach((v, key) => { v.hidden = key !== id; });
            rail.setActive(id);
            if (id !== SETTINGS) SIMING.settings.set('lastTool', id);
            hub.current = id;
        }

        function startTool() {
            const pref = SIMING.settings.get('startTool', 'last');
            const id = pref === 'last' ? SIMING.settings.get('lastTool', '') : pref;
            if (id && id !== SETTINGS && views.has(id)) return id;
            return tools.length ? tools[0].id : SETTINGS;
        }

        global.document.addEventListener('keydown', (e) => {
            const tag = e.target && e.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const n = parseInt(e.key, 10);
            if (n >= 1 && n <= tools.length) {
                e.preventDefault();
                show(tools[n - 1].id);
            }
        });
        global.addEventListener('resize', () => rail.layout());

        hub.ready = Promise.all(Object.values(mounted).map((m) => (m && m.ready) || null).filter(Boolean)).catch(() => {});
        show(startTool());
        rail.layout();
        return hub;
    };

    function buildSettings(view, list) {
        view.append(h('div', { class: 's-header' }, h('span', { class: 's-title', text: 'Réglages' })));
        view.append(ui.sectionTitle('Outil au lancement'));
        const current = SIMING.settings.get('startTool', 'last');
        const choices = [{ id: 'last', name: 'Dernier outil utilisé' }].concat(list.tools.map((t) => ({ id: t.id, name: t.name })));
        const group = h('div', { class: 's-choices', role: 'radiogroup', 'data-role': 'start-tool' });
        for (const c of choices) {
            const input = h('input', { type: 'radio', name: 'siming-start', value: c.id, checked: c.id === current });
            input.addEventListener('change', () => SIMING.settings.set('startTool', c.id));
            group.append(h('label', { class: 's-choice' }, input, h('span', { text: c.name })));
        }
        view.append(group);
        view.append(ui.sectionTitle('À propos'));
        view.append(h('dl', { class: 's-about', 'data-role': 'about' },
            h('dt', { text: 'SIMING' }), h('dd', { text: list.version }),
            list.tools.map((t) => [h('dt', { text: t.name }), h('dd', { text: t.version })])));
    }
})(window);
```

- [ ] **Step 6: Lancer les tests**

Run: `node tests/run.js`
Expected: `97 réussi(s), 0 échoué(s)`.

- [ ] **Step 7: Commit**

```bash
git add extension/client/js tests
git commit -m "feat(hub): rail horizontal, vues, réglages, à propos et thème AE"
```

---

### Task 11: Pages, démarrage, panneau isolé et liste des outils

**Files:**
- Create: `extension/client/index.html`, `extension/client/tool.html`, `extension/client/tools.json`, `extension/client/js/standalone.js`, `extension/client/lib/CSInterface.js` (téléchargé), `tests/pages.test.js`
- Modify: `extension/client/js/siming.js` (démarrage), `tests/run.js` (FILES)

**Interfaces:**
- Consumes: `SIMING.startHub`, `SIMING.mountTool` (Tâche 10), `SIMING.createBridge` (Tâche 6), `SIMING.applyTheme` (Tâche 10), outil hôte `siming.init` (Tâche 3).
- Produces :
  - `extension/client/tools.json` : `{ "version": "1.0.0", "repository": "OWNER/siming", "tools": [{ "id": "unparent", "name": "Unparent", "icon": "delier", "version": "2.0.0", "script": "tools/unparent.js" }] }` (`OWNER` remplacé à la Tâche 13) ;
  - `SIMING.readJson(url) -> objet` (XHR synchrone, accepte `status === 0` des fichiers locaux) ; `SIMING.loadScript(src) -> Promise` ; `SIMING.standaloneToolId(cs) -> string|null` ;
  - `SIMING.startStandalone({ root, list, bridge, toolId }) -> { status, view, mounted, ready }` ;
  - `SIMING.boot(mode = "hub"|"standalone") -> Promise<app>`.

- [ ] **Step 1: Écrire les tests `tests/pages.test.js`**

```js
'use strict';
/* Pages HTML, tools.json, panneau isolé et démarrage complet (faux CSInterface). */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { CLIENT, EXT, scene, loadHost, makeDom, hostEvalScript } = require('./helpers');

const BASE = ['js/siming.js', 'js/icons.js', 'js/ui/dom.js', 'js/ui/controls.js', 'js/ui/rail.js',
    'js/bridge.js', 'js/hub.js', 'js/standalone.js'];
const LIST = JSON.parse(fs.readFileSync(path.join(CLIENT, 'tools.json'), 'utf8'));

/** Branche le démarrage sur le disque et le faux AE. */
function bootable(win, sandbox, opts) {
    opts = opts || {};
    win.SIMING.readJson = (url) => JSON.parse(fs.readFileSync(path.join(CLIENT, url), 'utf8'));
    win.SIMING.loadScript = async (src) => { win.eval(fs.readFileSync(path.join(CLIENT, src), 'utf8')); };
    if (!opts.cs) return null;
    const opened = [];
    win.SystemPath = { EXTENSION: 'extension' };
    win.CSInterface = class {
        evalScript(script, cb) { hostEvalScript(sandbox)(script, cb); }
        getSystemPath() { return EXT; }
        getHostEnvironment() { return { appSkinInfo: { panelBackgroundColor: { color: { red: 35, green: 35, blue: 35 } } } }; }
        addEventListener() {}
        requestOpenExtension(id) { opened.push(id); }
        getExtensionID() { return opts.extensionId || 'com.siming.hub'; }
    };
    return opened;
}

module.exports = function (test) {
    test('pages : index.html et tool.html ne référencent que des fichiers existants', () => {
        for (const page of ['index.html', 'tool.html']) {
            const html = fs.readFileSync(path.join(CLIENT, page), 'utf8');
            const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
            assert.ok(refs.length >= 9, page);
            for (const ref of refs) assert.ok(fs.existsSync(path.join(CLIENT, ref)), page + ' -> ' + ref);
        }
        assert.ok(/SIMING\.boot\('hub'\)/.test(fs.readFileSync(path.join(CLIENT, 'index.html'), 'utf8')));
        assert.ok(/SIMING\.boot\('standalone'\)/.test(fs.readFileSync(path.join(CLIENT, 'tool.html'), 'utf8')));
    });

    test('tools.json : version, outils avec script, icône et cœur hôte existants', () => {
        assert.ok(/^\d+\.\d+\.\d+$/.test(LIST.version));
        assert.ok(/^[A-Za-z0-9-]+\/siming$/.test(LIST.repository));
        const win = makeDom(['js/siming.js', 'js/icons.js']);
        for (const t of LIST.tools) {
            assert.ok(fs.existsSync(path.join(CLIENT, t.script)), t.script);
            assert.ok(win.SIMING.ICONS[t.icon], 'icône ' + t.icon);
            assert.ok(fs.existsSync(path.join(EXT, 'host', 'tools', t.id + '.jsx')), 'cœur hôte de ' + t.id);
            assert.ok(/^\d+\.\d+\.\d+$/.test(t.version), t.id);
        }
    });

    test('CSInterface.js : bibliothèque Adobe présente', () => {
        const src = fs.readFileSync(path.join(CLIENT, 'lib', 'CSInterface.js'), 'utf8');
        assert.ok(/function CSInterface\(/.test(src));
        assert.ok(/evalScript/.test(src) && /requestOpenExtension/.test(src));
    });

    test('panneau isolé : outil déduit de l\'identifiant d\'extension ou de ?tool=', () => {
        const win = makeDom(BASE, 'http://localhost/tool.html?tool=unparent');
        assert.strictEqual(win.SIMING.standaloneToolId({ getExtensionID: () => 'com.siming.tool.renommer' }), 'renommer');
        assert.strictEqual(win.SIMING.standaloneToolId(null), 'unparent');
        assert.strictEqual(win.SIMING.standaloneToolId({ getExtensionID: () => 'com.siming.hub' }), 'unparent');
    });

    test('panneau isolé : un outil seul, sa propre ligne de statut, pas de rail ni de bouton « panneau »', async () => {
        scene();
        const { sandbox } = loadHost();
        const win = makeDom(BASE.concat(['tools/unparent.js']));
        const app = win.SIMING.startStandalone({
            root: win.document.getElementById('app'), list: LIST, toolId: 'unparent',
            bridge: win.SIMING.createBridge(hostEvalScript(sandbox)),
        });
        await app.ready;
        assert.strictEqual(win.document.querySelector('.s-rail'), null);
        assert.ok(win.document.querySelector('.s-app.is-standalone'));
        assert.strictEqual(win.document.querySelector('[data-role=open-standalone]'), null);
        assert.ok(win.document.querySelector('[data-role=card]'));
        assert.ok(/carte Parent/.test(app.status.text));
        const unknown = win.SIMING.startStandalone({ root: win.document.getElementById('app'), list: LIST, toolId: 'nope', bridge: null });
        assert.strictEqual(unknown.status.level, 'error');
    });

    test('démarrage hub : CSInterface présent, cœur hôte prêt, Unparent monté', async () => {
        scene();
        const { sandbox } = loadHost();
        const win = makeDom(BASE);
        const opened = bootable(win, sandbox, { cs: true });
        const app = await win.SIMING.boot('hub');
        assert.ok(win.document.querySelector('.s-rail'));
        assert.strictEqual(app.current, 'unparent');
        assert.strictEqual(app.status.level, 'info', app.status.text);
        app.views.get('unparent').querySelector('[data-role=open-standalone]').click();
        assert.deepEqual(opened, ['com.siming.tool.unparent']);
    });

    test('démarrage hub sans After Effects : le panneau s\'affiche et signale le cœur hôte', async () => {
        const { sandbox } = loadHost();
        const win = makeDom(BASE);
        bootable(win, sandbox);
        const app = await win.SIMING.boot('hub');
        assert.ok(win.document.querySelector('.s-rail'));
        assert.strictEqual(app.status.level, 'warn');
        assert.ok(/Cœur hôte/.test(app.status.text), app.status.text);
    });

    test('démarrage panneau isolé : outil tiré de l\'identifiant d\'extension', async () => {
        scene();
        const { sandbox } = loadHost();
        const win = makeDom(BASE, 'http://localhost/tool.html');
        bootable(win, sandbox, { cs: true, extensionId: 'com.siming.tool.unparent' });
        const app = await win.SIMING.boot('standalone');
        assert.ok(win.document.querySelector('.s-app.is-standalone [data-role=card]'));
        assert.strictEqual(app.status.level, 'info', app.status.text);
    });
};
```

- [ ] **Step 2: Ajouter le fichier à `tests/run.js` et vérifier l'échec**

Ajouter `'./pages.test.js',` à la fin de `FILES`.

Run: `node tests/run.js`
Expected: ÉCHEC (`extension/client/tools.json` introuvable).

- [ ] **Step 3: Télécharger `CSInterface.js` (bibliothèque officielle Adobe, gratuite)**

```bash
mkdir -p extension/client/lib
curl -fsSL -o extension/client/lib/CSInterface.js https://raw.githubusercontent.com/Adobe-CEP/CEP-Resources/master/CEP_11.x/CSInterface.js
head -c 400 extension/client/lib/CSInterface.js
```

Expected: le fichier commence par l'en-tête de licence Adobe ; ne pas le modifier.

- [ ] **Step 4: Écrire `extension/client/tools.json`**

```json
{
  "version": "1.0.0",
  "repository": "OWNER/siming",
  "tools": [
    { "id": "unparent", "name": "Unparent", "icon": "delier", "version": "2.0.0", "script": "tools/unparent.js" }
  ]
}
```

- [ ] **Step 5: Écrire `extension/client/js/standalone.js`**

```js
/*
 * SIMING : page d'un outil seul (panneau « SIMING – <Outil> »).
 *   SIMING.startStandalone({ root, list, bridge, toolId }) -> { status, view, mounted, ready }
 */
(function (global) {
    'use strict';

    const SIMING = global.SIMING;
    const ui = SIMING.ui;
    const h = ui.h;

    SIMING.startStandalone = function ({ root, list, bridge, toolId }) {
        const meta = list.tools.find((t) => t.id === toolId);
        const status = ui.statusLine({ right: 'v' + list.version });
        const view = h('section', { class: 's-view', tabindex: '-1' });
        root.replaceChildren(h('div', { class: 's-app is-standalone' }, h('main', { class: 's-views' }, view), status));
        if (!meta) {
            view.append(h('div', { class: 's-error', text: 'Outil introuvable : ' + toolId }));
            status.set('Outil introuvable : ' + toolId, 'error');
            return { status, view, mounted: null, ready: Promise.resolve() };
        }
        const mounted = SIMING.mountTool(view, meta, { bridge, ui, status, settings: SIMING.settings }, {});
        return { status, view, mounted, ready: (mounted && mounted.ready) || Promise.resolve() };
    };
})(window);
```

- [ ] **Step 6: Ajouter le démarrage à `extension/client/js/siming.js`**

Insérer avant la dernière ligne `})(window);` :

```js

    // --- Démarrage des pages ----------------------------------------------------

    /** Lit un JSON local (XHR synchrone ; un fichier local répond avec le statut 0). */
    SIMING.readJson = function (url) {
        const xhr = new global.XMLHttpRequest();
        xhr.open('GET', url, false);
        xhr.send(null);
        if (xhr.status !== 0 && xhr.status !== 200) throw new Error('Lecture impossible : ' + url);
        return JSON.parse(xhr.responseText);
    };

    SIMING.loadScript = function (src) {
        return new Promise((resolve, reject) => {
            const s = global.document.createElement('script');
            s.src = src;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('Script introuvable : ' + src));
            global.document.head.append(s);
        });
    };

    /** Outil d'un panneau isolé : identifiant d'extension com.siming.tool.<id>, sinon ?tool=<id>. */
    SIMING.standaloneToolId = function (cs) {
        try {
            const m = /^com\.siming\.tool\.(.+)$/.exec(cs.getExtensionID());
            if (m) return m[1];
        } catch (e) { /* pas de CSInterface */ }
        try {
            return new global.URLSearchParams(global.location.search).get('tool');
        } catch (e) {
            return null;
        }
    };

    /** Démarre la page : mode « hub » (index.html) ou « standalone » (tool.html). */
    SIMING.boot = async function (mode) {
        const root = global.document.getElementById('app');
        let cs = null;
        try { cs = new global.CSInterface(); } catch (e) { cs = null; }
        if (cs) SIMING.applyTheme(cs);

        const errors = [];
        let list;
        try {
            list = SIMING.readJson('tools.json');
        } catch (e) {
            root.textContent = 'SIMING : liste des outils illisible (' + e.message + ')';
            return null;
        }

        const evalScript = cs
            ? (script, cb) => cs.evalScript(script, cb)
            : (script, cb) => cb('EvalScript error.');
        const bridge = SIMING.bridge = SIMING.createBridge(evalScript);

        for (const tool of list.tools) {
            try { await SIMING.loadScript(tool.script); } catch (e) { errors.push(e.message); }
        }

        try {
            const extRoot = cs ? cs.getSystemPath(global.SystemPath.EXTENSION) : '';
            const host = await bridge.call('siming', 'init', { root: extRoot });
            if (host && host.errors) errors.push(...host.errors);
        } catch (e) {
            errors.push('Cœur hôte : ' + e.message);
        }

        const app = mode === 'standalone'
            ? SIMING.startStandalone({ root, list, bridge, toolId: SIMING.standaloneToolId(cs) })
            : SIMING.startHub({ root, list, bridge, openExtension: cs ? (id) => cs.requestOpenExtension(id, '') : null });

        await app.ready;
        if (errors.length) app.status.set(errors.join(' · '), 'warn');
        return app;
    };
```

- [ ] **Step 7: Écrire `extension/client/index.html` et `extension/client/tool.html`**

`extension/client/index.html` :

```html
<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>SIMING</title>
<link rel="stylesheet" href="css/charte.css">
<script src="lib/CSInterface.js"></script>
<script src="js/siming.js"></script>
<script src="js/icons.js"></script>
<script src="js/bridge.js"></script>
<script src="js/ui/dom.js"></script>
<script src="js/ui/controls.js"></script>
<script src="js/ui/rail.js"></script>
<script src="js/hub.js"></script>
<script src="js/standalone.js"></script>
</head>
<body>
<div id="app"></div>
<script>SIMING.boot('hub');</script>
</body>
</html>
```

`extension/client/tool.html` :

```html
<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>SIMING – outil</title>
<link rel="stylesheet" href="css/charte.css">
<script src="lib/CSInterface.js"></script>
<script src="js/siming.js"></script>
<script src="js/icons.js"></script>
<script src="js/bridge.js"></script>
<script src="js/ui/dom.js"></script>
<script src="js/ui/controls.js"></script>
<script src="js/ui/rail.js"></script>
<script src="js/hub.js"></script>
<script src="js/standalone.js"></script>
</head>
<body>
<div id="app"></div>
<script>SIMING.boot('standalone');</script>
</body>
</html>
```

- [ ] **Step 8: Lancer les tests**

Run: `node tests/run.js`
Expected: `105 réussi(s), 0 échoué(s)`.

- [ ] **Step 9: Commit**

```bash
git add extension/client tests
git commit -m "feat(pages): hub, panneau isolé, démarrage et liste des outils"
```

---

Suite : `docs/superpowers/plans/2026-10-05-siming-cep-1-0-0-partie-3-distribution.md`.
