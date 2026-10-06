/*
 * SIMING : vue de l'outil Quick Tools (quatre gestes rapides sur la sélection).
 * Toute la logique After Effects est côté hôte (host/tools/quicktools.jsx) : chaque
 * geste appelle l'API, qui renvoie un compte rendu et un statut. La sélection n'est
 * connue qu'au clic : les boutons portent le verbe seul, le statut donne la quantité.
 */
(function (global) {
    'use strict';

    const SIMING = global.SIMING;
    const ui = SIMING.ui;
    const h = ui.h;

    const HELP = [
        'Lissage de vitesse : sélectionne des keyframes, règle l\'influence, puis clique le picto',
        '   de keyframe (ou relâche la barre) : Bézier, vitesse 0 et influence voulue sur ce côté.',
        'Elastic : sélectionne des propriétés animées, puis « Appliquer Elastic » : l\'expression',
        '   et l\'effet « Elastic Controller » (Amplitude, Frequency, Decay) sont posés. « Retirer » les enlève.',
        'Point d\'ancrage : sélectionne des calques, clique une case (ou tape 1 à 9 au pavé',
        '   numérique) : l\'ancrage se place sur leur boîte, la position est compensée.',
        'Aligner et répartir : sélectionne des calques, choisis Sélection ou Composition, clique un bouton.',
        '',
        'Chaque geste s\'annule d\'un seul Ctrl+Z. Les valeurs des barres : glisser (Maj = précision),',
        'molette, flèches, double-clic pour saisir, Alt + clic pour la valeur par défaut.',
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
        const settings = ctx.settings;
        const pref = (key, fallback) => {
            const v = parseFloat(settings.get('quicktools.' + key, fallback));
            return isNaN(v) ? fallback : v;
        };

        // --- Lissage de vitesse -----------------------------------------------------
        const easeRows = EASE.map((d) => {
            const bar = ui.valueBar({
                label: d.label, min: 1, max: 100, unit: ' %', value: pref(d.key, EASE_DEFAULT), defaultValue: EASE_DEFAULT,
                role: 'ease-' + d.mode,
                onChange: (v) => { settings.set('quicktools.' + d.key, v); run('ease', { mode: d.mode, influence: v }); },
            });
            const picto = h('button', {
                class: 's-icon-btn', type: 'button', 'data-role': 'ease-apply-' + d.mode, title: d.title, 'aria-label': d.title,
                onclick: () => run('ease', { mode: d.mode, influence: bar.value }),
            }, ui.icon('keyframe', 16));
            return h('div', { class: 's-bar-row' }, picto, bar);
        });

        // --- Elastic ------------------------------------------------------------------
        const primary = ui.primaryButton({ label: 'Appliquer Elastic', onClick: () => run('elastic', {}) });
        primary.title = 'Poser l\'expression Elastic et son contrôleur sur les propriétés animées sélectionnées';
        const remove = h('button', {
            class: 's-btn s-btn-ghost', type: 'button', 'data-role': 'elastic-remove', text: 'Retirer',
            title: 'Retirer l\'expression Elastic des propriétés sélectionnées', onclick: () => run('elasticRemove', {}),
        });

        // --- Point d'ancrage ----------------------------------------------------------
        const p9 = ui.point9({ value: pref('anchorCell', 5), onPick: (n) => anchor(n) });
        function anchor(cell) {
            p9.set(cell);
            settings.set('quicktools.anchorCell', cell);
            return run('anchor', { cell });
        }

        // --- Aligner et répartir --------------------------------------------------------
        const seg = ui.segmented({
            role: 'align-to', labels: ['Sélection', 'Composition'],
            onChange: (i) => settings.set('quicktools.alignTo', i === 1 ? 'comp' : 'selection'),
        });
        seg.select(settings.get('quicktools.alignTo', 'selection') === 'comp' ? 1 : 0);
        const relative = () => (seg.selected === 1 ? 'comp' : 'selection');
        const iconRow = (role, items) => h('div', { class: 's-icon-row', 'data-role': role }, items);
        const alignRow = iconRow('align-row', EDGES.map((d) => h('button', {
            class: 's-icon-btn', type: 'button', 'data-role': 'align-' + d.edge, title: d.align, 'aria-label': d.align,
            onclick: () => run('align', { edge: d.edge, relative: relative() }),
        }, ui.icon(d.icon, 16))));
        const distRow = iconRow('dist-row', EDGES.map((d) => h('button', {
            class: 's-icon-btn', type: 'button', 'data-role': 'dist-' + d.edge, title: d.dist, 'aria-label': d.dist,
            onclick: () => run('distribute', { edge: d.edge }),
        }, ui.icon(d.distIcon, 16))));

        view.append(
            ui.sectionTitle('Lissage de vitesse'),
            h('div', { class: 's-stack', 'data-role': 'ease' }, easeRows),
            ui.sectionTitle('Elastic'),
            h('div', { class: 's-row-inline', 'data-role': 'elastic' }, primary, remove),
            ui.sectionTitle('Point d\'ancrage'),
            h('div', { class: 's-point9-row' }, p9,
                h('div', { class: 's-point9-hint', text: 'Clique une case, ou tape 1 à 9 au pavé numérique. La position est compensée : rien ne bouge à l\'écran.' })),
            ui.sectionTitle('Aligner'),
            h('div', { class: 's-stack' }, seg, alignRow),
            ui.sectionTitle('Répartir'),
            distRow);

        // --- Clavier --------------------------------------------------------------------
        // Entrée = bouton principal quand la section a le focus ; pavé numérique = point d'ancrage
        // quand la vue est visible (le hub garde les vues cachées montées).
        const focusRoot = view.closest('.s-view') || view;
        const doc = focusRoot.ownerDocument;
        const inField = (e) => { const tag = e.target && e.target.tagName; return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'; };
        focusRoot.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' || e.defaultPrevented || inField(e)) return;
            if (e.target && e.target.tagName === 'BUTTON') return;
            if (doc.querySelector('[data-role=dialog]')) return;
            if (!primary.disabled) { e.preventDefault(); primary.click(); }
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
