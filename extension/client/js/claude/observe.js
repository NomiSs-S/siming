/*
 * SIMING : onglet Claude, bouton Observer. Différence entre deux photos d'une comp
 * (mcp.snapshot du cœur hôte, paquets réunis) et texte d'observation donné à Claude.
 * Pur : ni DOM ni Node.
 *
 *   SIMING.claude.diffComp(before, after) -> Change[]
 *   SIMING.claude.observationText([{ comp, changes, limited? }], { newItems }?) -> string
 *   SIMING.claude.countChanges(diffs) -> number
 *
 * before / after : { comp, layers: [LayerShot], limited? } ; calques appariés par id.
 * Change : { kind, layer?: { id, index, name }, … } avec kind parmi comp, layerAdded,
 * layerRemoved, renamed, moved, parent, switch, timing, prop, keys, expression,
 * effectAdded, effectRemoved, maskAdded, maskRemoved.
 */
(function (global) {
    'use strict';

    const SIMING = global.SIMING = global.SIMING || {};
    const claude = SIMING.claude = SIMING.claude || {};

    const COMP_FIELDS = [['name', 'nom'], ['width', 'largeur'], ['height', 'hauteur'], ['duration', 'durée'], ['frameRate', 'cadence']];
    const SWITCHES = ['enabled', 'solo', 'shy', 'locked', 'threeD'];
    const TIMING = [['inPoint', 'début'], ['outPoint', 'fin'], ['startTime', 'départ']];
    const MAX_VALUE = 200;      // caractères d'une valeur dans le texte
    const MAX_SETTINGS = 30;    // réglages listés pour un effet ajouté

    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const ref = (l) => (l.source ? { id: l.id, index: l.index, name: l.name, source: l.source } : { id: l.id, index: l.index, name: l.name });

    /** Apparie les effets (ou masques) d'avant et d'après : même matchName et même nom, sinon
     *  même matchName. Rend { before: { clé: jeton }, after: { clé: jeton }, added, removed }. */
    function pairList(list0, list1) {
        const a = list0 || [], b = list1 || [];
        const used = new Set();
        const out = { before: {}, after: {}, added: [], removed: [] };
        a.forEach((x, i) => { out.before[x.key] = 'k' + i; });
        const find = (pred) => a.findIndex((x, i) => !used.has(i) && pred(x));
        for (const y of b) {
            let i = find((x) => x.matchName === y.matchName && x.name === y.name);
            if (i < 0) i = find((x) => x.matchName === y.matchName);
            if (i < 0) { out.added.push(y); out.after[y.key] = 'new:' + y.key; continue; }
            used.add(i);
            out.after[y.key] = 'k' + i;
        }
        a.forEach((x, i) => { if (!used.has(i)) out.removed.push(x); });
        return out;
    }

    /** Clé d'une propriété avec l'effet ou le masque remplacé par son jeton d'appariement. */
    function normKey(key, tokens) {
        for (const prefix of Object.keys(tokens)) {
            if (key === prefix || key.startsWith(prefix + '/')) return tokens[prefix] + key.slice(prefix.length);
        }
        return key;
    }

    function normProps(props, tokens) {
        const out = {};
        for (const k of Object.keys(props || {})) out[normKey(k, tokens)] = Object.assign({ key: k }, props[k]);
        return out;
    }

    const lastSegment = (key) => String(key).split('/').pop();

    /** Réglages d'un effet ajouté : nom court et valeur (ou nombre de keyframes). */
    function settingsOf(props, prefix) {
        const out = [];
        for (const k of Object.keys(props || {})) {
            if (!k.startsWith(prefix + '/')) continue;
            const p = props[k];
            const name = String(p.path || k).split(' › ').pop();
            out.push({ name, value: p.keys ? null : p.value, keys: p.keys ? p.keys.length : 0, expression: p.expression || null });
        }
        return out;
    }

    function keysChange(layer, key, p0, p1) {
        const k0 = p0.keys || [], k1 = p1.keys || [];
        if (same(k0, k1)) return null;
        const t0 = k0.map((k) => k.time), t1 = k1.map((k) => k.time);
        return {
            kind: 'keys', layer, key, path: p1.path || p0.path, matchName: lastSegment(key),
            added: t1.filter((t) => !t0.includes(t)), removed: t0.filter((t) => !t1.includes(t)),
            before: k0, after: k1,
        };
    }

    function layerChanges(l0, l1, byId0, byId1) {
        const layer = ref(l1);
        const out = [];
        if (l0.name !== l1.name) out.push({ kind: 'renamed', layer, before: l0.name, after: l1.name });
        if ((l0.parent || null) !== (l1.parent || null)) {
            const who = (id, map) => (id === null || id === undefined ? null : (map.get(id) ? ref(map.get(id)) : { id, index: null, name: '?' }));
            out.push({ kind: 'parent', layer, before: who(l0.parent, byId0), after: who(l1.parent, byId1) });
        }
        for (const f of SWITCHES) if (l0[f] !== l1[f]) out.push({ kind: 'switch', layer, field: f, before: l0[f], after: l1[f] });
        for (const [f, label] of TIMING) if (l0[f] !== l1[f]) out.push({ kind: 'timing', layer, field: f, label, before: l0[f], after: l1[f] });

        const fx = pairList(l0.effects, l1.effects);
        const masks = pairList(l0.masks, l1.masks);
        const p0 = normProps(l0.props, Object.assign({}, fx.before, masks.before));
        const p1 = normProps(l1.props, Object.assign({}, fx.after, masks.after));
        for (const e of fx.added) out.push({ kind: 'effectAdded', layer, effect: { name: e.name, matchName: e.matchName }, settings: settingsOf(l1.props, e.key) });
        for (const e of fx.removed) out.push({ kind: 'effectRemoved', layer, effect: { name: e.name, matchName: e.matchName } });
        for (const m of masks.added) out.push({ kind: 'maskAdded', layer, mask: { name: m.name, mode: m.mode, inverted: m.inverted } });
        for (const m of masks.removed) out.push({ kind: 'maskRemoved', layer, mask: { name: m.name } });
        // Effet allumé ou éteint
        for (const e of l1.effects || []) {
            const tok = fx.after[e.key];
            const i = tok && tok.startsWith('k') ? Number(tok.slice(1)) : -1;
            const was = i >= 0 ? l0.effects[i] : null;
            if (was && was.enabled !== e.enabled) out.push({ kind: 'switch', layer, field: 'effet « ' + e.name + ' »', before: was.enabled, after: e.enabled });
        }

        for (const k of Object.keys(p1)) {
            const a = p0[k], b = p1[k];
            if (!a) continue;   // effet ou masque ajouté : déjà décrit
            const key = b.key;
            const kc = keysChange(layer, key, a, b);
            if (kc) out.push(kc);
            else if (!b.keys && !same(a.value, b.value)) {
                out.push({ kind: 'prop', layer, key, path: b.path, matchName: lastSegment(key), before: a.value, after: b.value });
            }
            if ((a.expression || '') !== (b.expression || '') || (a.expressionEnabled === false) !== (b.expressionEnabled === false)) {
                out.push({ kind: 'expression', layer, key, path: b.path, matchName: lastSegment(key),
                    before: a.expression || null, after: b.expression || null, enabled: b.expressionEnabled !== false });
            }
        }
        return out;
    }

    claude.diffComp = function (before, after) {
        const out = [];
        const c0 = (before && before.comp) || {}, c1 = (after && after.comp) || {};
        for (const [f, label] of COMP_FIELDS) {
            if (c0[f] !== undefined && c1[f] !== undefined && c0[f] !== c1[f]) out.push({ kind: 'comp', field: f, label, before: c0[f], after: c1[f] });
        }
        const limited = !!((before && before.limited) || (after && after.limited));
        const L0 = (before && before.layers) || [], L1 = ((after && after.layers) || []).slice().sort((a, b) => a.index - b.index);
        const byId0 = new Map(L0.map((l) => [l.id, l])), byId1 = new Map(L1.map((l) => [l.id, l]));
        // Ordre relatif des calques présents des deux côtés (un ajout ne compte pas comme déplacement)
        const common0 = L0.filter((l) => byId1.has(l.id)).sort((a, b) => a.index - b.index).map((l) => l.id);
        const common1 = L1.filter((l) => byId0.has(l.id)).map((l) => l.id);
        for (const l1 of L1) {
            const l0 = byId0.get(l1.id);
            if (!l0) {
                if (!limited) out.push({ kind: 'layerAdded', layer: ref(l1), shot: l1 });
                continue;
            }
            if (common0.indexOf(l1.id) !== common1.indexOf(l1.id)) out.push({ kind: 'moved', layer: ref(l1), before: l0.index, after: l1.index });
            out.push(...layerChanges(l0, l1, byId0, byId1));
        }
        if (!limited) for (const l0 of L0) if (!byId1.has(l0.id)) out.push({ kind: 'layerRemoved', layer: ref(l0) });
        return out;
    };

    claude.countChanges = function (diffs) {
        return (diffs || []).reduce((n, d) => n + ((d && d.changes) ? d.changes.length : 0), 0);
    };

    // --- Texte -------------------------------------------------------------------------

    function fmt(v) {
        if (v === undefined || v === null) return '—';
        const s = typeof v === 'string' ? v : JSON.stringify(v);
        return s.length > MAX_VALUE ? s.slice(0, MAX_VALUE) + '…' : s;
    }

    const fmtTime = (t) => fmt(Math.round(Number(t) * 1000) / 1000) + ' s';
    const layerName = (l) => (l ? (l.index ? l.index + ' ' : '') + '« ' + l.name + ' » (id ' + l.id + ')' : 'aucun');

    function keyList(keys) {
        return keys.map((k) => fmtTime(k.time) + ' = ' + fmt(k.value) + (k.outType && k.outType !== 'linear' ? ' (' + k.outType + ')' : '')).join(' ; ');
    }

    function changeLine(c) {
        const prop = c.path + ' (' + c.matchName + ')';
        switch (c.kind) {
            case 'layerAdded': {
                const s = c.shot || {};
                const fx = (s.effects || []).map((e) => '« ' + e.name + ' » (' + e.matchName + ')');
                return 'calque ajouté (' + (s.kind || '?') + (s.source ? ', source ' + s.source.name + ' id ' + s.source.id : '') + ')' +
                    (fx.length ? ' avec les effets ' + fx.join(', ') : '');
            }
            case 'layerRemoved': return 'calque supprimé';
            case 'renamed': return 'renommé « ' + c.before + ' » → « ' + c.after + ' »';
            case 'moved': return 'déplacé dans la pile : ' + c.before + ' → ' + c.after;
            case 'parent': return 'parent : ' + layerName(c.before) + ' → ' + layerName(c.after);
            case 'switch': return 'interrupteur ' + c.field + ' : ' + c.before + ' → ' + c.after;
            case 'timing': return c.label + ' (' + c.field + ') : ' + fmtTime(c.before) + ' → ' + fmtTime(c.after);
            case 'prop': return prop + ' : ' + fmt(c.before) + ' → ' + fmt(c.after);
            case 'keys': {
                const parts = [];
                if (c.added.length) parts.push(SIMING.plural(c.added.length, 'keyframe ajoutée', 'keyframes ajoutées') + ' (' + c.added.map(fmtTime).join(', ') + ')');
                if (c.removed.length) parts.push(SIMING.plural(c.removed.length, 'keyframe supprimée', 'keyframes supprimées') + ' (' + c.removed.map(fmtTime).join(', ') + ')');
                if (!parts.length) parts.push('keyframes modifiées');
                return prop + ' : ' + parts.join(', ') + (c.after.length ? ' ; maintenant : ' + keyList(c.after) : ' ; plus de keyframes');
            }
            case 'expression':
                if (!c.after) return prop + ' : expression retirée';
                return prop + ' : expression ' + (c.before ? 'changée' : 'posée') + (c.enabled ? '' : ' (désactivée)') + ' : ' + fmt(c.after);
            case 'effectAdded': {
                const list = c.settings.slice(0, MAX_SETTINGS).map((s) => s.name + ' ' + (s.keys ? 'animé (' + s.keys + ' keyframes)' : fmt(s.value)) +
                    (s.expression ? ' [expression : ' + fmt(s.expression) + ']' : ''));
                return 'effet ajouté « ' + c.effect.name + ' » (' + c.effect.matchName + ')' + (list.length ? ' : ' + list.join(', ') : '') +
                    (c.settings.length > MAX_SETTINGS ? '…' : '');
            }
            case 'effectRemoved': return 'effet retiré « ' + c.effect.name + ' » (' + c.effect.matchName + ')';
            case 'maskAdded': return 'masque ajouté « ' + c.mask.name + ' »' + (c.mask.inverted ? ' (inversé)' : '');
            case 'maskRemoved': return 'masque retiré « ' + c.mask.name + ' »';
            default: return c.kind;
        }
    }

    /** En-tête d'un calque : Calque 3 « LOGO » (id 118, source logo.ai id 7) : */
    function header(l) {
        const src = l.source ? ', source ' + l.source.name + ' id ' + l.source.id : '';
        return 'Calque ' + l.index + ' « ' + l.name + ' » (id ' + l.id + src + ') :';
    }

    function compBlock(d) {
        const comp = d.comp || {};
        const lines = [];
        let current = null;
        for (const c of d.changes || []) {
            if (c.kind === 'comp') { lines.push('Comp : ' + c.label + ' ' + fmt(c.before) + ' → ' + fmt(c.after)); continue; }
            if (!current || current !== c.layer.id) {
                current = c.layer.id;
                lines.push(header(c.layer));
            }
            lines.push('  ' + changeLine(c));
        }
        if (d.limited) lines.push('(Comp de plus de 300 calques : seuls les calques sélectionnés au début ou à la fin ont été observés.)');
        if (!lines.length) lines.push('Aucun changement vu.');
        return '<observation comp="' + String(comp.name).replace(/"/g, '\'') + ' (id ' + comp.id + ')">\n' + lines.join('\n') + '\n</observation>';
    }

    claude.observationText = function (diffs, extra) {
        const blocks = (diffs || []).map(compBlock);
        const items = (extra && extra.newItems) || [];
        if (items.length) blocks.push('<observation_projet>\nÉléments ajoutés au projet : ' + items.join(', ') + '\n</observation_projet>');
        return blocks.join('\n');
    };
})(window);
