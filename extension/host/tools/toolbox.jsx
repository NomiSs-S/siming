/*
 * ============================================================================
 *  Boîte à outils  -  outil hôte SIMING (ExtendScript, ES3)
 * ============================================================================
 *
 *  Gestes rapides, un clic chacun, un Ctrl+Z chacun :
 *  - frame : rend l'image de la tête de lecture en PNG (dossier temporaire) ; le panneau
 *    la copie dans le presse-papier (Node de CEP, sinon copyImage par system.callSystem) ;
 *  - sequence : séquence les calques ou les keyframes sélectionnés en cascade, en ordre
 *    inverse ou dans un ordre tiré au hasard ; « écart » = images entre deux départs,
 *    « par paquets de » = combien partent ensemble ; le plus tôt reste en place ;
 *    keepFrame l'enregistre à côté du projet (dossier « Frames ») ;
 *  - nullFor : null au centre des calques sélectionnés, relié à eux ;
 *  - background : calque de forme « Fond » en bas, toujours à la taille de la comp ;
 *  - format : 16:9, 4:5, 1:1, 9:16, plus petit côté gardé, contenu recentré ;
 *    duplicateFormats : copies de la comp dans les autres formats ;
 *  - workArea : zone de travail sur les calques sélectionnés, ou comp rognée à la zone ;
 *  - revealSource : sources des calques sélectionnés dans le panneau Projet ;
 *    revealFile : leur fichier dans l'Explorateur / le Finder ;
 *  - convertPsdText : calques texte d'un Photoshop importé -> texte modifiable ;
 *  - bakeExpressions : expressions actives -> une keyframe par image, expression désactivée.
 *
 *  Chaque fonction d'API renvoie { report: { done, skipped[] } | null, status: { text, level },
 *  comp: { id, name, width, height, format, bg } | null }.
 *  Contraintes : ES3, jamais === entre deux calques, UTF-8 avec BOM.
 * ============================================================================
 */
