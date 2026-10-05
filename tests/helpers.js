'use strict';
/* Outils partagés par les tests : chemins, scènes After Effects. */
const path = require('path');
const vm = require('vm');
const fs = require('fs');
const { FakeComp, app, createSandbox, runFile } = require('./fake-ae');

const ROOT   = path.join(__dirname, '..');
const EXT    = path.join(ROOT, 'extension');
const HOST   = path.join(EXT, 'host', 'siming.jsx');
const CLIENT = path.join(EXT, 'client');

/** Scène de référence (comp 100 « Comp 1 », active) : P parent ; A et B liés ;
 *  C sans lien ; D déjà détaché (balise vers P). */
function scene(opts) {
    const comp = new FakeComp(100, 'Comp 1', opts);
    const P = comp.addLayer('Parent');
    const A = comp.addLayer('A'); A.parent = P;
    const B = comp.addLayer('B'); B.parent = P;
    const C = comp.addLayer('C');
    const D = comp.addLayer('D');
    D.comment = 'note perso [UP|' + (P.id === undefined ? 1 : P.id) + '|Parent]';
    app.project.activeItem = comp;
    app.project.items.push(comp);
    return { comp, P, A, B, C, D };
}

/** Seconde comp (200 « Comp 2 ») : parent « Tete » dont 2 enfants sont détachés. */
function otherComp() {
    const comp = new FakeComp(200, 'Comp 2');
    const T  = comp.addLayer('Tete');
    const E1 = comp.addLayer('Oeil_G');
    const E2 = comp.addLayer('Oeil_D');
    E1.comment = '[UP|' + T.id + '|Tete]';
    E2.comment = '[UP|' + T.id + '|Tete]';
    app.project.items.push(comp);
    return { comp, T, E1, E2 };
}

/** Bac à sable neuf avec le cœur hôte chargé (il charge aussi host/tools/*.jsx). */
function loadHost() {
    const sandbox = createSandbox();
    runFile(sandbox, HOST);
    return { sandbox, S: sandbox.SIMING };
}

/** Appelle le routeur comme le fait le pont, renvoie l'enveloppe décodée. */
function callHost(sandbox, tool, fn, args) {
    const script = 'SIMING.call(' + JSON.stringify(tool) + ',' + JSON.stringify(fn) + ',"' +
        encodeURIComponent(JSON.stringify(args || {})) + '")';
    return JSON.parse(decodeURIComponent(vm.runInContext(script, sandbox)));
}

/** Cœur hôte chargé + accès direct au cœur Unparent (fonctions _core). */
function loadUnparent() {
    const h = loadHost();
    const tool = h.S.getTool('unparent');
    if (!tool) throw new Error('outil hôte « unparent » non chargé');
    return Object.assign(h, { core: tool._core });
}

/** Évalue des scripts de extension/client/ dans `win` (window jsdom ou contexte vm). */
function loadClientScripts(win, files) {
    for (const f of files) {
        const src = fs.readFileSync(path.join(CLIENT, f), 'utf8');
        if (typeof win.eval === 'function') win.eval(src);
        else vm.runInContext(src, win);
    }
    return win;
}

/** Faux CSInterface.evalScript : évalue dans le faux AE, rappel asynchrone.
 *  counter (facultatif) : objet { calls } incrémenté à chaque appel. */
function hostEvalScript(sandbox, counter) {
    return (script, callback) => {
        if (counter) counter.calls++;
        let result;
        try { result = String(vm.runInContext(script, sandbox)); } catch (e) { result = 'EvalScript error.'; }
        setTimeout(() => callback(result), 0);
    };
}

/** Fenêtre jsdom avec des scripts du panneau chargés (chemins relatifs à extension/client/). */
function makeDom(files, url) {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<!doctype html><html lang="fr"><head></head><body><div id="app"></div></body></html>',
        { runScripts: 'outside-only', url: url || 'http://localhost/index.html' });
    return loadClientScripts(dom.window, files || []);
}

module.exports = { ROOT, EXT, HOST, CLIENT, scene, otherComp, loadHost, callHost, loadUnparent, loadClientScripts, hostEvalScript, makeDom, app };
