/*
 * SIMING : service Claude Code. Tourne dans l'extension invisible com.siming.mcp (page
 * claude.html), démarrée avec After Effects ou à la demande du hub.
 *
 * Lit les réglages (écrits par Réglages › Claude du hub), ouvre ou ferme le serveur MCP
 * local, et dialogue avec le hub par événements CEP (SIMING.mcp.EVENTS) :
 *   reçoit  reload (relire les réglages), ping (renvoyer l'état) ;
 *   publie  state (après chaque changement), activity (après chaque appel de Claude).
 *
 *   SIMING.mcp.startService({ cs, req, readJson? }) -> Promise(service)
 *   service : { apply(), state, stop() }
 */
(function (global) {
    'use strict';

    const SIMING = global.SIMING;
    const mcp = SIMING.mcp;

    /** Promesse rejetée si p ne répond pas à temps : After Effects bloqué (boîte de dialogue, rendu). */
    mcp.withTimeout = function (p, ms) {
        let timer = null;
        const late = new Promise((resolve, reject) => {
            timer = global.setTimeout(() => reject(new Error('After Effects n\'a pas répondu en ' + Math.round(ms / 1000) +
                ' s (boîte de dialogue ouverte, rendu en cours ?). L\'action peut encore s\'exécuter quand il sera libre : vérifie avant de la relancer.')), ms);
        });
        return Promise.race([p, late]).finally(() => global.clearTimeout(timer));
    };

    /** Image à envoyer : le PNG tel quel s'il est assez petit, sinon réduit par un canevas
     *  (PNG, ou JPEG s'il reste trop lourd). */
    mcp.MAX_IMAGE_BYTES = 3.5 * 1024 * 1024;

    mcp.shrinkPng = function (doc, buf, maxSize) {
        const size = mcp.pngSize(buf);
        const base64 = buf.toString('base64');
        if (size.width <= maxSize && size.height <= maxSize && base64.length <= mcp.MAX_IMAGE_BYTES) {
            return Promise.resolve({ data: base64, mimeType: 'image/png', width: size.width, height: size.height });
        }
        return new Promise((resolve, reject) => {
            const img = new (doc.defaultView.Image)();
            img.onload = () => {
                const k = Math.min(1, maxSize / Math.max(img.width, img.height));
                const canvas = doc.createElement('canvas');
                canvas.width = Math.max(1, Math.round(img.width * k));
                canvas.height = Math.max(1, Math.round(img.height * k));
                const g = canvas.getContext('2d');
                if (!g) { reject(new Error('réduction de l\'image impossible (pas de canevas)')); return; }
                g.drawImage(img, 0, 0, canvas.width, canvas.height);
                let url = canvas.toDataURL('image/png');
                if (url.length > mcp.MAX_IMAGE_BYTES) url = canvas.toDataURL('image/jpeg', 0.85);
                resolve({ data: url.slice(url.indexOf(',') + 1), mimeType: url.slice(5, url.indexOf(';')), width: canvas.width, height: canvas.height });
            };
            img.onerror = () => reject(new Error('PNG illisible'));
            img.src = 'data:image/png;base64,' + base64;
        });
    };

    mcp.startService = async function (opts) {
        const o = opts || {};
        let cs = o.cs;
        if (!cs) { try { cs = new global.CSInterface(); } catch (e) { cs = null; } }
        const req = o.req || SIMING.nodeRequire();
        if (!cs || !req) return null;   // hors After Effects ou sans Node : rien à servir
        const fs = req('fs'), http = req('http'), path = req('path');
        const file = mcp.configFile(path, cs.getSystemPath(global.SystemPath.USER_DATA));
        const bridge = SIMING.createBridge((script, cb) => cs.evalScript(script, cb));
        const readJson = o.readJson || SIMING.readJson;
        let version = '0.0.0';
        try { version = readJson('tools.json').version; } catch (e) { /* version inconnue */ }

        const state = { enabled: false, running: false, port: null, error: null, errorCode: null, calls: 0, version };
        let server = null;
        let hostError = null;

        function emit(type, data) {
            try {
                const ev = new global.CSEvent(type, 'APPLICATION');
                ev.data = JSON.stringify(data);
                cs.dispatchEvent(ev);
            } catch (e) { /* hub absent : rien à prévenir */ }
        }
        const publish = () => emit(mcp.EVENTS.state, state);

        try {
            await bridge.call('siming', 'init', { root: cs.getSystemPath(global.SystemPath.EXTENSION) });
        } catch (e) {
            hostError = 'Cœur hôte : ' + e.message;
        }

        const call = (tool, fn, args, callOpts) => mcp.withTimeout(bridge.call(tool, fn, args),
            (callOpts && callOpts.timeoutMs) || mcp.DEFAULT_TIMEOUT * 1000);

        async function capture(a) {
            const r = await call('mcp', 'frame', { compId: a.compId, time: a.time });
            const buf = await mcp.waitForPng(fs, r.path, { timeoutMs: 30000 });
            try { fs.unlinkSync(r.path); } catch (e) { /* le cœur hôte la retirera au prochain rendu */ }
            const rendered = mcp.pngSize(buf);
            const img = await mcp.shrinkPng(global.document, buf, a.maxSize || mcp.CAPTURE_SIZE);
            return {
                info: { comp: r.comp, time: r.time, frame: r.frame, rendered: [rendered.width, rendered.height], sent: [img.width, img.height] },
                data: img.data, mimeType: img.mimeType,
            };
        }

        const handle = mcp.createHandler({
            call, capture, version,
            onActivity: (a) => { state.calls++; emit(mcp.EVENTS.activity, a); },
        });

        // Réglages appliqués l'un après l'autre (deux clics rapides dans le hub)
        let busy = Promise.resolve();
        async function applyNow() {
            const cfg = mcp.readConfig(fs, file);
            const wanted = cfg.enabled && !!cfg.token;
            if (server && (!wanted || server.port !== cfg.port || server.token !== cfg.token)) {
                await server.stop();
                server = null;
            }
            state.error = hostError;
            state.errorCode = null;
            if (wanted && !server) {
                const s = mcp.createServer({ http, port: cfg.port, token: cfg.token, handle });
                try {
                    await s.start();
                    server = s;
                } catch (e) {
                    state.errorCode = e.code || 'ERROR';
                    state.error = e.code === 'EADDRINUSE'
                        ? 'Port ' + cfg.port + ' déjà pris par un autre programme'
                        : 'Serveur : ' + e.message;
                }
            }
            state.enabled = cfg.enabled;
            state.running = !!server;
            state.port = server ? cfg.port : null;
            publish();
        }
        function apply() {
            busy = busy.then(applyNow, applyNow);
            return busy;
        }

        cs.addEventListener(mcp.EVENTS.reload, () => { apply(); });
        cs.addEventListener(mcp.EVENTS.ping, publish);
        await apply();

        return {
            state,
            apply,
            handle,
            stop: async () => { if (server) await server.stop(); server = null; state.running = false; },
        };
    };
})(window);
