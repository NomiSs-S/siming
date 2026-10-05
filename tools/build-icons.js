'use strict';
/* Génère extension/client/js/icons.js depuis docs/design/icons.json (source des tracés).
 * node tools/build-icons.js   (relancer après toute modification d'une icône) */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'docs', 'design', 'icons.json');
const OUT = path.join(ROOT, 'extension', 'client', 'js', 'icons.js');

function buildIconsSource() {
    const all = JSON.parse(fs.readFileSync(SRC, 'utf8'));
    const icons = {};
    for (const [name, prims] of Object.entries(all)) {
        if (!name.startsWith('_')) icons[name] = prims;
    }
    return '/* GÉNÉRÉ par tools/build-icons.js depuis docs/design/icons.json : ne pas éditer. */\n' +
        '(function (global) {\n' +
        '    \'use strict\';\n' +
        '    const SIMING = global.SIMING = global.SIMING || {};\n' +
        '    SIMING.ICONS = ' + JSON.stringify(icons, null, 4).replace(/\n/g, '\n    ') + ';\n' +
        '})(window);\n';
}

module.exports = { buildIconsSource, OUT };

if (require.main === module) {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, buildIconsSource(), 'utf8');
    console.log('Icônes écrites : ' + OUT);
}
