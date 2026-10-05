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

    $.global.SIMING = SIMING;

})();
