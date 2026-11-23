/*
 * SIMING : onglet Claude, trouver et lancer Claude Code (abonnement de l'équipe, connexion
 * gardée par Claude Code lui-même). Modules Node passés en argument : testable sans CEP.
 *
 *   SIMING.claude.candidates(platform, env) -> chemins essayés
 *   SIMING.claude.findClaude({ fs, execFile, platform, env, configured }) -> Promise(chemin | null)
 *   SIMING.claude.buildArgs({ port, token, client, resume, model, systemPrompt }) -> arguments
 *   SIMING.claude.createSession({ spawn, file, args, cwd, env }) -> session
 *     session : { send(texte) -> bool, stop(), on(type | '*', fn), alive }
 *     événements : ceux de stream.js (ViewEvent), puis { type: 'exit', code, stderr } une fois
 *   SIMING.claude.loginCommand(platform, file) -> { file, args } : terminal qui lance claude
 *   SIMING.claude.SYSTEM_PROMPT : consignes ajoutées à celles du serveur MCP
 *
 * Claude Code tourne sans terminal : claude -p, entrée et sortie en flux JSON, seuls outils
 * ceux du serveur MCP SIMING (--tools "" coupe lecture / écriture de fichiers et shell).
 * Jamais --bare : il ne lit pas la connexion OAuth du compte.
 */
