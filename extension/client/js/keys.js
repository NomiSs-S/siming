/*
 * SIMING : raccourcis clavier du panneau. Un registre d'actions (hub et outils), des
 * liaisons par défaut ou choisies dans Réglages (localStorage « siming.keys »), un
 * seul écouteur clavier par page.
 *
 *   SIMING.keys.register({ id, label, group, defaultKey, run, when })
 *   SIMING.keys.attach(document)        -> détacher()
 *   SIMING.keys.record(document, cb)    -> annuler()   cb({ code, label }) ; cb(null) = aucun ; cb(false) = annulé
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

    /** Libellé d'une frappe réelle : la lettre imprimée sur la touche (AZERTY compris). */
    function labelFor(e, id) {
        const code = String(id).split('+').pop();
        const k = e.key || '';
        const printable = k.length === 1 && k !== ' ' && !isDigit(code) && !/^Numpad/.test(code);
        return label(id, printable ? k.toUpperCase() : null);
    }

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
    }
    function unregister(id) {
        const i = actions.findIndex((a) => a.id === id);
        if (i >= 0) actions.splice(i, 1);
    }
    function unregisterGroup(group) {
        for (let i = actions.length - 1; i >= 0; i--) if (actions[i].group === group) actions.splice(i, 1);
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
        return freed;
    }
    function reset() { overrides = {}; save(); }

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

    /** Capture la prochaine frappe pour Réglages : cb({ code, label }) ; Retour arrière ou
     *  Suppr : cb(null) ; Échap ou annuler() : cb(false). L'écouteur est suspendu pendant ce temps. */
    function record(doc, cb) {
        recording = true;
        let done = false;
        const finish = (result) => {
            if (done) return;
            done = true;
            recording = false;
            doc.removeEventListener('keydown', onKey, true);
            cb(result);
        };
        const onKey = (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (e.code === 'Escape') { finish(false); return; }
            if (e.code === 'Backspace' || e.code === 'Delete') { finish(null); return; }
            const id = describe(e);
            if (!id) return;                     // modificateur seul : on attend la suite
            finish({ code: id, label: labelFor(e, id) });
        };
        doc.addEventListener('keydown', onKey, true);
        return () => finish(false);
    }

    SIMING.keys = {
        HUB_GROUP, describe, label, labelFor,
        register, unregister, unregisterGroup, actions: () => actions.slice(),
        bindings, binding, setBinding, reset,
        attach, record, isRecording: () => recording,
    };
})(window);
