'use strict';
/* Import PSD, formes (js/psd/shapes.js) : calques vectoriels -> sous-tracés, remplissage (uni ou dégradé « ramp »), contour. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { read } = require('../extension/client/js/psd/reader.js');
const shapes = require('../extension/client/js/psd/shapes.js');

const FIXTURE = path.join(__dirname, 'fixtures/psd/planche-test.psd');
const planche = () => read(fs.readFileSync(FIXTURE));

const near = (actual, expected, tolerance, label) => {
    assert.strictEqual(actual.length, expected.length, label);
    expected.forEach((e, i) => assert.ok(Math.abs(actual[i] - e) <= tolerance, label + ' : ' + actual[i] + ' != ' + e));
};
const byName = (list, name, nth) => list.filter((s) => s.match.name === name && s.match.nth === (nth || 0))[0];
function findLayer(layers, name) {
    for (const l of layers) {
        if (l.name === name) return l;
        const inside = l.children && findLayer(l.children, name);
        if (inside) return inside;
    }
    return null;
}

// ---- Calques construits à la main (document 1000 × 500) ----

const px = (v) => ({ unit: '#Pxl', v });
const pnt = (x, y) => ({ _class: 'Pnt ', Hrzn: x, Vrtc: y });
const corners = (l, t, r, b) => ({
    _class: 'null', rectangleCornerA: pnt(l, t), rectangleCornerB: pnt(r, t),
    rectangleCornerC: pnt(r, b), rectangleCornerD: pnt(l, b),
});
const IDENTITY = { _class: 'Trnf', xx: 1, xy: 0, yx: 0, yy: 1, tx: 0, ty: 0 };
const rectOrigin = (l, t, r, b, extra) => Object.assign({
    _class: 'null', keyOriginType: 1, keyOriginBoxCorners: corners(l, t, r, b), Trnf: IDENTITY, keyOriginIndex: 0,
}, extra);
/** Sous-tracé rectangulaire : nœuds en fractions du document 1000 × 500. */
const rectKnots = (l, t, r, b, op) => [{ type: 0, op: op === undefined ? 1 : op }].concat([[l, t], [r, t], [r, b], [l, b]].map(([x, y]) => {
    const k = [y / 500, x / 1000];
    return { type: 1, r: k.concat(k, k) };
}));
/** Nœud d'après ses trois points en px (avant, ancre, après) : [y, x] ×3 en fractions du document 1000 × 500. */
const knot = (before, anchor, after) => ({ type: 1, r: [before[1] / 500, before[0] / 1000, anchor[1] / 500, anchor[0] / 1000, after[1] / 500, after[0] / 1000] });
const K = 0.5522847498;
/** Rectangle arrondi de rayon rad, comme Photoshop : 8 nœuds, A -> B -> C -> D, poignée vers le coin. */
function roundedRectKnots(l, t, r, b, rad) {
    const c = [[l, t], [r, t], [r, b], [l, b]];
    const out = [{ type: 0, op: 1 }];
    for (let i = 0; i < 4; i++) {
        const a = c[i], z = c[(i + 1) % 4];
        const dx = Math.sign(z[0] - a[0]), dy = Math.sign(z[1] - a[1]);
        const p = [a[0] + dx * rad, a[1] + dy * rad], q = [z[0] - dx * rad, z[1] - dy * rad];
        out.push(knot([p[0] - dx * rad * K, p[1] - dy * rad * K], p, p));
        out.push(knot(q, q, [q[0] + dx * rad * K, q[1] + dy * rad * K]));
    }
    return out;
}
/** Ellipse inscrite dans la boîte : 4 nœuds au milieu des côtés, poignées le long du côté. */
function ellipseKnots(l, t, r, b) {
    const hx = (r - l) / 2 * K, hy = (b - t) / 2 * K, cx = (l + r) / 2, cy = (t + b) / 2;
    return [{ type: 0, op: 1 },
        knot([cx - hx, t], [cx, t], [cx + hx, t]), knot([r, cy - hy], [r, cy], [r, cy + hy]),
        knot([cx + hx, b], [cx, b], [cx - hx, b]), knot([l, cy + hy], [l, cy], [l, cy - hy])];
}
const RED = { _class: 'RGBC', 'Rd  ': 255, 'Grn ': 0, 'Bl  ': 51 };
const vstk = (extra) => Object.assign({
    _class: 'strokeStyle', strokeEnabled: false, fillEnabled: true, strokeStyleLineWidth: px(1),
    strokeStyleLineAlignment: { enum: 'strokeStyleLineAlignment', v: 'strokeStyleAlignCenter' },
    strokeStyleLineCapType: { enum: 'strokeStyleLineCapType', v: 'strokeStyleButtCap' },
    strokeStyleLineJoinType: { enum: 'strokeStyleLineJoinType', v: 'strokeStyleMiterJoin' },
    strokeStyleLineDashSet: [], strokeStyleOpacity: { unit: '#Prc', v: 100 },
    strokeStyleBlendMode: { enum: 'BlnM', v: 'Nrml' },
    strokeStyleContent: { _class: 'solidColorLayer', 'Clr ': { _class: 'RGBC', 'Rd  ': 0, 'Grn ': 128, 'Bl  ': 255 } },
}, extra);
function layer(name, extra) {
    return Object.assign({
        id: null, name, box: { left: 10, top: 20, right: 110, bottom: 70 }, opacity: 255, blend: 'norm', hidden: false,
        clipped: false, masked: false, kind: 'layer',
        blocks: {
            TySh: false, unreadable: [], vscgKind: 'SoCo',
            vogk: { _class: 'null', keyDescriptorList: [rectOrigin(10, 20, 110, 70)] },
            vscg: { _class: 'null', 'Clr ': RED },
            vstk: vstk(),
            vsms: rectKnots(10, 20, 110, 70),
        },
    }, extra);
}
const withBlocks = (name, blocks, extra) => {
    const l = layer(name, extra);
    Object.assign(l.blocks, blocks);
    return l;
};
const docOf = (...layers) => ({ width: 1000, height: 500, layers });
const group = (name, ...children) => ({ id: null, name, box: { left: 0, top: 0, right: 0, bottom: 0 }, opacity: 255, blend: 'pass', hidden: false, kind: 'group', children, blocks: { TySh: false, unreadable: [] } });

