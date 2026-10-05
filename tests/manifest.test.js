'use strict';
/* Manifeste CEP généré depuis tools.json, scripts d'installation de développement. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./helpers');
const M = require('../tools/manifest');

const LIST = {
    version: '1.2.0', repository: 'simon/siming',
    tools: [
        { id: 'unparent', name: 'Unparent', icon: 'delier', version: '2.0.0', script: 'tools/unparent.js' },
        { id: 'ancre', name: 'Ancre & point', icon: 'ancre', version: '1.0.0', script: 'tools/ancre.js' },
    ],
};

function parseXml(xml) {
    const { JSDOM } = require('jsdom');
    const doc = new (new JSDOM('').window.DOMParser)().parseFromString(xml, 'application/xml');
    assert.strictEqual(doc.getElementsByTagName('parsererror').length, 0, 'XML mal formé');
    return doc;
}

module.exports = function (test) {
    test('manifeste : bundle, hub et un panneau par outil, version unique', () => {
        const doc = parseXml(M.buildManifest(LIST));
        const root = doc.documentElement;
        assert.strictEqual(root.getAttribute('ExtensionBundleId'), 'com.siming');
        assert.strictEqual(root.getAttribute('ExtensionBundleVersion'), '1.2.0');
        assert.strictEqual(root.getAttribute('ExtensionBundleName'), 'SIMING');
        const ids = Array.from(doc.querySelectorAll('ExtensionList > Extension')).map((e) => e.getAttribute('Id'));
        assert.deepEqual(ids, ['com.siming.hub', 'com.siming.tool.unparent', 'com.siming.tool.ancre']);
        for (const e of doc.querySelectorAll('ExtensionList > Extension')) assert.strictEqual(e.getAttribute('Version'), '1.2.0');
    });

    test('manifeste : pages, script hôte, menus, hôte AE et runtime', () => {
        const doc = parseXml(M.buildManifest(LIST));
        const dispatch = Array.from(doc.querySelectorAll('DispatchInfoList > Extension'));
        const byId = (id) => dispatch.find((e) => e.getAttribute('Id') === id);
        assert.strictEqual(byId('com.siming.hub').querySelector('MainPath').textContent, './client/index.html');
        assert.strictEqual(byId('com.siming.tool.unparent').querySelector('MainPath').textContent, './client/tool.html');
        for (const e of dispatch) assert.strictEqual(e.querySelector('ScriptPath').textContent, './host/siming.jsx');
        assert.strictEqual(byId('com.siming.hub').querySelector('Menu').textContent, 'SIMING');
        assert.strictEqual(byId('com.siming.tool.ancre').querySelector('Menu').textContent, 'SIMING – Ancre & point');
        assert.strictEqual(doc.querySelector('Host').getAttribute('Name'), 'AEFT');
        assert.strictEqual(doc.querySelector('Host').getAttribute('Version'), '[' + M.MIN_AE + ',99.9]');
        assert.strictEqual(doc.querySelector('RequiredRuntime').getAttribute('Version'), M.CSXS);
    });

    test('manifeste : tools.json invalide refusé avec un message clair', () => {
        const bad = (patch) => Object.assign({}, LIST, patch);
        assert.throws(() => M.validate(bad({ version: '1.2' })), /version invalide/);
        assert.throws(() => M.validate(bad({ tools: [LIST.tools[0], LIST.tools[0]] })), /en double/);
        assert.throws(() => M.validate(bad({ tools: [Object.assign({}, LIST.tools[0], { id: 'Mauvais Id' })] })), /id d'outil invalide/);
        assert.throws(() => M.validate(bad({ tools: [Object.assign({}, LIST.tools[0], { script: '' })] })), /« script » manquant/);
    });

    test('manifeste : writeManifest écrit le fichier depuis le vrai tools.json', () => {
        const xml = M.writeManifest();
        assert.strictEqual(fs.readFileSync(M.MANIFEST, 'utf8'), xml);
        assert.strictEqual(xml, M.buildManifest(M.readList()));
        parseXml(xml);
    });

    test('dev-install Windows : debug CEP, manifeste, jonction, ASCII', () => {
        const bat = fs.readFileSync(path.join(ROOT, 'tools', 'dev-install.bat'), 'utf8');
        assert.ok(/PlayerDebugMode/.test(bat));
        assert.ok(/CSXS\.%%V/.test(bat) && /\(11 12\)/.test(bat));
        assert.ok(/node tools\\manifest\.js/.test(bat));
        assert.ok(/mklink \/J/.test(bat) && /com\.siming/.test(bat));
        assert.ok(/^[\x00-\x7F]*$/.test(bat), 'console Windows : ASCII uniquement');
    });

    test('dev-install macOS : debug CEP, manifeste, lien symbolique', () => {
        const cmd = fs.readFileSync(path.join(ROOT, 'tools', 'dev-install.command'), 'utf8');
        assert.ok(cmd.startsWith('#!/bin/bash\n'));
        assert.ok(/defaults write "com\.adobe\.CSXS\.\$v" PlayerDebugMode 1/.test(cmd));
        assert.ok(/node tools\/manifest\.js/.test(cmd));
        assert.ok(/ln -s/.test(cmd) && /com\.siming/.test(cmd));
        assert.ok(!/\r/.test(cmd), 'fins de ligne Unix');
    });
};
