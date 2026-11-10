/*
 * SIMING : lecteur de fichiers Photoshop (.psd). Lit l'en-tête, l'arbre des calques et des
 * groupes, et décode les blocs utiles à l'import (formes, remplissages, contours, styles,
 * plans de travail). Ni navigateur ni Node : testé tel quel, sans After Effects.
 *
 *   SIMING.psd.read(buffer)             -> { width, height, globalAngle, globalAltitude, layers }
 *   SIMING.psd.descriptor(buffer, off)  -> { value, end }   descripteur Photoshop en JSON
 *
 * globalAngle, globalAltitude : angle et altitude de la lumière globale des styles de calque, en degrés
 * (ressources d'image 1037 et 1049 ; 120 et 30, valeurs par défaut de Photoshop, si absentes).
 *
 * buffer : ArrayBuffer, Uint8Array ou Buffer Node. Seul le PSD (version 1) est lu : un PSB lève
 * une erreur.
 *
 * Calque : { id, name, box: { left, top, right, bottom }, opacity (0-255), blend (clé de
 * 4 lettres), hidden, kind: 'group' | 'layer', artboard (rect ou null), children (groupes
 * seulement), blocks: { vogk, vscg, vscgKind, vstk, vsms, lfx2, TySh, iOpa, unreadable }, clipped (détourage), masked (masque de
 * calque en pixels), uniform ([r, g, b] 0-1 : calque de pixels d'une seule couleur, opaque sur toute sa
 * boîte, sans autre bloc que ceux d'un calque de pixels ; null sinon, et pour tout PSD qui n'est pas RVB 8 bits) }. L'arbre suit l'ordre du panneau
 * Calques (le plus haut d'abord). Dans le fichier, les enregistrements vont de bas en haut :
 * un groupe = marqueur de fin (lsct 3), ses enfants, puis son en-tête (lsct 1 ou 2).
 *
 * blocks.iOpa : opacité du fond (0-255), absent s'il vaut 100 %. blocks.vscgKind : clé de 4 lettres qui précède le descripteur vscg (SoCo uni, GdFl dégradé, PtFl
 * motif). blocks.unreadable : clés des blocs dont le décodage a échoué (le bloc est alors absent).
 *
 * Descripteur : objet { _class, <clé>: valeur… } ; UntF -> { unit, v } ; enum -> { enum, v } ;
 * liste -> tableau ; texte, nombres et booléens natifs.
 * Les blocs vsms et vmsk (tracé) donnent un tableau d'enregistrements { type } pour un début
 * de sous-tracé (0 fermé, 3 ouvert) avec son opération booléenne { type, op } (1 = combiner),
 * { type: 8, fill } pour le remplissage initial (1 = tous les pixels)
 * ou { type, r } pour un nœud (1, 2, 4, 5) ; r = tangente avant,
 * ancre, tangente après, chacune « y puis x », en fraction de la hauteur / largeur du document.
 * blocks.vsmsFlags : drapeaux du tracé (bit 0 inversé, bit 1 non lié, bit 2 désactivé).
 * blocks.lmfx, blocks.lfxs : true si le calque a ces blocs d'effets (non décodés : voir shapes.js).
 */
