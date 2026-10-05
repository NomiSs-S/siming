# SIMING 1.0.0 : plan, partie 3 (distribution et documentation)

> Suite de `2026-10-05-siming-cep-1-0-0-partie-2-interface.md` (Global Constraints et Review Focus : voir `2026-10-05-siming-cep-1-0-0.md`). Tâches 12 à 14.

---

### Task 12: Manifeste généré et installation de développement

**Files:**
- Create: `tools/manifest.js`, `tools/dev-install.bat`, `tools/dev-install.command`, `tests/manifest.test.js`
- Modify: `.gitignore` (manifeste généré), `tests/run.js` (FILES)

**Interfaces:**
- Consumes: `extension/client/tools.json` (Tâche 11).
- Produces: `require('./tools/manifest')` exporte `{ buildManifest(list) -> string, validate(list) -> list, readList() -> list, writeManifest() -> string, MANIFEST, TOOLS_JSON, ROOT, MIN_AE, CSXS }` ; `node tools/manifest.js` écrit `extension/CSXS/manifest.xml`.

- [ ] **Step 1: Écrire les tests `tests/manifest.test.js`**

```js
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
```

- [ ] **Step 2: Ajouter le fichier à `tests/run.js` et vérifier l'échec**

Ajouter `'./manifest.test.js',` à la fin de `FILES`.

Run: `node tests/run.js`
Expected: ÉCHEC (`tools/manifest` introuvable).

- [ ] **Step 3: Écrire `tools/manifest.js`**

```js
'use strict';
/*
 * Génère extension/CSXS/manifest.xml depuis extension/client/tools.json.
 *   node tools/manifest.js
 * Ne jamais modifier le manifeste à la main : il est régénéré par dev-install et release.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TOOLS_JSON = path.join(ROOT, 'extension', 'client', 'tools.json');
const MANIFEST = path.join(ROOT, 'extension', 'CSXS', 'manifest.xml');
const MIN_AE = '24.0';   // After Effects 2024 : à ajuster selon la plus ancienne version de l'équipe
const CSXS = '11.0';

function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function readList() {
    return JSON.parse(fs.readFileSync(TOOLS_JSON, 'utf8'));
}

function validate(list) {
    if (!/^\d+\.\d+\.\d+$/.test(String(list.version))) throw new Error('version invalide dans tools.json : ' + list.version);
    if (!Array.isArray(list.tools)) throw new Error('tools.json : « tools » doit être une liste');
    const seen = new Set();
    for (const t of list.tools) {
        if (!/^[a-z][a-z0-9-]*$/.test(String(t.id))) throw new Error("id d'outil invalide : " + t.id);
        if (seen.has(t.id)) throw new Error('id en double : ' + t.id);
        seen.add(t.id);
        for (const k of ['name', 'icon', 'version', 'script']) {
            if (!t[k]) throw new Error('champ « ' + k + ' » manquant pour ' + t.id);
        }
    }
    return list;
}

function panel(x) {
    return [
        '    <Extension Id="' + x.id + '">',
        '      <DispatchInfo>',
        '        <Resources>',
        '          <MainPath>' + x.page + '</MainPath>',
        '          <ScriptPath>./host/siming.jsx</ScriptPath>',
        '          <CEFCommandLine>',
        '            <Parameter>--allow-file-access-from-files</Parameter>',
        '            <Parameter>--allow-file-access</Parameter>',
        '          </CEFCommandLine>',
        '        </Resources>',
        '        <Lifecycle>',
        '          <AutoVisible>true</AutoVisible>',
        '        </Lifecycle>',
        '        <UI>',
        '          <Type>Panel</Type>',
        '          <Menu>' + esc(x.name) + '</Menu>',
        '          <Geometry>',
        '            <Size><Height>' + x.size[1] + '</Height><Width>' + x.size[0] + '</Width></Size>',
        '            <MinSize><Height>300</Height><Width>260</Width></MinSize>',
        '          </Geometry>',
        '        </UI>',
        '      </DispatchInfo>',
        '    </Extension>',
    ].join('\n');
}

function buildManifest(list) {
    validate(list);
    const v = list.version;
    const panels = [{ id: 'com.siming.hub', name: 'SIMING', page: './client/index.html', size: [340, 640] }]
        .concat(list.tools.map((t) => ({ id: 'com.siming.tool.' + t.id, name: 'SIMING – ' + t.name, page: './client/tool.html', size: [320, 560] })));
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<ExtensionManifest Version="' + CSXS + '" ExtensionBundleId="com.siming" ExtensionBundleVersion="' + v + '" ExtensionBundleName="SIMING" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
        '  <ExtensionList>',
        panels.map((x) => '    <Extension Id="' + x.id + '" Version="' + v + '"/>').join('\n'),
        '  </ExtensionList>',
        '  <ExecutionEnvironment>',
        '    <HostList>',
        '      <Host Name="AEFT" Version="[' + MIN_AE + ',99.9]"/>',
        '    </HostList>',
        '    <LocaleList>',
        '      <Locale Code="All"/>',
        '    </LocaleList>',
        '    <RequiredRuntimeList>',
        '      <RequiredRuntime Name="CSXS" Version="' + CSXS + '"/>',
        '    </RequiredRuntimeList>',
        '  </ExecutionEnvironment>',
        '  <DispatchInfoList>',
        panels.map(panel).join('\n'),
        '  </DispatchInfoList>',
        '</ExtensionManifest>',
        '',
    ].join('\n');
}

function writeManifest() {
    const xml = buildManifest(readList());
    fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
    fs.writeFileSync(MANIFEST, xml, 'utf8');
    return xml;
}

module.exports = { buildManifest, validate, readList, writeManifest, MANIFEST, TOOLS_JSON, ROOT, MIN_AE, CSXS };

if (require.main === module) {
    try {
        writeManifest();
        console.log('Manifeste écrit : ' + MANIFEST);
    } catch (e) {
        console.error('Échec : ' + e.message);
        process.exit(1);
    }
}
```

