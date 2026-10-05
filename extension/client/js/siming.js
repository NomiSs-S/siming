/*
 * SIMING : espace de noms du panneau (registre des outils, réglages, utilitaires).
 * Complété par les autres fichiers de js/ (bridge, ui, hub, standalone).
 */
(function (global) {
    'use strict';

    const SIMING = global.SIMING = global.SIMING || {};

    /** Définitions des outils côté panneau : id -> { help, mount(view, ctx) }. */
    SIMING.toolDefs = SIMING.toolDefs || {};

    SIMING.registerTool = function (id, def) {
        SIMING.toolDefs[id] = def;
    };

    /** "1 enfant", "3 enfants". */
    SIMING.plural = function (n, one, many) {
        return n + ' ' + (n === 1 ? one : many);
    };

    /** Réglages du panneau (localStorage, clés préfixées « siming. »). */
    SIMING.settings = {
        get(key, fallback) {
            try {
                const v = global.localStorage.getItem('siming.' + key);
                return v === null || v === undefined ? fallback : v;
            } catch (e) {
                return fallback;
            }
        },
        set(key, value) {
            try { global.localStorage.setItem('siming.' + key, String(value)); } catch (e) { /* pas de stockage */ }
        },
    };

    // --- Thème : suivre la couleur de panneau d'After Effects --------------------
    // Gris de la charte (valeur 0-255 d'un gris neutre), décalés ensemble.
    const SHADES = {
        '--bg-deep': 0x16, '--bg-inset': 0x1B, '--bg-bar': 0x1D, '--bg-panel': 0x23,
        '--bg-hover': 0x2A, '--bg-surface': 0x2C, '--bg-control': 0x34, '--segment-on': 0x3E, '--line': 0x3B,
    };
    const BASE = 0x23;
    const MAX_DELTA = 16;   // au-delà, le texte clair de la charte deviendrait illisible

    /** Décale les gris de la charte vers la couleur de panneau d'AE. Renvoie le décalage appliqué. */
    SIMING.setPanelColor = function (r, g, b) {
        const grey = Math.round((r + g + b) / 3);
        const delta = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, grey - BASE));
        const style = global.document.documentElement.style;
        for (const [name, v] of Object.entries(SHADES)) {
            const x = Math.max(0, Math.min(255, v + delta));
            style.setProperty(name, 'rgb(' + x + ', ' + x + ', ' + x + ')');
        }
        return delta;
    };

    /** Applique la couleur de panneau d'AE et suit ses changements (cs = CSInterface). */
    SIMING.applyTheme = function (cs) {
        function apply() {
            try {
                const c = cs.getHostEnvironment().appSkinInfo.panelBackgroundColor.color;
                SIMING.setPanelColor(c.red, c.green, c.blue);
            } catch (e) { /* hors After Effects : on garde la charte */ }
        }
        apply();
        try { cs.addEventListener('com.adobe.csxs.events.ThemeColorChanged', apply); } catch (e) { /* idem */ }
    };
})(window);
