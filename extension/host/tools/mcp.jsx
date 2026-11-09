/*
 * ============================================================================
 *  Claude Code  -  cœur hôte SIMING (ExtendScript, ES3)
 * ============================================================================
 *
 *  Appelé par le service MCP (extension invisible com.siming.mcp), jamais par une
 *  vue : Claude Code lit le projet et agit dans After Effects.
 *  - run        : exécute du code ExtendScript (corps de fonction : return, log()),
 *                 dans un seul groupe d'annulation « Claude : … » ;
 *  - project    : éléments du projet, élément actif, sélection du panneau Projet ;
 *  - comp       : calques d'une comp (nature, temps, interrupteurs, transformation,
 *                 effets, propriétés animées, expressions) et sélection ;
 *  - properties : arbre des propriétés d'un calque (valeurs, keyframes, expressions) ;
 *  - frame      : rend une frame en PNG dans le dossier temporaire (le service le lit).
 *  Tout ce qui est renvoyé est fait de données simples : un objet d'After Effects
 *  devient une courte description { $type, name, index, id }.
 *  Contraintes : ES3, jamais === entre deux calques, UTF-8 avec BOM.
 * ============================================================================
 */
(function () {

    var S  = $.global.SIMING;
    var ae = S.ae;

    var MAX_DEPTH     = 8;      // profondeur d'une valeur renvoyée
    var MAX_ITEMS     = 1000;   // éléments d'un tableau renvoyé
    var MAX_LOGS      = 500;    // lignes de journal (log) gardées
    var MAX_LOG_CHARS = 4000;   // caractères par ligne de journal
    var MAX_KEYS      = 200;    // keyframes détaillées par propriété
    var SEP           = ' > ';  // chemin lisible d'une propriété

    var MSG_WRITE = 'vérifie Préférences › Scripts et expressions › « Autoriser les scripts à écrire des fichiers et à accéder au réseau »';

    // ------------------------------------------------------------------------
    //  Valeurs simples
    // ------------------------------------------------------------------------

    function isArray(v) { return Object.prototype.toString.call(v) === '[object Array]'; }

    function message(e) { return String((e && e.message) ? e.message : e); }

    /** Arrondi à `digits` décimales ; digits null : nombre intact. */
    function roundTo(n, digits) {
        if (digits === null || digits === undefined) return n;
        var k = Math.pow(10, digits);
        return Math.round(n * k) / k;
    }

    function round(n) { return roundTo(n, 4); }

    /** Nom de la classe d'un objet : « AVLayer », « Shape »… ou « Object » (objet simple). */
    function typeName(v) {
        try { if (v.reflect && v.reflect.name) return String(v.reflect.name); } catch (e0) { /* suivant */ }
        try {
            var m = /^\[object (\w+)\]$/.exec(Object.prototype.toString.call(v));
            if (m && m[1] !== 'Object') return m[1];
        } catch (e1) { /* suivant */ }
        try { if (v.constructor && v.constructor.name) return String(v.constructor.name); } catch (e2) { /* suivant */ }
        return 'Object';
    }

    /** Champs lus pour décrire les objets d'AE qui servent de valeurs ; les autres : nom, index, id. */
    var DESCRIBE = {
        Shape:        ['vertices', 'inTangents', 'outTangents', 'closed'],
        TextDocument: ['text', 'font', 'fontSize', 'fillColor', 'strokeColor', 'strokeWidth', 'applyFill',
                       'applyStroke', 'justification', 'tracking', 'leading', 'boxText', 'boxTextSize'],
        MarkerValue:  ['comment', 'duration', 'chapter', 'url', 'label'],
        KeyframeEase: ['speed', 'influence']
    };
    var DESCRIBE_DEFAULT = ['name', 'matchName', 'index', 'id'];

    function describe(v, type, depth, digits) {
        var out = { $type: type };
        var keys = DESCRIBE.hasOwnProperty(type) ? DESCRIBE[type] : DESCRIBE_DEFAULT;
        for (var i = 0; i < keys.length; i++) {
            try {
                var x = v[keys[i]];
                if (x !== undefined && x !== null && typeof x !== 'function') out[keys[i]] = plain(x, depth + 1, digits);
            } catch (e) { /* champ illisible sur cet objet */ }
        }
        return out;
    }

    /** Copie de v faite de données JSON. Tableaux et objets simples parcourus (profondeur
     *  bornée), objets d'AE décrits, fonctions remplacées par « [fonction] ». */
    function plain(v, depth, digits) {
        if (v === null || v === undefined) return null;
        var t = typeof v;
        if (t === 'string' || t === 'boolean') return v;
        if (t === 'number') return isFinite(v) ? roundTo(v, digits) : String(v);
        if (t === 'function') return '[fonction]';
        if (depth >= MAX_DEPTH) return '[…]';
        var i, out;
        if (isArray(v)) {
            out = [];
            for (i = 0; i < v.length && i < MAX_ITEMS; i++) out.push(plain(v[i], depth + 1, digits));
            if (v.length > MAX_ITEMS) out.push('… ' + (v.length - MAX_ITEMS) + ' de plus');
            return out;
        }
        var type = typeName(v);
        if (type === 'Date') return v.toString();
        if (type !== 'Object') return describe(v, type, depth, digits);
        out = {};
        for (var k in v) {
            if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
            if (typeof v[k] === 'function') continue;
            out[k] = plain(v[k], depth + 1, digits);
        }
        return out;
    }

    function clampInt(v, min, max, fallback) {
        var n = parseInt(v, 10);
        if (isNaN(n)) return fallback;
        return Math.max(min, Math.min(max, n));
    }

    function lower(s) { return String(s === null || s === undefined ? '' : s).toLowerCase(); }

    function contains(hay, needle) { return lower(hay).split(lower(needle)).length > 1; }

    function hasValue(v) { return v !== undefined && v !== null && v !== ''; }

    // ------------------------------------------------------------------------
    //  Exécuter du code
    // ------------------------------------------------------------------------

    function logLine(args) {
        var parts = [];
        for (var i = 0; i < args.length; i++) {
            parts.push(typeof args[i] === 'string' ? args[i] : S.json.stringify(plain(args[i], 0, null)));
        }
        var s = parts.join(' ');
        return s.length > MAX_LOG_CHARS ? s.substr(0, MAX_LOG_CHARS) + '…' : s;
    }

    /** Nom du groupe d'annulation : « Claude : <nom court> ». */
    function undoName(name) {
        var s = String(name || '').replace(/[\r\n\t]+/g, ' ').replace(/^\s+|\s+$/g, '');
        if (s.length > 60) s = s.substr(0, 60) + '…';
        return 'Claude : ' + (s || 'script');
    }

    /** args : { code, undoName }. Le code est le corps d'une fonction qui reçoit log(…) :
     *  sa valeur de retour (return) revient en données simples. */
    function run(args) {
        var code = String((args && args.code) || '');
        var name = undoName(args && args.undoName);
        var logs = [], dropped = 0;
        function log() {
            if (logs.length < MAX_LOGS) logs.push(logLine(arguments));
            else dropped++;
        }
        function done(r) {
            if (dropped) logs.push('… ' + dropped + ' ligne(s) de journal en plus');
            r.logs = logs;
            return r;
        }
        if (!/\S/.test(code)) return done({ ok: false, error: 'Code vide' });
        var fn;
        try {
            fn = new Function('log', code);
        } catch (e) {
            return done({ ok: false, syntax: true, error: 'Erreur de syntaxe : ' + message(e), line: e.line || null });
        }
        var value;
        try {
            value = ae.undo(name, function () { return fn(log); });
        } catch (e2) {
            return done({ ok: false, error: message(e2), line: e2.line || null, undo: name });
        }
        return done({ ok: true, value: plain(value, 0, null), undo: name });
    }

    // ------------------------------------------------------------------------
    //  Projet
    // ------------------------------------------------------------------------

    /** comp, folder, solid, placeholder, image, video, audio ou other. */
    function itemKind(item) {
        if (item instanceof CompItem) return 'comp';
        if (typeof FolderItem !== 'undefined' && item instanceof FolderItem) return 'folder';
        var main = null;
        try { main = item.mainSource; } catch (e) { main = null; }
        if (!main) return 'other';
        if (typeof SolidSource !== 'undefined' && main instanceof SolidSource) return 'solid';
        if (typeof PlaceholderSource !== 'undefined' && main instanceof PlaceholderSource) return 'placeholder';
        if (!item.hasVideo) return item.hasAudio ? 'audio' : 'other';
        return main.isStill ? 'image' : 'video';
    }

    function folderOf(item) {
        try {
            var f = item.parentFolder;
            if (!f) return null;
            var root = app.project.rootFolder;
            if (root && f.id === root.id) return null;
            return { id: f.id, name: f.name };
        } catch (e) {
            return null;
        }
    }

    function frameRateOf(comp) {
        var r = null;
        try { r = comp.frameRate; } catch (e) { r = null; }
        return round(r || (1 / comp.frameDuration));
    }

    function itemInfo(item) {
        var kind = itemKind(item);
        var out = { id: item.id, name: item.name, kind: kind };
        var folder = folderOf(item);
        if (folder) out.folder = folder;
        try { if (item.label) out.label = item.label; } catch (e0) { /* sans étiquette */ }
        if (kind === 'comp') {
            out.width = item.width;
            out.height = item.height;
            out.duration = round(item.duration);
            out.frameRate = frameRateOf(item);
            out.numLayers = item.numLayers;
        } else if (kind !== 'folder') {
            try { if (item.width) { out.width = item.width; out.height = item.height; } } catch (e1) { /* son seul */ }
            try { if (kind === 'video' || kind === 'audio') out.duration = round(item.duration); } catch (e2) { /* inconnue */ }
            try { var f = item.mainSource.file; if (f) out.file = f.fsName; } catch (e3) { /* pas de fichier */ }
            try { if (item.footageMissing) out.missing = true; } catch (e4) { /* inconnu */ }
        }
        return out;
    }

    /** args : { kind, name (contient, sans casse), limit }. */
    function project(args) {
        var p = app.project;
        if (!p) return { open: false };
        var a = args || {};
        var kind = hasValue(a.kind) ? String(a.kind) : null;
        var needle = hasValue(a.name) ? String(a.name) : null;
        var limit = clampInt(a.limit, 1, 2000, 300);
        var items = [], matched = 0, i;
        for (i = 1; i <= p.numItems; i++) {
            var item = p.item(i);
            if (kind && itemKind(item) !== kind) continue;
            if (needle && !contains(item.name, needle)) continue;
            matched++;
            if (items.length < limit) items.push(itemInfo(item));
        }
        var selection = [];
        try {
            var sel = p.selection;
            for (i = 0; i < sel.length; i++) selection.push(sel[i].id);
        } catch (e) { /* pas de sélection lisible */ }
        var active = p.activeItem;
        var out = {
            open: true,
            file: p.file ? p.file.fsName : null,
            numItems: p.numItems,
            activeItem: active ? { id: active.id, name: active.name, kind: itemKind(active) } : null,
            selection: selection,
            items: items,
            matched: matched
        };
        if (matched > items.length) out.truncated = true;
        try { if (p.bitsPerChannel) out.bitsPerChannel = p.bitsPerChannel; } catch (e2) { /* inconnu */ }
        return out;
    }

    // ------------------------------------------------------------------------
    //  Composition et calques
    // ------------------------------------------------------------------------

    /** Comp args.compId, sinon la comp active ; erreur explicite sinon. */
    function compOf(args) {
        var id = args ? args.compId : null;
        if (!hasValue(id)) {
            var active = ae.getActiveComp();
            if (!active) throw new Error('Aucune composition active : passe compId (voir get_project) ou ouvre une composition');
            return active;
        }
        var comp = ae.findCompById(Number(id));
        if (!comp) throw new Error('Composition introuvable : ' + id);
        return comp;
    }

    function timeOf(args, comp) {
        return (args && hasValue(args.time)) ? Number(args.time) : comp.time;
    }

    function compSummary(comp) {
        var out = {
            id: comp.id, name: comp.name, width: comp.width, height: comp.height,
            duration: round(comp.duration), frameRate: frameRateOf(comp), frameDuration: round(comp.frameDuration),
            time: round(comp.time), numLayers: comp.numLayers
        };
        try { out.pixelAspect = comp.pixelAspect; } catch (e0) { /* inconnu */ }
        try { out.displayStartTime = round(comp.displayStartTime); } catch (e1) { /* inconnu */ }
        try { out.workArea = { start: round(comp.workAreaStart), duration: round(comp.workAreaDuration) }; } catch (e2) { /* inconnue */ }
        try { out.bgColor = plain(comp.bgColor, 0, 4); } catch (e3) { /* inconnue */ }
        return out;
    }

    /** Nature d'un calque (celle de Libellés) : text, shape, video, image, audio, solid,
     *  null, adjustment, precomp, camera, light, other. */
    function layerKind(layer) {
        var labels = S.getTool('labels');
        var kind = 'other';
        try { if (labels && labels._core) kind = labels._core.layerType(layer); } catch (e) { kind = 'other'; }
        return kind === 'nullLayer' ? 'null' : kind;
    }

    var TRANSFORM = [
        ['anchor', 'ADBE Anchor Point'], ['position', 'ADBE Position'], ['scale', 'ADBE Scale'],
        ['rotation', 'ADBE Rotate Z'], ['opacity', 'ADBE Opacity'],
        ['orientation', 'ADBE Orientation'], ['rotationX', 'ADBE Rotate X'], ['rotationY', 'ADBE Rotate Y']
    ];

    function transformOf(layer, time) {
        var out = {}, tr;
        try { tr = layer.property('ADBE Transform Group'); } catch (e) { return out; }
        if (!tr) return out;
        for (var i = 0; i < TRANSFORM.length; i++) {
            try {
                var p = tr.property(TRANSFORM[i][1]);
                if (p) out[TRANSFORM[i][0]] = plain(p.valueAtTime(time, false), 0, 3);
            } catch (e1) { /* absente (calque 2D, caméra) */ }
        }
        return out;
    }

    function effectsOf(layer) {
        var out = [];
        try {
            var fx = layer.property('ADBE Effect Parade');
            for (var i = 1; fx && i <= fx.numProperties; i++) {
                var e = fx.property(i);
                var item = { name: e.name, matchName: e.matchName };
                try { if (e.enabled === false) item.enabled = false; } catch (e1) { /* toujours actif */ }
                out.push(item);
            }
        } catch (e0) { /* pas d'effets */ }
        return out;
    }

    function isLeaf(p) {
        try { return p.propertyType === PropertyType.PROPERTY; } catch (e) { return false; }
    }

    /** Propriétés animées (avec leur nombre de keyframes) et expressions actives d'un groupe. */
    function scan(group, path, out, depth) {
        if (depth > 12) return;
        var n = 0;
        try { n = group.numProperties; } catch (e) { return; }
        for (var i = 1; i <= n; i++) {
            var p = null;
            try { p = group.property(i); } catch (e1) { p = null; }
            if (!p) continue;
            var label = path ? path + SEP + p.name : p.name;
            if (isLeaf(p)) {
                try { if (p.numKeys > 0) out.animated.push(label + ' (' + p.numKeys + ')'); } catch (e2) { /* sans keyframes */ }
                try { if (p.expressionEnabled && p.expression) out.expressions.push(label); } catch (e3) { /* sans expression */ }
            } else {
                scan(p, label, out, depth + 1);
            }
        }
    }

    function layerInfo(layer, time) {
        var out = { index: layer.index, id: ae.layerId(layer), name: layer.name, kind: layerKind(layer) };
        try { var p = layer.parent; if (p) out.parent = p.index; } catch (e0) { /* sans parent */ }
        try { var src = layer.source; if (src) out.source = { id: src.id, name: src.name }; } catch (e1) { /* sans source */ }
        out.inPoint = round(layer.inPoint);
        out.outPoint = round(layer.outPoint);
        out.startTime = round(layer.startTime);
        out.label = layer.label;
        // Interrupteurs : seulement ceux qui diffèrent du réglage par défaut
        var flags = [['enabled', false], ['solo', true], ['shy', true], ['locked', true], ['threeDLayer', true],
                     ['selected', true], ['guideLayer', true], ['motionBlur', true]];
        for (var i = 0; i < flags.length; i++) {
            try { if (layer[flags[i][0]] === flags[i][1]) out[flags[i][0]] = flags[i][1]; } catch (e2) { /* absent */ }
        }
        out.transform = transformOf(layer, time);
        var fx = effectsOf(layer);
        if (fx.length) out.effects = fx;
        try {
            var masks = layer.property('ADBE Mask Parade');
            if (masks && masks.numProperties) out.masks = masks.numProperties;
        } catch (e3) { /* sans masque */ }
        var found = { animated: [], expressions: [] };
        scan(layer, '', found, 0);
        if (found.animated.length) out.animated = found.animated;
        if (found.expressions.length) out.expressions = found.expressions;
        try { if (layer.comment) out.comment = layer.comment; } catch (e4) { /* sans commentaire */ }
        return out;
    }

    /** Chemin d'une propriété depuis son calque : noms affichés et matchNames. */
    function pathOf(prop) {
        var names = [], matchNames = [];
        var depth = prop.propertyDepth;
        for (var k = depth - 1; k >= 1; k--) {
            var g = prop.propertyGroup(k);
            names.push(g.name);
            matchNames.push(g.matchName);
        }
        names.push(prop.name);
        matchNames.push(prop.matchName);
        return { name: names.join(SEP), matchNames: matchNames };
    }

    function selectionOf(comp) {
        var layers = [], props = [], i;
        var sel = comp.selectedLayers;
        for (i = 0; i < sel.length; i++) layers.push(sel[i].index);
        var leaves = [];
        try { leaves = ae.selectedProperties(comp); } catch (e) { leaves = []; }
        for (i = 0; i < leaves.length; i++) {
            var p = leaves[i];
            var item = { layer: ae.ownerLayer(p).index };
            try { var path = pathOf(p); item.path = path.name; item.matchNames = path.matchNames; } catch (e1) { item.path = p.name; }
            try { var keys = p.selectedKeys; if (keys && keys.length) item.selectedKeys = plain(keys, 0, null); } catch (e2) { /* aucune */ }
            props.push(item);
        }
        return { layers: layers, properties: props };
    }

    /** args : { compId, time, limit }. */
    function comp(args) {
        var c = compOf(args);
        var time = timeOf(args, c);
        var limit = clampInt(args && args.limit, 1, 1000, 200);
        var out = compSummary(c);
        var layers = [];
        for (var i = 1; i <= c.numLayers && i <= limit; i++) layers.push(layerInfo(c.layer(i), time));
        out.layers = layers;
        if (c.numLayers > limit) out.truncated = true;
        out.selection = selectionOf(c);
        return out;
    }

    // ------------------------------------------------------------------------
    //  Propriétés d'un calque
    // ------------------------------------------------------------------------

    function findLayer(c, a) {
        var layer = null;
        if (hasValue(a.layerId)) {
            layer = ae.findLayerById(c, Number(a.layerId));
        } else if (hasValue(a.layerIndex)) {
            var n = Number(a.layerIndex);
            if (n >= 1 && n <= c.numLayers) layer = c.layer(n);
        } else if (hasValue(a.layerName)) {
            var found = ae.findLayersByName(c, String(a.layerName));
            if (found.length > 1) throw new Error(found.length + ' calques s\'appellent « ' + a.layerName + ' » : passe layerIndex ou layerId');
            layer = found.length ? found[0] : null;
        } else {
            throw new Error('Indique le calque : layerIndex, layerId ou layerName');
        }
        if (!layer) throw new Error('Calque introuvable dans « ' + c.name + ' »');
        return layer;
    }

    var INTERP = null;
    function interpName(t) {
        if (!INTERP) {
            INTERP = {};
            try {
                INTERP[KeyframeInterpolationType.LINEAR] = 'linear';
                INTERP[KeyframeInterpolationType.BEZIER] = 'bezier';
                INTERP[KeyframeInterpolationType.HOLD] = 'hold';
            } catch (e) { /* énumération absente */ }
        }
        return INTERP.hasOwnProperty(t) ? INTERP[t] : String(t);
    }

    function keyInfo(p, i) {
        var k = { time: round(p.keyTime(i)), value: plain(p.keyValue(i), 0, 4) };
        try {
            k.inType = interpName(p.keyInInterpolationType(i));
            k.outType = interpName(p.keyOutInterpolationType(i));
            if (k.inType === 'bezier') k.easeIn = plain(p.keyInTemporalEase(i), 0, 3);
            if (k.outType === 'bezier') k.easeOut = plain(p.keyOutTemporalEase(i), 0, 3);
        } catch (e) { /* interpolation illisible */ }
        try { if (p.keySelected(i)) k.selected = true; } catch (e1) { /* inconnu */ }
        return k;
    }

    function readLeaf(p, node, opts) {
        var type = null;
        try { type = p.propertyValueType; } catch (e) { type = null; }
        if (type === PropertyValueType.CUSTOM_VALUE) {
            node.value = '[valeur personnalisée]';
        } else if (type !== PropertyValueType.NO_VALUE) {
            try { node.value = plain(p.valueAtTime(opts.time, false), 0, 4); } catch (e1) { node.value = '[illisible]'; }
        }
        try {
            var n = p.numKeys;
            if (n) {
                node.numKeys = n;
                if (opts.keys) {
                    node.keys = [];
                    for (var i = 1; i <= n && i <= MAX_KEYS; i++) node.keys.push(keyInfo(p, i));
                }
            }
        } catch (e2) { /* sans keyframes */ }
        try {
            if (p.expression) {
                node.expression = p.expression;
                node.expressionEnabled = !!p.expressionEnabled;
                var err = p.expressionError;
                if (err) node.expressionError = err;
            }
        } catch (e3) { /* sans expression */ }
        try { if (p.dimensionsSeparated) node.dimensionsSeparated = true; } catch (e4) { /* non séparées */ }
    }

    function propNode(p, depth, opts) {
        var node = { name: p.name, matchName: p.matchName };
        try { if (p.propertyIndex) node.index = p.propertyIndex; } catch (e0) { /* inconnu */ }
        if (isLeaf(p)) {
            readLeaf(p, node, opts);
        } else {
            var n = 0;
            try { n = p.numProperties; } catch (e1) { n = 0; }
            if (depth >= opts.depth) {
                if (n) node.numProperties = n;
            } else {
                node.children = [];
                for (var i = 1; i <= n; i++) {
                    var c = null;
                    try { c = p.property(i); } catch (e2) { c = null; }
                    if (c) node.children.push(propNode(c, depth + 1, opts));
                }
            }
        }
        try { if (p.canSetEnabled && p.enabled === false) node.enabled = false; } catch (e3) { /* toujours actif */ }
        return node;
    }

    /** args : { compId, layerIndex | layerId | layerName, path: [nom | matchName | index…],
     *  depth (1-10, 3), keys (détail des keyframes), time }. */
    function properties(args) {
        var a = args || {};
        var c = compOf(a);
        var layer = findLayer(c, a);
        var opts = { time: timeOf(a, c), depth: clampInt(a.depth, 1, 10, 3), keys: !!a.keys };
        var target = layer, trail = [];
        var path = isArray(a.path) ? a.path : [];
        for (var i = 0; i < path.length; i++) {
            var seg = path[i];
            var next = null;
            try { next = target.property(seg); } catch (e) { next = null; }
            if (!next) {
                throw new Error('Propriété introuvable : « ' + seg + ' »' + (trail.length ? ' dans ' + trail.join(SEP) : '') +
                    ' (calque « ' + layer.name + ' »)');
            }
            trail.push(next.name);
            target = next;
        }
        var root;
        if (path.length) {
            root = propNode(target, 0, opts);
        } else {
            root = { name: layer.name, children: [] };
            for (var k = 1; k <= layer.numProperties; k++) {
                var top = null;
                try { top = layer.property(k); } catch (e1) { top = null; }
                if (top) root.children.push(propNode(top, 1, opts));
            }
        }
        return { comp: { id: c.id, name: c.name }, layer: { index: layer.index, id: ae.layerId(layer), name: layer.name },
                 time: round(opts.time), tree: root };
    }

    // ------------------------------------------------------------------------
    //  Frame
    // ------------------------------------------------------------------------

    /** args : { compId, time }. Rend la frame en PNG dans <temp>/SIMING/claude-<n>.png ;
     *  le fichier peut n'être complet qu'après le retour (le service attend sa fin). */
    function frame(args) {
        var c = compOf(args);
        var time = timeOf(args, c);
        if (typeof c.saveFrameToPng !== 'function') throw new Error('Cette version d\'After Effects ne sait pas rendre une frame par script');
        var folder = new Folder(Folder.temp.fsName + '/SIMING');
        if (!folder.exists) folder.create();
        var old = folder.getFiles('claude-*.png');
        for (var i = 0; i < old.length; i++) { try { old[i].remove(); } catch (e0) { /* encore ouvert */ } }
        var file = new File(folder.fsName + '/claude-' + (new Date()).getTime() + '.png');
        try {
            c.saveFrameToPng(time, file);
        } catch (e) {
            throw new Error('Rendu impossible : ' + message(e) + ' (' + MSG_WRITE + ')');
        }
        return { path: file.fsName, comp: { id: c.id, name: c.name, width: c.width, height: c.height },
                 time: round(time), frame: Math.round(time / c.frameDuration) };
    }

    // ------------------------------------------------------------------------
    //  API publique
    // ------------------------------------------------------------------------

    var api = {
        run: run,
        project: project,
        comp: comp,
        properties: properties,
        frame: frame
    };

    api._core = {
        plain:     plain,
        typeName:  typeName,
        undoName:  undoName,
        itemKind:  itemKind,
        layerKind: layerKind
    };

    S.registerTool('mcp', api);

})();