- [ ] **Step 4: Écrire `tools/dev-install.bat` (ASCII uniquement, fins de ligne CRLF)**

```bat
@echo off
setlocal
rem SIMING - installation de developpement (machine de l'auteur uniquement).
rem Active les extensions non signees (PlayerDebugMode), genere le manifeste
rem et relie le dossier extension\ au dossier des extensions CEP.
cd /d "%~dp0.."
for %%V in (11 12) do reg add "HKCU\Software\Adobe\CSXS.%%V" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul
node tools\manifest.js || goto :error
set "DEST=%APPDATA%\Adobe\CEP\extensions"
if not exist "%DEST%" mkdir "%DEST%"
if exist "%DEST%\com.siming" rmdir "%DEST%\com.siming"
mklink /J "%DEST%\com.siming" "%CD%\extension" || goto :error
echo.
echo SIMING relie : %DEST%\com.siming
echo Relance After Effects, puis Fenetre ^> Extensions ^> SIMING.
pause
exit /b 0
:error
echo.
echo Echec de l'installation de developpement.
pause
exit /b 1
```

Après écriture, convertir en CRLF :

```bash
node -e "const f='tools/dev-install.bat';const fs=require('fs');fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/\r?\n/g,'\r\n'))"
```

- [ ] **Step 5: Écrire `tools/dev-install.command` (fins de ligne LF)**

```bash
#!/bin/bash
# SIMING - installation de développement (machine de l'auteur uniquement).
# Active les extensions non signées (PlayerDebugMode), génère le manifeste
# et relie le dossier extension/ au dossier des extensions CEP.
set -e
cd "$(dirname "$0")/.."
for v in 11 12; do defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1; done
node tools/manifest.js
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions"
mkdir -p "$DEST"
rm -f "$DEST/com.siming"
ln -s "$(pwd)/extension" "$DEST/com.siming"
echo
echo "SIMING relié : $DEST/com.siming"
echo "Relance After Effects, puis Fenêtre > Extensions > SIMING."
```

