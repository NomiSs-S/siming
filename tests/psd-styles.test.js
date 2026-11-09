'use strict';
/* Import PSD, styles de calque (js/psd/styles.js) : descripteurs lfx2 -> styles JSON. */
const assert = require('assert');
const fs = require('fs');
const styles = require('../extension/client/js/psd/styles.js');
const { read } = require('../extension/client/js/psd/reader.js');

// Fichier réel d'un projet client (dossier donné par SIMING_PSD_SAMPLES) : jamais copié dans le dépôt, le test est sauté s'il manque.
const REAL_PSD = process.env.SIMING_PSD_SAMPLES ? process.env.SIMING_PSD_SAMPLES + '/7.psd' : '';

const blend = (v) => ({ enum: 'BlnM', v });
const prc = (v) => ({ unit: '#Prc', v });
const px = (v) => ({ unit: '#Pxl', v });
const near = (actual, expected, label) => {
    assert.strictEqual(actual.length, expected.length, label);
    expected.forEach((e, i) => assert.ok(Math.abs(actual[i] - e) < 0.001, label + ' : ' + actual[i] + ' != ' + e));
};

const dropShadow = (enab) => ({
    _class: 'DrSh', enab, present: enab, 'Md  ': blend('normal'),
    'Clr ': { _class: 'RGBC', 'Rd  ': 79, 'Grn ': 179, 'Bl  ': 235 },
    Opct: prc(99), uglg: true, lagl: { unit: '#Ang', v: 90 }, Dstn: px(2), Ckmt: px(0), blur: px(49), Nose: prc(0),
});

function findLayer(layers, name) {
    for (const l of layers) {
        if (l.name === name) return l;
        const inside = l.children && findLayer(l.children, name);
        if (inside) return inside;
    }
    return null;
}

