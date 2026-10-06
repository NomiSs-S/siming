/*
 * SIMING : vue de l'outil Quick Tools (gestes rapides sur la sélection).
 * Toute la logique After Effects est côté hôte (host/tools/quicktools.jsx) : chaque
 * geste appelle l'API, qui renvoie un compte rendu et un statut. La sélection n'est
 * connue qu'au clic : les boutons portent le verbe seul, le statut donne la quantité.
 * Pas de bouton principal : le dernier geste est cerclé d'accent et Entrée le rejoue.
 * Chaque geste est aussi une action du registre de raccourcis (SIMING.keys) : par
 * défaut Entrée = rejouer, pavé numérique 1–9 = ancrage ; tout se règle dans Réglages.
 */
(function (global) {
    'use strict';

    const SIMING = global.SIMING;
    const ui = SIMING.ui;
    const h = ui.h;

    const HELP = [
        'Lissage de vitesse : sélectionne des keyframes, règle l\'influence de la ligne voulue, puis',
        '   clique son picto de keyframe (ou relâche le curseur) : Bézier, vitesse 0 et influence.',
        '   Entrée = le départ du mouvement (côté sortant de la keyframe), Sortie = son arrivée.',
        'Elastic : sélectionne des propriétés animées, puis « Appliquer Elastic » : l\'expression',
        '   et l\'effet « Elastic Controller » (Amplitude, Frequency, Decay) sont posés. La croix les retire.',
        'Ancrage : sélectionne des calques, clique une case (ou tape 1 à 9 au pavé numérique) :',
        '   l\'ancrage se place sur leur boîte, rien ne bouge à l\'écran ; les keyframes d\'ancrage',
        '   et de position existantes sont décalées, aucune n\'est créée.',
        'Aligner et répartir : sélectionne des calques, choisis Sélection ou Comp, clique une case.',
        '',
        'Le dernier geste est cerclé de bleu : Entrée le rejoue sur la nouvelle sélection.',
        'Chaque geste s\'annule d\'un seul Ctrl+Z. Curseurs : glisser (Maj = précision), molette,',
        'flèches, double-clic pour saisir, Alt + clic pour la valeur par défaut.',
        'Raccourcis clavier de chaque geste : Réglages du panneau SIMING.',
    ].join('\n');

    const EASE = [
        { key: 'easeIn',   mode: 'in',   label: 'Entrée',   title: 'Lisser l\'entrée (départ du mouvement) des keyframes sélectionnées' },
        { key: 'easeOut',  mode: 'out',  label: 'Sortie',   title: 'Lisser la sortie (arrivée du mouvement) des keyframes sélectionnées' },
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
    const ANCHOR_NAMES = { 7: 'haut gauche', 8: 'haut centre', 9: 'haut droite', 4: 'milieu gauche', 5: 'centre',
        6: 'milieu droite', 1: 'bas gauche', 2: 'bas centre', 3: 'bas droite' };
    const EASE_DEFAULT = 33;

    function mount(view, ctx) {
        let state = null;
        let busy = null;
        let last = null;   // { el, replay } : dernier geste, rejoué par Entrée
        const settings = ctx.settings;
        const keys = ctx.keys || SIMING.keys;
        const pref = (key, fallback) => {
            const v = parseFloat(settings.get('quicktools.' + key, fallback));
            return isNaN(v) ? fallback : v;
        };
        const labelRow = (label, hint) => h('div', { class: 's-label-row' }, ui.sectionTitle(label),
            hint ? h('span', { class: 's-label-hint', text: hint }) : null);

        // Raccourcis : actions du registre, disponibles quand la vue est visible (le hub garde
        // les vues cachées montées). Le groupe porte le nom de l'outil (Réglages les regroupe).
        const focusRoot = view.closest('.s-view') || view;
        const group = (ctx.meta && ctx.meta.name) || 'Quick Tools';
        const action = (id, label, run, defaultKey) => keys.register({
            id: 'quicktools.' + id, label, group, defaultKey: defaultKey || null, run, when: () => !focusRoot.hidden,
        });

        /** Lance un geste et s'en souvient : el est cerclé, replay le relance (Entrée). */
        function gesture(el, replay) {
            if (busy) return busy;
            if (last && last.el !== el) last.el.classList.remove('is-last');
            last = { el, replay };
            el.classList.add('is-last');
            return replay();
        }
        action('replay', 'Rejouer le dernier geste', () => { if (last && !busy) last.replay(); }, 'Enter');

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
            action('ease.' + d.mode, 'Lisser : ' + d.label.toLowerCase(), () => gesture(picto, apply));
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
        action('elastic', 'Appliquer Elastic', () => gesture(elastic, () => run('elastic', {})));
        action('elasticRemove', 'Retirer Elastic', () => gesture(remove, () => run('elasticRemove', {})));

        // --- Ancrage ------------------------------------------------------------------
        const p9 = ui.point9({ value: pref('anchorCell', 5), onPick: (n) => anchor(n) });
        function anchor(cell) {
            p9.set(cell);
            settings.set('quicktools.anchorCell', cell);
            return gesture(p9, () => run('anchor', { cell: p9.value }));
        }
        for (const n of [7, 8, 9, 4, 5, 6, 1, 2, 3]) action('anchor.' + n, 'Ancrage : ' + ANCHOR_NAMES[n], () => anchor(n), 'Numpad' + n);

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
            action(role, title, () => gesture(b, replay));
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
                .finally(() => { busy = null; setBusy(false); });
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