(function (global) {
    'use strict';

    const SIMING = global.SIMING = global.SIMING || {};
    const claude = SIMING.claude = SIMING.claude || {};

    claude.INSTALL_URL = 'https://docs.claude.com/en/docs/claude-code/setup';
    claude.MAX_STDERR = 4000;

    claude.SYSTEM_PROMPT = [
        'Tu travailles pour un motion designer, dans After Effects, depuis l\'onglet Claude de SIMING.',
        '- Chaque message commence par un bloc <contexte_ae> (projet, comp active, sélection) ; un bloc <observation> décrit un geste que l\'utilisateur vient de faire à la main : reproduis son résultat là où il te le demande.',
        '- Lis avant d\'agir (get_project, get_comp, get_properties) et fais comme il ferait : mêmes noms, même organisation, conventions du projet.',
        '- Un appel run_extendscript par étape logique, avec un undoName parlant : chacun s\'annule d\'un Ctrl+Z (Cmd+Z).',
        '- Pose tes questions avec l\'outil ask_user (choix cliquables quand c\'est possible), jamais en texte libre suivi d\'une action.',
        '- Demande avec ask_user avant une action lourde : enregistrer, fermer ou ouvrir un projet, supprimer des éléments, écrire des fichiers, lancer un rendu.',
        '- Tu n\'as accès qu\'à After Effects (outils siming) : ni fichiers ni commandes de l\'ordinateur.',
        '- Réponds en français, brièvement, en tutoyant.',
    ].join('\n');

    /** Chemins habituels de Claude Code (installeur officiel, npm, Homebrew). */
    claude.candidates = function (platform, env) {
        const e = env || {};
        if (platform === 'win32') {
            const out = [];
            if (e.USERPROFILE) out.push(e.USERPROFILE + '\\.local\\bin\\claude.exe');
            if (e.APPDATA) out.push(e.APPDATA + '\\npm\\claude.cmd');
            return out;
        }
        return (e.HOME ? [e.HOME + '/.local/bin/claude'] : []).concat(['/opt/homebrew/bin/claude', '/usr/local/bin/claude']);
    };

    function isFile(fs, p) {
        try { return !!p && fs.existsSync(p) && fs.statSync(p).isFile(); } catch (e) { return false; }
    }

    function run(execFile, file, args) {
        return new Promise((resolve) => {
            try {
                execFile(file, args, { windowsHide: true, timeout: 10000 }, (err, stdout) => resolve(err ? '' : String(stdout || '')));
            } catch (e) {
                resolve('');
            }
        });
    }

    /** Réglage « Chemin de Claude Code » s'il est rempli (seul essayé) ; sinon Windows : where,
     *  puis les chemins habituels ; macOS : chemins habituels, puis le PATH d'un shell de connexion. */
    claude.findClaude = async function ({ fs, execFile, platform, env, configured }) {
        const set = String(configured || '').trim();
        if (set) return isFile(fs, set) ? set : null;
        const lines = (out) => out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (platform === 'win32') {
            const found = lines(await run(execFile, 'where', ['claude']));
            const best = found.filter((p) => /\.(exe|cmd|bat)$/i.test(p)).concat(found).find((p) => isFile(fs, p));
            if (best) return best;
            return claude.candidates(platform, env).find((p) => isFile(fs, p)) || null;
        }
        const known = claude.candidates(platform, env).find((p) => isFile(fs, p));
        if (known) return known;
        const shell = lines(await run(execFile, '/bin/zsh', ['-lc', 'command -v claude'])).find((p) => isFile(fs, p));
        return shell || null;
    };

    claude.mcpConfig = function ({ port, token, client }) {
        return { mcpServers: { siming: { type: 'http', url: 'http://127.0.0.1:' + port + '/mcp',
            headers: { Authorization: 'Bearer ' + token, 'X-Siming-Client': client } } } };
    };

    claude.buildArgs = function (o) {
        const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
            '--include-partial-messages', '--strict-mcp-config', '--setting-sources', 'project,local',
            '--tools', '', '--allowedTools', 'mcp__siming__*',
            '--mcp-config', JSON.stringify(claude.mcpConfig(o)),
            '--append-system-prompt', o.systemPrompt || claude.SYSTEM_PROMPT];
        if (o.resume) args.push('--resume', String(o.resume));
        if (o.model) args.push('--model', String(o.model));
        return args;
    };

    /** Argument entre guillemets pour cmd.exe (un .cmd ne se lance que par le shell). */
    claude.quoteCmd = function (arg) {
        return '"' + String(arg).replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1') + '"';
    };

    claude.needsShell = (file) => /\.(cmd|bat)$/i.test(String(file || ''));

    claude.createSession = function ({ spawn, file, args, cwd, env }) {
        const handlers = {};
        let alive = false, ended = false, stderr = '', child = null;
        function fire(e) {
            for (const fn of (handlers[e.type] || []).concat(handlers['*'] || [])) {
                try { fn(e); } catch (err) { /* une vue cassée n'arrête pas le flux */ }
            }
        }
        function end(code, extra) {
            if (ended) return;
            ended = true;
            alive = false;
            if (extra) stderr = (stderr ? stderr + '\n' : '') + extra;
            fire({ type: 'exit', code: code === undefined ? null : code, stderr: stderr.trim() });
        }
        const split = claude.lineSplitter((line) => { for (const e of claude.readLine(line)) fire(e); });
        const shell = claude.needsShell(file);
        const session = {
            get alive() { return alive; },
            on(type, fn) { (handlers[type] = handlers[type] || []).push(fn); return session; },
            send(text) {
                if (!alive) return false;
                try {
                    child.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: String(text) } }) + '\n');
                    return true;
                } catch (e) {
                    return false;
                }
            },
            stop() { if (child && alive) { try { child.kill(); } catch (e) { end(null, e.message); } } },
        };
        try {
            child = spawn(shell ? claude.quoteCmd(file) : file, shell ? args.map(claude.quoteCmd) : args,
                { cwd, env, windowsHide: true, shell, stdio: ['pipe', 'pipe', 'pipe'] });
        } catch (e) {
            // Programme illisible : l'onglet l'apprendra au premier envoi (session morte)
            ended = true;
            stderr = e.message;
            return session;
        }
        alive = true;
        if (child.stdout.setEncoding) child.stdout.setEncoding('utf8');
        if (child.stderr.setEncoding) child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk) => split(String(chunk)));
        child.stderr.on('data', (chunk) => {
            stderr = (stderr + String(chunk)).slice(-claude.MAX_STDERR);
        });
        child.on('error', (e) => end(null, e.message));
        child.on('exit', (code) => end(code));
        child.on('close', (code) => end(code));
        if (child.stdin && child.stdin.on) child.stdin.on('error', () => { /* processus mort : signalé par exit */ });
        return session;
    };

    /** Réglages de l'onglet (Réglages › Claude) : chemin de Claude Code, modèle (vides = automatique). */
    claude.SETTINGS = { path: 'claudeCode.path', model: 'claudeCode.model' };

    /** « claude --version » : version installée, rejette si le programme ne répond pas. */
    claude.versionOf = function ({ execFile, file }) {
        const shell = claude.needsShell(file);
        return new Promise((resolve, reject) => {
            try {
                execFile(shell ? claude.quoteCmd(file) : file, ['--version'], { windowsHide: true, timeout: 15000, shell }, (err, stdout, stderr) => {
                    if (err) reject(new Error(String(stderr || err.message).trim() || 'pas de réponse'));
                    else resolve(String(stdout).trim());
                });
            } catch (e) {
                reject(e);
            }
        });
    };

    /** Terminal qui lance Claude Code, pour s'y connecter (/login). */
    claude.loginCommand = function (platform, file) {
        if (platform === 'win32') return { file: 'cmd.exe', args: ['/c', 'start', 'Claude Code', 'cmd', '/k', file] };
        const quoted = '\'' + String(file).replace(/'/g, '\'\\\'\'') + '\'';
        return { file: 'osascript', args: ['-e', 'tell application "Terminal" to do script "' + quoted.replace(/"/g, '\\"') + '"', '-e', 'tell application "Terminal" to activate'] };
    };
})(window);
