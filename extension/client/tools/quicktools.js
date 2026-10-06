/*
 * SIMING : vue de l'outil Quick Tools (gestes rapides sur la sélection).
 * Toute la logique After Effects est côté hôte (host/tools/quicktools.jsx) : chaque
 * geste appelle l'API, qui renvoie un compte rendu et un statut. La sélection n'est
 * connue qu'au clic : les boutons portent le verbe seul, le statut donne la quantité.
 * Pas de bouton principal : le dernier geste est cerclé d'accent et Entrée le rejoue.
 */
(function (global) {
    'use strict';

    const SIMING = global.SIMING;
    const ui = SIMING.ui;
    const h = ui.h;

    const HELP = [
        'Lissage de vitesse : sélectionne des keyframes, règle l\'influence de la ligne voulue, puis',
        '   clique son picto de keyframe (ou relâche le curseur) : Bézier, vitesse 0 et influence sur ce côté.',
        'Elastic : sélectionne des propriétés animées, puis « Appliquer Elastic » : l\'expression',
        '   et l\'effet « Elastic Controller » (Amplitude, Frequency, Decay) sont posés. La croix les retire.',
        'Ancrage : sélectionne des calques, clique une case (ou tape 1 à 9 au pavé numérique) :',
        '   l\'ancrage se place sur leur boîte, la position est compensée (rien ne bouge à l\'écran).',
        'Aligner et répartir : sélectionne des calques, choisis Sélection ou Comp, clique une case.',
        '',
        'Le dernier geste est cerclé de bleu : Entrée le rejoue sur la nouvelle sélection.',
        'Chaque geste s\'annule d\'un seul Ctrl+Z. Curseurs : glisser (Maj = précision), molette,',
        'flèches, double-clic pour saisir, Alt + clic pour la valeur par défaut.',
    ].join('\n');

    const EASE = [
        { key: 'easeIn',   mode: 'in',   label: 'Entrée',   title: 'Lisser l\'entrée des keyframes sélectionnées' },
        { key: 'easeOut',  mode: 'out',  label: 'Sortie',   title: 'Lisser la sortie des keyframes sélectionnées' },
        { key: 'easeBoth', mode: 'both', label: 'Les deux', title: 'Lisser l\'entrée et la sortie des keyframes sélectionnées' },
    ];
    const EDGES = [
        { edge: 'left',    icon: 'alignLeft',    align: 'Aligner à gauche',  dist: 'Répartir les bords gauches',      distIcon: 'distLeft' },
        { edge: 'centerX', icon: 'alignCenterX', align: 'Centrer horizontalement', dist: 'Répartir les centres horizontaux', distIcon: 'distCenterX' },
        { edge: 'right',   icon: 'alignRight',   align: 'Aligner à droite',  dist: 'Répartir les bords droits',       distIcon: 'distRight' },
        { edge: 'top',     icon: 'alignTop',     align: 'Aligner en haut',   dist: 'Répartir les bords hauts',        distIcon: 'distTop' },
        { edge: 'centerY', icon: 'alignCenterY', align: 'Centrer verticalement', dist: 'Répartir les centres verticaux', distIcon: 'distCenterY' },
        { edge: 'bottom',  icon: 'alignBottom',  align: 'Aligner en bas',    dist: 'Répartir les bords bas',          distIcon: 'distBottom' },
    ];
    const NUMPAD = { Numpad1: 1, Numpad2: 2, Numpad3: 3, Numpad4: 4, Numpad5: 5, Numpad6: 6, Numpad7: 7, Numpad8: 8, Numpad9: 9 };
    const EASE_DEFAULT = 33;

    function mount(view, ctx) {
        let state = null;
        let busy = null;
        let last = null;   // { el, replay } : dernier geste, rejoué par Entrée
        const settings = ctx.settings;
        const pref = (key, fallback) => {
            const v = parseFloat(settings.get('quicktools.' + key, fallback));
            return isNaN(v) ? fallback : v;
        };
        const labelRow = (label, hint) => h('div', { class: 's-label-row' }, ui.sectionTitle(label),
            hint ? h('span', { class: 's-label-hint', text: hint }) : null);

        /** Lance un geste et s'en souvient : el est cerclé, replay le relance (Entrée). */
        function gesture(el, replay) {
            if (busy) return busy;
            if (last && last.el !== el) last.el.classList.remove('is-last');
            last = { el, replay };
            el.classList.add('is-last');
            return replay();
        }

        // --- Lissage de vitesse -----------------------------------------------------
        const easeRows = EASE.map((d) => {
            let picto = null;
            const apply = () => run('ease', { mode: d.mode, influence: bar.value });
            const bar = ui.valueBar({
                label: d.label, min: 1, max: 100, unit: ' %', value: pref(d.key, EASE_DEFAULT), defaultValue: EASE_DEFAULT,
                role: 'ease-' + d.mode,
                onChange: (v) => { settings.set('quicktools.' + d.key, v); gesture(picto, apply); },
            });
            picto = h('button', {
                class: 's-icon-btn', type: 'button', 'data-role': 'ease-apply-' + d.mode, title: d.title, 'aria-label': d.title,
                onclick: () => gesture(picto, apply),
            }, ui.easeKey(d.mode, 16));
            return h('div', { class: 's-ease-row' }, picto, bar);
        });

        // --- Elastic ------------------------------------------------------------------
        const elastic = h('button', {
            class: 's-btn', type: 'button', 'data-role': 'elastic',
            title: 'Poser l\'expression Elastic et son contrôleur sur les propriétés animées sélectionnées',
            onclick: () => gesture(elastic, () => run('elastic', {})),
        }, ui.icon('ressort', 18), h('span', { text: 'Appliquer Elastic' }));
        const remove = h('button', {
            class: 's-btn s-btn-square', type: 'button', 'data-role': 'elastic-remove',
            title: 'Retirer l\'expression Elastic des propriétés sélectionnées', 'aria-label': 'Retirer Elastic',
            onclick: () => gesture(remove, () => run('elasticRemove', {})),
        }, ui.icon('fermer', 16));

        // --- Ancrage ------------------------------------------------------------------
        const p9 = ui.point9({ value: pref('anchorCell', 5), onPick: (n) => anchor(n) });
        function anchor(cell) {
            p9.set(cell);
            settings.set('quicktools.anchorCell', cell);
            return gesture(p9, () => run('anchor', { cell: p9.value }));
        }

        // --- Aligner et répartir --------------------------------------------------------
        const seg = ui.segmented({
            role: 'align-to', labels: ['Sélection', 'Comp'],
            onChange: (i) => settings.set('quicktools.alignTo', i === 1 ? 'comp' : 'selection'),
        });
        seg.select(settings.get('quicktools.alignTo', 'selection') === 'comp' ? 1 : 0);
        seg.querySelectorAll('.s-seg-btn')[1].title = 'Aligner sur la composition';
        const relative = () => (seg.selected === 1 ? 'comp' : 'selection');
        const toolButton = (role, title, icon, replay) => {
            const b = h('button', {
                class: 's-tool', type: 'button', 'data-role': role, title, 'aria-label': title,
                onclick: () => gesture(b, replay),
            }, ui.icon(icon, 16));
            return b;
        };
        // L'alignement lit Sélection / Comp au moment du geste (et de chaque rejeu).
        const alignGrid = h('div', { class: 's-tool-grid', 'data-role': 'align-row' }, EDGES.map((d) =>
            toolButton('align-' + d.edge, d.align, d.icon, () => run('align', { edge: d.edge, relative: relative() }))));
        const distGrid = h('div', { class: 's-tool-grid is-6', 'data-role': 'dist-row' }, EDGES.map((d) =>
            toolButton('dist-' + d.edge, d.dist, d.distIcon, () => run('distribute', { edge: d.edge }))));

        view.append(
            h('div', { class: 's-stack', 'data-role': 'ease' }, labelRow('Lissage de vitesse', 'clic ou relâcher = appliquer'), easeRows),
            h('div', { class: 's-stack' }, labelRow('Elastic'),
                h('div', { class: 's-gesture-row', 'data-role': 'elastic-row' }, elastic, remove)),
            h('div', { class: 's-place-row' },
                h('div', { class: 's-place-col' }, labelRow('Ancrage', 'pavé 1–9'), p9),
                h('div', { class: 's-place-col is-wide' }, labelRow('Aligner'), seg, alignGrid)),
            h('div', { class: 's-stack' }, labelRow('Répartir', '3 calques ou plus'), distGrid));

        // --- Clavier --------------------------------------------------------------------
        // Entrée = rejouer le dernier geste quand la vue a le focus ; pavé numérique = ancrage
        // quand la vue est visible (le hub garde les vues cachées montées).
        const focusRoot = view.closest('.s-view') || view;
        const doc = focusRoot.ownerDocument;
        const inField = (e) => { const tag = e.target && e.target.tagName; return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'; };
        focusRoot.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' || e.defaultPrevented || inField(e)) return;
            if (e.target && e.target.tagName === 'BUTTON') return;
            if (doc.querySelector('[data-role=dialog]')) return;
            if (last && !busy) { e.preventDefault(); last.replay(); }
        });
        doc.addEventListener('keydown', (e) => {
            const cell = NUMPAD[e.code];
            if (!cell || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || inField(e)) return;
            if (focusRoot.hidden || doc.querySelector('[data-role=dialog]')) return;
            e.preventDefault();
            anchor(cell);
        });

        function restoreFocus() {
            const a = doc.activeElement;
            if (!a || a === doc.body || (a.tagName === 'BUTTON' && a.disabled)) focusRoot.focus();
        }

        // --- Appels à l'hôte -------------------------------------------------------------
        function setBusy(on) {
            view.classList.toggle('is-busy', on);
            view.querySelectorAll('button').forEach((b) => { b.disabled = on; });
        }

        function run(fn, args) {
            if (busy) return busy;
            setBusy(true);
            busy = ctx.bridge.call('quicktools', fn, args || {})
                .then(render)
                .catch((e) => { ctx.status.set(e.message, 'error'); })
                .finally(() => { busy = null; setBusy(false); restoreFocus(); });
            return busy;
        }

        function render(s) {
            state = s;
            ctx.status.set(s.status.text, s.status.level);
            const skipped = s.report && s.report.skipped;
            if (skipped && skipped.length) {
                ui.dialog({
                    title: 'Éléments ignorés',
                    message: SIMING.plural(skipped.length, 'élément n\'a pas été traité :', 'éléments n\'ont pas été traités :'),
                    items: skipped,
                });
            }
            return s;
        }

        const ready = run('init', {});
        return {
            ready,
            idle: () => busy || Promise.resolve(state),
            getState: () => state,
        };
    }

    SIMING.registerTool('quicktools', { help: HELP, mount });
})(window);
