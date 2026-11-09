'use strict';
/* Manifeste CEP généré depuis tools.json, scripts d'installation de développement. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
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
        assert.deepEqual(ids, ['com.siming.hub', 'com.siming.tool.unparent', 'com.siming.tool.ancre', 'com.siming.mcp']);
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
        for (const e of dispatch) {
            const params = Array.from(e.querySelectorAll('CEFCommandLine > Parameter')).map((p) => p.textContent);
            assert.deepEqual(params, ['--allow-file-access-from-files', '--allow-file-access', '--enable-nodejs'], 'Node pour le presse-papier (Boîte à outils)');
        }
    });

    test('manifeste : service Claude Code invisible, sans menu, lancé avec After Effects', () => {
        const doc = parseXml(M.buildManifest(LIST));
        const svc = Array.from(doc.querySelectorAll('DispatchInfoList > Extension')).find((e) => e.getAttribute('Id') === 'com.siming.mcp');
        assert.ok(svc, 'extension com.siming.mcp');
        assert.strictEqual(svc.querySelector('MainPath').textContent, './client/claude.html');
        assert.strictEqual(svc.querySelector('AutoVisible').textContent, 'false');
        assert.strictEqual(svc.querySelector('UI > Type').textContent, 'Custom');
        assert.strictEqual(svc.querySelector('Menu'), null, 'absent de Fenêtre › Extensions');
        const events = Array.from(svc.querySelectorAll('StartOn > Event')).map((e) => e.textContent);
        assert.ok(events.includes('com.adobe.csxs.events.ApplicationActivate') && events.includes('applicationActivate'));
        assert.ok(fs.existsSync(path.join(ROOT, 'extension', 'client', 'claude.html')));
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

    test('dev-install macOS : debug CEP, manifeste, copie par défaut, lien en option', () => {
        const cmd = fs.readFileSync(path.join(ROOT, 'tools', 'dev-install.command'), 'utf8');
        assert.ok(cmd.startsWith('#!/bin/bash\n'));
        assert.ok(/defaults write "com\.adobe\.CSXS\.\$v" PlayerDebugMode 1/.test(cmd));
        assert.ok(/node tools\/manifest\.js/.test(cmd));
        assert.ok(/cp -R "\$SRC"/.test(cmd), 'copie sur le disque interne (le dépôt est sur un disque externe)');
        assert.ok(/if \[ "\$1" = "--link" \]; then\n  ln -s/.test(cmd), 'lien seulement sur demande');
        assert.ok(cmd.includes("-name '._*'"), 'fichiers « ._ » de macOS retirés de la copie');
        assert.ok(!/\r/.test(cmd), 'fins de ligne Unix');
        const bash = spawnSync('bash', ['-n'], { input: cmd, encoding: 'utf8' });
        if (!bash.error) assert.strictEqual(bash.status, 0, 'syntaxe bash : ' + bash.stderr);
    });

    test('dev-install macOS : remplace un lien cassé ou une copie marquée, respecte tout autre SIMING', function () {
        if (process.platform !== 'darwin') return;   // script macOS (cp, xattr, mktemp)
        const os = require('os');
        const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'siming-cep-'));
        const target = path.join(dest, 'com.siming');
        const run = (args) => spawnSync('bash', [path.join(ROOT, 'tools', 'dev-install.command')].concat(args || []),
            { encoding: 'utf8', env: Object.assign({}, process.env, { SIMING_CEP_DIR: dest }) });
        const probe = path.join(ROOT, 'extension', 'client', '._probe.txt');   // comme macOS sur un disque exFAT
        fs.writeFileSync(probe, 'x');
        try {
            fs.symlinkSync('/Volumes/EXT 11/PERSO/SIMING/extension', target);   // ancien lien, disque renommé
            let r = run();
            assert.strictEqual(r.status, 0, r.stderr + r.stdout);
            assert.ok(!fs.lstatSync(target).isSymbolicLink() && fs.statSync(target).isDirectory(), 'vrai dossier');
            assert.ok(fs.existsSync(path.join(target, 'CSXS', 'manifest.xml')));
            assert.ok(fs.existsSync(path.join(target, 'host', 'siming.jsx')));
            assert.ok(fs.existsSync(path.join(target, '.siming-dev')));
            assert.ok(!fs.existsSync(path.join(target, 'client', '._probe.txt')), '« ._ » non copié');
            assert.ok(/SIMING \d+\.\d+\.\d+ copié/.test(r.stdout));
            r = run();
            assert.strictEqual(r.status, 0, 'copie marquée remplacée : ' + r.stdout);
            fs.unlinkSync(path.join(target, '.siming-dev'));
            r = run();
            assert.notStrictEqual(r.status, 0, 'SIMING venu d\'ailleurs : rien n\'est fait');
            assert.ok(fs.existsSync(path.join(target, 'CSXS', 'manifest.xml')), 'laissé intact');
            fs.writeFileSync(path.join(target, '.siming-dev'), '');
            r = run(['--link']);
            assert.strictEqual(r.status, 0, r.stdout);
            assert.strictEqual(fs.readlinkSync(target), path.join(ROOT, 'extension'));
        } finally {
            fs.rmSync(probe, { force: true });
            fs.rmSync(dest, { recursive: true, force: true });
        }
    });
};
