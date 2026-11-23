'use strict';
/* Onglet Claude : trouver et lancer Claude Code (js/claude/cli.js), avec un faux processus. */
const assert = require('assert');
const { EventEmitter } = require('events');
const { makeDom } = require('./helpers');

const load = () => makeDom(['js/siming.js', 'js/claude/stream.js', 'js/claude/cli.js']).SIMING.claude;

/** Faux child_process.spawn : garde les appels, rend un processus pilotable. */
function fakeSpawn() {
    const calls = [];
    const spawn = (file, args, opts) => {
        const child = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.stdout.setEncoding = () => {};
        child.stderr.setEncoding = () => {};
        child.written = [];
        child.stdin = { write: (s) => { child.written.push(s); return true; }, end() {} };
        child.killed = false;
        child.kill = () => { child.killed = true; setTimeout(() => child.emit('exit', null, 'SIGTERM'), 0); return true; };
        calls.push({ file, args, opts, child });
        return child;
    };
    return { spawn, calls };
}

const OPTS = { port: 47821, token: 'ab'.repeat(24), client: 'tab-x1', systemPrompt: 'Consignes.' };

module.exports = function (test) {
    test('Claude Code : arguments exacts, configuration MCP avec jeton et client, --resume et --model sur demande', () => {
        const C = load();
        const args = Array.from(C.buildArgs(OPTS));
        assert.deepEqual(args.slice(0, 15), ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
            '--include-partial-messages', '--strict-mcp-config', '--setting-sources', 'project,local', '--tools', '', '--allowedTools', 'mcp__siming__*', '--mcp-config']);
        const cfg = JSON.parse(args[15]);
        assert.deepEqual(JSON.parse(JSON.stringify(cfg)), { mcpServers: { siming: { type: 'http', url: 'http://127.0.0.1:47821/mcp',
            headers: { Authorization: 'Bearer ' + OPTS.token, 'X-Siming-Client': 'tab-x1' } } } });
        assert.deepEqual(args.slice(16), ['--append-system-prompt', 'Consignes.']);
        assert.ok(!args.includes('--bare'), 'jamais --bare : il ne lit pas la connexion du compte');
        const more = Array.from(C.buildArgs(Object.assign({ resume: 'sess-1', model: 'opus' }, OPTS)));
        assert.deepEqual(more.slice(-4), ['--resume', 'sess-1', '--model', 'opus']);
        assert.ok(/ask_user/.test(C.SYSTEM_PROMPT) && /français/.test(C.SYSTEM_PROMPT));
    });

    test('Claude Code : message écrit en JSON ligne, événements du flux, fin du processus', async () => {
        const C = load();
        const f = fakeSpawn();
        const s = C.createSession({ spawn: f.spawn, file: 'C:\\Users\\x\\.local\\bin\\claude.exe', args: ['-p'], cwd: 'C:\\work', env: { A: '1' } });
        const { opts, child } = f.calls[0];
        assert.deepEqual([opts.cwd, opts.env.A, opts.windowsHide, opts.shell], ['C:\\work', '1', true, false]);
        const seen = [];
        s.on('*', (e) => seen.push(e.type));
        const texts = [];
        s.on('delta', (e) => texts.push(e.text));
        s.send('Bonjour « toi »');
        assert.deepEqual(child.written, [JSON.stringify({ type: 'user', message: { role: 'user', content: 'Bonjour « toi »' } }) + '\n']);
        const line = JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Sa' } } });
        child.stdout.emit('data', line.slice(0, 10));
        child.stdout.emit('data', line.slice(10) + '\n' + JSON.stringify({ type: 'result', is_error: false, result: 'Salut', session_id: 's' }) + '\n');
        child.stderr.emit('data', 'avertissement');
        assert.deepEqual(texts, ['Sa']);
        assert.deepEqual(seen, ['delta', 'done']);
        assert.strictEqual(s.alive, true);
        const exit = new Promise((r) => s.on('exit', r));
        child.emit('exit', 1);
        const e = await exit;
        assert.deepEqual([e.code, e.stderr], [1, 'avertissement']);
        assert.strictEqual(s.alive, false);
        assert.strictEqual(s.send('trop tard'), false);
    });

    test('Claude Code : arrêt (kill), programme introuvable -> exit une seule fois', async () => {
        const C = load();
        const f = fakeSpawn();
        const s = C.createSession({ spawn: f.spawn, file: '/usr/local/bin/claude', args: [], cwd: '/tmp', env: {} });
        const exits = [];
        s.on('exit', (e) => exits.push(e));
        s.stop();
        await new Promise((r) => setTimeout(r, 5));
        assert.strictEqual(f.calls[0].child.killed, true);
        assert.strictEqual(exits.length, 1);
        const g = fakeSpawn();
        const t = C.createSession({ spawn: g.spawn, file: '/nope/claude', args: [], cwd: '/tmp', env: {} });
        const gone = [];
        t.on('exit', (e) => gone.push(e));
        g.calls[0].child.emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }));
        g.calls[0].child.emit('close', -2);
        assert.strictEqual(gone.length, 1);
        assert.ok(/ENOENT/.test(gone[0].stderr));
        const crash = (() => { throw new Error('spawn EACCES'); });
        const u = C.createSession({ spawn: crash, file: '/x', args: [], cwd: '/tmp', env: {} });
        assert.strictEqual(u.alive, false);
    });

    test('Claude Code : un .cmd (npm, Windows) se lance par le shell, arguments entre guillemets', () => {
        const C = load();
        const f = fakeSpawn();
        C.createSession({ spawn: f.spawn, file: 'C:\\Users\\Jean Dupont\\AppData\\Roaming\\npm\\claude.cmd', args: ['-p', '', '{"a":"b c"}'], cwd: 'C:\\w', env: {} });
        const { file, args, opts } = f.calls[0];
        assert.strictEqual(opts.shell, true);
        assert.strictEqual(file, '"C:\\Users\\Jean Dupont\\AppData\\Roaming\\npm\\claude.cmd"');
        assert.deepEqual(Array.from(args), ['"-p"', '""', '"{\\"a\\":\\"b c\\"}"']);
    });

    test('Claude Code : chemins essayés (Windows, macOS), réglage d\'abord, where et zsh en secours', async () => {
        const C = load();
        const win = Array.from(C.candidates('win32', { USERPROFILE: 'C:\\Users\\jo', APPDATA: 'C:\\Users\\jo\\AppData\\Roaming' }));
        assert.deepEqual(win, ['C:\\Users\\jo\\.local\\bin\\claude.exe', 'C:\\Users\\jo\\AppData\\Roaming\\npm\\claude.cmd']);
        const mac = Array.from(C.candidates('darwin', { HOME: '/Users/jo' }));
        assert.deepEqual(mac, ['/Users/jo/.local/bin/claude', '/opt/homebrew/bin/claude', '/usr/local/bin/claude']);
        const fsOf = (files) => ({ existsSync: (p) => files.includes(p), statSync: () => ({ isFile: () => true }) });
        const exec = (answers) => (file, args, opts, cb) => {
            const key = file + ' ' + args.join(' ');
            const a = answers[key];
            setTimeout(() => (a === undefined ? cb(new Error('introuvable')) : cb(null, a, '')), 0);
        };
        const env = { USERPROFILE: 'C:\\Users\\jo', APPDATA: 'C:\\Users\\jo\\AppData\\Roaming', HOME: '/Users/jo' };
        assert.strictEqual(await C.findClaude({ fs: fsOf(['D:\\claude.exe']), execFile: exec({}), platform: 'win32', env, configured: 'D:\\claude.exe' }), 'D:\\claude.exe');
        assert.strictEqual(await C.findClaude({ fs: fsOf([]), execFile: exec({}), platform: 'win32', env, configured: 'D:\\absent.exe' }), null, 'réglage faux : rien');
        assert.strictEqual(await C.findClaude({ fs: fsOf(['C:\\bin\\claude.exe']), execFile: exec({ 'where claude': 'C:\\bin\\claude\r\nC:\\bin\\claude.exe\r\n' }), platform: 'win32', env }), 'C:\\bin\\claude.exe');
        assert.strictEqual(await C.findClaude({ fs: fsOf(['C:\\Users\\jo\\AppData\\Roaming\\npm\\claude.cmd']), execFile: exec({}), platform: 'win32', env }), 'C:\\Users\\jo\\AppData\\Roaming\\npm\\claude.cmd');
        assert.strictEqual(await C.findClaude({ fs: fsOf(['/opt/homebrew/bin/claude']), execFile: exec({}), platform: 'darwin', env }), '/opt/homebrew/bin/claude');
        assert.strictEqual(await C.findClaude({ fs: fsOf(['/Users/jo/.nvm/bin/claude']), execFile: exec({ '/bin/zsh -lc command -v claude': '/Users/jo/.nvm/bin/claude\n' }), platform: 'darwin', env }), '/Users/jo/.nvm/bin/claude');
        assert.strictEqual(await C.findClaude({ fs: fsOf([]), execFile: exec({}), platform: 'darwin', env }), null);
    });

    test('Claude Code : terminal pour se connecter (Windows : cmd, macOS : Terminal)', () => {
        const C = load();
        const w = C.loginCommand('win32', 'C:\\bin\\claude.exe');
        assert.strictEqual(w.file, 'cmd.exe');
        assert.deepEqual(Array.from(w.args), ['/c', 'start', 'Claude Code', 'cmd', '/k', 'C:\\bin\\claude.exe']);
        const m = C.loginCommand('darwin', '/Users/jo/.local/bin/claude');
        assert.strictEqual(m.file, 'osascript');
        assert.ok(m.args.join(' ').includes('do script "\'/Users/jo/.local/bin/claude\'"'), m.args.join(' '));
    });
};
