/*
 * SIMING : styles de calque Photoshop (bloc lfx2) en JSON simple. Ni navigateur ni Node :
 * testé tel quel, sans After Effects.
 *
 *   SIMING.psd.styles(lfx2) -> Style[] | null
 *
 * lfx2 : le descripteur décodé par SIMING.psd.read (layer.blocks.lfx2), ou undefined.
 * Retour : [] si le calque n'a aucun style actif (lfx2 absent, interrupteur général coupé,
 * styles décochés) ; null si un style actif ne peut pas être reproduit : motif, lueur ou contour
 * au dégradé, dégradé qui n'est ni linéaire ni radial, couleur qui n'est pas RVB (HSB, CMJN,
 * gris, nuancier), valeur d'énumération inconnue (mode de fusion, technique, source, style,
 * direction, position : jamais remplacée par une valeur par défaut), contour (courbe) qui n'est
 * pas linéaire, satin sans contour linéaire, biseau à texture ou à contour. L'appelant ne recrée
 * alors pas la forme.
 *
 * Énumérations : Photoshop écrit tantôt le code de 4 lettres (Scrn, SfBL), tantôt le nom long
 * (screen, softMatte) : 7.psd a ses modes de fusion en noms longs, le contour vstk en codes. Les
 * deux sont acceptés. Une clé absente prend la valeur par défaut de Photoshop.
 *
 * Échelle des effets : Photoshop enregistre les tailles « brutes » et, à part, lfx2['Scl ']
 * (« Mettre à l'échelle les effets », en %). Les grandeurs en pixels (distance, size, soften,
 * épaisseur du contour) sont déjà multipliées par Scl / 100 ici, et le pourcentage est repris
 * dans `scale` de chaque style. Les pourcentages (opacity, range, jitter, noise, depth, spread,
 * échelle du dégradé) ne sont jamais mis à l'échelle.
 *
 * Style : { kind, scale, blend, color [r, g, b] (0-1), opacity (0-100), … } avec kind parmi
 *   dropShadow, innerShadow     angle, useGlobalLight, distance, size, spread, noise,
 *                               layerConceals (dropShadow seulement : le calque creuse l'ombre)
 *   outerGlow, innerGlow        technique (softer | precise), size, spread, range, jitter, noise ;
 *                               innerGlow : source (center | edge)
 *   bevelEmboss                 style (inner | outer | emboss | pillow | strokeEmboss),
 *                               technique (smooth | chiselHard | chiselSoft), direction (up | down),
 *                               angle, altitude, useGlobalLight, size, depth, soften,
 *                               shadowBlend, shadowColor, shadowOpacity (blend, color, opacity = lumière)
 *   satin                       angle, distance, size, invert (contour linéaire exigé)
 *   colorOverlay                (valeurs communes)
 *   gradientOverlay             angle, reverse, gradientType (linear | radial), gradientScale (%),
 *                               align, offset [x, y] (%), stops [{ location 0-1, color }],
 *                               opacityStops [{ pos 0-1, opacity 0-100 }]
 *   stroke                      size, position (outside | inside | center)
 * `spread` (Ckmt) est un pourcentage (« Étendue » / « Bouchage » de l'interface), même si le
 * descripteur le marque en pixels : ne pas le traiter comme des pixels.
 * La forme simple (DrSh…) et les listes (dropShadowMulti[]…) sont lues de la même façon.
 */