Sur macOS uniquement : `chmod +x tools/dev-install.command` (avec git : `git update-index --chmod=+x tools/dev-install.command` après l'ajout).

- [ ] **Step 6: Ignorer le manifeste généré**

Ajouter à `.gitignore` :

```
extension/CSXS/manifest.xml
```

- [ ] **Step 7: Lancer les tests**

Run: `node tests/run.js`
Expected: `111 réussi(s), 0 échoué(s)`.

- [ ] **Step 8: Commit**

```bash
git add tools/manifest.js tools/dev-install.bat tools/dev-install.command tests .gitignore
git update-index --chmod=+x tools/dev-install.command
git commit -m "feat(paquet): manifeste généré et installation de développement"
```

---

### Task 13: Signature, paquet et installeur double-clic

**Files:**
- Create: `tools/zip.js`, `tools/make-cert.js`, `tools/release.js`, `tools/installer/SIMING - Installer.bat`, `tools/installer/SIMING - Installer.command`, `tests/release.test.js`
- Modify: `extension/client/tools.json` (`repository`), `tests/run.js` (FILES)

**Interfaces:**
- Consumes: `tools/manifest.js` (Tâche 12).
- Produces :
  - `require('./tools/zip')` : `{ zip(entries: [{ name, data: Buffer, mode }]) -> Buffer, crc32(Buffer) -> number }` (méthode « store », droits Unix dans les attributs externes) ;
  - `require('./tools/release')` : `{ installers(list) -> { bat, cmd }, writeInstallers(list, dir = DIST), checkRepository(list), sign(list) -> cheminZxp, main(argv), DIST }` ;
  - `node tools/release.js --dry-run` (vérifie et régénère le manifeste) ; `node tools/release.js` (signe et prépare `dist/`) ;
  - `node tools/make-cert.js` (certificat auto-signé hors du dépôt).
  - Variables d'environnement : `ZXPSIGNCMD` (chemin de ZXPSignCmd), `SIMING_CERT_PASSWORD`, `SIMING_CERT` (facultatif, défaut `~/.siming/siming-cert.p12`).

- [ ] **Step 1: Demander le compte GitHub de l'auteur**

Demander : « Quel est ton nom de compte GitHub (le dépôt public sera `<compte>/siming`) ? ». Remplacer `OWNER` dans `extension/client/tools.json` par la réponse, par exemple `"repository": "simon/siming"`. Sans réponse pour l'instant, laisser `OWNER/siming` : les tests passent, seule la publication réelle (`node tools/release.js` sans `--dry-run`) refusera de continuer.

- [ ] **Step 2: Écrire les tests `tests/release.test.js`**

```js
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
            { name: 'SIMING - Installer.command', data: Buffer.from('#!/bin/bash\necho é\n'), mode: 0o755 },
            { name: 'LISEZ-MOI.txt', data: Buffer.from('notice'), mode: 0o644 },
        ]);
        const files = readZip(buf);
        assert.deepEqual(files.map((f) => f.name), ['SIMING - Installer.command', 'LISEZ-MOI.txt']);
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

    test('installeur macOS : dépôt rempli, LF, bash, UPIA et API GitHub', () => {
        const { cmd } = R.installers(LIST);
        assert.ok(cmd.startsWith('#!/bin/bash\n'));
        assert.ok(!cmd.includes('\r'));
        assert.ok(cmd.includes('REPO="simon/siming"'));
        assert.ok(cmd.includes('https://api.github.com/repos/$REPO/releases'));
        assert.ok(cmd.includes('UnifiedPluginInstallerAgent') && cmd.includes('--install'));
        assert.ok(cmd.includes('osascript -l JavaScript'));
    });

    test('writeInstallers : .bat et zip macOS exécutable dans le dossier donné', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'siming-dist-'));
        R.writeInstallers(LIST, dir);
        assert.ok(fs.existsSync(path.join(dir, 'SIMING - Installer.bat')));
        const files = readZip(fs.readFileSync(path.join(dir, 'SIMING-Installer-macOS.zip')));
        assert.strictEqual(files[0].name, 'SIMING - Installer.command');
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
```

- [ ] **Step 3: Ajouter le fichier à `tests/run.js` et vérifier l'échec**

Ajouter `'./release.test.js',` à la fin de `FILES`.

Run: `node tests/run.js`
Expected: ÉCHEC (`tools/zip` introuvable).

- [ ] **Step 4: Écrire `tools/zip.js`**

```js
'use strict';
/*
 * Écrit un .zip non compressé (méthode « store ») en conservant les droits Unix :
 * le .command macOS reste exécutable après décompression.
 *   zip([{ name, data: Buffer, mode: 0o755 }]) -> Buffer
 */

const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}

const DOS_DATE = 0x21;   // 1er janvier 1980 : date neutre, le contenu seul compte
const UTF8_FLAG = 0x0800;

function zip(entries) {
    const parts = [];
    const central = [];
    let offset = 0;
    for (const e of entries) {
        const name = Buffer.from(e.name, 'utf8');
        const data = e.data;
        const crc = crc32(data);

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);              // version nécessaire
        local.writeUInt16LE(UTF8_FLAG, 6);
        local.writeUInt16LE(0, 8);               // méthode : store
        local.writeUInt16LE(0, 10);              // heure
        local.writeUInt16LE(DOS_DATE, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(data.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(name.length, 26);
        local.writeUInt16LE(0, 28);
        parts.push(local, name, data);

        const cd = Buffer.alloc(46);
        cd.writeUInt32LE(0x02014b50, 0);
        cd.writeUInt16LE(0x031E, 4);             // créé par : Unix (3), version 3.0
        cd.writeUInt16LE(20, 6);
        cd.writeUInt16LE(UTF8_FLAG, 8);
        cd.writeUInt16LE(0, 10);
        cd.writeUInt16LE(0, 12);
        cd.writeUInt16LE(DOS_DATE, 14);
        cd.writeUInt32LE(crc, 16);
        cd.writeUInt32LE(data.length, 20);
        cd.writeUInt32LE(data.length, 24);
        cd.writeUInt16LE(name.length, 28);
        cd.writeUInt16LE(0, 30);
        cd.writeUInt16LE(0, 32);
        cd.writeUInt16LE(0, 34);
        cd.writeUInt16LE(0, 36);
        cd.writeUInt32LE((((e.mode || 0o644) | 0o100000) << 16) >>> 0, 38);   // fichier ordinaire + droits
        cd.writeUInt32LE(offset, 42);
        central.push(cd, name);

        offset += 30 + name.length + data.length;
    }
    const cdBuf = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(cdBuf.length, 12);
    end.writeUInt32LE(offset, 16);
    end.writeUInt16LE(0, 20);
    return Buffer.concat([...parts, cdBuf, end]);
}

module.exports = { zip, crc32 };
```

- [ ] **Step 5: Écrire le modèle `tools/installer/SIMING - Installer.bat` (ASCII uniquement)**

Le fichier est à la fois un script batch (les 6 premières lignes) et un script PowerShell (après le repère). Les messages sont sans accents pour rester lisibles dans toutes les consoles Windows.

```bat
@echo off
rem SIMING - installation et mise a jour (Windows). Double-cliquer ce fichier.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s = Get-Content -LiteralPath '%~f0' -Raw; $i = $s.IndexOf('#' + 'POWERSHELL#'); Invoke-Expression $s.Substring($i)"
echo.
pause
exit /b
#POWERSHELL#
$ErrorActionPreference = 'Stop'
$Repo = '__REPO__'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Write-Host ''
Write-Host '  SIMING - installation / mise a jour' -ForegroundColor Cyan
Write-Host ''

function Get-InstalledVersion {
    $dirs = @(
        (Join-Path $env:APPDATA 'Adobe\CEP\extensions\com.siming'),
        (Join-Path ${env:CommonProgramFiles(x86)} 'Adobe\CEP\extensions\com.siming'),
        (Join-Path $env:CommonProgramFiles 'Adobe\CEP\extensions\com.siming')
    )
    foreach ($d in $dirs) {
        $m = Join-Path $d 'CSXS\manifest.xml'
        if (Test-Path -LiteralPath $m) {
            $x = [xml](Get-Content -LiteralPath $m -Raw)
            return $x.ExtensionManifest.ExtensionBundleVersion
        }
    }
    return $null
}

$installed = Get-InstalledVersion
if ($installed) { Write-Host "  Version installee : $installed" } else { Write-Host '  SIMING n''est pas encore installe.' }

try {
    $releases = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases" -Headers @{ 'User-Agent' = 'SIMING-Installer'; 'Accept' = 'application/vnd.github+json' }
} catch {
    Write-Host "  Impossible de joindre GitHub : $($_.Exception.Message)" -ForegroundColor Red
    return
}

$list = @()
foreach ($r in $releases) {
    if ($r.draft) { continue }
    $asset = $r.assets | Where-Object { $_.name -like '*.zxp' } | Select-Object -First 1
    if (-not $asset) { continue }
    $note = ''
    if ($r.body) { $note = ($r.body -split "`n")[0].Trim() }
    $list += [pscustomobject]@{ Tag = $r.tag_name; Url = $asset.browser_download_url; Name = $asset.name; Note = $note }
}
if ($list.Count -eq 0) { Write-Host '  Aucune version publiee pour le moment.' -ForegroundColor Yellow; return }

