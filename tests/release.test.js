'use strict';
/* Zip « store », installeurs (modèles remplis), contrôles de la publication. */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { zip, crc32 } = require('../tools/zip');
const R = require('../tools/release');
const M = require('../tools/manifest');

const LIST = { version: '1.0.0', repository: 'simon/siming', tools: [] };

/** Lecture minimale d'un zip « store » : [{ name, data, mode }]. */
function readZip(buf) {
    const eocd = buf.length - 22;
    assert.strictEqual(buf.readUInt32LE(eocd), 0x06054b50, 'fin de répertoire central');
    const count = buf.readUInt16LE(eocd + 10);
    let p = buf.readUInt32LE(eocd + 16);
    const out = [];
    for (let i = 0; i < count; i++) {
        assert.strictEqual(buf.readUInt32LE(p), 0x02014b50);
        const size = buf.readUInt32LE(p + 20);
        const nameLen = buf.readUInt16LE(p + 28);
        const mode = (buf.readUInt32LE(p + 38) >>> 16) & 0o777;
        const local = buf.readUInt32LE(p + 42);
        const name = buf.slice(p + 46, p + 46 + nameLen).toString('utf8');
        assert.strictEqual(buf.readUInt32LE(local), 0x04034b50);
        const localName = buf.readUInt16LE(local + 26);
        const data = buf.slice(local + 30 + localName, local + 30 + localName + size);
        assert.strictEqual(buf.readUInt32LE(local + 14), crc32(data), 'CRC');
        out.push({ name, data, mode });
        p += 46 + nameLen;
    }
    return out;
}

module.exports = function (test) {
    test('zip : crc32 de référence', () => {
        assert.strictEqual(crc32(Buffer.from('123456789')), 0xCBF43926);
    });

    test('zip : contenu, noms UTF-8 et droits exécutables conservés', () => {
        const buf = zip([
            { name: 'SIMING-Installer.command', data: Buffer.from('#!/bin/bash\necho é\n'), mode: 0o755 },
            { name: 'LISEZ-MOI.txt', data: Buffer.from('notice'), mode: 0o644 },
        ]);
        const files = readZip(buf);
        assert.deepEqual(files.map((f) => f.name), ['SIMING-Installer.command', 'LISEZ-MOI.txt']);
        assert.strictEqual(files[0].mode, 0o755);
        assert.strictEqual(files[1].mode, 0o644);
        assert.strictEqual(files[0].data.toString(), '#!/bin/bash\necho é\n');
    });

    test('installeur Windows : dépôt rempli, CRLF, ASCII, UPIA et API GitHub', () => {
        const { bat } = R.installers(LIST);
        assert.ok(!bat.includes('__REPO__'));
        assert.ok(bat.includes("$Repo = 'simon/siming'"));
        assert.ok(!/[^\r]\n/.test(bat), 'CRLF partout');
        assert.ok(/^[\x00-\x7F]*$/.test(bat), 'console Windows : ASCII uniquement');
        assert.ok(bat.includes('#POWERSHELL#'));
        assert.ok(bat.includes('https://api.github.com/repos/$Repo/releases'));
        assert.ok(bat.includes('UnifiedPluginInstallerAgent.exe') && bat.includes('/install'));
        assert.ok(bat.includes('AfterFX'));
    });

    test('installeur Windows : chemin par variable, pré-versions exclues, erreurs rattrapées', () => {
        const { bat } = R.installers(LIST);
        assert.ok(bat.includes('set "SIMING_SELF=%~f0"'), 'chemin passé par une variable');
        assert.ok(bat.includes('$env:SIMING_SELF'));
        assert.ok(!bat.includes("'%~f0'"), 'pas de %~f0 entre apostrophes (dossier avec apostrophe)');
        assert.ok(bat.includes('$r.prerelease'), 'pré-versions exclues');
        assert.ok(bat.includes('releases?per_page=100'));
        assert.ok(bat.includes("$ProgressPreference = 'SilentlyContinue'"));
        assert.ok(bat.includes('Telechargement impossible'));
        assert.ok(/try \{[^]*& \$upia \/install/.test(bat), 'appel UPIA dans un try');
    });

    test('installeur macOS : dépôt rempli, LF, bash, UPIA et API GitHub', () => {
        const { cmd } = R.installers(LIST);
        assert.ok(cmd.startsWith('#!/bin/bash\n'));
        assert.ok(!cmd.includes('\r'));
        assert.ok(cmd.includes('REPO="simon/siming"'));
        assert.ok(cmd.includes('https://api.github.com/repos/$REPO/releases'));
        assert.ok(cmd.includes('UnifiedPluginInstallerAgent') && cmd.includes('--install'));
        assert.ok(cmd.includes('osascript -l JavaScript'));
        assert.ok(cmd.includes('if (r.prerelease) return;'), 'pré-versions exclues');
        assert.ok(cmd.includes('releases?per_page=100'));
    });

    test('ZXPSignCmd en échec : code affiché, mot de passe jamais repris', () => {
        let err = null;
        try {
            R.runZxpSign(process.execPath, ['-e', 'process.exit(3)', 'SECRETPWD']);
        } catch (e) {
            err = e;
        }
        assert.ok(err, 'erreur levée');
        assert.ok(/code 3/.test(err.message), err.message);
        assert.ok(!err.message.includes('SECRETPWD'));
        assert.ok(!String(err.stack).includes('SECRETPWD'));
    });

    test('writeInstallers : .bat et zip macOS exécutable dans le dossier donné', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'siming-dist-'));
        R.writeInstallers(LIST, dir);
        assert.ok(fs.existsSync(path.join(dir, 'SIMING-Installer-Windows.bat')));
        const files = readZip(fs.readFileSync(path.join(dir, 'SIMING-Installer-macOS.zip')));
        assert.strictEqual(files[0].name, 'SIMING-Installer.command');
        assert.deepEqual(fs.readdirSync(dir).filter((n) => / /.test(n)), [], 'aucun espace dans les noms');
        assert.strictEqual(files[0].mode, 0o755);
    });

    test('publication : dépôt à renseigner, outil de signature obligatoire', () => {
        assert.throws(() => R.checkRepository({ repository: 'OWNER/siming' }), /repository/);
        assert.throws(() => R.checkRepository({ repository: 'pas un dépôt' }), /repository/);
        R.checkRepository({ repository: 'simon/siming' });
        const saved = process.env.ZXPSIGNCMD;
        delete process.env.ZXPSIGNCMD;
        try {
            assert.throws(() => R.sign(LIST), /ZXPSIGNCMD/);
        } finally {
            if (saved !== undefined) process.env.ZXPSIGNCMD = saved;
        }
    });

    test('publication : --dry-run régénère le manifeste sans signer', () => {
        const zxp = path.join(R.DIST, 'SIMING-' + M.readList().version + '.zxp');
        const before = fs.existsSync(zxp);
        R.main(['--dry-run']);
        assert.ok(fs.existsSync(M.MANIFEST));
        assert.strictEqual(fs.existsSync(zxp), before);
    });
};
