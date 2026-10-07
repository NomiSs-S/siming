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

    /** En-tête d'outil : titre, aide, « Ouvrir dans un panneau » (facultatif, picto fenêtre). */
    ui.toolHeader = function ({ title, onHelp, onOpenStandalone }) {
        const actions = h('div', { class: 's-header-actions' });
        actions.append(h('button', {
            class: 's-icon-btn', type: 'button', title: 'Aide', 'aria-label': 'Aide', 'data-role': 'help', onclick: onHelp,
        }, ui.icon('aide')));
        if (onOpenStandalone) {
            actions.append(h('button', {
                class: 's-icon-btn', type: 'button', title: 'Ouvrir dans un panneau',
                'aria-label': 'Ouvrir dans un panneau', 'data-role': 'open-standalone', onclick: onOpenStandalone,
            }, ui.icon('panneau')));
        }
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

    /** Sélecteur segmenté (2 à 4 choix courts). Un choix : texte, ou { label, count?, icon?, title? } ;
     *  avec icon, le segment montre le picto seul (label en infobulle et pour les lecteurs d'écran). */
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
                b.title = (typeof item !== 'string' && item.title) || label;
                if (typeof item !== 'string' && item.icon) {
                    b.replaceChildren(ui.icon(item.icon, 16));
                    b.setAttribute('aria-label', label);
                    b.setAttribute('data-icon', item.icon);
                    return;
                }
                b.replaceChildren(h('span', { class: 's-seg-label', text: label }));   // span : points de suspension si étroit
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

    /** Champ de recherche (30 px) : loupe, texte, croix pour vider (Échap vide aussi).
     *  onInput(texte) à chaque frappe. el.value, el.clear(). */
    ui.searchField = function ({ placeholder, onInput, role }) {
        const input = h('input', { class: 's-search-input', type: 'search', placeholder: placeholder || 'Chercher', 'aria-label': placeholder || 'Chercher', spellcheck: 'false' });
        const clear = h('button', { class: 's-search-clear', type: 'button', title: 'Vider', 'aria-label': 'Vider la recherche', hidden: true }, ui.icon('fermer', 12));
        const el = h('div', { class: 's-search', 'data-role': role || 'search' }, ui.icon('chercher', 14), input, clear);
        const changed = () => { clear.hidden = !input.value; if (onInput) onInput(input.value); };
        input.addEventListener('input', changed);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && input.value) { e.preventDefault(); e.stopPropagation(); el.clear(); }
        });
        clear.addEventListener('click', () => { el.clear(); input.focus(); });
        el.clear = () => { input.value = ''; changed(); };
        el.input = input;
        Object.defineProperty(el, 'value', { get: () => input.value });
        return el;
    };

    /** Menu déroulant (30 px, pleine largeur) : options [{ value, label }].
     *  onChange(value) au choix. el.setOptions(options, value), el.value. */
    ui.select = function ({ options, value, onChange, role, label }) {
        const el = h('select', { class: 's-select', 'data-role': role || 'select', 'aria-label': label || '' });
        el.addEventListener('change', () => { if (onChange) onChange(el.value); });
        el.setOptions = function (opts, current) {
            el.replaceChildren(...opts.map((o) => h('option', { value: o.value, text: o.label })));
            if (current !== undefined) el.value = current;
            if (el.selectedIndex < 0 && opts.length) el.selectedIndex = 0;
        };
        el.setOptions(options || [], value);
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

    /** Aide d'un outil, en fiches lisibles d'un coup d'œil : en-tête (picto de l'outil, nom,
     *  version), une phrase d'introduction, puis des groupes de fiches. Une fiche :
     *    { icon | ease ('in' | 'out' | 'both') | step (numéro), name, text?, keys?: [{ k: [touches…], t }] }
     *  footer : une ligne en bas. Échap, Entrée, clic dehors ou « Compris » ferment ;
     *  la promesse est résolue à la fermeture. */
    ui.helpDialog = function ({ title, version, icon, intro, groups, footer }) {
        const doc = global.document;
        return new Promise((resolve) => {
            let backdrop = null;
            const onKey = (e) => {
                if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); close(); }
            };
            function close() {
                if (!backdrop) return;
                backdrop.remove();
                backdrop = null;
                doc.removeEventListener('keydown', onKey, true);
                resolve();
            }
            const visual = (it) => {
                if (it.step !== undefined) return h('span', { class: 's-help-icon is-step', text: String(it.step) });
                return h('span', { class: 's-help-icon' }, it.ease ? ui.easeKey(it.ease, 16) : ui.icon(it.icon || 'aide', 16));
            };
            const combo = (keys) => keys.map((k, i) => [i ? h('span', { class: 's-help-plus', text: '+' }) : null, h('kbd', { class: 's-kbd', text: k })]);
            const card = (it) => h('div', { class: 's-help-item', 'data-role': 'help-item' }, visual(it),
                h('div', { class: 's-help-copy' },
                    h('div', { class: 's-help-name', text: it.name }),
                    it.text ? h('div', { class: 's-help-text', text: it.text }) : null,
                    (it.keys && it.keys.length) ? h('div', { class: 's-help-keys' },
                        it.keys.map((tip) => h('span', { class: 's-help-key' }, combo(tip.k), h('span', { class: 's-help-key-text', text: tip.t })))) : null));
            const ok = h('button', { class: 's-btn s-btn-primary s-help-ok', type: 'button', 'data-role': 'help-ok', onclick: close, text: 'Compris' });
            const box = h('div', { class: 's-dialog s-help', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Aide ' + (title || ''), 'data-role': 'help-dialog' },
                h('div', { class: 's-help-head' },
                    h('span', { class: 's-help-badge' }, ui.icon(icon || 'aide', 18)),
                    h('span', { class: 's-help-title', text: title || '' }),
                    version ? h('span', { class: 's-help-version', text: 'v' + version }) : null),
                h('div', { class: 's-help-body' },
                    intro ? h('p', { class: 's-help-intro', text: intro }) : null,
                    (groups || []).map((g) => h('section', { class: 's-help-group' },
                        g.title ? h('div', { class: 's-section s-help-group-title', text: g.title }) : null,
                        (g.items || []).map(card)))),
                h('div', { class: 's-help-foot' },
                    footer ? h('span', { class: 's-help-foot-text', text: footer }) : h('span'), ok));
            backdrop = h('div', { class: 's-dialog-backdrop s-help-backdrop', onclick: (e) => { if (e.target === backdrop) close(); } }, box);
            doc.body.append(backdrop);
            doc.addEventListener('keydown', onKey, true);
            ok.focus();
        });
    };

    /** Barre de valeur (30 px) : libellé et valeur dedans ; glisser n'importe où (clic =
     *  saut, Maj = précision), molette ±step (Maj ×10), flèches ±step (Maj ×10),
     *  double-clic = saisie au clavier, Alt + clic = valeur par défaut.
     *  onInput pendant le geste, onChange au relâchement, à la molette, au clavier et à la saisie.
     *  integer : valeurs entières (sinon au dixième). */
    ui.valueBar = function ({ label, min, max, step, unit, value, defaultValue, onInput, onChange, role, integer }) {
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
            v = integer ? Math.round(Number(v)) : Math.round(Number(v) * 10) / 10;
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
    // Les modes parlent du mouvement : « entrée » (in) = il part de la keyframe, donc son
    // côté droit (sortant) est lissé ; « sortie » (out) = il arrive sur la keyframe, côté gauche.
    const EASE_FILLS = {
        in:   'M8 2.5l5.5 5.5L8 13.5z',           // moitié droite : le mouvement part d'ici
        out:  'M8 2.5L2.5 8 8 13.5z',            // moitié gauche : le mouvement arrive ici
        both: 'M8 2.5l5.5 5.5L8 13.5 2.5 8z',
    };

    /** Picto de keyframe (16) pour le lissage : contour du losange, moitié lissée remplie
     *  (in = droite, out = gauche, both = entier), comme l'icône de la keyframe obtenue
     *  dans After Effects. Couleur = currentColor. */
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

    // --- Étiquettes de couleur d'After Effects -------------------------------------
    // palette : [{ index, color, name }] lue par l'hôte (0 = Aucune, 1 à 16) ; -1 = « Ne pas changer ».
    const KEEP = -1;
    const labelOf = (palette, value) => (palette || []).find((p) => p.index === value) || null;

    /** Nom affiché d'une étiquette (ou « Ne pas changer »). */
    ui.labelName = function (palette, value) {
        if (value === KEEP) return 'Ne pas changer';
        const p = labelOf(palette, value);
        return p && p.name ? p.name : 'Étiquette ' + value;
    };

    function paintSwatch(el, palette, value) {
        const p = labelOf(palette, value);
        el.classList.toggle('is-none', value === 0);
        el.classList.toggle('is-keep', value === KEEP);
        el.style.backgroundColor = (value > 0 && p && p.color) ? p.color : '';
    }

    /** Carré de couleur d'une étiquette : Aucune = barré, Ne pas changer = pointillés. */
    ui.swatch = function (palette, value) {
        const el = h('span', { class: 's-swatch', 'data-label': String(value) });
        paintSwatch(el, palette, value);
        return el;
    };

    let closeOpenPicker = null;

    /** Place la fenêtre flottante sous anchor (au-dessus s'il n'y a pas la place), dans la fenêtre. */
    function placePopover(box, anchor) {
        const r = anchor ? anchor.getBoundingClientRect() : { left: 4, top: 4, bottom: 4 };
        const w = box.offsetWidth, ht = box.offsetHeight;
        let top = r.bottom + 4;
        if (top + ht > global.innerHeight - 4 && r.top - ht - 4 >= 4) top = r.top - ht - 4;
        box.style.top = Math.max(4, top) + 'px';
        box.style.left = Math.max(4, Math.min(r.left, global.innerWidth - w - 4)) + 'px';
    }

    /** Sélecteur d'étiquette flottant sous anchor : 16 couleurs en 4 × 4, puis Aucune et, si
     *  allowKeep, « Ne pas changer » ; le nom de la couleur survolée s'affiche en haut.
     *  onPick(index) ; Échap ou clic dehors ferme ; flèches pour se déplacer. Un seul ouvert
     *  à la fois. press : ouvert au bouton enfoncé (geste en un clic) : relâcher sur une couleur
     *  la choisit, relâcher sur anchor laisse le sélecteur ouvert, relâcher ailleurs le ferme.
     *  value absente ou null : aucune couleur cochée (plusieurs calques de couleurs différentes).
     *  Renvoie close() (close.isOpen() dit s'il est encore ouvert). */
    ui.labelPicker = function ({ palette, value, allowKeep, anchor, onPick, press }) {
        if (closeOpenPicker) closeOpenPicker();
        const doc = global.document;
        let open = true;
        const name = h('div', { class: 's-picker-name' });
        const show = (v) => { name.textContent = (v === null || v === undefined) ? 'Plusieurs couleurs' : ui.labelName(palette, v); };
        const cells = [];
        const cell = (v, wide) => {
            const label = ui.labelName(palette, v);
            const b = h('button', {
                class: 's-picker-cell' + (v === value ? ' is-on' : '') + (wide ? ' is-wide' : ''), type: 'button',
                'data-label': String(v), title: label, 'aria-label': label, 'aria-pressed': String(v === value),
                onclick: () => { close(); if (onPick) onPick(v); },
                onmouseenter: () => show(v), onfocus: () => show(v),
            }, ui.swatch(palette, v), wide ? h('span', { text: label }) : null);
            cells.push(b);
            return b;
        };
        const grid = h('div', { class: 's-picker-grid' });
        for (let v = 1; v <= 16; v++) grid.append(cell(v));
        const extra = h('div', { class: 's-picker-extra' }, cell(0, true), allowKeep ? cell(KEEP, true) : null);
        const box = h('div', { class: 's-popover', role: 'dialog', 'aria-label': 'Choisir une étiquette', 'data-role': 'label-picker' },
            name, grid, extra);
        box.addEventListener('mouseleave', () => show(value));
        show(value);

        const onKey = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                close();
                if (anchor && anchor.focus) anchor.focus();
                return;
            }
            const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 4, ArrowUp: -4 }[e.key];
            if (!step) return;
            e.preventDefault();
            e.stopPropagation();
            const i = cells.indexOf(doc.activeElement);
            if (i < 0) { (box.querySelector('.is-on') || cells[0]).focus(); return; }   // ouvert à la souris
            cells[Math.max(0, Math.min(cells.length - 1, i + step))].focus();
        };
        const onDown = (e) => {
            if (!box.contains(e.target) && !(anchor && anchor.contains(e.target))) close();
        };
        /** Fin du geste en un clic : la couleur sous le pointeur au relâchement est choisie. */
        const onUp = (e) => {
            doc.removeEventListener('pointerup', onUp, true);
            const t = e.target && e.target.closest ? e.target : null;
            const c = t ? t.closest('.s-picker-cell') : null;
            if (c && box.contains(c)) { e.preventDefault(); c.click(); return; }
            if (t && (box.contains(t) || (anchor && anchor.contains(t)))) return;   // simple clic : reste ouvert
            close();
        };
        function close() {
            if (!open) return;
            open = false;
            box.remove();
            doc.removeEventListener('keydown', onKey, true);
            doc.removeEventListener('pointerdown', onDown, true);
            doc.removeEventListener('pointerup', onUp, true);
            if (closeOpenPicker === close) closeOpenPicker = null;
        }
        close.isOpen = () => open;
        doc.body.append(box);
        placePopover(box, anchor);
        doc.addEventListener('keydown', onKey, true);
        doc.addEventListener('pointerdown', onDown, true);
        if (press) doc.addEventListener('pointerup', onUp, true);
        closeOpenPicker = close;
        if (!press) (box.querySelector('.is-on') || cells[0]).focus();   // clavier : flèches tout de suite
        return close;
    };

    /** Ouvre un sélecteur au bouton enfoncé sur el (geste en un clic) et au clic clavier
     *  (Entrée, Espace : detail 0). open(press) ouvre, ou referme s'il est déjà ouvert ;
     *  skip(e) : ignorer ce pointeur (modificateurs pour la sélection, par exemple). */
    ui.pressToOpen = function (el, open, skip) {
        el.addEventListener('pointerdown', (e) => {
            if (e.button !== 0 || el.disabled || (skip && skip(e))) return;
            e.preventDefault();   // garde le focus sur le sélecteur qui s'ouvre
            open(true);
        });
        el.addEventListener('click', (e) => {
            if (e.detail === 0 && !(skip && skip(e))) open(false);
        });
    };

    /** Bouton pastille d'étiquette (30 px) : bouton enfoncé = sélecteur ouvert, relâché sur une
     *  couleur = choisie (un seul geste) ; un simple clic l'ouvre, un second le ferme.
     *  withName : nom de la couleur et chevron à côté du carré. onChange(index).
     *  el.value, el.set(index), el.setPalette(palette). */
    ui.labelSwatch = function ({ palette, value, allowKeep, withName, onChange, role, title }) {
        let pal = palette || [];
        let current = value;
        let close = null;
        const dot = h('span', { class: 's-swatch' });
        const name = withName ? h('span', { class: 's-swatch-name' }) : null;
        const el = h('button', { class: 's-swatch-btn' + (withName ? ' is-named' : ''), type: 'button', 'data-role': role || 'label-swatch' },
            dot, name, withName ? ui.icon('deplier', 12) : null);
        function render() {
            paintSwatch(dot, pal, current);
            const n = ui.labelName(pal, current);
            if (name) name.textContent = n;
            el.title = (title ? title + ' : ' : '') + n;
            el.setAttribute('aria-label', el.title);
            el.setAttribute('data-label', String(current));
        }
        ui.pressToOpen(el, (press) => {
            if (close && close.isOpen()) { close(); return; }
            close = ui.labelPicker({
                palette: pal, value: current, allowKeep, anchor: el, press,
                onPick: (v) => { el.set(v); if (onChange) onChange(v); },
            });
        });
        el.set = (v) => { current = v; render(); };
        el.setPalette = (p) => { pal = p || []; render(); };
        Object.defineProperty(el, 'value', { get: () => current });
        render();
        return el;
    };
})(window);
