'use strict';
/* Boîte à outils : fonctions pures du cœur hôte (formats, créneaux, couleurs, PNG, presse-papier). */
const assert = require('assert');
const { loadHost, app } = require('./helpers');

function core() {
    const h = loadHost();
    const tool = h.S.getTool('toolbox');
    if (!tool) throw new Error('outil hôte « toolbox » non chargé');
    return Object.assign(h, { c: tool._core });
}
const list = (a) => Array.from(a);

module.exports = function (test) {
    test('boîte à outils : formatSize garde le plus petit côté, l\'autre arrondi au pair', () => {
        const { c } = core();
        assert.deepEqual(list(c.formatSize(1920, 1080, '16:9')), [1920, 1080]);
        assert.deepEqual(list(c.formatSize(1920, 1080, '9:16')), [1080, 1920]);
        assert.deepEqual(list(c.formatSize(1920, 1080, '4:5')), [1080, 1350]);
        assert.deepEqual(list(c.formatSize(1920, 1080, '1:1')), [1080, 1080]);
        assert.deepEqual(list(c.formatSize(1080, 1920, '16:9')), [1920, 1080]);
        assert.deepEqual(list(c.formatSize(3840, 2160, '4:5')), [2160, 2700]);
        assert.deepEqual(list(c.formatSize(1000, 1000, '16:9')), [1778, 1000], '1777,8 -> 1778 (pair)');
        assert.strictEqual(c.formatSize(1920, 1080, '21:9'), null);
    });

    test('boîte à outils : formatOf reconnaît les quatre formats, à 1 % près', () => {
        const { c } = core();
        assert.strictEqual(c.formatOf(1920, 1080), '16:9');
        assert.strictEqual(c.formatOf(1778, 1000), '16:9');
        assert.strictEqual(c.formatOf(1080, 1350), '4:5');
        assert.strictEqual(c.formatOf(1000, 1000), '1:1');
        assert.strictEqual(c.formatOf(1080, 1920), '9:16');
        assert.strictEqual(c.formatOf(1280, 1024), null);
        assert.strictEqual(c.formatOf(0, 1080), null);
    });

    test('boîte à outils : créneaux en cascade, inverse, par paquets, au hasard', () => {
        const { c } = core();
        assert.deepEqual(list(c.slots(5, 'cascade', 1)), [0, 1, 2, 3, 4]);
        assert.deepEqual(list(c.slots(5, 'cascade', 2)), [0, 0, 1, 1, 2], 'paquets de 2');
        assert.deepEqual(list(c.slots(5, 'reverse', 1)), [4, 3, 2, 1, 0]);
        assert.deepEqual(list(c.slots(5, 'reverse', 2)), [2, 1, 1, 0, 0]);
        assert.deepEqual(list(c.slots(3, 'cascade', 0)), [0, 1, 2], 'paquet invalide = 1');
        const seq = [0.9, 0.1, 0.5, 0.3];
        let i = 0;
        const rand = () => seq[i++ % seq.length];
        const r = list(c.slots(5, 'random', 1, rand));
        assert.deepEqual(r.slice().sort(), [0, 1, 2, 3, 4], 'une permutation : écart toujours régulier');
        assert.deepEqual(r, [2, 3, 1, 0, 4], 'Fisher-Yates avec ce tirage');
        const big = list(c.slots(6, 'random', 3, Math.random));
        assert.deepEqual(big.slice().sort(), [0, 0, 0, 1, 1, 1], 'paquets de 3 au hasard');
    });

    test('boîte à outils : départs visés depuis le plus tôt', () => {
        const { c } = core();
        const t = list(c.sequenceTargets([1, 0.5, 2], [0, 1, 2], 0.08));
        assert.ok(Math.abs(t[0] - 0.5) < 1e-9 && Math.abs(t[1] - 0.58) < 1e-9 && Math.abs(t[2] - 0.66) < 1e-9, t.join(' '));
    });

    test('boîte à outils : couleurs hexadécimales et en-tête PNG', () => {
        const { c } = core();
        assert.deepEqual(list(c.hexToRgb('#336699')), [0.2, 0.4, 0.6]);
        assert.deepEqual(list(c.hexToRgb('ff0000')), [1, 0, 0]);
        assert.strictEqual(c.hexToRgb('#12345'), null);
        assert.strictEqual(c.rgbToHex([0.2, 0.4, 0.6]), '#336699');
        assert.strictEqual(c.rgbToHex([2, -1, 0.5]), '#FF0080', 'bornes');
        const head = '\x89PNG\r\n\x1a\n\x00\x00\x00\x0dIHDR\x00\x00\x07\x80\x00\x00\x04\x38\x08\x06';
        assert.deepEqual(Object.assign({}, c.pngSize(head)), { width: 1920, height: 1080 });
        assert.strictEqual(c.pngSize('GIF89a' + head.slice(6)), null);
        assert.strictEqual(c.pngSize('court'), null);
    });

    test('boîte à outils : programme du presse-papier (Windows, macOS) et ligne de commande', () => {
        const { c } = core();
        const win = c.clipboardProgram(false, "C:\\Users\\l'atelier\\Temp\\SIMING\\frame-1.png");
        assert.strictEqual(win.file, 'powershell.exe');
        assert.ok(list(win.args).includes('-STA'), 'presse-papier Windows : STA obligatoire');
        const ps = win.args[win.args.length - 1];
        assert.ok(ps.includes("'C:\\Users\\l''atelier\\Temp\\SIMING\\frame-1.png'"), 'apostrophe doublée : ' + ps);
        assert.ok(/SetData\('PNG'/.test(ps) && /SetDataObject\(\$d,\$true\)/.test(ps));
        assert.ok(!ps.includes('"'), 'aucun guillemet double : la commande tient dans "…" pour cmd');
        assert.ok(c.shellCommand(win, false).startsWith('powershell.exe -NoProfile -NonInteractive -STA -WindowStyle Hidden -Command "Add-Type'));
        const mac = c.clipboardProgram(true, "/Users/l'atelier/frame-2.png");
        assert.deepEqual(list(mac.args).slice(0, 3), ['-l', 'JavaScript', '-e']);
        assert.ok(mac.args[3].includes('initWithContentsOfFile("/Users/l\'atelier/frame-2.png")'), mac.args[3]);
        const sh = c.shellCommand(mac, true);
        assert.ok(sh.startsWith("osascript -l JavaScript -e 'ObjC.import"), sh);
        assert.ok(sh.includes("/Users/l'\\''atelier/"), 'apostrophe fermée-échappée-rouverte pour sh : ' + sh);
    });

    test('boîte à outils : montrer un fichier (Explorateur, Finder), noms de frame et de déclinaison', () => {
        const { c } = core();
        const win = c.revealProgram(false, 'C:\\Projets\\l\'atelier\\Frames\\Pub_00012.png');
        assert.deepEqual(Object.assign({}, win, { args: list(win.args) }), { file: 'explorer.exe', args: ['/select,', 'C:\\Projets\\l\'atelier\\Frames\\Pub_00012.png'], anyExit: true });
        assert.strictEqual(c.shellCommand(win, false), 'explorer.exe /select, "C:\\Projets\\l\'atelier\\Frames\\Pub_00012.png"');
        const mac = c.revealProgram(true, '/Users/simon/Pub.png');
        assert.deepEqual(list(mac.args), ['-R', '/Users/simon/Pub.png']);
        assert.strictEqual(c.shellCommand(mac, true), "open -R '/Users/simon/Pub.png'");
        assert.strictEqual(c.safeName('Pub: v2/final?'), 'Pub_ v2_final_');
        assert.strictEqual(c.safeName('  .  '), 'Composition');
        assert.strictEqual(c.frameFileName('Pub', 12.0000001), 'Pub_00012.png');
        assert.strictEqual(c.frameFileName('Long', 123456), 'Long_123456.png');
        assert.strictEqual(c.variantName('Pub', '9:16'), 'Pub 9x16');
        assert.strictEqual(c.variantName('Pub 16x9', '1:1'), 'Pub 1x1', 'suffixe de format remplacé');
        assert.strictEqual(c.variantName('Pub 2', '4:5'), 'Pub 2 4x5');
        assert.deepEqual(list(c.otherFormats('16:9')), ['4:5', '1:1', '9:16']);
        assert.deepEqual(list(c.otherFormats(null)), ['16:9', '4:5', '1:1', '9:16']);
    });

    test('boîte à outils : zone de travail bornée, échantillons allégés, secondes', () => {
        const { c } = core();
        assert.deepEqual(Object.assign({}, c.workAreaFor(1, 4, 10, 0.04)), { start: 1, duration: 3 });
        assert.deepEqual(Object.assign({}, c.workAreaFor(-2, 12, 10, 0.04)), { start: 0, duration: 10 }, 'bornée à la comp');
        assert.strictEqual(c.workAreaFor(11, 12, 10, 0.04), null, 'hors de la comp');
        const thin = c.thinSamples([0, 1, 2, 3, 4, 5], [5, 5, 5, 7, 7, [1]]);
        assert.deepEqual([list(thin.times), list(thin.values)], [[0, 2, 3, 4, 5], [5, 5, 7, 7, [1]]], 'valeur égale à ses deux voisines retirée');
        const arr = c.thinSamples([0, 1, 2, 3], [[1, 2], [1, 2], [1, 2], [1, 3]]);
        assert.deepEqual(list(arr.times), [0, 2, 3]);
        const other = c.thinSamples([0, 1, 2], [{ text: 'a' }, { text: 'a' }, { text: 'a' }]);
        assert.strictEqual(other.times.length, 3, 'objets (texte) : tout gardé');
        assert.strictEqual(c.seconds(2.4), '2,40 s');
        assert.strictEqual(c.seconds(0), '0,00 s');
    });

    test('boîte à outils : préférence « écrire des fichiers » lue si elle existe', () => {
        const { c } = core();
        assert.strictEqual(c.writeAllowed(), null, 'absente : inconnue');
        app.preferences.scriptWrite = true;
        assert.strictEqual(c.writeAllowed(), true);
        app.preferences.scriptWrite = false;
        assert.strictEqual(c.writeAllowed(), false);
    });

    test('boîte à outils : commandId essaie les noms puis le repli', () => {
        const { c } = core();
        assert.strictEqual(c.commandId(['Inconnu', 'Convert to Editable Text'], 1), 3799);
        app.menuNames = {};
        assert.strictEqual(c.commandId(['Convert to Editable Text'], 0), 0, 'AE dans une autre langue : 0, rien ne sera lancé');
        assert.strictEqual(c.commandId(['Reveal Layer Source in Project'], 0), 0);
    });
};
