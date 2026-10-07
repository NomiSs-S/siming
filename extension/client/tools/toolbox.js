/*
 * SIMING : vue de la Boîte à outils (gestes rares mais utiles, un clic chacun).
 * Toute la logique After Effects est côté hôte (host/tools/toolbox.jsx). Comme Quick Tools :
 * pas de bouton principal, le dernier geste est cerclé d'accent et Entrée le rejoue ; chaque
 * geste est une action du registre de raccourcis (SIMING.keys), réglable dans Réglages.
 * La comp active (format, couleur de fond) est relue à chaque geste et quand le pointeur
 * entre dans la vue.
 */
(function (global) {
    'use strict';

    const SIMING = global.SIMING;
    const ui = SIMING.ui;
    const h = ui.h;

    const HELP = [
        'Copier la frame : l\'image de la tête de lecture est rendue puis copiée dans le presse-papier,',
        '   prête à coller (Slack, mail, Photoshop…). After Effects doit autoriser l\'écriture de fichiers :',
        '   Préférences › Scripts et expressions › « Autoriser les scripts à écrire des fichiers et à accéder au réseau ».',
        'Séquencer : Cascade, Inverse, ou Aléatoire (ordre tiré au hasard à chaque clic). Calques : dans l\'ordre',
        '   de la sélection que donne After Effects ; keyframes : de haut en bas dans la pile.',
        '   Écart = images entre deux départs ; Par paquets de = combien partent ensemble.',
        '   Le plus tôt reste en place, les autres s\'enchaînent derrière lui.',
        '   Calques : décale les calques sélectionnés (leurs keyframes suivent).',
        '   Keyframes : décale les keyframes sélectionnées calque par calque (propriété par propriété',
        '   s\'il n\'y a qu\'un calque) ; elles restent sélectionnées, tu peux relancer.',
        'Null relié : au centre des calques sélectionnés, au-dessus d\'eux, relié à eux (ceux dont le',
        '   parent est aussi sélectionné gardent leur parent). Sans sélection : au centre de la compo.',
        'Fond : calque de forme « Fond » tout en bas, toujours à la taille de la compo. La pastille',
        '   règle sa couleur : clic = choisir, Alt + clic = couleur de fond de la composition.',
        'Format : 16:9, 4:5, 1:1 ou 9:16. Le plus petit côté est gardé (1920 × 1080 -> 1080 × 1920),',
        '   le contenu reste centré, keyframes comprises.',
        'Afficher la source : sélectionne dans le panneau Projet la source des calques sélectionnés.',
        'Convertir les textes PSD : les textes d\'un Photoshop importé deviennent modifiables',
        '   (calques sélectionnés, sinon toute la compo).',
        '',
        'Le dernier geste est cerclé de bleu : Entrée le rejoue. Chaque geste s\'annule d\'un seul Ctrl+Z.',
        'Raccourcis de chaque geste : Réglages du panneau SIMING.',
    ].join('\n');

    const MODES = [
        { id: 'cascade', label: 'Cascade',   title: 'Dans l\'ordre de la sélection (keyframes : de haut en bas)' },
        { id: 'reverse', label: 'Inverse',   title: 'Ordre inverse : du dernier au premier' },
        { id: 'random',  label: 'Aléatoire', title: 'Ordre tiré au hasard à chaque clic, écart régulier' },
    ];
    const FORMATS = [{ id: '16:9', w: 16, h: 9 }, { id: '4:5', w: 4, h: 5 }, { id: '1:1', w: 1, h: 1 }, { id: '9:16', w: 9, h: 16 }];
    const POLL_MS = 120;
    const POLL_MAX = 170;   // environ 20 s pour rendre une frame lourde

    const wait = (ms) => new Promise((resolve) => global.setTimeout(resolve, ms));
    const roleOf = (id) => 'format-' + id.replace(':', 'x');

    function mount(view, ctx) {
        let state = null;   // dernière réponse de l'hôte
        let comp = null;    // { id, name, width, height, format, bg } de la comp active
        let busy = null;
        let last = null;    // { el, replay } : dernier geste, rejoué par Entrée
        const settings = ctx.settings;
        const keys = ctx.keys || SIMING.keys;
        const pref = (key, fallback) => {
            const v = parseFloat(settings.get('toolbox.' + key, fallback));
            return isNaN(v) ? fallback : v;
        };
        const labelRow = (label, hint) => {
            const hintEl = h('span', { class: 's-label-hint', text: hint || '' });
            const row = h('div', { class: 's-label-row' }, ui.sectionTitle(label), hintEl);
            row.hint = hintEl;
            return row;
        };

        const focusRoot = view.closest('.s-view') || view;
        const group = (ctx.meta && ctx.meta.name) || 'Boîte à outils';
        const action = (id, label, run, defaultKey) => keys.register({
            id: 'toolbox.' + id, label, group, defaultKey: defaultKey || null, run, when: () => !focusRoot.hidden,
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

        /** Bouton de geste (36 px) : icône et verbe ; aussi une action du registre. */
        function actionButton(role, icon, label, title, replay) {
            const b = h('button', {
                class: 's-btn s-action', type: 'button', 'data-role': role, title, 'aria-label': title,
                onclick: () => gesture(b, replay),
            }, ui.icon(icon, 16), h('span', { class: 's-action-label', text: label }));
            action(role, title, () => gesture(b, replay));
            return b;
        }

        // --- Frame ----------------------------------------------------------------------
        const frameBtn = actionButton('frame', 'appareil', 'Copier la frame', 'Copier l\'image de la tête de lecture dans le presse-papier', () => task(copyFrame));

        // --- Séquencer --------------------------------------------------------------------
        let mode = settings.get('toolbox.mode', 'cascade');
        if (!MODES.some((m) => m.id === mode)) mode = 'cascade';
        const modeSeg = ui.segmented({
            role: 'seq-mode', labels: MODES.map((m) => m.label),
            onChange: (i) => { mode = MODES[i].id; settings.set('toolbox.mode', mode); },
        });
        modeSeg.select(MODES.findIndex((m) => m.id === mode));
        modeSeg.querySelectorAll('.s-seg-btn').forEach((b, i) => { b.title = MODES[i].title; });
        const gapBar = ui.valueBar({
            label: 'Écart', min: 0, max: 30, unit: ' im', integer: true, value: pref('gap', 2), defaultValue: 2, role: 'seq-gap',
            onChange: (v) => settings.set('toolbox.gap', v),
        });
        gapBar.title = 'Images entre deux départs';
        const groupBar = ui.valueBar({
            label: 'Par paquets de', min: 1, max: 10, integer: true, value: pref('group', 1), defaultValue: 1, role: 'seq-group',
            onChange: (v) => settings.set('toolbox.group', v),
        });
        groupBar.title = 'Combien de calques (ou de groupes de keyframes) partent ensemble';
        const sequence = (target) => () => run('sequence', { target, mode, gap: gapBar.value, group: groupBar.value });
        const seqLayers = actionButton('seq-layers', 'echelonner', 'Calques', 'Séquencer les calques sélectionnés', sequence('layers'));
        const seqKeys = actionButton('seq-keys', 'keyframe', 'Keyframes', 'Séquencer les keyframes sélectionnées', sequence('keys'));

        // --- Créer ------------------------------------------------------------------------
        let bgColor = settings.get('toolbox.bgColor', '');   // '' = couleur de fond de la comp
        const nullBtn = actionButton('null', 'null', 'Null relié', 'Ajouter un null au centre des calques sélectionnés, relié à eux', () => run('nullFor', {}));
        const bgBtn = actionButton('background', 'fond', 'Fond', 'Ajouter un calque de forme « Fond » à la taille de la composition', () => run('background', { color: bgColor || null }));
        const chipDot = h('span', { class: 's-color-chip-dot' });
        const chip = h('button', { class: 's-color-chip', type: 'button', 'data-role': 'bg-color' }, chipDot);
        const currentColor = () => bgColor || (comp && comp.bg) || '#000000';
        chip.addEventListener('click', (e) => {
            if (e.altKey) {
                bgColor = '';
                settings.set('toolbox.bgColor', '');
                renderChip();
                ctx.status.set('Fond : couleur de fond de la composition', 'ok');
                return;
            }
            task(async () => {
                const r = await call('pickColor', { color: currentColor() });
                if (!r.color) return;
                bgColor = r.color;
                settings.set('toolbox.bgColor', bgColor);
                renderChip();
                ctx.status.set('Couleur du fond : ' + bgColor, 'ok');
            });
        });

        // --- Format -----------------------------------------------------------------------
        const formatTitle = labelRow('Format de la compo');
        const formatTiles = FORMATS.map((f) => {
            const area = 190;   // cadres de même surface : on compare des proportions
            const fw = Math.round(Math.sqrt(area * f.w / f.h) * 2) / 2, fh = Math.round(Math.sqrt(area * f.h / f.w) * 2) / 2;
            const title = 'Passer la composition en ' + f.id;
            const replay = () => run('format', { ratio: f.id });
            const b = h('button', {
                class: 's-tool s-format', type: 'button', 'data-role': roleOf(f.id), 'data-format': f.id, title, 'aria-label': title,
                onclick: () => gesture(b, replay),
            }, h('span', { class: 's-format-frame', style: 'width:' + fw + 'px;height:' + fh + 'px' }), h('span', { class: 's-format-label', text: f.id }));
            action(roleOf(f.id), 'Format ' + f.id, () => gesture(b, replay));
            return b;
        });

        // --- Projet -----------------------------------------------------------------------
        const revealBtn = actionButton('reveal', 'source', 'Afficher la source dans le Projet', 'Sélectionner la source des calques sélectionnés dans le panneau Projet', () => run('revealSource', {}));
        const psdBtn = actionButton('psd-text', 'texte', 'Convertir les textes PSD en texte modifiable', 'Convertir en texte modifiable les textes d\'un Photoshop importé (sélection, sinon toute la composition)', () => run('convertPsdText', {}));

        view.append(
            h('div', { class: 's-stack', 'data-role': 'frame-section' }, labelRow('Frame', 'presse-papier'), frameBtn),
            h('div', { class: 's-stack', 'data-role': 'seq-section' }, labelRow('Séquencer', 'calques ou keyframes'), modeSeg, gapBar, groupBar,
                h('div', { class: 's-actions' }, seqLayers, seqKeys)),
            h('div', { class: 's-stack', 'data-role': 'create-section' }, labelRow('Créer'),
                h('div', { class: 's-actions' }, nullBtn, h('div', { class: 's-action-pair' }, bgBtn, chip))),
            h('div', { class: 's-stack', 'data-role': 'format-section' }, formatTitle,
                h('div', { class: 's-tool-grid is-4', 'data-role': 'formats' }, formatTiles)),
            h('div', { class: 's-stack', 'data-role': 'layers-section' }, labelRow('Calques'),
                h('div', { class: 's-actions is-list' }, revealBtn, psdBtn)));

        // --- Appels à l'hôte -------------------------------------------------------------
        const call = (fn, args) => ctx.bridge.call('toolbox', fn, args || {});

        function setBusy(on) {
            view.classList.toggle('is-busy', on);
            view.querySelectorAll('button').forEach((b) => { b.disabled = on; });
        }

        /** Une seule tâche à la fois, commandes désactivées pendant ce temps. */
        function task(fn) {
            if (busy) return busy;
            setBusy(true);
            busy = Promise.resolve().then(fn)
                .catch((e) => { ctx.status.set(e.message, 'error'); })
                .finally(() => { busy = null; setBusy(false); });
            return busy;
        }

        function run(fn, args) {
            return task(() => call(fn, args).then(render));
        }

        /** Rend la frame (hôte), attend le fichier, le copie : Node du panneau, sinon l'hôte. */
        async function copyFrame() {
            const s = render(await call('frame'));
            if (!s.frame) return;
            let st = null, prev = -1, done = false;
            for (let i = 0; i < POLL_MAX && !done; i++) {
                if (i) await wait(POLL_MS);
                st = await call('frameState', { path: s.frame.path });
                if (st.error) throw new Error('Frame introuvable : ' + st.error);
                done = st.ready && st.bytes === prev;   // écrite et stable entre deux lectures
                prev = st.ready ? st.bytes : -1;
            }
            if (!done) {
                ctx.status.set('La frame n\'a pas été rendue à temps : réessaie (et vérifie Préférences › Scripts et expressions)', 'error');
                return;
            }
            try {
                await SIMING.runProgram(st.copy.file, st.copy.args);
            } catch (e) {
                if (e.code !== 'NO_NODE') { ctx.status.set('Copie impossible : ' + e.message, 'error'); return; }
                const r = await call('copyImage', { path: s.frame.path });
                if (r.status.level !== 'ok') { render(r); return; }
            }
            ctx.status.set('Frame ' + st.width + ' × ' + st.height + ' copiée dans le presse-papier : colle-la où tu veux', 'ok');
        }

        function render(s) {
            state = s;
            if (Object.prototype.hasOwnProperty.call(s, 'comp')) setComp(s.comp);
            if (s.status) ctx.status.set(s.status.text, s.status.level);
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

        // --- Comp active : format en cours, couleur de fond ---------------------------------
        function setComp(c) {
            comp = c || null;
            formatTitle.hint.textContent = comp ? comp.width + ' × ' + comp.height : 'aucune composition';
            formatTiles.forEach((b) => b.classList.toggle('is-on', !!comp && comp.format === b.getAttribute('data-format')));
            renderChip();
        }

        function renderChip() {
            const color = currentColor();
            chipDot.style.backgroundColor = color;
            chip.classList.toggle('is-auto', !bgColor);
            chip.title = 'Couleur du fond : ' + color + (bgColor ? '' : ' (celle de la composition)') +
                ' · clic = choisir, Alt + clic = couleur de la composition';
            chip.setAttribute('aria-label', chip.title);
        }

        /** Relit la comp active sans bloquer les commandes (pointeur qui entre, panneau focalisé). */
        let peeking = null;
        function peek() {
            if (busy || peeking || focusRoot.hidden) return peeking;
            peeking = call('info').then((s) => { if (s) setComp(s.comp); }).catch(() => {}).finally(() => { peeking = null; });
            return peeking;
        }
        focusRoot.addEventListener('pointerenter', peek);
        global.addEventListener('focus', peek);

        setComp(null);
        const ready = run('init', {});
        return {
            ready,
            idle: () => busy || peeking || Promise.resolve(state),
            getState: () => state,
            getComp: () => comp,
            peek,
        };
    }

    SIMING.registerTool('toolbox', { help: HELP, mount });
})(window);
