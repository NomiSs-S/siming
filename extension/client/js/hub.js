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
            // Rangée de chiffres seulement : le pavé numérique est réservé aux outils (point d'ancrage).
            const m = /^Digit(\d)$/.exec(e.code || '');
            const n = m ? parseInt(m[1], 10) : NaN;
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