Write-Host ''
Write-Host '  Versions disponibles :'
for ($i = 0; $i -lt $list.Count; $i++) {
    $label = $list[$i].Tag
    if ($i -eq 0) { $label += '  (derniere)' }
    Write-Host ('    {0}) {1}   {2}' -f ($i + 1), $label, $list[$i].Note)
}
Write-Host ''
$answer = Read-Host '  Entree = derniere version, ou tape un numero'
$index = 0
if ($answer -match '^\d+$') { $index = [int]$answer - 1 }
if ($index -lt 0 -or $index -ge $list.Count) { Write-Host '  Numero inconnu.' -ForegroundColor Red; return }
$choice = $list[$index]

$tmp = Join-Path $env:TEMP $choice.Name
Write-Host "  Telechargement de $($choice.Tag)..."
Invoke-WebRequest -Uri $choice.Url -OutFile $tmp -UseBasicParsing -Headers @{ 'User-Agent' = 'SIMING-Installer' }

while (Get-Process -Name 'AfterFX' -ErrorAction SilentlyContinue) {
    Read-Host '  After Effects est ouvert : ferme-le, puis appuie sur Entree' | Out-Null
}

$upia = Join-Path $env:CommonProgramFiles 'Adobe\Adobe Desktop Common\RemoteComponents\UPI\UnifiedPluginInstallerAgent\UnifiedPluginInstallerAgent.exe'
if (-not (Test-Path -LiteralPath $upia)) {
    Write-Host '  Installeur Adobe (UPIA) introuvable : Creative Cloud est-il installe ?' -ForegroundColor Red
    Write-Host "  Solution de secours : installe $tmp avec ZXP Installer (gratuit) : https://aescripts.com/learn/zxp-installer/"
    return
}
Write-Host '  Installation...'
& $upia /install $tmp
if ($LASTEXITCODE -ne 0) { Write-Host "  L'installeur Adobe a renvoye le code $LASTEXITCODE." -ForegroundColor Red; return }
Write-Host ''
Write-Host "  SIMING $($choice.Tag) installe. Ouvre After Effects > Fenetre > Extensions > SIMING." -ForegroundColor Green
```

- [ ] **Step 6: Écrire le modèle `tools/installer/SIMING - Installer.command`**

```bash
#!/bin/bash
# SIMING - installation et mise à jour (macOS). Double-cliquer ce fichier.
REPO="__REPO__"
UPIA="/Library/Application Support/Adobe/Adobe Desktop Common/RemoteComponents/UPI/UnifiedPluginInstallerAgent/UnifiedPluginInstallerAgent.app/Contents/MacOS/UnifiedPluginInstallerAgent"

finish() { echo; read -r -p "  Appuie sur Entrée pour fermer." _; exit "${1:-0}"; }

echo
echo "  SIMING - installation / mise à jour"
echo

installed=""
for d in "$HOME/Library/Application Support/Adobe/CEP/extensions/com.siming" "/Library/Application Support/Adobe/CEP/extensions/com.siming"; do
  m="$d/CSXS/manifest.xml"
  if [ -f "$m" ]; then
    installed=$(sed -n 's/.*ExtensionBundleVersion="\([^"]*\)".*/\1/p' "$m" | head -n 1)
    break
  fi
done
if [ -n "$installed" ]; then echo "  Version installée : $installed"; else echo "  SIMING n'est pas encore installé."; fi

json=$(curl -fsSL -H "User-Agent: SIMING-Installer" -H "Accept: application/vnd.github+json" "https://api.github.com/repos/$REPO/releases") || { echo "  Impossible de joindre GitHub."; finish 1; }

