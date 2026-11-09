/*
 * SIMING : Réglages › Claude (hub). Interrupteur « Claude Code peut agir », état du service,
 * commande à coller une fois dans un terminal, nouveau jeton, autre port.
 *
 *   SIMING.mcp.settingsPane(pane, { status, env }) -> { refresh() }
 *
 * env : accès aux réglages et au service, construit par SIMING.mcp.hubEnv(cs) :
 *   { fs, path, crypto, file, on(type, fn(data)), emit(type, data), openService() }
 * null hors After Effects (ou sans Node) : le volet l'explique.
 */
(function (global) {
    'use strict';

    const SIMING = global.SIMING;
    const mcp = SIMING.mcp;

    /** Attentes (ms) : réponse du service, puis son premier état une fois lancé par le hub. */
    mcp.TIMING = { answer: 1500, start: 5000 };

    /** Accès du hub aux réglages et au service (Node du panneau + CSInterface), ou null. */
    mcp.hubEnv = function (cs) {
        const req = SIMING.nodeRequire();
        if (!cs || !req) return null;
        try {
            const path = req('path');
            return {
                fs: req('fs'), path, crypto: req('crypto'),
                file: mcp.configFile(path, cs.getSystemPath(global.SystemPath.USER_DATA)),
                on(type, fn) { cs.addEventListener(type, (e) => fn(mcp.eventData(e))); },
                emit(type, data) {
                    const ev = new global.CSEvent(type, 'APPLICATION');
                    ev.data = JSON.stringify(data === undefined ? null : data);
                    cs.dispatchEvent(ev);
                },
                openService() { cs.requestOpenExtension(mcp.SERVICE_ID, ''); },
            };
        } catch (e) {
            return null;
        }
    };

    /** Copie un texte (presse-papier du navigateur, sinon sélection + commande Copier). */
    mcp.copyText = async function (doc, text) {
        const nav = doc.defaultView && doc.defaultView.navigator;
        try {
            if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
                await nav.clipboard.writeText(text);
                return true;
            }
        } catch (e) { /* repli ci-dessous */ }
        const area = doc.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        doc.body.append(area);
        area.select();
        let ok = false;
        try { ok = typeof doc.execCommand === 'function' && doc.execCommand('copy'); } catch (e) { ok = false; }
        area.remove();
        return !!ok;
    };

    /** Texte et niveau de la ligne d'état du service. */
    mcp.serviceState = function (cfg, service) {
        if (!cfg.enabled) return { text: 'Éteint : Claude Code ne peut pas agir dans After Effects.', level: 'info' };
        if (service && service.running && service.port === cfg.port) {
            const calls = service.calls ? ' · ' + SIMING.plural(service.calls, 'appel', 'appels') : '';
            return { text: 'Actif sur cet ordinateur, port ' + service.port + calls, level: 'ok' };
        }
        if (service && service.error) return { text: service.error, level: 'error' };
        if (service && service.missing) return { text: 'Service introuvable : relance After Effects.', level: 'error' };
        return { text: 'Démarrage du service…', level: 'info' };
    };

    mcp.settingsPane = function (pane, { status, env }) {
        const ui = SIMING.ui;
        const h = ui.h;
        const doc = pane.ownerDocument;
        pane.append(ui.sectionTitle('Claude Code'));
        if (!env) {
            pane.append(h('div', { class: 's-hint', 'data-role': 'claude-unavailable',
                text: 'Disponible dans After Effects seulement : ce panneau n\'a pas accès à Node.' }));
            return { refresh() {} };
        }

        let cfg = mcp.readConfig(env.fs, env.file);
        let service = null;      // dernier état publié par le service
        let timer = null;

        const toggle = ui.segmented({ role: 'claude-enabled', labels: ['Éteint', 'Activé'], onChange: (i) => setEnabled(i === 1) });
        const dot = h('span', { class: 's-dot' });
        const stateText = h('span', { class: 's-state-text' });
        const stateRow = h('div', { class: 's-state', 'data-role': 'claude-state' }, dot, stateText);
        const portBtn = ui.button({ label: 'Changer de port', role: 'claude-port', onClick: changePort });
        const command = h('code', { class: 's-command', 'data-role': 'claude-command' });
        const copyBtn = ui.primaryButton({ label: 'Copier la commande', role: 'claude-copy', onClick: copy });
        const tokenBtn = ui.button({ label: 'Nouveau jeton', role: 'claude-token', onClick: renew });
        const setup = h('div', { class: 's-settings-pane', 'data-role': 'claude-setup' },
            ui.sectionTitle('Relier Claude Code'),
            h('div', { class: 's-hint', text: 'Colle cette commande une fois dans un terminal (Claude Code installé), puis relance Claude Code. Demande-lui ensuite par exemple : « anime le titre de la comp active ».' }),
            command, copyBtn,
            h('div', { class: 's-hint', text: 'Déjà relié avec un autre jeton ou un autre port : lance d\'abord « ' + mcp.removeCommand() + ' ».' }),
            h('div', { class: 's-settings-actions' }, tokenBtn),
            h('div', { class: 's-hint', text: 'Lance After Effects avant Claude Code ; sinon, dans Claude Code : /mcp, puis reconnecte « siming ».' }));

        pane.append(
            h('div', { class: 's-hint', text: 'Laisse Claude Code (l\'assistant de code d\'Anthropic) lire le projet et agir dans After Effects, comme un script.' }),
            toggle, stateRow, portBtn, setup,
            h('div', { class: 's-hint', text: 'Claude peut tout modifier dans le projet ouvert : garde un œil sur ce qu\'il fait. Chacune de ses actions s\'annule d\'un Ctrl+Z (Cmd+Z). Le service n\'écoute que cet ordinateur et exige le jeton.' }));

        function render() {
            toggle.select(cfg.enabled ? 1 : 0);
            setup.hidden = !cfg.enabled;
            command.textContent = mcp.addCommand(cfg);
            const st = mcp.serviceState(cfg, service);
            stateText.textContent = st.text;
            stateText.title = st.text;
            stateRow.setAttribute('data-level', st.level);
            portBtn.hidden = !(cfg.enabled && service && service.errorCode === 'EADDRINUSE');
        }

        /** Attend l'état du service ; sans réponse, le lance (extension invisible), puis abandonne. */
        function expectState() {
            global.clearTimeout(timer);
            if (!cfg.enabled) return;
            service = null;
            timer = global.setTimeout(() => {
                try { env.openService(); } catch (e) { /* signalé ci-dessous faute de réponse */ }
                timer = global.setTimeout(() => { service = { missing: true }; render(); }, mcp.TIMING.start);
            }, mcp.TIMING.answer);
        }

        function save(next) {
            cfg = next;
            mcp.writeConfig(env.fs, env.path, env.file, cfg);
            expectState();
            env.emit(mcp.EVENTS.reload);
            render();
        }

        function setEnabled(on) {
            if (on === cfg.enabled) return;
            const next = Object.assign({}, cfg, { enabled: on });
            if (on && !next.token) next.token = mcp.newToken(env.crypto);
            try {
                save(next);
                status.set(on ? 'Claude Code peut agir dans After Effects' : 'Claude Code ne peut plus agir dans After Effects', 'ok');
            } catch (e) {
                status.set('Réglage impossible à enregistrer : ' + e.message, 'error');
                render();
            }
        }

        function renew() {
            try {
                save(Object.assign({}, cfg, { token: mcp.newToken(env.crypto) }));
                status.set('Nouveau jeton : l\'ancienne commande ne marche plus, recolle la nouvelle', 'warn');
            } catch (e) {
                status.set('Nouveau jeton impossible : ' + e.message, 'error');
            }
        }

        function changePort() {
            try {
                save(Object.assign({}, cfg, { port: mcp.otherPort(cfg.port) }));
                status.set('Port ' + cfg.port + ' : recolle la commande dans un terminal', 'warn');
            } catch (e) {
                status.set('Changement de port impossible : ' + e.message, 'error');
            }
        }

        async function copy() {
            const ok = await mcp.copyText(doc, mcp.addCommand(cfg));
            if (ok) status.set('Commande copiée : colle-la dans un terminal', 'ok');
            else status.set('Copie impossible : sélectionne la commande et copie-la à la main', 'warn');
        }

        env.on(mcp.EVENTS.state, (data) => {
            if (!data) return;
            global.clearTimeout(timer);
            service = data;
            render();
        });
        env.on(mcp.EVENTS.activity, (a) => {
            if (a && a.text) status.set(a.text, a.level);
            if (service) { service.calls = (service.calls || 0) + 1; render(); }
        });

        render();
        if (cfg.enabled) {
            expectState();
            env.emit(mcp.EVENTS.ping);
        }
        return {
            refresh() { cfg = mcp.readConfig(env.fs, env.file); render(); },
        };
    };
})(window);
