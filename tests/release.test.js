'use strict';
/* Zip « store », installeurs (modèles remplis), contrôles de la publication. */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
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

    test('installeur Windows : dépôt rempli, CRLF, ASCII, API GitHub', () => {
        const { bat } = R.installers(LIST);
        assert.ok(!bat.includes('__REPO__'));
        assert.ok(bat.includes("$Repo = 'simon/siming'"));
        assert.ok(!/[^\r]\n/.test(bat), 'CRLF partout');
        assert.ok(/^[\x00-\x7F]*$/.test(bat), 'console Windows : ASCII uniquement');
        assert.ok(bat.includes('#POWERSHELL#'));
        assert.ok(bat.includes('https://api.github.com/repos/$Repo/releases'));
        assert.ok(bat.includes('AfterFX'));
    });

    test('installeur Windows : .zxp extrait chez l\'utilisateur, sans UPIA pour installer', () => {
        // UPIA passe par Creative Cloud : non connecté, il échoue (-631) et sort avec le code 0.
        const { bat } = R.installers(LIST);
        assert.ok(!/\/install\b/.test(bat), 'plus d\'installation par UPIA');
        assert.ok(bat.includes("Join-Path $env:APPDATA 'Adobe\\CEP\\extensions'"), 'dossier de l\'utilisateur');
        assert.ok(bat.includes('[IO.Compression.ZipFile]::ExtractToDirectory($tmp, $new)'));
        assert.ok(bat.includes("'META-INF\\signatures.xml'"), 'signature présente avant de remplacer');
        assert.ok(bat.includes('[IO.FileAttributes]::ReparsePoint') && bat.includes('cmd /c rmdir "$path"'),
            'jonction de développement : le lien seul');
        assert.ok(bat.includes('/remove SIMING') && bat.includes('-Verb RunAs'), 'ancienne copie UPIA retirée');
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
        assert.ok(/try \{[^]*ExtractToDirectory[^]*\} catch \{[^]*Installation impossible/.test(bat), 'extraction dans un try');
    });

    test('installeur macOS : dépôt rempli, LF, bash, API GitHub, extraction chez l\'utilisateur', () => {
        const { cmd } = R.installers(LIST);
        assert.ok(cmd.startsWith('#!/bin/bash\n'));
        assert.ok(!cmd.includes('\r'));
        assert.ok(cmd.includes('REPO="simon/siming"'));
        assert.ok(cmd.includes('https://api.github.com/repos/$REPO/releases'));
        assert.ok(!cmd.includes('--install'), 'plus d\'installation par UPIA');
        assert.ok(cmd.includes('USER_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions"'));
        assert.ok(cmd.includes('ditto -x -k "$tmp" "$new"'));
        assert.ok(cmd.includes('[ ! -f "$new/META-INF/signatures.xml" ]'), 'signature présente avant de remplacer');
        assert.ok(cmd.includes('--remove SIMING') && cmd.includes('with administrator privileges'), 'ancienne copie UPIA retirée');
        assert.ok(cmd.includes('osascript -l JavaScript'));
        assert.ok(cmd.includes('if (r.prerelease) return;'), 'pré-versions exclues');
        assert.ok(cmd.includes('releases?per_page=100'));
    });

    test('installeur macOS : After Effects reconnu à son seul processus, boucle dont on sort', () => {
        const { cmd } = R.installers(LIST);
        // pgrep -f voit aussi les processus d'appoint rangés dans le dossier d'AE (CEPHtmlEngine,
        // AdobeCRDaemon…), qui survivent parfois à sa fermeture : l'installeur bouclait.
        assert.ok(!cmd.includes('pgrep -f'), 'pas de recherche dans la ligne de commande');
        assert.ok(cmd.includes('pgrep -x "After Effects"'), 'nom exact du processus');
        assert.ok(cmd.includes('Cmd + Q'), 'sous macOS, fermer la fenêtre ne quitte pas AE');
        assert.ok(/read -r -p "[^"]*Entrée[^"]*" go \|\| finish 1/.test(cmd), 'sans clavier, on sort au lieu de boucler');
        assert.ok(cmd.includes('[ "$go" = "i" ] && break'), 'installer quand même');
    });

    test('installeur macOS : lien de développement retiré (jamais son contenu), copie remplacée', () => {
        const { cmd } = R.installers(LIST);
        assert.ok(cmd.includes('if [ -L "$TARGET" ]; then\n  rm "$TARGET"'), 'seul le lien est retiré');
        // rm -rf seulement sur une vraie copie, jamais sur le lien (il suivrait vers le dépôt)
        const rmr = cmd.match(/rm -r[f]? "\$TARGET/g) || [];
        assert.strictEqual(rmr.length, 1);
        assert.ok(cmd.includes('elif [ -e "$TARGET" ]; then\n  rm -rf "$TARGET"'), 'après le test du lien');
        const bash = spawnSync('bash', ['-n'], { input: cmd, encoding: 'utf8' });
        if (!bash.error) assert.strictEqual(bash.status, 0, 'syntaxe bash : ' + bash.stderr);
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

    test('publication : fichiers « ._ » de macOS retirés avant de signer, le reste intact', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'siming-dot-'));
        fs.mkdirSync(path.join(dir, 'host', 'tools'), { recursive: true });
        for (const f of ['host/tools/mcp.jsx', 'host/tools/._mcp.jsx', '._index.html', 'index.html']) fs.writeFileSync(path.join(dir, f), 'x');
        const removed = R.removeAppleDouble(dir).map((p) => p.split(path.sep).join('/')).sort();
        assert.deepEqual(removed, ['._index.html', 'host/tools/._mcp.jsx']);
        assert.ok(fs.existsSync(path.join(dir, 'host/tools/mcp.jsx')) && fs.existsSync(path.join(dir, 'index.html')));
    });

    test('publication : --dry-run régénère le manifeste sans signer', () => {
        const zxp = path.join(R.DIST, 'SIMING-' + M.readList().version + '.zxp');
        const before = fs.existsSync(zxp);
        R.main(['--dry-run']);
        assert.ok(fs.existsSync(M.MANIFEST));
        assert.strictEqual(fs.existsSync(zxp), before);
    });
};