const gradient = (extra) => Object.assign({
    _class: 'null', gradientsInterpolationMethod: { enum: 'gradientInterpolationMethodType', v: 'Smoo' }, Angl: { unit: '#Ang', v: 90 }, Type: { enum: 'GrdT', v: 'Lnr ' },
    Grad: {
        _class: 'Grdn',
        Clrs: [
            { _class: 'Clrt', 'Clr ': { _class: 'RGBC', 'Rd  ': 0, 'Grn ': 0, 'Bl  ': 0 }, Lctn: 0 },
            { _class: 'Clrt', 'Clr ': { _class: 'RGBC', 'Rd  ': 255, 'Grn ': 255, 'Bl  ': 255 }, Lctn: 4096 },
        ],
        Trns: [{ _class: 'TrnS', Opct: { unit: '#Prc', v: 100 }, Lctn: 0 }, { _class: 'TrnS', Opct: { unit: '#Prc', v: 100 }, Lctn: 4096 }],
    },
}, extra);

module.exports = function (test) {
    test('formes : planche test, rectangle arrondi (Rectangle 1)', () => {
        const list = shapes(planche());
        const r1 = byName(list, 'Rectangle 1');
        assert.strictEqual(r1.paths.length, 1);
        const p = r1.paths[0];
        assert.strictEqual(p.type, 'rect');
        near(p.center, [1189.5, 374.5], 0.01, 'centre');
        near(p.size, [859, 203], 0.01, 'taille');
        assert.ok(Math.abs(p.rotation) < 0.01);
        assert.ok(Math.abs(p.roundness - 55) < 0.01);
        assert.strictEqual(r1.fill.type, 'solid');
        near(r1.fill.color, [9.9455 / 255, 107.2685 / 255, 169 / 255], 0.01, 'couleur');
        assert.strictEqual(r1.stroke, null);
        assert.ok(!('styles' in r1), 'le JSON ne parle plus des styles');
        assert.deepStrictEqual(r1.box, { left: 759, top: 272, right: 1620, bottom: 477 });
        assert.strictEqual(r1.opacity, 100);
        assert.strictEqual(r1.blend, 'normal');
        assert.strictEqual(r1.hidden, false);
    });

    test('formes : planche test, rectangle tourné de 45 degrés (Rectangle 2)', () => {
        const p = byName(shapes(planche()), 'Rectangle 2').paths[0];
        assert.strictEqual(p.type, 'rect');
        near(p.center, [291, 806], 0.01, 'centre');
        near(p.size, [152, 152], 0.01, 'taille');
        assert.ok(Math.abs(p.rotation - 45) < 0.01, 'rotation ' + p.rotation);
        assert.strictEqual(p.roundness, 0);
    });

    test('formes : planche test, deux rectangles dans un calque (Rectangle 3)', () => {
        const paths = byName(shapes(planche()), 'Rectangle 3').paths;
        assert.deepStrictEqual(paths.map((p) => p.type), ['rect', 'rect']);
        near(paths[0].center, [711.5, 824.5], 0.01, 'centre 1');
        near(paths[0].size, [177, 177], 0.01, 'taille 1');
        near(paths[1].center, [928, 824], 0.01, 'centre 2');
        near(paths[1].size, [176, 176], 0.01, 'taille 2');
    });

    test('formes : planche test, ellipse au dégradé linéaire (Ellipse 1) = ramp, géométrie mesurée dans After', () => {
        const e = byName(shapes(planche()), 'Ellipse 1');
        assert.strictEqual(e.paths.length, 1);
        assert.strictEqual(e.paths[0].type, 'ellipse');
        near(e.paths[0].center, [360.5, 369.5], 0.01, 'centre');
        near(e.paths[0].size, [351, 351], 0.01, 'taille');
        assert.ok(Math.abs(e.paths[0].rotation) < 0.01);
        assert.deepStrictEqual(Object.keys(e.fill).sort(), ['end', 'endColor', 'start', 'startColor', 'type']);
        assert.strictEqual(e.fill.type, 'ramp');
        // boîte 184,193 -> 537,546 (353 × 353), angle 129° : direction (cos, -sin), L = 353 (|cos| + |sin|) = 496,5,
        // départ = centre - dir L/2, arrivée = centre + dir L/2 (centre 360,5 ; 369,5)
        near(e.fill.start, [516.72, 562.42], 0.01, 'départ');
        near(e.fill.end, [204.28, 176.58], 0.01, 'arrivée');
        near(e.fill.startColor, [9.9455 / 255, 107.2685 / 255, 169 / 255], 0.01, 'bleu au départ');
        near(e.fill.endColor, [241.0934 / 255, 242.0817 / 255, 243 / 255], 0.01, 'gris à l\'arrivée');
        assert.ok(!('stops' in e.fill) && !('kind' in e.fill), 'plus de type gradient');
    });

    test('formes : planche test, polygone = tracé fermé de 5 sommets (Polygone 1)', () => {
        const p = byName(shapes(planche()), 'Polygone 1').paths[0];
        assert.strictEqual(p.type, 'path');
        assert.strictEqual(p.closed, true);
        assert.strictEqual(p.vertices.length, 5);
        near(p.vertices[0], [1246.5, 636], 0.5, 'premier sommet');
        assert.strictEqual(p.inTangents.length, 5);
        assert.strictEqual(p.outTangents.length, 5);
        near(p.inTangents[0], [0, 0], 0.01, 'tangente');
    });

    test('formes : planche test, texte absent, un résultat par calque vectoriel, puis le fond uni', () => {
        const list = shapes(planche());
        assert.strictEqual(byName(list, 'PourQUOI ???'), undefined);
        assert.strictEqual(byName(list, 'Groupe 1'), undefined);
        assert.deepStrictEqual(list.map((s) => s.match.name), ['Polygone 1', 'Rectangle 3', 'Rectangle 2', 'Rectangle 1', 'Ellipse 1', 'Calque 0']);
        assert.ok(list.every((s) => s.match.nth === 0));
        assert.ok(list.every((s) => s.canvas.width === 1920 && s.canvas.height === 1080), 'taille du document sur chaque forme');
    });

    test('formes : fond de la planche test (pixels unis) -> rectangle plein de sa boîte, rouge', () => {
        const fond = byName(shapes(planche()), 'Calque 0');
        assert.deepStrictEqual(fond.box, { left: 0, top: 0, right: 1920, bottom: 1080 });
        assert.deepStrictEqual(fond.paths, [{ type: 'rect', center: [960, 540], size: [1920, 1080], rotation: 0, roundness: 0 }]);
        assert.strictEqual(fond.fill.type, 'solid');
        near(fond.fill.color, [243 / 255, 0, 24 / 255], 1e-9, 'couleur');
        assert.strictEqual(fond.stroke, null);
    });

    test('formes : calque de pixels uni mais détouré, masqué ou au mode inconnu -> absent', () => {
        for (const over of [{ clipped: true }, { masked: true }, { blend: 'zzzz' }]) {
            const doc = planche();
            Object.assign(findLayer(doc.layers, 'Calque 0'), over);
            assert.strictEqual(byName(shapes(doc), 'Calque 0'), undefined, JSON.stringify(over));
        }
    });

    test('formes : RF2, coins décalés de 10 px = la boîte ne colle plus aux nœuds, donc un tracé', () => {
        const doc = planche();
        const corn = findLayer(doc.layers, 'Rectangle 1').blocks.vogk.keyDescriptorList[0].keyOriginBoxCorners;
        Object.keys(corn).forEach((k) => { if (corn[k].Hrzn !== undefined) corn[k].Hrzn += 10; });
        const r1 = byName(shapes(doc), 'Rectangle 1');
        assert.strictEqual(r1.paths.length, 1);
        assert.strictEqual(r1.paths[0].type, 'path');
        assert.strictEqual(r1.paths[0].closed, true);
        assert.ok(r1.paths[0].vertices.length >= 4);
    });

    test('formes : RF1, rang parmi les calques du même nom (groupe d\'abord, parcours en profondeur)', () => {
        const doc = docOf(
            group('Groupe', layer('Rectangle 1'), layer('Autre')),
            layer('Rectangle 1'));
        const list = shapes(doc);
        assert.deepStrictEqual(list.map((s) => s.match.name + '#' + s.match.nth), ['Rectangle 1#0', 'Autre#0', 'Rectangle 1#1']);
        const noms = shapes(docOf(layer('A'), group('A', layer('A'))));
        // Un groupe devient un précomp côté After : seuls les calques comptent dans le rang.
        assert.deepStrictEqual(noms.map((s) => s.match.nth), [0, 1]);
    });

    test('formes : rayons inégaux ou rectangle arrondi cohérent', () => {
        const radii = (tl, tr, br, bl) => ({
            keyOriginType: 2,
            keyOriginRRectRadii: { _class: 'radii', topLeft: px(tl), topRight: px(tr), bottomRight: px(br), bottomLeft: px(bl) },
        });
        const make = (r) => docOf(withBlocks('R', { vogk: { keyDescriptorList: [rectOrigin(10, 20, 110, 70, r)] }, vsms: roundedRectKnots(10, 20, 110, 70, 12) }));
        const unequal = shapes(make(radii(10, 10, 10, 20)))[0];
        assert.strictEqual(unequal.paths[0].type, 'path');
        const equal = shapes(make(radii(12, 12, 12, 12)))[0];
        assert.strictEqual(equal.paths[0].type, 'rect');
        assert.strictEqual(equal.paths[0].roundness, 12);
    });

    test('formes : origine non crue = tracé (type inconnu, sous-tracés en nombre différent, parallélogramme)', () => {
        const poly = shapes(docOf(withBlocks('P', { vogk: { keyDescriptorList: [rectOrigin(10, 20, 110, 70, { keyOriginType: 8 })] } })))[0];
        assert.strictEqual(poly.paths[0].type, 'path');
        const two = withBlocks('D', { vsms: rectKnots(10, 20, 110, 70).concat(rectKnots(200, 20, 300, 70)) });
        assert.deepStrictEqual(shapes(docOf(two))[0].paths.map((p) => p.type), ['path', 'path']);
        const skew = rectOrigin(10, 20, 110, 70);
        skew.keyOriginBoxCorners.rectangleCornerB = pnt(130, 20);
        skew.keyOriginBoxCorners.rectangleCornerA = pnt(30, 20);
        const para = shapes(docOf(withBlocks('S', { vogk: { keyDescriptorList: [skew] } })))[0];
        assert.strictEqual(para.paths[0].type, 'path');
    });

    test('formes : tracé ouvert, tangentes relatives au sommet', () => {
        const knots = [{ type: 3, op: 1 }, { type: 4, r: [0.1, 0.1, 0.2, 0.2, 0.3, 0.3] }, { type: 5, r: [0.4, 0.5, 0.5, 0.6, 0.5, 0.6] }];
        const s = shapes(docOf(withBlocks('O', { vsms: knots, vogk: { keyDescriptorList: [{ keyOriginType: 8, keyOriginIndex: 0 }] } })))[0];
        const p = s.paths[0];
        assert.strictEqual(p.closed, false);
        near(p.vertices[0], [200, 100], 0.01, 'sommet 0');
        near(p.inTangents[0], [-100, -50], 0.01, 'entrante 0');
        near(p.outTangents[0], [100, 50], 0.01, 'sortante 0');
        near(p.vertices[1], [600, 250], 0.01, 'sommet 1');
        near(p.inTangents[1], [-100, -50], 0.01, 'entrante 1');
        near(p.outTangents[1], [0, 0], 0.01, 'sortante 1');
    });

    test('formes : opacité 0-100, fusion, masqué', () => {
        const s = shapes(docOf(layer('X', { opacity: 128, blend: 'mul ', hidden: true }), layer('Y', { blend: 'zzzz' })));
        assert.ok(Math.abs(s[0].opacity - 128 / 255 * 100) < 0.001);
        assert.strictEqual(s[0].blend, 'multiply');
        assert.strictEqual(s[0].hidden, true);
        assert.strictEqual(s.length, 1, 'mode de fusion inconnu : calque laissé en PSD (M5)');
    });

    test('formes : couleurs 0-255 ou flottantes', () => {
        const c = (rgb) => shapes(docOf(withBlocks('C', { vscg: { 'Clr ': rgb } })))[0].fill.color;
        near(c({ _class: 'RGBC', 'Rd  ': 255, 'Grn ': 0, 'Bl  ': 51 }), [1, 0, 0.2], 0.001, '0-255');
        near(c({ _class: 'RGBC', redFloat: 1, greenFloat: 0.5, blueFloat: 0 }), [1, 0.5, 0], 0.001, 'flottant');
    });

    test('formes : contour actif (épaisseur, couleur, alignement) et remplissage coupé', () => {
        const stroke = (align) => shapes(docOf(withBlocks('S', {
            vstk: vstk({ strokeEnabled: true, strokeStyleLineWidth: px(6), strokeStyleLineAlignment: { enum: 'strokeStyleLineAlignment', v: align } }),
        })))[0].stroke;
        const centre = stroke('strokeStyleAlignCenter');
        assert.strictEqual(centre.width, 6);
        assert.strictEqual(centre.align, 'center');
        near(centre.color, [0, 128 / 255, 1], 0.001, 'couleur');
        assert.strictEqual(stroke('strokeStyleAlignInside').align, 'inside');
        assert.strictEqual(stroke('strokeStyleAlignOutside').align, 'outside');
        const noFill = shapes(docOf(withBlocks('N', { vstk: vstk({ fillEnabled: false, strokeEnabled: true }) })))[0];
        assert.strictEqual(noFill.fill, null);
        assert.notStrictEqual(noFill.stroke, null);
    });

    test('formes : contour en pointillés, au dégradé ou translucide = calque laissé en PSD', () => {
        const withStroke = (extra) => docOf(withBlocks('S', { vstk: vstk(Object.assign({ strokeEnabled: true }, extra)) }));
        assert.strictEqual(shapes(withStroke({})).length, 1);
        assert.strictEqual(shapes(withStroke({ strokeStyleLineDashSet: [{ unit: '#Nne', v: 4 }] })).length, 0);
        assert.strictEqual(shapes(withStroke({ strokeStyleContent: { _class: 'gradientLayer' } })).length, 0);
        assert.strictEqual(shapes(withStroke({ strokeStyleContent: { _class: 'solidColorLayer', 'Clr ': { _class: 'HSBC', 'H   ': { unit: '#Ang', v: 10 }, Strt: 50, Brgh: 50 } } })).length, 0);
        assert.strictEqual(shapes(withStroke({ strokeStyleOpacity: { unit: '#Prc', v: 50 } })).length, 0);
        // Contour coupé : ses réglages ne comptent pas.
        const off = docOf(withBlocks('S', { vstk: vstk({ strokeEnabled: false, strokeStyleLineDashSet: [{ unit: '#Nne', v: 4 }] }) }));
        assert.strictEqual(shapes(off).length, 1);
    });

    test('formes : calque sans vstk = pas de contour', () => {
        const l = layer('S');
        delete l.blocks.vstk;
        const s = shapes(docOf(l))[0];
        assert.strictEqual(s.stroke, null);
        assert.strictEqual(s.fill.type, 'solid');
    });

    // Boîte 10,20 -> 110,70 (100 × 50), centre (60, 45)
    const ramp = (extra, edit) => {
        const g = gradient(extra);
        if (edit) edit(g);
        const list = shapes(docOf(withBlocks('G', { vscgKind: 'GdFl', vscg: g })));
        return list.length ? list[0].fill : null;
    };

    test('formes : dégradé linéaire à 90 degrés = du bas vers le haut, longueur = hauteur de la boîte', () => {
        const f = ramp({});
        assert.strictEqual(f.type, 'ramp');
        near(f.start, [60, 70], 1e-9, 'départ en bas');
        near(f.end, [60, 20], 1e-9, 'arrivée en haut');
        near(f.startColor, [0, 0, 0], 1e-9, 'noir');
        near(f.endColor, [1, 1, 1], 1e-9, 'blanc');
    });

    test('formes : dégradé linéaire à 0 degré = de gauche à droite ; 180 = de droite à gauche ; longueur = largeur', () => {
        const a = ramp({ Angl: { unit: '#Ang', v: 0 } });
        near(a.start, [10, 45], 1e-9, '0 : départ');
        near(a.end, [110, 45], 1e-9, '0 : arrivée');
        const b = ramp({ Angl: { unit: '#Ang', v: 180 } });
        near(b.start, [110, 45], 1e-9, '180 : départ');
        near(b.end, [10, 45], 1e-9, '180 : arrivée');
        const c = ramp({ Angl: { unit: '#Ang', v: -90 } });
        near(c.start, [60, 20], 1e-9, '-90 : départ en haut');
    });

    test('formes : dégradé incliné à 45 degrés, longueur |l cos| + |h sin|, centré sur la boîte', () => {
        const f = ramp({ Angl: { unit: '#Ang', v: 45 } });
        const L = 100 * Math.SQRT1_2 + 50 * Math.SQRT1_2;
        near(f.start, [60 - Math.SQRT1_2 * L / 2, 45 + Math.SQRT1_2 * L / 2], 1e-9, 'départ');
        near(f.end, [60 + Math.SQRT1_2 * L / 2, 45 - Math.SQRT1_2 * L / 2], 1e-9, 'arrivée');
    });

    test('formes : dégradé inversé (Rvrs) = couleurs échangées, mêmes points', () => {
        const f = ramp({ Rvrs: true });
        near(f.start, [60, 70], 1e-9, 'départ');
        near(f.end, [60, 20], 1e-9, 'arrivée');
        near(f.startColor, [1, 1, 1], 1e-9, 'blanc d\'abord');
        near(f.endColor, [0, 0, 0], 1e-9, 'noir ensuite');
    });

    test('formes : arrêts de couleur en retrait (25 % et 75 %) = points rapprochés, la couleur reste au-delà', () => {
        const f = ramp({}, (g) => { g.Grad.Clrs[0].Lctn = 1024; g.Grad.Clrs[1].Lctn = 3072; });
        near(f.start, [60, 57.5], 1e-9, '25 % de la longueur 50, depuis le bas');
        near(f.end, [60, 32.5], 1e-9, '75 %');
        // arrêts donnés dans le désordre : triés
        const g = ramp({}, (d) => { d.Grad.Clrs.reverse(); });
        near(g.startColor, [0, 0, 0], 1e-9);
        // deux arrêts au même endroit : pas de dégradé
        assert.strictEqual(ramp({}, (d) => { d.Grad.Clrs[1].Lctn = 0; }), null);
    });

    test('formes : dégradé non reproductible (radial, angulaire, trois arrêts, transparence, non aligné…) = calque laissé en PSD', () => {
        assert.notStrictEqual(ramp({}), null, 'témoin');
        assert.strictEqual(ramp({ Type: { enum: 'GrdT', v: 'Rdl ' } }), null, 'radial');
        assert.strictEqual(ramp({ Type: { enum: 'GrdT', v: 'Angl' } }), null, 'angulaire');
        assert.strictEqual(ramp({ Type: { enum: 'GrdT', v: 'Rflc' } }), null, 'réfléchi');
        assert.strictEqual(ramp({ Type: undefined }), null, 'type absent');
        const mid = { _class: 'Clrt', 'Clr ': { _class: 'RGBC', 'Rd  ': 255, 'Grn ': 0, 'Bl  ': 0 }, Lctn: 2048 };
        assert.strictEqual(ramp({}, (g) => { g.Grad.Clrs.splice(1, 0, mid); }), null, 'trois arrêts');
        assert.strictEqual(ramp({}, (g) => { g.Grad.Clrs.pop(); }), null, 'un seul arrêt');
        assert.strictEqual(ramp({}, (g) => { g.Grad.Trns[1].Opct = { unit: '#Prc', v: 99 }; }), null, 'transparence à la fin');
        assert.strictEqual(ramp({}, (g) => { g.Grad.Trns[0].Opct = { unit: '#Prc', v: 0 }; }), null, 'transparence au début');
        assert.strictEqual(ramp({ Algn: false }), null, 'non aligné sur le calque');
        assert.notStrictEqual(ramp({ Algn: true }), null, 'aligné');
        assert.strictEqual(ramp({ 'Scl ': { unit: '#Prc', v: 150 } }), null, 'mis à l\'échelle');
        assert.notStrictEqual(ramp({ 'Scl ': { unit: '#Prc', v: 100 } }), null, 'échelle 100');
        const hsb = { _class: 'HSBC', 'H   ': { unit: '#Ang', v: 10 }, Strt: 50, Brgh: 50 };
        assert.strictEqual(ramp({}, (g) => { g.Grad.Clrs[1]['Clr '] = hsb; }), null, 'arrêt HSB');
        assert.strictEqual(ramp({}, (g) => { g.Grad.Clrs[0].Type = { enum: 'Clry', v: 'FrgC' }; }), null, 'couleur de premier plan');
    });

    test('formes : dégradé avec un contour = calque laissé en PSD (l\'effet Dégradé colorerait le contour)', () => {
        const g = gradient({});
        const withStroke = (strokeEnabled) => shapes(docOf(withBlocks('G', { vscgKind: 'GdFl', vscg: g, vstk: vstk({ strokeEnabled }) }))).length;
        assert.strictEqual(withStroke(false), 1);
        assert.strictEqual(withStroke(true), 0);
    });

    test('formes : calques laissés en PSD (blocs illisibles, motif, couleurs non RVB)', () => {
        const one = (blocks, extra) => shapes(docOf(withBlocks('L', blocks, extra))).length;
        assert.strictEqual(one({}), 1);
        ['vogk', 'vsms', 'vscg', 'vstk'].forEach((k) => {
            assert.strictEqual(one({ unreadable: [k] }), 0, k);
        });
        assert.strictEqual(one({ unreadable: ['lfx2'] }), 1, 'styles illisibles : After les a importés, on les recopie');
        assert.strictEqual(one({ vscgKind: 'PtFl' }), 0, 'motif');
        const hsb = { _class: 'HSBC', 'H   ': { unit: '#Ang', v: 10 }, Strt: 50, Brgh: 50 };
        assert.strictEqual(one({ vscg: { 'Clr ': hsb } }), 0, 'couleur HSB');
        assert.strictEqual(one({ vscgKind: 'XxXx' }), 0, 'genre inconnu');
        assert.strictEqual(one({ vogk: undefined }), 0, 'sans forme d\'origine');
        assert.strictEqual(one({ vscg: undefined, vstk: vstk({ fillEnabled: true }) }), 0, 'remplissage actif sans vscg');
    });

    test('formes : opération booléenne d’un sous-tracé autre que combiner = calque laissé en PSD', () => {
        const two = (op) => docOf(withBlocks('B', { vsms: rectKnots(10, 20, 110, 70).concat(rectKnots(200, 20, 300, 70, op)), vogk: { keyDescriptorList: [rectOrigin(10, 20, 110, 70), rectOrigin(200, 20, 300, 70, { keyOriginIndex: 1 })] } }));
        assert.strictEqual(shapes(two(1)).length, 1);
        assert.deepStrictEqual(shapes(two(1))[0].paths.map((p) => p.type), ['rect', 'rect']);
        [0, 2, 3, -1, undefined].forEach((op) => assert.strictEqual(shapes(two(op === undefined ? 99 : op)).length, 0, 'op ' + op));
        // Même le premier sous-tracé doit combiner.
        assert.strictEqual(shapes(docOf(withBlocks('B', { vsms: rectKnots(10, 20, 110, 70, 2) }))).length, 0);
    });

    test('formes : milieu d’arrêt, décalage ou interpolation de dégradé non reproductibles = calque laissé en PSD', () => {
        const one = (extra, edit) => {
            const g = gradient(extra);
            if (edit) edit(g);
            return shapes(docOf(withBlocks('G', { vscgKind: 'GdFl', vscg: g }))).length;
        };
        assert.strictEqual(one({}), 1);
        assert.strictEqual(one({}, (g) => { g.Grad.Clrs[0].Mdpn = 50; g.Grad.Trns[0].Mdpn = 50; }), 1, 'milieux à 50');
        assert.strictEqual(one({}, (g) => { g.Grad.Clrs[0].Mdpn = 30; }), 0, 'milieu de couleur');
        assert.strictEqual(one({}, (g) => { g.Grad.Trns[1].Mdpn = 70; }), 0, 'milieu d’opacité');
        assert.strictEqual(one({ Ofst: { _class: 'Pnt ', Hrzn: 0, Vrtc: 0 } }), 1, 'décalage nul');
        assert.strictEqual(one({ Ofst: { _class: 'Pnt ', Hrzn: 10, Vrtc: 0 } }), 0, 'décalage horizontal');
        assert.strictEqual(one({ Ofst: { _class: 'Pnt ', Hrzn: 0, Vrtc: -5 } }), 0, 'décalage vertical');
        assert.strictEqual(one({ gradientsInterpolationMethod: undefined }), 1, 'méthode absente');
        ['Perc', 'Lnr '].forEach((v) => {
            assert.strictEqual(one({ gradientsInterpolationMethod: { enum: 'gradientInterpolationMethodType', v } }), 0, v);
        });
    });

    test('formes : opacité du fond (iOpa) reportée dans fillOpacity, avec ou sans styles (l\'hôte tranche)', () => {
        const lfx2 = { masterFXSwitch: true, SoFi: { _class: 'SoFi', enab: true, 'Md  ': { enum: 'BlnM', v: 'normal' }, 'Clr ': RED, Opct: { unit: '#Prc', v: 50 } } };
        assert.strictEqual(shapes(docOf(layer('F')))[0].fillOpacity, 100);
        const half = shapes(docOf(withBlocks('F', { iOpa: 128 })))[0];
        assert.ok(Math.abs(half.fillOpacity - 128 / 255 * 100) < 0.001);
        const styled = shapes(docOf(withBlocks('F', { iOpa: 128, lfx2 })));
        assert.strictEqual(styled.length, 1, 'fond translucide et styles : plus un refus');
        assert.ok(Math.abs(styled[0].fillOpacity - 128 / 255 * 100) < 0.001);
    });

    test('formes : calque détouré ou avec masque de calque = laissé en PSD', () => {
        assert.strictEqual(shapes(docOf(layer('C', { clipped: true }))).length, 0);
        assert.strictEqual(shapes(docOf(layer('M', { masked: true }))).length, 0);
        assert.strictEqual(shapes(docOf(layer('L'))).length, 1);
    });

    test('formes : contour à bouts ou jointures arrondis ou carrés = calque laissé en PSD', () => {
        const stroke = (extra) => shapes(docOf(withBlocks('S', { vstk: vstk(Object.assign({ strokeEnabled: true }, extra)) }))).length;
        const cap = (v) => ({ strokeStyleLineCapType: { enum: 'strokeStyleLineCapType', v } });
        const join = (v) => ({ strokeStyleLineJoinType: { enum: 'strokeStyleLineJoinType', v } });
        assert.strictEqual(stroke({}), 1);
        assert.strictEqual(stroke(cap('strokeStyleRoundCap')), 0);
        assert.strictEqual(stroke(cap('strokeStyleSquareCap')), 0);
        assert.strictEqual(stroke(join('strokeStyleRoundJoin')), 0);
        assert.strictEqual(stroke(join('strokeStyleBevelJoin')), 0);
        // Contour coupé : bout et jointure ne comptent pas.
        assert.strictEqual(shapes(docOf(withBlocks('S', { vstk: vstk(cap('strokeStyleRoundCap')) }))).length, 1);
    });

    test('formes : texts liste les calques texte (TySh) avec le même rang nth que les formes, groupes exclus, en profondeur', () => {
        const text = (name) => withBlocks(name, { TySh: true });
        const doc = docOf(layer('A'), text('Titre'), group('G', text('Titre'), layer('Titre'), text('Titre')));
        assert.deepStrictEqual(globalThis.SIMING.psd.texts(doc), [{ name: 'Titre', nth: 0 }, { name: 'Titre', nth: 1 }, { name: 'Titre', nth: 3 }]);
        assert.deepStrictEqual(shapes(doc).map((x) => x.match.name + x.match.nth), ['A0', 'Titre0', 'Titre1', 'Titre2', 'Titre3'], 'mêmes rangs que les formes');
        assert.deepStrictEqual(globalThis.SIMING.psd.texts(docOf(layer('A'))), []);
        assert.deepStrictEqual(globalThis.SIMING.psd.texts(docOf()), []);
        // un calque détouré ou base de détourage reste compté (son rang compte, comme pour les formes)
        const clip = docOf(withBlocks('Haut', {}, { clipped: true }), text('Base'));
        assert.deepStrictEqual(globalThis.SIMING.psd.texts(clip), [{ name: 'Base', nth: 0 }]);
        assert.strictEqual(shapes(clip).length, 0, 'ni le calque détouré ni sa base ne sont des formes');
    });

    test('formes : les styles de calque ne font pas refuser le calque (motif, illisible, lmfx, lfxs, couleur HSB)', () => {
        const pattern = { patternFill: { _class: 'patternFill', enab: true } };
        const lfx2 = { masterFXSwitch: true, SoFi: { _class: 'SoFi', enab: true, 'Md  ': { enum: 'BlnM', v: 'normal' }, 'Clr ': { _class: 'HSBC' }, Opct: { unit: '#Prc', v: 50 } } };
        for (const blocks of [{ lfx2: pattern }, { lfx2 }, { unreadable: ['lfx2'] }, { lmfx: true }, { lfxs: true }]) {
            const out = shapes(docOf(withBlocks('M', blocks)));
            assert.strictEqual(out.length, 1, JSON.stringify(blocks));
        }
        // le fond uni aussi
        const fond = planche();
        findLayer(fond.layers, 'Calque 0').blocks.unreadable = ['lfx2'];
        assert.ok(byName(shapes(fond), 'Calque 0'), 'fond uni à styles illisibles');
    });

    test('formes : document sans calque ou groupes vides', () => {
        assert.deepStrictEqual(shapes(docOf()), []);
        assert.deepStrictEqual(shapes(docOf(group('G'))), []);
    });

    // ---- Revue finale (I3) : origine crue seulement si chaque nœud est à sa place ----

    const typeOf = (blocks) => shapes(docOf(withBlocks('T', blocks)))[0].paths.map((p) => p.type);
    const ellipseOrigin = (l, t, r, b, extra) => Object.assign(rectOrigin(l, t, r, b), { keyOriginType: 5 }, extra);
    const roundedOrigin = (l, t, r, b, rad) => rectOrigin(l, t, r, b, {
        keyOriginType: 2, keyOriginRRectRadii: { _class: 'radii', topLeft: px(rad), topRight: px(rad), bottomRight: px(rad), bottomLeft: px(rad) },
    });

    test('formes : I3, rectangle dont un nœud est tiré vers l\'intérieur ou une poignée tirée = tracé (même boîte)', () => {
        assert.deepStrictEqual(typeOf({}), ['rect'], 'témoin');
        const pulled = rectKnots(10, 20, 110, 70);
        pulled[1] = knot([15, 25], [15, 25], [15, 25]);                 // coin haut gauche rentré : boîte inchangée
        assert.deepStrictEqual(typeOf({ vsms: pulled }), ['path']);
        const curved = rectKnots(10, 20, 110, 70);
        curved[2] = knot([110, 20], [110, 20], [110, 40]);              // poignée tirée : côté courbe
        assert.deepStrictEqual(typeOf({ vsms: curved }), ['path']);
        const extra = rectKnots(10, 20, 110, 70).concat([knot([60, 70], [60, 70], [60, 70])]);   // nœud en plus sur un côté
        assert.deepStrictEqual(typeOf({ vsms: extra }), ['path']);
    });

    test('formes : I3, ordre des nœuds : départ et sens quelconques, croisé = tracé', () => {
        const k = rectKnots(10, 20, 110, 70);
        assert.deepStrictEqual(typeOf({ vsms: [k[0], k[3], k[4], k[1], k[2]] }), ['rect'], 'autre départ');
        assert.deepStrictEqual(typeOf({ vsms: [k[0], k[4], k[3], k[2], k[1]] }), ['rect'], 'sens inverse');
        assert.deepStrictEqual(typeOf({ vsms: [k[0], k[1], k[3], k[2], k[4]] }), ['path'], 'nœuds croisés (nœud papillon)');
    });

    test('formes : I3, rectangle arrondi : nœuds au rayon exigés', () => {
        const vogk = { keyDescriptorList: [roundedOrigin(10, 20, 110, 70, 12)] };
        assert.deepStrictEqual(typeOf({ vogk, vsms: roundedRectKnots(10, 20, 110, 70, 12) }), ['rect']);
        assert.deepStrictEqual(typeOf({ vogk, vsms: roundedRectKnots(10, 20, 110, 70, 8) }), ['path'], 'rayon des nœuds différent');
        assert.deepStrictEqual(typeOf({ vogk, vsms: rectKnots(10, 20, 110, 70) }), ['path'], 'coins vifs');
        const bent = roundedRectKnots(10, 20, 110, 70, 12);
        bent[1] = knot([22, 20], [22, 20], [22, 20]);                    // poignée vers le coin repliée
        assert.deepStrictEqual(typeOf({ vogk, vsms: bent }), ['path'], 'poignée modifiée');
        // rayon 0 : 4 nœuds aux coins
        assert.deepStrictEqual(typeOf({ vogk: { keyDescriptorList: [roundedOrigin(10, 20, 110, 70, 0)] } }), ['rect']);
        // rayon plus grand que la demi-hauteur : Photoshop le rabote, pas de rect
        assert.deepStrictEqual(typeOf({ vogk: { keyDescriptorList: [roundedOrigin(10, 20, 110, 70, 30)] }, vsms: roundedRectKnots(10, 20, 110, 70, 25) }), ['path']);
    });

    test('formes : I3, ellipse : nœuds au milieu des côtés, poignées d\'un quart de cercle', () => {
        const vogk = { keyDescriptorList: [ellipseOrigin(10, 20, 110, 70)] };
        assert.deepStrictEqual(typeOf({ vogk, vsms: ellipseKnots(10, 20, 110, 70) }), ['ellipse']);
        const edited = ellipseKnots(10, 20, 110, 70);
        edited[1] = knot([40, 20], [60, 20], [80, 20]);                  // poignées allongées
        assert.deepStrictEqual(typeOf({ vogk, vsms: edited }), ['path']);
        assert.deepStrictEqual(typeOf({ vogk, vsms: rectKnots(10, 20, 110, 70) }), ['path'], 'nœuds d\'un rectangle');
    });

    test('formes : I3, origine invalidée (keyShapeInvalidated) = tracé', () => {
        assert.deepStrictEqual(typeOf({ vogk: { keyDescriptorList: [rectOrigin(10, 20, 110, 70, { keyShapeInvalidated: true })] } }), ['path']);
        assert.deepStrictEqual(typeOf({ vogk: { keyDescriptorList: [rectOrigin(10, 20, 110, 70, { keyShapeInvalidated: false })] } }), ['rect']);
    });

    test('formes : I3, origines appariées aux sous-tracés par keyOriginIndex', () => {
        const vsms = rectKnots(10, 20, 110, 70).concat(rectKnots(200, 20, 300, 70));
        const a = rectOrigin(10, 20, 110, 70, { keyOriginIndex: 0 }), b = rectOrigin(200, 20, 300, 70, { keyOriginIndex: 1 });
        assert.deepStrictEqual(typeOf({ vsms, vogk: { keyDescriptorList: [b, a] } }), ['rect', 'rect'], 'liste dans l\'autre ordre');
        const p = shapes(docOf(withBlocks('T', { vsms, vogk: { keyDescriptorList: [b, a] } })))[0].paths;
        near(p[0].center, [60, 45], 0.01, 'premier sous-tracé');
        near(p[1].center, [250, 45], 0.01, 'second sous-tracé');
        const dup = rectOrigin(200, 20, 300, 70, { keyOriginIndex: 0 });
        assert.deepStrictEqual(typeOf({ vsms, vogk: { keyDescriptorList: [a, dup] } }), ['path', 'path'], 'indices en double');
    });

    test('formes : M3, calque de base d\'un détourage laissé en PSD, rang des suivants inchangé', () => {
        const doc = docOf(
            layer('Clip', { clipped: true }), layer('Clip', { clipped: true }), layer('Base'),
            layer('Base'), group('G', layer('X', { clipped: true }), layer('Base')));
        const list = shapes(doc);
        assert.deepStrictEqual(list.map((s) => s.match.name + '#' + s.match.nth), ['Base#1']);
        // détouré seul en bas de liste (rien dessous dans le groupe) : rien à sauter de plus
        assert.deepStrictEqual(shapes(docOf(layer('A'), layer('B', { clipped: true }))).map((s) => s.match.name), ['A']);
    });

    test('formes : M4, masque vectoriel inversé ou désactivé, remplissage initial « tous les pixels » = laissé en PSD', () => {
        assert.strictEqual(shapes(docOf(withBlocks('V', { vsmsFlags: 0 }))).length, 1);
        assert.strictEqual(shapes(docOf(withBlocks('V', { vsmsFlags: 2 }))).length, 1, 'bit « non lié » : sans effet sur la forme');
        assert.strictEqual(shapes(docOf(withBlocks('V', { vsmsFlags: 1 }))).length, 0, 'inversé');
        assert.strictEqual(shapes(docOf(withBlocks('V', { vsmsFlags: 4 }))).length, 0, 'désactivé');
        const fill = (v) => [{ type: 8, fill: v }].concat(rectKnots(10, 20, 110, 70));
        assert.strictEqual(shapes(docOf(withBlocks('V', { vsms: fill(0) }))).length, 1);
        assert.strictEqual(shapes(docOf(withBlocks('V', { vsms: fill(1) }))).length, 0);
    });

    test('formes : M6, limite des angles du contour reprise (100 par défaut)', () => {
        const stroke = (extra) => shapes(docOf(withBlocks('S', { vstk: vstk(Object.assign({ strokeEnabled: true }, extra)) })))[0].stroke;
        assert.strictEqual(stroke({}).miterLimit, 100);
        assert.strictEqual(stroke({ strokeStyleMiterLimit: 4 }).miterLimit, 4);
    });

    test('formes : I3, « Rectangle » de 7.psd (8 nœuds, rayon 59) reste un rectangle arrondi (sauté si le fichier manque)', () => {
        const REAL = process.env.SIMING_PSD_SAMPLES ? process.env.SIMING_PSD_SAMPLES + '/7.psd' : '';
        if (!fs.existsSync(REAL)) return;
        const r = byName(shapes(read(fs.readFileSync(REAL))), 'Rectangle ');
        assert.ok(r, 'forme lue');
        assert.strictEqual(r.paths[0].type, 'rect');
        assert.ok(Math.abs(r.paths[0].roundness - 59) < 0.01);
    });
};
