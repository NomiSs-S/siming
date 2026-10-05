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

    /** Lien mémorisé : mémoire de session d'abord, balise ensuite (recopiée). */
    function getBrokenLink(comp, layer) {
        var key = memoryKey(comp, layer);
        if (memory[key]) return memory[key];
        var tag = parseTag(layer.comment);
        if (tag) {
            memory[key] = tag;
            return tag;
        }
        return null;
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
        var link = getBrokenLink(comp, layer);
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
                    layer.parent  = null;   // compense les transformations : pas de saut
                    layer.comment = addTag(layer.comment, link.parentId, link.parentName);
                    memory[memoryKey(comp, layer)] = link;
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
    //  Enregistrement (l'API publique est complétée à la tâche suivante)
    // ------------------------------------------------------------------------
    var api = {};

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
