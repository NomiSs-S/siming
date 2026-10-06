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
const P = require('./fake-ae-props');

let nextId = 1000;

/** Classe de base pour que `item instanceof CompItem` fonctionne. */
function CompItem() {}

/** Poignée vers l'état d'un calque : un objet neuf par accès, état partagé. */
function LayerRef(state, comp) {
    Object.defineProperty(this, '_state', { value: state, enumerable: false });
    Object.defineProperty(this, '_comp', { value: comp, enumerable: false });
    const ctx = { comp, layerState: state, layerRef: () => refOf(state, comp) };
    Object.defineProperty(this, '_ctx', { value: ctx, enumerable: false });
    Object.defineProperty(this, 'id', { get: () => state.id, enumerable: true });
    Object.defineProperty(this, 'selected', {
        get: () => comp.selection.indexOf(state) >= 0,
        set: (v) => {
            const i = comp.selection.indexOf(state);
            if (v && i < 0) comp.selection.push(state);
            if (!v && i >= 0) comp.selection.splice(i, 1);
        },
        enumerable: true,
    });
    Object.defineProperty(this, 'threeDLayer', { get: () => state.threeD, enumerable: true });
    Object.defineProperty(this, 'numProperties', { get: () => 2, enumerable: false });   // Transformation, Effets
    Object.defineProperty(this, 'transform', { get: () => new P.GroupRef(state.transform, ctx), enumerable: false });
    Object.defineProperty(this, 'anchorPoint', { get: () => this.transform.property('ADBE Anchor Point'), enumerable: false });
    Object.defineProperty(this, 'position', { get: () => this.transform.property('ADBE Position'), enumerable: false });
    Object.defineProperty(this, 'scale', { get: () => this.transform.property('ADBE Scale'), enumerable: false });
    Object.defineProperty(this, 'rotation', { get: () => this.transform.property('ADBE Rotate Z'), enumerable: false });
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
    // Étiquette de couleur : 0 = aucune, 1 à 16 = couleurs des Préférences › Étiquettes
    Object.defineProperty(this, 'label', { get: () => state.label, set: (v) => { state.label = Number(v); }, enumerable: true });
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

/** property('ADBE Transform Group' | 'Transform' | 'ADBE Effect Parade' | 'Effects' | matchName ou nom d'une propriété de transformation). */
LayerRef.prototype.property = function (x) {
    const st = this._state;
    if (x === 1 || x === 'ADBE Transform Group' || x === 'Transform') return new P.GroupRef(st.transform, this._ctx);
    if (x === 2 || x === 'ADBE Effect Parade' || x === 'Effects') return new P.GroupRef(st.effects, this._ctx);
    if (typeof x === 'number') return null;
    return this.transform.property(x) || this.property('ADBE Effect Parade').property(x);
};

/** effect(nom | index 1..n) -> poignée de l'effet, ou null. */
LayerRef.prototype.effect = function (x) {
    return this.property('ADBE Effect Parade').property(x);
};

/** Boîte visible du calque dans son propre espace ({ top, left, width, height }). */
LayerRef.prototype.sourceRectAtTime = function () {
    return Object.assign({}, this._state.rect);
};

/** Imite AE : le préréglage s'applique aux calques SÉLECTIONNÉS de la comp
 *  (au calque appelé si rien n'est sélectionné). Seul ElasticController.ffx est connu. */
LayerRef.prototype.applyPreset = function (file) {
    if (!file || !file.exists) throw new Error('Unable to apply preset: file not found (' + (file && file.fsName) + ')');
    if (!/ElasticController\.ffx$/i.test(file.name)) throw new Error('Unknown preset in this fake: ' + file.name);
    const comp = this._comp;
    const targets = comp.selection.length ? comp.selection.slice() : [this._state];
    for (const st of targets) {
        if (st.locked) throw new Error('Unable to apply preset: layer is locked');
        const fx = P.makeElasticController();
        fx.parent = st.effects;
        st.effects.children.push(fx);
    }
    app.presetsApplied.push({ file: file.name, layers: targets.map((s) => s.name) });
};

/** Caméras et lumières : pas de boîte visible ni de préréglage. */
function CameraLayerRef(state, comp) { LayerRef.call(this, state, comp); }
CameraLayerRef.prototype = Object.create(LayerRef.prototype);
CameraLayerRef.prototype.constructor = CameraLayerRef;
CameraLayerRef.prototype.sourceRectAtTime = undefined;
function LightLayerRef(state, comp) { LayerRef.call(this, state, comp); }
LightLayerRef.prototype = Object.create(LayerRef.prototype);
LightLayerRef.prototype.constructor = LightLayerRef;
LightLayerRef.prototype.sourceRectAtTime = undefined;

/** Poignée de la bonne classe selon le genre du calque. */
function refOf(state, comp) {
    if (state.kind === 'camera') return new CameraLayerRef(state, comp);
    if (state.kind === 'light') return new LightLayerRef(state, comp);
    return new LayerRef(state, comp);
}

class FakeComp extends CompItem {
    constructor(id, name, opts) {
        super();
        this.id = id;
        this.name = name;
        this.layers = [];
        this.selection = [];
        this.noIds = !!(opts && opts.noIds);   // imite une version d'AE sans Layer.id
        this.time = 0;
        this.width = (opts && opts.width) || 1920;
        this.height = (opts && opts.height) || 1080;
        this.frameDuration = 1 / 25;
    }
    get numLayers() { return this.layers.length; }
    layer(i) {
        if (i < 1 || i > this.layers.length) throw new Error('Layer index out of range: ' + i);
        return refOf(this.layers[i - 1], this);
    }
    get selectedLayers() { return this.selection.map((s) => refOf(s, this)); }
    /** Propriétés sélectionnées de tous les calques, dans l'ordre des calques puis de l'arbre. */
    get selectedProperties() {
        const out = [];
        for (const st of this.layers) {
            const ctx = refOf(st, this)._ctx;
            P.selectedStates(st.transform).concat(P.selectedStates(st.effects)).forEach((s) => out.push(P.refFor(s, ctx)));
        }
        return out;
    }
    /** Ajoute un calque et renvoie son ÉTAT interne (pas une poignée).
     *  opts : kind ('av' | 'camera' | 'light'), threeD, rect { top, left, width, height }, locked, label… */
    addLayer(name, opts) {
        const o = opts || {};
        const state = Object.assign(
            {
                id: this.noIds ? undefined : nextId++, name, comment: '', locked: false, parent: null, label: 1,
                kind: o.kind || 'av', threeD: !!o.threeD,
                transform: P.makeTransform(!!o.threeD), effects: P.makeEffects(),
                rect: { top: 0, left: 0, width: 100, height: 100 },
            },
            o
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

/** Couleurs d'étiquettes par défaut d'After Effects (ARGB), étiquettes 1 à 16. */
const LABEL_SECTION = 'Label Preference Color Section 5';
const DEFAULT_LABELS = [
    'FFB53838', 'FFE4D84C', 'FFA9CBC7', 'FFE5BCC9', 'FFA9A9CA', 'FFE7C19E', 'FFB3C7B3', 'FF677DE0',
    'FF4AA44C', 'FF8E2C9A', 'FFE8920D', 'FF7F452A', 'FFF46DD6', 'FF3DA2A5', 'FFA89677', 'FF1E401E',
];

/** Faux app.preferences : getPrefAsString renvoie les 4 octets ARGB sous forme de
 *  caractères, comme After Effects en encodage BINARY. `labels[i]` = étiquette n° i + 1. */
function makePreferences() {
    return {
        labels: DEFAULT_LABELS.slice(),
        reads: [],
        havePref(section, key) { return this._index(section, key) !== null; },
        getPrefAsString(section, key) {
            const i = this._index(section, key);
            if (i === null) throw new Error('Pref not found: ' + section + ' / ' + key);
            this.reads.push(key);
            let s = '';
            for (let b = 0; b < 8; b += 2) s += String.fromCharCode(parseInt(this.labels[i].substr(b, 2), 16));
            return s;
        },
        _index(section, key) {
            const m = section === LABEL_SECTION ? /^Label Color ID 2 # (\d+)$/.exec(key) : null;
            const n = m ? Number(m[1]) : 0;
            return (n >= 1 && n <= this.labels.length) ? n - 1 : null;
        },
    };
}

const app = {
    // project.item(i) commence à 1, comme dans ExtendScript
    project: {
        activeItem: null,
        items: [],
        get numItems() { return this.items.length; },
        item(i) { return this.items[i - 1]; },
    },
    preferences: makePreferences(),
    presetsApplied: [],
    undoDepth: 0,
    undoGroups: [],
    beginUndoGroup(name) { this.undoDepth++; this.undoGroups.push(name); },
    endUndoGroup() { this.undoDepth--; },
    reset() {
        this.project.activeItem = null;
        this.project.items = [];
        this.preferences = makePreferences();
        this.presetsApplied = [];
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
    const sandbox = {
        app, CompItem, File: FakeFile, Folder: FakeFolder, alerts: [],
        AVLayer: LayerRef, CameraLayer: CameraLayerRef, LightLayer: LightLayerRef,
        KeyframeEase: P.KeyframeEase, KeyframeInterpolationType: P.KeyframeInterpolationType,
        PropertyValueType: P.PropertyValueType, PropertyType: P.PropertyType,
    };
    sandbox.alert = (msg) => sandbox.alerts.push(String(msg));
    sandbox.$ = { global: sandbox, fileName: '', evalFile: (file) => runFile(sandbox, file) };
    vm.createContext(sandbox);
    return sandbox;
}

module.exports = {
    CompItem, FakeComp, LayerRef, CameraLayerRef, LightLayerRef, app, FakeFile, FakeFolder, createSandbox, runFile,
    KeyframeEase: P.KeyframeEase, KeyframeInterpolationType: P.KeyframeInterpolationType, PropertyType: P.PropertyType,
};
