/*
 * SIMING : raccourcis clavier du panneau. Un registre d'actions (hub et outils), des
 * liaisons par défaut ou choisies dans Réglages (localStorage « siming.keys »), un
 * seul écouteur clavier par page.
 *
 *   SIMING.keys.register({ id, label, group, defaultKey, run, when })
 *   SIMING.keys.attach(document)        -> détacher()
 *   SIMING.keys.record(document, cb, onProgress)  -> annuler()   cb({ code, label }) ; cb(null) = aucun ; cb(false) = annulé
 *   SIMING.keys.interest(os)            frappes à réclamer à After Effects ; onChange(cb) quand elles changent
 *
 * Une frappe est identifiée par le `code` physique de la touche (KeyA, Digit1,
 * Numpad5…) précédé des modificateurs Ctrl+Alt+Shift+Meta : indépendant de la
 * disposition du clavier. Rangée de chiffres : Maj ignorée (en AZERTY, « 1 » se tape
 * avec Maj). Le libellé affiché vient de la touche réellement frappée (e.key) quand
 * c'est un caractère, sinon d'une table (Entrée, Pavé 5, ↑…).
 *
 * Deux actions peuvent partager une touche si elles ne sont jamais actives ensemble
 * (deux outils différents) ; le groupe « Panneau » (hub) est actif en permanence.
 */
