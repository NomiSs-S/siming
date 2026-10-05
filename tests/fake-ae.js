'use strict';
/*
 * Faux After Effects et faux système de fichiers pour tester le cœur hôte
 * (extension/host/*.jsx) sous Node, sans After Effects.
 *
 * Comportements imités volontairement :
 *  - comp.layer(i) et layer.parent renvoient un NOUVEL objet à chaque accès :
 *    comparer deux calques avec === est donc faux, comme en ExtendScript.
 *  - Index des calques et des éléments du projet à partir de 1.
 *  - Un calque verrouillé lève une erreur si on modifie parent ou comment.
 *  - Une parenté cyclique lève une erreur.
 *  - app.beginUndoGroup / endUndoGroup sont comptés.
 *  - $.global est le contexte global du bac à sable, comme en ExtendScript.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let nextId = 1000;

/** Classe de base pour que `item instanceof CompItem` fonctionne. */
function CompItem() {}

/** Poignée vers l'état d'un calque : un objet neuf par accès, état partagé. */
function LayerRef(state, comp) {
    Object.defineProperty(this, '_state', { value: state, enumerable: false });
    Object.defineProperty(this, 'id', { get: () => state.id, enumerable: true });
    Object.defineProperty(this, 'index', { get: () => comp.layers.indexOf(state) + 1, enumerable: true });
    Object.defineProperty(this, 'name', { get: () => state.name, set: (v) => { state.name = String(v); }, enumerable: true });
    Object.defineProperty(this, 'comment', {
        get: () => state.comment,
        set: (v) => {
            if (state.locked) throw new Error('Unable to set comment: layer is locked');
            state.comment = String(v);
        },
        enumerable: true,
    });
    Object.defineProperty(this, 'locked', { get: () => state.locked, set: (v) => { state.locked = !!v; }, enumerable: true });
    Object.defineProperty(this, 'parent', {
        get: () => (state.parent && comp.layers.indexOf(state.parent) >= 0) ? new LayerRef(state.parent, comp) : null,
        set: (v) => {
            if (state.locked) throw new Error('Unable to set parent: layer is locked');
            if (v === null) { state.parent = null; return; }
            const target = v && v._state;
            if (!target) throw new Error('Unable to set parent: not a layer');
            if (target === state) throw new Error('Unable to set parent: a layer cannot be its own parent');
            for (let p = target.parent; p; p = p.parent) {
                if (p === state) throw new Error('Unable to set parent: cycle');
            }
            state.parent = target;
        },
        enumerable: true,
    });
}

class FakeComp extends CompItem {
    constructor(id, name, opts) {
        super();
        this.id = id;
        this.name = name;
        this.layers = [];
        this.selection = [];
        this.noIds = !!(opts && opts.noIds);   // imite une version d'AE sans Layer.id
    }
    get numLayers() { return this.layers.length; }
    layer(i) {
        if (i < 1 || i > this.layers.length) throw new Error('Layer index out of range: ' + i);
        return new LayerRef(this.layers[i - 1], this);
    }
    get selectedLayers() { return this.selection.map((s) => new LayerRef(s, this)); }
    /** Ajoute un calque et renvoie son ÉTAT interne (pas une poignée). */
    addLayer(name, opts) {
        const state = Object.assign(
            { id: this.noIds ? undefined : nextId++, name, comment: '', locked: false, parent: null },
            opts || {}
        );
        this.layers.push(state);
        return state;
    }
    select(...states) { this.selection = states; }
    removeLayer(state) {
        const i = this.layers.indexOf(state);
        if (i >= 0) this.layers.splice(i, 1);
        this.selection = this.selection.filter((s) => s !== state);
    }
}

const app = {
    // project.item(i) commence à 1, comme dans ExtendScript
    project: {
        activeItem: null,
        items: [],
        get numItems() { return this.items.length; },
        item(i) { return this.items[i - 1]; },
    },
    undoDepth: 0,
    undoGroups: [],
    beginUndoGroup(name) { this.undoDepth++; this.undoGroups.push(name); },
    endUndoGroup() { this.undoDepth--; },
    reset() {
        this.project.activeItem = null;
        this.project.items = [];
        this.undoDepth = 0;
        this.undoGroups = [];
    },
};

// ---------------------------------------------------------------------------
//  Faux système de fichiers (lit le vrai disque)
// ---------------------------------------------------------------------------

function normalize(p) { return path.normalize(String(p)); }

class FakeFile {
    constructor(p) { this.path = normalize(p); }
    get name() { return path.basename(this.path); }
    get fsName() { return this.path; }
    get absoluteURI() { return this.path.replace(/\\/g, '/'); }
    get exists() { return fs.existsSync(this.path) && fs.statSync(this.path).isFile(); }
    get parent() { return new FakeFolder(path.dirname(this.path)); }
    toString() { return this.absoluteURI; }
}

class FakeFolder {
    constructor(p) { this.path = normalize(p); }
    get name() { return path.basename(this.path); }
    get fsName() { return this.path; }
    get absoluteURI() { return this.path.replace(/\\/g, '/'); }
    get exists() { return fs.existsSync(this.path) && fs.statSync(this.path).isDirectory(); }
    get parent() { return new FakeFolder(path.dirname(this.path)); }
    getFiles(mask) {
        if (!this.exists) return [];
        const re = mask ? new RegExp('^' + String(mask).replace(/\./g, '\\.').replace(/\*/g, '.*') + '$', 'i') : null;
        return fs.readdirSync(this.path)
            .filter((n) => !re || re.test(n))
            .map((n) => {
                const full = path.join(this.path, n);
                return fs.statSync(full).isDirectory() ? new FakeFolder(full) : new FakeFile(full);
            });
    }
    toString() { return this.absoluteURI; }
}

// ---------------------------------------------------------------------------
//  Bac à sable
// ---------------------------------------------------------------------------

/** Évalue un fichier .jsx dans le bac à sable, $.fileName pointant dessus. */
function runFile(sandbox, file) {
    const filePath = (file && file.path) ? file.path : normalize(file);
    const src = fs.readFileSync(filePath, 'utf8').replace(/^﻿/, '');
    const prev = sandbox.$.fileName;
    sandbox.$.fileName = filePath;
    try {
        return vm.runInContext(src, sandbox, { filename: filePath });
    } finally {
        sandbox.$.fileName = prev;
    }
}

/** Nouveau bac à sable : app, CompItem, File, Folder, $, alert. $.global = le global. */
function createSandbox() {
    const sandbox = { app, CompItem, File: FakeFile, Folder: FakeFolder, alerts: [] };
    sandbox.alert = (msg) => sandbox.alerts.push(String(msg));
    sandbox.$ = { global: sandbox, fileName: '', evalFile: (file) => runFile(sandbox, file) };
    vm.createContext(sandbox);
    return sandbox;
}

module.exports = { CompItem, FakeComp, LayerRef, app, FakeFile, FakeFolder, createSandbox, runFile };
