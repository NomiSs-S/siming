/*
 * SIMING : formes Photoshop (calques vectoriels) en JSON simple, en coordonnées du document.
 * Ni navigateur ni Node : testé tel quel, sans After Effects.
 *
 *   SIMING.psd.shapes(doc) -> Shape[]     doc : le résultat de SIMING.psd.read
 *   SIMING.psd.texts(doc)  -> [{ name, nth }]   les calques texte (même rang nth que les formes)
 *
 * Un calque de pixels d'une seule couleur, opaque sur toute sa boîte (le fond d'une planche), devient
 * aussi une forme : un rectangle plein de sa boîte (voir uniformOf).
 *
 * Une entrée par calque vectoriel que l'on sait reproduire fidèlement, dans l'ordre du panneau
 * Calques (le plus haut d'abord, les enfants d'un groupe à leur place). Un calque qu'on ne sait pas
 * reproduire est simplement absent : il reste un calque PSD. C'est le cas quand
 *   - un des blocs vogk, vsms, vscg, vstk est illisible (blocks.unreadable) ;
 *   - le remplissage est un motif, une couleur qui n'est pas RVB, ou un dégradé qui n'est pas un
 *     dégradé linéaire à deux couleurs RVB, opaque, aligné sur le calque, sans échelle ni décalage ni
 *     milieu d'arrêt déplacé, interpolé en « Classique » (voir rampFill) ; un dégradé avec un
 *     contour reste aussi en PSD (l'effet Dégradé d'After colorerait le contour) ;
 *   - le contour est en pointillés, translucide, au dégradé ou au motif, de couleur non RVB, ou à
 *     bouts / jointures autres que plat / onglet ;
 *   - un sous-tracé a une opération booléenne autre que « combiner » (soustraire, intersecter…) ;
 *   - le calque est détouré, sert de base à un détourage (calque juste sous un calque détouré) ou
 *     porte un masque de calque ;
 *   - le tracé est inversé ou désactivé (blocks.vsmsFlags), ou son remplissage initial est « tous
 *     les pixels » ;
 *   - le mode de fusion du calque est inconnu.
 * Les styles de calque ne comptent pas : After les importe avec le PSD, l'hôte les recopie tels quels
 * du calque PSD sur la forme (copier-coller). Le JSON n'en dit rien.
 *
 * Shape = { match: { name, nth }, box, opacity (0-100), blend, hidden, fillOpacity, paths, fill, stroke }
 *   match.nth   rang (0, 1…) parmi les calques du même nom, groupes exclus (un groupe devient un
 *               précomp côté After), parcours haut -> bas en profondeur
 *   fillOpacity opacité du fond (0-100, « Fond » de Photoshop), 100 si absente
 *   box         boîte de pixels du calque (sert au décalage côté hôte)
 *   canvas      { width, height } du document : After importe un calque de forme à la taille du document
 *               (et non de sa boîte), avec son tracé en masque ; l'hôte accepte l'une ou l'autre taille
 *   blend       normal, multiply, screen, overlay, colorDodge… (mode inconnu : calque laissé en PSD)
 *   SubPath     { type: 'rect', center, size, rotation (degrés), roundness }
 *               { type: 'ellipse', center, size, rotation }
 *               { type: 'path', vertices, inTangents, outTangents (relatives au sommet), closed }
 *   Fill        { type: 'solid', color [r, g, b] (0-1) }
 *               { type: 'ramp', start [x, y], end [x, y], startColor [r, g, b], endColor [r, g, b] }
 *                 dégradé linéaire à deux couleurs, en coordonnées du document : l'hôte le pose avec
 *                 l'effet Dégradé d'After (les couleurs d'un dégradé de forme sont inaccessibles par script)
 *   Stroke      { width, color, align: 'center' | 'inside' | 'outside', miterLimit } ; null si coupé
 *
 * Rectangle et ellipse : on ne croit la « forme d'origine » (vogk) que si ses coins (déjà
 * transformés par Photoshop) forment un rectangle et que CHAQUE nœud du tracé réel (vsms) est, à
 * 0,5 px près, là où cette forme le met, poignées comprises, dans l'ordre du contour :
 *   - rectangle : 4 nœuds aux coins, poignées sur le nœud ;
 *   - rectangle arrondi (rayon r) : 8 nœuds à r du coin le long de chaque côté, une poignée vers
 *     le coin (à r × 0,5523), l'autre sur le nœud ; 4 nœuds aux coins si r = 0 ;
 *   - ellipse : 4 nœuds au milieu des côtés de la boîte, poignées le long du côté.
 * Une origine marquée keyShapeInvalidated n'est jamais crue. Origines et sous-tracés vont par
 * paires d'après keyOriginIndex quand chaque origine en a un (sinon dans l'ordre), et seulement
 * s'il y a autant d'origines que de sous-tracés. Sinon, ou pour tout autre type (polygone, ligne,
 * forme personnalisée), le sous-tracé est donné tel quel, nœud par nœud : c'est toujours exact.
 * Un rectangle arrondi n'est un rect que si ses quatre rayons sont égaux. Une ellipse tournée,
 * dont Photoshop ne donne pas de coins, est aussi donnée en tracé.
 */