(function (global) {
    'use strict';

    const SIMING = global.SIMING = global.SIMING || {};
    const GRADIENT_SCALE = 4096;     // positions d'un dégradé : 0 à 4096

    const num = (u, fallback) => {
        if (u === undefined || u === null) return fallback;
        const v = typeof u === 'object' ? u.v : u;
        return typeof v === 'number' ? v : fallback;
    };
    const clamp01 = (n) => Math.min(1, Math.max(0, n));
    const enumValue = (e) => (e && typeof e === 'object' ? e.v : undefined);

    // Valeur d'énumération présente mais inconnue : le style qui la porte n'est pas reproductible.
    const UNKNOWN = Symbol('valeur inconnue');
    const has = (table, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(table, k);
    /** Mot de la table pour l'énumération e ; dflt si e est absente ; UNKNOWN sinon. */
    const pick = (table, e, dflt) => {
        if (e === undefined) return dflt;
        const v = enumValue(e);
        return has(table, v) ? table[v] : UNKNOWN;
    };
    const hasUnknown = (style) => Object.keys(style).some((k) => style[k] === UNKNOWN);

    /**
     * Contour (courbe ShpC) linéaire : exactement deux points, (0, 0) et (255, 255). Jamais d'après
     * son nom (Nm, traduit : « Linéaire »). Absent : ifAbsent.
     */
    function isLinearContour(c, ifAbsent) {
        if (c === undefined) return ifAbsent;
        const pts = c && c['Crv '];
        if (!Array.isArray(pts) || pts.length !== 2) return false;
        const at = (p, h, v) => !!p && Math.abs(num(p.Hrzn, NaN) - h) < 1e-6 && Math.abs(num(p.Vrtc, NaN) - v) < 1e-6;
        return at(pts[0], 0, 0) && at(pts[1], 255, 255);
    }

    /** Couleur RGBC : 0-255 (`Rd  `, `Grn `, `Bl  `) ou 0-1 (`redFloat`…) -> [r, g, b] entre 0 et 1. */
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

    /** Couleur d'une clé absente = défaut ; présente mais pas RVB = null (style non reproductible). */
    function colorOr(c, fallback) {
        return c === undefined ? fallback : color(c);
    }

    // Énumérations de Photoshop (code de 4 lettres et nom long) -> mots lisibles.
    // Modes de fusion (BlnM) : même vocabulaire que les modes de calque (shapes.js) et l'hôte.
    const BLEND_MODES = {
        Nrml: 'normal', Dslv: 'dissolve', Drkn: 'darken', Mltp: 'multiply', CBrn: 'colorBurn', Lghn: 'lighten',
        Scrn: 'screen', CDdg: 'colorDodge', Ovrl: 'overlay', SftL: 'softLight', HrdL: 'hardLight', Dfrn: 'difference',
        Xclu: 'exclusion', 'H   ': 'hue', Strt: 'saturation', 'Clr ': 'color', Lmns: 'luminosity',
        normal: 'normal', dissolve: 'dissolve', darken: 'darken', multiply: 'multiply', colorBurn: 'colorBurn',
        linearBurn: 'linearBurn', darkerColor: 'darkerColor', lighten: 'lighten', screen: 'screen',
        colorDodge: 'colorDodge', linearDodge: 'linearDodge', lighterColor: 'lighterColor', overlay: 'overlay',
        softLight: 'softLight', hardLight: 'hardLight', vividLight: 'vividLight', linearLight: 'linearLight',
        pinLight: 'pinLight', hardMix: 'hardMix', difference: 'difference', exclusion: 'exclusion',
        blendSubtraction: 'subtract', blendDivide: 'divide', hue: 'hue', saturation: 'saturation', color: 'color',
        luminosity: 'luminosity',
    };
    const GLOW_TECHNIQUES = { SfBL: 'softer', PrBL: 'precise', softMatte: 'softer', preciseMatte: 'precise' };
    const GLOW_SOURCES = { SrcC: 'center', SrcE: 'edge', centerGlow: 'center', edgeGlow: 'edge' };
    const BEVEL_STYLES = {
        OtrB: 'outer', InrB: 'inner', Embs: 'emboss', PlEb: 'pillow', strokeEmboss: 'strokeEmboss',
        outerBevel: 'outer', innerBevel: 'inner', emboss: 'emboss', pillowEmboss: 'pillow',
    };
    const BEVEL_TECHNIQUES = {
        SfBL: 'smooth', PrBL: 'chiselHard', Slmt: 'chiselSoft', softMatte: 'smooth', preciseMatte: 'chiselHard', slopeLimitMatte: 'chiselSoft',
    };
    const BEVEL_DIRECTIONS = { 'In  ': 'up', 'Out ': 'down', stampIn: 'up', stampOut: 'down' };
    const GRADIENT_TYPES = { 'Lnr ': 'linear', 'Rdl ': 'radial' };
    const STROKE_POSITIONS = {
        OutF: 'outside', InsF: 'inside', CtrF: 'center', outsetFrame: 'outside', insetFrame: 'inside', centeredFrame: 'center',
    };
    const blendOf = (e, dflt) => pick(BLEND_MODES, e, dflt);

    /** Style commun (fusion, couleur, opacité) ; null si la couleur n'est pas RVB. */
    function common(kind, d, k) {
        const c = colorOr(d['Clr '], [0, 0, 0]);
        if (!c) return null;
        return { kind, scale: k * 100, blend: blendOf(d['Md  '], 'normal'), color: c, opacity: num(d.Opct, 100) };
    }

    // Chaque convertisseur reçoit le descripteur et le facteur d'échelle k (Scl / 100).
    const shadow = (kind) => (d, k) => {
        if (!isLinearContour(d.TrnS, true)) return null;
        const s = common(kind, d, k);
        if (!s) return null;
        Object.assign(s, {
            angle: num(d.lagl, 0),
            useGlobalLight: d.uglg === true,
            distance: num(d.Dstn, 0) * k,
            size: num(d.blur, 0) * k,
            spread: num(d.Ckmt, 0),
            noise: num(d.Nose, 0),
        });
        if (kind === 'dropShadow') s.layerConceals = d.layerConceals === true;
        return s;
    };

    // Une lueur au dégradé (clé Grad) ou sans couleur unie n'est pas reproductible.
    const glow = (kind) => (d, k) => {
        if (d.Grad || !d['Clr '] || !isLinearContour(d.TrnS, true)) return null;
        const s = common(kind, d, k);
        if (!s) return null;
        Object.assign(s, {
            technique: pick(GLOW_TECHNIQUES, d.GlwT, 'softer'),
            size: num(d.blur, 0) * k,
            spread: num(d.Ckmt, 0),
            range: num(d.Inpr, 50),
            jitter: num(d.ShdN, 0),
            noise: num(d.Nose, 0),
        });
        if (kind === 'innerGlow') s.source = pick(GLOW_SOURCES, d.glwS, 'edge');
        return s;
    };

    function bevelEmboss(d, k) {
        // Texture et section « Contour » du biseau, contour de brillance (TrnS) : After n'en a pas.
        if (d.useTexture === true || d.useShape === true || !isLinearContour(d.TrnS, true)) return null;
        const light = colorOr(d.hglC, [1, 1, 1]);
        const dark = colorOr(d.sdwC, [0, 0, 0]);
        if (!light || !dark) return null;
        return {
            kind: 'bevelEmboss',
            scale: k * 100,
            style: pick(BEVEL_STYLES, d.bvlS, 'inner'),
            technique: pick(BEVEL_TECHNIQUES, d.bvlT, 'smooth'),
            direction: pick(BEVEL_DIRECTIONS, d.bvlD, 'up'),
            blend: blendOf(d.hglM, 'screen'),
            color: light,
            opacity: num(d.hglO, 75),
            shadowBlend: blendOf(d.sdwM, 'multiply'),
            shadowColor: dark,
            shadowOpacity: num(d.sdwO, 75),
            angle: num(d.lagl, 120),
            altitude: num(d.Lald, 30),
            useGlobalLight: d.uglg === true,
            size: num(d.blur, 5) * k,
            depth: num(d.srgR, 100),
            soften: num(d.Sftn, 0) * k,
        };
    }

    // Satin : le contour par défaut de Photoshop n'est pas linéaire, et After n'en a pas ; tant que le
    // test manuel n'a pas montré quel contour le satin d'After reproduit, seul le linéaire, présent, passe.
    function satin(d, k) {
        if (!isLinearContour(d.MpgS, false)) return null;
        const s = common('satin', d, k);
        if (!s) return null;
        return Object.assign(s, {
            angle: num(d.lagl, 19),
            distance: num(d.Dstn, 11) * k,
            size: num(d.blur, 14) * k,
            invert: d.Invr === true,
        });
    }

    const colorOverlay = (d, k) => common('colorOverlay', d, k);

    function gradientOverlay(d, k) {
        const g = d.Grad;
        if (!g || !Array.isArray(g.Clrs)) return null;
        const type = GRADIENT_TYPES[enumValue(d.Type) || 'Lnr '];
        if (!type) return null;             // angulaire, réfléchi, en losange : non reproductibles
        const stops = [];
        for (const s of g.Clrs) {
            const c = color(s['Clr ']);
            if (!c) return null;            // arrêt « couleur de premier plan » ou autre : non reproductible
            stops.push({ location: clamp01(num(s.Lctn, 0) / GRADIENT_SCALE), color: c });
        }
        const opacityStops = Array.isArray(g.Trns) && g.Trns.length
            ? g.Trns.map((t) => ({ pos: clamp01(num(t.Lctn, 0) / GRADIENT_SCALE), opacity: num(t.Opct, 100) }))
            : [{ pos: 0, opacity: 100 }, { pos: 1, opacity: 100 }];
        const offset = d.Ofst || {};
        return {
            kind: 'gradientOverlay',
            scale: k * 100,
            blend: blendOf(d['Md  '], 'normal'),
            opacity: num(d.Opct, 100),
            angle: num(d.Angl, 90),
            reverse: d.Rvrs === true,
            gradientType: type,
            gradientScale: num(d['Scl '], 100),
            align: d.Algn !== false,
            offset: [num(offset.Hrzn, 0), num(offset.Vrtc, 0)],
            stops,
            opacityStops,
        };
    }

    function stroke(d, k) {
        if (d.PntT && d.PntT.v !== 'SClr') return null;     // contour au dégradé ou au motif
        const c = color(d['Clr ']);
        if (!c) return null;
        return {
            kind: 'stroke',
            scale: k * 100,
            blend: blendOf(d['Md  '], 'normal'),
            color: c,
            opacity: num(d.Opct, 100),
            size: num(d['Sz  '], 3) * k,
            position: pick(STROKE_POSITIONS, d.Styl, 'outside'),
        };
    }

    // Clé de la forme simple, clé de la liste, convertisseur. L'ordre est celui des styles rendus.
    // Un convertisseur renvoie null pour un style actif qu'on ne sait pas reproduire.
    const EFFECTS = [
        ['DrSh', 'dropShadowMulti', shadow('dropShadow')],
        ['IrSh', 'innerShadowMulti', shadow('innerShadow')],
        ['OrGl', null, glow('outerGlow')],
        ['IrGl', null, glow('innerGlow')],
        ['ebbl', null, bevelEmboss],
        ['ChFX', null, satin],
        ['SoFi', 'solidFillMulti', colorOverlay],
        ['GrFl', 'gradientFillMulti', gradientOverlay],
        ['FrFX', 'frameFXMulti', stroke],
        ['patternFill', 'patternFillMulti', () => null],
    ];

    function styles(lfx2) {
        if (!lfx2 || typeof lfx2 !== 'object' || lfx2.masterFXSwitch === false) return [];
        const k = num(lfx2['Scl '], 100) / 100;
        const out = [];
        for (const [single, multi, convert] of EFFECTS) {
            // Si la liste existe, elle fait foi ; sinon la forme simple.
            const items = multi && Array.isArray(lfx2[multi]) ? lfx2[multi] : (lfx2[single] ? [lfx2[single]] : []);
            for (const d of items) {
                if (!d || d.enab !== true) continue;
                const style = convert(d, k);
                if (style === null || hasUnknown(style)) return null;
                out.push(style);
            }
        }
        return out;
    }

    SIMING.psd = SIMING.psd || {};
    SIMING.psd.styles = styles;
    SIMING.psd.color = color;        // partagé avec shapes.js : une seule conversion RGBC -> [r, g, b]
    if (typeof module !== 'undefined' && module.exports) module.exports = styles;
})(typeof window !== 'undefined' ? window : globalThis);