list=$(osascript -l JavaScript - "$json" <<'JXA'
function run(argv) {
  var out = [];
  JSON.parse(argv[0]).forEach(function (r) {
    if (r.draft) return;
    var a = (r.assets || []).filter(function (x) { return /\.zxp$/.test(x.name); })[0];
    if (!a) return;
    var note = (r.body || '').split('\n')[0].replace(/\t/g, ' ').trim();
    out.push([r.tag_name, a.browser_download_url, a.name, note].join('\t'));
  });
  return out.join('\n');
}
JXA
)

if [ -z "$list" ]; then echo "  Aucune version publiée pour le moment."; finish 0; fi

echo
echo "  Versions disponibles :"
i=0
while IFS=$'\t' read -r tag url name note; do
  i=$((i + 1))
  label="$tag"
  [ "$i" -eq 1 ] && label="$tag  (dernière)"
  echo "    $i) $label   $note"
done <<< "$list"
echo
read -r -p "  Entrée = dernière version, ou tape un numéro : " answer
[ -z "$answer" ] && answer=1
if ! [[ "$answer" =~ ^[0-9]+$ ]] || [ "$answer" -lt 1 ] || [ "$answer" -gt "$i" ]; then echo "  Numéro inconnu."; finish 1; fi

line=$(sed -n "${answer}p" <<< "$list")
IFS=$'\t' read -r tag url name note <<< "$line"
tmp="${TMPDIR:-/tmp}/$name"
echo "  Téléchargement de $tag..."
curl -fsSL -H "User-Agent: SIMING-Installer" -o "$tmp" "$url" || { echo "  Téléchargement impossible."; finish 1; }

while pgrep -f "Adobe After Effects" >/dev/null; do
  read -r -p "  After Effects est ouvert : ferme-le, puis appuie sur Entrée " _
done

if [ ! -x "$UPIA" ]; then
  echo "  Installeur Adobe (UPIA) introuvable : Creative Cloud est-il installé ?"
  echo "  Secours : installe $tmp avec ZXP Installer (gratuit) : https://aescripts.com/learn/zxp-installer/"
  finish 1
fi
echo "  Installation..."
if "$UPIA" --install "$tmp"; then
  echo
  echo "  SIMING $tag installé. Ouvre After Effects > Fenêtre > Extensions > SIMING."
  finish 0
else
  echo "  L'installeur Adobe a échoué."
  finish 1
fi
```

- [ ] **Step 7: Écrire `tools/make-cert.js`**

```js
'use strict';
/*
 * Crée UNE FOIS le certificat auto-signé de SIMING :   node tools/make-cert.js
 * Variables : ZXPSIGNCMD (chemin de ZXPSignCmd), SIMING_CERT_PASSWORD, SIMING_CERT (facultatif).
 * Le certificat et son mot de passe restent hors du dépôt : les sauvegarder, car toutes
 * les mises à jour doivent être signées avec le même certificat.
 * ZXPSignCmd (gratuit) : https://github.com/Adobe-CEP/CEP-Resources/tree/master/ZXPSignCMD
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const tool = process.env.ZXPSIGNCMD;
const pwd = process.env.SIMING_CERT_PASSWORD;
const cert = process.env.SIMING_CERT || path.join(os.homedir(), '.siming', 'siming-cert.p12');

if (!tool || !fs.existsSync(tool)) {
    console.error('ZXPSIGNCMD doit pointer vers ZXPSignCmd (https://github.com/Adobe-CEP/CEP-Resources/tree/master/ZXPSignCMD).');
    process.exit(1);
}
if (!pwd) {
    console.error('Définis SIMING_CERT_PASSWORD (mot de passe du certificat, à garder précieusement).');
    process.exit(1);
}
if (fs.existsSync(cert)) {
    console.error('Un certificat existe déjà : ' + cert + '\nNe pas l\'écraser : les mises à jour doivent garder la même signature.');
    process.exit(1);
}
fs.mkdirSync(path.dirname(cert), { recursive: true });
execFileSync(tool, ['-selfSignedCert', 'FR', 'IDF', 'SIMING', 'SIMING', pwd, cert, '-validityDays', '3650'], { stdio: 'inherit' });
console.log('Certificat créé : ' + cert + '\nSauvegarde-le avec son mot de passe, hors du dépôt.');
```

- [ ] **Step 8: Écrire `tools/release.js`**

```js
'use strict';
/*
 * Prépare une version de SIMING :
 *   node tools/release.js --dry-run   vérifie tools.json et régénère le manifeste
 *   node tools/release.js             signe extension/ en dist/SIMING-<version>.zxp
 *                                     et prépare les installeurs dans dist/
 * Variables : ZXPSIGNCMD, SIMING_CERT_PASSWORD, SIMING_CERT (défaut ~/.siming/siming-cert.p12).
 * Ensuite : créer la Release GitHub v<version> et y joindre les fichiers de dist/.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { readList, validate, writeManifest, ROOT } = require('./manifest');
const { zip } = require('./zip');

const DIST = path.join(ROOT, 'dist');
const INSTALLER_DIR = path.join(__dirname, 'installer');
const TSA = 'http://timestamp.digicert.com';

function certPath() {
    return process.env.SIMING_CERT || path.join(os.homedir(), '.siming', 'siming-cert.p12');
}

function checkRepository(list) {
    const repo = String(list.repository || '');
    if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repo) || /^OWNER\//.test(repo)) {
        throw new Error('« repository » de tools.json à renseigner (compte/siming) : ' + repo);
    }
}

/** Installeurs remplis avec le dépôt : .bat en CRLF, .command en LF. */
function installers(list) {
    const fill = (name) => fs.readFileSync(path.join(INSTALLER_DIR, name), 'utf8').replace(/__REPO__/g, list.repository);
    return {
        bat: fill('SIMING - Installer.bat').replace(/\r?\n/g, '\r\n'),
        cmd: fill('SIMING - Installer.command').replace(/\r\n/g, '\n'),
    };
}