(function (global) {
    'use strict';

    const SIMING = global.SIMING = global.SIMING || {};
    const HUB_GROUP = 'Panneau';
    const STORE = 'keys';

    const CODE_LABELS = {
        Enter: 'Entrée', Space: 'Espace', Escape: 'Échap', Tab: 'Tab', Backspace: 'Retour', Delete: 'Suppr',
        Insert: 'Inser', Home: 'Début', End: 'Fin', PageUp: 'Page ↑', PageDown: 'Page ↓',
        ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
        NumpadAdd: 'Pavé +', NumpadSubtract: 'Pavé −', NumpadMultiply: 'Pavé ×', NumpadDivide: 'Pavé ÷',
        NumpadDecimal: 'Pavé .', NumpadComma: 'Pavé ,', CapsLock: 'Verr. maj',
    };
    const MOD_LABELS = { Ctrl: 'Ctrl', Alt: 'Alt', Shift: 'Maj', Meta: 'Cmd' };
    const MODIFIER_CODES = /^(Control|Shift|Alt|Meta|OS)(Left|Right)?$/;
    const FIELDS = { INPUT: 1, TEXTAREA: 1, SELECT: 1 };

    const actions = [];          // dans l'ordre d'enregistrement
    const attached = new Set();  // documents déjà écoutés
    let overrides = null;        // id -> { code, label } | null, lu une fois
    let recording = false;

    const isDigit = (code) => /^Digit\d$/.test(code);

    /** Identifiant d'une frappe : « Ctrl+Shift+KeyE », ou null (modificateur seul). */
    function describe(e) {
        let code = e.code || '';
        if (!code || MODIFIER_CODES.test(code)) return null;
        if (code === 'NumpadEnter') code = 'Enter';
        const mods = [];
        if (e.ctrlKey) mods.push('Ctrl');
        if (e.altKey) mods.push('Alt');
        if (e.shiftKey && !isDigit(code)) mods.push('Shift');
        if (e.metaKey) mods.push('Meta');
        return mods.concat(code).join('+');
    }

    function codeLabel(code) {
        if (CODE_LABELS[code]) return CODE_LABELS[code];
        let m;
        if ((m = /^Digit(\d)$/.exec(code))) return m[1];
        if ((m = /^Numpad(\d)$/.exec(code))) return 'Pavé ' + m[1];
        if ((m = /^Key([A-Z])$/.exec(code))) return m[1];
        return code;
    }

    /** Libellé d'un identifiant : « Ctrl + Maj + E ». keyName remplace le nom de la touche. */
    function label(id, keyName) {
        if (!id) return '';
        const parts = String(id).split('+');
        const code = parts.pop();
        return parts.map((m) => MOD_LABELS[m] || m).concat(keyName || codeLabel(code)).join(' + ');
    }

    /** Libellé d'une frappe réelle : la lettre imprimée sur la touche (AZERTY compris). Avec Ctrl,
     *  Alt ou Cmd, e.key peut donner un autre caractère (AltGr + E = €) : seule une lettre est gardée. */
    function labelFor(e, id) {
        const code = String(id).split('+').pop();
        const k = e.key || '';
        const chord = e.ctrlKey || e.altKey || e.metaKey;
        const printable = k.length === 1 && k !== ' ' && !isDigit(code) && !/^Numpad/.test(code) && (!chord || /^[a-z]$/i.test(k));
        return label(id, printable ? k.toUpperCase() : null);
    }

    /** « Ctrl + Alt » : modificateurs tenus pendant une frappe (vide si aucun). */
    function heldLabel(e) {
        const mods = [];
        if (e.ctrlKey) mods.push('Ctrl');
        if (e.altKey) mods.push('Alt');
        if (e.shiftKey) mods.push('Shift');
        if (e.metaKey) mods.push('Meta');
        return mods.map((m) => MOD_LABELS[m]).join(' + ');
    }

    // --- Touches réclamées à After Effects (CEP : registerKeyEventsInterest) ------------
    // Sans cette déclaration, After Effects garde pour lui les combinaisons avec Ctrl, Alt ou
    // Cmd même quand le panneau a le focus. Codes : Windows = touches virtuelles (VK_…),
    // macOS = codes de touche (Events.h, kVK_…).
    const WIN_CODES = {
        Enter: 0x0D, Space: 0x20, Escape: 0x1B, Tab: 0x09, Backspace: 0x08, Delete: 0x2E, Insert: 0x2D,
        Home: 0x24, End: 0x23, PageUp: 0x21, PageDown: 0x22, ArrowLeft: 0x25, ArrowUp: 0x26, ArrowRight: 0x27, ArrowDown: 0x28,
        NumpadMultiply: 0x6A, NumpadAdd: 0x6B, NumpadSubtract: 0x6D, NumpadDecimal: 0x6E, NumpadDivide: 0x6F,
    };
    const MAC_CODES = {
        KeyA: 0x00, KeyS: 0x01, KeyD: 0x02, KeyF: 0x03, KeyH: 0x04, KeyG: 0x05, KeyZ: 0x06, KeyX: 0x07, KeyC: 0x08,
        KeyV: 0x09, KeyB: 0x0B, KeyQ: 0x0C, KeyW: 0x0D, KeyE: 0x0E, KeyR: 0x0F, KeyY: 0x10, KeyT: 0x11, KeyO: 0x1F,
        KeyU: 0x20, KeyI: 0x22, KeyP: 0x23, KeyL: 0x25, KeyJ: 0x26, KeyK: 0x28, KeyN: 0x2D, KeyM: 0x2E,
        Digit1: 0x12, Digit2: 0x13, Digit3: 0x14, Digit4: 0x15, Digit6: 0x16, Digit5: 0x17, Digit9: 0x19, Digit7: 0x1A,
        Digit8: 0x1C, Digit0: 0x1D,
        Numpad0: 0x52, Numpad1: 0x53, Numpad2: 0x54, Numpad3: 0x55, Numpad4: 0x56, Numpad5: 0x57, Numpad6: 0x58,
        Numpad7: 0x59, Numpad8: 0x5B, Numpad9: 0x5C,
        NumpadMultiply: 0x43, NumpadAdd: 0x45, NumpadSubtract: 0x4E, NumpadDecimal: 0x41, NumpadDivide: 0x4B,
        Enter: 0x24, Space: 0x31, Escape: 0x35, Tab: 0x30, Backspace: 0x33, Delete: 0x75,
        Home: 0x73, End: 0x77, PageUp: 0x74, PageDown: 0x79, ArrowLeft: 0x7B, ArrowRight: 0x7C, ArrowDown: 0x7D, ArrowUp: 0x7E,
        F1: 0x7A, F2: 0x78, F3: 0x63, F4: 0x76, F5: 0x60, F6: 0x61, F7: 0x62, F8: 0x64, F9: 0x65, F10: 0x6D, F11: 0x67, F12: 0x6F,
    };
    const MAC_NUMPAD_ENTER = 0x4C;

    /** Code de la touche `code` (KeyA, Digit5…) pour os 'win' | 'mac', ou null si inconnue. */
    function keyCodeOf(code, os) {
        const has = (o) => Object.prototype.hasOwnProperty.call(o, code);
        if (os === 'mac') return has(MAC_CODES) ? MAC_CODES[code] : null;
        let m;
        if ((m = /^Digit(\d)$/.exec(code))) return 0x30 + Number(m[1]);
        if ((m = /^Key([A-Z])$/.exec(code))) return m[1].charCodeAt(0);
        if ((m = /^Numpad(\d)$/.exec(code))) return 0x60 + Number(m[1]);
        if ((m = /^F(\d{1,2})$/.exec(code)) && Number(m[1]) >= 1 && Number(m[1]) <= 12) return 0x6F + Number(m[1]);
        return has(WIN_CODES) ? WIN_CODES[code] : null;
    }

    const MOD_SETS = [[], ['Ctrl'], ['Alt'], ['Shift'], ['Ctrl', 'Alt'], ['Ctrl', 'Shift'], ['Alt', 'Shift'], ['Ctrl', 'Alt', 'Shift']];
    const MAC_MOD_SETS = MOD_SETS.concat([['Meta'], ['Meta', 'Shift'], ['Meta', 'Alt'], ['Meta', 'Ctrl'], ['Meta', 'Alt', 'Shift']]);

    /** Frappes à réclamer à After Effects : [{ keyCode, ctrlKey?, altKey?, shiftKey?, metaKey? }].
     *  Hors capture : une par raccourci lié (rangée de chiffres aussi avec Maj, pour l'AZERTY).
     *  Pendant la capture d'un raccourci (Réglages) : toutes les touches connues avec toutes les
     *  combinaisons de modificateurs, sinon une combinaison neuve n'arriverait jamais au panneau. */
    function interest(os) {
        const out = [], seen = new Set();
        const add = (code, mods) => {
            const keyCode = keyCodeOf(code, os);
            if (keyCode === null) return;
            const push = (kc, extra) => {
                const ev = { keyCode: kc };
                for (const m of mods.concat(extra || [])) ev[m === 'Meta' ? 'metaKey' : m.toLowerCase() + 'Key'] = true;
                const k = JSON.stringify(ev);
                if (!seen.has(k)) { seen.add(k); out.push(ev); }
            };
            push(keyCode);
            if (isDigit(code) && !mods.includes('Shift')) push(keyCode, ['Shift']);
            if (code === 'Enter' && os === 'mac') push(MAC_NUMPAD_ENTER);
        };
        if (recording) {
            const codes = Object.keys(os === 'mac' ? MAC_CODES : WIN_CODES);
            for (let i = 0; i <= 9; i++) codes.push('Digit' + i, 'Numpad' + i);
            for (let i = 0; i < 26; i++) codes.push('Key' + String.fromCharCode(65 + i));
            for (let i = 1; i <= 12; i++) codes.push('F' + i);
            for (const code of codes) for (const mods of (os === 'mac' ? MAC_MOD_SETS : MOD_SETS)) add(code, mods);
            return out;
        }
        const map = bindings();
        for (const a of actions) {
            const b = map[a.id];
            if (!b) continue;
            const parts = String(b.code).split('+');
            const code = parts.pop();
            add(code, parts);
        }
        return out;
    }

    // --- Avis de changement (raccourcis enregistrés, liés, capture) --------------------
    const listeners = [];
    let notifying = false;
    /** Prévient les abonnés une fois, après la série de changements en cours. */
    function changed() {
        if (notifying) return;
        notifying = true;
        Promise.resolve().then(() => {
            notifying = false;
            for (const cb of listeners) { try { cb(); } catch (e) { /* un abonné ne bloque pas les autres */ } }
        });
    }
    function onChange(cb) { listeners.push(cb); }

    // --- Mémoire (localStorage via SIMING.settings) ------------------------------
    function load() {
        if (overrides) return overrides;
        overrides = {};
        try {
            const raw = SIMING.settings.get(STORE, '');
            const parsed = raw ? JSON.parse(raw) : null;
            if (parsed && typeof parsed === 'object') overrides = parsed;
        } catch (e) { overrides = {}; }
        return overrides;
    }
    function save() { SIMING.settings.set(STORE, JSON.stringify(load())); }

    // --- Registre ------------------------------------------------------------------
    function byId(id) { return actions.find((a) => a.id === id) || null; }

    /** Enregistre (ou remplace) une action : { id, label, group, defaultKey, run, when }. */
    function register(action) {
        if (!action || !action.id || typeof action.run !== 'function') throw new Error('Action invalide');
        unregister(action.id);
        actions.push({
            id: String(action.id), label: action.label || String(action.id), group: action.group || HUB_GROUP,
            defaultKey: action.defaultKey || null, run: action.run, when: action.when || null,
        });
        changed();
    }
    function unregister(id) {
        const i = actions.findIndex((a) => a.id === id);
        if (i >= 0) { actions.splice(i, 1); changed(); }
    }
    function unregisterGroup(group) {
        for (let i = actions.length - 1; i >= 0; i--) if (actions[i].group === group) actions.splice(i, 1);
        changed();
    }

    /** Deux actions peuvent-elles être actives en même temps ? (même groupe, ou le hub) */
    function clash(a, b) { return a.group === b.group || a.group === HUB_GROUP || b.group === HUB_GROUP; }

    /** Liaisons effectives : id -> { code, label, user } | null. Les choix de l'utilisateur
     *  l'emportent ; une liaison par défaut en conflit avec un choix est retirée. */
    function bindings() {
        const ov = load(), out = {}, chosen = [];
        for (const a of actions) {
            if (Object.prototype.hasOwnProperty.call(ov, a.id)) {
                const o = ov[a.id];
                out[a.id] = (o && o.code) ? { code: o.code, label: o.label || label(o.code), user: true } : null;
                if (out[a.id]) chosen.push(a);
            } else {
                out[a.id] = a.defaultKey ? { code: a.defaultKey, label: label(a.defaultKey), user: false } : null;
            }
        }
        for (const a of actions) {
            const b = out[a.id];
            if (!b || b.user) continue;
            for (const c of chosen) {
                if (out[c.id].code === b.code && clash(a, c)) { out[a.id] = null; break; }
            }
        }
        return out;
    }
    function binding(id) { return bindings()[id] || null; }

    /** Lie une action à une frappe ({ code, label }) ou l'en délie (null). Les autres actions
     *  en conflit perdent leur raccourci ; renvoie leurs libellés. */
    function setBinding(id, key) {
        const action = byId(id);
        if (!action) throw new Error('Action inconnue : ' + id);
        const ov = load(), freed = [];
        if (key && key.code) {
            const current = bindings();
            for (const a of actions) {
                const b = current[a.id];
                if (a.id !== id && b && b.code === key.code && clash(a, action)) {
                    ov[a.id] = null;
                    freed.push(a.label);
                }
            }
            ov[id] = { code: key.code, label: key.label || label(key.code) };
        } else {
            ov[id] = null;
        }
        save();
        changed();
        return freed;
    }
    function reset() { overrides = {}; save(); changed(); }

    // --- Écouteur ------------------------------------------------------------------
    const inField = (t) => !!(t && FIELDS[t.tagName]);
    /** Entrée / Espace sur un bouton : le bouton gère la frappe lui-même (clic natif). */
    const nativeKey = (e) => !!(e.target && e.target.tagName === 'BUTTON' &&
        (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space'));

    /** Un seul écouteur par document : exécute l'action liée à la frappe si elle est disponible. */
    function attach(doc) {
        if (attached.has(doc)) return () => {};
        attached.add(doc);
        const onKey = (e) => {
            if (recording || e.defaultPrevented || inField(e.target) || nativeKey(e)) return;
            const id = describe(e);
            if (!id || doc.querySelector('[data-role=dialog]')) return;
            const map = bindings();
            for (const a of actions) {
                const b = map[a.id];
                if (!b || b.code !== id || (a.when && !a.when())) continue;
                e.preventDefault();
                a.run();
                return;
            }
        };
        doc.addEventListener('keydown', onKey);
        return () => { doc.removeEventListener('keydown', onKey); attached.delete(doc); };
    }

    /** Capture la prochaine frappe pour Réglages : une touche seule ou une combinaison
     *  (Ctrl + Alt + 5) ; cb({ code, label }) ; Retour arrière ou Suppr : cb(null) ; Échap ou
     *  annuler() : cb(false). onProgress(« Ctrl + Alt ») suit les modificateurs tenus (« » quand
     *  plus aucun). L'écouteur est suspendu pendant ce temps, et toutes les touches sont
     *  réclamées à After Effects (voir interest). */
    function record(doc, cb, onProgress) {
        recording = true;
        changed();
        let done = false;
        const finish = (result) => {
            if (done) return;
            done = true;
            recording = false;
            doc.removeEventListener('keydown', onKey, true);
            doc.removeEventListener('keyup', onUp, true);
            changed();
            cb(result);
        };
        const onKey = (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (e.code === 'Escape') { finish(false); return; }
            if ((e.code === 'Backspace' || e.code === 'Delete') && !heldLabel(e)) { finish(null); return; }
            const id = describe(e);
            if (!id) { if (onProgress) onProgress(heldLabel(e)); return; }   // modificateur seul : on attend la suite
            finish({ code: id, label: labelFor(e, id) });
        };
        const onUp = (e) => {
            if (onProgress && MODIFIER_CODES.test(e.code || '')) onProgress(heldLabel(e));
        };
        doc.addEventListener('keydown', onKey, true);
        doc.addEventListener('keyup', onUp, true);
        return () => finish(false);
    }

    SIMING.keys = {
        HUB_GROUP, describe, label, labelFor,
        register, unregister, unregisterGroup, actions: () => actions.slice(),
        bindings, binding, setBinding, reset,
        attach, record, isRecording: () => recording,
        interest, keyCodeOf, onChange,
    };
})(window);
