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
