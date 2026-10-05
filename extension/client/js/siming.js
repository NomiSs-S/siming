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

    // --- Démarrage des pages ----------------------------------------------------

    /** Lit un JSON local (XHR synchrone ; un fichier local répond avec le statut 0). */
    SIMING.readJson = function (url) {
        const xhr = new global.XMLHttpRequest();
        xhr.open('GET', url, false);
        xhr.send(null);
        if (xhr.status !== 0 && xhr.status !== 200) throw new Error('Lecture impossible : ' + url);
        return JSON.parse(xhr.responseText);
    };

    SIMING.loadScript = function (src) {
        return new Promise((resolve, reject) => {
            const s = global.document.createElement('script');
            s.src = src;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('Script introuvable : ' + src));
            global.document.head.append(s);
        });
    };

    /** Outil d'un panneau isolé : identifiant d'extension com.siming.tool.<id>, sinon ?tool=<id>. */
    SIMING.standaloneToolId = function (cs) {
        try {
            const m = /^com\.siming\.tool\.(.+)$/.exec(cs.getExtensionID());
            if (m) return m[1];
        } catch (e) { /* pas de CSInterface */ }
        try {
            return new global.URLSearchParams(global.location.search).get('tool');
        } catch (e) {
            return null;
        }
    };

    /** Démarre la page : mode « hub » (index.html) ou « standalone » (tool.html). */
    SIMING.boot = async function (mode) {
        const root = global.document.getElementById('app');
        let cs = null;
        try { cs = new global.CSInterface(); } catch (e) { cs = null; }
        if (cs) SIMING.applyTheme(cs);

        const errors = [];
        let list;
        try {
            list = SIMING.readJson('tools.json');
        } catch (e) {
            root.textContent = 'SIMING : liste des outils illisible (' + e.message + ')';
            return null;
        }

        const evalScript = cs
            ? (script, cb) => cs.evalScript(script, cb)
            : (script, cb) => cb('EvalScript error.');
        const bridge = SIMING.bridge = SIMING.createBridge(evalScript);

        for (const tool of list.tools) {
            try { await SIMING.loadScript(tool.script); } catch (e) { errors.push(e.message); }
        }

        try {
            const extRoot = cs ? cs.getSystemPath(global.SystemPath.EXTENSION) : '';
            const host = await bridge.call('siming', 'init', { root: extRoot });
            if (host && host.errors) errors.push(...host.errors);
        } catch (e) {
            errors.push('Cœur hôte : ' + e.message);
        }

        let app;
        try {
            app = mode === 'standalone'
                ? SIMING.startStandalone({ root, list, bridge, toolId: SIMING.standaloneToolId(cs) })
                : SIMING.startHub({ root, list, bridge, openExtension: cs ? (id) => cs.requestOpenExtension(id, '') : null });
            await app.ready;
        } catch (e) {
            // Sans cela, une erreur ici laisse un panneau vide sans explication.
            root.textContent = 'SIMING : démarrage impossible (' + e.message + ')';
            return null;
        }
        if (errors.length) app.status.set(errors.join(' · '), 'warn');
        return app;
    };
})(window);
