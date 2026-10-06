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

    // Matrices 2D affines [a, b, c, d, tx, ty] : x' = a·x + c·y + tx ; y' = b·x + d·y + ty
    function matMul(A, B) {   // A ∘ B (B appliquée d'abord)
        return [
            A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
            A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
            A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]
        ];
    }

    function matApply(M, p) {
        return [M[0] * p[0] + M[2] * p[1] + M[4], M[1] * p[0] + M[3] * p[1] + M[5]];
    }

    function matLinear(M, v) {
        return [M[0] * v[0] + M[2] * v[1], M[1] * v[0] + M[3] * v[1]];
    }

    /** Inverse de la partie linéaire appliqué à v (v inchangé si la matrice est dégénérée). */
    function matLinearInverse(M, v) {
        var det = M[0] * M[3] - M[2] * M[1];
        if (Math.abs(det) < 1e-9) return [v[0], v[1]];
        return [(M[3] * v[0] - M[2] * v[1]) / det, (-M[1] * v[0] + M[0] * v[1]) / det];
    }

    /** t = { position, anchor, scale (%), rotation (°) } -> matrice espace du calque -> espace du parent. */
    function layerMatrix(t) {
        var r = (t.rotation || 0) * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r);
        var sx = t.scale[0] / 100, sy = t.scale[1] / 100;
        var a = cs * sx, b = sn * sx, c = -sn * sy, d = cs * sy;
        return [a, b, c, d,
                t.position[0] - (a * t.anchor[0] + c * t.anchor[1]),
                t.position[1] - (b * t.anchor[0] + d * t.anchor[1])];
    }

    /** Déplacement de position qui compense un déplacement `delta` du point d'ancrage. */
    function compensate(delta, scale, rotation) {
        return matLinear(layerMatrix({ position: [0, 0], anchor: [0, 0], scale: scale, rotation: rotation }), delta);
    }

    /** v + d : nombre, [x, y] ou [x, y, z] (Z conservé) ; d = nombre ou [dx, dy]. */
    function addDelta(v, d) {
        if (typeof v === 'number') return v + d;
        if (v.length > 2) return [v[0] + d[0], v[1] + d[1], v[2]];
        return [v[0] + d[0], v[1] + d[1]];
    }

    /** Rectangle englobant { left, top, right, bottom } d'une boîte transformée par M. */
    function bounds(rect, M) {
        var pts = [
            matApply(M, [rect.left, rect.top]),
            matApply(M, [rect.left + rect.width, rect.top]),
            matApply(M, [rect.left, rect.top + rect.height]),
            matApply(M, [rect.left + rect.width, rect.top + rect.height])
        ];
        var b = { left: pts[0][0], top: pts[0][1], right: pts[0][0], bottom: pts[0][1] };
        for (var i = 1; i < 4; i++) {
            if (pts[i][0] < b.left) b.left = pts[i][0];
            if (pts[i][0] > b.right) b.right = pts[i][0];
            if (pts[i][1] < b.top) b.top = pts[i][1];
            if (pts[i][1] > b.bottom) b.bottom = pts[i][1];
        }
        return b;
    }

    function union(boxes) {
        var u = { left: boxes[0].left, top: boxes[0].top, right: boxes[0].right, bottom: boxes[0].bottom };
        for (var i = 1; i < boxes.length; i++) {
            if (boxes[i].left < u.left) u.left = boxes[i].left;
            if (boxes[i].top < u.top) u.top = boxes[i].top;
            if (boxes[i].right > u.right) u.right = boxes[i].right;
            if (boxes[i].bottom > u.bottom) u.bottom = boxes[i].bottom;
        }
        return u;
    }

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

    /** Décale une propriété sans créer de keyframe : chaque keyframe existante reçoit
     *  deltaAt(son instant) ; sans keyframe, la valeur reçoit deltaAt(time). Les tangentes
     *  spatiales posées à la main sont relues puis reposées (setValueAtKey peut les
     *  recalculer) ; les automatiques se recalculent d'elles-mêmes, tout se décalant d'autant. */
    function offsetProperty(prop, deltaAt, time) {
        var n = prop.numKeys;
        if (n === 0) {
            prop.setValue(addDelta(prop.value, deltaAt(time)));
            return;
        }
        var spatial = prop.isSpatial;
        for (var k = 1; k <= n; k++) {
            var keep = (spatial && !prop.keySpatialAutoBezier(k))
                ? [prop.keyInSpatialTangent(k), prop.keyOutSpatialTangent(k)] : null;
            prop.setValueAtKey(k, addDelta(prop.keyValue(k), deltaAt(prop.keyTime(k))));
            if (keep) prop.setSpatialTangentsAtKey(k, keep[0], keep[1]);
        }
    }

    /** Transformation 2D d'un calque à l'instant t (Z et rotations X/Y ignorées). */
    function readTransform(layer, time) {
        var tr = layer.property('ADBE Transform Group');
        var posProp = tr.property('ADBE Position');
        var pos;
        if (posProp.dimensionsSeparated) {
            pos = [tr.property('ADBE Position_0').valueAtTime(time, false), tr.property('ADBE Position_1').valueAtTime(time, false)];
        } else {
            pos = posProp.valueAtTime(time, false);
        }
        var anchor = tr.property('ADBE Anchor Point').valueAtTime(time, false);
        var scale  = tr.property('ADBE Scale').valueAtTime(time, false);
        var rot    = tr.property('ADBE Rotate Z').valueAtTime(time, false);
        return { position: [pos[0], pos[1]], anchor: [anchor[0], anchor[1]], scale: [scale[0], scale[1]], rotation: rot };
    }

    /** Matrice espace du calque -> espace de la comp (chaîne des parents). */
    function layerToComp(layer, time) {
        var M = layerMatrix(readTransform(layer, time));
        var p = layer.parent, guard = 0;
        while (p !== null && guard++ < 200) {
            M = matMul(layerMatrix(readTransform(p, time)), M);
            p = p.parent;
        }
        return M;
    }

    /** Déplacement en espace comp -> espace du parent du calque. */
    function toParentSpace(layer, d, time) {
        var p = layer.parent;
        if (p === null) return d;
        return matLinearInverse(layerToComp(p, time), d);
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

    /** Boîte visible d'un calque dans son espace, ou une erreur explicite. */
    function sourceRect(layer, time) {
        if (typeof layer.sourceRectAtTime !== 'function') throw new Error('pas de boîte visible (caméra ou lumière)');
        var rect = layer.sourceRectAtTime(time, false);
        if (!rect || !(rect.width > 0) || !(rect.height > 0)) throw new Error('boîte vide');
        return rect;
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

    /** Propriétés feuilles sélectionnées de la comp. */
    function selectedProperties(comp) {
        var out = [], props = comp.selectedProperties;
        for (var i = 0; i < props.length; i++) {
            if (props[i].propertyType === PropertyType.PROPERTY) out.push(props[i]);
        }
        return out;
    }

    /** Keyframes sélectionnées : [{ prop, index }]. */
    function selectedKeyframes(comp) {
        var out = [], props = selectedProperties(comp);
        for (var i = 0; i < props.length; i++) {
            var keys;
            try { keys = props[i].selectedKeys; } catch (e) { keys = null; }
            if (!keys) continue;
            for (var k = 0; k < keys.length; k++) out.push({ prop: props[i], index: keys[k] });
        }
        return out;
    }

    function ownerLayer(prop) {
        return prop.propertyGroup(prop.propertyDepth);
    }

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
