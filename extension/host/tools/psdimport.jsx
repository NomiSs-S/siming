/*
 * ============================================================================
 *  Import PSD  -  outil hôte SIMING (ExtendScript, ES3)
 * ============================================================================
 *
 *  Importe des fichiers Photoshop en compositions After Effects. Cette partie : le dossier
 *  des PSD, la liste de ses fichiers et, en interne (_core.replaceWithShape, appelé par l'import
 *  dans son groupe d'annulation), le remplacement d'un calque PSD par un calque de forme : les styles de
 *  calque que After a importés avec le PSD sont recopiés tels quels (copier-coller, _core.copyLayerStyles) ;
 *  un dégradé linéaire à deux couleurs est posé par l'effet Dégradé (les couleurs d'un dégradé de forme
 *  sont inaccessibles par script).
 *
 *  - list({ folder? }) : PSD du dossier (sans folder : 02_RESSOURCES/02_ASSET, cherché depuis
 *    le dossier du projet en remontant d'au plus 3 dossiers parents), triés par nom naturel
 *    (2.psd avant 10.psd). « imported » : un métrage du projet a ce PSD pour fichier
 *    (After Effects nomme le métrage d'un PSD en calques « calque/fichier.psd », mais sa source
 *    reste le PSD lui-même).
 *    -> { folder: string|null, files: [{ name, path, imported }], status: { text, level } }
 *  - pickFolder({ from? }) : dialogue de choix de dossier, départ = from ou le dossier du projet.
 *    -> { folder: string|null }
 *
 *  - importBatch({ items: [{ path, shapes, error? }], rules }) : importe les PSD en compos (calques rognés),
 *    les range dans 02_ASSET du panneau Projet, remplace les calques de forme, convertit les textes et pose
 *    les libellés (un seul groupe d'annulation).
 *    -> { imported: [{ name, compId }], status: { text, level } }
 *
 *  Contraintes : ES3, API en données JSON, UTF-8 avec BOM.
 * ============================================================================
 */
