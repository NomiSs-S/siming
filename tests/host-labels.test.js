'use strict';
/* Couleurs d'étiquettes After Effects : lecture des préférences, repli sur les couleurs par défaut. */
const assert = require('assert');
const { loadHost, app } = require('./helpers');

module.exports = function (test) {
    test('parseLabelPref : 4 octets ARGB, 8 chiffres hex, formes inconnues', () => {
        const { S } = loadHost();
        assert.strictEqual(S.parseLabelPref(String.fromCharCode(0xFF, 0xB5, 0x38, 0x38)), '#B53838');
        assert.strictEqual(S.parseLabelPref('FFB53838'), '#B53838');
        assert.strictEqual(S.parseLabelPref('ffe4d84c'), '#E4D84C');
        assert.strictEqual(S.parseLabelPref(String.fromCharCode(0xFF, 0x20AC, 0x38, 0x38)), null, 'octet mal décodé');
        assert.strictEqual(S.parseLabelPref(''), null);
        assert.strictEqual(S.parseLabelPref('FFB5"88"'), null, 'forme du fichier de préférences');
        assert.strictEqual(S.parseLabelPref(undefined), null);
    });

    test('labelColor : préférences lues en BINARY, encodage restauré', () => {
        const { S, sandbox } = loadHost();
        sandbox.$.appEncoding = 'UTF-8';
        app.preferences.labels[1] = 'FF112233';         // étiquette n° 2 personnalisée
        assert.strictEqual(S.ae.labelColor(2), '#112233');
        assert.strictEqual(S.ae.labelColor(1), '#B53838');
        assert.strictEqual(S.ae.labelColor('16'), '#1E401E');
        assert.strictEqual(sandbox.$.appEncoding, 'UTF-8', 'encodage rendu après lecture');
        assert.deepEqual(app.preferences.reads, ['Label Color ID 2 # 2', 'Label Color ID 2 # 1', 'Label Color ID 2 # 16']);
    });

    test('labelColor : 0 (aucune) et hors plage -> null', () => {
        const { S } = loadHost();
        assert.strictEqual(S.ae.labelColor(0), null);
        assert.strictEqual(S.ae.labelColor(17), null);
        assert.strictEqual(S.ae.labelColor(-1), null);
        assert.strictEqual(S.ae.labelColor(undefined), null);
    });

    test('labelColor : sans préférences lisibles -> couleurs par défaut d\'After Effects', () => {
        const { S } = loadHost();
        app.preferences = null;
        assert.strictEqual(S.ae.labelColor(2), '#E4D84C');
        app.preferences = { havePref: () => true, getPrefAsString: () => { throw new Error('boom'); } };
        assert.strictEqual(S.ae.labelColor(9), '#4AA44C');
        app.preferences = { havePref: () => true, getPrefAsString: () => 'n\'importe quoi' };
        assert.strictEqual(S.ae.labelColor(3), '#A9CBC7');
        app.preferences = { havePref: () => false, getPrefAsString: () => { throw new Error('jamais appelé'); } };
        assert.strictEqual(S.ae.labelColor(16), '#1E401E');
    });
};
