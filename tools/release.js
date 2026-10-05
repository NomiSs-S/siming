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
const WIN_INSTALLER = 'SIMING-Installer-Windows.bat';
const MAC_INSTALLER = 'SIMING-Installer.command';
const MAC_ZIP = 'SIMING-Installer-macOS.zip';

/**
 * Lance ZXPSignCmd. En cas d'échec, l'erreur ne garde que le code de sortie :
 * le message d'origine de execFileSync recopie la ligne de commande, donc le mot de passe.
 */
function runZxpSign(tool, args) {
    try {
        execFileSync(tool, args, { stdio: 'inherit' });
    } catch (e) {
        throw new Error('ZXPSignCmd a échoué (code ' + e.status + ')');
    }
}

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
        bat: fill(WIN_INSTALLER).replace(/\r?\n/g, '\r\n'),
        cmd: fill(MAC_INSTALLER).replace(/\r\n/g, '\n'),
    };
}

function writeInstallers(list, dir) {
    const out = dir || DIST;
    const { bat, cmd } = installers(list);
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, WIN_INSTALLER), bat, 'utf8');
    fs.writeFileSync(path.join(out, MAC_ZIP),
        zip([{ name: MAC_INSTALLER, data: Buffer.from(cmd, 'utf8'), mode: 0o755 }]));
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
    runZxpSign(tool, ['-sign', path.join(ROOT, 'extension'), out, cert, pwd, '-tsa', TSA]);
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
    console.log('Prêt dans dist/ : ' + path.basename(zxp) + ', ' + WIN_INSTALLER + ', ' + MAC_ZIP);
    console.log('Crée la Release GitHub v' + list.version + ' et joins ces trois fichiers.');
    console.log('Première ligne des notes : « Ajout : … » ou « Correction : … » (affichée par l\'installeur).');
}

module.exports = { installers, writeInstallers, checkRepository, sign, runZxpSign, main, DIST };

if (require.main === module) {
    try {
        main(process.argv.slice(2));
    } catch (e) {
        console.error('Échec : ' + e.message);
        process.exit(1);
    }
}
