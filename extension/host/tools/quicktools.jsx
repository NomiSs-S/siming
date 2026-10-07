/*
 * ============================================================================
 *  Quick Tools  -  outil hôte SIMING (ExtendScript, ES3)
 * ============================================================================
 *
 *  Quatre gestes rapides sur la sélection de la timeline :
 *  - lissage de vitesse des keyframes sélectionnées (Bézier, vitesse 0, influence) ;
 *    « entrée » = départ du mouvement (côté sortant de la keyframe), « sortie » = arrivée ;
 *  - expression Elastic sur les propriétés animées sélectionnées, pilotée par le
 *    pseudo-effet « Elastic Controller » (préréglage host/presets/ElasticController.ffx) ;
 *  - point d'ancrage des calques sélectionnés sur une des 9 positions de leur boîte,
 *    position compensée (rien ne bouge à l'écran) ; les keyframes existantes d'ancrage
 *    et de position sont décalées, jamais créées ;
 *  - alignement et répartition des calques sélectionnés sur leurs bords visibles.
 *
 *  Chaque fonction d'API renvoie { report: { done, skipped[] } | null, status: { text, level } }.
 *  Contraintes : ES3, jamais === entre deux calques, UTF-8 avec BOM.
 * ============================================================================
 */
(function () {

    var S  = $.global.SIMING;
    var ae = S.ae;

    var TOOL_NAME   = 'Quick Tools';
    var EFFECT_NAME = 'Elastic Controller';
    var PRESET_FILE = 'ElasticController.ffx';

    // Chemin du préréglage, calculé au chargement : <host>/presets/ElasticController.ffx
    var presetFsPath = null;
    try {
        var here = new File($.fileName);              // host/tools/quicktools.jsx
        presetFsPath = here.parent.parent.fsName + '/presets/' + PRESET_FILE;
    } catch (e0) {
        presetFsPath = null;
    }

    /** Expression de l'auteur, reprise telle quelle (curseurs 1, 2, 3 de l'effet). */
    var ELASTIC_EXPRESSION = [
        'try {',
        '  amp = effect("Elastic Controller")(1) / 200;',
        '  freq = effect("Elastic Controller")(2) / 30;',
        '  decay = effect("Elastic Controller")(3) / 10;',
        '  n = 0;',
        '  if (numKeys > 0){',
        '    n = nearestKey(time).index; ',
        '    if (key(n).time > time){',
        '      n--;',
        '    }',
        '  }',
        '  if (n == 0){',
        '    t = 0;',
        '  } else {',
        '    t = time - key(n).time;',
        '  }',
        '',
        '  if (n > 0){',
        '    v = velocityAtTime(key(n).time - thisComp.frameDuration/10);',
        '    value + v*amp*Math.sin(freq*t*2*Math.PI)/Math.exp(decay*t);',
        '  } else {',
        '    value;',
        '  }',
        '} catch (e) {',
        '  value = value;',
        '}'
    ].join('\n');

    var ELASTIC_MARK = /effect\("Elastic Controller"\)/;

    function isElastic(expression) {
        return ELASTIC_MARK.test(String(expression || ''));
    }

    // ------------------------------------------------------------------------
    //  Fonctions pures
    // ------------------------------------------------------------------------

    /** Influence de 0,1 à 100 ; valeur invalide = lissage d'After Effects (33,333). */
    function clampInfluence(x) {
        var n = parseFloat(x);
        if (isNaN(n)) return 33.333;
        if (n < 0.1) return 0.1;
        if (n > 100) return 100;
        return n;
    }

    /** n objets KeyframeEase(0, influence). */
    function easeList(n, influence) {
        var out = [];
        for (var i = 0; i < n; i++) out.push(new KeyframeEase(0, influence));
        return out;
    }

    /** Cible [x, y] dans l'espace du calque pour une case 1..9 du pavé (7 8 9 en haut). */
    function anchorTarget(rect, cell) {
        var c = parseInt(cell, 10);
        if (!(c >= 1 && c <= 9)) c = 5;
        var fx = ((c - 1) % 3) * 0.5;
        var fy = 1 - Math.floor((c - 1) / 3) * 0.5;
        return [rect.left + rect.width * fx, rect.top + rect.height * fy];
    }

    // Géométrie commune (siming.jsx) : matrices 2D, boîtes, décalage de propriété.
    var G = S.geom;
    var matMul = G.matMul, matApply = G.matApply, matLinear = G.matLinear, matLinearInverse = G.matLinearInverse;
    var layerMatrix = G.layerMatrix, compensate = G.compensate, addDelta = G.addDelta, bounds = G.bounds, union = G.union;
    var readTransform = ae.readTransform, layerToComp = ae.layerToComp, toParentSpace = ae.toParentSpace;
    // Boîte d'un calque = ce qui en est visible : masques compris (ancrage, aligner, répartir).
    var sourceRect = ae.visibleRect, offsetProperty = ae.offsetProperty;

    var EDGES = { left: 1, centerX: 1, right: 1, top: 1, centerY: 1, bottom: 1 };

    function isHorizontal(edge) {
        return edge === 'left' || edge === 'centerX' || edge === 'right';
    }

    function measure(box, edge) {
        switch (edge) {
            case 'left':    return box.left;
            case 'centerX': return (box.left + box.right) / 2;
            case 'right':   return box.right;
            case 'top':     return box.top;
            case 'centerY': return (box.top + box.bottom) / 2;
            default:        return box.bottom;
        }
    }

    function asDelta(edge, d) {
        return isHorizontal(edge) ? [d, 0] : [0, d];
    }

    /** Déplacements [dx, dy] (espace comp) pour amener `edge` de chaque boîte sur celui de `ref`. */
    function alignDeltas(boxes, edge, ref) {
        var target = measure(ref, edge), out = [];
        for (var i = 0; i < boxes.length; i++) out.push(asDelta(edge, target - measure(boxes[i], edge)));
        return out;
    }

    /** Répartition : extrêmes fixes, les autres espacés régulièrement sur `edge` (au moins 3 boîtes). */
    function distributeDeltas(boxes, edge) {
        var n = boxes.length, out = [], i;
        for (i = 0; i < n; i++) out.push([0, 0]);
        if (n < 3) return out;
        var order = [];
        for (i = 0; i < n; i++) order.push({ i: i, m: measure(boxes[i], edge) });
        order.sort(function (p, q) { return (p.m - q.m) || (p.i - q.i); });
        var first = order[0].m, step = (order[n - 1].m - first) / (n - 1);
        for (var k = 1; k < n - 1; k++) out[order[k].i] = asDelta(edge, first + step * k - order[k].m);
        return out;
    }

    // ------------------------------------------------------------------------
    //  Accès After Effects
    // ------------------------------------------------------------------------

    /** Pose une valeur : keyframe à l'instant courant si la propriété est animée. */
    function setProp(prop, value, time) {
        if (prop.numKeys > 0) prop.setValueAtTime(time, value);
        else prop.setValue(value);
    }

    /** Déplace la position d'un calque de [dx, dy] dans l'espace de son parent (Z conservé). */
    function shiftPosition(layer, d, time) {
        var tr = layer.property('ADBE Transform Group');
        var posProp = tr.property('ADBE Position');
        if (posProp.dimensionsSeparated) {
            var xp = tr.property('ADBE Position_0'), yp = tr.property('ADBE Position_1');
            setProp(xp, xp.valueAtTime(time, false) + d[0], time);
            setProp(yp, yp.valueAtTime(time, false) + d[1], time);
        } else {
            var v = posProp.valueAtTime(time, false);
            setProp(posProp, (v.length > 2) ? [v[0] + d[0], v[1] + d[1], v[2]] : [v[0] + d[0], v[1] + d[1]], time);
        }
    }

    /** Parcourt les propriétés feuilles d'un groupe (ou d'un calque). */
    function walkProperties(group, fn) {
        var n = group.numProperties;
        for (var i = 1; i <= n; i++) {
            var p = group.property(i);
            if (!p) continue;
            if (p.propertyType === PropertyType.PROPERTY) fn(p);
            else walkProperties(p, fn);
        }
    }

    var selectedProperties = ae.selectedProperties, selectedKeyframes = ae.selectedKeyframes, ownerLayer = ae.ownerLayer;

    // ------------------------------------------------------------------------
    //  Lissage
    // ------------------------------------------------------------------------

    /** Bézier et KeyframeEase(0, influence) sur le côté visé, l'autre côté conservé.
     *  Les modes parlent du mouvement, pas de la keyframe : « entrée » (in) = le mouvement
     *  part de la keyframe, donc son côté SORTANT (keyOut…) ; « sortie » (out) = le
     *  mouvement arrive sur la keyframe, donc son côté ENTRANT (keyIn…). After Effects
     *  nomme à l'envers (Easy Ease In = côté entrant) : ne pas « corriger » ceci. */
    function applyEase(prop, k, mode, influence) {
        var HOLD = KeyframeInterpolationType.HOLD, BEZ = KeyframeInterpolationType.BEZIER;
        var doOut = (mode === 'in' || mode === 'both'), doIn = (mode === 'out' || mode === 'both');
        var inType = prop.keyInInterpolationType(k), outType = prop.keyOutInterpolationType(k);
        if ((doIn && inType === HOLD) || (doOut && outType === HOLD)) throw new Error('keyframe en maintien');
        prop.setInterpolationTypeAtKey(k, doIn ? BEZ : inType, doOut ? BEZ : outType);
        var curIn = prop.keyInTemporalEase(k), curOut = prop.keyOutTemporalEase(k);
        prop.setTemporalEaseAtKey(k,
            doIn ? easeList(curIn.length, influence) : curIn,
            doOut ? easeList(curOut.length, influence) : curOut);
    }

    // ------------------------------------------------------------------------
    //  Elastic
    // ------------------------------------------------------------------------

    /** Ajoute l'effet « Elastic Controller » au calque s'il n'y est pas (préréglage .ffx). */
    function ensureController(comp, layer) {
        if (layer.effect(EFFECT_NAME)) return;
        if (!presetFsPath) throw new Error('préréglage introuvable (chemin inconnu)');
        var file = new File(presetFsPath);
        if (!file.exists) throw new Error('préréglage introuvable : ' + presetFsPath);
        // applyPreset vise les calques sélectionnés : on isole la sélection sur ce calque, puis on la rétablit.
        var saved = comp.selectedLayers, i;
        for (i = 0; i < saved.length; i++) saved[i].selected = false;
        layer.selected = true;
        try {
            layer.applyPreset(file);
        } finally {
            layer.selected = false;
            for (i = 0; i < saved.length; i++) saved[i].selected = true;
        }
        if (!layer.effect(EFFECT_NAME)) throw new Error('l\'effet « ' + EFFECT_NAME + ' » n\'a pas été ajouté');
    }

    function layerHasElastic(layer) {
        var found = false;
        walkProperties(layer, function (p) {
            if (!found && p.canSetExpression && isElastic(p.expression)) found = true;
        });
        return found;
    }

    // ------------------------------------------------------------------------
    //  Réponses
    // ------------------------------------------------------------------------

    var MSG_NO_COMP = 'Aucune composition active : ouvre une composition';
    var MSG_START   = 'Sélectionne des keyframes ou des calques dans la timeline, puis clique sur un geste';

    function status(text, level) { return { text: text, level: level }; }
    function warn(text, skipped) {
        return { report: skipped && skipped.length ? { done: 0, skipped: skipped } : null, status: status(text, 'warn') };
    }
    function error(text) { return { report: null, status: status(text, 'error') }; }

    function result(summary, rep) {
        var text = summary;
        if (rep.skipped.length > 0) text += ' · ' + rep.skipped.length + ' ignoré(s)';
        if (rep.done > 0) text += ' · Ctrl+Z pour annuler';
        return { report: rep, status: status(text, (rep.skipped.length > 0 || rep.done === 0) ? 'warn' : 'ok') };
    }

    function fmt(n) { return String(Math.round(n * 10) / 10); }

    var EDGE_ALIGN = { left: 'à gauche', centerX: 'au centre', right: 'à droite', top: 'en haut', centerY: 'au milieu', bottom: 'en bas' };
    var EDGE_DIST  = { left: 'bords gauches', centerX: 'centres horizontaux', right: 'bords droits',
                       top: 'bords hauts', centerY: 'centres verticaux', bottom: 'bords bas' };

    /** Calques sélectionnés avec leur boîte dans la comp ; les autres sont listés dans `skipped`. */
    function boxedLayers(comp, time, skipped) {
        var layers = comp.selectedLayers, items = [];
        for (var i = 0; i < layers.length; i++) {
            var layer = layers[i];
            try {
                if (layer.locked) throw new Error('calque verrouillé');
                items.push({ layer: layer, box: bounds(sourceRect(layer, time), layerToComp(layer, time)) });
            } catch (e) {
                skipped.push(layer.name + ' : ' + e.message);
            }
        }
        return items;
    }

    function moveLayers(items, deltas, time, undoName, rep) {
        ae.undo(undoName, function () {
            for (var i = 0; i < items.length; i++) {
                try {
                    var d = deltas[i];
                    if (Math.abs(d[0]) > 1e-6 || Math.abs(d[1]) > 1e-6) {
                        shiftPosition(items[i].layer, toParentSpace(items[i].layer, d, time), time);
                    }
                    rep.done++;
                } catch (e) {
                    rep.skipped.push(items[i].layer.name + ' : ' + e.message);
                }
            }
        });
    }

    // ------------------------------------------------------------------------
    //  API publique
    // ------------------------------------------------------------------------

    var api = {
        init: function () {
            return { report: null, status: status(MSG_START, 'info') };
        },

        /** Lisse les keyframes sélectionnées. args : { mode: 'in' | 'out' | 'both', influence }. */
        ease: function (args) {
            var comp = ae.getActiveComp();
            if (!comp) return error(MSG_NO_COMP);
            var mode = (args && args.mode) || 'both';
            if (mode !== 'in' && mode !== 'out' && mode !== 'both') mode = 'both';
            var influence = clampInfluence(args ? args.influence : null);
            var keys = selectedKeyframes(comp);
            if (keys.length === 0) return warn('Aucune keyframe sélectionnée : sélectionne des keyframes dans la timeline');
            var rep = { done: 0, skipped: [] };
            ae.undo(TOOL_NAME + ' : lisser', function () {
                for (var i = 0; i < keys.length; i++) {
                    try {
                        applyEase(keys[i].prop, keys[i].index, mode, influence);
                        rep.done++;
                    } catch (e) {
                        rep.skipped.push(keys[i].prop.name + ' n°' + keys[i].index + ' : ' + e.message);
                    }
                }
            });
            var side = (mode === 'in') ? 'entrée' : (mode === 'out') ? 'sortie' : 'entrée et sortie';
            return result(S.plural(rep.done, 'keyframe lissée', 'keyframes lissées') + ', ' + side + ' ' + fmt(influence) + ' %', rep);
        },

        /** Pose l'expression Elastic (et l'effet) sur les propriétés animées sélectionnées. */
        elastic: function () {
            var comp = ae.getActiveComp();
            if (!comp) return error(MSG_NO_COMP);
            var props = selectedProperties(comp), targets = [];
            for (var i = 0; i < props.length; i++) if (props[i].numKeys > 0) targets.push(props[i]);
            if (targets.length === 0) return warn('Aucune propriété animée sélectionnée : sélectionne des keyframes ou des propriétés animées');
            var rep = { done: 0, skipped: [] };
            ae.undo(TOOL_NAME + ' : Elastic', function () {
                for (var j = 0; j < targets.length; j++) {
                    var p = targets[j];
                    try {
                        if (!p.canSetExpression) throw new Error('n\'accepte pas d\'expression');
                        var layer = ownerLayer(p);
                        if (layer.locked) throw new Error('calque verrouillé');
                        ensureController(comp, layer);
                        p.expression = ELASTIC_EXPRESSION;
                        p.expressionEnabled = true;
                        rep.done++;
                    } catch (e) {
                        rep.skipped.push(p.name + ' : ' + e.message);
                    }
                }
            });
            return result('Elastic appliqué à ' + S.plural(rep.done, 'propriété', 'propriétés'), rep);
        },

        /** Retire l'expression Elastic des propriétés sélectionnées, et l'effet s'il ne sert plus. */
        elasticRemove: function () {
            var comp = ae.getActiveComp();
            if (!comp) return error(MSG_NO_COMP);
            var props = selectedProperties(comp), targets = [];
            for (var i = 0; i < props.length; i++) if (props[i].canSetExpression && isElastic(props[i].expression)) targets.push(props[i]);
            if (targets.length === 0) return warn('Aucune propriété élastique sélectionnée');
            var rep = { done: 0, skipped: [] }, touched = [];
            ae.undo(TOOL_NAME + ' : retirer Elastic', function () {
                var j, k;
                for (j = 0; j < targets.length; j++) {
                    try {
                        var layer = ownerLayer(targets[j]);
                        if (layer.locked) throw new Error('calque verrouillé');
                        targets[j].expression = '';
                        rep.done++;
                        var id = ae.layerId(layer), seen = false;
                        for (k = 0; k < touched.length; k++) if (ae.layerId(touched[k]) === id) seen = true;
                        if (!seen) touched.push(layer);
                    } catch (e) {
                        rep.skipped.push(targets[j].name + ' : ' + e.message);
                    }
                }
                for (k = 0; k < touched.length; k++) {
                    try {
                        var fx = touched[k].effect(EFFECT_NAME);
                        if (fx && !layerHasElastic(touched[k])) fx.remove();
                    } catch (e2) {
                        rep.skipped.push(touched[k].name + ' : effet non retiré (' + e2.message + ')');
                    }
                }
            });
            return result('Elastic retiré de ' + S.plural(rep.done, 'propriété', 'propriétés'), rep);
        },

        /** Place le point d'ancrage des calques sélectionnés. args : { cell: 1..9 }.
         *  Rien ne bouge à l'écran, à aucun instant : les keyframes existantes d'ancrage
         *  et de position sont décalées (chaque keyframe de position compensée avec
         *  l'échelle et la rotation de son instant), aucune keyframe n'est créée. */
        anchor: function (args) {
            var comp = ae.getActiveComp();
            if (!comp) return error(MSG_NO_COMP);
            var cell = parseInt(args ? args.cell : null, 10);
            if (!(cell >= 1 && cell <= 9)) return warn('Case inconnue : choisis une position de 1 à 9');
            var layers = comp.selectedLayers;
            if (layers.length === 0) return warn('Aucun calque sélectionné : sélectionne des calques dans la timeline');
            var time = comp.time, rep = { done: 0, skipped: [] };
            ae.undo(TOOL_NAME + ' : point d\'ancrage', function () {
                for (var i = 0; i < layers.length; i++) {
                    var layer = layers[i];
                    try {
                        if (layer.locked) throw new Error('calque verrouillé');
                        var rect = sourceRect(layer, time);
                        var tr = layer.property('ADBE Transform Group');
                        var ap = tr.property('ADBE Anchor Point');
                        var cur = ap.valueAtTime(time, false);
                        var target = anchorTarget(rect, cell);
                        var delta = [target[0] - cur[0], target[1] - cur[1]];
                        // Compensation à l'instant t, avec l'échelle et la rotation d'alors.
                        var shiftAt = function (t) {
                            var tt = readTransform(layer, t);
                            return compensate(delta, tt.scale, tt.rotation);
                        };
                        offsetProperty(ap, function () { return delta; }, time);
                        var posProp = tr.property('ADBE Position');
                        if (posProp.dimensionsSeparated) {
                            offsetProperty(tr.property('ADBE Position_0'), function (t) { return shiftAt(t)[0]; }, time);
                            offsetProperty(tr.property('ADBE Position_1'), function (t) { return shiftAt(t)[1]; }, time);
                        } else {
                            offsetProperty(posProp, shiftAt, time);
                        }
                        rep.done++;
                    } catch (e) {
                        rep.skipped.push(layer.name + ' : ' + e.message);
                    }
                }
            });
            return result('Point d\'ancrage placé sur ' + S.plural(rep.done, 'calque', 'calques'), rep);
        },

        /** Aligne les calques sélectionnés. args : { edge, relative: 'selection' | 'comp' }. */
        align: function (args) {
            var comp = ae.getActiveComp();
            if (!comp) return error(MSG_NO_COMP);
            var edge = args && args.edge;
            if (!EDGES.hasOwnProperty(edge)) return warn('Alignement inconnu');
            var toComp = !!(args && args.relative === 'comp');
            var time = comp.time, skipped = [];
            var items = boxedLayers(comp, time, skipped);
            if (toComp && items.length < 1) return warn('Sélectionne au moins 1 calque à aligner sur la composition', skipped);
            if (!toComp && items.length < 2) return warn('Sélectionne au moins 2 calques à aligner entre eux', skipped);
            var boxes = [];
            for (var i = 0; i < items.length; i++) boxes.push(items[i].box);
            var ref = toComp ? { left: 0, top: 0, right: comp.width, bottom: comp.height } : union(boxes);
            var rep = { done: 0, skipped: skipped };
            moveLayers(items, alignDeltas(boxes, edge, ref), time, TOOL_NAME + ' : aligner', rep);
            return result(S.plural(rep.done, 'calque aligné', 'calques alignés') + ' ' + EDGE_ALIGN[edge] +
                          (toComp ? ' de la composition' : ''), rep);
        },

        /** Répartit les calques sélectionnés (sur la sélection). args : { edge }. */
        distribute: function (args) {
            var comp = ae.getActiveComp();
            if (!comp) return error(MSG_NO_COMP);
            var edge = args && args.edge;
            if (!EDGES.hasOwnProperty(edge)) return warn('Répartition inconnue');
            var time = comp.time, skipped = [];
            var items = boxedLayers(comp, time, skipped);
            if (items.length < 3) return warn('Sélectionne au moins 3 calques pour répartir', skipped);
            var boxes = [];
            for (var i = 0; i < items.length; i++) boxes.push(items[i].box);
            var rep = { done: 0, skipped: skipped };
            moveLayers(items, distributeDeltas(boxes, edge), time, TOOL_NAME + ' : répartir', rep);
            return result(S.plural(rep.done, 'calque réparti', 'calques répartis') + ', ' + EDGE_DIST[edge], rep);
        }
    };

    api._core = {
        ELASTIC_EXPRESSION: ELASTIC_EXPRESSION,
        isElastic:          isElastic,
        clampInfluence:     clampInfluence,
        easeList:           easeList,
        anchorTarget:       anchorTarget,
        matMul:             matMul,
        matApply:           matApply,
        matLinear:          matLinear,
        matLinearInverse:   matLinearInverse,
        layerMatrix:        layerMatrix,
        compensate:         compensate,
        addDelta:           addDelta,
        offsetProperty:     offsetProperty,
        bounds:             bounds,
        union:              union,
        alignDeltas:        alignDeltas,
        distributeDeltas:   distributeDeltas,
        readTransform:      readTransform,
        layerToComp:        layerToComp,
        presetPath:         function () { return presetFsPath; }
    };

    S.registerTool('quicktools', api);
})();
