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
})(window);
