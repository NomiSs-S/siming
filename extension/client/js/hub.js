/*
 * SIMING : hub (panneau principal). Rail, une vue par outil, Réglages, statut commun,
 * raccourcis clavier (registre SIMING.keys : « Afficher <outil> » = chiffre de sa place).
 *   SIMING.startHub({ root, list, bridge, openExtension }) -> hub
 */
(function (global) {
    'use strict';

    const SIMING = global.SIMING;
    const ui = SIMING.ui;
    const h = ui.h;
    const SETTINGS = '__settings';

    /** Outils dans l'ordre choisi (réglage « toolOrder » : ids séparés par des virgules).
     *  Ids inconnus ignorés ; outils absents du réglage à la fin, dans l'ordre de tools.json. */
    SIMING.orderTools = function (tools, order) {
        const out = [];
        for (const id of String(order || '').split(',')) {
            const t = tools.find((x) => x.id === id.trim());
            if (t && !out.includes(t)) out.push(t);
        }
        for (const t of tools) if (!out.includes(t)) out.push(t);
        return out;
    };

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
        const keys = SIMING.keys;
        const doc = global.document;
        let tools = SIMING.orderTools(list.tools, SIMING.settings.get('toolOrder', ''));
        const status = ui.statusLine({ right: 'v' + list.version });
        const views = new Map();
        const mounted = {};
        const rail = ui.rail({ tools, onSelect: (id) => show(id), onSettings: () => show(SETTINGS) });
        const stack = h('main', { class: 's-views' });
        root.replaceChildren(h('div', { class: 's-app' }, rail, stack, status));

        const ctx = { bridge, ui, status, settings: SIMING.settings, keys };
        for (const meta of list.tools) {
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

        const hub = { show, status, rail, views, mounted, current: null, ready: null, tools: () => tools.slice() };

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

        /** Raccourcis du panneau : « Afficher <outil> » = chiffre de sa place dans le rail
         *  (rangée de chiffres, 1 à 9 ; le pavé numérique reste aux outils), Réglages sans touche. */
        function registerHubActions() {
            keys.unregisterGroup(keys.HUB_GROUP);
            tools.forEach((t, i) => keys.register({
                id: 'hub.show.' + t.id, label: 'Afficher ' + t.name, group: keys.HUB_GROUP,
                defaultKey: i < 9 ? 'Digit' + (i + 1) : null, run: () => show(t.id),
            }));
            keys.register({ id: 'hub.settings', label: 'Afficher les réglages', group: keys.HUB_GROUP, run: () => show(SETTINGS) });
            refreshHints();
        }

        /** Infobulles du rail : « Nom (touche) ». */
        function refreshHints() {
            const map = keys.bindings(), hints = {};
            for (const t of tools) hints[t.id] = map['hub.show.' + t.id] ? map['hub.show.' + t.id].label : '';
            rail.setHints(hints);
        }

        function setOrder(ids) {
            tools = SIMING.orderTools(list.tools, ids.join(','));
            SIMING.settings.set('toolOrder', tools.map((t) => t.id).join(','));
            rail.setOrder(tools.map((t) => t.id));
            registerHubActions();
            rail.layout();
            settings.refresh();
        }

        registerHubActions();
        keys.attach(doc);
        const settings = buildSettings(settingsView, { list, tools: () => tools, status, onOrder: setOrder, onKeys: refreshHints });
        global.addEventListener('resize', () => rail.layout());

        hub.ready = Promise.all(Object.values(mounted).map((m) => (m && m.ready) || null).filter(Boolean)).catch(() => {});
        show(startTool());
        rail.layout();
        return hub;
    };

    /** Vue Réglages : outil au lancement, ordre des outils, raccourcis clavier, à propos.
     *  tools() donne l'ordre courant ; onOrder(ids) le change ; onKeys() après un raccourci modifié. */
    function buildSettings(view, { list, tools, status, onOrder, onKeys }) {
        const keys = SIMING.keys;
        const doc = view.ownerDocument;
        view.append(h('div', { class: 's-header' }, h('span', { class: 's-title', text: 'Réglages' })));

        // --- Outil au lancement -----------------------------------------------------
        view.append(ui.sectionTitle('Outil au lancement'));
        const startGroup = h('div', { class: 's-choices', role: 'radiogroup', 'data-role': 'start-tool' });
        view.append(startGroup);
        function renderStart() {
            const current = SIMING.settings.get('startTool', 'last');
            const choices = [{ id: 'last', name: 'Dernier outil utilisé' }].concat(tools().map((t) => ({ id: t.id, name: t.name })));
            startGroup.replaceChildren(...choices.map((c) => {
                const input = h('input', { type: 'radio', name: 'siming-start', value: c.id, checked: c.id === current });
                input.addEventListener('change', () => SIMING.settings.set('startTool', c.id));
                return h('label', { class: 's-choice' }, input, h('span', { text: c.name }));
            }));
        }

        // --- Ordre des outils ---------------------------------------------------------
        view.append(ui.sectionTitle('Ordre des outils'));
        const orderList = h('div', { class: 's-order', 'data-role': 'tool-order' });
        view.append(orderList);
        function renderOrder() {
            const ts = tools();
            orderList.replaceChildren(...ts.map((t, i) => {
                const move = (dir) => {
                    const ids = ts.map((x) => x.id);
                    ids.splice(i, 1);
                    ids.splice(i + dir, 0, t.id);
                    onOrder(ids);
                };
                return h('div', { class: 's-order-row', 'data-tool': t.id },
                    h('span', { class: 's-order-icon' }, ui.icon(t.icon, 16)),
                    h('span', { class: 's-order-name', text: t.name }),
                    h('button', {
                        class: 's-icon-btn', type: 'button', 'data-role': 'order-up', title: 'Monter', 'aria-label': 'Monter ' + t.name,
                        disabled: i === 0, onclick: () => move(-1),
                    }, ui.icon('monter', 16)),
                    h('button', {
                        class: 's-icon-btn', type: 'button', 'data-role': 'order-down', title: 'Descendre', 'aria-label': 'Descendre ' + t.name,
                        disabled: i === ts.length - 1, onclick: () => move(1),
                    }, ui.icon('descendre', 16)));
            }));
        }

        // --- Raccourcis clavier -------------------------------------------------------
        view.append(ui.sectionTitle('Raccourcis clavier'));
        view.append(h('div', { class: 's-hint', text: 'Clique la touche d\'une action, puis frappe le nouveau raccourci (Retour arrière : aucun, Échap : annuler). Les raccourcis agissent quand le panneau a le focus.' }));
        const keyList = h('div', { class: 's-keys', 'data-role': 'shortcuts' });
        view.append(keyList);
        view.append(h('div', { class: 's-settings-actions' }, ui.button({
            label: 'Rétablir les raccourcis par défaut', role: 'keys-reset',
            onClick: () => { keys.reset(); renderKeys(); onKeys(); status.set('Raccourcis par défaut rétablis', 'ok'); },
        })));

        function keyRow(action, b) {
            const btn = h('button', {
                class: 's-key-btn' + (b ? '' : ' is-empty'), type: 'button', 'data-action': action.id,
                title: 'Changer le raccourci de « ' + action.label + ' »', text: b ? b.label : '—',
            });
            btn.addEventListener('click', () => {
                btn.textContent = 'Appuie sur une touche…';
                btn.classList.add('is-recording');
                keys.record(doc, (result) => {
                    if (result !== false) {
                        const freed = keys.setBinding(action.id, result);
                        if (freed.length) status.set('Raccourci repris à : ' + freed.join(', '), 'warn');
                        else status.set('« ' + action.label + ' » : ' + (result ? result.label : 'aucun raccourci'), 'ok');
                        onKeys();
                    }
                    renderKeys();
                });
            });
            return h('div', { class: 's-key-row' }, h('span', { class: 's-key-label', text: action.label }), btn);
        }
        function renderKeys() {
            const map = keys.bindings();
            const all = keys.actions();
            const groups = [keys.HUB_GROUP].concat(tools().map((t) => t.name));
            for (const a of all) if (!groups.includes(a.group)) groups.push(a.group);
            const nodes = [];
            for (const g of groups) {
                const acts = all.filter((a) => a.group === g);
                if (!acts.length) continue;
                nodes.push(h('div', { class: 's-keys-group', text: g }));
                for (const a of acts) nodes.push(keyRow(a, map[a.id]));
            }
            keyList.replaceChildren(...nodes);
        }

        // --- À propos -------------------------------------------------------------------
        view.append(ui.sectionTitle('À propos'));
        view.append(h('dl', { class: 's-about', 'data-role': 'about' },
            h('dt', { text: 'SIMING' }), h('dd', { text: list.version }),
            list.tools.map((t) => [h('dt', { text: t.name }), h('dd', { text: t.version })])));

        const refresh = () => { renderStart(); renderOrder(); renderKeys(); };
        refresh();
        return { refresh };
    }
})(window);