function writeInstallers(list, dir) {
    const out = dir || DIST;
    const { bat, cmd } = installers(list);
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'SIMING - Installer.bat'), bat, 'utf8');
    fs.writeFileSync(path.join(out, 'SIMING-Installer-macOS.zip'),
        zip([{ name: 'SIMING - Installer.command', data: Buffer.from(cmd, 'utf8'), mode: 0o755 }]));
}

function sign(list) {
    const tool = process.env.ZXPSIGNCMD;
    if (!tool || !fs.existsSync(tool)) throw new Error('ZXPSIGNCMD doit pointer vers ZXPSignCmd');
    const cert = certPath();
    if (!fs.existsSync(cert)) throw new Error('Certificat introuvable : ' + cert + ' (node tools/make-cert.js)');
    const pwd = process.env.SIMING_CERT_PASSWORD;
    if (!pwd) throw new Error('SIMING_CERT_PASSWORD manquant');
    fs.mkdirSync(DIST, { recursive: true });
    const out = path.join(DIST, 'SIMING-' + list.version + '.zxp');
    if (fs.existsSync(out)) fs.unlinkSync(out);
    execFileSync(tool, ['-sign', path.join(ROOT, 'extension'), out, cert, pwd, '-tsa', TSA], { stdio: 'inherit' });
    return out;
}

function main(argv) {
    const dry = argv.includes('--dry-run');
    const list = validate(readList());
    writeManifest();
    installers(list);   // vérifie que les modèles existent
    if (dry) {
        console.log('Vérification OK : SIMING ' + list.version + ', ' + list.tools.length + ' outil(s).');
        return;
    }
    checkRepository(list);
    const zxp = sign(list);
    writeInstallers(list);
    console.log('Prêt dans dist/ : ' + path.basename(zxp) + ', SIMING - Installer.bat, SIMING-Installer-macOS.zip');
    console.log('Crée la Release GitHub v' + list.version + ' et joins ces trois fichiers.');
    console.log('Première ligne des notes : « Ajout : … » ou « Correction : … » (affichée par l\'installeur).');
}

module.exports = { installers, writeInstallers, checkRepository, sign, main, DIST };

if (require.main === module) {
    try {
        main(process.argv.slice(2));
    } catch (e) {
        console.error('Échec : ' + e.message);
        process.exit(1);
    }
}
```

- [ ] **Step 9: Lancer les tests**

Run: `node tests/run.js`
Expected: `118 réussi(s), 0 échoué(s)`.

- [ ] **Step 10: Commit**

```bash
git add tools tests extension/client/tools.json
git commit -m "feat(distribution): signature du .zxp, installeurs double-clic Windows et macOS"
```

---

### Task 14: Documentation, validation dans After Effects et première Release

**Files:**
- Create: `docs/INSTALLATION.md`, `docs/TESTS-MANUELS.md`
- Modify: `README.md`, `CLAUDE.md`, `docs/SUIVI.md`, `docs/NOTES-EXTENDSCRIPT.md`

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: la documentation de la 1.0.0 ; une validation dans After Effects par l'auteur ; la Release `v1.0.0` (avec son accord).

- [ ] **Step 1: Écrire `docs/INSTALLATION.md` (notice pour les collègues, jointe aux Releases)**

```markdown
# Installer SIMING (After Effects)

Gratuit. Une seule chose à faire, pour installer comme pour mettre à jour.

## 1. Récupérer l'installeur (une seule fois)

Sur la page des versions de SIMING (lien donné par Simon), télécharge :

- **Windows** : `SIMING - Installer.bat`
- **macOS** : `SIMING-Installer-macOS.zip`, puis double-clique dessus pour obtenir `SIMING - Installer.command`

Range-le où tu veux (Bureau, Documents) : tu le réutiliseras à chaque mise à jour.

## 2. Installer ou mettre à jour

