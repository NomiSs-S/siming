/*
 * SIMING : serveur MCP local du service Claude Code, réglages partagés avec le hub,
 * attente d'une frame rendue. Les modules Node (http, fs, path, crypto) sont passés en
 * argument : rien ici ne dépend de CEP.
 *
 *   const srv = SIMING.mcp.createServer({ http, port, token, handle });
 *   await srv.start();  …  await srv.stop();
 *
 * Sécurité : écoute 127.0.0.1 seulement, une seule adresse (POST /mcp). Refusé : un autre
 * nom d'hôte (rebinding DNS), toute requête de navigateur (en-tête Origin), un jeton
 * absent ou faux. Le jeton est dans le fichier de réglages de l'utilisateur.
 */
(function (global) {
    'use strict';

    const SIMING = global.SIMING = global.SIMING || {};
    const mcp = SIMING.mcp = SIMING.mcp || {};

    mcp.SERVER_NAME = 'siming';             // nom du serveur dans Claude Code
    mcp.SERVICE_ID = 'com.siming.mcp';      // extension invisible qui fait tourner le service
    mcp.DEFAULT_PORT = 47821;
    mcp.PATH = '/mcp';
    mcp.MAX_BODY = 8 * 1024 * 1024;

    /** Événements CEP entre le hub et le service (portée APPLICATION, données JSON). */
    mcp.EVENTS = {
        reload: 'com.siming.mcp.reload',       // hub -> service : relire les réglages
        ping: 'com.siming.mcp.ping',           // hub -> service : renvoyer l'état
        state: 'com.siming.mcp.state',         // service -> hub : { enabled, running, port, error, errorCode, calls }
        activity: 'com.siming.mcp.activity',   // service -> hub : { text, level } après chaque appel de Claude
    };

    /** Données d'un événement CEP : selon la version, texte JSON ou objet déjà lu. */
    mcp.eventData = function (event) {
        const d = event && event.data;
        if (typeof d !== 'string') return d || null;
        try { return d ? JSON.parse(d) : null; } catch (e) { return null; }
    };

    // --- Contrôle des requêtes ------------------------------------------------------

    /** Comparaison en temps constant (le jeton ne se devine pas caractère par caractère). */
    function sameText(a, b) {
        a = String(a);
        b = String(b);
        let diff = a.length ^ b.length;
        for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
        return diff === 0;
    }

    const LOCAL_HOST = /^(127\.0\.0\.1|localhost)(:\d+)?$/i;

    /** null si la requête est admise, sinon { status, message }. headers : noms en minuscules (Node). */
    mcp.checkRequest = function (headers, token) {
        const h = headers || {};
        if (!LOCAL_HOST.test(String(h.host || ''))) return { status: 403, message: 'Hôte refusé : ' + (h.host || '(aucun)') };
        if (h.origin) return { status: 403, message: 'Requête de navigateur refusée' };
        if (!token || !sameText(h.authorization || '', 'Bearer ' + token)) {
            return { status: 403, message: 'Jeton SIMING absent ou faux : recopie la commande de SIMING › Réglages › Claude' };
        }
        return null;
    };

    // --- Serveur HTTP -----------------------------------------------------------------

    mcp.createServer = function ({ http, port, token, handle }) {
        let server = null;
        const sockets = new Set();

        function send(res, status, body, headers) {
            const text = body === null || body === undefined ? '' : JSON.stringify(body);
            res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers || {}));
            res.end(text);
        }

        async function answer(res, body) {
            let msg;
            try {
                msg = JSON.parse(body);
            } catch (e) {
                send(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON illisible' } });
                return;
            }
            try {
                if (Array.isArray(msg)) {
                    const out = (await Promise.all(msg.map((m) => handle(m)))).filter(Boolean);
                    if (out.length) send(res, 200, out);
                    else send(res, 202, null);
                    return;
                }
                const r = await handle(msg);
                if (r) send(res, 200, r);
                else send(res, 202, null);
            } catch (e) {
                send(res, 500, { jsonrpc: '2.0', id: null, error: { code: -32603, message: (e && e.message) || String(e) } });
            }
        }

        function onRequest(req, res) {
            const url = String(req.url || '').split('?')[0];
            if (url !== mcp.PATH) { send(res, 404, { error: 'Adresse inconnue : ' + url + ' (service MCP sur ' + mcp.PATH + ')' }); return; }
            const refused = mcp.checkRequest(req.headers, token);
            if (refused) { send(res, refused.status, { error: refused.message }); return; }
            if (req.method !== 'POST') { send(res, 405, { error: 'POST seulement' }, { Allow: 'POST' }); return; }
            let body = '', size = 0, tooBig = false;
            req.setEncoding('utf8');
            req.on('data', (chunk) => {
                if (tooBig) return;
                size += chunk.length;
                if (size > mcp.MAX_BODY) {
                    tooBig = true;
                    send(res, 413, { error: 'Requête trop grosse' });
                    req.destroy();
                    return;
                }
                body += chunk;
            });
            req.on('end', () => { if (!tooBig) answer(res, body); });
        }

        return {
            port,
            token,
            get listening() { return !!server; },
            /** Ouvre le port ; rejette (err.code = 'EADDRINUSE'…) s'il est pris. Rend le port écouté. */
            start() {
                return new Promise((resolve, reject) => {
                    const s = http.createServer(onRequest);
                    s.on('connection', (sock) => {
                        sockets.add(sock);
                        sock.on('close', () => sockets.delete(sock));
                    });
                    s.once('error', reject);
                    s.listen(port, '127.0.0.1', () => {
                        s.removeListener('error', reject);
                        server = s;
                        resolve(s.address().port);
                    });
                });
            },
            /** Ferme le port et coupe les connexions gardées ouvertes par le client. */
            stop() {
                return new Promise((resolve) => {
                    if (!server) { resolve(); return; }
                    const s = server;
                    server = null;
                    s.close(() => resolve());
                    for (const sock of sockets) sock.destroy();
                    sockets.clear();
                });
            },
        };
    };

    // --- Réglages (fichier partagé par le hub et le service) ------------------------------

    /** <données de l'utilisateur>/SIMING/claude.json (CEP : SystemPath.USER_DATA). */
    mcp.configFile = function (path, userData) {
        return path.join(userData, 'SIMING', 'claude.json');
    };

    /** { enabled, port, token } ; défauts si le fichier manque ou est illisible. */
    mcp.readConfig = function (fs, file) {
        let raw = {};
        try { raw = JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch (e) { raw = {}; }
        const port = Number(raw.port);
        return {
            enabled: raw.enabled === true,
            port: (Number.isInteger(port) && port >= 1024 && port <= 65535) ? port : mcp.DEFAULT_PORT,
            token: (typeof raw.token === 'string' && /^[0-9a-f]{32,128}$/.test(raw.token)) ? raw.token : '',
        };
    };

    /** Écrit les réglages (lisibles par l'utilisateur seul quand le système le permet). */
    mcp.writeConfig = function (fs, path, file, cfg) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify({ enabled: !!cfg.enabled, port: cfg.port, token: cfg.token }, null, 2), { encoding: 'utf8', mode: 0o600 });
    };

    mcp.newToken = function (crypto) {
        return crypto.randomBytes(24).toString('hex');
    };

    /** Port libre au hasard (47000-48999) quand celui des réglages est pris. */
    mcp.otherPort = function (current, random) {
        let p = current;
        while (p === current) p = 47000 + Math.floor((random || Math.random)() * 2000);
        return p;
    };

    mcp.url = function (cfg) {
        return 'http://127.0.0.1:' + cfg.port + mcp.PATH;
    };

    /** Commande à coller une fois dans un terminal (Windows, macOS : mêmes guillemets). */
    mcp.addCommand = function (cfg) {
        return 'claude mcp add --scope user --transport http ' + mcp.SERVER_NAME + ' ' + mcp.url(cfg) +
            ' --header "Authorization: Bearer ' + cfg.token + '"';
    };

    mcp.removeCommand = function () {
        return 'claude mcp remove --scope user ' + mcp.SERVER_NAME;
    };

    // --- Frame rendue -----------------------------------------------------------------

    const PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    const PNG_END = [0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82];   // bloc IEND et son CRC

    /** PNG complet : signature au début, bloc IEND à la fin (After Effects peut écrire après le retour du script). */
    mcp.isCompletePng = function (buf) {
        if (!buf || buf.length < 33 + PNG_END.length) return false;
        for (let i = 0; i < PNG_SIGNATURE.length; i++) if (buf[i] !== PNG_SIGNATURE[i]) return false;
        const end = buf.length - PNG_END.length;
        for (let i = 0; i < PNG_END.length; i++) if (buf[end + i] !== PNG_END[i]) return false;
        return true;
    };

    /** Largeur et hauteur d'un PNG (bloc IHDR). */
    mcp.pngSize = function (buf) {
        const at = (o) => ((buf[o] << 24) | (buf[o + 1] << 16) | (buf[o + 2] << 8) | buf[o + 3]) >>> 0;
        return { width: at(16), height: at(20) };
    };

    /** Attend que le PNG soit entièrement écrit ; rend son contenu (Buffer). */
    mcp.waitForPng = function (fs, file, opts) {
        const timeoutMs = (opts && opts.timeoutMs) || 30000;
        const every = (opts && opts.intervalMs) || 100;
        const started = Date.now();
        return new Promise((resolve, reject) => {
            (function poll() {
                let buf = null;
                try { buf = fs.readFileSync(file); } catch (e) { buf = null; }
                if (mcp.isCompletePng(buf)) { resolve(buf); return; }
                if (Date.now() - started > timeoutMs) {
                    reject(new Error('frame pas rendue au bout de ' + Math.round(timeoutMs / 1000) + ' s (' + file + ')'));
                    return;
                }
                global.setTimeout(poll, every);
            })();
        });
    };
})(window);
