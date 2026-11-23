/*
 * SIMING : onglet Claude du hub (outil « hubOnly » : pas de panneau isolé).
 * Fil de discussion avec Claude Code, lancé sans terminal (js/claude/cli.js) avec le serveur
 * MCP SIMING pour seuls outils. Contexte After Effects joint à chaque message, questions de
 * Claude (ask_user) affichées dans le fil, bouton Observer (photo avant / après d'un geste).
 *
 * ctx.claude : accès Node et service (SIMING.mcp.hubEnv), null hors After Effects.
 * Fil enregistré dans <USER_DATA>/SIMING/claude-thread.json, repris par --resume.
 * Historique : « Nouvelle conversation » range le fil dans <USER_DATA>/SIMING/claude-history/
 * (un fichier par conversation, HISTORY_MAX au plus) ; le bouton Historique les rouvre.
 */
(function (global) {
    'use strict';

    const SIMING = global.SIMING;
    const ui = SIMING.ui;
    const h = ui.h;
    const claude = SIMING.claude = SIMING.claude || {};

    /** Attentes (ms) : relevé de la comp active pendant l'observation, réponse du service. */
    claude.TAB = { poll: 2000, serviceWait: 1500 };
    const MAX_RESULT = 4000;   // caractères d'un résultat d'outil gardés dans le fil

    const HELP = {
        intro: 'Parle à Claude sans quitter After Effects : il voit la comp ouverte et ta sélection, et agit dans le projet.',
        groups: [
            { title: 'Discuter', items: [
                { step: 1, name: 'Écris ta demande', text: 'Par exemple « déplace le logo comme dans MAIN sur les autres comps 16x9 ».', keys: [{ k: ['Entrée'], t: 'envoyer' }, { k: ['Maj', 'Entrée'], t: 'à la ligne' }] },
                { step: 2, name: 'Il travaille', text: 'Chaque action s\'affiche ; un Ctrl+Z (Cmd+Z) annule chacune d\'un coup.' },
                { icon: 'aide', name: 'Ses questions', text: 'Claude demande dans le fil : clique un choix ou écris ta réponse.' },
            ] },
            { title: 'Montrer un geste', items: [
                { icon: 'visible', name: 'Observer', text: 'Clique Observer, fais ton geste à la main, reclique : la différence part avec ton prochain message.' },
            ] },
            { title: 'Conversations', items: [
                { icon: 'rafraichir', name: 'Nouvelle conversation', text: 'Range le fil dans l\'historique ; Claude repart de zéro.' },
                { icon: 'menu', name: 'Historique', text: 'Rouvre une ancienne conversation : Claude s\'en souvient et continue où vous en étiez.' },
            ] },
            { title: 'À savoir', items: [
                { icon: 'attention', name: 'Claude Code', text: 'Installé sur l\'ordinateur et connecté au compte de l\'équipe. Il ne touche qu\'à After Effects.' },
            ] },
        ],
        footer: 'Réglages › Claude : chemin de Claude Code et modèle.',
    };

    // --- Historique des conversations (pur, fs et path passés) ----------------------------

    claude.HISTORY_MAX = 50;

    /** Titre d'une conversation : début de sa première demande (sans le contexte joint). */
    claude.historyTitle = function (items) {
        const first = (items || []).find((i) => i && i.type === 'user' && String(i.text || '').trim());
        if (!first) return 'Conversation sans message';
        const t = String(first.text).replace(/\s+/g, ' ').trim();
        return t.length > 70 ? t.slice(0, 69) + '…' : t;
    };

    /** Conversations rangées, la plus récente d'abord : [{ id, title, updated, count, file }]. */
    claude.listHistory = function (fs, path, dir) {
        let names = [];
        try { names = fs.readdirSync(dir); } catch (e) { return []; }
        const out = [];
        for (const name of names) {
            if (!/\.json$/.test(name) || name.startsWith('._')) continue;   // ._ : métadonnées de macOS
            const file = path.join(dir, name);
            let data = null;
            try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { data = null; }
            if (!data || !Array.isArray(data.items)) continue;
            out.push({
                id: String(data.id || name.replace(/\.json$/, '')), title: data.title || claude.historyTitle(data.items),
                updated: String(data.updated || ''), count: data.items.filter((i) => i && (i.type === 'user' || i.type === 'claude')).length, file,
            });
        }
        return out.sort((a, b) => (a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : 0));
    };

    /** Date lisible d'une conversation : « aujourd'hui 14:05 », « hier 09:12 », « 3 nov. 16:40 ». */
    claude.historyDate = function (iso, now) {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        const n = now || new Date();
        const pad = (x) => (x < 10 ? '0' : '') + x;
        const hm = pad(d.getHours()) + ':' + pad(d.getMinutes());
        const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
        const diff = Math.round((day(n) - day(d)) / 86400000);
        if (diff === 0) return 'aujourd\'hui ' + hm;
        if (diff === 1) return 'hier ' + hm;
        const months = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
        return d.getDate() + ' ' + months[d.getMonth()] + (d.getFullYear() !== n.getFullYear() ? ' ' + d.getFullYear() : '') + ' ' + hm;
    };

    // --- Contexte joint aux messages (pur) -------------------------------------------------

    const secs = (t) => (Math.round(Number(t) * 100) / 100) + ' s';

    /** Bloc <contexte_ae> d'après mcp.context (null : After Effects n'a pas répondu). */
    claude.contextText = function (c) {
        const lines = ['<contexte_ae>'];
        if (!c) {
            lines.push('After Effects n\'a pas répondu : contexte inconnu.');
        } else {
            const p = c.project || {};
            lines.push('Projet : ' + (p.name ? p.name + (p.dirty === true ? ' (modifications non enregistrées)' : '') : 'jamais enregistré'));
            const comp = c.comp;
            if (!comp) lines.push('Comp active : aucune');
            else {
                lines.push('Comp active : ' + comp.name + ' (id ' + comp.id + ') ' + comp.width + '×' + comp.height + ', ' + comp.frameRate + ' i/s, durée ' +
                    secs(comp.duration) + ', temps courant ' + secs(comp.time) + ', ' + SIMING.plural(comp.numLayers, 'calque', 'calques'));
                const layers = (c.layers || []).map((l) => l.index + ' « ' + l.name + ' » (id ' + l.id + ', ' + l.kind + (l.source ? ', source ' + l.source : '') + ')');
                lines.push('Calques sélectionnés : ' + (layers.length ? layers.join(', ') : 'aucun'));
                const props = (c.properties || []).map((p2) => p2.layer + ' › ' + p2.path + (p2.numKeys ? ' (' + p2.numKeys + ' keyframes)' : ''));
                if (props.length) lines.push('Propriétés sélectionnées : ' + props.join(', '));
            }
        }
        lines.push('</contexte_ae>');
        return lines.join('\n');
    };

    /** Résumé d'une ligne sous le message : « MAIN_16x9 · 1 calque sélectionné · Observation ». */
    claude.contextSummary = function (c, withObservation) {
        const parts = [];
        if (!c) parts.push('contexte inconnu');
        else if (!c.comp) parts.push('aucune comp active');
        else {
            parts.push(c.comp.name);
            const n = (c.layers || []).length;
            if (n) parts.push(n + ' calque' + (n > 1 ? 's sélectionnés' : ' sélectionné'));
        }
        if (withObservation) parts.push('Observation');
        return parts.join(' · ');
    };

    // --- Vue -----------------------------------------------------------------------------

    function mount(view, ctx) {
        const env = ctx.claude;
        const mcp = SIMING.mcp;
        if (!env || !env.spawn || !claude.createSession || !mcp || !mcp.readConfig) {
            view.append(h('div', { class: 's-hint', 'data-role': 'claude-unavailable',
                text: 'Disponible dans After Effects seulement : ce panneau n\'a pas accès à Node.' }));
            return {};
        }
        const status = ctx.status;
        const doc = view.ownerDocument;
        const clientId = 'tab-' + env.crypto.randomBytes(6).toString('hex');
        const siming = env.path.join(env.userData, 'SIMING');
        const workDir = env.path.join(siming, 'claude-work');
        const threadFile = env.path.join(siming, 'claude-thread.json');
        const historyDir = env.path.join(siming, 'claude-history');
        const newId = () => Date.now().toString(36) + '-' + env.crypto.randomBytes(3).toString('hex');

        let claudePath = null;
        let session = null;
        let sessionId = null;
        let conversationId = newId();
        let resumed = false;          // la session courante a été lancée avec --resume
        let items = [];
        let busy = false;
        let stoppedByUser = false;
        let question = null;          // { id, item, card, live }
        let pendingObs = null;        // { text, count }
        let stream = null;            // bulle de Claude en cours d'écriture { el, text }
        let actions = 0;
        let serviceSeen = false;
        const toolLines = new Map();  // id d'appel -> { el, item }
        const obs = { on: false, shooting: false, timer: null, shots: new Map(), items: null };

        // --- Construction -------------------------------------------------------------
        const modelLabel = h('span', { class: 's-chat-model', 'data-role': 'claude-model-label' });
        const observeLabel = h('span', { text: 'Observer' });
        const observeBtn = h('button', { class: 's-observe-btn', type: 'button', 'data-role': 'claude-observe', 'aria-pressed': 'false',
            title: 'Observer un geste fait à la main', onclick: () => toggleObserve() }, h('span', { class: 's-observe-dot' }), observeLabel);
        const newBtn = h('button', { class: 's-icon-btn', type: 'button', 'data-role': 'claude-new', title: 'Nouvelle conversation',
            'aria-label': 'Nouvelle conversation', onclick: () => newConversation() }, ui.icon('rafraichir', 16));
        const historyBtn = h('button', { class: 's-icon-btn', type: 'button', 'data-role': 'claude-history', title: 'Historique des conversations',
            'aria-label': 'Historique des conversations', 'aria-pressed': 'false', onclick: () => toggleHistory() }, ui.icon('menu', 16));
        const bar = h('div', { class: 's-chat-bar' }, modelLabel, observeBtn, historyBtn, newBtn);
        const historyList = h('div', { class: 's-stack s-history-list', 'data-role': 'claude-history-list' });
        const historyPane = h('div', { class: 's-stack s-history', 'data-role': 'claude-history-pane', hidden: true },
            ui.sectionTitle('Historique'), historyList,
            ui.button({ label: 'Retour au fil', role: 'claude-history-back', onClick: () => toggleHistory(false) }));

        const pathField = ui.textField({
            role: 'claude-missing-path', label: 'Chemin de Claude Code', placeholder: 'Chemin de Claude Code (facultatif)',
            value: SIMING.settings.get(claude.SETTINGS.path, ''),
            onCommit: (v) => { SIMING.settings.set(claude.SETTINGS.path, v.trim()); locate(); },
        });
        const setup = h('div', { class: 's-claude-setup', 'data-role': 'claude-missing', hidden: true },
            ui.sectionTitle('Claude Code introuvable'),
            h('div', { class: 's-hint', text: 'L\'onglet passe par Claude Code, installé sur cet ordinateur et connecté au compte Claude de l\'équipe (rien à payer en plus). Installe-le, puis cherche à nouveau ; s\'il est ailleurs, indique son chemin.' }),
            ui.button({ label: 'Page d\'installation de Claude Code', role: 'claude-install', onClick: () => env.openUrl && env.openUrl(claude.INSTALL_URL) }),
            pathField,
            ui.button({ label: 'Chercher à nouveau', role: 'claude-locate', onClick: () => locate() }));

        const login = h('div', { class: 's-claude-setup', 'data-role': 'claude-login', hidden: true },
            h('div', { class: 's-error', text: 'Claude Code n\'est pas connecté à un compte Claude.' }),
            h('div', { class: 's-hint', text: 'Clique « Se connecter » : un terminal s\'ouvre sur Claude Code. Tape /login, choisis le compte de l\'équipe, ferme le terminal, puis renvoie ton message ici.' }),
            ui.button({ label: 'Se connecter', role: 'claude-login-btn', onClick: () => openLogin() }));

        const empty = h('div', { class: 's-chat-empty', text: 'Demande ce que tu veux faire dans After Effects. Claude voit la comp active et ta sélection.' });
        const chat = h('div', { class: 's-chat', 'data-role': 'claude-thread' }, empty);
        const chips = h('div', { class: 's-stack', 'data-role': 'claude-chips' });
        const input = h('textarea', { class: 's-chat-input', 'data-role': 'claude-input', rows: '3', placeholder: 'Écris à Claude…', spellcheck: 'false' });
        const sendBtn = ui.primaryButton({ label: 'Envoyer', role: 'claude-send', onClick: () => send() });
        const stopBtn = ui.button({ label: 'Arrêter', role: 'claude-stop', onClick: () => stop() });
        stopBtn.hidden = true;
        const composer = h('div', { class: 's-composer' }, chips, input, h('div', { class: 's-chat-actions' }, sendBtn, stopBtn));
        const main = h('div', { class: 's-stack s-chat-main' }, bar, historyPane, login, chat, composer);
        main.hidden = true;
        view.append(setup, main);

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
        });

        // --- Fil : rendu et enregistrement ---------------------------------------------
        const scroll = () => { chat.scrollTop = chat.scrollHeight; };

        function bubble(who, cls) {
            const text = h('div', { class: 's-msg-text' });
            const el = h('div', { class: 's-msg ' + cls }, h('span', { class: 's-msg-who', text: who }), text);
            return { el, text };
        }

        function renderUser(item) {
            const b = bubble('Toi', 's-msg-user');
            b.text.textContent = item.text;
            if (item.summary) {
                b.el.append(h('details', { class: 's-msg-context', 'data-role': 'claude-context' },
                    h('summary', { text: item.summary }), h('pre', { class: 's-tool-detail', text: item.context || '' })));
            }
            return b.el;
        }

        function renderClaude(item) {
            const b = bubble('Claude', 's-msg-claude');
            b.text.append(claude.renderMarkdown(doc, item.text));
            return b.el;
        }

        function toolState(item) { return item.state === 'ok' ? '✓' : item.state === 'error' ? '!' : '…'; }

        function renderTool(item) {
            const detail = item.input && typeof item.input.code === 'string' ? item.input.code : JSON.stringify(item.input || {}, null, 1);
            const result = h('pre', { class: 's-tool-detail', 'data-role': 'claude-tool-result', text: item.result || '', hidden: !item.result });
            const state = h('span', { class: 's-tool-state', text: toolState(item) });
            const el = h('details', { class: 's-tool' + (item.state === 'ok' ? ' is-ok' : item.state === 'error' ? ' is-error' : ''), 'data-role': 'claude-tool' },
                h('summary', {}, state, h('span', { text: item.label })),
                h('pre', { class: 's-tool-detail', text: detail }), result);
            el.update = () => {
                state.textContent = toolState(item);
                el.classList.toggle('is-ok', item.state === 'ok');
                el.classList.toggle('is-error', item.state === 'error');
                result.textContent = item.result || '';
                result.hidden = !item.result;
            };
            return el;
        }

        function renderQuestion(item, live) {
            const card = h('div', { class: 's-question' + (item.answer !== null && item.answer !== undefined ? ' is-answered' : ''), 'data-role': 'claude-question' },
                h('div', { class: 's-question-text', text: item.question }));
            if (item.answer !== null && item.answer !== undefined) {
                card.append(h('div', { class: 's-question-answer', 'data-role': 'claude-question-answer', text: 'Ta réponse : ' + item.answer }));
                return card;
            }
            if (!live) return card;
            const chosen = new Set();
            const opts = h('div', { class: 's-question-options' });
            for (const o of item.options || []) {
                const b = h('button', { class: 's-btn', type: 'button', 'data-role': 'claude-option', title: o.description || '', text: o.label });
                b.addEventListener('click', () => {
                    if (!live.multiple) { answer(o.label); return; }
                    if (chosen.has(o.label)) chosen.delete(o.label); else chosen.add(o.label);
                    b.classList.toggle('is-on', chosen.has(o.label));
                });
                opts.append(b);
            }
            if ((item.options || []).length) card.append(opts);
            const free = h('input', { class: 's-field-input', type: 'text', 'data-role': 'claude-answer-text', placeholder: 'Autre réponse…', spellcheck: 'false' });
            const submit = () => {
                const parts = Array.from(chosen);
                if (free.value.trim()) parts.push(free.value.trim());
                if (parts.length) answer(parts.join(' ; '));
            };
            free.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
            if (live.allowText !== false) card.append(h('div', { class: 's-field' }, free));
            if (live.allowText !== false || live.multiple) card.append(ui.button({ label: 'Envoyer la réponse', role: 'claude-answer', onClick: submit }));
            return card;
        }

        function render(item, live) {
            if (item.type === 'user') return renderUser(item);
            if (item.type === 'claude') return renderClaude(item);
            if (item.type === 'tool') return renderTool(item);
            if (item.type === 'question') return renderQuestion(item, live);
            return null;
        }

        function add(item, live) {
            items.push(item);
            const el = render(item, live);
            empty.remove();
            if (el) chat.append(el);
            scroll();
            return el;
        }

        function save() {
            try {
                env.fs.mkdirSync(siming, { recursive: true });
                env.fs.writeFileSync(threadFile, JSON.stringify({ version: 1, id: conversationId, sessionId, items }), 'utf8');
            } catch (e) { /* le fil reste affiché, seulement pas repris à la réouverture */ }
        }

        function restore(fromFile, removeAfter) {
            let data = null;
            try { data = JSON.parse(env.fs.readFileSync(fromFile || threadFile, 'utf8')); } catch (e) { data = null; }
            if (!data || !Array.isArray(data.items)) return false;
            sessionId = typeof data.sessionId === 'string' ? data.sessionId : null;
            conversationId = typeof data.id === 'string' && data.id ? data.id : newId();
            if (removeAfter) { try { env.fs.unlinkSync(fromFile); } catch (e) { /* déjà retiré */ } }
            for (const it of data.items) {
                if (it && it.type === 'tool' && it.state === 'run') it.state = 'error';   // interrompu par la fermeture
                if (it && it.type === 'question' && (it.answer === null || it.answer === undefined)) it.answer = '(sans réponse)';
                if (it && it.type) add(it, null);
            }
            return true;
        }

        // --- Historique ------------------------------------------------------------------
        /** Range le fil courant dans l'historique (rien s'il est vide) ; garde HISTORY_MAX fichiers. */
        function archive() {
            if (!items.length) return;
            try {
                env.fs.mkdirSync(historyDir, { recursive: true });
                const data = { version: 1, id: conversationId, sessionId, title: claude.historyTitle(items), updated: new Date().toISOString(), items };
                env.fs.writeFileSync(env.path.join(historyDir, conversationId + '.json'), JSON.stringify(data), 'utf8');
                for (const old of claude.listHistory(env.fs, env.path, historyDir).slice(claude.HISTORY_MAX)) {
                    try { env.fs.unlinkSync(old.file); } catch (e) { /* déjà retiré */ }
                }
            } catch (e) {
                status.set('Conversation non rangée dans l\'historique : ' + e.message, 'warn');
            }
        }

        /** Vide le fil affiché et arrête Claude Code (la conversation, elle, reste reprenable). */
        function clearThread() {
            cancelQuestion();
            if (session) { const s = session; session = null; s.stop(); }
            items = [];
            sessionId = null;
            stream = null;
            toolLines.clear();
            chat.replaceChildren(empty);
            login.hidden = true;
            modelLabel.textContent = '';
            setBusy(false);
        }

        function renderHistory() {
            const list = claude.listHistory(env.fs, env.path, historyDir);
            historyList.replaceChildren();
            if (!list.length) {
                historyList.append(h('div', { class: 's-hint', 'data-role': 'claude-history-empty', text: 'Aucune conversation rangée. « Nouvelle conversation » y range le fil en cours.' }));
                return;
            }
            for (const c of list) {
                const open = h('button', { class: 's-history-item', type: 'button', 'data-role': 'claude-history-item', title: c.title, onclick: () => openConversation(c) },
                    h('span', { class: 's-history-title', text: c.title }),
                    h('span', { class: 's-history-meta', text: [claude.historyDate(c.updated), SIMING.plural(c.count, 'message', 'messages')].filter(Boolean).join(' · ') }));
                const del = h('button', { class: 's-icon-btn', type: 'button', 'data-role': 'claude-history-delete', title: 'Supprimer cette conversation',
                    'aria-label': 'Supprimer « ' + c.title + ' »', onclick: () => deleteConversation(c) }, ui.icon('fermer', 14));
                historyList.append(h('div', { class: 's-history-row' }, open, del));
            }
        }

        function toggleHistory(on) {
            const show = on === undefined ? historyPane.hidden : !!on;
            if (show && busy) { status.set('Claude travaille : attends qu\'il ait fini, ou arrête-le', 'warn'); return; }
            if (show) renderHistory();
            historyPane.hidden = !show;
            chat.hidden = show;
            composer.hidden = show;
            historyBtn.setAttribute('aria-pressed', String(show));
            historyBtn.classList.toggle('is-on', show);
        }

        function openConversation(c) {
            if (busy) return;
            archive();
            clearThread();
            if (!restore(c.file, true)) {
                status.set('Conversation illisible : « ' + c.title + ' »', 'error');
                conversationId = newId();
                renderHistory();
                return;
            }
            save();
            toggleHistory(false);
            status.set('Conversation rouverte : Claude reprend où vous en étiez', 'ok');
        }

        async function deleteConversation(c) {
            const ok = await ui.dialog({ title: 'Supprimer la conversation', okLabel: 'Supprimer', cancelLabel: 'Annuler',
                message: '« ' + c.title + ' » sera retirée de l\'historique. Ce que Claude a fait dans After Effects reste en place.' });
            if (!ok) return;
            try { env.fs.unlinkSync(c.file); } catch (e) { /* déjà retirée */ }
            renderHistory();
            status.set('Conversation supprimée', 'ok');
        }

        // --- États ---------------------------------------------------------------------
        function refresh() {
            sendBtn.set({ enabled: !busy && !question && !!claudePath });
            stopBtn.hidden = !busy;
            input.disabled = !!question;
            observeBtn.disabled = obs.shooting;
            observeBtn.classList.toggle('is-on', obs.on);
            observeBtn.setAttribute('aria-pressed', String(obs.on));
            observeLabel.textContent = obs.shooting ? 'Observer prépare…' : 'Observer';
            view.closest && view.closest('.s-view') && view.closest('.s-view').classList.toggle('is-busy', busy);
        }

        function setBusy(on) {
            busy = on;
            refresh();
        }

        async function locate() {
            try {
                claudePath = await claude.findClaude({ fs: env.fs, execFile: env.execFile, platform: env.platform, env: env.procEnv,
                    configured: SIMING.settings.get(claude.SETTINGS.path, '') });
            } catch (e) {
                claudePath = null;
            }
            setup.hidden = !!claudePath;
            main.hidden = !claudePath;
            if (!claudePath) status.set('Claude Code introuvable sur cet ordinateur', 'warn');
            refresh();
            return claudePath;
        }

        // --- Service MCP ----------------------------------------------------------------
        /** Active le serveur MCP s'il est éteint (même réglage que Réglages › Claude). */
        function ensureServer() {
            let cfg = mcp.readConfig(env.fs, env.file);
            if (!cfg.enabled || !cfg.token) {
                cfg = Object.assign({}, cfg, { enabled: true, token: cfg.token || mcp.newToken(env.crypto) });
                mcp.writeConfig(env.fs, env.path, env.file, cfg);
                env.emit(mcp.EVENTS.reload);
            }
            env.emit(mcp.EVENTS.tab, { client: clientId });
            if (!serviceSeen) {
                env.emit(mcp.EVENTS.ping);
                global.setTimeout(() => { if (!serviceSeen) { try { env.openService(); } catch (e) { /* signalé par Claude Code */ } } }, claude.TAB.serviceWait);
            }
            return cfg;
        }

        env.on(mcp.EVENTS.state, (d) => {
            if (!d) return;
            serviceSeen = true;
            env.emit(mcp.EVENTS.tab, { client: clientId });   // service (re)lancé : il apprend quel onglet répond
        });
        env.on(mcp.EVENTS.ask, (q) => { if (q && q.client === clientId) showQuestion(q); });

        // --- Claude Code -----------------------------------------------------------------
        function startSession() {
            const cfg = ensureServer();
            const model = String(SIMING.settings.get(claude.SETTINGS.model, '') || '').trim();
            const args = claude.buildArgs({ port: cfg.port, token: cfg.token, client: clientId, resume: sessionId, model, systemPrompt: claude.SYSTEM_PROMPT });
            try { env.fs.mkdirSync(workDir, { recursive: true }); } catch (e) { /* dossier de travail : repli ci-dessous */ }
            const procEnv = Object.assign({}, env.procEnv || {}, { MCP_TOOL_TIMEOUT: '900000' });
            resumed = !!sessionId;
            const s = claude.createSession({ spawn: env.spawn, file: claudePath, args, cwd: workDir, env: procEnv });
            s.on('*', (e) => { if (s === session) onEvent(e); });
            return s;
        }

        function onEvent(e) {
            switch (e.type) {
                case 'init':
                    if (e.sessionId) sessionId = e.sessionId;
                    modelLabel.textContent = e.model || '';
                    save();
                    break;
                case 'delta':
                    if (!stream) { const b = bubble('Claude', 's-msg-claude'); empty.remove(); chat.append(b.el); stream = { el: b.el, box: b.text, text: '' }; }
                    stream.text += e.text;
                    stream.box.textContent = stream.text;
                    scroll();
                    break;
                case 'text': {
                    const item = { type: 'claude', text: e.text };
                    if (stream) {
                        items.push(item);
                        stream.box.replaceChildren(claude.renderMarkdown(doc, e.text));
                        stream = null;
                    } else add(item);
                    save();
                    break;
                }
                case 'tool': {
                    stream = null;
                    if (/ask_user$/.test(e.name)) break;   // la carte de question en tient lieu
                    const item = { type: 'tool', id: e.id, name: e.name, label: claude.toolLabel(e.name, e.input), input: e.input, state: 'run', result: '' };
                    const el = add(item);
                    toolLines.set(e.id, { el, item });
                    actions++;
                    status.set('Claude travaille… (' + SIMING.plural(actions, 'action', 'actions') + ')', 'info');
                    save();
                    break;
                }
                case 'toolResult': {
                    const line = toolLines.get(e.id);
                    if (!line) break;
                    line.item.state = e.isError ? 'error' : 'ok';
                    line.item.result = String(e.text || '').slice(0, MAX_RESULT);
                    line.el.update();
                    for (const img of e.images || []) {
                        line.el.append(h('img', { class: 's-tool-thumb', 'data-role': 'claude-thumb', alt: 'Image rendue', src: 'data:' + img.mimeType + ';base64,' + img.data }));
                    }
                    save();
                    break;
                }
                case 'auth':
                    login.hidden = false;
                    status.set('Claude Code n\'est pas connecté : clique « Se connecter »', 'error');
                    break;
                case 'done':
                    stream = null;
                    setBusy(false);
                    if (e.isError) {
                        if (resumed && /no conversation found|session/i.test(e.text || '')) {
                            sessionId = null;
                            save();
                            status.set('Conversation précédente introuvable : renvoie ton message, Claude repart de zéro', 'warn');
                        } else if (login.hidden) status.set('Claude : ' + (e.text || 'erreur'), 'error');
                    } else {
                        login.hidden = true;
                        status.set('Claude a fini' + (actions ? ' (' + SIMING.plural(actions, 'action', 'actions') + ')' : ''), 'ok');
                    }
                    save();
                    break;
                case 'exit': {
                    session = null;
                    stream = null;
                    cancelQuestion();
                    for (const { el, item } of toolLines.values()) if (item.state === 'run') { item.state = 'error'; el.update(); }
                    const was = busy;
                    setBusy(false);
                    if (stoppedByUser) status.set('Arrêté : ce qui est fait reste (Ctrl+Z annule) ; la conversation reprend au prochain message', 'warn');
                    else if (claude.AUTH_ERROR.test(e.stderr || '') && e.code) { login.hidden = false; status.set('Claude Code n\'est pas connecté : clique « Se connecter »', 'error'); }
                    else if (was) status.set('Claude Code s\'est arrêté' + (e.code ? ' (code ' + e.code + ')' : '') + (e.stderr ? ' : ' + e.stderr.split('\n')[0] : '') + '. Renvoie ton message pour reprendre.', 'warn');
                    stoppedByUser = false;
                    save();
                    break;
                }
                default:
                    break;
            }
        }

        async function send() {
            if (busy || question || !claudePath) return;
            const text = input.value.trim();
            if (!text && !pendingObs) return;
            setBusy(true);
            actions = 0;
            status.set('Claude lit le contexte…', 'info');
            let c = null;
            try { c = await ctx.bridge.call('mcp', 'context', {}); } catch (e) { c = null; }
            const o = pendingObs;
            pendingObs = null;
            renderChips();
            const block = claude.contextText(c) + (o ? '\n' + o.text : '');
            const body = text || 'Voici ce que je viens de faire à la main (observation ci-dessus).';
            add({ type: 'user', text: body, summary: claude.contextSummary(c, !!o), context: block });
            input.value = '';
            save();
            if (!session || !session.alive) session = startSession();
            if (!session.send(block + '\n\n' + body)) {
                session = null;
                setBusy(false);
                status.set('Claude Code n\'a pas démarré (' + claudePath + ') : vérifie Réglages › Claude › Tester', 'error');
                return;
            }
            status.set('Claude travaille…', 'info');
        }

        function stop() {
            cancelQuestion();
            if (session && session.alive) { stoppedByUser = true; session.stop(); } else setBusy(false);
        }

        function openLogin() {
            if (!claudePath) return;
            const cmd = claude.loginCommand(env.platform, claudePath);
            try {
                env.execFile(cmd.file, cmd.args, { windowsHide: false }, () => {});
                status.set('Terminal ouvert : tape /login, choisis le compte de l\'équipe, puis renvoie ton message', 'info');
            } catch (e) {
                status.set('Terminal impossible à ouvrir : lance « claude » dans un terminal et tape /login', 'error');
            }
        }

        // --- Questions de Claude -----------------------------------------------------------
        function showQuestion(q) {
            cancelQuestion();
            const item = { type: 'question', question: String(q.question || ''), options: Array.isArray(q.options) ? q.options : [], answer: null };
            const card = add(item, q);
            question = { id: q.id, item, card };
            refresh();
            status.set('Claude te pose une question', 'warn');
            save();
        }

        function closeQuestion(text) {
            const qn = question;
            question = null;
            qn.item.answer = text;
            const done = renderQuestion(qn.item, null);
            qn.card.replaceWith(done);
            refresh();
            save();
        }

        function answer(text) {
            if (!question) return;
            env.emit(mcp.EVENTS.answer, { id: question.id, text });
            closeQuestion(text);
            status.set('Réponse envoyée à Claude', 'info');
        }

        function cancelQuestion() {
            if (!question) return;
            env.emit(mcp.EVENTS.answer, { id: question.id, cancelled: true });
            closeQuestion('(sans réponse)');
        }

        // --- Nouvelle conversation -----------------------------------------------------------
        /** Range le fil dans l'historique (sans confirmation : rien n'est perdu) et repart de zéro. */
        function newConversation() {
            const had = items.length > 0;
            archive();
            clearThread();
            conversationId = newId();
            toggleHistory(false);
            try { env.fs.unlinkSync(threadFile); } catch (e) { /* déjà vide */ }
            status.set(had ? 'Nouvelle conversation : l\'ancienne est dans l\'historique' : 'Nouvelle conversation', 'ok');
        }

        // --- Observer --------------------------------------------------------------------------
        async function shoot(compId, ids) {
            const out = { comp: null, layers: [], limited: false };
            let from = 1;
            while (from !== null && from !== undefined) {
                const args = { compId, from, count: 20 };
                if (ids) args.ids = ids;
                const r = await ctx.bridge.call('mcp', 'snapshot', args);
                out.comp = r.comp;
                out.limited = !!r.limited;
                out.layers.push(...r.layers);
                from = r.next;
            }
            return out;
        }

        async function projectIds() {
            try {
                const p = await ctx.bridge.call('mcp', 'project', { limit: 2000 });
                return p && p.items ? p.items : null;
            } catch (e) {
                return null;
            }
        }

        async function shootActive() {
            let a = null;
            try { a = await ctx.bridge.call('mcp', 'activeComp', {}); } catch (e) { a = null; }
            if (a && !obs.shots.has(a.id)) obs.shots.set(a.id, await shoot(a.id, null));
        }

        /** Relevé de la comp active : une comp vue pour la première fois est photographiée.
         *  Suspendu pendant une photo et pendant que Claude travaille. */
        async function poll() {
            if (!obs.on || obs.shooting || busy) return;
            obs.shooting = true;
            refresh();
            try { await shootActive(); } catch (e) { /* comp illisible : on réessaiera */ }
            obs.shooting = false;
            refresh();
        }

        async function observeStart() {
            obs.on = true;
            obs.shooting = true;
            obs.shots.clear();
            refresh();
            status.set('Observer prépare…', 'info');
            const list = await projectIds();
            obs.items = list ? new Set(list.map((it) => it.id)) : null;
            try {
                await shootActive();
            } catch (e) {
                status.set('Observer : photo impossible (' + e.message + ')', 'error');
            }
            obs.shooting = false;
            refresh();
            if (!obs.shots.size) status.set('Observer : ouvre une comp, je la photographie dès qu\'elle est active', 'warn');
            else status.set('Observer : fais ton geste dans After Effects, puis reclique Observer', 'info');
            obs.timer = global.setInterval(poll, claude.TAB.poll);
        }

        async function observeStop() {
            global.clearInterval(obs.timer);
            obs.timer = null;
            obs.shooting = true;
            refresh();
            status.set('Observer compare…', 'info');
            const diffs = [];
            for (const [id, before] of obs.shots) {
                let after;
                try { after = await shoot(id, before.limited ? before.layers.map((l) => l.id) : null); } catch (e) { continue; }   // comp supprimée
                const changes = claude.diffComp(before, after);
                if (changes.length || after.limited) diffs.push({ comp: after.comp, changes, limited: after.limited });
            }
            let newItems = [];
            const list = obs.items ? await projectIds() : null;
            if (list) newItems = list.filter((it) => !obs.items.has(it.id)).map((it) => it.name);
            obs.on = false;
            obs.shooting = false;
            obs.shots.clear();
            refresh();
            const n = claude.countChanges(diffs) + newItems.length;
            if (!n) { status.set('Observer : aucun changement vu', 'info'); return; }
            pendingObs = { text: claude.observationText(diffs.filter((d) => d.changes.length), { newItems }), count: n };
            renderChips();
            status.set('Observation prête : elle part avec ton prochain message', 'ok');
            input.focus();
        }

        function toggleObserve() {
            if (obs.shooting) return;
            if (obs.on) observeStop(); else observeStart();
        }

        function renderChips() {
            chips.replaceChildren();
            if (!pendingObs) return;
            const details = h('details', { class: 's-msg-context' },
                h('summary', { 'data-role': 'claude-observation', text: 'Observation : ' + SIMING.plural(pendingObs.count, 'changement', 'changements') }),
                h('pre', { class: 's-tool-detail', text: pendingObs.text }));
            chips.append(h('div', { class: 's-chip', 'data-role': 'claude-chip' }, details,
                h('button', { class: 's-icon-btn', type: 'button', 'data-role': 'claude-chip-remove', title: 'Ne pas joindre l\'observation',
                    'aria-label': 'Retirer l\'observation', onclick: () => { pendingObs = null; renderChips(); } }, ui.icon('fermer', 14))));
        }

        // --- Démarrage ---------------------------------------------------------------------------
        restore();
        refresh();
        env.emit(mcp.EVENTS.tab, { client: clientId });
        global.addEventListener('beforeunload', () => {
            try { env.emit(mcp.EVENTS.tab, { client: '' }); } catch (e) { /* service absent */ }
            if (session) session.stop();
        });
        const ready = locate();
        return { ready, clientId, poll, threadFile, historyDir };
    }

    SIMING.registerTool('claude', { help: HELP, mount });
})(window);
