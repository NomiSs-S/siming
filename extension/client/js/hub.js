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
    const SEARCH_FROM = 7;   // champ de recherche des outils à partir de ce nombre d'outils

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

    /** Ids séparés par des virgules -> tableau (vides retirés). */
    const parseIds = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

    /** Déplace l'élément d'indice from à l'indice to (copie du tableau). */
    SIMING.moveItem = function (items, from, to) {
        const out = items.slice();
        const [it] = out.splice(from, 1);
        out.splice(Math.max(0, Math.min(out.length, to)), 0, it);
        return out;
    };

    /** Texte sans accents ni majuscules, pour les recherches. */
    SIMING.fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

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
        let hidden = parseIds(SIMING.settings.get('hiddenTools', '')).filter((id) => list.tools.some((t) => t.id === id));
        if (hidden.length >= list.tools.length) hidden = [];   // jamais tout masquer
        const shown = () => tools.filter((t) => !hidden.includes(t.id));
        const status = ui.statusLine({ right: 'v' + list.version });
        const views = new Map();
        const mounted = {};
        const rail = ui.rail({ tools, onSelect: (id) => show(id), onSettings: () => show(SETTINGS) });
        const stack = h('main', { class: 's-views' });
        root.replaceChildren(h('div', { class: 's-app' }, rail, stack, status));
        rail.setOrder(tools.map((t) => t.id), hidden);

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

        const hub = { show, status, rail, views, mounted, current: null, ready: null, tools: () => tools.slice(), hidden: () => hidden.slice() };

        function show(id) {
            if (!views.has(id) || hidden.includes(id)) id = shown().length ? shown()[0].id : SETTINGS;
            views.forEach((v, key) => { v.hidden = key !== id; });
            rail.setActive(id);
            if (id !== SETTINGS) SIMING.settings.set('lastTool', id);
            hub.current = id;
        }

        function startTool() {
            const pref = SIMING.settings.get('startTool', 'last');
            const id = pref === 'last' ? SIMING.settings.get('lastTool', '') : pref;
            if (id && id !== SETTINGS && views.has(id) && !hidden.includes(id)) return id;
            return shown().length ? shown()[0].id : SETTINGS;
        }

        /** Raccourcis du panneau : « Afficher <outil> » = chiffre de sa place dans le rail
         *  (outils visibles, rangée de chiffres 1 à 9 ; le pavé numérique reste aux outils). */
        function registerHubActions() {
            keys.unregisterGroup(keys.HUB_GROUP);
            shown().forEach((t, i) => keys.register({
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

        /** Rail, touches et Réglages suivent l'ordre et les outils masqués. */
        function apply() {
            rail.setOrder(tools.map((t) => t.id), hidden);
            registerHubActions();
            rail.layout();
            if (hub.current && hidden.includes(hub.current)) show(shown()[0].id);
            settings.refresh();
        }

        function setOrder(ids) {
            tools = SIMING.orderTools(list.tools, ids.join(','));
            SIMING.settings.set('toolOrder', tools.map((t) => t.id).join(','));
            apply();
        }

        function setHidden(id, off) {
            const next = hidden.filter((x) => x !== id);
            if (off) next.push(id);
            if (next.length >= list.tools.length) return false;
            hidden = next;
            SIMING.settings.set('hiddenTools', hidden.join(','));
            apply();
            return true;
        }

        registerHubActions();
        keys.attach(doc);
        const settings = buildSettings(settingsView, {
            list, status, tools: () => tools, hidden: () => hidden,
            onOrder: setOrder, onHidden: setHidden, onKeys: refreshHints,
        });
        global.addEventListener('resize', () => rail.layout());

        hub.ready = Promise.all(Object.values(mounted).map((m) => (m && m.ready) || null).filter(Boolean)).catch(() => {});
        show(startTool());
        rail.layout();
        return hub;
    };

    /** Vue Réglages en trois onglets, pensée pour beaucoup d'outils :
     *   Outils     : liste réordonnable (poignée à glisser, ou ↑ ↓ au clavier), œil = masquer
     *                du rail, touche de chaque outil ; recherche dès SEARCH_FROM outils.
     *   Raccourcis : recherche + actions groupées par outil, rétablir.
     *   Général    : outil au lancement (menu déroulant), à propos.
     *  tools() / hidden() : état courant ; onOrder(ids), onHidden(id, masqué) ; onKeys() après un raccourci. */
    function buildSettings(view, { list, status, tools, hidden, onOrder, onHidden, onKeys }) {
        const keys = SIMING.keys;
        const doc = view.ownerDocument;
        const TABS = [{ id: 'tools', label: 'Outils' }, { id: 'keys', label: 'Raccourcis' }, { id: 'general', label: 'Général' }];
        const panes = {};
        const tabs = ui.segmented({
            role: 'settings-tabs', labels: TABS.map((t) => t.label),
            onChange: (i) => selectTab(TABS[i].id),
        });
        view.append(h('div', { class: 's-header' }, h('span', { class: 's-title', text: 'Réglages' })), tabs);
        for (const t of TABS) {
            panes[t.id] = h('div', { class: 's-settings-pane', 'data-pane': t.id, hidden: true });
            view.append(panes[t.id]);
        }
        function selectTab(id) {
            if (!panes[id]) id = 'tools';
            tabs.select(TABS.findIndex((t) => t.id === id));
            for (const k of Object.keys(panes)) panes[k].hidden = k !== id;
            SIMING.settings.set('settingsTab', id);
        }

        // --- Outils : ordre, masquer, touche ------------------------------------------
        const toolsTitle = ui.sectionTitle('Outils du rail', { counter: true });
        let toolQuery = '';
        const toolSearch = ui.searchField({ placeholder: 'Chercher un outil', role: 'tools-search', onInput: (q) => { toolQuery = q; renderTools(); } });
        const toolList = h('div', { class: 's-order', 'data-role': 'tool-order' });
        panes.tools.append(toolsTitle, toolSearch, toolList,
            h('div', { class: 's-hint', text: 'Glisse la poignée pour changer l\'ordre (ou ↑ ↓ au clavier). L\'œil masque l\'outil du rail ; il reste disponible en panneau isolé. Les 9 premiers outils visibles ont les touches 1 à 9.' }));

        function renderTools() {
            const ts = tools();
            const off = hidden();
            const map = keys.bindings();
            toolsTitle.counter.textContent = ts.length + (off.length ? ' · ' + off.length + ' masqué' + (off.length > 1 ? 's' : '') : '');
            toolSearch.hidden = ts.length < SEARCH_FROM;
            const q = SIMING.fold(toolQuery.trim());
            const filtering = !toolSearch.hidden && q !== '';
            const rows = ts.map((t, i) => {
                const isOff = off.includes(t.id);
                const b = map['hub.show.' + t.id];
                const grip = h('button', {
                    class: 's-grip', type: 'button', 'data-role': 'order-grip', disabled: filtering,
                    title: filtering ? 'Vide la recherche pour réordonner' : 'Glisser pour déplacer (↑ ↓ au clavier)',
                    'aria-label': 'Déplacer ' + t.name,
                }, ui.icon('poignee', 16));
                grip.addEventListener('keydown', (e) => {
                    const dir = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
                    if (!dir || i + dir < 0 || i + dir >= ts.length) return;
                    e.preventDefault();
                    onOrder(SIMING.moveItem(ts.map((x) => x.id), i, i + dir));
                    const again = toolList.querySelector('[data-tool="' + t.id + '"] [data-role=order-grip]');
                    if (again) again.focus();
                });
                grip.addEventListener('pointerdown', (e) => startDrag(e, row));
                const eye = h('button', {
                    class: 's-icon-btn s-eye' + (isOff ? ' is-off' : ''), type: 'button', 'data-role': 'tool-visible',
                    'aria-pressed': String(!isOff), disabled: !isOff && off.length >= ts.length - 1,
                    title: isOff ? 'Afficher dans le rail' : 'Masquer du rail', 'aria-label': (isOff ? 'Afficher ' : 'Masquer ') + t.name,
                    onclick: () => {
                        if (onHidden(t.id, !isOff)) status.set(t.name + (isOff ? ' affiché dans le rail' : ' masqué du rail'), 'ok');
                    },
                }, ui.icon(isOff ? 'masque' : 'visible', 16));
                const row = h('div', { class: 's-order-row' + (isOff ? ' is-off' : ''), 'data-tool': t.id },
                    grip,
                    h('span', { class: 's-order-icon' }, ui.icon(t.icon, 16)),
                    h('span', { class: 's-order-name', text: t.name, title: t.name + ' ' + t.version }),
                    h('span', { class: 's-kbd' + (b && !isOff ? '' : ' is-empty'), 'data-role': 'tool-key', text: b && !isOff ? b.label : '' }),
                    eye);
                row.hidden = filtering && !SIMING.fold(t.name).includes(q);
                return row;
            });
            toolList.replaceChildren(...rows);
            if (filtering && rows.every((r) => r.hidden)) toolList.append(h('div', { class: 's-empty', text: 'Aucun outil ne correspond' }));
        }

        /** Glisser une ligne par sa poignée : la ligne suit le pointeur, l'ordre est
         *  enregistré au relâchement. */
        function startDrag(e, row) {
            if (e.button !== 0 || e.currentTarget.disabled) return;
            const grip = e.currentTarget;
            const before = Array.from(toolList.children).map((r) => r.getAttribute('data-tool'));
            row.classList.add('is-dragging');
            if (grip.setPointerCapture) { try { grip.setPointerCapture(e.pointerId); } catch (err) { /* hors navigateur */ } }
            const move = (ev) => {
                const others = Array.from(toolList.querySelectorAll('.s-order-row')).filter((r) => r !== row);
                const next = others.find((r) => { const b = r.getBoundingClientRect(); return ev.clientY < b.top + b.height / 2; });
                if (next) { if (row.nextSibling !== next) toolList.insertBefore(row, next); }
                else if (toolList.lastElementChild !== row) toolList.append(row);
            };
            const end = () => {
                grip.removeEventListener('pointermove', move);
                grip.removeEventListener('pointerup', end);
                grip.removeEventListener('pointercancel', end);
                row.classList.remove('is-dragging');
                const after = Array.from(toolList.querySelectorAll('.s-order-row')).map((r) => r.getAttribute('data-tool'));
                if (after.join(',') !== before.join(',')) {
                    onOrder(after);
                    status.set('Ordre des outils enregistré', 'ok');
                }
            };
            grip.addEventListener('pointermove', move);
            grip.addEventListener('pointerup', end);
            grip.addEventListener('pointercancel', end);
        }

        // --- Raccourcis ----------------------------------------------------------------
        let keyQuery = '';
        const keySearch = ui.searchField({ placeholder: 'Chercher une action ou un outil', role: 'keys-search', onInput: (q) => { keyQuery = q; renderKeys(); } });
        const keyList = h('div', { class: 's-keys', 'data-role': 'shortcuts' });
        panes.keys.append(keySearch,
            h('div', { class: 's-hint', text: 'Clique la touche d\'une action, puis frappe le nouveau raccourci : une touche seule ou avec Ctrl, Alt, Maj (ex. Ctrl + Alt + 5). Retour arrière : aucun, Échap : annuler. Les raccourcis agissent quand le panneau a le focus.' }),
            keyList,
            h('div', { class: 's-settings-actions' }, ui.button({
                label: 'Rétablir les raccourcis par défaut', role: 'keys-reset',
                onClick: () => { keys.reset(); renderKeys(); onKeys(); renderTools(); status.set('Raccourcis par défaut rétablis', 'ok'); },
            })));

        function keyRow(action, b) {
            const btn = h('button', {
                class: 's-key-btn' + (b ? '' : ' is-empty'), type: 'button', 'data-action': action.id,
                title: 'Changer le raccourci de « ' + action.label + ' »', text: b ? b.label : '—',
            });
            btn.addEventListener('click', () => {
                const waiting = 'Appuie sur une touche…';
                btn.textContent = waiting;
                btn.classList.add('is-recording');
                keys.record(doc, (result) => {
                    if (result !== false) {
                        const freed = keys.setBinding(action.id, result);
                        if (freed.length) status.set('Raccourci repris à : ' + freed.join(', '), 'warn');
                        else status.set('« ' + action.label + ' » : ' + (result ? result.label : 'aucun raccourci'), 'ok');
                        onKeys();
                        renderTools();
                    }
                    renderKeys();
                }, (held) => { btn.textContent = held ? held + ' + …' : waiting; });
            });
            return h('div', { class: 's-key-row' }, h('span', { class: 's-key-label', text: action.label }), btn);
        }
        function renderKeys() {
            const map = keys.bindings();
            const all = keys.actions();
            const groups = [keys.HUB_GROUP].concat(tools().map((t) => t.name));
            for (const a of all) if (!groups.includes(a.group)) groups.push(a.group);
            const q = SIMING.fold(keyQuery.trim());
            const nodes = [];
            for (const g of groups) {
                const groupHit = q && SIMING.fold(g).includes(q);
                const acts = all.filter((a) => a.group === g && (!q || groupHit || SIMING.fold(a.label).includes(q)
                    || (map[a.id] && SIMING.fold(map[a.id].label).includes(q))));
                if (!acts.length) continue;
                nodes.push(h('div', { class: 's-keys-group' }, h('span', { class: 's-keys-group-name', text: g }), h('span', { class: 's-counter', text: String(acts.length) })));
                for (const a of acts) nodes.push(keyRow(a, map[a.id]));
            }
            if (!nodes.length) nodes.push(h('div', { class: 's-empty', text: 'Aucune action ne correspond' }));
            keyList.replaceChildren(...nodes);
        }

        // --- Général : lancement, à propos ----------------------------------------------
        const startSelect = ui.select({
            role: 'start-tool', label: 'Outil au lancement',
            onChange: (v) => { SIMING.settings.set('startTool', v); status.set('Au lancement : ' + startSelect.options[startSelect.selectedIndex].text, 'ok'); },
        });
        const about = h('dl', { class: 's-about', 'data-role': 'about' },
            h('dt', { text: 'SIMING' }), h('dd', { text: list.version }),
            list.tools.map((t) => [h('dt', { text: t.name }), h('dd', { text: t.version })]));
        panes.general.append(
            ui.sectionTitle('Outil au lancement'), startSelect,
            ui.sectionTitle('À propos'), about,
            h('div', { class: 's-hint', text: 'Mise à jour : relance l\'installeur SIMING, il propose la dernière version.' }));
        function renderStart() {
            const off = hidden();
            const current = SIMING.settings.get('startTool', 'last');
            const options = [{ value: 'last', label: 'Dernier outil utilisé' }]
                .concat(tools().filter((t) => !off.includes(t.id)).map((t) => ({ value: t.id, label: t.name })));
            startSelect.setOptions(options, options.some((o) => o.value === current) ? current : 'last');
        }

        const refresh = () => { renderTools(); renderKeys(); renderStart(); };
        refresh();
        selectTab(SIMING.settings.get('settingsTab', 'tools'));
        return { refresh, selectTab };
    }
})(window);
