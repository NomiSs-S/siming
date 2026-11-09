'use strict';
/* Import PSD, lecteur (js/psd/reader.js) : en-tête, arbre des calques et groupes, descripteurs. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { read, descriptor } = require('../extension/client/js/psd/reader.js');

const FIXTURE = path.join(__dirname, 'fixtures/psd/planche-test.psd');

// ---- Fabrique de tampons Photoshop (gros-boutiste) ----

const u16 = (n) => Buffer.from([(n >> 8) & 255, n & 255]);
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const i32 = (n) => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };
const f64 = (n) => { const b = Buffer.alloc(8); b.writeDoubleBE(n); return b; };
const ascii = (s) => Buffer.from(s, 'latin1');
const uni = (s) => Buffer.concat([u32(s.length + 1), Buffer.from(s + '\0', 'utf16le').swap16()]);
const key = (k) => (k.length === 4 ? Buffer.concat([u32(0), ascii(k)]) : Buffer.concat([u32(k.length), ascii(k)]));
const obj = (cls, items) => Buffer.concat([
    uni(''), key(cls), u32(items.length),
    ...items.map(([k, type, payload]) => Buffer.concat([key(k), ascii(type), payload])),
]);
const pad4 = (b) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]);
const block = (k, payload) => Buffer.concat([ascii('8BIM'), ascii(k), u32(payload.length), pad4(payload)]);

function record(o) {
    const nameBytes = ascii(o.name);
    const pascal = pad4(Buffer.concat([Buffer.from([nameBytes.length]), nameBytes]));
    const blocks = Buffer.concat(o.blocks || []);
    const mask = o.mask || Buffer.alloc(0);
    const extra = Buffer.concat([u32(mask.length), mask, u32(0), pascal, blocks]);
    const box = o.box || [0, 0, 0, 0];   // haut, gauche, bas, droite
    return Buffer.concat([
        i32(box[0]), i32(box[1]), i32(box[2]), i32(box[3]),
        u16(1), u16(0), u32(0),               // un canal
        ascii('8BIM'), ascii(o.blend || 'norm'), Buffer.from([o.opacity === undefined ? 255 : o.opacity, o.clip ? 1 : 0, o.flags || 0, 0]),
        u32(extra.length), extra,
    ]);
}
const lsct = (type) => block('lsct', u32(type));

/** PSD minimal : en-tête, sections vides, puis les enregistrements (de bas en haut). */
function makePsd(records, version, resources) {
    const header = Buffer.concat([ascii('8BPS'), u16(version || 1), Buffer.alloc(6), u16(3), u32(100), u32(200), u16(8), u16(3)]);
    const info = Buffer.concat([u16(records.length), ...records]);
    const layerInfo = Buffer.concat([u32(info.length), info]);
    const res = resources || Buffer.alloc(0);
    return Buffer.concat([header, u32(0), u32(res.length), res, u32(layerInfo.length), layerInfo]);
}

/** Ressource d'image : 8BIM, identifiant, nom vide (2 octets), taille, données (remplies à un nombre pair). */
const resource = (id, data) => Buffer.concat([ascii('8BIM'), u16(id), Buffer.from([0, 0]), u32(data.length), data, Buffer.alloc(data.length % 2)]);

const names = (ls) => ls.map((l) => l.name);