(function () {

    var S = $.global.SIMING;
    var deselectLayers = S.ae.deselectLayers;   // partagés dans SIMING.ae (siming.jsx)

    var ASSET_PATH = '02_RESSOURCES/02_ASSET';
    var MAX_PARENTS = 3;
    var PICK_PROMPT = 'Choisis le dossier des PSD';

    // Édition › Copier et Édition › Coller : identifiants numériques d'After (relevés par script dans After 26.2),
    // indépendants de la langue. Les noms de menu des styles de calque ne servent pas : par leur nom, ils
    // désignent d'autres commandes (« Ombre portée » = l'effet), seuls les identifiants 9000 à 9008 sont les styles.
    var COMMAND_COPY = 19;
    var COMMAND_PASTE = 20;

    // ------------------------------------------------------------------------
    //  Fonctions pures
    // ------------------------------------------------------------------------

    /** Découpe un nom en morceaux : suites de chiffres (nombres) et reste (minuscules). */
    function naturalParts(s) {
        var parts = [];
        var re = /(\d+)|(\D+)/g;
        var m;
        while ((m = re.exec(String(s))) !== null) {
            if (m[1] !== undefined && m[1] !== '') parts.push(Number(m[1]));
            else parts.push(m[2].toLowerCase());
        }
        return parts;
    }

    /** Comparaison « naturelle » de deux noms : 2.psd avant 10.psd, sans tenir compte de la casse (le nom brut départage les égalités). */
    function naturalCompare(a, b) {
        var pa = naturalParts(a), pb = naturalParts(b);
        var n = Math.min(pa.length, pb.length);
        for (var i = 0; i < n; i++) {
            var x = pa[i], y = pb[i];
            if (typeof x === 'number' && typeof y === 'number') {
                if (x !== y) return (x < y) ? -1 : 1;
            } else if (typeof x !== typeof y) {
                return (typeof x === 'number') ? -1 : 1;   // un nombre avant un texte
            } else if (x !== y) {
                return (x < y) ? -1 : 1;
            }
        }
        if (pa.length !== pb.length) return (pa.length < pb.length) ? -1 : 1;
        // égalité naturelle (01.psd / 1.psd, Fond / fond) : le nom brut départage, tri déterministe
        if (a === b) return 0;
        return (String(a) < String(b)) ? -1 : 1;
    }

    function isPsdName(name) {
        return /\.psd$/i.test(name) && !/^\._/.test(name);   // « ._ » : fichiers parasites de macOS
    }

    function status(text, level) { return { text: text, level: level }; }

    // ------------------------------------------------------------------------
    //  Lecture du projet et du disque
    // ------------------------------------------------------------------------

    /** Dossier du projet enregistré, ou null. */
    function projectFolder() {
        var f = app.project.file;
        if (!f) return null;
        var p = f.parent;
        return (p && p.exists) ? p : null;
    }

    /** Dossier 02_RESSOURCES/02_ASSET en partant du dossier du projet puis en remontant
     *  d'au plus MAX_PARENTS dossiers parents ; null s'il n'existe pas. */
    function findAssetFolder(start) {
        var dir = start;
        for (var i = 0; i <= MAX_PARENTS && dir; i++) {
            var candidate = new Folder(dir.fsName + '/' + ASSET_PATH);
            if (candidate.exists) return candidate;
            var up = dir.parent;
            if (!up || up.fsName === dir.fsName) return null;
            dir = up;
        }
        return null;
    }

    /** Fichiers (fsName en minuscules -> true) des métrages du projet. */
    function importedPaths() {
        var set = {};
        for (var i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if (!(it instanceof FootageItem)) continue;
            var f = null;
            try { f = (it.mainSource && it.mainSource.file) ? it.mainSource.file : null; } catch (e) { f = null; }
            if (f) set[String(f.fsName).toLowerCase()] = true;
        }
        return set;
    }

    /** PSD du dossier, triés par nom naturel : [{ name, path, imported }]. */
    function listPsds(folder) {
        var entries = folder.getFiles();
        var done = importedPaths();
        var files = [];
        for (var i = 0; i < entries.length; i++) {
            if (!(entries[i] instanceof File)) continue;
            if (!isPsdName(entries[i].name)) continue;
            var p = entries[i].fsName;
            files.push({ name: entries[i].name, path: p, imported: done[String(p).toLowerCase()] === true });
        }
        files.sort(function (a, b) { return naturalCompare(a.name, b.name); });
        return files;
    }

    // ------------------------------------------------------------------------
    //  Calque de forme d'après le JSON (SIMING.psd.shapes)
    // ------------------------------------------------------------------------

    var SCALE_TOLERANCE = 0.01;        // % : un calque PSD est à 100 % (tolérance de lecture)
    var SIZE_TOLERANCE = 1;            // px : métrage du calque PSD et boîte du JSON (anticrénelage)
    var ROTATION_TOLERANCE = 0.01;     // degrés

    // Mode de fusion PSD -> nom dans l'énumération BlendingMode d'After Effects.
    var BLEND_NAMES = {
        normal: 'NORMAL', dissolve: 'DISSOLVE', darken: 'DARKEN', multiply: 'MULTIPLY', colorBurn: 'COLOR_BURN',
        linearBurn: 'LINEAR_BURN', darkerColor: 'DARKER_COLOR', lighten: 'LIGHTEN', screen: 'SCREEN',
        colorDodge: 'COLOR_DODGE', linearDodge: 'LINEAR_DODGE', lighterColor: 'LIGHTER_COLOR', overlay: 'OVERLAY',
        softLight: 'SOFT_LIGHT', hardLight: 'HARD_LIGHT', vividLight: 'VIVID_LIGHT', linearLight: 'LINEAR_LIGHT',
        pinLight: 'PIN_LIGHT', hardMix: 'HARD_MIX', difference: 'DIFFERENCE', exclusion: 'EXCLUSION',
        subtract: 'SUBTRACT', divide: 'DIVIDE', hue: 'HUE', saturation: 'SATURATION', color: 'COLOR',
        luminosity: 'LUMINOSITY'
    };

    /** Mode de fusion After Effects d'un mode PSD, ou null (mode inconnu, ou absent de cette version d'After). */
    function blendModeOf(key) {
        if (typeof BlendingMode === 'undefined' || !BLEND_NAMES.hasOwnProperty(key)) return null;
        var mode = BlendingMode[BLEND_NAMES[key]];
        return (mode === undefined) ? null : mode;
    }

    function isNumberArray(a, n) {
        if (!a || typeof a.length !== 'number' || a.length < n) return false;
        for (var i = 0; i < n; i++) if (typeof a[i] !== 'number') return false;
        return true;
    }

    function pathIsValid(p) {
        if (!p) return false;
        if (p.type === 'rect' || p.type === 'ellipse') return isNumberArray(p.center, 2) && isNumberArray(p.size, 2);
        if (p.type === 'path') return !!p.vertices && !!p.inTangents && !!p.outTangents;
        return false;
    }

    function isFiniteNumber(n) { return typeof n === 'number' && isFinite(n); }

    function rampIsValid(fill) {
        return isNumberArray(fill.start, 2) && isNumberArray(fill.end, 2) &&
            isNumberArray(fill.startColor, 3) && isNumberArray(fill.endColor, 3);
    }

    /** Le JSON est-il complet et reproductible tel quel ? (sinon le calque PSD reste : un refus, pas une panne) */
    function shapeIsBuildable(shape) {
        if (!shape || !shape.box || !shape.paths || shape.paths.length === 0) return false;
        var box = shape.box;
        if (!isFiniteNumber(box.left) || !isFiniteNumber(box.top) || !isFiniteNumber(box.right) || !isFiniteNumber(box.bottom)) return false;
        var rotated = false;
        for (var i = 0; i < shape.paths.length; i++) {
            if (!pathIsValid(shape.paths[i])) return false;
            if (shape.paths[i].type !== 'path' && shape.paths[i].rotation) rotated = true;
        }
        // Plusieurs sous-tracés partagent un seul groupe (une union, remplie une fois). Un contour y
        // serait dessiné sur chaque tracé, et la rotation d'un groupe tournerait les autres : on refuse.
        if (shape.paths.length > 1 && (rotated || shape.stroke)) return false;
        if (blendModeOf(shape.blend === undefined ? 'normal' : shape.blend) === null) return false;
        // Le contour d'une forme After est toujours centré sur le tracé.
        if (shape.stroke && shape.stroke.align !== 'center') return false;
        // Remplissage : uni, ou dégradé linéaire à deux couleurs (effet Dégradé). Les couleurs d'un dégradé de forme sont
        // inaccessibles par script ; tout autre dégradé reste un calque PSD. L'effet colore aussi un contour : refusé.
        if (shape.fill) {
            if (shape.fill.type === 'ramp') {
                if (shape.stroke || !rampIsValid(shape.fill)) return false;
            } else if (shape.fill.type !== 'solid') {
                return false;
            }
        }
        return true;
    }

    // Ajouter une propriété invalide les références voisines : chaque accès repart du calque, et
    // l'élément qu'on vient d'ajouter se règle aussitôt (avant tout autre ajout).
    function groupAt(layer, n) { return layer.property('ADBE Root Vectors Group').property(n); }
    function itemsOf(layer, n) { return groupAt(layer, n).property('ADBE Vectors Group'); }

    /** Ajoute un élément au groupe n et renvoie sa poignée. */
    function addItem(layer, n, matchName) {
        return itemsOf(layer, n).addProperty(matchName);
    }

    /** Tracé d'un sous-tracé dans le groupe n. Un rectangle ou une ellipse tourné (seul dans le
     *  groupe) tourne sur le groupe, autour de son propre centre (ancre et position du groupe = centre). */
    function addPath(layer, n, p) {
        var item;
        if (p.type === 'rect') {
            item = addItem(layer, n, 'ADBE Vector Shape - Rect');
            item.property('ADBE Vector Rect Size').setValue(p.size);
            item.property('ADBE Vector Rect Position').setValue(p.center);
            item.property('ADBE Vector Rect Roundness').setValue(p.roundness || 0);
        } else if (p.type === 'ellipse') {
            item = addItem(layer, n, 'ADBE Vector Shape - Ellipse');
            item.property('ADBE Vector Ellipse Size').setValue(p.size);
            item.property('ADBE Vector Ellipse Position').setValue(p.center);
        } else {
            item = addItem(layer, n, 'ADBE Vector Shape - Group');
            var path = new Shape();
            path.vertices = p.vertices;
            path.inTangents = p.inTangents;
            path.outTangents = p.outTangents;
            path.closed = (p.closed !== false);
            item.property('ADBE Vector Shape').setValue(path);
        }
        if (p.type !== 'path' && p.rotation) {
            var tr = groupAt(layer, n).property('ADBE Vector Transform Group');
            tr.property('ADBE Vector Anchor').setValue(p.center);
            tr.property('ADBE Vector Position').setValue(p.center);
            tr.property('ADBE Vector Rotation').setValue(p.rotation);
        }
    }

    var PS_MITER_LIMIT = 100;   // limite des angles par défaut de Photoshop (After : 4), si le JSON n'en donne pas

    function addStroke(layer, n, stroke, opacity) {
        var item = addItem(layer, n, 'ADBE Vector Graphic - Stroke');
        item.property('ADBE Vector Stroke Color').setValue([stroke.color[0], stroke.color[1], stroke.color[2], 1]);
        item.property('ADBE Vector Stroke Width').setValue(stroke.width);
        item.property('ADBE Vector Stroke Opacity').setValue(opacity);
        item.property('ADBE Vector Stroke Miter Limit').setValue(isFiniteNumber(stroke.miterLimit) ? stroke.miterLimit : PS_MITER_LIMIT);
    }

    /** Remplissage uni ; pour un dégradé (ramp), la couleur de départ : l'effet Dégradé (addRamp) la remplace. */
    function addFill(layer, n, fill, opacity) {
        var c = (fill.type === 'ramp') ? fill.startColor : fill.color;
        var item = addItem(layer, n, 'ADBE Vector Graphic - Fill');
        item.property('ADBE Vector Fill Color').setValue([c[0], c[1], c[2], 1]);
        item.property('ADBE Vector Fill Opacity').setValue(opacity);
    }

    /**
     * Effet Dégradé (ADBE Ramp) sur le calque de forme : linéaire, sans dispersion, sans part de l'original. Il
     * respecte la forme (transparent en dehors). Ses points sont en coordonnées du calque : le calque de forme a
     * l'ancre [0, 0] et des tracés en coordonnées du document, les points du JSON s'écrivent donc tels quels.
     */
    function addRamp(layer, fill) {
        var fx = layer.property('ADBE Effect Parade').addProperty('ADBE Ramp');
        fx.property('ADBE Ramp-0001').setValue([fill.start[0], fill.start[1]]);
        fx.property('ADBE Ramp-0002').setValue([fill.startColor[0], fill.startColor[1], fill.startColor[2], 1]);
        fx.property('ADBE Ramp-0003').setValue([fill.end[0], fill.end[1]]);
        fx.property('ADBE Ramp-0004').setValue([fill.endColor[0], fill.endColor[1], fill.endColor[2], 1]);
        fx.property('ADBE Ramp-0005').setValue(1);
        fx.property('ADBE Ramp-0006').setValue(0);
        fx.property('ADBE Ramp-0007').setValue(0);
    }

    // ------------------------------------------------------------------------
    //  Styles de calque : recopiés du calque PSD (After les a importés avec le PSD) par Copier / Coller
    // ------------------------------------------------------------------------

    /** La compo est-elle l'élément actif (celle du visualiseur, sur laquelle agit app.executeCommand) ? */
    function isActiveComp(comp) {
        var active = app.project.activeItem;
        return (active instanceof CompItem) && active.id === comp.id;
    }

    /** Ouvre la compo dans le visualiseur et vérifie qu'elle y est : sinon erreur, rien n'est lancé. */
    function focusComp(comp) {
        comp.openInViewer();
        if (!isActiveComp(comp)) throw new Error('Compo non active dans le visualiseur : ' + comp.name);
    }

    /** Identifiants des calques sélectionnés de la compo. */
    function selectedIds(comp) {
        var sel = comp.selectedLayers, ids = [];
        for (var i = 0; i < sel.length; i++) ids.push(S.ae.layerId(sel[i]));
        return ids;
    }

    /** Rétablit la sélection de calques relevée par selectedIds (un calque disparu est sauté). */
    function restoreSelection(comp, ids) {
        deselectLayers(comp);
        for (var i = 0; i < ids.length; i++) {
            var layer = S.ae.findLayerById(comp, ids[i]);
            if (!layer) continue;
            try { layer.selected = true; } catch (e) { /* calque verrouillé ou disparu */ }
        }
    }

    /**
     * Le groupe « ADBE Layer Styles » est-il visible ? Un calque sans style actif l'a « masqué » : lui donner
     * `selected` lève une erreur (la propriété ou une propriété parent est masquée) ; c'est le test fiable. Le
     * groupe est laissé désélectionné.
     */
    function stylesGroupVisible(group) {
        if (!group) return false;
        try { group.selected = true; } catch (e) { return false; }
        try { group.selected = false; } catch (e2) { /* déjà fait */ }
        return true;
    }

    /** Le calque a-t-il des styles de calque ? La sélection de l'utilisateur est rétablie. */
    function layerHasStyles(comp, layer) {
        var kept = selectedIds(comp), has = false;
        try {
            deselectLayers(comp);
            has = stylesGroupVisible(layer.property('ADBE Layer Styles'));
        } finally {
            restoreSelection(comp, kept);
        }
        return has;
    }

    /**
     * Copie les styles de calque de `from` sur `to` (les mêmes, réglages compris, options de fusion et opacité du
     * fond comprises) : Copier sur le groupe « ADBE Layer Styles » de `from`, Coller sur `to`. Écrase le
     * presse-papiers de l'utilisateur. Renvoie false, sans rien lancer, si `from` n'a aucun style. Lève une
     * erreur si la compo n'est pas la compo active (app.executeCommand n'agit que sur elle) ou si le collage n'a
     * rien donné (le groupe de `to` reste masqué). La sélection de l'utilisateur est rétablie à la fin.
     */
    function copyLayerStyles(comp, from, to) {
        if (!isActiveComp(comp)) throw new Error('Compo non active dans le visualiseur : ' + comp.name);
        var kept = selectedIds(comp);
        try {
            deselectLayers(comp);
            var source = from.property('ADBE Layer Styles');
            try { source.selected = true; } catch (e) { return false; }     // groupe masqué : aucun style
            app.executeCommand(COMMAND_COPY);
            source.selected = false;
            deselectLayers(comp);
            to.selected = true;
            if (!isActiveComp(comp)) throw new Error('Compo non active dans le visualiseur : ' + comp.name);
            app.executeCommand(COMMAND_PASTE);
            if (!stylesGroupVisible(to.property('ADBE Layer Styles'))) throw new Error('Styles de calque non collés : la commande Coller est restée sans effet');
            return true;
        } finally {
            restoreSelection(comp, kept);
        }
    }

    var lastFailure = null;

    function sameSize(src, w, h) {
        return Math.abs(src.width - w) <= SIZE_TOLERANCE && Math.abs(src.height - h) <= SIZE_TOLERANCE;
    }

    /**
     * Coin haut gauche, en coordonnées du document, du métrage d'un calque PSD, ou null s'il ne correspond
     * pas au JSON. After rogne un calque de pixels à sa boîte (coin = box), mais importe un calque de forme à
     * la taille du document, son tracé en masque (coin = [0, 0]) : shape.canvas donne cette taille.
     */
    function footageOrigin(src, shape) {
        if (!(src instanceof FootageItem) || !isFiniteNumber(src.width) || !isFiniteNumber(src.height)) return null;
        if (sameSize(src, shape.box.right - shape.box.left, shape.box.bottom - shape.box.top)) return [shape.box.left, shape.box.top];
        var canvas = shape.canvas;
        if (canvas && isFiniteNumber(canvas.width) && isFiniteNumber(canvas.height) && sameSize(src, canvas.width, canvas.height)) return [0, 0];
        return null;
    }

    /**
     * Remplace un calque PSD par un calque de forme décrit par le JSON (SIMING.psd.shapes).
     * Même nom, juste au-dessus de l'original, mêmes temps, parent, visibilité, opacité et mode de
     * fusion ; verrou reporté. L'opacité et la visibilité viennent du calque After (qui les a reprises
     * du PSD et que l'utilisateur a pu retoucher) : shape.opacity et shape.hidden ne servent pas ici.
     * Ancre [0, 0] et position = décalage du calque PSD dans la compo (position - ancre - coin haut
     * gauche de sa boîte) ; les tracés restent en coordonnées du document. Un seul groupe : tous les
     * sous-tracés, puis le contour (un seul sous-tracé), puis le remplissage (un dégradé : sa couleur de départ,
     * puis l'effet Dégradé sur le calque), puis les styles de calque, recopiés du calque PSD s'il en a. Avec des
     * styles, remplissage et contour sont à 100 % (l'opacité du fond voyage avec les options de fusion copiées,
     * sinon elle s'appliquerait deux fois) ; sans style, ils prennent shape.fillOpacity.
     *
     * Renvoie le calque de forme, ou null. Deux sortes de null :
     *  - un refus voulu, silencieux (calque PSD mis à l'échelle ou tourné, JSON non reproductible :
     *    dégradé autre qu'un dégradé linéaire à deux couleurs, ou avec un contour, contour non centré, mode de
     *    fusion inconnu, boîte illisible…) : lastFailure() = null ;
     *  - une panne : le métrage du calque PSD n'a ni la taille de shape.box ni celle de shape.canvas (à 1 px près : After a pu fusionner
     *    les styles dans les pixels, ou le JSON est celui d'un autre calque), ou une panne imprévue en cours de
     *    construction (le calque de forme à demi fait est retiré) ; le calque PSD reste, et
     *    lastFailure() = { name, message } (remis à zéro à chaque appel).
     *    Les styles de calque sont recopiés ici : un collage sans effet = panne.
     * N'ouvre pas de groupe d'annulation : c'est l'appelant qui le fait.
     */
    function replaceWithShape(comp, layer, shape) {
        lastFailure = null;
        if (!shapeIsBuildable(shape)) return null;
        var tr = layer.property('ADBE Transform Group');
        var scale = tr.property('ADBE Scale').value;
        if (Math.abs(scale[0] - 100) > SCALE_TOLERANCE || Math.abs(scale[1] - 100) > SCALE_TOLERANCE) return null;
        if (Math.abs(tr.property('ADBE Rotate Z').value) > ROTATION_TOLERANCE) return null;
        var src = null;
        try { src = layer.source; } catch (e0) { src = null; }
        var origin = footageOrigin(src, shape);
        if (!origin) {
            var boxW = shape.box.right - shape.box.left, boxH = shape.box.bottom - shape.box.top;
            lastFailure = { name: 'Mismatch', message: 'boîte du calque After différente de celle du PSD (' +
                (src && isFiniteNumber(src.width) ? src.width + ' × ' + src.height : 'pas un métrage') + ' pour ' + boxW + ' × ' + boxH + ')' };
            return null;
        }
        var pos = tr.property('ADBE Position').value, anchor = tr.property('ADBE Anchor Point').value;
        var dx = pos[0] - anchor[0] - origin[0], dy = pos[1] - anchor[1] - origin[1];
        var opacity = tr.property('ADBE Opacity').value;
        var blend = blendModeOf(shape.blend === undefined ? 'normal' : shape.blend);
        var fillOpacity = (typeof shape.fillOpacity === 'number') ? shape.fillOpacity : 100;

        var wasLocked = layer.locked;
        var made = comp.layers.addShape();
        try {
            if (wasLocked) layer.locked = false;     // le calque PSD se copie et se supprime déverrouillé (rétabli en cas de panne)
            made.name = layer.name;
            made.startTime = layer.startTime;
            made.inPoint = layer.inPoint;
            made.outPoint = layer.outPoint;
            var parent = layer.parent;
            if (parent) made.parent = parent;
            made.enabled = layer.enabled;
            made.blendingMode = blend;
            var madeTr = made.property('ADBE Transform Group');
            madeTr.property('ADBE Anchor Point').setValue([0, 0]);
            madeTr.property('ADBE Position').setValue([dx, dy]);
            madeTr.property('ADBE Opacity').setValue(opacity);

            made.property('ADBE Root Vectors Group').addProperty('ADBE Vector Group');
            for (var i = 0; i < shape.paths.length; i++) addPath(made, 1, shape.paths[i]);
            // Styles de calque : ceux que After a importés avec le PSD, recopiés tels quels (options de fusion comprises,
            // donc l'opacité du fond) ; remplissage et contour restent alors à 100 %.
            var styled = layerHasStyles(comp, layer);
            var paint = styled ? 100 : fillOpacity;
            if (shape.stroke) addStroke(made, 1, shape.stroke, paint);
            if (shape.fill) {
                addFill(made, 1, shape.fill, paint);
                if (shape.fill.type === 'ramp') addRamp(made, shape.fill);
            }
            // Avant de toucher à l'original : un collage sans effet est une panne que l'utilisateur doit voir.
            if (styled) copyLayerStyles(comp, layer, made);

            made.moveBefore(layer);
            layer.remove();
        } catch (e) {
            // calque de forme à demi construit : on le retire, le calque PSD reste
            lastFailure = { name: String(e && e.name), message: String(e && e.message) };
            try { made.locked = false; made.remove(); } catch (e2) { /* déjà retiré */ }
            try { layer.locked = wasLocked; } catch (e3) { /* calque PSD disparu */ }
            return null;
        }
        if (wasLocked) made.locked = true;
        return made;
    }

    // ------------------------------------------------------------------------
    //  Import du lot
    // ------------------------------------------------------------------------

    var UNDO_NAME = 'Boîte à outils : importer les PSD';
    var PROJECT_ASSET = '02_ASSET';

    function isRootItem(item) {
        var p = item.parentFolder;
        return !p || p.id === app.project.rootFolder.id;
    }

    /** Dossier 02_ASSET du panneau Projet : celui de la racine, sinon le premier trouvé ailleurs, sinon créé à la racine. */
    function projectAssetFolder() {
        var any = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if (!(it instanceof FolderItem) || it.name !== PROJECT_ASSET) continue;
            if (isRootItem(it)) return it;
            if (!any) any = it;
        }
        return any || app.project.items.addFolder(PROJECT_ASSET);
    }

    /** Identifiants des éléments du projet (id -> true). */
    function projectItemIds() {
        var ids = {};
        for (var i = 1; i <= app.project.numItems; i++) ids[app.project.item(i).id] = true;
        return ids;
    }

    function layersOf(comp) {
        var out = [];
        for (var i = 1; i <= comp.numLayers; i++) out.push(comp.layer(i));
        return out;
    }

    /** Nom d'un calque PSD d'après son métrage « <nom>/<fichier> » (After nomme ainsi le métrage d'un PSD en
     *  calques ; coupé au DERNIER « / »), ou null : pas un métrage de ce fichier. */
    function psdLayerName(layer, fileName) {
        var src = null;
        try { src = layer.source; } catch (e) { src = null; }
        if (!src || !(src instanceof FootageItem)) return null;
        var n = String(src.name), cut = n.lastIndexOf('/');
        if (cut < 0 || n.substring(cut + 1).toLowerCase() !== fileName.toLowerCase()) return null;
        return n.substring(0, cut);
    }

    /**
     * Parcours en profondeur de la compo importée, calque 1 en premier, en descendant à sa place dans chaque
     * précompo créée par cet import (created : id -> true). Renvoie les compos dans l'ordre du parcours :
     * [{ comp, matches: [{ id, name, nth }] }], un calque de métrage du PSD recevant son rang parmi ceux de
     * même nom dans tout le parcours (les précompos, ou groupes, ne comptent pas). Rangs fixés avant tout
     * remplacement : ils ne bougent plus ensuite.
     */
    function walkImport(root, created, fileName) {
        var plan = [], counts = {}, seen = {};
        function visit(comp) {
            seen[comp.id] = true;
            var entry = { comp: comp, matches: [] };
            plan.push(entry);
            for (var i = 1; i <= comp.numLayers; i++) {
                var layer = comp.layer(i), src = null;
                try { src = layer.source; } catch (e) { src = null; }
                if (src instanceof CompItem) {
                    if (created[src.id] && !seen[src.id]) visit(src);
                    continue;
                }
                var name = psdLayerName(layer, fileName);
                if (name === null) continue;
                var key = 'k' + name, nth = counts.hasOwnProperty(key) ? counts[key] : 0;
                counts[key] = nth + 1;
                entry.matches.push({ id: S.ae.layerId(layer), name: name, nth: nth });
            }
        }
        visit(root);
        return plan;
    }

    /** Retire du projet ce qui n'y était pas avant (id -> true) : compos, métrages, dossier « N Calques », et
     *  02_ASSET s'il vient d'être créé. Au mieux : un élément déjà parti avec son dossier est sauté. */
    function removeNewItems(before) {
        var fresh = [], i;
        for (i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if (!before[it.id]) fresh.push(it);
        }
        for (i = fresh.length - 1; i >= 0; i--) {
            try { fresh[i].remove(); } catch (e) { /* déjà retiré avec son dossier */ }
        }
    }

    function shapeKey(name, nth) { return 'k' + nth + ':' + name; }

    // Débordement d'un style de calque hors de la boîte du calque (px) : les propriétés sommées, par groupe (les
    // groupes de styles s'appellent « <sorte>/enabled », `enabled` vrai quand le style est actif).
    // Les styles intérieurs (ombre et lueur internes, satin, incrustation) ne débordent pas.
    var STYLE_OVERFLOW = {
        'dropShadow/enabled': ['dropShadow/distance', 'dropShadow/blur'],
        'outerGlow/enabled': ['outerGlow/blur'],
        'bevelEmboss/enabled': ['bevelEmboss/blur'],
        'frameFX/enabled': ['frameFX/size']
    };
    var MIN_COMP_SIZE = 4;      // px : plus petite compo qu'After accepte

    /** Ce que les styles de calque actifs ajoutent autour de la boîte du calque (px, 0 sans style). */
    function styleOverflow(layer) {
        var most = 0, root = null;
        try { root = layer.property('ADBE Layer Styles'); } catch (e0) { root = null; }
        if (!root) return 0;
        for (var group in STYLE_OVERFLOW) {
            if (!STYLE_OVERFLOW.hasOwnProperty(group)) continue;
            try {
                var g = root.property(group);
                if (!g || !g.enabled) continue;
                var sum = 0, names = STYLE_OVERFLOW[group];
                for (var i = 0; i < names.length; i++) {
                    var prop = g.property(names[i]);
                    if (prop && isFiniteNumber(prop.value)) sum += Math.abs(prop.value);
                }
                if (sum > most) most = sum;
            } catch (e1) { /* style absent ou illisible : rien à ajouter */ }
        }
        return most;
    }

    /** Boîte (compo) de ce que montrent les calques de la compo, styles compris ; null si rien ne se mesure. */
    function contentBox(comp) {
        var boxes = [];
        for (var i = 1; i <= comp.numLayers; i++) {
            var layer = comp.layer(i);
            try {
                var b = S.ae.layerBox(layer, 0), pad = styleOverflow(layer);
                boxes.push({ left: b.left - pad, top: b.top - pad, right: b.right + pad, bottom: b.bottom + pad });
            } catch (e) { /* calque sans boîte : ne compte pas */ }
        }
        return boxes.length ? S.geom.union(boxes) : null;
    }

    /** Décale la propriété (position ou ancre, 2D ou séparée) de [dx, dy], keyframes comprises ; déverrouille le temps de le faire. */
    function shiftLayer(layer, matchName, dx, dy) {
        var wasLocked = layer.locked;
        if (wasLocked) layer.locked = false;
        try {
            var tr = layer.property('ADBE Transform Group'), prop = tr.property(matchName);
            if (matchName === 'ADBE Position' && prop.dimensionsSeparated) {
                S.ae.offsetProperty(tr.property('ADBE Position_0'), function () { return dx; }, 0);
                S.ae.offsetProperty(tr.property('ADBE Position_1'), function () { return dy; }, 0);
            } else {
                S.ae.offsetProperty(prop, function () { return [dx, dy]; }, 0);
            }
        } finally {
            if (wasLocked) layer.locked = true;
        }
    }

    /**
     * Recadre une précompo de l'import sur ce que montrent ses calques (styles compris, sans sortir de la compo :
     * ce qui en dépassait restait caché), puis compense : les calques sans parent de la précompo reculent de
     * [left, top], et l'ancre de chaque calque qui l'affiche (holders) aussi (reposée : After la remet à l'échelle
     * quand la compo change de taille), si bien que rien ne bouge à l'écran.
     * Renvoie true si la compo a changé de taille.
     */
    function cropPrecomp(sub, holders) {
        var box = contentBox(sub);
        if (!box) return false;
        var left = Math.max(0, Math.floor(box.left)), top = Math.max(0, Math.floor(box.top));
        var right = Math.min(sub.width, Math.ceil(box.right)), bottom = Math.min(sub.height, Math.ceil(box.bottom));
        if (right - left < MIN_COMP_SIZE || bottom - top < MIN_COMP_SIZE) return false;
        if (left === 0 && top === 0 && right === sub.width && bottom === sub.height) return false;
        for (var i = 1; i <= sub.numLayers; i++) {
            var layer = sub.layer(i);
            if (!layer.parent) shiftLayer(layer, 'ADBE Position', -left, -top);
        }
        // After remet à l'échelle l'ancre des calques d'une compo qui change de taille (500 -> 200 pour 1000 -> 400) :
        // on la relève avant, on la repose après, décalée.
        var saved = [], k;
        for (k = 0; k < holders.length; k++) saved.push(anchorValues(holders[k]));
        sub.width = right - left;
        sub.height = bottom - top;
        for (k = 0; k < holders.length; k++) restoreAnchor(holders[k], saved[k], -left, -top);
        return true;
    }

    /** Valeurs de l'ancre d'un calque : { keys: [valeur…] } avec keyframes, sinon { value }. */
    function anchorValues(layer) {
        var ap = layer.property('ADBE Transform Group').property('ADBE Anchor Point');
        if (ap.numKeys === 0) return { value: ap.value };
        var keys = [];
        for (var i = 1; i <= ap.numKeys; i++) keys.push(ap.keyValue(i));
        return { keys: keys };
    }

    /** Repose l'ancre relevée par anchorValues, décalée de [dx, dy] ; déverrouille le temps de le faire. */
    function restoreAnchor(layer, saved, dx, dy) {
        var wasLocked = layer.locked;
        if (wasLocked) layer.locked = false;
        try {
            var ap = layer.property('ADBE Transform Group').property('ADBE Anchor Point');
            var moved = function (v) { var o = [v[0] + dx, v[1] + dy]; if (v.length > 2) o.push(v[2]); return o; };
            if (saved.keys) {
                for (var i = 0; i < saved.keys.length && i < ap.numKeys; i++) ap.setValueAtKey(i + 1, moved(saved.keys[i]));
            } else {
                ap.setValue(moved(saved.value));
            }
        } finally {
            if (wasLocked) layer.locked = true;
        }
    }

    /** Calques des compos du parcours qui affichent la compo `sub`. */
    function holdersOf(plan, sub) {
        var out = [];
        for (var p = 0; p < plan.length; p++) {
            var comp = plan[p].comp;
            for (var i = 1; i <= comp.numLayers; i++) {
                var src = null;
                try { src = comp.layer(i).source; } catch (e) { src = null; }
                if (src instanceof CompItem && src.id === sub.id) out.push(comp.layer(i));
            }
        }
        return out;
    }

    /**
     * Point d'ancrage de chaque calque de la compo au centre de sa boîte visible, sans rien déplacer à l'écran
     * (placeAnchor de Quick Tools, case 5). Calque verrouillé ou sans rien de visible : laissé tel quel.
     * Renvoie le nombre de calques traités.
     */
    function centerAnchors(comp, placeAnchor) {
        var done = 0;
        for (var i = 1; i <= comp.numLayers; i++) {
            var layer = comp.layer(i);
            if (layer.locked) continue;
            try {
                placeAnchor(layer, 5, 0);
                done++;
            } catch (e) { /* rien de visible (calque vide, masques hors du calque) : ancre laissée */ }
        }
        return done;
    }

    /**
     * Importe un PSD en compo (calques rognés), range la compo et son dossier « N Calques » dans 02_ASSET,
     * puis dans l'ordre : formes, textes, libellés, précompos recadrées sur leur contenu, points d'ancrage centrés. Chaque compo du parcours est ouverte dans le viewer avant
     * ce qui passe par un menu (app.executeCommand agit sur la compo du viewer), et l'on vérifie qu'elle y est
     * bien (focusComp) : sinon rien n'est lancé. Lève une erreur si le PSD n'a pas pu être importé ou traité
     * (l'appelant le compte illisible et retire ce que l'import a créé).
     * before : les éléments du projet avant l'import (projectItemIds). tally reçoit les formes, textes, pannes de
     * forme et, si la commande de conversion en texte manque, missing ; ctx.asset garde le dossier 02_ASSET.
     */
    function importOne(item, before, ctx, rules, tally) {
        var i;
        var file = new File(String(item.path));
        var options = new ImportOptions(file);
        if (!options.canImportAs(ImportAsType.COMP_CROPPED_LAYERS)) throw new Error('Import en composition impossible : ' + file.fsName);
        options.importAs = ImportAsType.COMP_CROPPED_LAYERS;
        var comp = app.project.importFile(options);
        if (!(comp instanceof CompItem)) throw new Error('Le PSD n\'a pas donné de composition : ' + file.fsName);

        // ce que l'import a créé : compos (le parcours ne descend que dans celles-là) et éléments de la racine à ranger
        var created = {}, toMove = [];
        created[comp.id] = true;
        for (i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if (before[it.id]) continue;
            if (it instanceof CompItem) created[it.id] = true;
            if (isRootItem(it)) toMove.push(it);
        }
        if (!ctx.asset) ctx.asset = projectAssetFolder();
        for (i = 0; i < toMove.length; i++) toMove[i].parentFolder = ctx.asset;

        var fileName = String(file.displayName || File.decode(file.name));
        var plan = walkImport(comp, created, fileName);

        var shapes = {}, list = (item.shapes && typeof item.shapes.length === 'number') ? item.shapes : [];
        for (i = 0; i < list.length; i++) {
            if (list[i] && list[i].match) shapes[shapeKey(list[i].match.name, list[i].match.nth)] = list[i];
        }
        var p, m;
        for (p = 0; p < plan.length; p++) {          // formes d'abord : les index des calques ne bougent pas
            var opened = false;
            for (m = 0; m < plan[p].matches.length; m++) {
                var match = plan[p].matches[m], shape = shapes[shapeKey(match.name, match.nth)];
                if (!shape) continue;
                var layer = S.ae.findLayerById(plan[p].comp, match.id);
                if (!layer) continue;
                if (!opened) { focusComp(plan[p].comp); opened = true; }
                if (replaceWithShape(plan[p].comp, layer, shape)) tally.shapes++;
                else if (lastFailure) tally.failed++;
            }
        }
        var toolbox = S.getTool('toolbox'), labels = S.getTool('labels');
        for (p = 0; p < plan.length; p++) {
            if (plan[p].matches.length === 0 || !toolbox) continue;
            focusComp(plan[p].comp);
            var converted = toolbox._core.convertTextsIn(plan[p].comp, layersOf(plan[p].comp), false);
            tally.texts += converted.done;
            if (converted.missing) tally.missing = true;
        }
        for (p = 0; p < plan.length && labels; p++) labels._core.labelLayers(layersOf(plan[p].comp), rules);
        // précompos recadrées, les plus profondes d'abord (leur taille compte dans la boîte de la précompo au-dessus)
        for (p = plan.length - 1; p >= 1; p--) {
            if (cropPrecomp(plan[p].comp, holdersOf(plan, plan[p].comp))) tally.cropped++;
        }
        var quick = S.getTool('quicktools');
        for (p = 0; p < plan.length && quick; p++) tally.anchors += centerAnchors(plan[p].comp, quick._core.placeAnchor);
        return { name: comp.name, compId: comp.id };
    }

    // ------------------------------------------------------------------------
    //  API
    // ------------------------------------------------------------------------

    var api = {};

    api.list = function (args) {
        var folder = null;
        if (args && args.folder) {
            folder = new Folder(String(args.folder));
            if (!folder.exists) {
                return { folder: null, files: [], status: status('Dossier introuvable : choisis le dossier des PSD', 'warn') };
            }
        } else {
            var start = projectFolder();
            if (!start) {
                return { folder: null, files: [], status: status('Projet non enregistré : choisis le dossier des PSD', 'info') };
            }
            folder = findAssetFolder(start);
            if (!folder) {
                return { folder: null, start: start.fsName, files: [], status: status('Dossier ' + ASSET_PATH + ' introuvable : choisis le dossier des PSD', 'warn') };
            }
        }
        var files = listPsds(folder);
        var text = files.length === 0 ? 'Aucun PSD dans ce dossier' :
            (files.length === 1 ? '1 PSD trouvé' : files.length + ' PSD trouvés');
        return { folder: folder.fsName, files: files, status: status(text, files.length === 0 ? 'warn' : 'ok') };
    };

    api.pickFolder = function (args) {
        var start = null;
        if (args && args.from) {
            start = new Folder(String(args.from));
            if (!start.exists) start = null;
        }
        if (!start) start = projectFolder();
        // Folder.selectDialog(invite) n'a pas de dossier de départ : il passe par folder.selectDlg(invite)
        var picked = start ? start.selectDlg(PICK_PROMPT) : Folder.selectDialog(PICK_PROMPT);
        return { folder: picked ? picked.fsName : null };
    };

    /**
     * importBatch({ items: [{ path, shapes: Shape[] | null, error? }], rules }) : importe les PSD (voir importOne),
     * dans un seul groupe d'annulation. Un item avec error, sans chemin, ou dont le traitement lève une erreur
     * compte comme PSD illisible ; le lot continue. La compo active au départ est rouverte à la fin.
     * -> { imported: [{ name, compId }], status }
     */
    api.importBatch = function (args) {
        var items = (args && args.items && typeof args.items.length === 'number') ? args.items : [];
        var rules = args ? args.rules : null;
        var imported = [], tally = { shapes: 0, texts: 0, failed: 0, missing: false }, unreadable = 0, valid = [], i;
        for (i = 0; i < items.length; i++) {
            if (items[i] && !items[i].error && items[i].path) valid.push(items[i]);
            else unreadable++;
        }
        if (valid.length > 0) {
            // seule une compo se rouvre dans le viewer : un autre élément actif (métrage…) n'est pas rétabli
            var active = app.project.activeItem, activeId = (active instanceof CompItem) ? active.id : null;
            var ctx = { asset: null };
            try {
                S.ae.undo(UNDO_NAME, function () {
                    for (var k = 0; k < valid.length; k++) {
                        var mine = { shapes: 0, texts: 0, failed: 0, missing: false, anchors: 0, cropped: 0 }, before = projectItemIds();
                        try {
                            imported.push(importOne(valid[k], before, ctx, rules, mine));
                            tally.shapes += mine.shapes;
                            tally.texts += mine.texts;
                            tally.failed += mine.failed;
                            if (mine.missing) tally.missing = true;
                        } catch (e) {
                            unreadable++;
                            removeNewItems(before);        // pas de PSD à demi importé dans le projet
                            ctx.asset = null;              // peut être le 02_ASSET qu'on vient de retirer
                        }
                    }
                });
            } finally {
                var back = (activeId !== null) ? S.ae.findCompById(activeId) : null;
                if (back) { try { back.openInViewer(); } catch (e2) { /* compo disparue */ } }
            }
        }
        var text = S.plural(imported.length, 'PSD importé', 'PSD importés') + ' · ' +
            S.plural(tally.texts, 'texte', 'textes') + ' · ' + S.plural(tally.shapes, 'forme', 'formes');
        if (unreadable > 0) text += ' · ' + S.plural(unreadable, 'PSD illisible', 'PSD illisibles');
        if (tally.failed > 0) text += ' · ' + S.plural(tally.failed, 'forme en erreur', 'formes en erreur');
        if (tally.missing) text += ' · textes non convertis (commande introuvable dans cette langue d\'After Effects)';
        if (valid.length > 0) text += ' · Ctrl+Z pour annuler';
        return { imported: imported, status: status(text, (unreadable > 0 || tally.failed > 0 || tally.missing) ? 'warn' : 'ok') };
    };

    api._core = {
        naturalCompare: naturalCompare,
        isPsdName: isPsdName,
        findAssetFolder: findAssetFolder,
        replaceWithShape: replaceWithShape,
        copyLayerStyles: copyLayerStyles,
        styleOverflow: styleOverflow,
        cropPrecomp: cropPrecomp,
        lastFailure: function () { return lastFailure; }
    };

    S.registerTool('psdimport', api);

})();