(function (global) {
    'use strict';

    const SIMING = global.SIMING = global.SIMING || {};
    const HEADER_SIZE = 26;
    const PATH_RECORD_SIZE = 26;
    const FIXED_ONE = 1 << 24;       // virgule fixe 8.24 des tracés
    const BLOCK_SIGNATURES = { '8BIM': true, '8B64': true };
    const DEFAULT_GLOBAL_ANGLE = 120;     // degrés, lumière globale par défaut de Photoshop
    const DEFAULT_GLOBAL_ALTITUDE = 30;
    const RES_GLOBAL_ANGLE = 1037;        // ressources d'image : entier de 4 octets, en degrés
    const RES_GLOBAL_ALTITUDE = 1049;
    const HIDDEN_FLAG = 0x02;
    const RGB_MODE = 3;
    // Blocs d'un simple calque de pixels (nom, identifiant, réglages d'affichage, styles) : tout autre bloc
    // (texte, objet dynamique, réglage, remplissage, tracé…) et le calque n'est pas « de pixels unis ».
    const PLAIN_PIXEL_KEYS = {
        luni: true, lnsr: true, lyid: true, clbl: true, infx: true, knko: true, lspf: true, lclr: true,
        shmd: true, fxrp: true, lyvr: true, iOpa: true, lfx2: true, cust: true, tsly: true, brst: true, lmgm: true,
    };        // bit « calque invisible » des drapeaux d'un enregistrement

    /** Curseur de lecture : chaque lecteur avance de la taille lue. */
    function makeCursor(buffer, offset) {
        const bytes = buffer instanceof ArrayBuffer
            ? new Uint8Array(buffer)
            : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const c = { pos: offset || 0, size: bytes.byteLength };
        c.u8 = () => view.getUint8(c.pos++);
        c.u16 = () => { const v = view.getUint16(c.pos); c.pos += 2; return v; };
        c.i16 = () => { const v = view.getInt16(c.pos); c.pos += 2; return v; };
        c.u32 = () => { const v = view.getUint32(c.pos); c.pos += 4; return v; };
        c.i32 = () => { const v = view.getInt32(c.pos); c.pos += 4; return v; };
        c.f64 = () => { const v = view.getFloat64(c.pos); c.pos += 8; return v; };
        c.i64 = () => { const v = view.getBigInt64(c.pos); c.pos += 8; return Number(v); };
        c.skip = (n) => { c.pos += n; };
        c.ascii = (n) => {
            // Longueur lue dans un bloc abîmé : sans ce garde-fou, des milliards d'itérations.
            if (c.pos + n > c.size) throw new RangeError('Lecture hors du fichier (octet ' + c.pos + ')');
            let s = '';
            for (let i = 0; i < n; i++) s += String.fromCharCode(bytes[c.pos + i]);
            c.pos += n;
            return s;
        };
        /** Texte Unicode : nombre de caractères UTF-16, puis les caractères (gros-boutiste). */
        c.unicode = () => {
            const n = c.u32();
            let s = '';
            for (let i = 0; i < n; i++) s += String.fromCharCode(view.getUint16(c.pos + i * 2));
            c.pos += n * 2;
            return s.replace(/\0+$/, '');
        };
        /** Clé de descripteur : longueur puis texte ; longueur 0 = clé de 4 lettres. */
        c.key = () => { const n = c.u32(); return c.ascii(n === 0 ? 4 : n); };
        return c;
    }

    function readItem(c, type) {
        switch (type) {
            case 'Objc': case 'GlbO': return readObject(c);
            case 'VlLs': {
                const n = c.u32();
                const list = [];
                for (let i = 0; i < n; i++) list.push(readItem(c, c.ascii(4)));
                return list;
            }
            case 'doub': return c.f64();
            case 'UntF': { const unit = c.ascii(4); return { unit, v: c.f64() }; }
            case 'UnFl': {
                const unit = c.ascii(4);
                const n = c.u32();
                const values = [];
                for (let i = 0; i < n; i++) values.push(c.f64());
                return { unit, v: values };
            }
            case 'TEXT': return c.unicode();
            case 'enum': { const kind = c.key(); return { enum: kind, v: c.key() }; }
            case 'long': return c.i32();
            case 'comp': return c.i64();
            case 'bool': return c.u8() !== 0;
            case 'type': case 'GlbC': c.unicode(); return c.key();
            case 'tdta': { const n = c.u32(); c.skip(n); return null; }   // données brutes : ignorées
            default: throw new Error('Type de descripteur inconnu : ' + type + ' (octet ' + c.pos + ')');
        }
    }

    function readObject(c) {
        c.unicode();                              // nom, sans intérêt ici
        const out = { _class: c.key() };
        const n = c.u32();
        for (let i = 0; i < n; i++) {
            const key = c.key();
            out[key] = readItem(c, c.ascii(4));
        }
        return out;
    }

    /** Décode le descripteur qui commence à `offset` ; `end` = premier octet après lui. */
    function descriptor(buffer, offset) {
        const c = makeCursor(buffer, offset);
        const value = readObject(c);
        return { value, end: c.pos };
    }

    /** Tracé vectoriel (vsms, vmsk) : version (4), drapeaux (4), puis des enregistrements de 26 octets. */
    function readPath(c, end) {
        if (c.pos + 8 > end) return { flags: 0, records: [] };
        c.skip(4);
        const flags = c.u32();
        const records = [];
        while (c.pos + PATH_RECORD_SIZE <= end) {
            const start = c.pos;
            const type = c.u16();
            if (type === 1 || type === 2 || type === 4 || type === 5) {
                const r = [];
                for (let i = 0; i < 6; i++) r.push(c.i32() / FIXED_ONE);
                records.push({ type, r });
            } else if (type === 0 || type === 3) {
                // Enregistrement de longueur : nombre de nœuds (u16), puis l'opération booléenne
                // du sous-tracé (i16 : 1 combiner, 0 exclure, 2 soustraire, 3 intersecter, -1 inconnue).
                c.skip(2);
                records.push({ type, op: c.i16() });
            } else if (type === 8) {
                records.push({ type, fill: c.u16() });   // remplissage initial : 1 = tous les pixels
            }
            c.pos = start + PATH_RECORD_SIZE;
        }
        return { flags, records };
    }

    function artboardRect(d) {
        const r = d && d.artboardRect;
        if (!r) return null;
        return { left: r.Left, top: r['Top '], right: r.Rght, bottom: r.Btom };
    }

    /** Avance jusqu'après la prochaine signature de bloc (un bloc peut être suivi de 1 à 3 octets de remplissage). */
    function seekSignature(c, end) {
        while (c.pos + 12 <= end) {
            const at = c.pos;
            if (BLOCK_SIGNATURES[c.ascii(4)]) return true;
            c.pos = at + 1;
        }
        return false;
    }

    /**
     * Blocs additionnels d'un enregistrement de calque, de c.pos à `end`. Un bloc illisible
     * donne `undefined` (le calque reste importable sans lui).
     */
    function readBlocks(c, end) {
        const info = { name: null, id: null, divider: 0, artboard: null, hidden: false, blocks: { TySh: false, unreadable: [] } };
        const blocks = info.blocks;
        blocks.keys = [];
        const tryRead = (key, fn) => {
            try { return fn(); } catch (e) { blocks.unreadable.push(key); return undefined; }
        };
        while (c.pos + 12 <= end) {
            if (!seekSignature(c, end)) break;
            const key = c.ascii(4);
            const len = c.u32();
            const start = c.pos;
            const stop = start + len;
            blocks.keys.push(key);
            switch (key) {
                case 'luni': info.name = tryRead('luni', () => c.unicode()); break;
                case 'lyid': info.id = c.u32(); break;
                case 'lsct': case 'lsdk': info.divider = c.u32(); break;
                case 'TySh': blocks.TySh = true; break;
                case 'iOpa': blocks.iOpa = c.u8(); break;
                case 'vogk': case 'lfx2': c.skip(8); blocks[key] = tryRead(key, () => readObject(c)); break;
                case 'vstk': c.skip(4); blocks.vstk = tryRead('vstk', () => readObject(c)); break;
                case 'artb': c.skip(4); info.artboard = artboardRect(tryRead('artb', () => readObject(c))); break;
                case 'vscg':
                    blocks.vscg = tryRead('vscg', () => {
                        blocks.vscgKind = c.ascii(4);
                        c.skip(4);
                        return readObject(c);
                    });
                    break;
                case 'vsms': case 'vmsk':
                    blocks.vsms = tryRead('vsms', () => {
                        const p = readPath(c, stop);
                        blocks.vsmsFlags = p.flags;
                        return p.records;
                    });
                    break;
                // Effets multiples (plusieurs ombres…) : non décodés, leur présence suffit à laisser le calque en PSD.
                case 'lmfx': case 'lfxs': blocks[key] = true; break;
                default: break;
            }
            c.pos = stop;
        }
        return info;
    }

    function readRecord(c) {
        const top = c.i32(), left = c.i32(), bottom = c.i32(), right = c.i32();
        const channels = [];                      // canaux : identifiant (2) + taille des données (4)
        for (let n = c.u16(), i = 0; i < n; i++) channels.push({ id: c.i16(), length: c.u32() });
        c.skip(4);                                // signature « 8BIM »
        const blend = c.ascii(4);
        const opacity = c.u8();
        const clipped = c.u8() !== 0;             // détourage
        const flags = c.u8();
        c.skip(1);
        const extraEnd = c.u32() + c.pos;
        const maskSize = c.u32();                 // masque de calque (0 = aucun)
        c.skip(maskSize);
        c.skip(c.u32());                          // plages de fusion
        const nameLength = c.u8();
        const pascalName = c.ascii(nameLength);
        c.skip(((nameLength + 4) & ~3) - 1 - nameLength);   // nom rempli à un multiple de 4 octets
        const info = readBlocks(c, extraEnd);
        c.pos = extraEnd;
        return {
            id: info.id,
            name: info.name !== null && info.name !== undefined ? info.name : pascalName,
            box: { left, top, right, bottom },
            opacity,
            blend,
            hidden: (flags & HIDDEN_FLAG) !== 0,
            clipped,
            masked: maskSize > 0,
            divider: info.divider,
            artboard: info.artboard,
            blocks: info.blocks,
            channels,
        };
    }

    /** Fabrique l'arbre à partir des enregistrements, du bas vers le haut du fichier. */
    function buildTree(records) {
        const stack = [[]];
        for (const r of records) {
            if (r.divider === 3) { stack.push([]); continue; }          // fin de groupe : ses enfants suivent
            const layer = {
                id: r.id, name: r.name, box: r.box, opacity: r.opacity, blend: r.blend,
                hidden: r.hidden, clipped: r.clipped, masked: r.masked, kind: 'layer', artboard: r.artboard, blocks: r.blocks,
                uniform: r.uniform || null,
            };
            if (r.divider === 1 || r.divider === 2) {
                layer.kind = 'group';
                layer.children = stack.length > 1 ? stack.pop().reverse() : [];
            }
            stack[stack.length - 1].push(layer);
        }
        // Groupes non refermés (fichier abîmé) : leurs enfants remontent d'un cran.
        while (stack.length > 1) {
            const orphans = stack.pop();
            Array.prototype.push.apply(stack[stack.length - 1], orphans);
        }
        return stack[0].reverse();
    }

    /**
     * Angle et altitude globaux dans la section des ressources d'image (de c.pos à `end`) : suite de
     * « 8BIM, identifiant (2), nom Pascal rempli à un nombre pair, taille (4), données remplies à un
     * nombre pair ». Une section abîmée donne ce qu'on a pu lire, le reste prend la valeur par défaut.
     */
    function readGlobalLight(c, end) {
        const light = { globalAngle: DEFAULT_GLOBAL_ANGLE, globalAltitude: DEFAULT_GLOBAL_ALTITUDE };
        try {
            while (c.pos + 12 <= end) {
                if (c.ascii(4) !== '8BIM') break;
                const id = c.u16();
                const nameLength = c.u8();
                c.skip(nameLength + ((nameLength + 1) % 2));   // nom + octet de remplissage
                const size = c.u32();
                const next = c.pos + size + (size % 2);
                if (next > end) break;
                if (size === 4 && id === RES_GLOBAL_ANGLE) light.globalAngle = c.i32();
                if (size === 4 && id === RES_GLOBAL_ALTITUDE) light.globalAltitude = c.i32();
                c.pos = next;
            }
        } catch (e) { /* section abîmée : valeurs par défaut pour la suite */ }
        return light;
    }

    /**
     * Valeur unique d'un canal 8 bits (octets bruts ou PackBits) de `pixels` octets, ou null si le canal
     * n'est pas uni, compressé en zip, ou abîmé. data : de l'octet de compression à la fin du canal.
     */
    function uniformChannel(c, end, pixels, rows) {
        const compression = c.u16();
        let value = -1, seen = 0;
        const take = (v, n) => {
            if (value < 0) value = v;
            else if (v !== value) return false;
            seen += n;
            return true;
        };
        if (compression === 0) {
            if (end - c.pos < pixels) return null;
            for (let i = 0; i < pixels; i++) if (!take(c.u8(), 1)) return null;
        } else if (compression === 1) {
            c.skip(rows * 2);                         // taille de chaque ligne compressée
            while (c.pos < end && seen < pixels) {
                const n = c.u8();
                if (n < 128) {
                    for (let i = 0; i <= n; i++) if (!take(c.u8(), 1)) return null;
                } else if (n > 128) {
                    if (!take(c.u8(), 257 - n)) return null;
                }
            }
        } else {
            return null;
        }
        return seen === pixels ? value : null;
    }

    /**
     * Données des canaux, qui suivent les enregistrements dans le même ordre : r.uniform = [r, g, b] (0-1)
     * pour un calque de pixels d'une seule couleur, entièrement opaque sur sa boîte (alpha absent ou 255,
     * aucun autre canal). Seuls ces calques sont décodés, et s'arrêtent au premier pixel différent.
     */
    function readUniformColors(c, records) {
        for (const r of records) {
            const w = r.box.right - r.box.left, h = r.box.bottom - r.box.top;
            const plain = w > 0 && h > 0 && !r.divider && r.blocks.keys.every((k) => PLAIN_PIXEL_KEYS[k] === true);
            let rgb = plain ? [] : null;
            for (const ch of r.channels) {
                const next = c.pos + ch.length;
                if (rgb && ch.length >= 2) {
                    let v = null;
                    try { v = uniformChannel(c, next, w * h, h); } catch (e) { v = null; }
                    if (v === null || (ch.id === -1 && v !== 255) || ch.id < -1 || ch.id > 2) rgb = null;
                    else if (ch.id >= 0) rgb[ch.id] = v / 255;
                } else if (ch.id < -1 || ch.id > 2) {
                    rgb = null;
                }
                c.pos = next;
            }
            if (rgb && rgb[0] !== undefined && rgb[1] !== undefined && rgb[2] !== undefined) r.uniform = rgb;
        }
    }

    function read(buffer) {
        const c = makeCursor(buffer, 0);
        if (c.size < HEADER_SIZE || c.ascii(4) !== '8BPS') throw new Error('Ce fichier n\'est pas un PSD');
        const version = c.u16();
        if (version === 2) throw new Error('PSB non pris en charge');
        if (version !== 1) throw new Error('Version de PSD inconnue : ' + version);
        c.pos = 14;
        const height = c.u32();
        const width = c.u32();
        const depth = c.u16();
        const colorMode = c.u16();
        c.pos = HEADER_SIZE;
        c.skip(c.u32());                          // mode couleur
        const resourcesLength = c.u32();          // ressources d'image
        const resourcesEnd = c.pos + resourcesLength;
        const light = readGlobalLight(c, resourcesEnd);
        c.pos = resourcesEnd;
        const sectionLength = c.u32();            // calques et masques
        const layers = [];
        if (sectionLength > 0 && c.u32() > 0) {
            const count = Math.abs(c.i16());      // négatif : le premier canal alpha est la transparence
            const records = [];
            for (let i = 0; i < count; i++) records.push(readRecord(c));
            if (depth === 8 && colorMode === RGB_MODE) {
                try { readUniformColors(c, records); } catch (e) { /* données abîmées : aucun calque uni */ }
            }
            return Object.assign({ width, height }, light, { layers: buildTree(records) });
        }
        return Object.assign({ width, height }, light, { layers });
    }

    SIMING.psd = Object.assign(SIMING.psd || {}, { read, descriptor });
    if (typeof module !== 'undefined' && module.exports) module.exports = SIMING.psd;
})(typeof window !== 'undefined' ? window : globalThis);
