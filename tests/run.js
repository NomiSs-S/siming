'use strict';
/*
 * Lance tous les tests, sans After Effects :   node tests/run.js
 * Chaque fichier exporte function (test) { test('nom', async () => { ... }); }
 */
const { app } = require('./fake-ae');

// Ajouter ici chaque nouveau fichier de tests, dans l'ordre des tâches.
const FILES = [
    './fake-ae.test.js',
];

const queue = [];
function test(name, fn) { queue.push({ name, fn }); }

(async () => {
    let passed = 0;
    let failed = 0;
    console.log('SIMING : tests\n');
    for (const f of FILES) require(f)(test);
    for (const t of queue) {
        app.reset();
        try {
            await t.fn();
            passed++;
            console.log('  OK    ' + t.name);
        } catch (e) {
            failed++;
            console.log('  ECHEC ' + t.name + '\n        ' + (e.stack || e));
        }
    }
    console.log('\n' + passed + ' réussi(s), ' + failed + ' échoué(s)');
    process.exit(failed ? 1 : 0);
})();
