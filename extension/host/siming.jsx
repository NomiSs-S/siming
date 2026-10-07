/*
 * ============================================================================
 *  SIMING  -  cœur hôte (ExtendScript, ES3)
 * ============================================================================
 *
 *  Chargé par le panneau CEP (ScriptPath du manifeste). Il ne connaît que des
 *  données : le panneau l'appelle par SIMING.call(outil, fonction, argsEncodés)
 *  et reçoit une enveloppe JSON encodée.
 *
 *  Contenu : JSON maison (ExtendScript n'a pas d'objet JSON), helpers After
 *  Effects, groupe d'annulation, routeur, chargement des outils hôtes.
 *
 *  Contraintes : ES3 uniquement, UTF-8 avec BOM, commentaires en français.
 * ============================================================================
 */
(function () {

    var SIMING = {};

    // ------------------------------------------------------------------------
    //  JSON maison
    // ------------------------------------------------------------------------
    var json = {};

    function quote(s) {
        var out = '"';
        for (var i = 0; i < s.length; i++) {
            var c = s.charAt(i), code = s.charCodeAt(i);
            if (c === '"') out += '\\"';
            else if (c === '\\') out += '\\\\';
            else if (c === '\n') out += '\\n';
            else if (c === '\r') out += '\\r';
            else if (c === '\t') out += '\\t';
            else if (c === '\b') out += '\\b';
            else if (c === '\f') out += '\\f';
            else if (code < 0x20) out += '\\u' + ('000' + code.toString(16)).slice(-4);
            else out += c;
        }
        return out + '"';
    }

    function isArray(v) { return Object.prototype.toString.call(v) === '[object Array]'; }

    /** Texte JSON de v (mêmes règles que JSON.stringify sans indentation). */
    json.stringify = function (v) {
        if (v === null || v === undefined) return 'null';
        var t = typeof v;
        if (t === 'boolean') return v ? 'true' : 'false';
        if (t === 'number') return isFinite(v) ? String(v) : 'null';
        if (t === 'string') return quote(v);
        if (t === 'function') return 'null';
        if (isArray(v)) {
            var parts = [];
            for (var i = 0; i < v.length; i++) parts.push(json.stringify(v[i]));
            return '[' + parts.join(',') + ']';
        }
        var props = [];
        for (var k in v) {
            if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
            var val = v[k];
            if (val === undefined || typeof val === 'function') continue;
            props.push(quote(k) + ':' + json.stringify(val));
        }
        return '{' + props.join(',') + '}';
    };

    /** Valeur décrite par le texte JSON (descente récursive, jamais eval). */
    json.parse = function (text) {
        var s = String(text), i = 0;

        function fail(msg) { throw new Error('JSON invalide (' + msg + ') à la position ' + i); }
        function ws() {
            while (i < s.length) {
                var c = s.charAt(i);
                if (c === ' ' || c === '\t' || c === '\n' || c === '\r') i++;
                else break;
            }
        }
        function word(w, v) {
            if (s.substr(i, w.length) !== w) fail('mot inconnu');
            i += w.length;
            return v;
        }
        function number() {
            var m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(s.substr(i));
            if (!m) fail('nombre');
            i += m[0].length;
            return parseFloat(m[0]);
        }
        function string() {
            i++;
            var out = '';
            while (i < s.length) {
                var c = s.charAt(i++);
                if (c === '"') return out;
                if (c === '\\') {
                    var e = s.charAt(i++);
                    if (e === '"' || e === '\\' || e === '/') out += e;
                    else if (e === 'n') out += '\n';
                    else if (e === 'r') out += '\r';
                    else if (e === 't') out += '\t';
                    else if (e === 'b') out += '\b';
                    else if (e === 'f') out += '\f';
                    else if (e === 'u') {
                        var hex = s.substr(i, 4);
                        if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('\\u');
                        out += String.fromCharCode(parseInt(hex, 16));
                        i += 4;
                    } else fail('échappement');
                } else {
                    out += c;
                }
            }
            fail('chaîne non terminée');
        }
        function array() {
            i++;
            var arr = [];
            ws();
            if (s.charAt(i) === ']') { i++; return arr; }
            while (true) {
                arr.push(value());
                ws();
                var c = s.charAt(i++);
                if (c === ']') return arr;
                if (c !== ',') fail('« , » ou « ] » attendu');
            }
        }
        function object() {
            i++;
            var obj = {};
            ws();
            if (s.charAt(i) === '}') { i++; return obj; }
            while (true) {
                ws();
                if (s.charAt(i) !== '"') fail('clé attendue');
                var k = string();
                ws();
                if (s.charAt(i++) !== ':') fail('« : » attendu');
                obj[k] = value();
                ws();
                var c = s.charAt(i++);
                if (c === '}') return obj;
                if (c !== ',') fail('« , » ou « } » attendu');
            }
        }
        function value() {
            ws();
            var c = s.charAt(i);
            if (c === '{') return object();
            if (c === '[') return array();
            if (c === '"') return string();
            if (c === 't') return word('true', true);
            if (c === 'f') return word('false', false);
            if (c === 'n') return word('null', null);
            if (c === '-' || (c >= '0' && c <= '9')) return number();
            fail('valeur attendue');
        }

        var result = value();
        ws();
        if (i < s.length) fail('texte en trop');
        return result;
    };

    SIMING.json = json;

    // ------------------------------------------------------------------------
    //  Helpers After Effects
    // ------------------------------------------------------------------------
    var ae = {};

    /** Composition active, ou null si l'élément actif n'en est pas une. */
    ae.getActiveComp = function () {
        if (!app.project) return null;
        var item = app.project.activeItem;
        return (item && item instanceof CompItem) ? item : null;
    };

    /** Identifiant stable d'un calque : Layer.id (AE 22+), sinon son index. */
    ae.layerId = function (layer) {
        return (typeof layer.id !== 'undefined') ? layer.id : layer.index;
    };

    /** Deux objets calque désignent-ils le même calque ? (comparaison par index) */
    ae.sameLayer = function (a, b) {
        return a !== null && b !== null && a.index === b.index;
    };

    /** Calque de la comp portant cet identifiant, ou null. */
    ae.findLayerById = function (comp, id) {
        for (var i = 1; i <= comp.numLayers; i++) {
            var layer = comp.layer(i);
            if (ae.layerId(layer) === id) return layer;
        }
        return null;
    };

    /** Tous les calques de la comp portant ce nom (peut être vide). */
    ae.findLayersByName = function (comp, name) {
        var found = [];
        for (var i = 1; i <= comp.numLayers; i++) {
            var layer = comp.layer(i);
            if (layer.name === name) found.push(layer);
        }
        return found;
    };

    /** Composition du projet portant cet identifiant, ou null. */
    ae.findCompById = function (id) {
        var p = app.project;
        if (!p) return null;
        for (var i = 1; i <= p.numItems; i++) {
            var item = p.item(i);
            if (item instanceof CompItem && item.id === id) return item;
        }
        return null;
    };

    /** Exécute fn dans un groupe d'annulation unique, fermé quoi qu'il arrive. */
    ae.undo = function (name, fn) {
        app.beginUndoGroup(name);
        try {
            return fn();
        } finally {
            app.endUndoGroup();
        }
    };

    /** Couleurs d'étiquettes par défaut d'After Effects (1 à 16), repli quand
     *  les préférences ne se lisent pas. Index 0 = « Aucune ». */
    ae.LABEL_DEFAULTS = [null,
        '#B53838', '#E4D84C', '#A9CBC7', '#E5BCC9', '#A9A9CA', '#E7C19E', '#B3C7B3', '#677DE0',
        '#4AA44C', '#8E2C9A', '#E8920D', '#7F452A', '#F46DD6', '#3DA2A5', '#A89677', '#1E401E'];

    var LABEL_SECTION = 'Label Preference Color Section 5';

    /** « #RRGGBB » d'après la valeur brute d'une préférence de couleur d'étiquette :
     *  4 octets ARGB sous forme de caractères (lecture en encodage BINARY), ou
     *  8 chiffres hexadécimaux. null si la forme est inconnue. */
    SIMING.parseLabelPref = function (raw) {
        if (typeof raw !== 'string') return null;
        if (/^[0-9A-Fa-f]{8}$/.test(raw)) return '#' + raw.substring(2).toUpperCase();
        if (raw.length !== 4) return null;
        var hex = '';
        for (var i = 1; i < 4; i++) {           // on saute l'alpha
            var code = raw.charCodeAt(i);
            if (code > 255) return null;         // octet mal décodé (autre encodage)
            hex += (code < 16 ? '0' : '') + code.toString(16);
        }
        return '#' + hex.toUpperCase();
    };

    /** Couleur « #RRGGBB » de l'étiquette n° index (1 à 16) d'après les
     *  Préférences › Étiquettes de l'utilisateur, sinon couleur par défaut.
     *  null pour 0 (aucune) ou hors plage. */
    ae.labelColor = function (index) {
        var n = parseInt(index, 10);
        if (!(n >= 1 && n <= 16)) return null;
        var color = null;
        try {
            var prefs = app.preferences;
            var key = 'Label Color ID 2 # ' + n;
            if (prefs && (typeof prefs.havePref !== 'function' || prefs.havePref(LABEL_SECTION, key))) {
                var previous = $.appEncoding;
                try {
                    $.appEncoding = 'BINARY';    // un caractère par octet, quel que soit l'encodage système
                    color = SIMING.parseLabelPref(prefs.getPrefAsString(LABEL_SECTION, key));
                } finally {
                    $.appEncoding = previous;
                }
            }
        } catch (e) {
            color = null;
        }
        return color || ae.LABEL_DEFAULTS[n];
    };

    /** Noms des étiquettes par défaut d'After Effects en français. Index 0 = « Aucune ». */
    ae.LABEL_NAMES = ['Aucune',
        'Rouge', 'Jaune', 'Bleu-vert', 'Rose', 'Lavande', 'Pêche', 'Vert d\'eau', 'Bleu',
        'Vert', 'Violet', 'Orange', 'Marron', 'Fuchsia', 'Cyan', 'Grès', 'Vert foncé'];

    // Noms d'origine tels que les préférences les gardent tant qu'on ne les renomme pas.
    var LABEL_NAMES_EN = [null,
        'Red', 'Yellow', 'Aqua', 'Pink', 'Lavender', 'Peach', 'Sea Foam', 'Blue',
        'Green', 'Purple', 'Orange', 'Brown', 'Fuchsia', 'Cyan', 'Sandstone', 'Dark Green'];
    var LABEL_TEXT_SECTION = 'Label Preference Text Section 7';

    /** Nom de l'étiquette n° index (0 à 16) : celui des Préférences › Étiquettes s'il a
     *  été changé, sinon le nom français par défaut. null hors plage. */
    ae.labelName = function (index) {
        var n = parseInt(index, 10);
        if (!(n >= 0 && n <= 16)) return null;
        if (n === 0) return ae.LABEL_NAMES[0];
        var name = null;
        try {
            var prefs = app.preferences;
            var key = 'Label Text ID 2 # ' + n;
            if (prefs && (typeof prefs.havePref !== 'function' || prefs.havePref(LABEL_TEXT_SECTION, key))) {
                name = prefs.getPrefAsString(LABEL_TEXT_SECTION, key);
            }
        } catch (e) {
            name = null;
        }
        if (typeof name !== 'string') return ae.LABEL_NAMES[n];
        name = name.replace(/^\s+|\s+$/g, '');
        return (name === '' || name === LABEL_NAMES_EN[n]) ? ae.LABEL_NAMES[n] : name;
    };

    // ------------------------------------------------------------------------
    //  Géométrie 2D (partagée par les outils : Quick Tools, Boîte à outils)
    // ------------------------------------------------------------------------
    var geom = {};

    // Matrices 2D affines [a, b, c, d, tx, ty] : x' = a·x + c·y + tx ; y' = b·x + d·y + ty
    geom.matMul = function (A, B) {   // A ∘ B (B appliquée d'abord)
        return [
            A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
            A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
            A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]
        ];
    };

    geom.matApply = function (M, p) {
        return [M[0] * p[0] + M[2] * p[1] + M[4], M[1] * p[0] + M[3] * p[1] + M[5]];
    };

    geom.matLinear = function (M, v) {
        return [M[0] * v[0] + M[2] * v[1], M[1] * v[0] + M[3] * v[1]];
    };

    /** Inverse de la partie linéaire appliqué à v (v inchangé si la matrice est dégénérée). */
    geom.matLinearInverse = function (M, v) {
        var det = M[0] * M[3] - M[2] * M[1];
        if (Math.abs(det) < 1e-9) return [v[0], v[1]];
        return [(M[3] * v[0] - M[2] * v[1]) / det, (-M[1] * v[0] + M[0] * v[1]) / det];
    };

    /** t = { position, anchor, scale (%), rotation (°) } -> matrice espace du calque -> espace du parent. */
    geom.layerMatrix = function (t) {
        var r = (t.rotation || 0) * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r);
        var sx = t.scale[0] / 100, sy = t.scale[1] / 100;
        var a = cs * sx, b = sn * sx, c = -sn * sy, d = cs * sy;
        return [a, b, c, d,
                t.position[0] - (a * t.anchor[0] + c * t.anchor[1]),
                t.position[1] - (b * t.anchor[0] + d * t.anchor[1])];
    };

    /** Déplacement de position qui compense un déplacement `delta` du point d'ancrage. */
    geom.compensate = function (delta, scale, rotation) {
        return geom.matLinear(geom.layerMatrix({ position: [0, 0], anchor: [0, 0], scale: scale, rotation: rotation }), delta);
    };

    /** v + d : nombre, [x, y] ou [x, y, z] (Z conservé) ; d = nombre ou [dx, dy]. */
    geom.addDelta = function (v, d) {
        if (typeof v === 'number') return v + d;
        if (v.length > 2) return [v[0] + d[0], v[1] + d[1], v[2]];
        return [v[0] + d[0], v[1] + d[1]];
    };

    /** Rectangle englobant { left, top, right, bottom } d'une boîte transformée par M. */
    geom.bounds = function (rect, M) {
        var pts = [
            geom.matApply(M, [rect.left, rect.top]),
            geom.matApply(M, [rect.left + rect.width, rect.top]),
            geom.matApply(M, [rect.left, rect.top + rect.height]),
            geom.matApply(M, [rect.left + rect.width, rect.top + rect.height])
        ];
        var b = { left: pts[0][0], top: pts[0][1], right: pts[0][0], bottom: pts[0][1] };
        for (var i = 1; i < 4; i++) {
            if (pts[i][0] < b.left) b.left = pts[i][0];
            if (pts[i][0] > b.right) b.right = pts[i][0];
            if (pts[i][1] < b.top) b.top = pts[i][1];
            if (pts[i][1] > b.bottom) b.bottom = pts[i][1];
        }
        return b;
    };

    /** Rectangle englobant de plusieurs { left, top, right, bottom } (au moins un). */
    geom.union = function (boxes) {
        var u = { left: boxes[0].left, top: boxes[0].top, right: boxes[0].right, bottom: boxes[0].bottom };
        for (var i = 1; i < boxes.length; i++) {
            if (boxes[i].left < u.left) u.left = boxes[i].left;
            if (boxes[i].top < u.top) u.top = boxes[i].top;
            if (boxes[i].right > u.right) u.right = boxes[i].right;
            if (boxes[i].bottom > u.bottom) u.bottom = boxes[i].bottom;
        }
        return u;
    };

    /** Partie commune de deux { left, top, right, bottom }, ou null si elles ne se touchent pas. */
    geom.intersect = function (a, b) {
        var r = { left: Math.max(a.left, b.left), top: Math.max(a.top, b.top),
                  right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) };
        return (r.right > r.left && r.bottom > r.top) ? r : null;
    };

    /** Rectangle englobant d'un tracé de Bézier comme une forme de masque d'AE : sommets
     *  [[x, y]…], tangentes entrantes et sortantes relatives aux sommets, fermé ou non. Les
     *  courbes comptent (extrema de chaque segment), pas seulement les sommets. null si vide. */
    geom.pathBounds = function (vertices, inTangents, outTangents, closed) {
        var n = vertices ? vertices.length : 0, i;
        if (!n) return null;
        var b = { left: vertices[0][0], top: vertices[0][1], right: vertices[0][0], bottom: vertices[0][1] };
        function add(p) {
            if (p[0] < b.left) b.left = p[0];
            if (p[0] > b.right) b.right = p[0];
            if (p[1] < b.top) b.top = p[1];
            if (p[1] > b.bottom) b.bottom = p[1];
        }
        function at(p0, p1, p2, p3, t) {
            var u = 1 - t, a = u * u * u, c1 = 3 * u * u * t, c2 = 3 * u * t * t, d = t * t * t;
            return [a * p0[0] + c1 * p1[0] + c2 * p2[0] + d * p3[0], a * p0[1] + c1 * p1[1] + c2 * p2[1] + d * p3[1]];
        }
        /** Instants 0 < t < 1 où la courbe change de sens sur l'axe k (dérivée nulle). */
        function turns(p0, p1, p2, p3, k) {
            var d0 = p1[k] - p0[k], d1 = p2[k] - p1[k], d2 = p3[k] - p2[k];
            var A = d0 - 2 * d1 + d2, B = 2 * (d1 - d0), C = d0, out = [];
            if (Math.abs(A) < 1e-12) {
                if (Math.abs(B) > 1e-12) out.push(-C / B);
            } else {
                var disc = B * B - 4 * A * C;
                if (disc >= 0) {
                    var r = Math.sqrt(disc);
                    out.push((-B + r) / (2 * A), (-B - r) / (2 * A));
                }
            }
            return out;
        }
        var segs = closed ? n : n - 1;
        for (i = 0; i < segs; i++) {
            var j = (i + 1) % n;
            var inT = (inTangents && inTangents[j]) || [0, 0], outT = (outTangents && outTangents[i]) || [0, 0];
            var p0 = vertices[i], p3 = vertices[j];
            var p1 = [p0[0] + outT[0], p0[1] + outT[1]], p2 = [p3[0] + inT[0], p3[1] + inT[1]];
            add(p3);
            for (var k = 0; k < 2; k++) {
                var ts = turns(p0, p1, p2, p3, k);
                for (var m = 0; m < ts.length; m++) if (ts[m] > 0 && ts[m] < 1) add(at(p0, p1, p2, p3, ts[m]));
            }
        }
        return b;
    };

    SIMING.geom = geom;

    /** Transformation 2D d'un calque à l'instant t (Z et rotations X/Y ignorées). */
    ae.readTransform = function (layer, time) {
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
    };

    /** Matrice espace du calque -> espace de la comp (chaîne des parents). */
    ae.layerToComp = function (layer, time) {
        var M = geom.layerMatrix(ae.readTransform(layer, time));
        var p = layer.parent, guard = 0;
        while (p !== null && guard++ < 200) {
            M = geom.matMul(geom.layerMatrix(ae.readTransform(p, time)), M);
            p = p.parent;
        }
        return M;
    };

    /** Déplacement en espace comp -> espace du parent du calque. */
    ae.toParentSpace = function (layer, d, time) {
        var p = layer.parent;
        if (p === null) return d;
        return geom.matLinearInverse(ae.layerToComp(p, time), d);
    };

    /** Boîte visible d'un calque dans son espace, ou une erreur explicite. */
    ae.sourceRect = function (layer, time) {
        if (typeof layer.sourceRectAtTime !== 'function') throw new Error('pas de boîte visible (caméra ou lumière)');
        var rect = layer.sourceRectAtTime(time, false);
        if (!rect || !(rect.width > 0) || !(rect.height > 0)) throw new Error('boîte vide');
        return rect;
    };

    /** Boîte de ce qui est visible d'un calque, dans son espace ({ left, top, width, height }) :
     *  la boîte de sa source, réduite par ses masques actifs pris dans l'ordre, comme AE les
     *  combine. Ajouter (et Éclaircir, Différence) = union, Intersection (et Obscurcir) = partie
     *  commune ; le premier masque part de rien s'il ajoute, de tout le calque sinon. Soustraire
     *  ne réduit pas la boîte ; un masque inversé couvre tout le calque. L'étendue du masque
     *  compte, pas le contour progressif. Sans masque actif : la boîte de la source. */
    ae.visibleRect = function (layer, time) {
        var rect = ae.sourceRect(layer, time), masks = null, n = 0;
        try { masks = layer.property('ADBE Mask Parade'); n = masks ? masks.numProperties : 0; } catch (e0) { n = 0; }
        if (!n) return rect;
        var full = { left: rect.left, top: rect.top, right: rect.left + rect.width, bottom: rect.top + rect.height };
        var box = null, started = false;
        for (var i = 1; i <= n; i++) {
            var m = masks.property(i), mode;
            try { mode = m.maskMode; } catch (e1) { continue; }
            if (mode === MaskMode.NONE) continue;
            var adds = (mode === MaskMode.ADD || mode === MaskMode.LIGHTEN || mode === MaskMode.DIFFERENCE);
            var crops = (mode === MaskMode.INTERSECT || mode === MaskMode.DARKEN);
            var mb = full;
            if (!m.inverted) {
                var s = m.property('ADBE Mask Shape').valueAtTime(time, false);
                mb = geom.pathBounds(s.vertices, s.inTangents, s.outTangents, s.closed);
                if (!mb) continue;   // masque sans point
                var grow = 0;
                try { grow = m.property('ADBE Mask Offset').valueAtTime(time, false) || 0; } catch (e2) { grow = 0; }
                mb = { left: mb.left - grow, top: mb.top - grow, right: mb.right + grow, bottom: mb.bottom + grow };
            }
            if (!started) { box = adds ? null : full; started = true; }
            if (adds) box = box ? geom.union([box, mb]) : mb;
            else if (crops) box = box ? geom.intersect(box, mb) : null;
        }
        if (!started) return rect;
        var v = box ? geom.intersect(box, full) : null;
        if (!v) throw new Error('rien de visible : ses masques sont hors du calque');
        return { left: v.left, top: v.top, width: v.right - v.left, height: v.bottom - v.top };
    };

    /** Rectangle englobant de ce qui est visible d'un calque (masques compris), dans l'espace de la comp. */
    ae.layerBox = function (layer, time) {
        return geom.bounds(ae.visibleRect(layer, time), ae.layerToComp(layer, time));
    };

    /** Décale une propriété sans créer de keyframe : chaque keyframe existante reçoit
     *  deltaAt(son instant) ; sans keyframe, la valeur reçoit deltaAt(time). Les tangentes
     *  spatiales posées à la main sont relues puis reposées (setValueAtKey peut les
     *  recalculer) ; les automatiques se recalculent d'elles-mêmes, tout se décalant d'autant. */
    ae.offsetProperty = function (prop, deltaAt, time) {
        var n = prop.numKeys;
        if (n === 0) {
            prop.setValue(geom.addDelta(prop.value, deltaAt(time)));
            return;
        }
        var spatial = prop.isSpatial;
        for (var k = 1; k <= n; k++) {
            var keep = (spatial && !prop.keySpatialAutoBezier(k))
                ? [prop.keyInSpatialTangent(k), prop.keyOutSpatialTangent(k)] : null;
            prop.setValueAtKey(k, geom.addDelta(prop.keyValue(k), deltaAt(prop.keyTime(k))));
            if (keep) prop.setSpatialTangentsAtKey(k, keep[0], keep[1]);
        }
    };

    /** Propriétés feuilles sélectionnées de la comp (ordre des calques, puis de l'arbre). */
    ae.selectedProperties = function (comp) {
        var out = [], props = comp.selectedProperties;
        for (var i = 0; i < props.length; i++) {
            if (props[i].propertyType === PropertyType.PROPERTY) out.push(props[i]);
        }
        return out;
    };

    /** Keyframes sélectionnées : [{ prop, index }], propriété par propriété. */
    ae.selectedKeyframes = function (comp) {
        var out = [], props = ae.selectedProperties(comp);
        for (var i = 0; i < props.length; i++) {
            var keys;
            try { keys = props[i].selectedKeys; } catch (e) { keys = null; }
            if (!keys) continue;
            for (var k = 0; k < keys.length; k++) out.push({ prop: props[i], index: keys[k] });
        }
        return out;
    };

    /** Calque qui porte une propriété. */
    ae.ownerLayer = function (prop) {
        return prop.propertyGroup(prop.propertyDepth);
    };

    SIMING.ae = ae;

    /** "1 enfant", "3 enfants". */
    SIMING.plural = function (n, one, many) {
        return n + ' ' + ((n === 1) ? one : many);
    };

    // ------------------------------------------------------------------------
    //  Routeur
    // ------------------------------------------------------------------------
    var tools = {};
    var loadErrors = [];
    var loaded = false;

    /** Enregistre l'API publique d'un outil (objet de fonctions). */
    SIMING.registerTool = function (id, api) {
        tools[id] = api;
        return api;
    };

    SIMING.getTool = function (id) {
        return tools.hasOwnProperty(id) ? tools[id] : null;
    };

    /** Point d'entrée du panneau : appelle tools[toolId][fnName](args).
     *  Renvoie toujours une enveloppe JSON encodée par encodeURIComponent. */
    SIMING.call = function (toolId, fnName, encodedArgs) {
        var env;
        try {
            var args = encodedArgs ? json.parse(decodeURIComponent(encodedArgs)) : {};
            var api = tools.hasOwnProperty(toolId) ? tools[toolId] : null;
            if (!api) throw new Error('Outil inconnu : ' + toolId);
            var fn = api[fnName];
            if (typeof fn !== 'function' || String(fnName).charAt(0) === '_') {
                throw new Error('Fonction inconnue : ' + toolId + '.' + fnName);
            }
            var data = fn(args);
            env = { ok: true, data: (data === undefined) ? null : data };
        } catch (e) {
            env = { ok: false, error: {
                message: String((e && e.message) ? e.message : e),
                line: (e && e.line) ? e.line : null
            } };
        }
        return encodeURIComponent(json.stringify(env));
    };

    // ------------------------------------------------------------------------
    //  Chargement des outils hôtes (host/tools/*.jsx)
    // ------------------------------------------------------------------------

    SIMING.loadTools = function (folder) {
        loaded = true;
        if (!folder.exists) {
            loadErrors.push('Dossier introuvable : ' + folder.fsName);
            return;
        }
        var files = folder.getFiles('*.jsx');
        files.sort(function (a, b) { return (a.name < b.name) ? -1 : ((a.name > b.name) ? 1 : 0); });
        for (var i = 0; i < files.length; i++) {
            if (!(files[i] instanceof File)) continue;
            try {
                $.evalFile(files[i]);
            } catch (e) {
                loadErrors.push(files[i].name + ' : ' + e.toString() + (e.line ? ' (ligne ' + e.line + ')' : ''));
            }
        }
    };

    function status() {
        var ids = [];
        for (var k in tools) {
            if (tools.hasOwnProperty(k) && k !== 'siming') ids.push(k);
        }
        ids.sort();
        return { tools: ids, errors: loadErrors.slice(0) };
    }

    SIMING.registerTool('siming', {
        status: status,
        /** Le panneau donne la racine de l'extension : sert si $.fileName n'a pas suffi. */
        init: function (args) {
            if (!loaded && args && args.root) SIMING.loadTools(new Folder(args.root + '/host/tools'));
            return status();
        }
    });

    $.global.SIMING = SIMING;

    // Le chemin du script n'est fiable qu'au chargement : on charge les outils tout de suite.
    try {
        var me = new File($.fileName);
        if (/siming\.jsx$/i.test(me.name)) SIMING.loadTools(new Folder(me.parent.absoluteURI + '/tools'));
    } catch (e) { /* le panneau appellera siming.init avec la racine */ }

})();
