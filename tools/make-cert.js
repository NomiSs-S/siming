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
