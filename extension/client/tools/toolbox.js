/*
 * SIMING : vue de la Boîte à outils (gestes rares mais utiles, un clic chacun).
 * Toute la logique After Effects est côté hôte (host/tools/toolbox.jsx). Comme Quick Tools :
 * pas de bouton principal, le dernier geste est cerclé d'accent et Entrée le rejoue ; chaque
 * geste est une action du registre de raccourcis (SIMING.keys), réglable dans Réglages.
 * Alt + clic donne la variante d'un geste (montrer le fichier, dupliquer au lieu de modifier) ;
 * Entrée rejoue la variante choisie. La comp active (format, couleur de fond) est relue à
 * chaque geste et quand le pointeur entre dans la vue.
 */
(function (global) {
    'use strict';

    const SIMING = global.SIMING;
    const ui = SIMING.ui;
    const h = ui.h;

    const HELP = {
        intro: 'Des gestes moins fréquents, un clic et un Ctrl+Z chacun. Alt + clic donne leur variante.',
        groups: [
            { title: 'Frame', items: [
                { icon: 'appareil', name: 'Copier', text: 'L\'image de la tête de lecture, dans le presse-papier.' },
                { icon: 'exporter', name: 'Exporter en PNG', text: 'À côté du projet, dans le dossier « Frames ».', keys: [{ k: ['Alt', 'clic'], t: 'et la montrer' }] },
                { icon: 'attention', name: 'Une fois pour toutes', text: 'Préférences › Scripts et expressions › « Autoriser les scripts à écrire des fichiers… ».' },
            ] },
            { title: 'Séquencer', items: [
                { icon: 'seqCascade', name: 'Cascade', text: 'Dans l\'ordre de la sélection.' },
                { icon: 'seqReverse', name: 'Inverse', text: 'Du dernier au premier.' },
                { icon: 'seqRandom', name: 'Aléatoire', text: 'Un nouvel ordre à chaque clic.' },
                { icon: 'echelonner', name: 'Séquencer', text: 'Les keyframes sélectionnées s\'il y en a, sinon les calques. Écart : images entre deux départs ; Paquets : combien partent ensemble.' },
            ] },
            { title: 'Créer', items: [
                { icon: 'null', name: 'Null relié', text: 'Au centre des calques sélectionnés, relié à eux.' },
                { icon: 'fond', name: 'Fond', text: 'Forme à la taille de la compo, tout en bas.', keys: [{ k: ['Alt', 'clic'], t: 'pastille : couleur de la compo' }] },
            ] },
            { title: 'Format', items: [
                { icon: 'panneau', name: '16:9 · 4:5 · 1:1 · 9:16', text: 'Le plus petit côté est gardé, le contenu reste centré.', keys: [{ k: ['Alt', 'clic'], t: 'une copie dans ce format' }] },
                { icon: 'decliner', name: 'Décliner', text: 'Une copie dans chacun des autres formats ; l\'original ne change pas.' },
            ] },
            { title: 'Zone de travail', items: [
                { icon: 'zone', name: 'Sur la sélection', text: 'Du début du premier calque à la fin du dernier.' },
                { icon: 'rognerDuree', name: 'Rogner la durée', text: 'La compo s\'arrête à la zone de travail.' },
                { icon: 'rogner', name: 'Recadrer l\'image', text: 'Largeur et hauteur ajustées aux calques sélectionnés.' },
            ] },
            { title: 'Calques', items: [
                { icon: 'source', name: 'Afficher la source', text: 'Dans le panneau Projet.', keys: [{ k: ['Alt', 'clic'], t: 'son fichier sur le disque' }] },
                { icon: 'texte', name: 'Textes PSD', text: 'Ils deviennent modifiables (sélection, sinon toute la compo).' },
                { icon: 'figer', name: 'Expressions en keyframes', text: 'Une keyframe par image, l\'expression est désactivée.' },
            ] },
        ],
        footer: 'Le dernier geste est cerclé de bleu : Entrée le rejoue.',
    };

    const MODES = [
        { id: 'cascade', label: 'Cascade',   icon: 'seqCascade', title: 'Cascade : dans l\'ordre de la sélection' },
        { id: 'reverse', label: 'Inverse',   icon: 'seqReverse', title: 'Inverse : du dernier au premier' },
        { id: 'random',  label: 'Aléatoire', icon: 'seqRandom',  title: 'Aléatoire : un nouvel ordre à chaque clic' },
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

        /** Bouton de geste (36 px) : icône et verbe ; aussi une action du registre. alt : variante
         *  { title, replay } jouée par Alt + clic (et sa propre action dans le registre). */
        function actionButton(role, icon, label, title, replay, alt) {
            const b = h('button', {
                class: 's-btn s-action', type: 'button', 'data-role': role,
                title: title + (alt ? ' · Alt + clic : ' + alt.hint : ''), 'aria-label': title,
                onclick: (e) => gesture(b, e.altKey && alt ? alt.replay : replay),
            }, ui.icon(icon, 16), h('span', { class: 's-action-label', text: label }));
            action(role, title, () => gesture(b, replay));
            if (alt) action(role + '-alt', alt.title, () => gesture(b, alt.replay));
            return b;
        }

        // --- Frame ----------------------------------------------------------------------
        const frameBtn = actionButton('frame', 'appareil', 'Copier', 'Copier l\'image de la tête de lecture dans le presse-papier', () => task(copyFrame));
        const exportBtn = actionButton('frame-export', 'exporter', 'Exporter en PNG', 'Enregistrer l\'image de la tête de lecture à côté du projet (dossier « Frames »)',
            () => task(() => exportFrame(false)),
            { hint: 'et la montrer', title: 'Exporter la frame et la montrer dans l\'Explorateur / le Finder', replay: () => task(() => exportFrame(true)) });

        // --- Séquencer --------------------------------------------------------------------
        let mode = settings.get('toolbox.mode', 'cascade');
        if (!MODES.some((m) => m.id === mode)) mode = 'cascade';
        const modeOf = () => MODES.find((m) => m.id === mode);
        const modeSeg = ui.segmented({
            role: 'seq-mode', labels: MODES.map((m) => ({ label: m.label, icon: m.icon, title: m.title })),
            onChange: (i) => { mode = MODES[i].id; settings.set('toolbox.mode', mode); renderSeqIcon(); },
        });
        modeSeg.select(MODES.findIndex((m) => m.id === mode));
        const gapBar = ui.valueBar({
            label: 'Écart', min: 0, max: 30, unit: ' im', integer: true, value: pref('gap', 2), defaultValue: 2, role: 'seq-gap',
            onChange: (v) => settings.set('toolbox.gap', v),
        });
        gapBar.title = 'Images entre deux départs';
        const groupBar = ui.valueBar({
            label: 'Paquets', min: 1, max: 10, integer: true, value: pref('group', 1), defaultValue: 1, role: 'seq-group',
            onChange: (v) => settings.set('toolbox.group', v),
        });
        groupBar.title = 'Combien partent ensemble';
        // Un seul geste : l'hôte prend les keyframes sélectionnées s'il y en a, sinon les calques.
        const seqBtn = actionButton('sequence', modeOf().icon, 'Séquencer', 'Séquencer les keyframes sélectionnées, sinon les calques',
            () => run('sequence', { mode, gap: gapBar.value, group: groupBar.value }));
        function renderSeqIcon() {
            seqBtn.replaceChild(ui.icon(modeOf().icon, 16), seqBtn.querySelector('.s-icon'));
        }

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
            const title = 'Passer la composition en ' + f.id + ' · Alt + clic : en faire une copie en ' + f.id;
            const replay = () => run('format', { ratio: f.id });
            const copy = () => run('duplicateFormats', { ratio: f.id });
            const b = h('button', {
                class: 's-tool s-format', type: 'button', 'data-role': roleOf(f.id), 'data-format': f.id, title, 'aria-label': title,
                onclick: (e) => gesture(b, e.altKey ? copy : replay),
            }, h('span', { class: 's-format-frame', style: 'width:' + fw + 'px;height:' + fh + 'px' }), h('span', { class: 's-format-label', text: f.id }));
            action(roleOf(f.id), 'Format ' + f.id, () => gesture(b, replay));
            action(roleOf(f.id) + '-copy', 'Copie de la compo en ' + f.id, () => gesture(b, copy));
            return b;
        });
        const variantsBtn = actionButton('format-variants', 'decliner', 'Décliner dans les autres formats',
            'Créer une copie de la composition dans chacun des autres formats (l\'original ne change pas)', () => run('duplicateFormats', {}));

        // --- Zone de travail --------------------------------------------------------------
        const workSel = actionButton('work-selection', 'zone', 'Sur la sélection', 'Caler la zone de travail sur les calques sélectionnés', () => run('workArea', { mode: 'selection' }));
        const workTrim = actionButton('work-trim', 'rognerDuree', 'Rogner la durée', 'Rogner la durée de la composition à la zone de travail', () => run('workArea', { mode: 'trim' }));
        const cropBtn = actionButton('crop', 'rogner', 'Recadrer l\'image', 'Recadrer la composition sur les calques sélectionnés (largeur et hauteur)', () => run('cropToLayers', {}));

        // --- Calques ----------------------------------------------------------------------
        const revealBtn = actionButton('reveal', 'source', 'Afficher la source dans le Projet', 'Sélectionner la source des calques sélectionnés dans le panneau Projet',
            () => run('revealSource', {}),
            { hint: 'son fichier dans l\'Explorateur / le Finder', title: 'Montrer le fichier source dans l\'Explorateur / le Finder', replay: () => task(revealFile) });
        const psdBtn = actionButton('psd-text', 'texte', 'Convertir les textes PSD en texte modifiable', 'Convertir en texte modifiable les textes d\'un Photoshop importé (sélection, sinon toute la composition)', () => run('convertPsdText', {}));
        const bakeBtn = actionButton('bake', 'figer', 'Convertir les expressions en keyframes', 'Remplacer les expressions des propriétés sélectionnées (ou des calques sélectionnés) par une keyframe à chaque image', () => run('bakeExpressions', {}));

        view.append(
            h('div', { class: 's-stack', 'data-role': 'frame-section' }, labelRow('Frame', 'de la tête de lecture'),
                h('div', { class: 's-actions' }, frameBtn, exportBtn)),
            h('div', { class: 's-stack', 'data-role': 'seq-section' }, labelRow('Séquencer'), modeSeg,
                h('div', { class: 's-bar-pair' }, gapBar, groupBar),
                h('div', { class: 's-actions is-list' }, seqBtn)),
            h('div', { class: 's-stack', 'data-role': 'create-section' }, labelRow('Créer'),
                h('div', { class: 's-actions' }, nullBtn, h('div', { class: 's-action-pair' }, bgBtn, chip))),
            h('div', { class: 's-stack', 'data-role': 'format-section' }, formatTitle,
                h('div', { class: 's-tool-grid is-4', 'data-role': 'formats' }, formatTiles),
                h('div', { class: 's-actions is-list' }, variantsBtn)),
            h('div', { class: 's-stack', 'data-role': 'work-section' }, labelRow('Zone de travail'),
                h('div', { class: 's-actions' }, workSel, workTrim, cropBtn)),
            h('div', { class: 's-stack', 'data-role': 'layers-section' }, labelRow('Calques'),
                h('div', { class: 's-actions is-list' }, revealBtn, psdBtn, bakeBtn)));

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

        /** Lance un programme du système par le Node du panneau ; sans Node, hostFallback() demande
         *  à l'hôte de le faire. Renvoie true si c'est lancé. */
        async function launch(program, hostFallback) {
            try {
                await SIMING.runProgram(program.file, program.args, { anyExit: !!program.anyExit });
                return true;
            } catch (e) {
                if (e.code !== 'NO_NODE') { ctx.status.set('Lancement impossible : ' + e.message, 'error'); return false; }
                const r = render(await hostFallback());
                return r.status.level === 'ok';
            }
        }

        /** Rend la frame (hôte) et attend le fichier écrit et stable. Renvoie { path, st } ou null. */
        async function renderFrame() {
            const s = render(await call('frame'));
            if (!s.frame) return null;
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
                return null;
            }
            return { path: s.frame.path, st };
        }

        /** Copie la frame : Node du panneau, sinon l'hôte. */
        async function copyFrame() {
            const f = await renderFrame();
            if (!f) return;
            try {
                await SIMING.runProgram(f.st.copy.file, f.st.copy.args);
            } catch (e) {
                if (e.code !== 'NO_NODE') { ctx.status.set('Copie impossible : ' + e.message, 'error'); return; }
                const r = await call('copyImage', { path: f.path });
                if (r.status.level !== 'ok') { render(r); return; }
            }
            ctx.status.set('Frame ' + f.st.width + ' × ' + f.st.height + ' copiée dans le presse-papier : colle-la où tu veux', 'ok');
        }

        /** Enregistre la frame à côté du projet ; reveal : la montrer ensuite. */
        async function exportFrame(reveal) {
            const f = await renderFrame();
            if (!f) return;
            const r = render(await call('keepFrame', { path: f.path }));
            if (!reveal || !r.file) return;
            const text = r.status.text;
            if (await launch(r.file.reveal, () => call('revealKept'))) ctx.status.set(text + ' · montrée', 'ok');
        }

        /** Montre le fichier source du calque sélectionné dans l'Explorateur / le Finder. */
        async function revealFile() {
            const r = render(await call('revealFile'));
            if (!r.program) return;
            const text = r.status.text, level = r.status.level;
            if (await launch(r.program, () => call('revealFile', { run: true }))) ctx.status.set(text, level);
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
            variantsBtn.querySelector('.s-action-label').textContent = (comp && comp.format) ? 'Décliner dans les 3 autres formats' : 'Décliner dans les 4 formats';
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