1. Ferme After Effects.
2. Double-clique sur l'installeur.
3. Appuie sur **Entrée** pour la dernière version (ou tape le numéro d'une autre version).
4. Attends « SIMING … installé ».
5. Ouvre After Effects : **Fenêtre › Extensions › SIMING**.

## Première ouverture de l'installeur

L'installeur vient d'Internet et n'est pas signé, le système te prévient la première fois :

- **Windows** : « Windows a protégé votre ordinateur » → **Informations complémentaires** → **Exécuter quand même**.
- **macOS** : clic droit sur `SIMING - Installer.command` → **Ouvrir** → **Ouvrir**.

## Revenir à une version précédente

Relance l'installeur et tape le numéro de la version voulue.

## En cas de souci

- « Installeur Adobe (UPIA) introuvable » : Creative Cloud doit être installé. En secours, installe le fichier `.zxp` indiqué avec ZXP Installer (gratuit) : https://aescripts.com/learn/zxp-installer/
- « Impossible de joindre GitHub » : vérifie ta connexion Internet, puis relance.
- SIMING n'apparaît pas dans Fenêtre › Extensions : redémarre After Effects.
```

- [ ] **Step 2: Écrire `docs/TESTS-MANUELS.md`**

```markdown
# Checklist de tests manuels dans After Effects

À dérouler avant chaque Release. Noter résultats et anomalies dans `docs/SUIVI.md`.

Préparer une comp « Rig » : `Parent` ; trois enfants `A`, `B`, `C` ; un petit-enfant
`C1` parenté à `C` ; un calque `Libre` ; une position animée sur `B`. Une seconde comp
« Autre » : `Tete` avec deux enfants `Oeil_G`, `Oeil_D`.

## Installation

- [ ] `tools/dev-install` (Windows et macOS) : SIMING apparaît dans Fenêtre › Extensions après redémarrage d'AE.
- [ ] Release signée installée avec l'installeur (Windows et macOS) : le menu de versions s'affiche, « Entrée » installe la dernière, la version installée est indiquée au lancement suivant.
- [ ] Retour à une version précédente avec l'installeur : la version choisie est bien installée.
- [ ] AE ouvert pendant l'installation : l'installeur demande de le fermer.
- [ ] Noter la commande et le chemin exacts d'UPIA qui fonctionnent sur chaque système (spec § 13).

## Hub

- [ ] Fond, rail horizontal (48 px), icônes nettes, outil actif bleu avec trait bas, Réglages à droite, statut en bas avec `v1.0.0`.
- [ ] Panneau étroit (≈ 260 px) : rien ne déborde ; avec plusieurs outils, le menu « … » apparaît.
- [ ] Touches 1…n changent d'outil (pas dans un champ).
- [ ] Réglages : outil au lancement respecté après fermeture/réouverture ; « À propos » liste les versions.
- [ ] Changer la luminosité de l'interface d'AE (Préférences › Apparence) : le fond du panneau suit.

## Panneau isolé

- [ ] Bouton « Ouvrir dans un panneau » d'Unparent : le panneau « SIMING – Unparent » s'ouvre et s'ancre.
- [ ] Cliquer de nouveau le bouton quand le panneau est déjà ouvert : noter le comportement (spec § 13).
- [ ] Le panneau isolé fonctionne comme dans le hub, avec sa propre ligne de statut.

## Unparent : rendu

- [ ] Carte vide en pointillés, survol bleu ; remplie : nom en gras, « n enfants · Rig ».
- [ ] Bandeau orange présent seulement quand un enfant est détaché, sans laisser de trou sinon.
- [ ] Bouton secondaire présent seulement en cas mixte, sans laisser de trou sinon.
- [ ] Lignes de 32 px ; au survol, la pastille laisse place à « Détacher » / « Rattacher ».
- [ ] Filtre Tous / Liés / Détachés avec les nombres.

## Unparent : comportement

- [ ] Aucune comp ouverte, clic sur la carte : « Aucune composition active ».
- [ ] `Libre` sélectionné : « n'a aucun enfant lié ni détaché ».
- [ ] `Parent` sélectionné : `A`, `B`, `C` « lié », `C1` absent. Bouton « Détacher les 3 enfants ».
- [ ] Bouton principal : rien ne bouge à l'image courante ; `C1` suit `C` ; le bouton devient « Rattacher les 3 enfants ».
- [ ] Déplacer `Parent` : les enfants ne bougent pas.
- [ ] Un seul Ctrl+Z annule l'action entière (nom de l'annulation : « Unparent : détacher » / « Unparent : rattacher »).
- [ ] Clic sur la ligne `A` : `A` seul change d'état ; double-clic rapide : noter s'il part une ou deux actions.
- [ ] Commentaire de `A` détaché : se termine par `[UP|<id>|Parent]`, un commentaire existant est conservé devant.
- [ ] Nom de calque avec guillemets, apostrophe, accents : affichage et actions corrects.
- [ ] Sans sélection, clic sur la carte : « Liste mise à jour ».
- [ ] Changer de comp active puis bouton principal : « La composition active a changé ».
- [ ] `A` verrouillé, bouton principal : dialogue « Calques ignorés », statut orange.
- [ ] Enregistrer, quitter AE, rouvrir : les enfants détachés sont retrouvés et rattachables.
- [ ] Détacher dans « Autre », revenir dans « Rig » : « En attente dans le projet » propose de rattacher `Tete` ; un clic le fait.
- [ ] `B` (position animée) : saut possible sur d'autres images, comme le menu Parent d'AE (limite connue).
- [ ] Projet lourd (centaines de calques) : le panneau reste réactif.
```

- [ ] **Step 3: Mettre à jour `README.md`, `CLAUDE.md`, `docs/NOTES-EXTENDSCRIPT.md`, `docs/SUIVI.md`**

`README.md` :
- remplacer le bloc de citation « Refonte en cours » par : `> Version 1.0.0 : extension CEP pour After Effects 2024 et plus (Windows, macOS).`
- remplacer la ligne d'Unparent du tableau par `| Unparent | 2.0.0 | Détacher temporairement les enfants d'un calque, puis les rattacher |`
- remplacer le titre `## Installation (à partir de la 1.0.0)` par `## Installation`
- ajouter à la fin de « Développement » :
  ```
  Installation de développement : `tools/dev-install.bat` (Windows) ou
  `tools/dev-install.command` (macOS), puis recharger le panneau après chaque
  modification. Publication : `node tools/release.js` (voir le plan, Tâche 13).
  ```