(function () {

    var S  = $.global.SIMING;
    var ae = S.ae;
    var G  = S.geom;

    var TOOL_NAME = 'Boîte à outils';

    // ------------------------------------------------------------------------
    //  Fonctions pures
    // ------------------------------------------------------------------------

    var FORMATS = { '16:9': [16, 9], '4:5': [4, 5], '1:1': [1, 1], '9:16': [9, 16] };
    var FORMAT_IDS = ['16:9', '4:5', '1:1', '9:16'];

    function even(x) {
        var n = Math.round(x / 2) * 2;
        return (n < 2) ? 2 : n;
    }

    /** Nouvelle taille [largeur, hauteur] au format id : le plus petit côté est gardé, l'autre
     *  arrondi au pair (1920 × 1080 -> 9:16 = 1080 × 1920, 4:5 = 1080 × 1350). null si id inconnu. */
    function formatSize(w, h, id) {
        var r = FORMATS.hasOwnProperty(id) ? FORMATS[id] : null;
        if (!r) return null;
        var side = Math.min(w, h);   // plus petit côté (« short » est un mot réservé d'ES3)
        if (r[0] === r[1]) return [side, side];
        if (r[0] > r[1]) return [even(side * r[0] / r[1]), side];
        return [side, even(side * r[1] / r[0])];
    }

    /** Format connu d'une taille (à 1 % près), ou null. */
    function formatOf(w, h) {
        if (!(w > 0) || !(h > 0)) return null;
        for (var i = 0; i < FORMAT_IDS.length; i++) {
            var r = FORMATS[FORMAT_IDS[i]];
            if (Math.abs(w / h - r[0] / r[1]) < 0.01 * r[0] / r[1]) return FORMAT_IDS[i];
        }
        return null;
    }

    /** Mélange en place (Fisher-Yates) ; rand() dans [0, 1[. */
    function shuffle(arr, rand) {
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(rand() * (i + 1));
            if (j > i) j = i;
            var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
    }

    /** Créneau de départ de chacun des n éléments (0 = le premier départ) :
     *  rang dans l'ordre choisi (cascade = ordre donné, reverse = inverse, random = tiré au
     *  hasard), divisé par la taille des paquets. */
    function slots(n, mode, group, rand) {
        var g = Math.max(1, Math.floor(group) || 1), rank = [], i;
        for (i = 0; i < n; i++) rank.push(i);
        if (mode === 'reverse') rank.reverse();
        else if (mode === 'random') shuffle(rank, rand || Math.random);
        var out = [];
        for (i = 0; i < n; i++) out.push(Math.floor(rank[i] / g));
        return out;
    }

    /** Départs visés : le plus tôt des départs actuels + créneau × écart (secondes). */
    function sequenceTargets(starts, slotList, gap) {
        var base = starts[0], i, out = [];
        for (i = 1; i < starts.length; i++) if (starts[i] < base) base = starts[i];
        for (i = 0; i < starts.length; i++) out.push(base + slotList[i] * gap);
        return out;
    }

    function clampNumber(x, lo, hi, fallback) {
        var n = parseFloat(x);
        if (isNaN(n)) return fallback;
        return Math.min(hi, Math.max(lo, n));
    }

    /** '#RRGGBB' -> [r, g, b] de 0 à 1, ou null. */
    function hexToRgb(hex) {
        var m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || ''));
        if (!m) return null;
        var n = parseInt(m[1], 16);
        return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    }

    /** [r, g, b] de 0 à 1 -> '#RRGGBB'. */
    function rgbToHex(c) {
        var s = '#';
        for (var i = 0; i < 3; i++) {
            var v = Math.round(Math.max(0, Math.min(1, Number(c[i]) || 0)) * 255);
            s += (v < 16 ? '0' : '') + v.toString(16);
        }
        return s.toUpperCase();
    }

    /** Largeur et hauteur lues dans l'en-tête d'un PNG (24 premiers octets, un caractère
     *  par octet), ou null si ce n'est pas un PNG. */
    function pngSize(head) {
        if (typeof head !== 'string' || head.length < 24 || head.substr(1, 3) !== 'PNG' || head.substr(12, 4) !== 'IHDR') return null;
        function u32(i) {
            return head.charCodeAt(i) * 16777216 + head.charCodeAt(i + 1) * 65536 + head.charCodeAt(i + 2) * 256 + head.charCodeAt(i + 3);
        }
        return { width: u32(16), height: u32(20) };
    }

    function psString(s) { return '\'' + String(s).replace(/'/g, '\'\'') + '\''; }
    function jsString(s) { return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'; }

    /** Programme qui met l'image PNG `path` dans le presse-papier : { file, args }.
     *  Windows : PowerShell (image + format PNG, la transparence passe dans les applis qui le lisent) ;
     *  macOS : osascript en JavaScript (NSPasteboard). Le script Windows n'a aucun guillemet
     *  double (il tient entre « "…" » pour cmd) ; côté macOS, shellCommand échappe les apostrophes. */
    function clipboardProgram(isMac, path) {
        if (isMac) {
            return { file: 'osascript', args: ['-l', 'JavaScript', '-e',
                'ObjC.import("AppKit");' +
                'var i=$.NSImage.alloc.initWithContentsOfFile(' + jsString(path) + ');' +
                'if(i.isNil())throw new Error("image illisible");' +
                'var p=$.NSPasteboard.generalPasteboard;p.clearContents;' +
                'p.writeObjects($.NSArray.arrayWithObject(i));'] };
        }
        return { file: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-STA', '-WindowStyle', 'Hidden', '-Command',
            'Add-Type -AssemblyName System.Windows.Forms,System.Drawing;' +
            '$i=[System.Drawing.Image]::FromFile(' + psString(path) + ');' +
            '$d=New-Object System.Windows.Forms.DataObject;$d.SetImage($i);' +
            '$m=New-Object System.IO.MemoryStream;$i.Save($m,[System.Drawing.Imaging.ImageFormat]::Png);' +
            '$d.SetData(\'PNG\',$false,$m);' +
            '[System.Windows.Forms.Clipboard]::SetDataObject($d,$true);$i.Dispose()'] };
    }

    /** La même chose en une ligne de commande, pour system.callSystem. */
    function shellCommand(program, isMac) {
        var a = program.args, last = a[a.length - 1];
        var head = [program.file].concat(a.slice(0, a.length - 1)).join(' ');
        if (isMac) return head + ' \'' + last.replace(/'/g, '\'\\\'\'') + '\'';
        return head + ' "' + last + '"';
    }

    /** Programme qui montre un fichier sélectionné dans l'Explorateur ou le Finder.
     *  explorer.exe rend le code de sortie 1 même quand tout va bien : anyExit. */
    function revealProgram(isMac, path) {
        if (isMac) return { file: 'open', args: ['-R', String(path)] };
        return { file: 'explorer.exe', args: ['/select,', String(path)], anyExit: true };
    }

    /** Programme qui ouvre un dossier dans l'Explorateur ou le Finder. */
    function openFolderProgram(isMac, path) {
        if (isMac) return { file: 'open', args: [String(path)] };
        return { file: 'explorer.exe', args: [String(path)], anyExit: true };
    }

    /** Nom de fichier sans caractères interdits (Windows, macOS), 80 caractères au plus. */
    function safeName(s) {
        var n = String(s || '').replace(/[\\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^[\s.]+|[\s.]+$/g, '');
        if (n.length > 80) n = n.substr(0, 80);
        return n || 'Composition';
    }

    /** « Pub_00125.png » : nom de la comp et numéro de l'image (5 chiffres au moins). */
    function frameFileName(compName, frame) {
        var f = String(Math.max(0, Math.round(frame)));
        while (f.length < 5) f = '0' + f;
        return safeName(compName) + '_' + f + '.png';
    }

    var FORMAT_SUFFIX = /\s+(16x9|4x5|1x1|9x16)$/;

    /** Nom d'une déclinaison : « Pub » ou « Pub 16x9 » -> « Pub 9x16 ». */
    function variantName(name, id) {
        return String(name).replace(FORMAT_SUFFIX, '') + ' ' + String(id).replace(':', 'x');
    }

    /** Formats à décliner : tous sauf celui de la comp (tous si elle n'en a aucun). */
    function otherFormats(current) {
        var out = [];
        for (var i = 0; i < FORMAT_IDS.length; i++) if (FORMAT_IDS[i] !== current) out.push(FORMAT_IDS[i]);
        return out;
    }

    /** Zone de travail sur [début, fin], bornée à la comp ; null si moins d'une image y reste. */
    function workAreaFor(start, end, compDuration, frameDuration) {
        var s = Math.max(0, start), e = Math.min(compDuration, end);
        if (e - s < frameDuration - 1e-9) return null;
        return { start: s, duration: e - s };
    }

    function isArray(v) { return Object.prototype.toString.call(v) === '[object Array]'; }

    /** Échantillons allégés : une valeur égale à ses deux voisines est retirée (résultat identique
     *  en interpolation linéaire). Valeurs nombres ou tableaux ; tout le reste est gardé. */
    function thinSamples(times, values) {
        function same(a, b) {
            if (typeof a === 'number' || typeof b === 'number') return a === b;
            if (!isArray(a) || !isArray(b) || a.length !== b.length) return false;
            for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
            return true;
        }
        var t = [], v = [];
        for (var i = 0; i < times.length; i++) {
            if (i > 0 && i < times.length - 1 && same(values[i], values[i - 1]) && same(values[i], values[i + 1])) continue;
            t.push(times[i]);
            v.push(values[i]);
        }
        return { times: t, values: v };
    }

    /** « 2,40 s ». */
    function seconds(t) {
        return (Math.round(t * 100) / 100).toFixed(2).replace('.', ',') + ' s';
    }

    // ------------------------------------------------------------------------
    //  Accès After Effects
    // ------------------------------------------------------------------------

    function isMac() {
        try { return /mac/i.test(String($.os)); } catch (e) { return false; }
    }

    function compInfo(comp) {
        if (!comp) return null;
        return {
            id: comp.id, name: comp.name, width: comp.width, height: comp.height,
            format: formatOf(comp.width, comp.height), bg: rgbToHex(comp.bgColor || [0, 0, 0])
        };
    }

    /** Préférence « Autoriser les scripts à écrire des fichiers et à accéder au réseau » :
     *  true, false, ou null si elle ne se lit pas (on tente alors quand même). */
    function writeAllowed() {
        var key = 'Pref_SCRIPTING_FILE_NETWORK_SECURITY', sections = ['Main Pref Section v2', 'Main Pref Section'];
        for (var i = 0; i < sections.length; i++) {
            try {
                var prefs = app.preferences;
                if (typeof prefs.havePref === 'function' && !prefs.havePref(sections[i], key)) continue;
                return prefs.getPrefAsLong(sections[i], key) === 1;
            } catch (e) { /* section suivante */ }
        }
        return null;
    }

    var MSG_WRITE = 'After Effects interdit aux scripts d\'écrire des fichiers : active Préférences › Scripts et expressions › « Autoriser les scripts à écrire des fichiers et à accéder au réseau »';

    function frameFolder() {
        var f = new Folder(Folder.temp.fsName + '/SIMING');
        if (!f.exists) f.create();
        return f;
    }

    var FRAME_FILE = /[\\\/]SIMING[\\\/]frame-\d+\.png$/;   // dans le dossier temporaire de l'outil

    /** Fichier de frame rendu par cet outil (chemin vérifié), ou null. */
    function frameFile(path) {
        var p = String(path || '');
        return FRAME_FILE.test(p) ? new File(p) : null;
    }

    function readPngSize(file) {
        file.encoding = 'BINARY';
        if (!file.open('r')) return null;
        try {
            return pngSize(file.read(24));
        } finally {
            file.close();
        }
    }

    /** Identifiant d'une commande de menu d'après son nom (anglais, français), sinon fallback. */
    function commandId(names, fallback) {
        for (var i = 0; i < names.length; i++) {
            try {
                var id = app.findMenuCommandId(names[i]);
                if (id > 0) return id;
            } catch (e) { /* nom suivant */ }
        }
        return fallback || 0;
    }

    // Noms de menus : anglais, français (libellé complet ou du sous-menu). Aucun identifiant numérique
    // de repli : non vérifié, il lancerait n'importe quelle commande.
    var REVEAL_NAMES  = ['Reveal Layer Source in Project', 'Layer Source in Project',
                         'Afficher la source du calque dans le projet', 'Source du calque dans le projet'];
    var CONVERT_NAMES = ['Convert to Editable Text', 'Convertir en texte modifiable', 'Convertir en texte éditable'];

    function deselectLayers(comp) {
        var sel = comp.selectedLayers;
        for (var i = 0; i < sel.length; i++) sel[i].selected = false;
    }

    function isPsdLayer(layer) {
        if (layer instanceof TextLayer) return false;
        var src = layer.source;
        var file = (src && src.mainSource) ? src.mainSource.file : null;
        return !!(file && /\.ps[db]$/i.test(String(file.name)));
    }

    /** Z de la position d'un calque 3D (dimensions séparées ou non). */
    function positionZ(layer, time) {
        var tr = layer.property('ADBE Transform Group'), pos = tr.property('ADBE Position');
        if (pos.dimensionsSeparated) return tr.property('ADBE Position_2').valueAtTime(time, false);
        var v = pos.valueAtTime(time, false);
        return v.length > 2 ? v[2] : 0;
    }

    /** Le calque couvre toute la comp, quel que soit l'instant où AE l'a créé. */
    function spanComp(layer, comp) {
        layer.startTime = 0;
        layer.inPoint = 0;
        layer.outPoint = comp.duration;
    }

    function countText(comp) {
        var n = 0;
        for (var i = 1; i <= comp.numLayers; i++) if (comp.layer(i) instanceof TextLayer) n++;
        return n;
    }

    /** Fichier sur disque de la source d'un calque (métrage), ou null (texte, forme, solide, précompo). */
    function sourceFile(layer) {
        var src = layer.source;
        return (src && src.mainSource && src.mainSource.file) ? src.mainSource.file : null;
    }

    function fileLabel(file) {
        return file.displayName || File.decode(file.name);
    }

    /** Dossier « Frames » à côté du projet enregistré (créé au besoin), ou null si le projet ne l'est pas. */
    function projectFramesFolder() {
        var pf = app.project.file;
        if (!pf) return null;
        var f = new Folder(pf.parent.fsName + '/Frames');
        if (!f.exists) f.create();
        return f;
    }

    var lastKept = null;   // dernière frame enregistrée à côté du projet (montrée sur demande)

    /** Lance un programme depuis l'hôte : repli quand le panneau n'a pas Node. Le programme est
     *  toujours construit ici, d'après la sélection ou la dernière frame, jamais d'après le panneau. */
    function runHost(program) {
        if (typeof system === 'undefined' || typeof system.callSystem !== 'function') throw new Error('system.callSystem indisponible');
        system.callSystem(shellCommand(program, isMac()));
    }

    /** Décale de d = [dx, dy] la position des calques sans parent (et le point ciblé des caméras et
     *  lumières), keyframes comprises sans en créer, calques verrouillés compris. */
    function recenterLayers(comp, d, rep) {
        var time = comp.time, at = function () { return d; };
        for (var i = 1; i <= comp.numLayers; i++) {
            var layer = comp.layer(i);
            if (layer.parent !== null) continue;   // il suit son parent
            var locked = layer.locked;
            try {
                if (locked) layer.locked = false;
                var tr = layer.property('ADBE Transform Group'), pos = tr.property('ADBE Position');
                if (pos.dimensionsSeparated) {
                    ae.offsetProperty(tr.property('ADBE Position_0'), function () { return d[0]; }, time);
                    ae.offsetProperty(tr.property('ADBE Position_1'), function () { return d[1]; }, time);
                } else {
                    ae.offsetProperty(pos, at, time);
                }
                if (layer instanceof CameraLayer || layer instanceof LightLayer) {
                    var poi = tr.property('ADBE Anchor Point');   // point ciblé
                    if (poi) ae.offsetProperty(poi, at, time);
                }
                rep.done++;
            } catch (e) {
                rep.skipped.push(layer.name + ' : ' + e.message);
            } finally {
                if (locked) layer.locked = true;
            }
        }
    }

    /** Passe une comp au format id, contenu recentré. Renvoie la nouvelle taille, ou null si
     *  elle y était déjà (rien n'est changé). */
    function resizeComp(comp, id, rep) {
        var size = formatSize(comp.width, comp.height, id);
        if (size[0] === comp.width && size[1] === comp.height) return null;
        var d = [(size[0] - comp.width) / 2, (size[1] - comp.height) / 2];
        comp.width = size[0];
        comp.height = size[1];
        recenterLayers(comp, d, rep);
        return size;
    }

    /** Recule de `start` les marqueurs de la comp (ceux des calques suivent leur calque) ;
     *  un marqueur qui tomberait avant le début est retiré et signalé. */
    function shiftCompMarkers(comp, start, rep) {
        var m = null, items = [], i;
        try { m = comp.markerProperty; } catch (e) { m = null; }
        if (!m || !m.numKeys) return;
        for (i = 1; i <= m.numKeys; i++) items.push({ time: m.keyTime(i), value: m.keyValue(i) });
        for (i = m.numKeys; i >= 1; i--) m.removeKey(i);
        for (i = 0; i < items.length; i++) {
            var t = items[i].time - start;
            if (t < -1e-9) { rep.skipped.push('Marqueur de comp à ' + seconds(items[i].time) + ' : avant la zone de travail, retiré'); continue; }
            try { m.setValueAtTime(Math.max(0, t), items[i].value); }
            catch (e2) { rep.skipped.push('Marqueur de comp à ' + seconds(items[i].time) + ' : ' + e2.message); }
        }
    }

    function hasExpression(p) {
        try { return p.propertyType === PropertyType.PROPERTY && p.canSetExpression && p.expressionEnabled && p.expression !== ''; }
        catch (e) { return false; }
    }

    /** Propriétés feuilles d'un groupe ou d'un calque qui portent une expression active. */
    function expressionLeaves(group, out) {
        var n = 0;
        try { n = group.numProperties; } catch (e) { n = 0; }
        for (var i = 1; i <= n; i++) {
            var p = null;
            try { p = group.property(i); } catch (e2) { p = null; }
            if (!p) continue;
            if (p.propertyType === PropertyType.PROPERTY) { if (hasExpression(p)) out.push(p); }
            else expressionLeaves(p, out);
        }
        return out;
    }

    /** Expressions à convertir : propriétés sélectionnées qui en portent une, sinon toutes celles
     *  des calques sélectionnés. */
    function expressionTargets(comp) {
        var sel = ae.selectedProperties(comp), out = [], i;
        for (i = 0; i < sel.length; i++) if (hasExpression(sel[i])) out.push(sel[i]);
        if (out.length) return out;
        var layers = comp.selectedLayers;
        for (i = 0; i < layers.length; i++) expressionLeaves(layers[i], out);
        return out;
    }

    /** Remplace l'expression de p par une keyframe à chaque image de son calque (dans la comp),
     *  puis désactive l'expression (son texte reste). Renvoie le nombre de keyframes posées. */
    function bakeProperty(comp, p) {
        var layer = ae.ownerLayer(p), fd = comp.frameDuration;
        if (layer.locked) throw new Error('calque verrouillé');
        if (!movable(p)) throw new Error('valeur particulière, non convertible');
        var err = '';
        try { err = p.expressionError; } catch (e0) { err = ''; }
        if (err) throw new Error('erreur dans l\'expression (' + err + ')');
        var t0 = Math.max(0, layer.inPoint), t1 = Math.min(comp.duration, layer.outPoint);
        var times = [], values = [], k;
        for (k = Math.ceil(t0 / fd - 1e-6); k * fd < t1 - 1e-6; k++) {
            times.push(k * fd);
            values.push(p.valueAtTime(k * fd, false));
        }
        if (!times.length) throw new Error('calque hors de la composition');
        var keep = (p.isSpatial || p.propertyValueType === PropertyValueType.TEXT_DOCUMENT) ? { times: times, values: values } : thinSamples(times, values);
        for (k = p.numKeys; k >= 1; k--) p.removeKey(k);
        p.expressionEnabled = false;
        p.setValuesAtTimes(keep.times, keep.values);
        return keep.times.length;
    }

    // --- Keyframes : lire, retirer, reposer à un autre instant ---------------------

    /** Tout ce qu'il faut pour recréer une keyframe ailleurs. */
    function readKey(prop, k) {
        var d = { time: prop.keyTime(k), value: prop.keyValue(k),
                  inType: prop.keyInInterpolationType(k), outType: prop.keyOutInterpolationType(k) };
        try { d.inEase = prop.keyInTemporalEase(k); d.outEase = prop.keyOutTemporalEase(k); } catch (e1) { d.inEase = null; }
        try { d.tCont = prop.keyTemporalContinuous(k); d.tAuto = prop.keyTemporalAutoBezier(k); } catch (e2) { d.tCont = null; }
        if (prop.isSpatial) {
            try {
                d.inTan = prop.keyInSpatialTangent(k); d.outTan = prop.keyOutSpatialTangent(k);
                d.sCont = prop.keySpatialContinuous(k); d.sAuto = prop.keySpatialAutoBezier(k);
                d.roving = prop.keyRoving(k);
            } catch (e3) { d.inTan = null; }
        }
        try { d.label = prop.keyLabel(k); } catch (e4) { d.label = null; }
        try { d.selected = prop.keySelected(k); } catch (e5) { d.selected = true; }
        return d;
    }

    /** Recrée la keyframe d à l'instant t. Ordre imposé par AE : l'interpolation remet
     *  l'ease par défaut, donc type puis ease ; une tangente posée rend la keyframe manuelle. */
    function writeKey(prop, d, t) {
        var k = prop.addKey(t);
        prop.setValueAtKey(k, d.value);
        prop.setInterpolationTypeAtKey(k, d.inType, d.outType);
        var BEZ = KeyframeInterpolationType.BEZIER;
        if (d.inEase && !d.tAuto && (d.inType === BEZ || d.outType === BEZ)) {
            try { prop.setTemporalEaseAtKey(k, d.inEase, d.outEase); } catch (e1) { /* ease refusé : défaut d'AE */ }
        }
        if (d.tCont !== null && d.tCont !== undefined) {
            try { prop.setTemporalContinuousAtKey(k, d.tCont); prop.setTemporalAutoBezierAtKey(k, d.tAuto); } catch (e2) { /* idem */ }
        }
        if (d.inTan) {
            try {
                prop.setSpatialContinuousAtKey(k, d.sCont);
                if (d.sAuto) prop.setSpatialAutoBezierAtKey(k, true);
                else prop.setSpatialTangentsAtKey(k, d.inTan, d.outTan);
            } catch (e3) { /* idem */ }
        }   // le déplacement libre se repose après coup (moveKeys) : ici la keyframe est encore la dernière
        if (d.label) { try { prop.setLabelAtKey(k, d.label); } catch (e5) { /* AE sans couleurs de keyframe */ } }
        try { prop.setSelectedAtKey(k, d.selected); } catch (e6) { /* sans importance */ }
        return k;
    }

    function keyAt(prop, t) {
        for (var k = 1; k <= prop.numKeys; k++) if (Math.abs(prop.keyTime(k) - t) < 1e-4) return k;
        return 0;
    }

    /** Valeurs qu'on ne sait pas reposer telles quelles (marqueurs, valeurs d'effets particulières). */
    function movable(prop) {
        var t = prop.propertyValueType, V = PropertyValueType;
        return t !== V.NO_VALUE && t !== V.CUSTOM_VALUE && t !== V.MARKER && t !== V.LAYER_INDEX && t !== V.MASK_INDEX;
    }

    /** Recrée les keyframes data à leur instant + dt, puis le déplacement libre (seconde passe :
     *  il est refusé sur la dernière keyframe, ce qu'est chacune au moment où on la pose). */
    function writeAll(prop, data, dt) {
        var i, k;
        for (i = 0; i < data.length; i++) writeKey(prop, data[i], data[i].time + dt);
        for (i = 0; i < data.length; i++) {
            if (!data[i].roving) continue;
            k = keyAt(prop, data[i].time + dt);
            if (k) { try { prop.setRovingAtKey(k, true); } catch (e) { /* devenue première ou dernière */ } }
        }
    }

    /** Déplace de dt les keyframes `indices` de prop. Renvoie le nombre de keyframes non
     *  sélectionnées remplacées (une keyframe arrivée sur une autre la remplace). Si une keyframe
     *  ne se repose pas, toutes reviennent à leur place d'origine et l'erreur remonte. */
    function moveKeys(prop, indices, dt) {
        if (Math.abs(dt) < 1e-9) return 0;
        if (!movable(prop)) throw new Error('keyframes non déplaçables (marqueurs ou valeur particulière)');
        var sorted = indices.slice(0).sort(function (a, b) { return a - b; });
        var data = [], i, hits = 0;
        for (i = 0; i < sorted.length; i++) data.push(readKey(prop, sorted[i]));
        for (i = 0; i < data.length; i++) if (keyAt(prop, data[i].time + dt) > 0 && !isSelectedTime(data, data[i].time + dt)) hits++;
        for (i = sorted.length - 1; i >= 0; i--) prop.removeKey(sorted[i]);
        try {
            writeAll(prop, data, dt);
        } catch (e) {
            try {
                for (i = data.length - 1; i >= 0; i--) {
                    var k = keyAt(prop, data[i].time + dt);
                    if (k) prop.removeKey(k);
                }
                writeAll(prop, data, 0);
            } catch (e2) {
                throw new Error(e.message + ' ; keyframes à retrouver par Ctrl+Z');
            }
            throw new Error('keyframes laissées en place (' + e.message + ')');
        }
        return hits;
    }

    /** Une des keyframes déplacées est-elle à l'instant t ? (elle part, ce n'est pas une collision) */
    function isSelectedTime(data, t) {
        for (var i = 0; i < data.length; i++) if (Math.abs(data[i].time - t) < 1e-4) return true;
        return false;
    }

    /** Groupes de keyframes sélectionnées : un par calque (ordre de la pile), ou un par
     *  propriété s'il n'y a qu'un calque. Chaque groupe : { name, start, parts: [{ prop, indices }] }. */
    function keyGroups(comp) {
        var keys = ae.selectedKeyframes(comp), byProp = [], i;
        for (i = 0; i < keys.length; i++) {
            // selectedKeyframes renvoie le même objet propriété pour toutes ses keyframes, à la suite
            var last = byProp.length ? byProp[byProp.length - 1] : null;
            if (last && last.prop === keys[i].prop) last.indices.push(keys[i].index);
            else byProp.push({ prop: keys[i].prop, indices: [keys[i].index], layer: ae.ownerLayer(keys[i].prop) });
        }
        var byLayer = [];
        for (i = 0; i < byProp.length; i++) {
            var g = byLayer.length ? byLayer[byLayer.length - 1] : null;
            if (g && g.layerIndex === byProp[i].layer.index) g.parts.push(byProp[i]);
            else byLayer.push({ layerIndex: byProp[i].layer.index, name: byProp[i].layer.name, parts: [byProp[i]] });
        }
        var groups = [];
        if (byLayer.length === 1) {
            for (i = 0; i < byProp.length; i++) groups.push({ name: byProp[i].prop.name, parts: [byProp[i]] });
        } else {
            byLayer.sort(function (a, b) { return a.layerIndex - b.layerIndex; });
            groups = byLayer;
        }
        for (i = 0; i < groups.length; i++) {
            var start = null;
            for (var p = 0; p < groups[i].parts.length; p++) {
                var part = groups[i].parts[p];
                for (var k = 0; k < part.indices.length; k++) {
                    var t = part.prop.keyTime(part.indices[k]);
                    if (start === null || t < start) start = t;
                }
            }
            groups[i].start = start;
        }
        return { groups: groups, byLayer: byLayer.length > 1, keys: keys.length };
    }

    // ------------------------------------------------------------------------
    //  Réponses
    // ------------------------------------------------------------------------

    var MSG_NO_COMP = 'Aucune composition active : ouvre une composition';
    var MODE_NAMES  = { cascade: 'en cascade', reverse: 'en ordre inverse', random: 'dans un ordre tiré au hasard' };

    function status(text, level) { return { text: text, level: level }; }
    function reply(comp, report, text, level) { return { report: report, status: status(text, level), comp: compInfo(comp) }; }
    function warn(comp, text, skipped) {
        return reply(comp, (skipped && skipped.length) ? { done: 0, skipped: skipped } : null, text, 'warn');
    }

    function result(comp, summary, rep) {
        var text = summary;
        if (rep.skipped.length > 0) text += ' · ' + rep.skipped.length + ' ignoré(s)';
        if (rep.done > 0) text += ' · Ctrl+Z pour annuler';
        return reply(comp, rep, text, (rep.skipped.length > 0 || rep.done === 0) ? 'warn' : 'ok');
    }

    function sequenceSummary(mode, frames, group) {
        return MODE_NAMES[mode] + ', écart ' + S.plural(frames, 'image', 'images') +
            (group > 1 ? ', par paquets de ' + group : '');
    }

    // ------------------------------------------------------------------------
    //  API publique
    // ------------------------------------------------------------------------

    var api = {
        init: function () {
            var comp = ae.getActiveComp();
            return reply(comp, null, 'Sélectionne des calques ou des keyframes dans la timeline, puis clique sur un geste', 'info');
        },

        /** État de la composition active (format, couleur de fond), sans rien changer. */
        info: function () {
            return { comp: compInfo(ae.getActiveComp()) };
        },

        /** Rend la frame de la tête de lecture dans le dossier temporaire. Le rendu peut se
         *  terminer après le retour : le panneau attend le fichier avec frameState. */
        frame: function () {
            var comp = ae.getActiveComp();
            if (!comp) return reply(null, null, MSG_NO_COMP, 'error');
            if (typeof comp.saveFrameToPng !== 'function') return reply(comp, null, 'Cette version d\'After Effects ne sait pas rendre une frame par script', 'error');
            if (writeAllowed() === false) return reply(comp, null, MSG_WRITE, 'warn');
            var file;
            try {
                var folder = frameFolder(), old = folder.getFiles('frame-*.png');
                for (var i = 0; i < old.length; i++) { try { old[i].remove(); } catch (e0) { /* encore ouvert */ } }
                file = new File(folder.fsName + '/frame-' + (new Date()).getTime() + '.png');
                comp.saveFrameToPng(comp.time, file);
            } catch (e) {
                return reply(comp, null, 'Rendu impossible : ' + e.message + (writeAllowed() === true ? '' : ' · ' + MSG_WRITE), 'error');
            }
            var r = reply(comp, null, 'Rendu de la frame…', 'info');
            r.frame = { path: file.fsName };
            return r;
        },

        /** Le PNG rendu est-il écrit ? { ready, bytes, width, height, copy: { file, args } }. */
        frameState: function (args) {
            var file = frameFile(args && args.path);
            if (!file) return { ready: false, error: 'fichier inconnu' };
            if (!file.exists) return { ready: false };
            var size = readPngSize(file);
            if (!size) return { ready: false, bytes: file.length };
            return { ready: true, bytes: file.length, width: size.width, height: size.height,
                     copy: clipboardProgram(isMac(), file.fsName) };
        },

        /** Copie le PNG dans le presse-papier par system.callSystem (si Node n'est pas dans le panneau). */
        copyImage: function (args) {
            var comp = ae.getActiveComp();
            var file = frameFile(args && args.path);
            if (!file || !file.exists) return reply(comp, null, 'Frame introuvable : relance « Copier la frame »', 'error');
            if (typeof system === 'undefined' || typeof system.callSystem !== 'function') {
                return reply(comp, null, 'Copie impossible : ni Node dans le panneau ni system.callSystem', 'error');
            }
            try {
                system.callSystem(shellCommand(clipboardProgram(isMac(), file.fsName), isMac()));
            } catch (e) {
                return reply(comp, null, 'Copie impossible : ' + e.message, 'error');
            }
            return reply(comp, null, 'Frame copiée dans le presse-papier', 'ok');
        },

        /** Séquence calques ou keyframes. args : { target: 'layers' | 'keys',
         *  mode: 'cascade' | 'reverse' | 'random', gap (images), group (paquets) }. */
        sequence: function (args) {
            var comp = ae.getActiveComp();
            if (!comp) return reply(null, null, MSG_NO_COMP, 'error');
            var a = args || {};
            var mode = MODE_NAMES.hasOwnProperty(a.mode) ? a.mode : 'cascade';
            var frames = Math.round(clampNumber(a.gap, 0, 10000, 2) * 10) / 10;
            var group = Math.round(clampNumber(a.group, 1, 1000, 1));
            var gap = frames * comp.frameDuration;
            var rep = { done: 0, skipped: [] }, i;

            if (a.target === 'keys') {
                var kg = keyGroups(comp), groups = kg.groups;
                if (kg.keys === 0) return warn(comp, 'Aucune keyframe sélectionnée : sélectionne des keyframes dans la timeline');
                if (groups.length < 2) return warn(comp, 'Sélectionne des keyframes sur au moins 2 calques (ou 2 propriétés d\'un même calque)');
                var starts = [];
                for (i = 0; i < groups.length; i++) starts.push(groups[i].start);
                var targets = sequenceTargets(starts, slots(groups.length, mode, group), gap), hits = 0;
                ae.undo(TOOL_NAME + ' : séquencer les keyframes', function () {
                    for (var g = 0; g < groups.length; g++) {
                        try {
                            var p;
                            for (p = 0; p < groups[g].parts.length; p++) {   // tout ou rien pour le groupe
                                if (!movable(groups[g].parts[p].prop)) throw new Error(groups[g].parts[p].prop.name + ' : keyframes non déplaçables (marqueurs ou valeur particulière)');
                            }
                            for (p = 0; p < groups[g].parts.length; p++) {
                                hits += moveKeys(groups[g].parts[p].prop, groups[g].parts[p].indices, targets[g] - groups[g].start);
                            }
                            rep.done++;
                        } catch (e) {
                            rep.skipped.push(groups[g].name + ' : ' + e.message);
                        }
                    }
                });
                var r = result(comp, S.plural(kg.keys, 'keyframe séquencée', 'keyframes séquencées') + ' sur ' +
                    S.plural(rep.done, kg.byLayer ? 'calque' : 'propriété', kg.byLayer ? 'calques' : 'propriétés') + ' ' +
                    sequenceSummary(mode, frames, group), rep);
                if (hits > 0) {
                    r.status.text += ' · ' + S.plural(hits, 'keyframe remplacée', 'keyframes remplacées');
                    r.status.level = 'warn';
                }
                return r;
            }

            var layers = comp.selectedLayers;
            if (layers.length < 2) return warn(comp, 'Sélectionne au moins 2 calques à séquencer');
            var ins = [];
            for (i = 0; i < layers.length; i++) ins.push(layers[i].inPoint);
            var goals = sequenceTargets(ins, slots(layers.length, mode, group), gap);
            ae.undo(TOOL_NAME + ' : séquencer les calques', function () {
                for (var k = 0; k < layers.length; k++) {
                    try {
                        if (layers[k].locked) throw new Error('calque verrouillé');
                        var dt = goals[k] - ins[k];
                        if (Math.abs(dt) > 1e-9) layers[k].startTime = layers[k].startTime + dt;
                        rep.done++;
                    } catch (e) {
                        rep.skipped.push(layers[k].name + ' : ' + e.message);
                    }
                }
            });
            return result(comp, S.plural(rep.done, 'calque séquencé', 'calques séquencés') + ' ' + sequenceSummary(mode, frames, group), rep);
        },

        /** Null au centre des calques sélectionnés (au centre de la comp sans sélection),
         *  au-dessus du plus haut d'entre eux, sur leur durée, et relié à eux. Un calque dont le
         *  parent est aussi sélectionné garde son parent ; si tous les autres ont le même parent,
         *  le null le prend, la hiérarchie est conservée. */
        nullFor: function () {
            var comp = ae.getActiveComp();
            if (!comp) return reply(null, null, MSG_NO_COMP, 'error');
            var layers = comp.selectedLayers, time = comp.time, i;
            var boxes = [], ids = {}, all3D = layers.length > 0, z = 0;
            for (i = 0; i < layers.length; i++) {
                try { boxes.push(ae.layerBox(layers[i], time)); } catch (e0) { /* caméra, lumière, boîte vide */ }
                ids[ae.layerId(layers[i])] = true;
                if (!layers[i].threeDLayer) all3D = false;
            }
            var center = [comp.width / 2, comp.height / 2];
            if (boxes.length) {
                var u = G.union(boxes);
                center = [(u.left + u.right) / 2, (u.top + u.bottom) / 2];
            }
            var roots = [], parentId, same = true, top = null, minIn = null, maxOut = null;
            for (i = 0; i < layers.length; i++) {
                var L = layers[i], p = L.parent;
                if (all3D) z += positionZ(L, time) / layers.length;
                if (top === null || L.index < top) top = L.index;
                if (minIn === null || L.inPoint < minIn) minIn = L.inPoint;
                if (maxOut === null || L.outPoint > maxOut) maxOut = L.outPoint;
                if (p !== null && ids[ae.layerId(p)]) continue;
                var pid = (p === null) ? null : ae.layerId(p);
                if (roots.length === 0) parentId = pid;
                else if (pid !== parentId) same = false;
                roots.push(L);
            }
            var name = (layers.length === 1) ? 'Contrôle ' + layers[0].name : 'Contrôle';
            var rep = { done: 0, skipped: [] };
            ae.undo(TOOL_NAME + ' : ajouter un null', function () {
                var nul = comp.layers.addNull(comp.duration);
                spanComp(nul, comp);
                nul.name = name;
                if (all3D) nul.threeDLayer = true;
                nul.property('ADBE Transform Group').property('ADBE Position').setValue(all3D ? [center[0], center[1], z] : center);
                if (layers.length) {
                    nul.inPoint = minIn;
                    nul.outPoint = maxOut;
                    nul.moveBefore(comp.layer(top + 1));   // + 1 : le null vient d'être ajouté tout en haut
                    if (same && parentId !== null && parentId !== undefined) {
                        var common = ae.findLayerById(comp, parentId);
                        if (common) nul.parent = common;
                    }
                    for (var r = 0; r < roots.length; r++) {
                        try {
                            if (roots[r].locked) throw new Error('calque verrouillé');
                            roots[r].parent = nul;
                            rep.done++;
                        } catch (e) {
                            rep.skipped.push(roots[r].name + ' : ' + e.message);
                        }
                    }
                }
                deselectLayers(comp);
                nul.selected = true;
            });
            if (!layers.length) return reply(comp, null, 'Null « ' + name + ' » ajouté au centre de la composition (aucun calque sélectionné) · Ctrl+Z pour annuler', 'ok');
            var res = result(comp, 'Null « ' + name + ' » relié à ' + S.plural(rep.done, 'calque', 'calques'), rep);
            if (!same && rep.done > 0) res.status.text += ' · leurs anciens parents (différents) sont remplacés';
            return res;
        },

        /** Calque de forme « Fond » tout en bas : rectangle et position suivent la taille de la
         *  comp par expression. args : { color: '#RRGGBB' } (sinon couleur de fond de la comp). */
        background: function (args) {
            var comp = ae.getActiveComp();
            if (!comp) return reply(null, null, MSG_NO_COMP, 'error');
            var rgb = hexToRgb(args && args.color) || comp.bgColor || [0, 0, 0];
            ae.undo(TOOL_NAME + ' : ajouter un fond', function () {
                var layer = comp.layers.addShape();
                spanComp(layer, comp);
                layer.name = 'Fond';
                var group = layer.property('ADBE Root Vectors Group').addProperty('ADBE Vector Group');
                group.name = 'Fond';
                var rect = group.property('ADBE Vectors Group').addProperty('ADBE Vector Shape - Rect');
                rect.property('ADBE Vector Rect Size').expression = '[thisComp.width, thisComp.height]';
                // Ajouter une propriété invalide les références voisines : on repart du calque.
                var vectors = layer.property('ADBE Root Vectors Group').property(1).property('ADBE Vectors Group');
                var fill = vectors.addProperty('ADBE Vector Graphic - Fill');
                fill.property('ADBE Vector Fill Color').setValue([rgb[0], rgb[1], rgb[2], 1]);
                var tr = layer.property('ADBE Transform Group');
                tr.property('ADBE Anchor Point').setValue([0, 0]);
                tr.property('ADBE Position').expression = '[thisComp.width / 2, thisComp.height / 2]';
                layer.moveToEnd();
                deselectLayers(comp);
                layer.selected = true;
            });
            return reply(comp, { done: 1, skipped: [] }, 'Fond ' + rgbToHex(rgb) + ' ajouté en bas de la composition, à sa taille même si elle change · Ctrl+Z pour annuler', 'ok');
        },

        /** Sélecteur de couleur du système. args : { color: '#RRGGBB' } de départ.
         *  Renvoie { color: '#RRGGBB' } ou { color: null } si annulé. */
        pickColor: function (args) {
            var start = hexToRgb(args && args.color);
            var comp = ae.getActiveComp();
            var hex = rgbToHex(start || (comp && comp.bgColor) || [0, 0, 0]);
            var picked = $.colorPicker(parseInt(hex.substr(1), 16));
            if (typeof picked !== 'number' || picked < 0) return { color: null };
            return { color: '#' + ('00000' + picked.toString(16)).slice(-6).toUpperCase() };
        },

        /** Passe la comp en 16:9, 4:5, 1:1 ou 9:16 (plus petit côté gardé) ; les calques sans
         *  parent sont décalés de la moitié de l'agrandissement : le contenu reste centré.
         *  Keyframes décalées sans en créer, calques verrouillés compris. args : { ratio }. */
        format: function (args) {
            var comp = ae.getActiveComp();
            if (!comp) return reply(null, null, MSG_NO_COMP, 'error');
            var id = args && args.ratio;
            var size = formatSize(comp.width, comp.height, id);
            if (!size) return warn(comp, 'Format inconnu : ' + id);
            if (size[0] === comp.width && size[1] === comp.height) {
                return reply(comp, null, 'La composition est déjà en ' + id + ' (' + comp.width + ' × ' + comp.height + ')', 'info');
            }
            var rep = { done: 0, skipped: [] };
            ae.undo(TOOL_NAME + ' : format ' + id, function () { resizeComp(comp, id, rep); });
            return result(comp, 'Composition en ' + id + ' : ' + size[0] + ' × ' + size[1] + ', ' +
                S.plural(rep.done, 'calque recentré', 'calques recentrés'), rep);
        },

        /** Décline la comp dans d'autres formats : une copie par format (« Pub 9x16 »), contenu
         *  recentré, l'original intact. args : { ratio } pour un seul format, sinon tous sauf le
         *  sien. Les copies sont sélectionnées dans le panneau Projet. */
        duplicateFormats: function (args) {
            var comp = ae.getActiveComp();
            if (!comp) return reply(null, null, MSG_NO_COMP, 'error');
            var ids = (args && args.ratio) ? [args.ratio] : otherFormats(formatOf(comp.width, comp.height)), i;
            for (i = 0; i < ids.length; i++) if (!FORMATS.hasOwnProperty(ids[i])) return warn(comp, 'Format inconnu : ' + ids[i]);
            var rep = { done: 0, skipped: [] }, made = [];
            ae.undo(TOOL_NAME + ' : décliner les formats', function () {
                var sel = app.project.selection;
                for (var s = 0; s < sel.length; s++) sel[s].selected = false;
                for (var k = 0; k < ids.length; k++) {
                    try {
                        var dup = comp.duplicate();
                        dup.name = variantName(comp.name, ids[k]);
                        var sub = { done: 0, skipped: [] };
                        resizeComp(dup, ids[k], sub);
                        for (var m = 0; m < sub.skipped.length; m++) rep.skipped.push(dup.name + ' › ' + sub.skipped[m]);
                        dup.selected = true;
                        made.push(dup.name);
                        rep.done++;
                    } catch (e) {
                        rep.skipped.push(ids[k] + ' : ' + e.message);
                    }
                }
            });
            return result(comp, made.length
                ? S.plural(made.length, 'composition créée', 'compositions créées') + ' : ' + made.join(', ')
                : 'Aucune composition créée', rep);
        },

        /** Zone de travail. args.mode : 'selection' = du premier point d'entrée au dernier point de
         *  sortie des calques sélectionnés ; 'trim' = rogner la comp à la zone de travail (comme
         *  Composition › Rogner la composition : calques et marqueurs de comp reculent d'autant,
         *  le timecode de départ avance d'autant, rien ne bouge par rapport au timecode). */
        workArea: function (args) {
            var comp = ae.getActiveComp();
            if (!comp) return reply(null, null, MSG_NO_COMP, 'error');
            var fd = comp.frameDuration, origin = comp.displayStartTime || 0, i;
            if (args && args.mode === 'trim') {
                var start = comp.workAreaStart, dur = comp.workAreaDuration;
                if (start < 1e-9 && Math.abs(dur - comp.duration) < 1e-9) {
                    return reply(comp, null, 'La zone de travail couvre déjà toute la composition', 'info');
                }
                var rep = { done: 0, skipped: [] };
                ae.undo(TOOL_NAME + ' : rogner à la zone de travail', function () {
                    if (start > 0) {
                        for (var j = 1; j <= comp.numLayers; j++) {
                            var layer = comp.layer(j), locked = layer.locked;
                            try {
                                if (locked) layer.locked = false;
                                layer.startTime = layer.startTime - start;
                                rep.done++;
                            } catch (e) {
                                rep.skipped.push(layer.name + ' : ' + e.message);
                            } finally {
                                if (locked) layer.locked = true;
                            }
                        }
                        shiftCompMarkers(comp, start, rep);
                        comp.displayStartTime = origin + start;
                    }
                    comp.workAreaStart = 0;           // d'abord la zone, puis la durée qui la contient
                    comp.workAreaDuration = dur;
                    comp.duration = dur;
                });
                return reply(comp, rep, 'Composition rognée à la zone de travail : ' + seconds(dur) +
                    (start > 0 ? ', elle commence à ' + seconds(origin + start) : '') +
                    (rep.skipped.length ? ' · ' + rep.skipped.length + ' ignoré(s)' : '') + ' · Ctrl+Z pour annuler',
                    rep.skipped.length ? 'warn' : 'ok');
            }
            var layers = comp.selectedLayers, a = null, b = null;
            if (!layers.length) return warn(comp, 'Aucun calque sélectionné : sélectionne des calques dans la timeline');
            for (i = 0; i < layers.length; i++) {
                if (a === null || layers[i].inPoint < a) a = layers[i].inPoint;
                if (b === null || layers[i].outPoint > b) b = layers[i].outPoint;
            }
            var w = workAreaFor(a, b, comp.duration, fd);
            if (!w) return warn(comp, 'Les calques sélectionnés sont hors de la composition');
            ae.undo(TOOL_NAME + ' : zone de travail', function () {
                comp.workAreaDuration = fd;           // toujours valide, quel que soit le nouveau début
                comp.workAreaStart = w.start;
                comp.workAreaDuration = w.duration;
            });
            return reply(comp, { done: layers.length, skipped: [] }, 'Zone de travail de ' + seconds(origin + w.start) + ' à ' +
                seconds(origin + w.start + w.duration) + ' (' + S.plural(layers.length, 'calque', 'calques') + ') · Ctrl+Z pour annuler', 'ok');
        },

        /** Convertit en keyframes les expressions actives (propriétés sélectionnées, sinon celles des
         *  calques sélectionnés) : une keyframe par image du calque, expression désactivée ensuite. */
        bakeExpressions: function () {
            var comp = ae.getActiveComp();
            if (!comp) return reply(null, null, MSG_NO_COMP, 'error');
            var props = expressionTargets(comp);
            if (!props.length) return warn(comp, 'Aucune expression active : sélectionne des propriétés à expression, ou leurs calques');
            var rep = { done: 0, skipped: [] }, keys = 0;
            ae.undo(TOOL_NAME + ' : expressions en keyframes', function () {
                for (var i = 0; i < props.length; i++) {
                    try {
                        keys += bakeProperty(comp, props[i]);
                        rep.done++;
                    } catch (e) {
                        rep.skipped.push(ae.ownerLayer(props[i]).name + ' › ' + props[i].name + ' : ' + e.message);
                    }
                }
            });
            return result(comp, S.plural(rep.done, 'expression convertie', 'expressions converties') + ' en ' +
                S.plural(keys, 'keyframe', 'keyframes'), rep);
        },

        /** Sélectionne dans le panneau Projet la source des calques sélectionnés
         *  (et la montre, par la commande d'AE quand son nom est reconnu). */
        revealSource: function () {
            var comp = ae.getActiveComp();
            if (!comp) return reply(null, null, MSG_NO_COMP, 'error');
            var layers = comp.selectedLayers, items = [], skipped = [], i, j;
            if (!layers.length) return warn(comp, 'Aucun calque sélectionné : sélectionne des calques dans la timeline');
            for (i = 0; i < layers.length; i++) {
                var src = layers[i].source;
                if (!src) { skipped.push(layers[i].name + ' : pas de source (texte, forme, caméra, lumière)'); continue; }
                var seen = false;
                for (j = 0; j < items.length; j++) if (items[j].id === src.id) seen = true;
                if (!seen) items.push(src);
            }
            if (!items.length) return warn(comp, 'Aucune source à afficher', skipped);
            var sel = app.project.selection;
            for (i = 0; i < sel.length; i++) sel[i].selected = false;
            for (i = 0; i < items.length; i++) items[i].selected = true;
            var id = commandId(REVEAL_NAMES, 0);
            if (id) { try { app.executeCommand(id); } catch (e) { /* la sélection suffit */ } }
            var rep = { done: items.length, skipped: skipped };
            var text = (items.length === 1 ? 'Source « ' + items[0].name + ' » sélectionnée' : S.plural(items.length, 'source sélectionnée', 'sources sélectionnées')) +
                ' dans le panneau Projet';
            if (skipped.length) text += ' · ' + skipped.length + ' ignoré(s)';
            return reply(comp, rep, text, skipped.length ? 'warn' : 'ok');
        },

        /** Montre le fichier source du premier calque sélectionné qui en a un, dans l'Explorateur ou
         *  le Finder (son dossier s'il manque sur le disque). Renvoie le programme à lancer par le
         *  panneau ; args.run : l'hôte le lance lui-même (panneau sans Node). */
        revealFile: function (args) {
            var comp = ae.getActiveComp();
            if (!comp) return reply(null, null, MSG_NO_COMP, 'error');
            var layers = comp.selectedLayers, files = [], i;
            if (!layers.length) return warn(comp, 'Aucun calque sélectionné : sélectionne des calques dans la timeline');
            for (i = 0; i < layers.length; i++) {
                var f = sourceFile(layers[i]);
                if (f) files.push(f);
            }
            if (!files.length) return warn(comp, 'Aucun fichier sur le disque : texte, forme, solide ou précomposition');
            var file = files[0], mac = isMac(), where = mac ? 'le Finder' : 'l\'Explorateur', program, text, level = 'ok';
            if (file.exists) {
                program = revealProgram(mac, file.fsName);
                text = '« ' + fileLabel(file) + ' » montré dans ' + where;
            } else {
                var folder = file.parent;
                if (!folder || !folder.exists) return warn(comp, 'Fichier introuvable sur le disque : ' + file.fsName);
                program = openFolderProgram(mac, folder.fsName);
                text = '« ' + fileLabel(file) + ' » est manquant : son dossier est ouvert dans ' + where;
                level = 'warn';
            }
            if (files.length > 1) text += ' (le 1er de ' + files.length + ' fichiers)';
            if (args && args.run) {
                try { runHost(program); } catch (e) { return reply(comp, null, 'Impossible de montrer le fichier : ' + e.message, 'error'); }
            }
            var r = reply(comp, null, text, level);
            if (!(args && args.run)) r.program = program;
            return r;
        },

        /** Enregistre la frame rendue (frame puis frameState) à côté du projet, dans « Frames » :
         *  « <comp>_<image>.png » (remplacé s'il existe). args : { path } du rendu temporaire.
         *  Renvoie aussi file.reveal, le programme qui la montre dans l'Explorateur / le Finder. */
        keepFrame: function (args) {
            var comp = ae.getActiveComp();
            if (!comp) return reply(null, null, MSG_NO_COMP, 'error');
            var tmp = frameFile(args && args.path);
            if (!tmp || !tmp.exists) return reply(comp, null, 'Frame introuvable : relance « Exporter la frame »', 'error');
            var folder;
            try { folder = projectFramesFolder(); } catch (e) { return reply(comp, null, 'Dossier « Frames » impossible à créer : ' + e.message, 'error'); }
            if (!folder) return reply(comp, null, 'Enregistre d\'abord le projet : les frames se rangent à côté de lui, dans le dossier « Frames »', 'warn');
            var frame = (comp.time + (comp.displayStartTime || 0)) / comp.frameDuration;
            var target = new File(folder.fsName + '/' + frameFileName(comp.name, frame));
            if (target.exists) target.remove();
            if (!tmp.copy(target.fsName)) return reply(comp, null, 'Enregistrement impossible : ' + target.fsName, 'error');
            lastKept = target.fsName;
            var r = reply(comp, null, 'Frame enregistrée à côté du projet : Frames/' + fileLabel(target), 'ok');
            r.file = { path: target.fsName, reveal: revealProgram(isMac(), target.fsName) };
            return r;
        },

        /** Montre la dernière frame enregistrée dans l'Explorateur / le Finder (repli hôte). */
        revealKept: function () {
            var comp = ae.getActiveComp();
            if (!lastKept || !(new File(lastKept)).exists) return reply(comp, null, 'Aucune frame enregistrée à montrer', 'warn');
            try { runHost(revealProgram(isMac(), lastKept)); } catch (e) { return reply(comp, null, 'Impossible de montrer la frame : ' + e.message, 'error'); }
            return reply(comp, null, 'Frame montrée dans ' + (isMac() ? 'le Finder' : 'l\'Explorateur'), 'ok');
        },

        /** Convertit en texte modifiable les calques texte d'un Photoshop importé : ceux de la
         *  sélection, sinon toute la comp. Un calque à la fois (la commande d'AE refuse une
         *  sélection mêlée) ; converti si un calque texte est apparu. */
        convertPsdText: function () {
            var comp = ae.getActiveComp();
            if (!comp) return reply(null, null, MSG_NO_COMP, 'error');
            var sel = comp.selectedLayers, fromSel = sel.length > 0, pool = [], i;
            if (fromSel) pool = sel;
            else for (i = 1; i <= comp.numLayers; i++) pool.push(comp.layer(i));
            var todo = [], skipped = [];
            for (i = 0; i < pool.length; i++) {
                if (!isPsdLayer(pool[i])) continue;
                if (pool[i].locked) skipped.push(pool[i].name + ' : calque verrouillé');
                else todo.push({ index: pool[i].index, name: pool[i].name });
            }
            if (!todo.length) {
                return warn(comp, 'Aucun calque Photoshop ' + (fromSel ? 'dans la sélection' : 'dans la composition'), skipped);
            }
            todo.sort(function (a, b) { return b.index - a.index; });   // du bas vers le haut : les index restent justes
            var id = commandId(CONVERT_NAMES, 0);
            if (!id) return warn(comp, 'Commande « Convertir en texte modifiable » introuvable dans cette langue d\'After Effects : utilise Calque › Convertir en texte modifiable');
            var rep = { done: 0, skipped: skipped }, made = 0;
            ae.undo(TOOL_NAME + ' : textes Photoshop', function () {
                for (var t = 0; t < todo.length; t++) {
                    deselectLayers(comp);
                    comp.layer(todo[t].index).selected = true;
                    var before = countText(comp);
                    try {
                        app.executeCommand(id);
                    } catch (e) {
                        rep.skipped.push(todo[t].name + ' : ' + e.message);
                        continue;
                    }
                    if (countText(comp) > before) { rep.done++; made++; }
                    else rep.skipped.push(todo[t].name + ' : pas un calque texte Photoshop');
                }
                deselectLayers(comp);
            });
            return result(comp, S.plural(made, 'texte Photoshop converti', 'textes Photoshop convertis') + ' en texte modifiable', rep);
        }
    };

    api._core = {
        FORMATS:          FORMATS,
        formatSize:       formatSize,
        formatOf:         formatOf,
        slots:            slots,
        sequenceTargets:  sequenceTargets,
        hexToRgb:         hexToRgb,
        rgbToHex:         rgbToHex,
        pngSize:          pngSize,
        clipboardProgram: clipboardProgram,
        shellCommand:     shellCommand,
        revealProgram:    revealProgram,
        safeName:         safeName,
        frameFileName:    frameFileName,
        variantName:      variantName,
        otherFormats:     otherFormats,
        workAreaFor:      workAreaFor,
        thinSamples:      thinSamples,
        seconds:          seconds,
        readKey:          readKey,
        writeKey:         writeKey,
        moveKeys:         moveKeys,
        commandId:        commandId,
        writeAllowed:     writeAllowed
    };

    S.registerTool('toolbox', api);
})();
