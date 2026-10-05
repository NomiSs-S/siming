'use strict';
/* Ajoute le BOM UTF-8 à chaque .jsx de extension/host qui n'en a pas. Idempotent.
 * node tools/add-bom.js */
const fs = require('fs');
const path = require('path');

const HOST = path.join(__dirname, '..', 'extension', 'host');

function walk(dir, out) {
    if (!fs.existsSync(dir)) return out;
    for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        if (fs.statSync(full).isDirectory()) walk(full, out);
        else if (/\.jsx$/i.test(name)) out.push(full);
    }
    return out;
}

let added = 0;
for (const file of walk(HOST, [])) {
    const buf = fs.readFileSync(file);
    if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) continue;
    fs.writeFileSync(file, Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), buf]));
    added++;
    console.log('BOM ajouté : ' + path.relative(process.cwd(), file));
}
if (!added) console.log('Tous les .jsx ont déjà un BOM.');
