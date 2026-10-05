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
