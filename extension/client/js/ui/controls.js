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
