'use strict';
/* Onglet Claude : lecture du flux JSON de Claude Code (js/claude/stream.js) et Markdown réduit (js/claude/markdown.js). */
const assert = require('assert');
const { makeDom } = require('./helpers');

const load = () => makeDom(['js/siming.js', 'js/claude/stream.js', 'js/claude/markdown.js']);
const plainEvents = (x) => JSON.parse(JSON.stringify(x));

// Lignes relevées sur Claude Code 2.1.185 (raccourcies)
const LINES = {
    init: { type: 'system', subtype: 'init', cwd: 'C:\\x', session_id: 'sess-1', tools: ['mcp__siming__get_comp'], model: 'claude-opus-5-5', permissionMode: 'default' },
    status: { type: 'system', subtype: 'status', status: 'requesting' },
    hook: { type: 'system', subtype: 'hook_started', hook_name: 'x' },
    delta: { type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Je regarde' } }, session_id: 'sess-1' },
    thinking: { type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'hmm' } } },
    start: { type: 'stream_event', event: { type: 'message_start', message: {} } },
    assistant: { type: 'assistant', message: { content: [
        { type: 'thinking', thinking: '…' },
        { type: 'text', text: 'Je regarde la comp.' },
        { type: 'tool_use', id: 'toolu_1', name: 'mcp__siming__run_extendscript', input: { code: 'return 1;', undoName: 'Logo en bas' } },
    ] }, session_id: 'sess-1' },
    toolResult: { type: 'user', message: { role: 'user', content: [
        { type: 'tool_result', tool_use_id: 'toolu_1', content: [{ type: 'text', text: '{"value":1}' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } }], is_error: false },
    ] } },
    toolError: { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_2', content: 'Erreur : boum', is_error: true }] } },
    rate: { type: 'rate_limit_event', rate_limit_info: {} },
    result: { type: 'result', subtype: 'success', is_error: false, result: 'OK', session_id: 'sess-1', total_cost_usd: 0.01 },
    authFail: { type: 'result', subtype: 'success', is_error: true, result: 'Invalid API key · Please run /login', session_id: 'sess-2' },
};

module.exports = function (test) {
    test('flux Claude : init, texte au fil de l\'eau, bloc texte, outil, résultat, fin ; le reste ignoré', () => {
        const C = load().SIMING.claude;
        const ev = (k) => plainEvents(C.parseEvent(LINES[k]));
        assert.deepEqual(ev('init'), [{ type: 'init', sessionId: 'sess-1', model: 'claude-opus-5-5' }]);
        assert.deepEqual(ev('delta'), [{ type: 'delta', text: 'Je regarde' }]);
        for (const k of ['status', 'hook', 'thinking', 'start', 'rate']) assert.deepEqual(ev(k), [], k);
        assert.deepEqual(ev('assistant'), [
            { type: 'text', text: 'Je regarde la comp.' },
            { type: 'tool', id: 'toolu_1', name: 'mcp__siming__run_extendscript', input: { code: 'return 1;', undoName: 'Logo en bas' } },
        ]);
        assert.deepEqual(ev('toolResult'), [{ type: 'toolResult', id: 'toolu_1', isError: false, text: '{"value":1}', images: [{ data: 'AAAA', mimeType: 'image/png' }] }]);
        assert.deepEqual(ev('toolError'), [{ type: 'toolResult', id: 'toolu_2', isError: true, text: 'Erreur : boum', images: [] }]);
        assert.deepEqual(ev('result'), [{ type: 'done', sessionId: 'sess-1', isError: false, text: 'OK' }]);
        assert.deepEqual(ev('authFail'), [{ type: 'auth', text: 'Invalid API key · Please run /login' }, { type: 'done', sessionId: 'sess-2', isError: true, text: 'Invalid API key · Please run /login' }]);
        assert.deepEqual(plainEvents(C.parseEvent(null)), []);
        assert.deepEqual(plainEvents(C.parseEvent({ type: 'inconnu' })), []);
    });

    test('flux Claude : lignes coupées entre deux paquets rassemblées, lignes illisibles ignorées', () => {
        const C = load().SIMING.claude;
        const lines = [];
        const push = C.lineSplitter((l) => lines.push(l));
        const a = JSON.stringify(LINES.delta), b = JSON.stringify(LINES.result);
        push(a.slice(0, 20));
        assert.deepEqual(lines, []);
        push(a.slice(20) + '\r\n' + b.slice(0, 5));
        push(b.slice(5) + '\n\n{pas du json\n');
        assert.deepEqual(lines, [a, b, '{pas du json']);
        assert.deepEqual(plainEvents(C.readLine(lines[0])), [{ type: 'delta', text: 'Je regarde' }]);
        assert.deepEqual(plainEvents(C.readLine(lines[2])), [], 'ligne illisible ignorée');
    });

    test('flux Claude : libellés humains des outils', () => {
        const C = load().SIMING.claude;
        assert.strictEqual(C.toolLabel('mcp__siming__get_comp', {}), 'Lit la comp');
        assert.strictEqual(C.toolLabel('mcp__siming__capture_frame', {}), 'Capture l\'image');
        assert.strictEqual(C.toolLabel('mcp__siming__run_extendscript', { undoName: 'Logo en bas' }), 'Claude : Logo en bas');
        assert.strictEqual(C.toolLabel('mcp__siming__run_extendscript', {}), 'Exécute un script');
        assert.strictEqual(C.toolLabel('mcp__siming__siming_tool', { tool: 'quicktools', action: 'ease' }), 'Geste quicktools / ease');
        assert.strictEqual(C.toolLabel('mcp__siming__ask_user', {}), 'Pose une question');
        assert.strictEqual(C.toolLabel('Bash', {}), 'Bash');
    });

    test('Markdown réduit : paragraphes, gras, code, blocs, listes ; jamais d\'HTML brut', () => {
        const win = load();
        const frag = win.SIMING.claude.renderMarkdown(win.document, 'Bonjour **toi**, voici `comp.layer(1)`.\n\n- un\n- deux\n\n1. premier\n2. second\n\n```\nvar a = 1;\n<b>x</b>\n```\n\n<script>alert(1)</script> fin');
        const box = win.document.createElement('div');
        box.append(frag);
        const ps = box.querySelectorAll(':scope > p');
        assert.strictEqual(ps.length, 2);
        assert.strictEqual(ps[0].querySelector('strong').textContent, 'toi');
        assert.strictEqual(ps[0].querySelector('code').textContent, 'comp.layer(1)');
        assert.deepEqual(Array.from(box.querySelectorAll('ul > li')).map((li) => li.textContent), ['un', 'deux']);
        assert.deepEqual(Array.from(box.querySelectorAll('ol > li')).map((li) => li.textContent), ['premier', 'second']);
        assert.strictEqual(box.querySelector('pre > code').textContent, 'var a = 1;\n<b>x</b>');
        assert.strictEqual(box.querySelector('script'), null);
        assert.strictEqual(box.querySelector('b'), null);
        assert.strictEqual(ps[1].textContent, '<script>alert(1)</script> fin');
        const lines = win.document.createElement('div');
        lines.append(win.SIMING.claude.renderMarkdown(win.document, 'ligne 1\nligne 2'));
        assert.strictEqual(lines.querySelectorAll('br').length, 1, 'retour à la ligne gardé');
    });
};