`CLAUDE.md` :
- remplacer la ligne ``**État : refonte CEP en cours** (plan : …).`` par ``**État : 1.0.0** (plan d'origine : `docs/superpowers/plans/2026-10-05-siming-cep-1-0-0.md`).``
- remplacer le titre `## Structure (cible, voir la spec § 3)` par `## Structure`
- dans « Ajouter un outil », ajouter l'étape : `6. node tools/release.js --dry-run, puis node tools/release.js et la Release GitHub (notice des collègues : docs/INSTALLATION.md).`

`docs/NOTES-EXTENDSCRIPT.md`, ajouter à la section CEP :

```markdown
- `CSInterface.evalScript` est asynchrone : un seul appel à la fois par vue, commandes désactivées pendant l'appel (une seule action par double clic).
- Les arguments passent encodés (`encodeURIComponent` du JSON) et le retour aussi : aucun texte de calque n'est interprété comme du code.
- Un panneau CEP ne lit pas de paramètres fiables dans `MainPath` : le panneau isolé déduit son outil de `CSInterface.getExtensionID()`.
- Tous les panneaux d'une extension partagent le moteur ExtendScript : chaque panneau recharge `host/siming.jsx` (mémoire de session d'Unparent remise à zéro, les balises suffisent).
```

`docs/SUIVI.md`, ajouter une entrée de journal datée du jour d'exécution :

```markdown
### <date> : SIMING 1.0.0 (CEP) implémenté

Plan : `docs/superpowers/plans/2026-10-05-siming-cep-1-0-0.md`.
Fait : cœur hôte (JSON, routeur), Unparent hôte + API, pont, charte CSS et composants,
vue Unparent v2, hub à rail, panneau isolé, manifeste généré, dev-install, signature,
installeurs Windows / macOS, documentation. `node tests/run.js` : 118 tests, 0 échec.
Précisions par rapport à la spec : version dans `tools.json` (pas de fichier VERSION),
outil du panneau isolé tiré de l'identifiant d'extension, API `unparent.init` et `siming.init`.
État : à valider dans After Effects avec `docs/TESTS-MANUELS.md` (Windows et macOS).
```

- [ ] **Step 4: Vérification complète**

```bash
node tests/run.js
node tools/release.js --dry-run
node tools/add-bom.js
```

Expected: `118 réussi(s), 0 échoué(s)` ; `Vérification OK : SIMING 1.0.0, 1 outil(s).` ; `Tous les .jsx ont déjà un BOM.`

- [ ] **Step 5: Commit**

```bash
git add README.md CLAUDE.md docs
git commit -m "docs: notice d'installation, checklist After Effects, documentation 1.0.0"
```

- [ ] **Step 6: Validation dans After Effects par l'auteur (bloquant pour la Release)**

Demander à l'auteur de lancer `tools/dev-install` puis de dérouler `docs/TESTS-MANUELS.md` (sections Hub, Panneau isolé, Unparent) sur Windows, et sur macOS si possible. Reporter les résultats dans `docs/SUIVI.md`. Corriger chaque anomalie dans une tâche dédiée (test qui échoue d'abord) avant de continuer. Confirmer avec l'auteur la valeur de `MIN_AE` dans `tools/manifest.js`.

- [ ] **Step 7: Dépôt GitHub public et première Release (avec l'accord explicite de l'auteur)**

Publier le code est une action publique : demander l'accord avant chaque étape.

1. Créer le dépôt public `<compte>/siming` et pousser `main` :
   ```bash
   gh repo create siming --public --source . --push
   ```
   Sans `gh` : créer le dépôt sur github.com, puis `git remote add origin https://github.com/<compte>/siming.git` et `git push -u origin main`.
2. Télécharger ZXPSignCmd (gratuit) depuis https://github.com/Adobe-CEP/CEP-Resources/tree/master/ZXPSignCMD, définir `ZXPSIGNCMD` et `SIMING_CERT_PASSWORD`, puis :
   ```bash
   node tools/make-cert.js
   node tools/release.js
   ```
3. Créer la Release `v1.0.0` avec les fichiers de `dist/`, la notice et la note « Ajout : Unparent » :
   ```bash
   gh release create v1.0.0 "dist/SIMING-1.0.0.zxp" "dist/SIMING - Installer.bat" "dist/SIMING-Installer-macOS.zip" docs/INSTALLATION.md --title "SIMING 1.0.0" --notes "Ajout : Unparent"
   ```
4. Tester l'installeur téléchargé depuis la Release sur une autre machine (ou après suppression du lien de développement : `%APPDATA%\Adobe\CEP\extensions\com.siming` sous Windows, `~/Library/Application Support/Adobe/CEP/extensions/com.siming` sous macOS).
5. Noter dans `docs/SUIVI.md` : version publiée, résultats de l'installeur, chemins UPIA confirmés.
