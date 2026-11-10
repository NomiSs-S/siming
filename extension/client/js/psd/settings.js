/*
 * SIMING : réglages de l'import des PSD (Boîte à outils › Importer les PSD), enregistrés par utilisateur dans
 * SIMING.settings (clés « psd.* »). Une valeur vide ou invalide n'est jamais enregistrée.
 *
 *   SIMING.psdSettings.DEFAULTS     { sourcePath, bin } : valeurs par défaut des deux chemins
 *   SIMING.psdSettings.STEPS        étapes de l'import : [{ id, label }], toutes faites par défaut
 *   SIMING.psdSettings.checkPath(texte) -> { ok: true, value } | { ok: false, error }
 *   SIMING.psdSettings.read(store?) -> { sourcePath, bin, steps: { texts, shapes, labels, crop, anchors } }
 *   SIMING.psdSettings.pane(el, { status, store? }) -> { refresh() } : l'onglet « Import PSD » de Réglages
 *
 * sourcePath : dossier des PSD, cherché depuis le dossier du projet en remontant. bin : chutier du panneau
 * Projet où l'import range tout (« A/B » = chutiers imbriqués). steps : ce que l'import fait après avoir
 * importé les compositions.
 */
(function (global) {
    'use strict';

    const SIMING = global.SIMING;
    const PREFIX = 'psd.';

    const DEFAULTS = { sourcePath: '02_RESSOURCES/02_ASSET', bin: '02_ASSET' };
    const STEPS = [
        { id: 'texts', label: 'Convertir les textes en texte modifiable' },
        { id: 'shapes', label: 'Recréer les formes' },
        { id: 'labels', label: 'Poser les libellés' },
        { id: 'crop', label: 'Recadrer les précompos' },
        { id: 'anchors', label: 'Centrer les points d\'ancrage' },
    ];
    const FIELDS = [
        { key: 'sourcePath', title: 'Dossier des PSD', short: 'Dossier des PSD', placeholder: DEFAULTS.sourcePath,
            hint: 'Chemin relatif, cherché depuis le dossier du projet en remontant d\'au plus 3 dossiers. Les sous-dossiers sont lus aussi.' },
        { key: 'bin', title: 'Chutier de dépose', short: 'Chutier de dépose', placeholder: DEFAULTS.bin,
            hint: 'Dossier du panneau Projet où tout est rangé ; « A/B » crée des dossiers imbriqués. Les sous-dossiers des PSD y sont recréés.' },
    ];

    const FORBIDDEN = /[<>:"|?*\u0000-\u001F]/;

    /** Vérifie un chemin relatif de dossier (séparateurs « / » ou « \ ») : { ok, value } (normalisé : « / », sans
     *  séparateur de tête ni de fin) ou { ok: false, error }. Mêmes règles que l'hôte (cleanRelPath). */
    function checkPath(text) {
        const raw = String(text === undefined || text === null ? '' : text).replace(/\\/g, '/').trim();
        if (raw.startsWith('/') || /^[A-Za-z]:/.test(raw)) return { ok: false, error: 'un chemin relatif est attendu, sans « / » au début ni lettre de lecteur' };
        const parts = [];
        for (const p of raw.split('/')) {
            if (p === '') continue;
            if (p === '.' || p === '..') return { ok: false, error: '« ' + p + ' » n\'est pas permis' };
            const bad = p.match(FORBIDDEN);
            if (bad) return { ok: false, error: 'caractère interdit dans un nom de dossier : ' + (bad[0].charCodeAt(0) < 32 ? 'contrôle' : bad[0]) };
            if (/[. ]$/.test(p)) return { ok: false, error: 'un nom de dossier ne finit pas par un point ou une espace (« ' + p + ' »)' };
            parts.push(p);
        }
        return parts.length ? { ok: true, value: parts.join('/') } : { ok: false, error: 'le chemin est vide' };
    }

    /** Réglages courants (défauts pour ce qui manque ou est invalide). */
    function read(store) {
        const st = store || SIMING.settings;
        const out = { steps: {} };
        for (const f of FIELDS) {
            const c = checkPath(st.get(PREFIX + f.key, DEFAULTS[f.key]));
            out[f.key] = c.ok ? c.value : DEFAULTS[f.key];
        }
        for (const s of STEPS) out.steps[s.id] = st.get(PREFIX + 'step.' + s.id, '1') !== '0';
        return out;
    }

    /** Remet les valeurs par défaut. */
    function reset(store) {
        const st = store || SIMING.settings;
        for (const f of FIELDS) st.set(PREFIX + f.key, DEFAULTS[f.key]);
        for (const s of STEPS) st.set(PREFIX + 'step.' + s.id, '1');
    }

    /** Onglet « Import PSD » de Réglages : deux chemins, les étapes, « Rétablir ». */
    function pane(el, { status, store }) {
        const ui = SIMING.ui;
        const h = ui.h;
        const st = store || SIMING.settings;
        const fields = {};
        const nodes = [];
        for (const f of FIELDS) {
            fields[f.key] = ui.textField({
                role: 'psd-' + f.key, label: f.title, placeholder: f.placeholder,
                onCommit: (text) => commit(f, text),
            });
            nodes.push(ui.sectionTitle(f.title), fields[f.key], h('div', { class: 's-hint', text: f.hint }));
        }
        const stepList = ui.checkList({
            role: 'psd-steps',
            onChange: (keys) => {
                for (const s of STEPS) st.set(PREFIX + 'step.' + s.id, keys.includes(s.id) ? '1' : '0');
                status.set('Étapes de l\'import : ' + keys.length + ' sur ' + STEPS.length, 'ok');
            },
        });
        nodes.push(ui.sectionTitle('Étapes de l\'import'), stepList,
            h('div', { class: 's-hint', text: 'Ce que l\'import fait, dans l\'ordre, après avoir importé et rangé les compositions. Une étape décochée n\'est pas faite.' }),
            h('div', { class: 's-settings-actions' }, ui.button({
                label: 'Rétablir', role: 'psd-reset',
                onClick: () => { reset(st); refresh(); status.set('Réglages de l\'import des PSD rétablis', 'ok'); },
            })));
        el.append(...nodes);

        function commit(f, text) {
            const c = checkPath(text);
            if (!c.ok) {
                fields[f.key].set(read(st)[f.key]);
                status.set(f.short + ' : ' + c.error + ' · valeur gardée', 'warn');
                return;
            }
            st.set(PREFIX + f.key, c.value);
            fields[f.key].set(c.value);
            status.set(f.short + ' : ' + c.value, 'ok');
        }

        function refresh() {
            const cur = read(st);
            for (const f of FIELDS) fields[f.key].set(cur[f.key]);
            stepList.setRows(STEPS.map((s) => ({ key: s.id, name: s.label, checked: cur.steps[s.id] })));
        }

        refresh();
        return { refresh };
    }

    SIMING.psdSettings = { DEFAULTS, STEPS, checkPath, read, reset, pane };
})(window);
