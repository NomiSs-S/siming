'use strict';
/* Libellés : fonctions pures du cœur hôte (mots, règles, nature des calques). */
const assert = require('assert');
const { loadHost, labelScene } = require('./helpers');

function core() {
    const h = loadHost();
    const tool = h.S.getTool('labels');
    if (!tool) throw new Error('outil hôte « labels » non chargé');
    return Object.assign(h, { core: tool._core });
}

module.exports = function (test) {
    test('libellés : mots entiers, sans accents ni majuscules, camelCase et chiffres séparés', () => {
        const { core: c } = core();
        assert.deepEqual(c.tokens('LOGO_client-02'), ['logo', 'client', '02']);
        assert.deepEqual(c.tokens('logoClient'), ['logo', 'client']);
        assert.deepEqual(c.tokens('Arrière-Plan  ÉTÉ'), ['arriere', 'plan', 'ete']);
        assert.deepEqual(c.tokens('BG2'), ['bg', '2']);
        assert.deepEqual(c.tokens(''), []);
        assert.deepEqual(c.tokens(null), []);
    });

    test('libellés : phrases d\'un mot-clé (virgules, points-virgules, extensions)', () => {
        const { core: c } = core();
        assert.deepEqual(c.parsePhrases('logo, .AI ; arrière-plan,, '), [
            { text: 'logo', tokens: ['logo'] },
            { text: '.AI', ext: 'ai' },
            { text: 'arrière-plan', tokens: ['arriere', 'plan'] },
        ]);
        assert.deepEqual(c.parsePhrases(' , ;'), []);
        assert.ok(c.containsPhrase(['mon', 'arriere', 'plan', 'bleu'], ['arriere', 'plan']));
        assert.ok(!c.containsPhrase(['plan', 'arriere'], ['arriere', 'plan']), 'ordre respecté');
    });

    test('libellés : classify, mots-clés avant la nature, dans l\'ordre, pluriel accepté', () => {
        const { core: c } = core();
        const rules = c.compileRules(null);
        const cls = (texts, type, ext) => c.classify({ type: type || 'image', texts, ext: ext || '' }, rules);
        assert.deepEqual(cls(['LOGO_client']), { rule: 'word:0', label: 9, reason: 'mot « logo »' });
        assert.deepEqual(cls(['Logos']), { rule: 'word:0', label: 9, reason: 'mot « logo »' }, 'pluriel');
        assert.deepEqual(cls(['logotype']), { rule: 'type:image', label: 11, reason: 'Image' }, 'mot entier seulement');
        assert.deepEqual(cls(['Fondu enchaîné']), { rule: 'type:image', label: 11, reason: 'Image' }, 'fondu n\'est pas fond');
        assert.deepEqual(cls(['Fonds marins']), { rule: 'word:1', label: 1, reason: 'mot « fond »' });
        assert.deepEqual(cls(['ciel', 'BG_02']), { rule: 'word:1', label: 1, reason: 'mot « bg »' }, 'n\'importe quel texte');
        assert.deepEqual(cls(['Logo sur fond']), { rule: 'word:0', label: 9, reason: 'mot « logo »' }, 'premier mot-clé gagnant');
        assert.deepEqual(cls(['Sans nom'], 'other'), { rule: 'type:other', label: -1, reason: 'Autre' }, 'Autre : ne pas changer');
        assert.deepEqual(cls([], 'text'), { rule: 'type:text', label: 2, reason: 'Texte' });
        const ext = c.compileRules({ words: [{ words: '.svg, picto', label: 5 }], types: {} });
        assert.deepEqual(c.classify({ type: 'image', texts: ['icone'], ext: 'svg' }, ext), { rule: 'word:0', label: 5, reason: 'extension « .svg »' });
        assert.strictEqual(c.classify({ type: 'image', texts: ['svg'], ext: 'png' }, ext).rule, 'type:image', 'extension : pas le nom');
    });

    test('libellés : normalizeRules complète et borne les règles', () => {
        const { core: c } = core();
        assert.deepEqual(c.normalizeRules(null), c.defaultRules());
        const r = c.normalizeRules({ words: [{ words: 'x', label: '3' }, null, { label: 2 }], types: { text: 99, shape: 0 } });
        assert.deepEqual(r.words, [{ words: 'x', label: 3 }, { words: '', label: 2 }]);
        assert.strictEqual(r.types.text, -1, 'hors plage = ne pas changer');
        assert.strictEqual(r.types.shape, 0, 'Aucune');
        assert.strictEqual(r.types.video, 13, 'absente = défaut');
        assert.deepEqual(c.normalizeRules({}).words, [], 'liste vide gardée');
        assert.strictEqual(c.TYPES.length, 12);
    });

    test('libellés : nature et textes lus sur les calques (source, fichier, dossiers, texte au nom automatique)', () => {
        const { core: c } = core();
        const { L, layer } = labelScene();
        const types = {};
        for (const k of Object.keys(L)) types[k] = c.layerType(layer(L[k]));
        assert.deepEqual(types, {
            title: 'text', textLogo: 'text', shape: 'shape', logo: 'image', brand: 'image', sky: 'image',
            video: 'video', solid: 'solid', nul: 'nullLayer', adjust: 'adjustment', audio: 'audio',
            precomp: 'precomp', camera: 'camera',
        });
        assert.deepEqual(c.layerInfo(layer(L.title)), { type: 'text', texts: [], ext: '' }, 'nom automatique : texte affiché ignoré');
        assert.deepEqual(c.layerInfo(layer(L.textLogo)).texts, ['Logo animé'], 'nom donné à la main');
        assert.deepEqual(c.layerInfo(layer(L.brand)), { type: 'image', texts: ['marque.png', 'marque.png', 'marque', 'Logos'], ext: 'png' });
        assert.deepEqual(c.layerInfo(layer(L.precomp)).texts, ['Scène 1', 'Scène 1']);
        assert.strictEqual(c.autoTextName(layer(L.textLogo)), false);
        L.title.text = 'Titre principal\rsur deux lignes';
        assert.strictEqual(c.autoTextName(layer(L.title)), true, 'début du texte');
    });
};