(function (global) {
    'use strict';

    const SIMING = global.SIMING = global.SIMING || {};
    const GRADIENT_SCALE = 4096;      // positions d'un dégradé : 0 à 4096
    const BOX_TOLERANCE = 0.5;        // px : écart toléré entre la forme d'origine et les nœuds
    const EPSILON = 1e-6;
    const KAPPA = 0.5522847498;       // poignée d'un quart de cercle en Bézier, en fraction du rayon

    const ORIGIN_RECT = 1;
    const ORIGIN_ROUNDED_RECT = 2;
    const ORIGIN_ELLIPSE = 5;

    // Modes de fusion d'un calque : clé de 4 lettres -> nom.
    const BLEND_MODES = {
        'norm': 'normal', 'diss': 'dissolve', 'dark': 'darken', 'mul ': 'multiply', 'idiv': 'colorBurn',
        'lbrn': 'linearBurn', 'dkCl': 'darkerColor', 'lite': 'lighten', 'scrn': 'screen', 'div ': 'colorDodge',
        'lddg': 'linearDodge', 'lgCl': 'lighterColor', 'over': 'overlay', 'sLit': 'softLight',
        'hLit': 'hardLight', 'vLit': 'vividLight', 'lLit': 'linearLight', 'pLit': 'pinLight',
        'hMix': 'hardMix', 'diff': 'difference', 'smud': 'exclusion', 'fsub': 'subtract', 'fdiv': 'divide',
        'hue ': 'hue', 'sat ': 'saturation', 'colr': 'color', 'lum ': 'luminosity',
    };
    const STROKE_ALIGNMENTS = {
        strokeStyleAlignCenter: 'center', strokeStyleAlignInside: 'inside', strokeStyleAlignOutside: 'outside',
    };

    /** Valeur numérique d'un champ : nombre natif ou { unit, v }. */
    const num = (u, fallback) => {
        if (u === undefined || u === null) return fallback;
        const v = typeof u === 'object' ? u.v : u;
        return typeof v === 'number' ? v : fallback;
    };
    const clamp01 = (n) => Math.min(1, Math.max(0, n));
    const enumValue = (e) => (e && typeof e === 'object' ? e.v : undefined);

    /** Couleur RGBC : 0-255 (`Rd  `, `Grn `, `Bl  `) ou 0-1 (`redFloat`…) -> [r, g, b] entre 0 et 1 ; null si elle n'est pas RVB. */
    function color(c) {
        if (!c || typeof c !== 'object') return null;
        if (typeof c.redFloat === 'number') {
            return [clamp01(c.redFloat), clamp01(c.greenFloat), clamp01(c.blueFloat)];
        }
        if (typeof c['Rd  '] === 'number') {
            return [clamp01(c['Rd  '] / 255), clamp01(c['Grn '] / 255), clamp01(c['Bl  '] / 255)];
        }
        return null;
    }

    // ---- Remplissage et contour ----

    /**
     * Dégradé (GdFl) -> { type: 'ramp', start, end, startColor, endColor } ; null s'il n'est pas reproductible
     * par l'effet Dégradé d'After : linéaire, exactement deux arrêts de couleur RVB, tous les arrêts d'opacité à
     * 100 %, sans échelle ni décalage, milieux à 50, méthode « Classique » (ou absente), aligné sur le calque.
     * Géométrie d'un dégradé aligné (mesurée dans After sur la planche test) : centré sur le centre de la boîte du
     * calque, direction (cos θ, −sin θ) (y vers le bas), longueur L = |l·cos θ| + |h·sin θ| (l, h : taille de la
     * boîte) ; le premier arrêt (position p0, de 0 à 1) est à centre − dir·L/2 + dir·L·p0, le dernier (p1) de
     * même : au-delà, la couleur reste celle de l'arrêt, comme dans Photoshop.
     */
    function rampFill(d, box) {
        const g = d.Grad;
        if (enumValue(d.Type) !== 'Lnr ' || !g || !Array.isArray(g.Clrs) || g.Clrs.length !== 2) return null;
        if (d['Scl '] !== undefined && Math.abs(num(d['Scl '], 100) - 100) > 0.01) return null;
        // Décalage du dégradé (Ofst : point en %) : la géométrie mesurée est celle d'un dégradé centré.
        if (d.Ofst && (Math.abs(num(d.Ofst.Hrzn, 0)) > EPSILON || Math.abs(num(d.Ofst.Vrtc, 0)) > EPSILON)) return null;
        // Aligné sur le calque (Algn absent ou vrai) : seule géométrie mesurée.
        if (d.Algn !== undefined && d.Algn !== true) return null;
        // Interpolation : l'effet Dégradé mélange les couleurs linéairement dans l'espace de la composition,
        // comme la méthode « Classique » (Smoo) de Photoshop, la seule que l'on reproduit (au lissage près,
        // qui adoucit les extrémités : écart d'une dizaine de niveaux sur 255, accepté). Perceptuel (Perc) et
        // Linéaire (Lnr ) donnent d'autres dégradés : calque PSD.
        const method = enumValue(d.gradientsInterpolationMethod);
        if (method !== undefined && method !== 'Smoo') return null;
        // Transparence : l'effet ne sait pas faire varier l'opacité le long du dégradé.
        const opacities = Array.isArray(g.Trns) ? g.Trns : [];
        if (opacities.some((s) => Math.abs(num(s.Opct, 100) - 100) > 0.01)) return null;
        // Milieu d'un arrêt (Mdpn, 50 par défaut) : l'effet ne sait pas le déplacer.
        if (g.Clrs.concat(opacities).some((s) => Math.abs(num(s.Mdpn, 50) - 50) > 0.01)) return null;
        let stops = [];
        for (const s of g.Clrs) {
            const type = enumValue(s.Type);
            const c = color(s['Clr ']);
            if (!c || (type !== undefined && type !== 'UsrS')) return null;   // couleur de premier plan, nuancier…
            stops.push({ pos: clamp01(num(s.Lctn, 0) / GRADIENT_SCALE), color: c });
        }
        if (d.Rvrs === true) stops = stops.map((s) => ({ pos: 1 - s.pos, color: s.color }));
        stops.sort((a, b) => a.pos - b.pos);
        if (stops[1].pos - stops[0].pos < EPSILON) return null;
        const l = box.right - box.left, h = box.bottom - box.top;
        const angle = num(d.Angl, 0) * Math.PI / 180;
        const dir = [Math.cos(angle), -Math.sin(angle)];
        const length = Math.abs(l * dir[0]) + Math.abs(h * dir[1]);
        if (!(l > 0 && h > 0 && length > EPSILON)) return null;
        const center = [(box.left + box.right) / 2, (box.top + box.bottom) / 2];
        const at = (pos) => [center[0] + dir[0] * length * (pos - 0.5), center[1] + dir[1] * length * (pos - 0.5)];
        return { type: 'ramp', start: at(stops[0].pos), end: at(stops[1].pos), startColor: stops[0].color, endColor: stops[1].color };
    }

    /** Remplissage du calque (bloc vscg) ; null = pas reproductible (le calque reste en PSD). */
    function readFill(blocks, box) {
        if (blocks.vscgKind === 'SoCo') {
            const c = blocks.vscg && color(blocks.vscg['Clr ']);
            return c ? { type: 'solid', color: c } : null;
        }
        if (blocks.vscgKind === 'GdFl') return blocks.vscg ? rampFill(blocks.vscg, box) : null;
        return null;
    }

    /** Contour (bloc vstk, `strokeEnabled` vrai) ; null = pas reproductible. */
    function readStroke(vstk) {
        const content = vstk.strokeStyleContent;
        const c = content && content._class === 'solidColorLayer' ? color(content['Clr ']) : null;
        const align = STROKE_ALIGNMENTS[enumValue(vstk.strokeStyleLineAlignment)];
        const dashes = vstk.strokeStyleLineDashSet;
        const width = vstk.strokeStyleLineWidth;
        if (!c || !align || (Array.isArray(dashes) && dashes.length > 0)) return null;
        // Bouts et jointures : Stroke ne les exprime pas, seuls les bouts plats et jointures à onglet
        // (valeurs par défaut) sont fidèles.
        const cap = enumValue(vstk.strokeStyleLineCapType);
        const join = enumValue(vstk.strokeStyleLineJoinType);
        if ((cap !== undefined && cap !== 'strokeStyleButtCap') || (join !== undefined && join !== 'strokeStyleMiterJoin')) return null;
        if (!width || width.unit !== '#Pxl') return null;
        if (num(vstk.strokeStyleOpacity, 100) !== 100) return null;
        const mode = enumValue(vstk.strokeStyleBlendMode);
        if (mode !== undefined && mode !== 'Nrml' && mode !== 'normal') return null;
        return { width: width.v, color: c, align, miterLimit: num(vstk.strokeStyleMiterLimit, 100) };
    }

    // ---- Tracés ----

    /** Découpe les enregistrements vsms en sous-tracés { closed, knots } (type 0 fermé, 3 ouvert). */
    function splitSubpaths(records) {
        const out = [];
        for (const r of records) {
            if (r.type === 0 || r.type === 3) out.push({ closed: r.type === 0, knots: [] });
            else if (r.r && out.length > 0) out[out.length - 1].knots.push(r.r);
        }
        return out.filter((s) => s.knots.length > 0);
    }

    /** Sous-tracé brut -> chemin ; r = [y, x] avant, ancre, après, en fractions du document. */
    function pathOf(sub, width, height) {
        const vertices = [], inTangents = [], outTangents = [];
        for (const r of sub.knots) {
            const anchor = [r[3] * width, r[2] * height];
            vertices.push(anchor);
            inTangents.push([r[1] * width - anchor[0], r[0] * height - anchor[1]]);
            outTangents.push([r[5] * width - anchor[0], r[4] * height - anchor[1]]);
        }
        return { type: 'path', vertices, inTangents, outTangents, closed: sub.closed };
    }

    const close = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= BOX_TOLERANCE;
    /** Point à la distance d de `from`, vers `to`. */
    const toward = (from, to, d) => {
        const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
        return [from[0] + (to[0] - from[0]) * d / len, from[1] + (to[1] - from[1]) * d / len];
    };

    /**
     * Nœuds attendus d'une forme d'origine, dans l'ordre du contour A -> B -> C -> D :
     * [{ anchor, before, after }] (poignées en coordonnées du document).
     */
    function rectKnots(c) {
        return c.map((p) => ({ anchor: p, before: p, after: p }));
    }
    function roundedKnots(c, r) {
        const out = [];
        for (let i = 0; i < 4; i++) {
            const a = c[i], b = c[(i + 1) % 4];
            const p = toward(a, b, r), q = toward(b, a, r);
            out.push({ anchor: p, before: toward(p, a, r * KAPPA), after: p });
            out.push({ anchor: q, before: q, after: toward(q, b, r * KAPPA) });
        }
        return out;
    }
    function ellipseKnots(c) {
        const out = [];
        for (let i = 0; i < 4; i++) {
            const a = c[i], b = c[(i + 1) % 4];
            const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
            const half = Math.hypot(b[0] - a[0], b[1] - a[1]) / 2;
            out.push({ anchor: m, before: toward(m, a, half * KAPPA), after: toward(m, b, half * KAPPA) });
        }
        return out;
    }

    /**
     * Les nœuds réels (r = [y, x] avant, ancre, après, en fractions du document) sont-ils exactement
     * les nœuds attendus, dans l'ordre du contour (à partir de n'importe lequel, dans un sens ou dans
     * l'autre ; à rebours, avant et après s'échangent) ?
     */
    function knotsMatch(knots, expected, width, height) {
        const n = expected.length;
        if (knots.length !== n) return false;
        const pts = knots.map((r) => ({
            before: [r[1] * width, r[0] * height], anchor: [r[3] * width, r[2] * height], after: [r[5] * width, r[4] * height],
        }));
        const start = expected.findIndex((e) => close(e.anchor, pts[0].anchor));
        if (start < 0) return false;
        for (const dir of [1, -1]) {
            const ok = pts.every((p, i) => {
                const e = expected[(start + dir * i + n * n) % n];
                const before = dir === 1 ? e.before : e.after, after = dir === 1 ? e.after : e.before;
                return close(p.anchor, e.anchor) && close(p.before, before) && close(p.after, after);
            });
            if (ok) return true;
        }
        return false;
    }

    /** Coins A B C D (déjà transformés) -> { center, size, rotation } ; null si ce n'est pas un rectangle. */
    function cornersGeometry(box) {
        if (!box) return null;
        const pt = (k) => (box[k] ? [num(box[k].Hrzn), num(box[k].Vrtc)] : null);
        const a = pt('rectangleCornerA'), b = pt('rectangleCornerB'), c = pt('rectangleCornerC'), d = pt('rectangleCornerD');
        if (![a, b, c, d].every((p) => p && isFinite(p[0]) && isFinite(p[1]))) return null;
        const ab = [b[0] - a[0], b[1] - a[1]], bc = [c[0] - b[0], c[1] - b[1]];
        const width = Math.hypot(ab[0], ab[1]), height = Math.hypot(bc[0], bc[1]);
        if (width < EPSILON || height < EPSILON) return null;
        if (Math.abs(ab[0] * bc[0] + ab[1] * bc[1]) > 1e-3 * width * height) return null;        // pas d'angle droit
        if (Math.hypot(a[0] + c[0] - b[0] - d[0], a[1] + c[1] - b[1] - d[1]) > BOX_TOLERANCE) return null;   // pas un parallélogramme
        return {
            center: [(a[0] + b[0] + c[0] + d[0]) / 4, (a[1] + b[1] + c[1] + d[1]) / 4],
            size: [width, height],
            rotation: Math.atan2(ab[1], ab[0]) * 180 / Math.PI,
            corners: [a, b, c, d],
        };
    }

    /** Boîte d'une ellipse sans coins (keyOriginShapeBBox), tournée par Trnf = pas reproductible. */
    function bboxGeometry(origin) {
        const bb = origin.keyOriginShapeBBox;
        const t = origin.Trnf;
        if (!bb) return null;
        if (t && (Math.abs(num(t.xy, 0)) > EPSILON || Math.abs(num(t.yx, 0)) > EPSILON)) return null;
        const left = num(bb.Left), top = num(bb['Top ']), right = num(bb.Rght), bottom = num(bb.Btom);
        if (![left, top, right, bottom].every(isFinite) || right - left < EPSILON || bottom - top < EPSILON) return null;
        return {
            center: [(left + right) / 2, (top + bottom) / 2],
            size: [right - left, bottom - top],
            rotation: 0,
            corners: [[left, top], [right, top], [right, bottom], [left, bottom]],
        };
    }

    /** Forme d'origine d'un sous-tracé (rect, ellipse) si on peut la croire ; sinon null. */
    function originPath(origin, sub, width, height) {
        if (!origin || origin.keyShapeInvalidated === true) return null;
        const type = origin.keyOriginType;
        if (type !== ORIGIN_RECT && type !== ORIGIN_ROUNDED_RECT && type !== ORIGIN_ELLIPSE) return null;
        const geo = cornersGeometry(origin.keyOriginBoxCorners) || (type === ORIGIN_ELLIPSE ? bboxGeometry(origin) : null);
        if (!geo) return null;
        let rotation = geo.rotation;
        if (rotation <= -180 + EPSILON) rotation += 360;
        if (type === ORIGIN_ELLIPSE) {
            if (!knotsMatch(sub.knots, ellipseKnots(geo.corners), width, height)) return null;
            return { type: 'ellipse', center: geo.center, size: geo.size, rotation };
        }
        let roundness = 0;
        if (type === ORIGIN_ROUNDED_RECT) {
            const r = origin.keyOriginRRectRadii;
            const radii = r ? [num(r.topLeft), num(r.topRight), num(r.bottomRight), num(r.bottomLeft)] : [];
            if (radii.length !== 4 || !radii.every(isFinite) || radii.some((v) => Math.abs(v - radii[0]) > 0.01)) return null;
            roundness = radii[0];
            if (roundness < 0 || roundness * 2 > Math.min(geo.size[0], geo.size[1]) + EPSILON) return null;
        }
        const expected = roundness > EPSILON ? roundedKnots(geo.corners, roundness) : rectKnots(geo.corners);
        if (!knotsMatch(sub.knots, expected, width, height)) return null;
        return { type: 'rect', center: geo.center, size: geo.size, rotation, roundness };
    }

    /**
     * Origine de chaque sous-tracé (ou null) : autant d'origines que de sous-tracés, appariées par
     * keyOriginIndex si chacune en a un (indices tous différents, dans les bornes), sinon dans l'ordre.
     */
    function pairOrigins(origins, count) {
        if (origins.length !== count) return [];
        const indexes = origins.map((o) => (o && typeof o.keyOriginIndex === 'number' ? o.keyOriginIndex : null));
        if (indexes.some((i) => i === null)) return origins;
        const out = [];
        for (let k = 0; k < origins.length; k++) {
            const i = indexes[k];
            if (i < 0 || i >= count || Math.floor(i) !== i || out[i] !== undefined) return [];
            out[i] = origins[k];
        }
        return out;
    }

    /** Sous-tracés du calque ; une origine n'est utilisée que s'il y en a autant que de sous-tracés. */
    function readPaths(blocks, width, height) {
        const subs = splitSubpaths(blocks.vsms);
        const origins = pairOrigins(blocks.vogk && Array.isArray(blocks.vogk.keyDescriptorList) ? blocks.vogk.keyDescriptorList : [], subs.length);
        return subs.map((sub, i) => originPath(origins[i], sub, width, height) || pathOf(sub, width, height));
    }

    // ---- Calque ----

    const SKIPPED_IF_UNREADABLE = ['vogk', 'vsms', 'vscg', 'vstk'];
    const PATH_INVERTED = 1, PATH_DISABLED = 4;     // drapeaux du tracé (vsms, vmsk)

    /**
     * Calque de pixels d'une seule couleur, opaque sur toute sa boîte (layer.uniform, voir reader.js) : un
     * rectangle plein de cette boîte, le fond d'une planche le plus souvent. null s'il n'est pas reproductible.
     */
    function uniformOf(layer, nth, doc) {
        const blocks = layer.blocks || {};
        if (!Array.isArray(layer.uniform) || layer.clipped === true || layer.masked === true) return null;
        if (!Object.prototype.hasOwnProperty.call(BLEND_MODES, layer.blend)) return null;
        const fillOpacity = blocks.iOpa === undefined ? 100 : blocks.iOpa / 255 * 100;
        const b = layer.box;
        return {
            match: { name: layer.name, nth },
            box: { left: b.left, top: b.top, right: b.right, bottom: b.bottom },
            canvas: { width: doc.width, height: doc.height },
            opacity: layer.opacity / 255 * 100,
            blend: BLEND_MODES[layer.blend],
            hidden: layer.hidden === true,
            fillOpacity,
            paths: [{ type: 'rect', center: [(b.left + b.right) / 2, (b.top + b.bottom) / 2], size: [b.right - b.left, b.bottom - b.top], rotation: 0, roundness: 0 }],
            fill: { type: 'solid', color: layer.uniform.slice(0, 3) },
            stroke: null,
        };
    }

    /** Forme d'un calque ; null si le calque n'est pas une forme, ou pas reproductible. */
    function shapeOf(layer, nth, doc) {
        const blocks = layer.blocks;
        if (blocks && !blocks.vogk && layer.uniform) return uniformOf(layer, nth, doc);
        if (!blocks || !blocks.vogk || !Array.isArray(blocks.vsms)) return null;
        const unreadable = Array.isArray(blocks.unreadable) ? blocks.unreadable : [];
        if (SKIPPED_IF_UNREADABLE.some((k) => unreadable.indexOf(k) >= 0)) return null;
        if (blocks.vscgKind === 'PtFl') return null;
        // Détourage et masque de calque : la forme recréée n'en tiendrait pas compte.
        if (layer.clipped === true || layer.masked === true) return null;
        // Tracé inversé ou désactivé, remplissage initial « tous les pixels » : une tout autre forme.
        const flags = typeof blocks.vsmsFlags === 'number' ? blocks.vsmsFlags : 0;
        if ((flags & (PATH_INVERTED | PATH_DISABLED)) !== 0) return null;
        if (blocks.vsms.some((r) => r.type === 8 && r.fill !== 0)) return null;
        if (!Object.prototype.hasOwnProperty.call(BLEND_MODES, layer.blend)) return null;
        // Opération booléenne de chaque sous-tracé : seul « combiner » (1) est une union fidèle.
        if (blocks.vsms.some((r) => (r.type === 0 || r.type === 3) && r.op !== 1)) return null;

        const vstk = blocks.vstk;
        const fillEnabled = !vstk || vstk.fillEnabled !== false;
        const fill = fillEnabled ? readFill(blocks, layer.box) : null;
        if (fillEnabled && !fill) return null;
        const stroke = vstk && vstk.strokeEnabled === true ? readStroke(vstk) : null;
        if (vstk && vstk.strokeEnabled === true && !stroke) return null;
        // L'effet Dégradé colore tout le calque, contour compris : un dégradé avec un contour reste en PSD.
        if (fill && fill.type === 'ramp' && stroke) return null;

        // Opacité du fond (iOpa) : reportée dans fillOpacity ; l'hôte l'applique au remplissage et au contour,
        // sauf si le calque a des styles, qu'il recopie avec leurs options de fusion (qui la contiennent déjà).
        const fillOpacity = blocks.iOpa === undefined ? 100 : blocks.iOpa / 255 * 100;

        const paths = readPaths(blocks, doc.width, doc.height);
        if (paths.length === 0) return null;
        return {
            match: { name: layer.name, nth },
            box: { left: layer.box.left, top: layer.box.top, right: layer.box.right, bottom: layer.box.bottom },
            canvas: { width: doc.width, height: doc.height },
            opacity: layer.opacity / 255 * 100,
            blend: BLEND_MODES[layer.blend],
            hidden: layer.hidden === true,
            fillOpacity,
            paths,
            fill,
            stroke,
        };
    }

    /**
     * Parcours des calques (groupes exclus), le plus haut d'abord et en profondeur : visit(layer, nth, isBase), nth
     * étant le rang du calque parmi ceux du même nom. Base d'un détourage : calque juste sous un calque détouré,
     * l'ordre étant haut -> bas.
     */
    function walkLayers(doc, visit) {
        const counts = Object.create(null);   // sans prototype : un calque peut s'appeler « constructor »
        const walk = (layers) => {
            layers.forEach((layer, i) => {
                if (layer.kind !== 'group') {
                    // Seuls les calques comptent : un groupe devient un précomp, que l'hôte ne cherche pas.
                    const nth = counts[layer.name] || 0;
                    counts[layer.name] = nth + 1;
                    visit(layer, nth, layer.clipped !== true && i > 0 && layers[i - 1].clipped === true);
                }
                if (layer.children) walk(layer.children);
            });
        };
        walk(doc.layers);
    }

    function shapes(doc) {
        const out = [];
        // Base d'un détourage : la remplacer changerait ce que détourent les calques au-dessus (son rang compte quand même).
        walkLayers(doc, (layer, nth, isBase) => {
            const shape = isBase ? null : shapeOf(layer, nth, doc);
            if (shape) out.push(shape);
        });
        return out;
    }

    /** Calques texte du PSD (bloc TySh) : [{ name, nth }], le rang étant celui de shapes (match.nth). */
    function texts(doc) {
        const out = [];
        walkLayers(doc, (layer, nth) => {
            if (layer.blocks && layer.blocks.TySh === true) out.push({ name: layer.name, nth });
        });
        return out;
    }

    SIMING.psd = Object.assign(SIMING.psd || {}, { shapes, texts });
    if (typeof module !== 'undefined' && module.exports) module.exports = shapes;
})(typeof window !== 'undefined' ? window : globalThis);
