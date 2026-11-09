/*
 * SIMING : protocole MCP du service Claude Code (JSON-RPC 2.0, transport HTTP « streamable »
 * sans flux SSE : chaque POST reçoit sa réponse JSON). Ni navigateur ni Node : testé tel quel.
 *
 *   const handle = SIMING.mcp.createHandler({ call, capture, version, onActivity });
 *   const response = await handle(message);   // null pour une notification
 *
 *   call(tool, fn, args, { timeoutMs }) -> Promise(données) : cœur hôte (pont + délai d'attente)
 *   capture({ compId, time, maxSize }) -> Promise({ info, data, mimeType }) : frame en image
 *   onActivity({ tool, text, level }) : chaque appel d'outil terminé (ligne de statut du hub)
 */
(function (global) {
    'use strict';

    const SIMING = global.SIMING = global.SIMING || {};
    const mcp = SIMING.mcp = SIMING.mcp || {};

    mcp.PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];   // la plus récente d'abord
    mcp.MAX_TEXT = 120000;          // caractères d'une réponse texte
    mcp.DEFAULT_TIMEOUT = 60;       // secondes
    mcp.CAPTURE_SIZE = 1568;        // grand côté d'une frame envoyée (taille utile pour Claude)

    mcp.INSTRUCTIONS = [
        'Tu pilotes After Effects, ouvert sur l\'ordinateur de l\'utilisateur, à travers l\'extension SIMING.',
        '- Lis d\'abord : get_project (éléments, comp active), get_comp (calques, sélection), get_properties (arbre d\'un calque, matchNames, keyframes).',
        '- Agis avec run_extendscript : du code ExtendScript exécuté d\'un bloc dans After Effects, dans un seul groupe d\'annulation « Claude : <undoName> » (Ctrl+Z ou Cmd+Z l\'annule d\'un coup). Un appel par étape logique, avec un undoName parlant.',
        '- ExtendScript = JavaScript ES3 : var seulement (ni let ni const), pas de fonctions fléchées ni de gabarits `…`, pas de forEach / map / filter / indexOf sur les tableaux, pas de JSON, pas de trim. Calques et éléments du projet sont numérotés à partir de 1. Les matchNames (« ADBE Position ») marchent quelle que soit la langue d\'After Effects, les noms affichés non.',
        '- Vérifie : relis avec get_comp ou get_properties, et regarde l\'image avec capture_frame quand le rendu compte.',
        '- Les gestes SIMING (lissage, ancrage, aligner, répartir, séquencer, null, fond, formats…) passent par siming_tool ; ils agissent sur la comp active et sa sélection.',
        '- N\'ouvre jamais de boîte de dialogue (alert, confirm, prompt, fenêtre ScriptUI) : After Effects resterait bloqué. Écris avec log().',
        '- Demande à l\'utilisateur avant une action lourde ou difficile à défaire : enregistrer, fermer ou ouvrir un projet, supprimer des éléments du projet, écrire ou effacer des fichiers, lancer un rendu, quitter After Effects.',
        '- SVG : After Effects 2026 peut planter (moteur SVG, polices) en dessinant un SVG importé qui contient du texte. N\'importe que des SVG sans texte (texte retiré ou vectorisé) et recrée les textes en calques texte. Essaie d\'abord un seul fichier.',
        '- Un plantage d\'After Effects perd tout ce qui n\'est pas enregistré : avant un import de nombreux fichiers ou une construction longue, propose à l\'utilisateur d\'enregistrer.',
        '- Si la connexion à siming se coupe d\'un coup (connexion fermée, aucune réponse), After Effects a sans doute planté : dis-le à l\'utilisateur et attends qu\'il le relance, sans réessayer en boucle.',
    ].join('\n');

    mcp.SYNTAX_HINT = 'Rappel : ExtendScript est en ES3 (var seulement, pas de =>, de gabarits `…`, de let / const, ni de forEach, map, filter, indexOf, JSON, trim).';

    /** Gestes SIMING joignables par siming_tool : outil -> action -> arguments et effet. */
    mcp.GESTURES = {
        quicktools: {
            ease: '{ mode: "in" | "out" | "both", influence: 0.1-100 } lisse les keyframes sélectionnées (Bézier, vitesse 0). « in » = départ du mouvement (côté sortant de la keyframe), « out » = arrivée',
            elastic: '{} pose l\'expression Elastic (et son effet de réglage) sur les propriétés animées sélectionnées',
            elasticRemove: '{} retire l\'expression Elastic des propriétés sélectionnées',
            anchor: '{ cell: 1-9 } point d\'ancrage des calques sélectionnés sur leur boîte visible, comme le pavé numérique (7 = haut gauche, 5 = centre, 3 = bas droite) ; rien ne bouge à l\'image',
            align: '{ edge: "left" | "centerX" | "right" | "top" | "centerY" | "bottom", relative: "selection" | "comp" } aligne les calques sélectionnés (un seul : sur la comp)',
            distribute: '{ edge } répartit les calques sélectionnés (au moins 3)',
        },
        toolbox: {
            sequence: '{ target: "layers" | "keys", mode: "cascade" | "reverse" | "random", gap: écart en images, group: par paquets de } décale dans le temps les calques ou keyframes sélectionnés',
            nullFor: '{} null au centre des calques sélectionnés, relié à eux',
            background: '{ color: "#RRGGBB" } calque de forme « Fond » tout en bas, qui suit la taille de la comp',
            format: '{ ratio: "16:9" | "4:5" | "1:1" | "9:16" } change le format de la comp, contenu recentré',
            duplicateFormats: '{ ratio? } déclinaisons de la comp dans d\'autres formats (toutes sans ratio)',
            workArea: '{ mode: "selection" | "trim" } zone de travail sur les calques sélectionnés, ou rogner la comp à sa zone de travail',
            cropToLayers: '{} recadre la comp sur la boîte visible des calques sélectionnés',
            bakeExpressions: '{} convertit en keyframes les expressions actives (propriétés sélectionnées, sinon calques sélectionnés)',
            revealSource: '{} sélectionne la source des calques sélectionnés dans le panneau Projet',
            convertPsdText: '{} convertit en texte modifiable les calques texte d\'un Photoshop importé',
        },
    };

    function gestureCatalog() {
        const lines = [];
        for (const tool of Object.keys(mcp.GESTURES)) {
            for (const action of Object.keys(mcp.GESTURES[tool])) lines.push('- ' + tool + ' / ' + action + ' ' + mcp.GESTURES[tool][action]);
        }
        return lines.join('\n');
    }

    const READ_ONLY = { readOnlyHint: true, openWorldHint: false };
    const COMP_ID = { type: 'integer', description: 'id de la composition (voir get_project) ; par défaut la comp active' };
    const TIME = { type: 'number', description: 'instant en secondes (temps de la comp) ; par défaut la tête de lecture' };

    /** Outils MCP. `host` : fonction du cœur hôte appelée telle quelle (outils de lecture). */
    mcp.TOOLS = [
        {
            name: 'get_project',
            title: 'Projet After Effects',
            description: 'Aperçu du projet ouvert dans After Effects : fichier, élément actif, sélection du panneau Projet, et ses éléments (id, nom, nature, dossier ; taille, durée, cadence et nombre de calques des comps ; fichier des métrages). Filtres facultatifs.',
            inputSchema: {
                type: 'object',
                properties: {
                    kind: { type: 'string', enum: ['comp', 'folder', 'solid', 'image', 'video', 'audio', 'placeholder', 'other'], description: 'ne garder qu\'une nature d\'élément' },
                    name: { type: 'string', description: 'ne garder que les éléments dont le nom contient ce texte (sans casse)' },
                    limit: { type: 'integer', minimum: 1, maximum: 2000, description: 'nombre maximal d\'éléments (300 par défaut)' },
                },
            },
            annotations: READ_ONLY,
            host: 'project',
        },
        {
            name: 'get_comp',
            title: 'Composition',
            description: 'Une composition (la comp active par défaut) : format, durée, cadence, tête de lecture, zone de travail ; chaque calque (index, id, nom, nature, parent, source, temps, interrupteurs qui diffèrent du défaut, étiquette, transformation à l\'instant donné, effets avec leur matchName, masques, propriétés animées avec leur nombre de keyframes, expressions actives) ; la sélection (calques, propriétés, keyframes).',
            inputSchema: {
                type: 'object',
                properties: {
                    compId: COMP_ID,
                    time: TIME,
                    limit: { type: 'integer', minimum: 1, maximum: 1000, description: 'nombre maximal de calques (200 par défaut)' },
                },
            },
            annotations: READ_ONLY,
            host: 'comp',
        },
        {
            name: 'get_properties',
            title: 'Propriétés d\'un calque',
            description: 'Arbre des propriétés d\'un calque : nom affiché, matchName (à utiliser dans le code), index, valeur à l\'instant donné, nombre de keyframes, expression. path descend dans un groupe (noms, matchNames ou index, ex. ["ADBE Transform Group", "ADBE Position"] ou ["ADBE Effect Parade", 1]) ; keys: true détaille les keyframes (temps, valeur, interpolations, ease).',
            inputSchema: {
                type: 'object',
                properties: {
                    compId: COMP_ID,
                    layerIndex: { type: 'integer', minimum: 1, description: 'index du calque (1 = en haut de la pile)' },
                    layerId: { type: 'integer', description: 'id du calque (stable quand on réordonne)' },
                    layerName: { type: 'string', description: 'nom du calque (unique dans la comp)' },
                    path: { type: 'array', items: { type: ['string', 'integer'] }, description: 'chemin depuis le calque : noms, matchNames ou index' },
                    depth: { type: 'integer', minimum: 1, maximum: 10, description: 'niveaux dépliés (3 par défaut)' },
                    keys: { type: 'boolean', description: 'détailler les keyframes' },
                    time: TIME,
                },
            },
            annotations: READ_ONLY,
            host: 'properties',
        },
        {
            name: 'run_extendscript',
            title: 'Exécuter dans After Effects',
            description: 'Exécute du code ExtendScript (JavaScript ES3) dans After Effects : tout ce qu\'un script peut faire (créer comps, calques, formes, textes, effets, keyframes, expressions, masques, rendu…). Le code est le corps d\'une fonction : `return` renvoie une valeur (données simples ; un objet d\'After Effects revient décrit par { $type, name, index, id }), `log(…)` écrit une ligne dans le journal rendu avec le résultat. Tout le code forme un seul groupe d\'annulation « Claude : <undoName> ». ES3 : ni let / const, ni =>, ni gabarits, ni forEach / map / filter / indexOf, ni JSON ; index à partir de 1 ; jamais alert / confirm / prompt. Aides SIMING dans la variable globale SIMING : SIMING.ae.getActiveComp(), SIMING.ae.findCompById(id), SIMING.ae.findLayerById(comp, id), SIMING.ae.layerBox(layer, time)… $.global garde des valeurs d\'un appel à l\'autre.',
            inputSchema: {
                type: 'object',
                properties: {
                    code: { type: 'string', description: 'corps de fonction ExtendScript' },
                    undoName: { type: 'string', description: 'nom court de l\'action, visible dans Édition › Annuler (ex. « Titre animé »)' },
                    timeoutSeconds: { type: 'integer', minimum: 5, maximum: 600, description: 'attente maximale de la réponse (60 par défaut)' },
                },
                required: ['code'],
            },
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
        },
        {
            name: 'capture_frame',
            title: 'Voir une frame',
            description: 'Rend une frame d\'une composition et la renvoie en image (réduite à maxSize pixels sur le grand côté), pour vérifier visuellement un résultat. After Effects doit autoriser les scripts à écrire des fichiers (Préférences › Scripts et expressions).',
            inputSchema: {
                type: 'object',
                properties: {
                    compId: COMP_ID,
                    time: TIME,
                    maxSize: { type: 'integer', minimum: 256, maximum: 2048, description: 'grand côté maximal en pixels (' + mcp.CAPTURE_SIZE + ' par défaut)' },
                },
            },
            annotations: READ_ONLY,
        },
        {
            name: 'siming_tool',
            title: 'Geste SIMING',
            description: 'Joue un geste des outils SIMING sur la comp active et sa sélection, comme un clic dans le panneau (un groupe d\'annulation). Prépare d\'abord la sélection avec run_extendscript : comp.openInViewer(), layer.selected = true, prop.selected = true, prop.setSelectedAtKey(k, true). Gestes (outil / action arguments) :\n' + gestureCatalog(),
            inputSchema: {
                type: 'object',
                properties: {
                    tool: { type: 'string', enum: Object.keys(mcp.GESTURES) },
                    action: { type: 'string', description: 'nom du geste, ex. ease' },
                    args: { type: 'object', description: 'arguments du geste' },
                },
                required: ['tool', 'action'],
            },
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
        },
    ];

    // --- Réponses ----------------------------------------------------------------

    function rpcError(code, message) {
        return Object.assign(new Error(message), { rpcCode: code });
    }

    /** Résultat texte : données en JSON, tronquées au-delà de MAX_TEXT. */
    function textResult(data, isError) {
        let text = typeof data === 'string' ? data : JSON.stringify(data === undefined ? null : data);
        if (text.length > mcp.MAX_TEXT) {
            text = text.slice(0, mcp.MAX_TEXT) + '\n… (réponse tronquée : ' + (text.length - mcp.MAX_TEXT) +
                ' caractères de plus ; affine la demande : limit, depth, path, compId)';
        }
        const r = { content: [{ type: 'text', text }] };
        if (isError) r.isError = true;
        return r;
    }

    function errorResult(message) { return textResult('Erreur : ' + message, true); }

    function isObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

    function clampInt(v, min, max, fallback) {
        const n = Math.round(Number(v));
        return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
    }

    /** Texte d'un échec de run_extendscript : message, ligne, rappel ES3, changements restés, journal. */
    function runFailure(r) {
        const parts = ['Erreur : ' + r.error + (r.line ? ' (ligne ' + r.line + ')' : '')];
        if (r.syntax) parts.push(mcp.SYNTAX_HINT);
        if (r.undo) parts.push('Ce qui a été fait avant l\'erreur reste en place, dans le groupe « ' + r.undo + ' » : l\'utilisateur peut l\'annuler par Ctrl+Z (Cmd+Z), ou corrige-le par un autre appel.');
        if (r.logs && r.logs.length) parts.push('Journal :\n' + r.logs.join('\n'));
        return textResult(parts.join('\n'), true);
    }

    function activityLabel(name, args) {
        switch (name) {
            case 'get_project': return 'lit le projet';
            case 'get_comp': return 'lit une composition';
            case 'get_properties': return 'lit les propriétés d\'un calque';
            case 'capture_frame': return 'regarde une frame';
            case 'siming_tool': return 'geste ' + String(args.tool) + ' / ' + String(args.action);
            case 'run_extendscript': return String(args.undoName || '').trim() || 'exécute un script';
            default: return name;
        }
    }

    // --- Gestionnaire ----------------------------------------------------------------

    mcp.createHandler = function ({ call, capture, version, onActivity }) {
        // Un appel d'outil à la fois : After Effects n'exécute qu'un script à la fois,
        // et le délai d'attente d'un appel ne court qu'à partir de son tour.
        let chain = Promise.resolve();
        function queued(fn) {
            const run = chain.then(fn, fn);
            chain = run.catch(() => {});
            return run;
        }

        const timeoutOf = (args) => clampInt(args.timeoutSeconds, 5, 600, mcp.DEFAULT_TIMEOUT) * 1000;

        const runners = {
            async run_extendscript(args) {
                const code = typeof args.code === 'string' ? args.code : '';
                if (!code.trim()) return errorResult('code manquant : le corps de fonction ExtendScript à exécuter');
                const r = await call('mcp', 'run', { code, undoName: args.undoName || '' }, { timeoutMs: timeoutOf(args) });
                if (!r || !r.ok) return runFailure(r || { error: 'réponse vide du cœur hôte' });
                const out = { value: r.value, undo: r.undo };
                if (r.logs && r.logs.length) out.logs = r.logs;
                return textResult(out);
            },
            async capture_frame(args) {
                if (typeof capture !== 'function') return errorResult('capture indisponible dans ce service');
                const r = await capture({
                    compId: args.compId, time: args.time,
                    maxSize: clampInt(args.maxSize, 256, 2048, mcp.CAPTURE_SIZE),
                });
                return { content: [{ type: 'text', text: JSON.stringify(r.info) }, { type: 'image', data: r.data, mimeType: r.mimeType }] };
            },
            async siming_tool(args) {
                const gestures = mcp.GESTURES[args.tool];
                if (!gestures || !Object.prototype.hasOwnProperty.call(gestures, args.action)) {
                    return errorResult('geste inconnu : ' + args.tool + ' / ' + args.action + '. Gestes :\n' + gestureCatalog());
                }
                const r = await call(args.tool, args.action, isObject(args.args) ? args.args : {}, { timeoutMs: timeoutOf(args) });
                const st = r && r.status;
                return textResult(st ? { status: st, report: r.report || null } : r, !!(st && st.level === 'error'));
            },
        };

        async function callTool(name, rawArgs) {
            const def = mcp.TOOLS.find((t) => t.name === name);
            if (!def) throw rpcError(-32602, 'Outil inconnu : ' + name);
            const args = isObject(rawArgs) ? rawArgs : {};
            let result;
            try {
                result = await queued(() => (def.host
                    ? call('mcp', def.host, args, { timeoutMs: timeoutOf(args) }).then((data) => textResult(data))
                    : runners[name](args)));
            } catch (e) {
                result = errorResult((e && e.message) || String(e));
            }
            if (onActivity) {
                try {
                    onActivity({ tool: name, text: 'Claude : ' + activityLabel(name, args), level: result.isError ? 'warn' : 'ok' });
                } catch (e) { /* le statut n'empêche pas de répondre */ }
            }
            return result;
        }

        async function dispatch(method, params) {
            switch (method) {
                case 'initialize': {
                    const asked = params && params.protocolVersion;
                    return {
                        protocolVersion: mcp.PROTOCOL_VERSIONS.includes(asked) ? asked : mcp.PROTOCOL_VERSIONS[0],
                        capabilities: { tools: { listChanged: false } },
                        serverInfo: { name: mcp.SERVER_NAME || 'siming', title: 'SIMING (After Effects)', version: String(version || '0.0.0') },
                        instructions: mcp.INSTRUCTIONS,
                    };
                }
                case 'ping':
                    return {};
                case 'tools/list':
                    return { tools: mcp.TOOLS.map(({ host, ...pub }) => pub) };
                case 'tools/call':
                    return callTool(params && params.name, params && params.arguments);
                default:
                    throw rpcError(-32601, 'Méthode inconnue : ' + method);
            }
        }

        return async function handle(msg) {
            if (!isObject(msg)) return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Requête invalide' } };
            const hasId = Object.prototype.hasOwnProperty.call(msg, 'id') && msg.id !== null && msg.id !== undefined;
            if (typeof msg.method !== 'string') {
                // Réponse du client à une requête du serveur (il n'en envoie pas) : ignorée
                if ('result' in msg || 'error' in msg) return null;
                return { jsonrpc: '2.0', id: hasId ? msg.id : null, error: { code: -32600, message: 'Requête invalide : method manquant' } };
            }
            if (!hasId) return null;   // notification (initialized, cancelled…) : pas de réponse
            try {
                return { jsonrpc: '2.0', id: msg.id, result: await dispatch(msg.method, isObject(msg.params) ? msg.params : {}) };
            } catch (e) {
                return { jsonrpc: '2.0', id: msg.id, error: { code: e.rpcCode || -32603, message: e.message || String(e) } };
            }
        };
    };
})(window);