module.exports = function (test) {
    test('psd : planche test, taille, arbre des calques dans l\'ordre du panneau', () => {
        const doc = read(fs.readFileSync(FIXTURE));
        assert.deepStrictEqual([doc.width, doc.height], [1920, 1080]);
        assert.deepStrictEqual(names(doc.layers), ['Groupe 1', 'PourQUOI ???', 'Rectangle 1', 'Ellipse 1', 'Calque 0']);
        assert.deepStrictEqual(names(doc.layers[0].children), ['Polygone 1', 'Rectangle 3', 'Rectangle 2']);
        assert.deepStrictEqual(doc.layers.map((l) => l.kind), ['group', 'layer', 'layer', 'layer', 'layer']);
        assert.ok(doc.layers[0].children.every((l) => l.kind === 'layer' && !l.children));
    });

    test('psd : planche test, boîte, forme d\'origine, texte', () => {
        const doc = read(fs.readFileSync(FIXTURE));
        const r1 = doc.layers[2];
        assert.deepStrictEqual(r1.box, { left: 759, top: 272, right: 1620, bottom: 477 });
        assert.strictEqual(r1.blocks.vogk.keyDescriptorList[0].keyOriginType, 2);
        assert.strictEqual(r1.blocks.vscg['Clr ']['Rd  '] > 0, true);
        assert.ok(r1.blocks.vsms.length > 4 && r1.blocks.vsms[1].type === 0);
        assert.deepStrictEqual(r1.blocks.vsms[0], { type: 8, fill: 0 }, 'remplissage initial : vide');
        assert.strictEqual(r1.blocks.vsmsFlags, 0);
        assert.strictEqual(doc.layers[1].blocks.TySh, true);
        assert.strictEqual(r1.blocks.TySh, false);
        assert.strictEqual(doc.layers[4].blocks.vogk, undefined);
        assert.ok(doc.layers.every((l) => l.opacity === 255 && l.blend && l.hidden === false));
    });

    test('psd : descripteur, tous les types d\'éléments', () => {
        const nested = obj('Clrt', [['Lctn', 'long', i32(-7)]]);
        const buf = Buffer.concat([Buffer.from('xx'), obj('Test', [
            ['Nm  ', 'TEXT', uni('Gris é')],
            ['Angl', 'UntF', Buffer.concat([ascii('#Ang'), f64(129.5)])],
            ['Opct', 'doub', f64(0.25)],
            ['Type', 'enum', Buffer.concat([key('GrdT'), key('Lnr ')])],
            ['Dthr', 'bool', Buffer.from([1])],
            ['Off ', 'bool', Buffer.from([0])],
            ['Clrs', 'VlLs', Buffer.concat([u32(2), ascii('Objc'), nested, ascii('long'), i32(9)])],
            ['Sub ', 'Objc', nested],
            ['longueCle', 'long', i32(3)],
        ])]);
        const { value, end } = descriptor(buf, 2);
        assert.strictEqual(end, buf.length);
        assert.deepStrictEqual(value, {
            _class: 'Test',
            'Nm  ': 'Gris é',
            Angl: { unit: '#Ang', v: 129.5 },
            Opct: 0.25,
            Type: { enum: 'GrdT', v: 'Lnr ' },
            Dthr: true,
            'Off ': false,
            Clrs: [{ _class: 'Clrt', Lctn: -7 }, 9],
            'Sub ': { _class: 'Clrt', Lctn: -7 },
            longueCle: 3,
        });
    });

    test('psd : descripteur, type inconnu = erreur claire', () => {
        const buf = obj('Test', [['Zzzz', 'Wxyz', Buffer.alloc(4)]]);
        assert.throws(() => descriptor(buf, 0), /Type de descripteur inconnu : Wxyz/);
    });

    test('psd : groupes imbriqués, calque masqué, nom Unicode, plan de travail, opacité', () => {
        const rect = obj('classFloatRect', [['Top ', 'doub', f64(10)], ['Left', 'doub', f64(20)], ['Btom', 'doub', f64(300)], ['Rght', 'doub', f64(400)]]);
        const artb = block('artb', Buffer.concat([u32(16), obj('artb', [['artboardRect', 'Objc', rect]])]));
        const doc = read(makePsd([
            record({ name: 'bas', box: [0, 0, 50, 60], opacity: 128, blend: 'mul ', blocks: [block('lyid', u32(7))] }),
            record({ name: '</Layer group>', blocks: [lsct(3)] }),
            record({ name: 'x', box: [1, 2, 3, 4], flags: 2, blocks: [block('luni', uni('caché é')), block('lyid', u32(9))] }),
            record({ name: '</Layer group>', blocks: [lsct(3)] }),
            record({ name: 'profond', box: [5, 6, 7, 8] }),
            record({ name: 'Interne', blocks: [lsct(1)] }),
            record({ name: 'Planche', blocks: [lsct(2), artb] }),
            record({ name: 'haut' }),
        ]));
        assert.deepStrictEqual(names(doc.layers), ['haut', 'Planche', 'bas']);
        const [haut, planche, bas] = doc.layers;
        assert.strictEqual(haut.kind, 'layer');
        assert.strictEqual(haut.artboard, null);
        assert.strictEqual(planche.kind, 'group');
        assert.deepStrictEqual(planche.artboard, { left: 20, top: 10, right: 400, bottom: 300 });
        assert.deepStrictEqual(names(planche.children), ['Interne', 'caché é']);
        const [interne, cache] = planche.children;
        assert.strictEqual(interne.kind, 'group');
        assert.deepStrictEqual(names(interne.children), ['profond']);
        assert.deepStrictEqual(interne.children[0].box, { left: 6, top: 5, right: 8, bottom: 7 });
        assert.strictEqual(interne.children[0].hidden, false);
        assert.strictEqual(cache.kind, 'layer');
        assert.strictEqual(cache.hidden, true);
        assert.strictEqual(cache.id, 9);
        assert.deepStrictEqual(cache.box, { left: 2, top: 1, right: 4, bottom: 3 });
        assert.strictEqual(bas.opacity, 128);
        assert.strictEqual(bas.blend, 'mul ');
        assert.strictEqual(bas.id, 7);
    });

    test('psd : blocs vscg, vstk, lfx2, vsms décodés, bloc illisible = undefined', () => {
        const color = obj('RGBC', [['Rd  ', 'doub', f64(255)], ['Grn ', 'doub', f64(0)], ['Bl  ', 'doub', f64(0)]]);
        const path8 = Buffer.concat([u32(0), u32(0)]);
        const node = (type, ...xy) => Buffer.concat([u16(type), ...xy.map((v) => i32(Math.round(v * (1 << 24))))]);
        const lengthRecord = (type, count, op) => Buffer.concat([u16(type), u16(count), u16(op & 0xffff), Buffer.alloc(20)]);
        const doc = read(makePsd([record({
            name: 'forme',
            blocks: [
                block('vscg', Buffer.concat([ascii('SoCo'), u32(16), obj('null', [['Clr ', 'Objc', color]])])),
                block('vstk', Buffer.concat([u32(16), obj('strokeStyle', [['strokeStyleLineWidth', 'UntF', Buffer.concat([ascii('#Pxl'), f64(4)])]])])),
                block('lfx2', Buffer.concat([u32(0), u32(16), obj('null', [['Scl ', 'UntF', Buffer.concat([ascii('#Prc'), f64(100)])]])])),
                block('vsms', Buffer.concat([path8, lengthRecord(0, 1, 1), node(1, 0.5, 0.25, 0.5, 0.25, 0.5, 0.25), lengthRecord(3, 0, -1)])),
                block('vogk', Buffer.concat([u32(16), u32(0), ascii('Wxyz')])),   // descripteur tronqué
            ],
        })]));
        const l = doc.layers[0];
        assert.deepStrictEqual(l.blocks.vscg['Clr '], { _class: 'RGBC', 'Rd  ': 255, 'Grn ': 0, 'Bl  ': 0 });
        assert.deepStrictEqual(l.blocks.vstk.strokeStyleLineWidth, { unit: '#Pxl', v: 4 });
        assert.deepStrictEqual(l.blocks.lfx2['Scl '], { unit: '#Prc', v: 100 });
        assert.deepStrictEqual(l.blocks.vsms, [{ type: 0, op: 1 }, { type: 1, r: [0.5, 0.25, 0.5, 0.25, 0.5, 0.25] }, { type: 3, op: -1 }]);
        assert.strictEqual(l.blocks.vogk, undefined);
    });

    test('psd : drapeaux du tracé (vsmsFlags), remplissage initial (type 8), présence de lmfx / lfxs', () => {
        const node = (type, ...xy) => Buffer.concat([u16(type), ...xy.map((v) => i32(Math.round(v * (1 << 24))))]);
        const lengthRecord = (type, count, op) => Buffer.concat([u16(type), u16(count), u16(op & 0xffff), Buffer.alloc(20)]);
        const fillRule = (v) => Buffer.concat([u16(8), u16(v), Buffer.alloc(22)]);
        const vsms = (flags) => block('vsms', Buffer.concat([u32(3), u32(flags), fillRule(1), lengthRecord(0, 1, 1), node(1, 0.5, 0.25, 0.5, 0.25, 0.5, 0.25)]));
        const fx = (k) => block(k, Buffer.concat([u32(0), u32(16), obj('null', [['Scl ', 'UntF', Buffer.concat([ascii('#Prc'), f64(100)])]])]));
        const doc = read(makePsd([
            record({ name: 'inverse', blocks: [vsms(1)] }),
            record({ name: 'multi', blocks: [fx('lmfx'), fx('lfxs')] }),
            record({ name: 'simple', blocks: [vsms(0)] }),
        ]));
        const [simple, multi, inverse] = doc.layers;
        assert.strictEqual(simple.blocks.vsmsFlags, 0);
        assert.strictEqual(inverse.blocks.vsmsFlags, 1);
        assert.deepStrictEqual(simple.blocks.vsms, [{ type: 8, fill: 1 }, { type: 0, op: 1 }, { type: 1, r: [0.5, 0.25, 0.5, 0.25, 0.5, 0.25] }]);
        assert.deepStrictEqual([multi.blocks.lmfx, multi.blocks.lfxs], [true, true]);
        assert.deepStrictEqual([simple.blocks.lmfx, simple.blocks.lfxs], [undefined, undefined]);
    });

    test('psd : vscgKind (SoCo, GdFl, PtFl) et unreadable (blocs illisibles)', () => {
        const color = obj('RGBC', [['Rd  ', 'doub', f64(1)], ['Grn ', 'doub', f64(2)], ['Bl  ', 'doub', f64(3)]]);
        const vscg = (kind) => block('vscg', Buffer.concat([ascii(kind), u32(16), obj('null', [['Clr ', 'Objc', color]])]));
        const truncated = (k) => block(k, Buffer.concat([u32(16), u32(0), ascii('Wxyz')]));
        const doc = read(makePsd([
            record({ name: 'sain', blocks: [vscg('SoCo')] }),
            record({ name: 'degrade', blocks: [vscg('GdFl')] }),
            record({ name: 'motif', blocks: [vscg('PtFl')] }),
            record({ name: 'rien' }),
            record({ name: 'casse', blocks: [truncated('vogk'), truncated('vstk'), block('vsms', Buffer.alloc(0)), truncated('lfx2'), block('vscg', Buffer.concat([ascii('SoCo'), u32(16), u32(0), ascii('Wxyz')]))] }),
        ]));
        const byName = {};
        doc.layers.forEach((l) => { byName[l.name] = l; });
        assert.strictEqual(byName.sain.blocks.vscgKind, 'SoCo');
        assert.strictEqual(byName.degrade.blocks.vscgKind, 'GdFl');
        assert.strictEqual(byName.motif.blocks.vscgKind, 'PtFl');
        assert.strictEqual(byName.rien.blocks.vscgKind, undefined);
        assert.deepStrictEqual(byName.sain.blocks.unreadable, []);
        assert.deepStrictEqual(byName.rien.blocks.unreadable, []);
        assert.deepStrictEqual(byName.casse.blocks.unreadable.slice().sort(), ['lfx2', 'vogk', 'vscg', 'vstk']);
        assert.strictEqual(byName.casse.blocks.vscgKind, 'SoCo');
    });

    test('psd : planche test, opération des sous-tracés = combiner (1), ni détourage ni masque', () => {
        const doc = read(fs.readFileSync(FIXTURE));
        const r3 = doc.layers[0].children[1];
        assert.strictEqual(r3.name, 'Rectangle 3');
        assert.deepStrictEqual(r3.blocks.vsms.filter((r) => r.type === 0 || r.type === 3), [{ type: 0, op: 1 }, { type: 0, op: 1 }]);
        assert.strictEqual(doc.layers[2].blocks.iOpa, undefined);
        assert.ok(doc.layers[0].children.concat(doc.layers).every((l) => l.clipped === false && l.masked === false));
    });

    test('psd : opacité du fond (iOpa), détourage et masque de calque', () => {
        const doc = read(makePsd([
            record({ name: 'masque', mask: Buffer.alloc(20, 1) }),
            record({ name: 'détouré', clip: true, blocks: [block('iOpa', Buffer.from([128, 0, 0, 0]))] }),
            record({ name: 'libre' }),
        ]));
        const [libre, detoure, masque] = doc.layers;
        assert.strictEqual(detoure.blocks.iOpa, 128);
        assert.deepStrictEqual([libre.clipped, libre.masked, libre.blocks.iOpa], [false, false, undefined]);
        assert.deepStrictEqual([detoure.clipped, detoure.masked], [true, false]);
        assert.deepStrictEqual([masque.clipped, masque.masked], [false, true]);
    });

    test('psd : en-tête vscg tronqué en fin de fichier = vscg illisible, pas une erreur', () => {
        const doc = read(makePsd([record({ name: 'cassé', blocks: [block('vscg', Buffer.alloc(0))] })]));
        assert.strictEqual(doc.layers[0].blocks.vscg, undefined);
        assert.strictEqual(doc.layers[0].blocks.vscgKind, undefined);
        assert.deepStrictEqual(doc.layers[0].blocks.unreadable, ['vscg']);
    });

    test('psd : fichier invalide, PSB et PSD sans calques', () => {
        assert.throws(() => read(Buffer.from('pas un psd, du tout, vraiment pas un psd')), /n'est pas un PSD/);
        assert.throws(() => read(makePsd([], 2)), /PSB non pris en charge/);
        const header = makePsd([]).subarray(0, 26);
        const vide = read(Buffer.concat([header, u32(0), u32(0), u32(0)]));
        assert.deepStrictEqual([vide.width, vide.height, vide.layers.length], [200, 100, 0]);
    });

    test('psd : planche test, angle et altitude globaux des styles (ressources 1037 et 1049)', () => {
        const doc = read(fs.readFileSync(FIXTURE));
        assert.strictEqual(doc.globalAngle, 90);
        assert.strictEqual(doc.globalAltitude, 30);
    });

    test('psd : angle et altitude globaux lus parmi d autres ressources (remplissage pair), défauts 120 et 30 sans eux', () => {
        const res = Buffer.concat([resource(1005, Buffer.from([1, 2, 3])), resource(1037, i32(45)), resource(1049, i32(60))]);
        const doc = read(makePsd([], 1, res));
        assert.deepStrictEqual([doc.globalAngle, doc.globalAltitude], [45, 60]);
        const seul = read(makePsd([], 1, resource(1037, i32(-30))));
        assert.deepStrictEqual([seul.globalAngle, seul.globalAltitude], [-30, 30]);
        const none = read(makePsd([record({ name: 'A' })]));
        assert.deepStrictEqual([none.globalAngle, none.globalAltitude], [120, 30]);
        // ressource tronquée : défauts, pas d'erreur
        const abimee = read(makePsd([], 1, Buffer.concat([ascii('8BIM'), u16(1037), Buffer.from([0, 0]), u32(4), Buffer.from([0, 0])])));
        assert.deepStrictEqual([abimee.globalAngle, abimee.globalAltitude], [120, 30]);
    });
};
