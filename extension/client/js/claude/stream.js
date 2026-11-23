/*
 * SIMING : onglet Claude, lecture du flux JSON de Claude Code
 * (claude -p --output-format stream-json --verbose --include-partial-messages). Pur.
 *
 *   SIMING.claude.lineSplitter(onLine) -> (paquet) => void    lignes entières seulement
 *   SIMING.claude.readLine(ligne) -> ViewEvent[]              ligne illisible : []
 *   SIMING.claude.parseEvent(obj) -> ViewEvent[]
 *   SIMING.claude.toolLabel(name, input) -> libellé humain d'un appel d'outil
 *
 * ViewEvent : { type: 'init', sessionId, model } | { type: 'delta', text } | { type: 'text', text }
 *   | { type: 'tool', id, name, input } | { type: 'toolResult', id, isError, text, images }
 *   | { type: 'done', sessionId, isError, text } | { type: 'auth', text }
 * Format relevé sur Claude Code 2.1.185 ; les lignes inconnues sont ignorées.
 */
(function (global) {
    'use strict';

    const SIMING = global.SIMING = global.SIMING || {};
    const claude = SIMING.claude = SIMING.claude || {};

    claude.TOOL_PREFIX = 'mcp__siming__';

    /** Erreur de connexion au compte (Claude Code pas connecté). */
    claude.AUTH_ERROR = /login|log in|authenticat|api key|unauthori[sz]ed|\b401\b|oauth|credential/i;

    claude.lineSplitter = function (onLine) {
        let rest = '';
        return function (chunk) {
            rest += String(chunk);
            const parts = rest.split('\n');
            rest = parts.pop();
            for (const p of parts) {
                const line = p.replace(/\r$/, '');
                if (line.trim()) onLine(line);
            }
        };
    };

    claude.readLine = function (line) {
        let obj;
        try { obj = JSON.parse(line); } catch (e) { return []; }
        return claude.parseEvent(obj);
    };

    /** Texte d'un tool_result : chaîne, ou blocs texte réunis ; images à part. */
    function resultParts(content) {
        if (typeof content === 'string') return { text: content, images: [] };
        const texts = [], images = [];
        for (const b of Array.isArray(content) ? content : []) {
            if (!b) continue;
            if (b.type === 'text') texts.push(String(b.text || ''));
            else if (b.type === 'image') {
                const src = b.source || {};
                const data = src.data || b.data;
                if (data) images.push({ data, mimeType: src.media_type || b.mimeType || 'image/png' });
            }
        }
        return { text: texts.join('\n'), images };
    }

    claude.parseEvent = function (obj) {
        if (!obj || typeof obj !== 'object') return [];
        switch (obj.type) {
            case 'system':
                return obj.subtype === 'init' ? [{ type: 'init', sessionId: obj.session_id || null, model: obj.model || null }] : [];
            case 'stream_event': {
                const e = obj.event || {};
                if (e.type === 'content_block_delta' && e.delta && e.delta.type === 'text_delta') return [{ type: 'delta', text: String(e.delta.text || '') }];
                return [];
            }
            case 'assistant': {
                const out = [];
                const content = (obj.message && obj.message.content) || [];
                for (const b of Array.isArray(content) ? content : []) {
                    if (!b) continue;
                    if (b.type === 'text' && b.text) out.push({ type: 'text', text: String(b.text) });
                    else if (b.type === 'tool_use') out.push({ type: 'tool', id: b.id, name: b.name, input: b.input || {} });
                }
                return out;
            }
            case 'user': {
                const out = [];
                const content = (obj.message && obj.message.content) || [];
                for (const b of Array.isArray(content) ? content : []) {
                    if (!b || b.type !== 'tool_result') continue;
                    const parts = resultParts(b.content);
                    out.push({ type: 'toolResult', id: b.tool_use_id, isError: !!b.is_error, text: parts.text, images: parts.images });
                }
                return out;
            }
            case 'result': {
                const isError = !!obj.is_error || (obj.subtype && obj.subtype !== 'success');
                let text = typeof obj.result === 'string' ? obj.result : '';
                if (!text && Array.isArray(obj.errors)) text = obj.errors.join('\n');
                const done = { type: 'done', sessionId: obj.session_id || null, isError: !!isError, text };
                return isError && claude.AUTH_ERROR.test(text) ? [{ type: 'auth', text }, done] : [done];
            }
            default:
                return [];
        }
    };

    claude.toolLabel = function (name, input) {
        const n = String(name || '');
        const short = n.startsWith(claude.TOOL_PREFIX) ? n.slice(claude.TOOL_PREFIX.length) : n;
        const a = input || {};
        switch (short) {
            case 'get_project': return 'Lit le projet';
            case 'get_comp': return 'Lit la comp';
            case 'get_properties': return 'Lit les propriétés d\'un calque';
            case 'capture_frame': return 'Capture l\'image';
            case 'siming_tool': return 'Geste ' + String(a.tool) + ' / ' + String(a.action);
            case 'ask_user': return 'Pose une question';
            case 'run_extendscript': {
                const u = String(a.undoName || '').trim();
                return u ? 'Claude : ' + u : 'Exécute un script';
            }
            default: return short;
        }
    };
})(window);
