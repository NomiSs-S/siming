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
        const all = tools.slice();
        let order = tools.slice();   // ordre d'affichage (Réglages › Ordre des outils)

        all.forEach((tool, i) => {
            const b = h('button', {
                class: 's-rail-btn', type: 'button', 'data-tool': tool.id,
                title: tool.name + ' (' + (i + 1) + ')', 'aria-label': tool.name,
                onclick: () => onSelect(tool.id),
            }, ui.icon(tool.icon, 18));
            buttons.set(tool.id, b);
            el.append(b);
        });
        const spacer = h('span', { class: 's-rail-spacer' });

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
        el.append(spacer, more, settings, menu);

        el.overflow = [];

        el.setActive = function (id) {
            buttons.forEach((b, key) => b.classList.toggle('is-active', key === id));
        };

        /** Nouvel ordre d'affichage (ids) : ids inconnus ignorés, outils oubliés à la fin.
         *  hidden (facultatif) : ids des outils masqués du rail (Réglages › Outils). */
        el.setOrder = function (ids, hidden) {
            const off = hidden || [];
            const next = ids.map((id) => all.find((t) => t.id === id)).filter(Boolean);
            for (const t of all) if (!next.includes(t)) next.push(t);
            for (const t of next) {
                const b = buttons.get(t.id);
                el.insertBefore(b, spacer);
                b.classList.toggle('is-off', off.includes(t.id));
                if (off.includes(t.id)) b.hidden = true;
            }
            order = next.filter((t) => !off.includes(t.id));
        };

        /** Infobulle « Nom (raccourci) » de chaque outil : hints = { id: 'libellé' | '' }. */
        el.setHints = function (hints) {
            for (const t of all) {
                const hint = hints[t.id];
                buttons.get(t.id).title = t.name + (hint ? ' (' + hint + ')' : '');
            }
        };

        /** Range les outils qui ne tiennent pas dans « … » (sans mise en page : tout visible). */
        el.layout = function () {
            const width = el.clientWidth;
            el.overflow = [];
            if (!width) {
                order.forEach((tool) => { buttons.get(tool.id).hidden = false; });
                more.hidden = true;
                return;
            }
            const fit = Math.max(1, Math.floor((width - 2 * SLOT - 8) / SLOT));
            order.forEach((tool, i) => {
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
