'use strict';
/* JSON maison du cœur hôte : compatible avec le JSON natif, robuste aux caractères spéciaux. */
const assert = require('assert');
const { loadHost } = require('./helpers');

const SAMPLE = {
    texte: 'Été « guillemets » "doubles" \'simples\' \\ antislash',
    lignes: 'ligne 1\nligne 2\r\ttab',
    controle: 'a\u0001b\u001fc',
    emoji: 'calque 🎬',
    nombres: [0, -3, 1.5, -0.25, 1e21, 2.5e-7],
    booleens: [true, false],
    vide: null,
    imbrique: { a: [{ b: { c: [] } }], d: {} },
};

module.exports = function (test) {
    test('json : stringify produit le même texte que JSON natif', () => {
        const { S } = loadHost();
        assert.strictEqual(S.json.stringify(SAMPLE), JSON.stringify(SAMPLE));
    });

    test('json : aller-retour parse(stringify) et compatibilité avec JSON natif', () => {
        const { S } = loadHost();
        assert.deepEqual(S.json.parse(S.json.stringify(SAMPLE)), SAMPLE);
        assert.deepEqual(S.json.parse(JSON.stringify(SAMPLE)), SAMPLE);
        assert.deepEqual(JSON.parse(S.json.stringify(SAMPLE)), SAMPLE);
    });

    test('json : stringify ignore undefined et les fonctions, NaN devient null', () => {
        const { S } = loadHost();
        assert.strictEqual(S.json.stringify({ a: undefined, f: function () {}, n: NaN, i: Infinity, b: 1 }), '{"n":null,"i":null,"b":1}');
        assert.strictEqual(S.json.stringify(undefined), 'null');
    });

    test('json : parse lit \\u, espaces et valeurs simples', () => {
        const { S } = loadHost();
        assert.strictEqual(S.json.parse('"\\u00e9t\\u00E9"'), 'été');
        assert.deepEqual(S.json.parse(' { "a" : [ 1 , true , null ] } '), { a: [1, true, null] });
        assert.strictEqual(S.json.parse('-12.5e2'), -1250);
    });

    test('json : parse refuse un texte invalide avec un message clair', () => {
        const { S } = loadHost();
        for (const bad of ['{"a":}', '{"a":1} x', '"non terminé', '[1,]', '{a:1}', 'tru', '"\\x"']) {
            assert.throws(() => S.json.parse(bad), /JSON invalide/, bad);
        }
    });
};
