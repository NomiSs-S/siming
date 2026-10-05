/*
 * ============================================================================
 *  Unparent  -  outil hôte SIMING (ExtendScript, ES3)
 * ============================================================================
 *
 *  Détache temporairement les enfants d'un calque parent pour modifier ce
 *  parent sans impacter sa descendance, puis les rattache. La position
 *  apparente est conservée dans les deux sens : `layer.parent = …` compense
 *  comme le menu Parent d'After Effects (à l'instant courant).
 *
 *  Mémoire des liens rompus :
 *  - en session : l'objet `memory`, indexé par "idComp:idCalque" ;
 *  - persistante : balise [UP|idParent|NomParent] en fin de commentaire de
 *    l'enfant, qui survit à l'enregistrement et au redémarrage d'AE, retirée
 *    au rattachement.
 *
 *  Contraintes : ES3, jamais === entre deux calques, UTF-8 avec BOM.
 * ============================================================================
 */
(function () {

    var S  = $.global.SIMING;
    var ae = S.ae;

    var TOOL_NAME = 'Unparent';

    /** [UP|id|Nom] en fin de commentaire. Nom capturé jusqu'au dernier « ] »
     *  (tolère les noms contenant « ] » ou « | »). */
    var TAG_REGEX = /\s*\[UP\|(-?\d+)\|([\s\S]*)\]\s*$/;

    var STATE_LINKED   = 'linked';
    var STATE_DETACHED = 'detached';

    // ------------------------------------------------------------------------
    //  Mémoire de session : "idComp:idCalque" -> { parentId, parentName }
    // ------------------------------------------------------------------------
    var memory = {};

    function memoryKey(comp, layer) {
        return comp.id + ':' + ae.layerId(layer);
    }

    // ------------------------------------------------------------------------
    //  Balise de commentaire
    // ------------------------------------------------------------------------

    function parseTag(comment) {
        var m = TAG_REGEX.exec(comment || '');
        if (!m) return null;
        return { parentId: parseInt(m[1], 10), parentName: m[2] };
    }

    function removeTag(comment) {
        return (comment || '').replace(TAG_REGEX, '');
    }

    function addTag(comment, parentId, parentName) {
        var base = removeTag(comment);
        return (base.length ? base + ' ' : '') + '[UP|' + parentId + '|' + parentName + ']';
    }

    // ------------------------------------------------------------------------
    //  Lien rompu d'un calque
    // ------------------------------------------------------------------------

    /** Lien mémorisé. La balise fait foi : sans balise (retirée par Ctrl+Z ou à
     *  la main), l'entrée de session est oubliée ; avec balise, elle est recopiée
     *  en mémoire. La mémoire n'est donc qu'un reflet des balises. */
    function getBrokenLink(comp, layer) {
        var key = memoryKey(comp, layer);
        var tag = parseTag(layer.comment);
        if (!tag) {
            delete memory[key];
            return null;
        }
        memory[key] = tag;
        return tag;
    }

    /** Parent décrit par un lien, ou null. Ordre de confiance : identifiant ET
     *  nom concordants ; nom unique ; identifiant seul (renommé) ; premier homonyme. */
    function resolveParent(comp, link) {
        var byId = ae.findLayerById(comp, link.parentId);
        if (byId && byId.name === link.parentName) return byId;
        var byName = ae.findLayersByName(comp, link.parentName);
        if (byName.length === 1) return byName[0];
        if (byId) return byId;
        if (byName.length > 1) return byName[0];
        return null;
    }

    // ------------------------------------------------------------------------
    //  Analyse
    // ------------------------------------------------------------------------

    function makeEntry(layer, state) {
        return { id: ae.layerId(layer), name: layer.name, state: state };
    }

    /** Enfants directs encore liés à `target`, plus les calques dont la mémoire
     *  indique qu'ils lui appartenaient (détachés). */
    function analyze(comp, target) {
        var entries = [];
        for (var i = 1; i <= comp.numLayers; i++) {
            var layer = comp.layer(i);
            if (ae.sameLayer(layer, target)) continue;
            var parent = layer.parent;
            if (parent !== null && ae.sameLayer(parent, target)) {
                entries.push(makeEntry(layer, STATE_LINKED));
                continue;
            }
            if (parent !== null) continue;   // re-parenté à la main ailleurs : pas détaché
            var link = getBrokenLink(comp, layer);
            if (link) {
                var origin = resolveParent(comp, link);
                if (origin && ae.sameLayer(origin, target)) entries.push(makeEntry(layer, STATE_DETACHED));
            }
        }
        return entries;
    }

    /** Parent ciblé d'après la sélection : { target, entries, note?, error? }. */
    function resolveTarget(comp) {
        var selected = comp.selectedLayers;
        if (!selected || selected.length === 0) {
            return { target: null, entries: [], error: 'Aucun calque sélectionné dans « ' + comp.name + ' »' };
        }
        var layer   = selected[0];
        var entries = analyze(comp, layer);
        if (entries.length > 0) return { target: layer, entries: entries };

        // Pas d'enfant : le calque est peut-être lui-même un enfant détaché connu
        var link = (layer.parent === null) ? getBrokenLink(comp, layer) : null;
        if (link) {
            var origin = resolveParent(comp, link);
            if (origin) {
                return {
                    target:  origin,
                    entries: analyze(comp, origin),
                    note:    '« ' + layer.name + ' » est un enfant détaché : parent d\'origine ciblé'
                };
            }
        }
        return { target: layer, entries: [], error: '« ' + layer.name + ' » n\'a aucun enfant lié ni détaché' };
    }

    // ------------------------------------------------------------------------
    //  Actions (un seul groupe d'annulation chacune)
    // ------------------------------------------------------------------------

    /** Détache les calques dont l'identifiant est dans `ids`. { done, skipped[] } */
    function detach(comp, ids) {
        var report = { done: 0, skipped: [] };
        ae.undo(TOOL_NAME + ' : détacher', function () {
            for (var i = 0; i < ids.length; i++) {
                var layer = ae.findLayerById(comp, ids[i]);
                if (!layer) { report.skipped.push('calque n°' + ids[i] + ' : introuvable'); continue; }
                try {
                    var parent = layer.parent;
                    if (parent === null) { report.skipped.push(layer.name + ' : déjà détaché'); continue; }
                    if (layer.locked)    { report.skipped.push(layer.name + ' : calque verrouillé'); continue; }
                    var link = { parentId: ae.layerId(parent), parentName: parent.name };
                    // Balise et mémoire d'abord : si le détachement échoue, on annule.
                    var key = memoryKey(comp, layer);
                    var previousComment = layer.comment;
                    layer.comment = addTag(previousComment, link.parentId, link.parentName);
                    memory[key] = link;
                    try {
                        layer.parent = null;   // compense les transformations : pas de saut
                    } catch (e2) {
                        try { layer.comment = previousComment; } catch (e3) { }
                        delete memory[key];
                        throw e2;
                    }
                    report.done++;
                } catch (e) {
                    report.skipped.push(layer.name + ' : ' + e.toString());
                }
            }
        });
        return report;
    }

    /** Rattache les calques dont l'identifiant est dans `ids` à leur parent d'origine. */
    function restore(comp, ids) {
        var report = { done: 0, skipped: [] };
        ae.undo(TOOL_NAME + ' : rattacher', function () {
            for (var i = 0; i < ids.length; i++) {
                var layer = ae.findLayerById(comp, ids[i]);
                if (!layer) { report.skipped.push('calque n°' + ids[i] + ' : introuvable'); continue; }
                try {
                    var link = getBrokenLink(comp, layer);
                    if (!link) { report.skipped.push(layer.name + ' : aucun lien mémorisé'); continue; }
                    var parent = resolveParent(comp, link);
                    if (!parent) { report.skipped.push(layer.name + ' : parent « ' + link.parentName + ' » introuvable'); continue; }
                    if (layer.locked) { report.skipped.push(layer.name + ' : calque verrouillé'); continue; }
                    layer.parent  = parent;
                    layer.comment = removeTag(layer.comment);
                    delete memory[memoryKey(comp, layer)];
                    report.done++;
                } catch (e) {
                    report.skipped.push(layer.name + ' : ' + e.toString());
                }
            }
        });
        return report;
    }

    // ------------------------------------------------------------------------
    //  Plan d'action et parents en attente
    // ------------------------------------------------------------------------

    /** Bouton principal, bouton secondaire et bandeau d'après l'état des enfants. */
    function planActions(entries) {
        var linked = [], detached = [];
        for (var i = 0; i < entries.length; i++) {
            if (entries[i].state === STATE_LINKED) linked.push(entries[i].id);
            else detached.push(entries[i].id);
        }
        var nL = linked.length, nD = detached.length, total = nL + nD;
        var plan = { nLinked: nL, nDetached: nD, primary: null, secondary: null, banner: '' };

        if (nL > 0 && nD === 0) {
            plan.primary = { action: 'detach', ids: linked,
                label: (nL === 1) ? 'Détacher 1 enfant' : 'Détacher les ' + nL + ' enfants' };
        } else if (nL > 0) {
            plan.primary = { action: 'detach', ids: linked,
                label: (nL === 1) ? 'Détacher le dernier lié' : 'Détacher les ' + nL + ' restants' };
            plan.secondary = { action: 'restore', ids: detached,
                label: (nD === 1) ? 'Rattacher 1 détaché' : 'Rattacher les ' + nD + ' détachés' };
        } else if (nD > 0) {
            plan.primary = { action: 'restore', ids: detached,
                label: (nD === 1) ? 'Rattacher 1 enfant' : 'Rattacher les ' + nD + ' enfants' };
        }

        if (nD > 0 && nL === 0) plan.banner = 'Tous les enfants sont détachés : le parent bouge librement';
        else if (nD > 0) plan.banner = ((nD === 1) ? '1 enfant détaché' : nD + ' enfants détachés') + ' sur ' + total;
        return plan;
    }

    /** Enfants détachés ailleurs dans le projet, groupés par comp et par parent
     *  d'origine ; le parent (excludeCompId, excludeTargetId) est exclu. */
    function findPending(project, excludeCompId, excludeTargetId) {
        var groups = [], index = {};
        if (!project || !project.numItems) return groups;
        for (var n = 1; n <= project.numItems; n++) {
            var comp = project.item(n);
            if (!(comp instanceof CompItem)) continue;
            for (var i = 1; i <= comp.numLayers; i++) {
                var layer = comp.layer(i);
                if (layer.parent !== null) continue;      // relié entre-temps : pas en attente
                var link = getBrokenLink(comp, layer);
                if (!link) continue;
                var origin = resolveParent(comp, link);
                var originId = origin ? ae.layerId(origin) : null;
                if (comp.id === excludeCompId && originId !== null && originId === excludeTargetId) continue;
                var key = comp.id + '|' + (origin ? '#' + originId : '?' + link.parentName);
                if (!index.hasOwnProperty(key)) {
                    index[key] = { comp: comp, compName: comp.name,
                                   parentName: origin ? origin.name : link.parentName,
                                   found: !!origin, ids: [] };
                    groups.push(index[key]);
                }
                index[key].ids.push(ae.layerId(layer));
            }
        }
        return groups;
    }

    // ------------------------------------------------------------------------
    //  API publique : chaque fonction renvoie l'état complet de la vue
    // ------------------------------------------------------------------------

    var MSG_START        = 'Sélectionne un calque parent dans la timeline, puis clique sur la carte Parent';
    var MSG_NO_COMP      = 'Aucune composition active : ouvre une composition';
    var MSG_COMP_CHANGED = 'La composition active a changé : clique sur la carte Parent';
    var MSG_COMP_GONE    = 'La composition du parent n\'existe plus : clique sur la carte Parent';

    function status(text, level) { return { text: text, level: level }; }

    function mapPending(groups) {
        var out = [];
        for (var i = 0; i < groups.length; i++) {
            var g = groups[i];
            out.push({ compId: g.comp.id, compName: g.compName, parentName: g.parentName, found: g.found, ids: g.ids });
        }
        return out;
    }

    /** État complet. `entries` peut être fourni pour éviter une seconde analyse.
     *  `noPending` : « en attente » non recalculé (pending null, la vue garde sa
     *  liste). Détacher ou rattacher dans le parent courant ne la change pas (il
     *  en est exclu) et le parcours de tout le projet coûte cher. */
    function snapshot(comp, target, st, report, entries, noPending) {
        var hasTarget = !!(comp && target);
        var list = entries || (hasTarget ? analyze(comp, target) : []);
        return {
            comp:    comp ? { id: comp.id, name: comp.name } : null,
            target:  hasTarget ? { id: ae.layerId(target), name: target.name, label: target.label, color: ae.labelColor(target.label) } : null,
            entries: list,
            plan:    planActions(list),
            pending: noPending ? null : mapPending(findPending(app.project, comp ? comp.id : null, hasTarget ? ae.layerId(target) : null)),
            report:  report || null,
            status:  st
        };
    }

    /** « 3 enfants : 2 lié(s), 1 détaché(s) », précédé d'une note éventuelle. */
    function describe(entries, note) {
        var plan = planActions(entries);
        return (note ? note + ' · ' : '') + S.plural(entries.length, 'enfant', 'enfants') + ' : ' +
               plan.nLinked + ' lié(s), ' + plan.nDetached + ' détaché(s)';
    }

    /** Comp et parent courants d'après les identifiants envoyés par la vue. */
    function current(args) {
        var hasComp = args && args.compId !== undefined && args.compId !== null;
        var comp = hasComp ? ae.findCompById(args.compId) : null;
        var hasTarget = comp && args.targetId !== undefined && args.targetId !== null;
        return { comp: comp, target: hasTarget ? ae.findLayerById(comp, args.targetId) : null };
    }

    /** « « A » détaché » pour un seul calque nommé, sinon « 3 enfants détachés ». */
    function summarize(verb, rep, singleName) {
        if (rep.done === 1 && singleName) return '« ' + singleName + ' » ' + verb;
        return rep.done + ' ' + ((rep.done > 1) ? 'enfants ' + verb + 's' : 'enfant ' + verb);
    }

    function resultStatus(summary, rep) {
        var text = summary;
        if (rep.skipped.length > 0) text += ' · ' + rep.skipped.length + ' ignoré(s)';
        if (rep.done > 0) text += ' · Ctrl+Z pour annuler';   // rien de fait : rien à annuler
        return status(text, (rep.skipped.length > 0 || rep.done === 0) ? 'warn' : 'ok');
    }

    /** Détacher / rattacher dans le parent courant : pending null (voir snapshot). */
    function act(action, args) {
        var cur = current(args);
        if (!cur.comp) return snapshot(null, null, status(MSG_COMP_GONE, 'warn'), null, null, true);
        if (!cur.target) return snapshot(cur.comp, null, status('Le parent n\'existe plus dans « ' + cur.comp.name + ' »', 'warn'), null, null, true);
        var active = ae.getActiveComp();
        if (!active || active.id !== cur.comp.id) return snapshot(cur.comp, cur.target, status(MSG_COMP_CHANGED, 'warn'), null, null, true);

        var ids = (args && args.ids) ? args.ids : [];
        if (ids.length === 0) {
            return snapshot(cur.comp, cur.target,
                status((action === 'detach') ? 'Aucun enfant à détacher' : 'Aucun enfant à rattacher', 'warn'), null, null, true);
        }
        var single = null;
        if (ids.length === 1) {
            var layer = ae.findLayerById(cur.comp, ids[0]);
            if (layer) single = layer.name;
        }
        var rep = (action === 'detach') ? detach(cur.comp, ids) : restore(cur.comp, ids);
        var verb = (action === 'detach') ? 'détaché' : 'rattaché';
        return snapshot(cur.comp, cur.target, resultStatus(summarize(verb, rep, single), rep), rep, null, true);
    }

    var api = {
        /** État de départ : rien de ciblé, parents en attente. */
        init: function () {
            return snapshot(null, null, status(MSG_START, 'info'));
        },

        /** Lit la sélection. Sans sélection, ré-analyse le parent courant s'il y en a un. */
        pick: function (args) {
            var comp = ae.getActiveComp();
            if (!comp) return snapshot(null, null, status(MSG_NO_COMP, 'error'));
            var sel = comp.selectedLayers;
            var nothingSelected = !sel || sel.length === 0;
            if (nothingSelected && args && args.compId === comp.id && args.targetId !== null && args.targetId !== undefined) {
                var kept = ae.findLayerById(comp, args.targetId);
                if (kept) {
                    return snapshot(comp, kept,
                        status('Liste mise à jour · sélectionne un autre calque pour changer de parent', 'info'));
                }
            }
            var r = resolveTarget(comp);
            if (!r.target) return snapshot(comp, null, status(r.error, 'error'));
            if (r.entries.length === 0) {
                return snapshot(comp, r.target,
                    status(r.error || ('« ' + r.target.name + ' » n\'a aucun enfant lié ni détaché'), 'warn'), null, r.entries);
            }
            return snapshot(comp, r.target, status(describe(r.entries, r.note), 'info'), null, r.entries);
        },

        /** Ré-analyse le parent courant (même si la comp active a changé). */
        refresh: function (args) {
            var cur = current(args);
            if (!cur.comp) return snapshot(null, null, status(MSG_COMP_GONE, 'warn'));
            if (!cur.target) return snapshot(cur.comp, null, status('Le parent n\'existe plus dans « ' + cur.comp.name + ' »', 'warn'));
            var entries = analyze(cur.comp, cur.target);
            return snapshot(cur.comp, cur.target, status(describe(entries), 'info'), null, entries);
        },

        detach: function (args) { return act('detach', args); },

        restore: function (args) { return act('restore', args); },

        /** Rattache un groupe en attente (éventuellement dans une autre comp). */
        restorePending: function (args) {
            var cur = current(args);
            var pc = ae.findCompById(args.pendingCompId);
            if (!pc) return snapshot(cur.comp, cur.target, status('Cette composition n\'existe plus', 'warn'));
            var rep = restore(pc, args.ids || []);
            var summary = rep.done + ' ' + ((rep.done > 1) ? 'enfants rattachés' : 'enfant rattaché') +
                          ' à « ' + (args.parentName || '?') + ' »';
            return snapshot(cur.comp, cur.target, resultStatus(summary, rep), rep);
        }
    };

    api._core = {
        memory:        memory,
        parseTag:      parseTag,
        addTag:        addTag,
        removeTag:     removeTag,
        resolveParent: resolveParent,
        analyze:       analyze,
        resolveTarget: resolveTarget,
        detach:        detach,
        restore:       restore,
        planActions:   planActions,
        findPending:   findPending
    };

    S.registerTool('unparent', api);
    return api;

})();
