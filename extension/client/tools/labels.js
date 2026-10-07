/*
 * SIMING : vue de l'outil Libellés (étiquettes de couleur d'après la nature et le nom des calques).
 * Rien n'est automatique : la carte analyse la sélection ou la composition (hôte :
 * host/tools/labels.jsx), le récapitulatif groupe les calques par règle et se corrige à
 * la main, le bouton principal pose les étiquettes. Les règles se règlent dans l'onglet
 * Règles et se gardent dans les réglages du panneau (siming.labels.rules).
 */
(function (global) {
    'use strict';

    const SIMING = global.SIMING;
    const ui = SIMING.ui;
    const h = ui.h;
    const KEEP = -1;

    const HELP = {
        intro: 'Une couleur d\'étiquette par nature de calque : proposée, corrigée si besoin, posée en un clic.',
        groups: [
            { title: 'En trois gestes', items: [
                { step: 1, name: 'Analyser', text: 'Sélection ou Composition, puis clic sur la carte.' },
                { step: 2, name: 'Corriger', text: 'Appuie sur une ligne, glisse sur une couleur, relâche. La pastille d\'un groupe change sa règle.' },
                { step: 3, name: 'Appliquer', text: 'Le bouton bleu pose les étiquettes ; un seul Ctrl+Z annule tout.', keys: [{ k: ['Entrée'], t: 'appliquer' }] },
            ] },
            { title: 'Plusieurs calques à la fois', items: [
                { icon: 'plus', name: 'Sélectionner', text: 'Une ligne sélectionnée colore toute la sélection ; le nom d\'un groupe le sélectionne en entier.',
                    keys: [{ k: ['Ctrl', 'clic'], t: 'ajouter' }, { k: ['Maj', 'clic'], t: 'plage' }, { k: ['Échap'], t: 'tout désélectionner' }] },
            ] },
            { title: 'Règles', items: [
                { icon: 'chercher', name: 'Mots-clés', text: 'Avant la nature ; le premier de la liste gagne. Mot entier dans le nom du calque, de sa source ou de ses dossiers ; « .ai » vise l\'extension.' },
                { icon: 'etiquette', name: 'Par nature', text: 'Texte, forme, vidéo, image, son… : une couleur, ou « Ne pas changer ».' },
            ] },
        ],
        footer: 'Couleurs et noms : Préférences › Étiquettes d\'After Effects.',
    };

    const clone = (o) => JSON.parse(JSON.stringify(o));
    const isLabel = (v) => Number.isInteger(v) && v >= KEEP && v <= 16;

    function mount(view, ctx) {
        const settings = ctx.settings;
        const keys = ctx.keys || SIMING.keys;
        let state = null;          // dernier état renvoyé par l'hôte
        let defaults = null;       // règles par défaut (hôte)
        let types = [];            // natures [{ id, name }]
        let palette = [];
        let rules = null;          // règles courantes (réglages du panneau)
        let overrides = {};        // id du calque -> étiquette choisie à la main (analyse courante)
        let selected = new Set();  // ids des lignes sélectionnées (Ctrl / Maj + clic, nom de groupe)
        let anchorId = null;       // départ d'une plage Maj + clic
        let shownIds = [];         // ids des lignes affichées, dans l'ordre
        let picker = null;         // { id, close } : sélecteur ouvert depuis une ligne
        let filter = 'changes';
        let tab = settings.get('labels.tab', 'layers') === 'rules' ? 'rules' : 'layers';
        let scope = settings.get('labels.scope', 'selection') === 'comp' ? 'comp' : 'selection';
        let rulesDirty = false;    // règles changées depuis la dernière analyse
        let busy = null;

        // --- Règles : lecture, complément, mémoire ---------------------------------------
        /** Règles complètes : mots-clés valides, une étiquette par nature (défaut si absente). */
        function normalize(r) {
            const out = { words: [], types: {} };
            const words = r && Array.isArray(r.words) ? r.words : [];
            for (const w of words) {
                if (w && typeof w === 'object') out.words.push({ words: String(w.words || ''), label: isLabel(w.label) ? w.label : KEEP });
            }
            const t = (r && r.types) || {};
            for (const ty of types) {
                out.types[ty.id] = isLabel(t[ty.id]) ? t[ty.id] : (defaults ? defaults.types[ty.id] : KEEP);
            }
            return out;
        }
        function loadRules() {
            try {
                const raw = settings.get('labels.rules', '');
                if (raw) return normalize(JSON.parse(raw));
            } catch (e) { /* réglage illisible : règles par défaut */ }
            return normalize(clone(defaults || { words: [], types: {} }));
        }
        function saveRules() {
            settings.set('labels.rules', JSON.stringify(rules));
            rulesDirty = true;
        }
        const typeName = (id) => (types.find((t) => t.id === id) || { name: id }).name;
        function ruleOf(key) {
            const [kind, id] = String(key).split(':');
            if (kind === 'word') {
                const w = rules.words[Number(id)];
                return { label: w ? w.label : KEEP, name: 'Mot-clé « ' + (w ? w.words : '?') + ' »', short: w ? w.words : '?' };
            }
            return { label: rules.types[id], name: typeName(id), short: typeName(id) };
        }
        function setRule(key, v) {
            const [kind, id] = String(key).split(':');
            if (kind === 'word' && rules.words[Number(id)]) rules.words[Number(id)].label = v;
            else if (kind === 'type') rules.types[id] = v;
            saveRules();
            renderRules();
            ctx.status.set('Règle « ' + ruleOf(key).short + ' » : ' + ui.labelName(palette, v), 'ok');
            return reanalyze();
        }

        // --- Construction ---------------------------------------------------------------
        const tabs = ui.segmented({ role: 'labels-tabs', labels: ['Calques', 'Règles'], onChange: (i) => selectTab(i === 1 ? 'rules' : 'layers') });
        const scopeSeg = ui.segmented({
            role: 'scope', labels: ['Sélection', 'Composition'],
            onChange: (i) => { scope = i === 1 ? 'comp' : 'selection'; settings.set('labels.scope', scope); renderCard(); },
        });
        scopeSeg.select(scope === 'comp' ? 1 : 0);
        const card = ui.card({ role: 'analyze', onClick: () => analyze() });
        const primary = ui.primaryButton({ label: 'Appliquer', onClick: () => apply() });
        const recapTitle = ui.sectionTitle('Récapitulatif', { counter: true });
        const filterSeg = ui.segmented({
            role: 'filter', labels: ['À changer', 'Tous'],
            onChange: (i) => { filter = i === 1 ? 'all' : 'changes'; renderList(); },
        });
        const list = h('div', { class: 's-rows', 'data-role': 'recap' });
        const recap = h('div', { class: 's-pane', 'data-role': 'recap-section', hidden: true }, recapTitle, filterSeg, list);
        const layersPane = h('div', { class: 's-pane', 'data-pane': 'layers' }, scopeSeg, card, primary, recap);

        const labelRow = (label, hint) => h('div', { class: 's-label-row' }, ui.sectionTitle(label),
            hint ? h('span', { class: 's-label-hint', text: hint }) : null);
        const wordList = h('div', { class: 's-stack', 'data-role': 'word-rules' });
        const addWord = h('button', {
            class: 's-btn', type: 'button', 'data-role': 'add-word', onclick: () => {
                rules.words.push({ words: '', label: freeLabel() });
                saveRules();
                renderRules();
                const inputs = wordList.querySelectorAll('[data-role=word-input]');
                if (inputs.length) inputs[inputs.length - 1].focus();
            },
        }, ui.icon('ajouter', 14), h('span', { text: 'Ajouter un mot-clé' }));
        const typeList = h('div', { class: 's-type-list', 'data-role': 'type-rules' });
        const reset = ui.button({
            label: 'Rétablir les règles par défaut', role: 'rules-reset',
            onClick: () => {
                rules = normalize(clone(defaults));
                saveRules();
                renderRules();
                ctx.status.set('Règles par défaut rétablies', 'ok');
            },
        });
        const rulesPane = h('div', { class: 's-stack', 'data-pane': 'rules', hidden: true },
            labelRow('Mots-clés', 'avant la nature, le premier gagne'), wordList, addWord,
            h('div', { class: 's-hint', text: 'Mots entiers séparés par des virgules, cherchés dans le nom du calque, de sa source, de son fichier et de ses dossiers du projet (majuscules, accents et pluriel ignorés). « .ai » vise une extension.' }),
            labelRow('Par nature'), typeList,
            h('div', { class: 's-settings-actions' }, reset));

        view.append(tabs, layersPane, rulesPane);

        /** Première étiquette qu'aucune règle n'utilise (sinon Cyan). */
        function freeLabel() {
            const used = new Set(rules.words.map((w) => w.label).concat(Object.values(rules.types)));
            for (let v = 1; v <= 16; v++) if (!used.has(v)) return v;
            return 14;
        }

        function selectTab(id) {
            tab = id === 'rules' ? 'rules' : 'layers';
            tabs.select(tab === 'rules' ? 1 : 0);
            layersPane.hidden = tab !== 'layers';
            rulesPane.hidden = tab !== 'rules';
            settings.set('labels.tab', tab);
            if (tab === 'layers' && rulesDirty) return reanalyze();
            return null;
        }

        // --- Raccourcis (Réglages › Raccourcis) ------------------------------------------
        const focusRoot = view.closest('.s-view') || view;
        const group = (ctx.meta && ctx.meta.name) || 'Libellés';
        const visible = () => !focusRoot.hidden;
        keys.register({ id: 'labels.apply', label: 'Appliquer les libellés', group, defaultKey: 'Enter',
            when: () => visible() && tab === 'layers', run: () => { if (!busy && changes().length) apply(); } });
        keys.register({ id: 'labels.analyze', label: 'Analyser', group, when: visible, run: () => analyze() });
        keys.register({ id: 'labels.quick', label: 'Analyser et appliquer', group, when: visible, run: () => quick() });

        // --- Appels à l'hôte -------------------------------------------------------------
        function setBusy(on) {
            view.classList.toggle('is-busy', on);
            layersPane.querySelectorAll('button').forEach((b) => { b.disabled = on; });
            if (!on) renderPrimary();
        }

        /** Appelle l'hôte ; before() s'exécute juste avant le rendu de la réponse. */
        function run(fn, args, before) {
            if (busy) return busy;
            setBusy(true);
            busy = ctx.bridge.call('labels', fn, args || {})
                .then((s) => { if (before) before(); return render(s); })
                .catch((e) => { ctx.status.set(e.message, 'error'); })
                .finally(() => { busy = null; setBusy(false); });
            return busy;
        }

        /** Nouvelle analyse de la sélection ou de la composition active. */
        function analyze() {
            rulesDirty = false;
            return run('analyze', { scope, rules }, forget);
        }

        /** Mêmes calques, règles à jour ; les choix faits à la main sont gardés. */
        function reanalyze() {
            rulesDirty = false;
            if (!state || !state.comp || !state.ids.length) return Promise.resolve(state);
            return run('analyze', { compId: state.comp.id, ids: state.ids, scope: state.scope, rules });
        }

        function apply() {
            const ch = changes();
            if (!state || !state.comp || !ch.length) return Promise.resolve(state);
            return run('apply', { compId: state.comp.id, ids: state.ids, scope: state.scope, changes: ch, rules }, forget);
        }

        /** Nouvelle analyse ou étiquettes posées : choix à la main et sélection oubliés. */
        function forget() {
            overrides = {};
            selected = new Set();
            anchorId = null;
        }

        async function quick() {
            await analyze();
            if (changes().length) await apply();
        }

        // --- Calcul ----------------------------------------------------------------------
        const has = (e) => Object.prototype.hasOwnProperty.call(overrides, e.id);
        const finalOf = (e) => (has(e) ? overrides[e.id] : e.proposed);
        const toChange = (e) => { const f = finalOf(e); return f !== KEEP && f !== e.current; };
        /** Lignes de « À changer » : proposées différentes de l'actuelle, ou choisies à la main. */
        const listed = (e) => has(e) || (e.proposed !== KEEP && e.proposed !== e.current);
        function changes() {
            return state ? state.entries.filter(toChange).map((e) => ({ id: e.id, label: finalOf(e) })) : [];
        }

        // --- Rendu -----------------------------------------------------------------------
        function render(s) {
            state = s;
            if (s.palette) palette = s.palette;
            if (s.types) types = s.types;
            if (s.defaults) defaults = s.defaults;
            if (!rules) rules = loadRules();
            renderCard();
            renderList();
            renderPrimary();
            renderRules();
            ctx.status.set(s.status.text, s.status.level);
            const skipped = s.report && s.report.skipped;
            if (skipped && skipped.length) {
                ui.dialog({
                    title: 'Calques ignorés',
                    message: SIMING.plural(skipped.length, 'calque n\'a pas été traité :', 'calques n\'ont pas été traités :'),
                    items: skipped,
                });
            }
            return s;
        }

        function renderCard() {
            const n = state && state.comp ? state.entries.length : 0;
            if (n) {
                card.set({ title: state.comp.name, subtitle: SIMING.plural(n, 'calque analysé', 'calques analysés') + ' · clic = relancer', empty: false });
            } else {
                card.set(scope === 'comp'
                    ? { title: 'Analyser la composition', subtitle: 'Tous les calques de la composition active', empty: true }
                    : { title: 'Analyser la sélection', subtitle: 'Sélectionne des calques dans la timeline, puis clique ici', empty: true });
            }
            card.title = scope === 'comp' ? 'Analyser tous les calques de la composition active' : 'Analyser les calques sélectionnés';
        }

        function renderPrimary() {
            const n = changes().length;
            primary.set(n ? { label: 'Appliquer ' + SIMING.plural(n, 'libellé', 'libellés'), enabled: !busy } : { label: 'Appliquer', enabled: false });
        }

        /** Groupes [clé de règle, calques] : mots-clés dans l'ordre, puis natures. */
        function groups(entries) {
            const map = new Map();
            rules.words.forEach((w, i) => map.set('word:' + i, []));
            types.forEach((t) => map.set('type:' + t.id, []));
            for (const e of entries) {
                if (!map.has(e.rule)) map.set(e.rule, []);
                map.get(e.rule).push(e);
            }
            return Array.from(map).filter(([, items]) => items.length);
        }

        function renderList() {
            const entries = state ? state.entries : [];
            recap.hidden = entries.length === 0;
            if (!entries.length) { list.replaceChildren(); return; }
            const shown = entries.filter((e) => filter === 'all' || listed(e));
            const nListed = entries.filter(listed).length;
            recapTitle.counter.textContent = SIMING.plural(entries.length, 'calque', 'calques');
            filterSeg.setLabels([{ label: 'À changer', count: nListed }, { label: 'Tous', count: entries.length }]);
            filterSeg.select(filter === 'all' ? 1 : 0);
            const nodes = [];
            shownIds = [];
            const shownSet = new Set(shown.map((e) => e.id));
            for (const id of Array.from(selected)) if (!shownSet.has(id)) selected.delete(id);   // filtre : on ne garde que le visible
            for (const [key, items] of groups(shown)) {
                const rule = ruleOf(key);
                const ids = items.map((e) => e.id);
                nodes.push(h('div', { class: 's-lgroup', 'data-rule': key },
                    ui.labelSwatch({ palette, value: rule.label, allowKeep: true, role: 'rule-swatch', title: 'Couleur de la règle « ' + rule.short + ' »', onChange: (v) => setRule(key, v) }),
                    h('button', {
                        class: 's-lgroup-name', type: 'button', 'data-role': 'group-select', text: rule.name,
                        title: rule.name + ' · clic = sélectionner ses ' + SIMING.plural(ids.length, 'calque', 'calques') + ' (Ctrl : ajouter)',
                        onclick: (ev) => select((ev.ctrlKey || ev.metaKey) ? Array.from(selected).concat(ids) : ids),
                    }),
                    h('span', { class: 's-counter', text: String(items.length) })));
                for (const e of items) { shownIds.push(e.id); nodes.push(row(e)); }
            }
            if (!nodes.length) nodes.push(h('div', { class: 's-empty', text: 'Tout a déjà la bonne couleur' }));
            list.replaceChildren(...nodes);
        }

        // --- Sélection de plusieurs lignes ----------------------------------------------
        function select(ids, anchor) {
            selected = new Set(ids);
            if (anchor !== undefined) anchorId = anchor;
            renderList();
            if (selected.size > 1) {
                ctx.status.set(SIMING.plural(selected.size, 'calque sélectionné', 'calques sélectionnés') +
                    ' · appuie sur l\'un d\'eux pour choisir leur couleur', 'info');
            }
        }
        function toggle(id) {
            const next = new Set(selected);
            if (next.has(id)) next.delete(id); else next.add(id);
            select(Array.from(next), id);
        }
        function range(id) {
            const a = shownIds.indexOf(anchorId === null ? id : anchorId);
            const b = shownIds.indexOf(id);
            if (a < 0 || b < 0) { select([id], id); return; }
            select(shownIds.slice(Math.min(a, b), Math.max(a, b) + 1));
        }
        view.ownerDocument.addEventListener('keydown', (ev) => {
            if (ev.key !== 'Escape' || ev.defaultPrevented || !visible() || !selected.size) return;
            select([], null);
        });

        /** Sélecteur de couleur pour la ligne e : toute la sélection si e en fait partie,
         *  sinon e seule (la sélection est alors oubliée). press : bouton enfoncé (un geste). */
        function openFor(e, el, press) {
            if (picker && picker.id === e.id && picker.close.isOpen()) { picker.close(); picker = null; return; }
            if (!selected.has(e.id)) { selected = new Set(); anchorId = e.id; renderSelection(); }
            const targets = selected.size ? state.entries.filter((x) => selected.has(x.id)) : [e];
            const finals = new Set(targets.map(finalOf));
            const close = ui.labelPicker({
                palette, allowKeep: true, anchor: el, press,
                value: finals.size === 1 ? finals.values().next().value : null,
                onPick: (v) => {
                    for (const t of targets) {
                        if (v === t.proposed) delete overrides[t.id];
                        else overrides[t.id] = v;
                    }
                    renderList();
                    renderPrimary();
                    if (targets.length > 1) {
                        ctx.status.set(SIMING.plural(targets.length, 'calque', 'calques') + ' → ' + ui.labelName(palette, v) +
                            ' · à poser avec le bouton bleu', 'info');
                    }
                },
            });
            picker = { id: e.id, close };
        }

        function renderSelection() {
            list.querySelectorAll('.s-lrow').forEach((r) => r.classList.toggle('is-selected', selected.has(r.lrowId)));
        }

        function row(e) {
            const f = finalOf(e);
            const manual = has(e);
            const same = f === e.current;
            const kept = f === KEEP;
            const tag = kept ? h('span', { class: 's-tag', text: 'inchangé' })
                : manual ? h('span', { class: 's-tag is-manual', text: 'à la main' })
                : same ? h('span', { class: 's-tag', text: 'déjà bon' }) : null;
            const el = h('button', {
                class: 's-row s-lrow' + (same || kept ? ' is-quiet' : '') + (selected.has(e.id) ? ' is-selected' : ''),
                type: 'button', 'data-key': String(e.id),
                title: e.name + ' · ' + e.reason + ' : ' + ui.labelName(palette, e.current) + ' → ' + ui.labelName(palette, f) +
                    ' (appuyer = choisir une couleur ; Ctrl, Maj = sélectionner plusieurs calques)',
            },
            ui.swatch(palette, e.current), h('span', { class: 's-larrow', text: '→' }), ui.swatch(palette, f),
            h('span', { class: 's-row-name', text: e.name }), tag);
            el.lrowId = e.id;
            const modified = (ev) => ev.ctrlKey || ev.metaKey || ev.shiftKey;
            ui.pressToOpen(el, (press) => openFor(e, el, press), modified);
            el.addEventListener('click', (ev) => {
                if (ev.ctrlKey || ev.metaKey) toggle(e.id);
                else if (ev.shiftKey) range(e.id);
            });
            return el;
        }

        function renderRules() {
            if (!rules) return;
            wordList.replaceChildren(...rules.words.map((w, i) => {
                const input = h('input', {
                    class: 's-input', type: 'text', value: w.words, placeholder: 'logo, bg, .ai', spellcheck: 'false',
                    'aria-label': 'Mots-clés de la règle ' + (i + 1), 'data-role': 'word-input',
                });
                input.addEventListener('input', () => { w.words = input.value; saveRules(); });
                return h('div', { class: 's-rule-row', 'data-word': String(i) },
                    ui.labelSwatch({ palette, value: w.label, allowKeep: true, role: 'word-swatch', title: 'Couleur', onChange: (v) => { w.label = v; saveRules(); } }),
                    input,
                    h('button', {
                        class: 's-icon-btn', type: 'button', 'data-role': 'word-remove', title: 'Retirer ce mot-clé', 'aria-label': 'Retirer ce mot-clé',
                        onclick: () => { rules.words.splice(i, 1); saveRules(); renderRules(); },
                    }, ui.icon('fermer', 14)));
            }));
            if (!rules.words.length) wordList.append(h('div', { class: 's-hint', text: 'Aucun mot-clé : seule la nature du calque compte.' }));
            typeList.replaceChildren(...types.map((t) => h('div', { class: 's-type-row', 'data-type': t.id },
                h('span', { class: 's-type-name', text: t.name }),
                ui.labelSwatch({
                    palette, value: rules.types[t.id], allowKeep: true, withName: true, role: 'type-swatch', title: t.name,
                    onChange: (v) => { rules.types[t.id] = v; saveRules(); },
                }))));
        }

        selectTab(tab);
        const ready = run('init', { scope });
        return {
            ready,
            idle: () => busy || Promise.resolve(state),
            getState: () => state,
            getRules: () => rules,
        };
    }

    SIMING.registerTool('labels', { help: HELP, mount });
})(window);
