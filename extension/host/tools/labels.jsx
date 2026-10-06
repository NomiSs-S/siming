/*
 * ============================================================================
 *  Libellés  -  outil hôte SIMING (ExtendScript, ES3)
 * ============================================================================
 *
 *  Pose l'étiquette de couleur des calques d'après des règles :
 *  - mots-clés d'abord, dans l'ordre de la liste, cherchés en mots entiers dans
 *    le nom du calque, le nom de sa source, son fichier et les dossiers du projet
 *    qui la contiennent (« .ai » vise l'extension du fichier) ;
 *  - sinon la nature du calque (texte, forme, vidéo, image…).
 *  Rien n'est automatique : analyze propose, la vue corrige, apply pose.
 *
 *  Règles envoyées par la vue : { words: [{ words: 'logo, bg', label: 9 }],
 *  types: { text: 2, … } }. Étiquette : 0 = Aucune, 1 à 16, KEEP (-1) = ne pas changer.
 *  Contraintes : ES3, jamais === entre deux calques, UTF-8 avec BOM.
 * ============================================================================
 */
(function () {

    var S  = $.global.SIMING;
    var ae = S.ae;

    var TOOL_NAME = 'Libellés';
    var KEEP = -1;

    /** Natures de calque, dans l'ordre d'affichage des règles. */
    var TYPES = [
        { id: 'text',       name: 'Texte' },
        { id: 'shape',      name: 'Forme' },
        { id: 'video',      name: 'Vidéo' },
        { id: 'image',      name: 'Image' },
        { id: 'audio',      name: 'Son' },
        { id: 'solid',      name: 'Solide' },
        { id: 'nullLayer',  name: 'Nul' },
        { id: 'adjustment', name: 'Réglage' },
        { id: 'precomp',    name: 'Précompo' },
        { id: 'camera',     name: 'Caméra' },
        { id: 'light',      name: 'Lumière' },
        { id: 'other',      name: 'Autre' }
    ];

    /** Règles de départ : couleurs choisies par Simon (étiquettes AE par défaut). */
    function defaultRules() {
        return {
            words: [
                { words: 'logo', label: 9 },
                { words: 'fond, bg, background, arrière-plan', label: 1 }
            ],
            types: {
                text: 2, shape: 8, video: 13, image: 11, audio: 7, solid: 1, nullLayer: 1,
                adjustment: 10, precomp: 15, camera: 4, light: 6, other: KEEP
            }
        };
    }

    function isArray(v) { return Object.prototype.toString.call(v) === '[object Array]'; }

    function typeName(id) {
        for (var i = 0; i < TYPES.length; i++) if (TYPES[i].id === id) return TYPES[i].name;
        return id;
    }

    /** Étiquette 0 à 16, sinon KEEP. */
    function normLabel(v) {
        var n = parseInt(v, 10);
        return (n >= 0 && n <= 16) ? n : KEEP;
    }

    /** Règles complètes : sans règles, celles par défaut ; nature absente = valeur par défaut. */
    function normalizeRules(r) {
        var def = defaultRules();
        if (!r || typeof r !== 'object') return def;
        var out = { words: [], types: {} };
        var words = isArray(r.words) ? r.words : [];
        for (var i = 0; i < words.length; i++) {
            if (!words[i]) continue;
            out.words.push({ words: String(words[i].words || ''), label: normLabel(words[i].label) });
        }
        var types = (r.types && typeof r.types === 'object') ? r.types : {};
        for (var k = 0; k < TYPES.length; k++) {
            var id = TYPES[k].id;
            out.types[id] = types.hasOwnProperty(id) ? normLabel(types[id]) : def.types[id];
        }
        return out;
    }

    // ------------------------------------------------------------------------
    //  Mots : minuscules sans accents, découpage en mots entiers
    // ------------------------------------------------------------------------

    var ACCENTS = [
        [/[àáâãäå]/g, 'a'], [/ç/g, 'c'], [/[èéêë]/g, 'e'], [/[ìíîï]/g, 'i'], [/ñ/g, 'n'],
        [/[òóôõö]/g, 'o'], [/[ùúûü]/g, 'u'], [/[ýÿ]/g, 'y'], [/œ/g, 'oe'], [/æ/g, 'ae']
    ];

    function fold(s) {
        var t = String(s === null || s === undefined ? '' : s).toLowerCase();
        for (var i = 0; i < ACCENTS.length; i++) t = t.replace(ACCENTS[i][0], ACCENTS[i][1]);
        return t;
    }

    /** Mots d'un nom : « LOGO_client-02 » -> logo, client, 02 ; « logoClient » -> logo, client. */
    function tokens(s) {
        var t = String(s === null || s === undefined ? '' : s)
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/([A-Za-z])([0-9])/g, '$1 $2')
            .replace(/([0-9])([A-Za-z])/g, '$1 $2');
        var parts = fold(t).split(/[^a-z0-9]+/), out = [];
        for (var i = 0; i < parts.length; i++) if (parts[i] !== '') out.push(parts[i]);
        return out;
    }

    /** « logo, .ai ; arrière-plan » -> [{ text, tokens }] ou [{ text, ext }] (extension). */
    function parsePhrases(str) {
        var parts = String(str || '').split(/[,;]+/), out = [];
        for (var i = 0; i < parts.length; i++) {
            var raw = parts[i].replace(/^\s+|\s+$/g, '');
            if (raw === '') continue;
            if (raw.charAt(0) === '.') {
                var ext = fold(raw.substring(1)).replace(/[^a-z0-9]/g, '');
                if (ext !== '') out.push({ text: raw, ext: ext });
                continue;
            }
            var tk = tokens(raw);
            if (tk.length) out.push({ text: raw, tokens: tk });
        }
        return out;
    }

    /** Mot identique, au pluriel en s ou x près. */
    function sameToken(word, tok) {
        return tok === word || tok === word + 's' || tok === word + 'x';
    }

    /** Les mots de la phrase se suivent-ils dans le texte ? */
    function containsPhrase(textTokens, phraseTokens) {
        var n = phraseTokens.length;
        for (var i = 0; i + n <= textTokens.length; i++) {
            var ok = true;
            for (var j = 0; j < n; j++) {
                if (!sameToken(phraseTokens[j], textTokens[i + j])) { ok = false; break; }
            }
            if (ok) return true;
        }
        return false;
    }

    /** Règles prêtes à l'emploi (phrases découpées une fois pour toute l'analyse). */
    function compileRules(r) {
        var rules = normalizeRules(r), words = [];
        for (var i = 0; i < rules.words.length; i++) {
            words.push({ label: rules.words[i].label, phrases: parsePhrases(rules.words[i].words) });
        }
        return { words: words, types: rules.types };
    }

    /** Règle qui s'applique à un calque décrit par info { type, texts[], ext } :
     *  { rule: 'word:<n>' | 'type:<id>', label, reason }. */
    function classify(info, compiled) {
        var texts = [], i;
        for (i = 0; i < info.texts.length; i++) texts.push(tokens(info.texts[i]));
        for (var w = 0; w < compiled.words.length; w++) {
            var phrases = compiled.words[w].phrases;
            for (var p = 0; p < phrases.length; p++) {
                var ph = phrases[p], hit = false;
                if (ph.ext) {
                    hit = (info.ext === ph.ext);
                } else {
                    for (i = 0; i < texts.length && !hit; i++) hit = containsPhrase(texts[i], ph.tokens);
                }
                if (hit) {
                    return { rule: 'word:' + w, label: compiled.words[w].label,
                             reason: (ph.ext ? 'extension « ' : 'mot « ') + ph.text + ' »' };
                }
            }
        }
        var type = info.type;
        return { rule: 'type:' + type, reason: typeName(type),
                 label: compiled.types.hasOwnProperty(type) ? compiled.types[type] : KEEP };
    }

    // ------------------------------------------------------------------------
    //  Lecture d'un calque
    // ------------------------------------------------------------------------

    function sourceOf(layer) {
        try { return layer.source || null; } catch (e) { return null; }
    }

    /** Nature du calque (un des TYPES). */
    function layerType(layer) {
        if (typeof CameraLayer !== 'undefined' && layer instanceof CameraLayer) return 'camera';
        if (typeof LightLayer !== 'undefined' && layer instanceof LightLayer) return 'light';
        if (layer.adjustmentLayer) return 'adjustment';
        if (layer.nullLayer) return 'nullLayer';
        if (typeof TextLayer !== 'undefined' && layer instanceof TextLayer) return 'text';
        if (typeof ShapeLayer !== 'undefined' && layer instanceof ShapeLayer) return 'shape';
        var src = sourceOf(layer);
        if (!src) return 'other';
        if (src instanceof CompItem) return 'precomp';
        var main = null;
        try { main = src.mainSource; } catch (e) { main = null; }
        if (main && typeof SolidSource !== 'undefined' && main instanceof SolidSource) return 'solid';
        if (!src.hasVideo) return src.hasAudio ? 'audio' : 'other';
        if (main && main.isStill) return 'image';
        return 'video';
    }

    function squash(s) {
        return fold(s).replace(/\s+/g, ' ').replace(/^ | $/g, '');
    }

    /** Un calque texte garde-t-il le nom automatique (début du texte affiché) ? */
    function autoTextName(layer) {
        var content = null;
        try {
            content = layer.property('ADBE Text Properties').property('ADBE Text Document').value.text;
        } catch (e) {
            content = null;
        }
        if (content === null || content === undefined) return false;
        var n = squash(layer.name), c = squash(content);
        return n !== '' && c.substr(0, n.length) === n;
    }

    function decodedName(file) {
        if (file.displayName) return String(file.displayName);
        try { return File.decode(file.name); } catch (e) { return String(file.name); }
    }

    /** Noms des dossiers du projet qui contiennent item (racine exclue). */
    function folderNames(item, out) {
        var root = null, f = null;
        try { root = app.project.rootFolder; } catch (e) { root = null; }
        try { f = item.parentFolder; } catch (e2) { f = null; }
        for (var depth = 0; f && depth < 32; depth++) {
            if (root && f.id === root.id) break;
            out.push(f.name);
            try { f = f.parentFolder; } catch (e3) { f = null; }
        }
    }

    /** { type, texts[], ext } : ce que les règles regardent. Un calque texte au nom
     *  automatique n'est pas comparé par son nom (ce serait le texte affiché). */
    function layerInfo(layer) {
        var type = layerType(layer), texts = [], ext = '';
        if (!(type === 'text' && autoTextName(layer))) texts.push(layer.name);
        var src = sourceOf(layer);
        if (src) {
            texts.push(src.name);
            var file = null;
            try { file = src.mainSource ? src.mainSource.file : null; } catch (e) { file = null; }
            if (file) {
                var fname = decodedName(file);
                var m = /^(.*)\.([^.]+)$/.exec(fname);
                texts.push(m ? m[1] : fname);
                if (m) ext = fold(m[2]);
            }
            folderNames(src, texts);
        }
        return { type: type, texts: texts, ext: ext };
    }

    function describeLayer(layer, compiled) {
        var info = layerInfo(layer);
        var c = classify(info, compiled);
        return {
            id: ae.layerId(layer), name: layer.name, type: info.type,
            rule: c.rule, reason: c.reason, current: layer.label, proposed: c.label
        };
    }

    /** Les 17 étiquettes (0 = Aucune) : { index, color, name } d'après les Préférences. */
    function palette() {
        var out = [];
        for (var n = 0; n <= 16; n++) out.push({ index: n, color: ae.labelColor(n), name: ae.labelName(n) });
        return out;
    }

    function countChanges(entries) {
        var n = 0;
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            if (e.proposed !== KEEP && e.proposed !== e.current) n++;
        }
        return n;
    }

    // ------------------------------------------------------------------------
    //  API publique : chaque fonction renvoie l'état complet de la vue
    // ------------------------------------------------------------------------

    var MSG_START   = 'Choisis Sélection ou Composition, puis clique la carte pour analyser';
    var MSG_NO_COMP = 'Aucune composition active : ouvre une composition';
    var MSG_GONE    = 'La composition analysée n\'existe plus : clique la carte pour analyser à nouveau';

    function status(text, level) { return { text: text, level: level }; }

    function snapshot(comp, scope, entries, st, report) {
        var ids = [];
        for (var i = 0; i < entries.length; i++) ids.push(entries[i].id);
        return {
            comp:    comp ? { id: comp.id, name: comp.name } : null,
            scope:   scope,
            ids:     ids,
            entries: entries,
            types:   TYPES,
            keep:    KEEP,
            palette: palette(),
            report:  report || null,
            status:  st
        };
    }

    function collect(layers, compiled) {
        var out = [];
        for (var i = 0; i < layers.length; i++) out.push(describeLayer(layers[i], compiled));
        return out;
    }

    function layersById(comp, ids) {
        var out = [];
        for (var i = 0; i < ids.length; i++) {
            var layer = ae.findLayerById(comp, ids[i]);
            if (layer) out.push(layer);
        }
        return out;
    }

    function summary(entries) {
        var n = countChanges(entries);
        return status(S.plural(entries.length, 'calque analysé', 'calques analysés') + ' · ' +
                      (n === 0 ? 'tout a déjà la bonne couleur' : S.plural(n, 'libellé à changer', 'libellés à changer')),
                      n === 0 ? 'ok' : 'info');
    }

    function scopeOf(args) {
        return (args && args.scope === 'comp') ? 'comp' : 'selection';
    }

    var api = {
        /** État de départ : palette, natures, règles par défaut. */
        init: function (args) {
            var s = snapshot(null, scopeOf(args), [], status(MSG_START, 'info'));
            s.defaults = defaultRules();
            return s;
        },

        /** Propose une étiquette par calque. args : { scope, rules } pour lire la comp
         *  active ; { compId, ids, rules } pour ré-analyser les mêmes calques. */
        analyze: function (args) {
            var scope = scopeOf(args);
            var compiled = compileRules(args && args.rules);
            var comp, layers = [], i;
            if (args && isArray(args.ids) && args.compId !== undefined && args.compId !== null) {
                comp = ae.findCompById(args.compId);
                if (!comp) return snapshot(null, scope, [], status(MSG_GONE, 'warn'));
                layers = layersById(comp, args.ids);
                if (!layers.length) {
                    return snapshot(comp, scope, [], status('Les calques analysés n\'existent plus : clique la carte pour analyser à nouveau', 'warn'));
                }
            } else {
                comp = ae.getActiveComp();
                if (!comp) return snapshot(null, scope, [], status(MSG_NO_COMP, 'error'));
                if (scope === 'comp') {
                    for (i = 1; i <= comp.numLayers; i++) layers.push(comp.layer(i));
                    if (!layers.length) return snapshot(comp, scope, [], status('« ' + comp.name + ' » ne contient aucun calque', 'warn'));
                } else {
                    var sel = comp.selectedLayers || [];
                    for (i = 0; i < sel.length; i++) layers.push(sel[i]);
                    if (!layers.length) {
                        return snapshot(comp, scope, [], status('Aucun calque sélectionné dans « ' + comp.name +
                                        ' » : sélectionne des calques ou choisis Composition', 'warn'));
                    }
                }
            }
            var entries = collect(layers, compiled);
            return snapshot(comp, scope, entries, summary(entries));
        },

        /** Pose les étiquettes. args : { compId, changes: [{ id, label }], ids, rules, scope } ;
         *  renvoie la nouvelle analyse des calques ids. Un seul groupe d'annulation. */
        apply: function (args) {
            var scope = scopeOf(args);
            var comp = (args && args.compId !== undefined && args.compId !== null) ? ae.findCompById(args.compId) : null;
            if (!comp) return snapshot(null, scope, [], status(MSG_GONE, 'warn'));
            var changes = (args && isArray(args.changes)) ? args.changes : [];
            var rep = { done: 0, skipped: [] };
            if (changes.length) {
                ae.undo(TOOL_NAME + ' : appliquer', function () {
                    for (var i = 0; i < changes.length; i++) {
                        var c = changes[i] || {};
                        var label = normLabel(c.label);
                        if (label === KEEP) continue;
                        var layer = ae.findLayerById(comp, c.id);
                        if (!layer) { rep.skipped.push('calque n°' + c.id + ' : introuvable'); continue; }
                        try {
                            layer.label = label;
                            rep.done++;
                        } catch (e) {
                            rep.skipped.push(layer.name + ' : ' + e.message);
                        }
                    }
                });
            }
            var ids = (args && isArray(args.ids)) ? args.ids : [];
            if (!ids.length) for (var k = 0; k < changes.length; k++) if (changes[k]) ids.push(changes[k].id);
            var entries = collect(layersById(comp, ids), compileRules(args && args.rules));
            var text = changes.length ? S.plural(rep.done, 'libellé posé', 'libellés posés') : 'Aucun libellé à changer';
            if (rep.skipped.length) text += ' · ' + rep.skipped.length + ' ignoré(s)';
            if (rep.done) text += ' · Ctrl+Z pour annuler';
            return snapshot(comp, scope, entries,
                status(text, (rep.skipped.length || rep.done === 0) ? 'warn' : 'ok'), rep);
        }
    };

    api._core = {
        KEEP:           KEEP,
        TYPES:          TYPES,
        defaultRules:   defaultRules,
        normalizeRules: normalizeRules,
        compileRules:   compileRules,
        fold:           fold,
        tokens:         tokens,
        parsePhrases:   parsePhrases,
        containsPhrase: containsPhrase,
        classify:       classify,
        layerType:      layerType,
        layerInfo:      layerInfo,
        autoTextName:   autoTextName,
        palette:        palette
    };

    S.registerTool('labels', api);
    return api;

})();