module.exports = function (test) {
    test('styles : lueur externe en flottants (7.psd)', () => {
        const out = styles({
            masterFXSwitch: true,
            OrGl: {
                _class: 'OrGl', enab: true, present: true, 'Md  ': blend('screen'),
                'Clr ': { _class: 'RGBC', redFloat: 0.99999988, greenFloat: 0.99999869, blueFloat: 1.0000001 },
                Opct: prc(43), Ckmt: px(0), blur: px(29), Nose: prc(0),
            },
        });
        assert.strictEqual(out.length, 1);
        assert.strictEqual(out[0].kind, 'outerGlow');
        assert.strictEqual(out[0].blend, 'screen');
        near(out[0].color, [1, 1, 1], 'couleur');
        assert.strictEqual(out[0].opacity, 43);
        assert.strictEqual(out[0].size, 29);
    });

    test('styles : lfx2 absent ou sans style actif donne []', () => {
        assert.deepStrictEqual(styles(undefined), []);
        assert.deepStrictEqual(styles(null), []);
        assert.deepStrictEqual(styles({ dropShadowMulti: [dropShadow(false)] }), []);
        assert.deepStrictEqual(styles({ masterFXSwitch: true, DrSh: dropShadow(false) }), []);
    });

    test('styles : interrupteur général coupé donne []', () => {
        assert.deepStrictEqual(styles({ masterFXSwitch: false, dropShadowMulti: [dropShadow(true)] }), []);
    });

    test('styles : motif actif donne null, motif décoché est ignoré', () => {
        assert.strictEqual(styles({ patternFill: { _class: 'patternFill', enab: true } }), null);
        assert.strictEqual(styles({ patternFillMulti: [{ _class: 'patternFill', enab: true }] }), null);
        assert.deepStrictEqual(styles({ patternFill: { _class: 'patternFill', enab: false } }), []);
    });

    test('styles : ombre portée (liste et forme simple), couleur 0-255', () => {
        for (const lfx2 of [{ dropShadowMulti: [dropShadow(true)] }, { DrSh: dropShadow(true) }]) {
            const out = styles(lfx2);
            assert.strictEqual(out.length, 1);
            const s = out[0];
            assert.strictEqual(s.kind, 'dropShadow');
            assert.strictEqual(s.opacity, 99);
            assert.strictEqual(s.angle, 90);
            assert.strictEqual(s.distance, 2);
            assert.strictEqual(s.size, 49);
            assert.strictEqual(s.spread, 0);
            assert.strictEqual(s.useGlobalLight, true);
            assert.strictEqual(s.blend, 'normal');
            near(s.color, [79 / 255, 179 / 255, 235 / 255], 'couleur');
        }
    });

    test('styles : superpositions, contour et lueur au dégradé', () => {
        const out = styles({
            SoFi: { _class: 'SoFi', enab: true, 'Md  ': blend('normal'), 'Clr ': { _class: 'RGBC', 'Rd  ': 255, 'Grn ': 0, 'Bl  ': 0 }, Opct: prc(100) },
            gradientFillMulti: [{
                _class: 'GrFl', enab: true, 'Md  ': blend('normal'), Opct: prc(80), Angl: { unit: '#Ang', v: 92 },
                Type: { enum: 'GrdT', v: 'Lnr ' }, Rvrs: false,
                Grad: {
                    _class: 'Grdn', Clrs: [
                        { _class: 'Clrt', 'Clr ': { _class: 'RGBC', 'Rd  ': 255, 'Grn ': 0, 'Bl  ': 0 }, Lctn: 0 },
                        { _class: 'Clrt', 'Clr ': { _class: 'RGBC', 'Rd  ': 0, 'Grn ': 0, 'Bl  ': 255 }, Lctn: 4096 },
                    ],
                },
            }],
            frameFXMulti: [{
                _class: 'FrFX', enab: true, Styl: { enum: 'FStl', v: 'InsF' }, PntT: { enum: 'FrFl', v: 'SClr' },
                'Md  ': blend('normal'), Opct: prc(100), 'Sz  ': px(4), 'Clr ': { _class: 'RGBC', 'Rd  ': 0, 'Grn ': 255, 'Bl  ': 0 },
            }],
        });
        assert.deepStrictEqual(out.map((s) => s.kind), ['colorOverlay', 'gradientOverlay', 'stroke']);
        assert.deepStrictEqual(out[0].color, [1, 0, 0]);
        assert.strictEqual(out[1].opacity, 80);
        assert.deepStrictEqual(out[1].stops.map((s) => s.location), [0, 1]);
        assert.deepStrictEqual(out[1].stops[1].color, [0, 0, 1]);
        assert.strictEqual(out[2].size, 4);
        assert.strictEqual(out[2].position, 'inside');
        // contour au dégradé, lueur au dégradé : non reproductibles
        assert.strictEqual(styles({ frameFXMulti: [{ _class: 'FrFX', enab: true, PntT: { enum: 'FrFl', v: 'GrFl' } }] }), null);
        assert.strictEqual(styles({ IrGl: { _class: 'IrGl', enab: true, Grad: { _class: 'Grdn' } } }), null);
    });

    test('styles : « Rectangle » de 7.psd = une lueur externe à 43 % (sauté si le fichier manque)', () => {
        if (!fs.existsSync(REAL_PSD)) return;
        const layer = findLayer(read(fs.readFileSync(REAL_PSD)).layers, 'Rectangle ');
        assert.ok(layer, 'calque « Rectangle » introuvable');
        const out = styles(layer.blocks.lfx2);
        assert.strictEqual(out.length, 1);
        assert.strictEqual(out[0].kind, 'outerGlow');
        assert.strictEqual(out[0].opacity, 43);
        assert.strictEqual(out[0].blend, 'screen');
        near(out[0].color, [1, 1, 1], 'couleur');
        // échelle des effets (416,67 %) appliquée au flou brut de 29 px
        assert.ok(Math.abs(out[0].size - 29 * layer.blocks.lfx2['Scl '].v / 100) < 0.001, 'taille ' + out[0].size);
        assert.ok(Math.abs(out[0].scale - 416.6666) < 0.01, 'échelle ' + out[0].scale);
    });

    test('styles : échelle des effets (Scl) multiplie les pixels, pas les pourcentages', () => {
        const lfx2 = {
            'Scl ': prc(200),
            DrSh: Object.assign(dropShadow(true), { Ckmt: px(30) }),
            frameFXMulti: [{
                _class: 'FrFX', enab: true, Styl: { enum: 'FStl', v: 'OutF' }, PntT: { enum: 'FrFl', v: 'SClr' },
                'Md  ': blend('normal'), Opct: prc(100), 'Sz  ': px(4), 'Clr ': { _class: 'RGBC', 'Rd  ': 0, 'Grn ': 0, 'Bl  ': 0 },
            }],
            ChFX: { _class: 'ChFX', enab: true, 'Md  ': blend('multiply'), 'Clr ': { _class: 'RGBC', 'Rd  ': 0, 'Grn ': 0, 'Bl  ': 0 }, Opct: prc(50), Dstn: px(10), blur: px(5), Invr: true, MpgS: { _class: 'ShpC', 'Crv ': [{ Hrzn: 0, Vrtc: 0 }, { Hrzn: 255, Vrtc: 255 }] } },
        };
        const [shadow, satin, stroke] = styles(lfx2);
        assert.deepStrictEqual([shadow.distance, shadow.size, shadow.spread, shadow.scale], [4, 98, 30, 200]);
        assert.deepStrictEqual([satin.distance, satin.size, satin.scale], [20, 10, 200]);
        assert.deepStrictEqual([stroke.size, stroke.scale], [8, 200]);
        // sans Scl : 100 %
        assert.strictEqual(styles({ DrSh: dropShadow(true) })[0].scale, 100);
    });

    test('styles : lueurs, technique, étendue, bruit et source', () => {
        const glowItem = (cls, extra) => Object.assign({
            _class: cls, enab: true, 'Md  ': blend('normal'), 'Clr ': { _class: 'RGBC', 'Rd  ': 0, 'Grn ': 0, 'Bl  ': 0 },
            Opct: prc(35), GlwT: { enum: 'BETE', v: 'PrBL' }, Ckmt: px(10), blur: px(20), Nose: prc(5), ShdN: prc(7), Inpr: prc(50),
        }, extra || {});
        const [outer, inner, center] = styles({
            OrGl: glowItem('OrGl'),
            IrGl: glowItem('IrGl', { glwS: { enum: 'IGSr', v: 'SrcE' } }),
        }).concat(styles({ IrGl: glowItem('IrGl', { glwS: { enum: 'IGSr', v: 'SrcC' } }) }));
        assert.deepStrictEqual([outer.technique, outer.range, outer.jitter, outer.noise], ['precise', 50, 7, 5]);
        assert.strictEqual(outer.source, undefined);
        assert.strictEqual(inner.source, 'edge');
        assert.strictEqual(center.source, 'center');
        assert.strictEqual(styles({ OrGl: glowItem('OrGl', { GlwT: { enum: 'BETE', v: 'SfBL' } }) })[0].technique, 'softer');
        // lueur dégradée : Grad présent, même avec une couleur
        assert.strictEqual(styles({ OrGl: glowItem('OrGl', { Grad: { _class: 'Grdn' } }) }), null);
    });

    test('styles : relief, style, technique, direction, altitude', () => {
        const bevel = (extra) => Object.assign({
            _class: 'ebbl', enab: true,
            hglM: blend('screen'), hglC: { _class: 'RGBC', redFloat: 1, greenFloat: 1, blueFloat: 1 }, hglO: prc(50),
            sdwM: blend('multiply'), sdwC: { _class: 'RGBC', 'Rd  ': 0, 'Grn ': 0, 'Bl  ': 0 }, sdwO: prc(40),
            bvlT: { enum: 'bvlT', v: 'PrBL' }, bvlS: { enum: 'BESl', v: 'Embs' }, uglg: false,
            lagl: { unit: '#Ang', v: 120 }, Lald: { unit: '#Ang', v: 30 }, srgR: prc(100), blur: px(17),
            bvlD: { enum: 'BESs', v: 'Out ' }, Sftn: px(2),
        }, extra || {});
        const s = styles({ 'Scl ': prc(200), ebbl: bevel() })[0];
        assert.deepStrictEqual([s.style, s.technique, s.direction, s.altitude], ['emboss', 'chiselHard', 'down', 30]);
        assert.deepStrictEqual([s.size, s.soften, s.depth, s.angle], [34, 4, 100, 120]);
        assert.deepStrictEqual([s.shadowOpacity, s.shadowBlend], [40, 'multiply']);
        const inner = styles({ ebbl: bevel({ bvlS: { enum: 'BESl', v: 'InrB' }, bvlT: { enum: 'bvlT', v: 'SfBL' }, bvlD: { enum: 'BESs', v: 'In  ' } }) })[0];
        assert.deepStrictEqual([inner.style, inner.technique, inner.direction], ['inner', 'smooth', 'up']);
    });

    test('styles : dégradé, échelle, alignement, décalage, transparence, type', () => {
        const grad = (extra) => Object.assign({
            _class: 'GrFl', enab: true, 'Md  ': blend('normal'), Opct: prc(100), Angl: { unit: '#Ang', v: 92 },
            Type: { enum: 'GrdT', v: 'Lnr ' }, Rvrs: false, Algn: true, 'Scl ': prc(150),
            Ofst: { _class: 'Pnt ', Hrzn: prc(10), Vrtc: prc(-20) },
            Grad: {
                _class: 'Grdn',
                Clrs: [
                    { _class: 'Clrt', 'Clr ': { _class: 'RGBC', 'Rd  ': 255, 'Grn ': 0, 'Bl  ': 0 }, Lctn: 0 },
                    { _class: 'Clrt', 'Clr ': { _class: 'RGBC', 'Rd  ': 0, 'Grn ': 0, 'Bl  ': 255 }, Lctn: 4096 },
                ],
                Trns: [{ _class: 'TrnS', Opct: prc(20), Lctn: 0 }, { _class: 'TrnS', Opct: prc(100), Lctn: 2048 }],
            },
        }, extra || {});
        const g = styles({ 'Scl ': prc(200), GrFl: grad() })[0];
        assert.strictEqual(g.gradientType, 'linear');
        assert.deepStrictEqual([g.scale, g.gradientScale, g.align], [200, 150, true]);
        assert.deepStrictEqual(g.offset, [10, -20]);
        assert.deepStrictEqual(g.opacityStops, [{ pos: 0, opacity: 20 }, { pos: 0.5, opacity: 100 }]);
        assert.strictEqual(styles({ GrFl: grad({ Type: { enum: 'GrdT', v: 'Rdl ' } }) })[0].gradientType, 'radial');
        assert.strictEqual(styles({ GrFl: grad({ Type: { enum: 'GrdT', v: 'Angl' } }) }), null);
        // sans liste de transparence : opaque
        const opaque = grad();
        delete opaque.Grad.Trns;
        assert.deepStrictEqual(styles({ GrFl: opaque })[0].opacityStops, [{ pos: 0, opacity: 100 }, { pos: 1, opacity: 100 }]);
    });

    test('styles : ombre portée, calque creusé par l\'ombre', () => {
        assert.strictEqual(styles({ DrSh: Object.assign(dropShadow(true), { layerConceals: true }) })[0].layerConceals, true);
        assert.strictEqual(styles({ DrSh: dropShadow(true) })[0].layerConceals, false);
    });

    test('styles : couleur non RVB (HSB, CMJN, gris) donne null, pas du noir', () => {
        const hsb = { _class: 'HSBC', 'H   ': { unit: '#Ang', v: 10 }, Strt: 50, Brgh: 50 };
        const cmyk = { _class: 'CMYC', Cyn: 10, Mgnt: 10, Ylw: 10, Blck: 10 };
        const gray = { _class: 'Grsc', 'Gry ': 50 };
        for (const c of [hsb, cmyk, gray]) {
            assert.strictEqual(styles({ DrSh: Object.assign(dropShadow(true), { 'Clr ': c }) }), null, c._class);
        }
        assert.strictEqual(styles({ IrSh: Object.assign(dropShadow(true), { _class: 'IrSh', 'Clr ': hsb }) }), null);
        assert.strictEqual(styles({ OrGl: { _class: 'OrGl', enab: true, 'Clr ': hsb } }), null);
        assert.strictEqual(styles({ SoFi: { _class: 'SoFi', enab: true, 'Md  ': blend('normal'), 'Clr ': cmyk, Opct: prc(100) } }), null);
        assert.strictEqual(styles({ ChFX: { _class: 'ChFX', enab: true, 'Md  ': blend('multiply'), 'Clr ': gray } }), null);
        assert.strictEqual(styles({ ebbl: { _class: 'ebbl', enab: true, hglC: hsb } }), null);
        // un style décoché n'est pas jugé
        assert.deepStrictEqual(styles({ DrSh: Object.assign(dropShadow(false), { 'Clr ': hsb }) }), []);
    });

    // ---- Revue finale : énumérations réelles, valeurs inconnues refusées, contours et texture ----

    test('styles : modes de fusion en codes de 4 lettres (Scrn, Mltp…) et en noms longs (screen, blendSubtraction…)', () => {
        const glowWith = (v) => styles({ OrGl: {
            _class: 'OrGl', enab: true, 'Md  ': blend(v), 'Clr ': { _class: 'RGBC', 'Rd  ': 255, 'Grn ': 255, 'Bl  ': 255 }, Opct: prc(43),
        } });
        const table = {
            Nrml: 'normal', Dslv: 'dissolve', Drkn: 'darken', Mltp: 'multiply', CBrn: 'colorBurn', linearBurn: 'linearBurn',
            darkerColor: 'darkerColor', Lghn: 'lighten', Scrn: 'screen', CDdg: 'colorDodge', linearDodge: 'linearDodge',
            lighterColor: 'lighterColor', Ovrl: 'overlay', SftL: 'softLight', HrdL: 'hardLight', vividLight: 'vividLight',
            linearLight: 'linearLight', pinLight: 'pinLight', hardMix: 'hardMix', Dfrn: 'difference', Xclu: 'exclusion',
            blendSubtraction: 'subtract', blendDivide: 'divide', 'H   ': 'hue', Strt: 'saturation', 'Clr ': 'color', Lmns: 'luminosity',
            normal: 'normal', screen: 'screen', multiply: 'multiply', colorDodge: 'colorDodge', overlay: 'overlay', luminosity: 'luminosity',
        };
        for (const code of Object.keys(table)) {
            const out = glowWith(code);
            assert.ok(out && out.length === 1, code);
            assert.strictEqual(out[0].blend, table[code], code);
        }
        // code inconnu : style non reproductible
        assert.strictEqual(glowWith('Zzzz'), null);
        assert.strictEqual(glowWith('subtract'), null, 'pas un identifiant de Photoshop');
        // mode absent : valeur par défaut de Photoshop
        assert.strictEqual(styles({ OrGl: { _class: 'OrGl', enab: true, 'Clr ': { _class: 'RGBC', 'Rd  ': 0, 'Grn ': 0, 'Bl  ': 0 } } })[0].blend, 'normal');
        // biseautage : lumière et ombre, codes ou noms longs
        const bevel = styles({ ebbl: { _class: 'ebbl', enab: true, hglM: blend('Scrn'), sdwM: blend('Mltp') } })[0];
        assert.deepStrictEqual([bevel.blend, bevel.shadowBlend], ['screen', 'multiply']);
        assert.strictEqual(styles({ ebbl: { _class: 'ebbl', enab: true, sdwM: blend('Zzzz') } }), null);
    });

    test('styles : valeur d\'énumération inconnue (technique, source, style, direction, position) -> null, absente -> défaut', () => {
        const black = { _class: 'RGBC', 'Rd  ': 0, 'Grn ': 0, 'Bl  ': 0 };
        const glow = (cls, extra) => Object.assign({ _class: cls, enab: true, 'Clr ': black }, extra);
        assert.strictEqual(styles({ OrGl: glow('OrGl', { GlwT: { enum: 'BETE', v: 'Zzzz' } }) }), null, 'technique de lueur');
        assert.strictEqual(styles({ IrGl: glow('IrGl', { glwS: { enum: 'IGSr', v: 'Zzzz' } }) }), null, 'source de lueur');
        assert.strictEqual(styles({ ebbl: { _class: 'ebbl', enab: true, bvlS: { enum: 'BESl', v: 'Zzzz' } } }), null, 'style de biseau');
        assert.strictEqual(styles({ ebbl: { _class: 'ebbl', enab: true, bvlT: { enum: 'bvlT', v: 'Zzzz' } } }), null, 'technique de biseau');
        assert.strictEqual(styles({ ebbl: { _class: 'ebbl', enab: true, bvlD: { enum: 'BESs', v: 'Zzzz' } } }), null, 'direction de biseau');
        assert.strictEqual(styles({ FrFX: { _class: 'FrFX', enab: true, 'Clr ': black, Styl: { enum: 'FStl', v: 'Zzzz' } } }), null, 'position du contour');
        // noms longs des mêmes énumérations
        assert.strictEqual(styles({ OrGl: glow('OrGl', { GlwT: { enum: 'BETE', v: 'preciseMatte' } }) })[0].technique, 'precise');
        assert.strictEqual(styles({ IrGl: glow('IrGl', { glwS: { enum: 'IGSr', v: 'centerGlow' } }) })[0].source, 'center');
        assert.strictEqual(styles({ FrFX: { _class: 'FrFX', enab: true, 'Clr ': black, Styl: { enum: 'FStl', v: 'insetFrame' } } })[0].position, 'inside');
        // absentes : valeurs par défaut de Photoshop
        assert.strictEqual(styles({ OrGl: glow('OrGl', {}) })[0].technique, 'softer');
        assert.strictEqual(styles({ IrGl: glow('IrGl', {}) })[0].source, 'edge');
        const b = styles({ ebbl: { _class: 'ebbl', enab: true } })[0];
        assert.deepStrictEqual([b.style, b.technique, b.direction], ['inner', 'smooth', 'up']);
        assert.strictEqual(styles({ FrFX: { _class: 'FrFX', enab: true, 'Clr ': black } })[0].position, 'outside');
    });

    const curve = (pts) => ({ _class: 'ShpC', 'Nm  ': 'Linéaire', 'Crv ': pts.map(([h, v]) => ({ _class: 'CrPt', Hrzn: h, Vrtc: v })) });
    const LINEAR = curve([[0, 0], [255, 255]]);
    const HALF_ROUND = curve([[0, 0], [29, 71], [87, 167], [195, 240], [255, 255]]);   // « Demi-cercle » relevé dans 7.psd

    test('styles : contour (courbe) autre que linéaire -> null ; linéaire ou absent -> reproduit', () => {
        const black = { _class: 'RGBC', 'Rd  ': 0, 'Grn ': 0, 'Bl  ': 0 };
        for (const [key, cls] of [['DrSh', 'DrSh'], ['IrSh', 'IrSh'], ['OrGl', 'OrGl'], ['IrGl', 'IrGl'], ['ebbl', 'ebbl']]) {
            const d = (TrnS) => ({ [key]: Object.assign({ _class: cls, enab: true, 'Clr ': black }, TrnS === undefined ? {} : { TrnS }) });
            assert.strictEqual(styles(d(HALF_ROUND)), null, key + ' demi-cercle');
            assert.strictEqual(styles(d(curve([[0, 0], [255, 200]]))), null, key + ' deux points mais pas l\'identité');
            assert.strictEqual(styles(d(curve([[0, 255], [255, 0]]))), null, key + ' inversée');
            assert.strictEqual(styles(d({ _class: 'ShpC', 'Nm  ': 'Linéaire' })), null, key + ' sans points : nom seul, jamais cru');
            assert.strictEqual(styles(d(LINEAR)).length, 1, key + ' linéaire');
            assert.strictEqual(styles(d(undefined)).length, 1, key + ' sans contour');
        }
    });

    test('styles : satin reproduit seulement avec un contour linéaire présent ; biseau avec texture ou contour -> null', () => {
        const satin = (extra) => ({ ChFX: Object.assign({ _class: 'ChFX', enab: true, 'Md  ': blend('Mltp'), 'Clr ': { _class: 'RGBC', 'Rd  ': 0, 'Grn ': 0, 'Bl  ': 0 } }, extra) });
        assert.strictEqual(styles(satin({ MpgS: LINEAR })).length, 1);
        assert.strictEqual(styles(satin({ MpgS: LINEAR }))[0].blend, 'multiply');
        assert.strictEqual(styles(satin({})), null, 'contour absent : celui de Photoshop par défaut n\'est pas linéaire');
        assert.strictEqual(styles(satin({ MpgS: HALF_ROUND })), null);
        const bevel = (extra) => ({ ebbl: Object.assign({ _class: 'ebbl', enab: true }, extra) });
        assert.strictEqual(styles(bevel({ useTexture: true })), null, 'texture');
        assert.strictEqual(styles(bevel({ useShape: true, MpgS: LINEAR })), null, 'section Contour du biseau');
        assert.strictEqual(styles(bevel({ useTexture: false, useShape: false, MpgS: HALF_ROUND })).length, 1, 'cases décochées : courbe ignorée');
    });

    test('styles : « Rectangle » de 7.psd, lueur en Écran, contour linéaire -> reproductible (sauté si le fichier manque)', () => {
        if (!fs.existsSync(REAL_PSD)) return;
        const doc = read(fs.readFileSync(REAL_PSD));
        const layer = findLayer(doc.layers, 'Rectangle ');
        assert.strictEqual(layer.blocks.lfx2.OrGl['Md  '].v, 'screen', 'nom long dans le vrai fichier');
        const out = styles(layer.blocks.lfx2);
        assert.ok(out, 'non refusé');
        assert.strictEqual(out[0].blend, 'screen');
    });
};
