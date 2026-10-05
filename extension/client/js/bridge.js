/*
 * SIMING : pont entre le panneau et le cœur hôte ExtendScript.
 * Seul fichier qui appelle evalScript : à réécrire (même API) pour un passage à UXP.
 *
 *   const bridge = SIMING.createBridge((script, cb) => cs.evalScript(script, cb));
 *   bridge.call('unparent', 'detach', { compId, targetId, ids }).then((state) => …);
 *
 * Aller : arguments en JSON puis encodeURIComponent (aucun texte brut dans le script).
 * Retour : enveloppe { ok, data } | { ok: false, error: { message, line } }, encodée.
 */
(function (global) {
    'use strict';

    const SIMING = global.SIMING = global.SIMING || {};

    SIMING.createBridge = function (evalScript) {
        return {
            call(toolId, fnName, args) {
                const encoded = encodeURIComponent(JSON.stringify(args || {}));
                const script = 'SIMING.call(' + JSON.stringify(String(toolId)) + ',' +
                    JSON.stringify(String(fnName)) + ',"' + encoded + '")';
                return new Promise((resolve, reject) => {
                    evalScript(script, (result) => {
                        if (typeof result !== 'string' || result === 'EvalScript error.') {
                            reject(new Error('Erreur du script hôte'));
                            return;
                        }
                        let env;
                        try {
                            env = JSON.parse(decodeURIComponent(result));
                        } catch (e) {
                            reject(new Error('Réponse illisible du script hôte'));
                            return;
                        }
                        if (env && env.ok) resolve(env.data);
                        else reject(new Error((env && env.error && env.error.message) || 'Erreur inconnue du script hôte'));
                    });
                });
            },
        };
    };
})(window);
