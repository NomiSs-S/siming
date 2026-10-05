'use strict';
/* Chaque .jsx de extension/host : BOM présent, compile, aucune construction hors ES3. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { EXT } = require('./helpers');

function jsxFiles(dir, out) {
    if (!fs.existsSync(dir)) return out;
    for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        if (fs.statSync(full).isDirectory()) jsxFiles(full, out);
        else if (/\.jsx$/i.test(name)) out.push(full);
    }
    return out;
}

// Interdits ES3 (cf. CLAUDE.md). Les commentaires sont retirés avant la recherche.
const FORBIDDEN = [
    [/=>/, 'fonction fléchée'],
    [/\blet\s/, 'let'],
    [/\bconst\s/, 'const'],
    [/\.forEach\(/, 'forEach'],
    [/\.map\(/, 'map'],
    [/\.filter\(/, 'filter'],
    [/\.indexOf\(/, 'indexOf'],
    [/\.trim\(/, 'trim'],
    [/\bJSON\./, 'JSON natif'],
    [/Object\.keys/, 'Object.keys'],
];

function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

module.exports = function (test) {
    test('syntaxe : les .jsx de extension/host ont un BOM, compilent et restent en ES3', () => {
        const files = jsxFiles(path.join(EXT, 'host'), []);
        assert.ok(files.length >= 1, 'aucun .jsx trouvé');
        for (const f of files) {
            const buf = fs.readFileSync(f);
            assert.ok(buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF, 'BOM manquant : ' + f + ' (node tools/add-bom.js)');
            const src = buf.toString('utf8').replace(/^﻿/, '');
            new vm.Script(src, { filename: f });
            const code = stripComments(src);
            for (const [re, label] of FORBIDDEN) {
                assert.ok(!re.test(code), label + ' interdit en ES3 dans ' + path.basename(f));
            }
        }
    });
};
