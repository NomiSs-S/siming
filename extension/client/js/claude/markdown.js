/*
 * SIMING : onglet Claude, Markdown réduit en nœuds DOM (jamais d'HTML brut : tout passe
 * par textContent). Paragraphes, retours à la ligne, **gras**, `code`, blocs ```…```,
 * listes « - » et « 1. ».
 *
 *   SIMING.claude.renderMarkdown(doc, texte) -> DocumentFragment
 */
(function (global) {
    'use strict';

    const SIMING = global.SIMING = global.SIMING || {};
    const claude = SIMING.claude = SIMING.claude || {};

    const BULLET = /^\s*[-*•]\s+(.*)$/;
    const NUMBER = /^\s*\d+[.)]\s+(.*)$/;

    /** Texte en ligne : **gras** et `code`, le reste en texte. */
    function inline(doc, parent, text) {
        const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
        let last = 0, m;
        while ((m = re.exec(text))) {
            if (m.index > last) parent.append(doc.createTextNode(text.slice(last, m.index)));
            const el = doc.createElement(m[1] !== undefined ? 'strong' : 'code');
            el.textContent = m[1] !== undefined ? m[1] : m[2];
            parent.append(el);
            last = re.lastIndex;
        }
        if (last < text.length) parent.append(doc.createTextNode(text.slice(last)));
    }

    function paragraph(doc, lines) {
        const p = doc.createElement('p');
        lines.forEach((l, i) => {
            if (i) p.append(doc.createElement('br'));
            inline(doc, p, l);
        });
        return p;
    }

    claude.renderMarkdown = function (doc, text) {
        const frag = doc.createDocumentFragment();
        const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
        let para = [];
        let list = null, listKind = null;
        const flushPara = () => { if (para.length) frag.append(paragraph(doc, para)); para = []; };
        const flushList = () => { if (list) frag.append(list); list = null; listKind = null; };
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (/^\s*```/.test(line)) {
                flushPara(); flushList();
                const code = [];
                for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) code.push(lines[i]);
                const pre = doc.createElement('pre');
                const c = doc.createElement('code');
                c.textContent = code.join('\n');
                pre.append(c);
                frag.append(pre);
                continue;
            }
            const b = BULLET.exec(line), n = b ? null : NUMBER.exec(line);
            if (b || n) {
                flushPara();
                const kind = b ? 'ul' : 'ol';
                if (listKind !== kind) { flushList(); list = doc.createElement(kind); listKind = kind; }
                const li = doc.createElement('li');
                inline(doc, li, (b || n)[1]);
                list.append(li);
                continue;
            }
            if (!line.trim()) { flushPara(); flushList(); continue; }
            flushList();
            para.push(line);
        }
        flushPara();
        flushList();
        return frag;
    };
})(window);
