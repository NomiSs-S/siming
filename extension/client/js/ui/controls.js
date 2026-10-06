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

    /** Carte cliquable (56 px) : vide = invitation à agir, remplie = objet courant
     *  (avec, s'il y en a une, sa couleur d'étiquette en carré devant le titre). */
    ui.card = function ({ onClick, role }) {
        const icon = h('span', { class: 's-card-icon' });
        const swatch = h('span', { class: 's-card-swatch', hidden: true });
        const title = h('span', { class: 's-card-title' });
        const sub = h('span', { class: 's-card-sub' });
        const el = h('button', { class: 's-card', type: 'button', 'data-role': role || 'card', onclick: onClick },
            icon, swatch, h('span', { class: 's-card-text' }, title, sub));
        el.set = function ({ title: t, subtitle, empty, color }) {
            title.textContent = t || '';
            sub.textContent = subtitle || '';
            swatch.hidden = !!empty || !color;
            swatch.style.backgroundColor = (!empty && color) ? color : '';
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

    /** Barre de valeur (30 px) : libellé et valeur dedans ; glisser n'importe où (clic =
     *  saut, Maj = précision), molette ±step (Maj ×10), flèches ±step (Maj ×10),
     *  double-clic = saisie au clavier, Alt + clic = valeur par défaut.
     *  onInput pendant le geste, onChange au relâchement, à la molette, au clavier et à la saisie. */
    ui.valueBar = function ({ label, min, max, step, unit, value, defaultValue, onInput, onChange, role }) {
        const lo = (min === undefined) ? 0 : min;
        const hi = (max === undefined) ? 100 : max;
        const inc = step || 1;
        const base = (defaultValue === undefined) ? lo : defaultValue;
        const fill = h('span', { class: 's-bar-fill' });
        const mark = h('span', { class: 's-bar-mark' });
        const lab = h('span', { class: 's-bar-label', text: label || '' });
        const val = h('span', { class: 's-bar-value' });
        const input = h('input', { class: 's-bar-input', type: 'text', inputmode: 'decimal', hidden: true, 'aria-label': label || '' });
        const el = h('div', {
            class: 's-bar', role: 'slider', tabindex: '0', 'data-role': role || 'value-bar',
            'aria-label': label || '', 'aria-valuemin': String(lo), 'aria-valuemax': String(hi),
        }, fill, mark, lab, val, input);
        let current = clamp(value === undefined ? base : value);

        function clamp(v) {
            v = Math.round(Number(v) * 10) / 10;
            if (isNaN(v)) v = base;
            return Math.min(hi, Math.max(lo, v));
        }
        function render() {
            const pct = hi > lo ? (current - lo) / (hi - lo) * 100 : 0;
            fill.style.width = pct + '%';
            mark.style.left = pct + '%';
            val.textContent = current + (unit || '');
            el.setAttribute('aria-valuenow', String(current));
        }
        /** fire : 'input' (geste en cours), 'change' (valeur finale), 'changed' (seulement si différente), null. */
        function set(v, fire) {
            const next = clamp(v);
            const changed = next !== current;
            current = next;
            render();
            if (fire === 'input' && onInput) onInput(current);
            if ((fire === 'change' || (fire === 'changed' && changed)) && onChange) onChange(current);
        }
        function valueAt(clientX) {
            const r = el.getBoundingClientRect();
            const t = r.width ? (clientX - r.left) / r.width : 0;
            return lo + Math.min(1, Math.max(0, t)) * (hi - lo);
        }

        let drag = null;
        el.addEventListener('pointerdown', (e) => {
            if (e.button !== 0 || !input.hidden) return;
            if (e.altKey) { set(base, 'change'); return; }
            const raw = valueAt(e.clientX);
            drag = { lastRaw: raw };
            if (el.setPointerCapture) { try { el.setPointerCapture(e.pointerId); } catch (err) { /* hors navigateur */ } }
            el.classList.add('is-dragging');
            set(raw, 'input');
        });
        el.addEventListener('pointermove', (e) => {
            if (!drag) return;
            const raw = valueAt(e.clientX);
            const next = e.shiftKey ? current + (raw - drag.lastRaw) * 0.1 : raw;
            drag.lastRaw = raw;
            set(next, 'input');
        });
        const endDrag = (e) => {
            if (!drag) return;
            drag = null;
            el.classList.remove('is-dragging');
            if (el.releasePointerCapture) { try { el.releasePointerCapture(e.pointerId); } catch (err) { /* idem */ } }
            set(current, 'change');
        };
        el.addEventListener('pointerup', endDrag);
        el.addEventListener('pointercancel', endDrag);
        el.addEventListener('wheel', (e) => {
            if (!input.hidden) return;
            e.preventDefault();
            set(current + (e.deltaY < 0 ? inc : -inc) * (e.shiftKey ? 10 : 1), 'changed');
        }, { passive: false });
        el.addEventListener('keydown', (e) => {
            if (!input.hidden) return;
            const k = inc * (e.shiftKey ? 10 : 1);
            if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); set(current + k, 'changed'); }
            else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); set(current - k, 'changed'); }
        });
        el.addEventListener('dblclick', () => {
            input.value = String(current);
            input.hidden = false;
            lab.hidden = true;
            val.hidden = true;
            input.focus();
            input.select();
        });
        function closeEdit(commit) {
            if (input.hidden) return;
            input.hidden = true;
            lab.hidden = false;
            val.hidden = false;
            if (commit) {
                const n = parseFloat(String(input.value).replace(',', '.'));
                if (!isNaN(n)) set(n, 'change');
            }
            el.focus();
        }
        input.addEventListener('keydown', (e) => {
            e.stopPropagation();   // Entrée et Échap restent dans le champ (pas de bouton principal, pas de dialogue)
            if (e.key === 'Enter') { e.preventDefault(); closeEdit(true); }
            else if (e.key === 'Escape') { e.preventDefault(); closeEdit(false); }
        });
        input.addEventListener('blur', () => closeEdit(true));

        el.set = (v) => set(v, null);
        Object.defineProperty(el, 'value', { get: () => current });
        render();
        return el;
    };

    const SVG_NS = 'http://www.w3.org/2000/svg';
    const EASE_FILLS = {
        in:   'M8 2.5L2.5 8 8 13.5z',            // moitié gauche : côté qui arrive
        out:  'M8 2.5l5.5 5.5L8 13.5z',           // moitié droite : côté qui repart
        both: 'M8 2.5l5.5 5.5L8 13.5 2.5 8z',
    };

    /** Picto de keyframe (16) pour le lissage : contour du losange, moitié lissée remplie
     *  (in = gauche, out = droite, both = entier). Couleur = currentColor. */
    ui.easeKey = function (mode, size) {
        const doc = global.document;
        const px = String(size || 16);
        const node = (tag, attrs) => {
            const n = doc.createElementNS(SVG_NS, tag);
            for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
            return n;
        };
        const svg = node('svg', { class: 's-icon s-ease-key', width: px, height: px, viewBox: '0 0 16 16', 'aria-hidden': 'true', 'data-mode': mode });
        svg.append(
            node('path', { class: 's-ease-key-fill', d: EASE_FILLS[mode] || EASE_FILLS.both, fill: 'currentColor' }),
            node('path', { d: 'M8 2.5l5.5 5.5L8 13.5 2.5 8z', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linejoin': 'round' }));
        return svg;
    };

    const POINT9_TITLES = { 7: 'Haut gauche', 8: 'Haut centre', 9: 'Haut droite', 4: 'Milieu gauche', 5: 'Centre',
        6: 'Milieu droite', 1: 'Bas gauche', 2: 'Bas centre', 3: 'Bas droite' };

    /** Carré 3 × 3 de positions (108 × 108) : neuf cases cliquables numérotées comme le
     *  pavé numérique (7 8 9 en haut). onPick(cell) au clic ; el.set(cell) ; el.value. */
    ui.point9 = function ({ value, onPick, role }) {
        const el = h('div', { class: 's-point9', role: 'group', 'data-role': role || 'point9', 'aria-label': 'Point d\'ancrage' });
        const cells = {};
        for (const n of [7, 8, 9, 4, 5, 6, 1, 2, 3]) {
            cells[n] = h('button', {
                class: 's-point9-cell', type: 'button', 'data-cell': String(n), title: POINT9_TITLES[n],
                onclick: () => { el.set(n); if (onPick) onPick(n); },
            }, h('span', { class: 's-point9-dot' }));
            el.append(cells[n]);
        }
        el.set = function (n) {
            el.value = Number(n);
            for (const k of Object.keys(cells)) cells[k].classList.toggle('is-on', Number(k) === el.value);
        };
        el.set(value || 5);
        return el;
    };
})(window);
