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
    Object.defineProperty(this, 'threeDLayer', { get: () => state.threeD, set: (v) => setThreeD(state, !!v), enumerable: true });
    // Temps : startTime déplace le calque, ses points d'entrée / sortie et toutes ses keyframes
    const editable = (what) => { if (state.locked) throw new Error('Unable to set ' + what + ': layer is locked'); };
    Object.defineProperty(this, 'inPoint', { get: () => state.inPoint, set: (v) => { editable('inPoint'); state.inPoint = Number(v); }, enumerable: true });
    Object.defineProperty(this, 'outPoint', { get: () => state.outPoint, set: (v) => { editable('outPoint'); state.outPoint = Number(v); }, enumerable: true });
    Object.defineProperty(this, 'startTime', {
        get: () => state.startTime,
        set: (v) => {
            editable('startTime');
            const d = Number(v) - state.startTime;
            state.startTime += d;
            state.inPoint += d;
            state.outPoint += d;
            for (const g of [state.transform, state.effects].concat(state.contents ? [state.contents] : [])) {
                for (const p of P.allProps(g)) p.keys.forEach((k) => { k.time += d; });
            }
        },
        enumerable: true,
    });
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
    // Nature : calque nul / de réglage, source (FootageItem, FakeComp) ou null
    Object.defineProperty(this, 'nullLayer', { get: () => !!state.nullLayer, enumerable: true });
    Object.defineProperty(this, 'adjustmentLayer', { get: () => !!state.adjustmentLayer, enumerable: true });
    Object.defineProperty(this, 'source', { get: () => state.source || null, enumerable: false });
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

/** Calque 3D : ancrage, position et échelle gagnent (ou perdent) leur Z. */
function setThreeD(state, on) {
    if (state.threeD === on) return;
    state.threeD = on;
    const z = { 'ADBE Anchor Point': 0, 'ADBE Position': 0, 'ADBE Scale': 100 };
    const fix = (v, mn) => (on ? v.slice(0, 2).concat([z[mn]]) : v.slice(0, 2));
    for (const c of state.transform.children) {
        if (!(c.matchName in z) || !Array.isArray(c.value)) continue;
        c.value = fix(c.value, c.matchName);
        c.keys.forEach((k) => { k.value = fix(k.value, c.matchName); });
    }
}

/** Ordre dans la pile : avant un autre calque, ou tout en bas. */
LayerRef.prototype.moveBefore = function (other) {
    const arr = this._comp.layers;
    arr.splice(arr.indexOf(this._state), 1);
    arr.splice(arr.indexOf(other._state), 0, this._state);
};
LayerRef.prototype.moveToEnd = function () {
    const arr = this._comp.layers;
    arr.splice(arr.indexOf(this._state), 1);
    arr.push(this._state);
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

/** Calque texte : texte affiché dans state.text (Source Text). */
function TextLayerRef(state, comp) { LayerRef.call(this, state, comp); }
TextLayerRef.prototype = Object.create(LayerRef.prototype);
TextLayerRef.prototype.constructor = TextLayerRef;
TextLayerRef.prototype.property = function (x) {
    const st = this._state;
    if (x === 'ADBE Text Properties') {
        return { property: (y) => (y === 'ADBE Text Document' ? { value: { text: st.text || '' } } : null) };
    }
    return LayerRef.prototype.property.call(this, x);
};
function ShapeLayerRef(state, comp) { LayerRef.call(this, state, comp); }
ShapeLayerRef.prototype = Object.create(LayerRef.prototype);
ShapeLayerRef.prototype.constructor = ShapeLayerRef;
/** Calque de forme : contenus (« ADBE Root Vectors Group ») en plus de la transformation. */
ShapeLayerRef.prototype.property = function (x) {
    if (x === 'ADBE Root Vectors Group' || x === 'Contents') {
        if (!this._state.contents) this._state.contents = P.makeShapeContents();
        return new P.GroupRef(this._state.contents, this._ctx);
    }
    return LayerRef.prototype.property.call(this, x);
};

/** Poignée de la bonne classe selon le genre du calque. */
function refOf(state, comp) {
    if (state.kind === 'camera') return new CameraLayerRef(state, comp);
    if (state.kind === 'light') return new LightLayerRef(state, comp);
    if (state.kind === 'text') return new TextLayerRef(state, comp);
    if (state.kind === 'shape') return new ShapeLayerRef(state, comp);
    return new LayerRef(state, comp);
}

// ---------------------------------------------------------------------------
//  Éléments du projet : sources des calques et dossiers
// ---------------------------------------------------------------------------

function SolidSource() {}
function PlaceholderSource() {}
/** Source fichier : file (FakeFile), isStill (image fixe). */
function FileSource(file, isStill) { this.file = file; this.isStill = !!isStill; }

class FolderItem {
    constructor(name, parentFolder) {
        this.id = nextId++;
        this.name = name;
        this.parentFolder = parentFolder || null;
    }
}

/** Métrage : mainSource (SolidSource | FileSource | PlaceholderSource), hasVideo, hasAudio. */
class FootageItem {
    constructor(name, mainSource, opts) {
        const o = opts || {};
        this.id = nextId++;
        this.name = name;
        this.mainSource = mainSource;
        this.hasVideo = o.hasVideo !== undefined ? !!o.hasVideo : true;
        this.hasAudio = !!o.hasAudio;
        this.parentFolder = o.parentFolder || null;
        this.label = 0;
        this.selected = false;   // panneau Projet
    }
}

/** En-tête PNG (signature + bloc IHDR) d'une image w × h : ce que lit le cœur hôte. */
function pngHeader(w, h) {
    const b = Buffer.alloc(33);
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]).copy(b, 0);
    b.writeUInt32BE(13, 8);
    b.write('IHDR', 12, 'latin1');
    b.writeUInt32BE(w, 16);
    b.writeUInt32BE(h, 20);
    b[24] = 8; b[25] = 6;
    return b;
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
        this.duration = 10;
        this.bgColor = [0, 0, 0];
        this.selected = false;   // panneau Projet
        this.frames = [];        // instants rendus par saveFrameToPng
        const comp = this;
        let nulls = 0, shapes = 0;
        // comp.layers est aussi la LayerCollection d'AE : addNull, addShape (calque ajouté tout en haut)
        Object.defineProperty(this.layers, 'addNull', {
            value(duration) {
                const st = comp._state('Nul ' + (++nulls), { nullLayer: true, source: new FootageItem('Nul ' + nulls, new SolidSource()), outPoint: duration || comp.duration });
                st.transform.children.find((c) => c.matchName === 'ADBE Anchor Point').value = [50, 50];
                st.transform.children.find((c) => c.matchName === 'ADBE Position').value = [comp.width / 2, comp.height / 2];
                comp.layers.unshift(st);
                return refOf(st, comp);
            },
        });
        Object.defineProperty(this.layers, 'addShape', {
            value() {
                const st = comp._state('Calque de forme ' + (++shapes), { kind: 'shape' });
                st.transform.children.find((c) => c.matchName === 'ADBE Position').value = [comp.width / 2, comp.height / 2];
                comp.layers.unshift(st);
                return refOf(st, comp);
            },
        });
    }
    /** Imite AE : écrit un PNG (en-tête seulement) à la taille de la comp. */
    saveFrameToPng(time, file) {
        this.frames.push(time);
        fs.mkdirSync(path.dirname(file.fsName), { recursive: true });
        fs.writeFileSync(file.fsName, pngHeader(this.width, this.height));
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
        const state = this._state(name, opts);
        this.layers.push(state);
        return state;
    }
    /** État neuf d'un calque (non rangé dans la pile). */
    _state(name, opts) {
        const o = opts || {};
        return Object.assign(
            {
                id: this.noIds ? undefined : nextId++, name, comment: '', locked: false, parent: null, label: 1,
                kind: o.kind || 'av', threeD: !!o.threeD,
                transform: P.makeTransform(!!o.threeD), effects: P.makeEffects(),
                contents: o.kind === 'shape' ? P.makeShapeContents() : null,
                rect: { top: 0, left: 0, width: 100, height: 100 },
                startTime: 0, inPoint: 0, outPoint: this.duration,
            },
            o
        );
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
/** Noms d'origine des étiquettes, tels que les préférences les gardent (anglais). */
const LABEL_TEXT_SECTION = 'Label Preference Text Section 7';
const DEFAULT_LABEL_NAMES = [
    'Red', 'Yellow', 'Aqua', 'Pink', 'Lavender', 'Peach', 'Sea Foam', 'Blue',
    'Green', 'Purple', 'Orange', 'Brown', 'Fuchsia', 'Cyan', 'Sandstone', 'Dark Green',
];

const SCRIPT_WRITE_KEY = 'Pref_SCRIPTING_FILE_NETWORK_SECURITY';

/** Commandes de menu connues (noms anglais, comme un After Effects en anglais). */
const MENU_COMMANDS = { 'Convert to Editable Text': 3799, 'Reveal Layer Source in Project': 2517 };

/** Faux app.preferences : getPrefAsString renvoie les 4 octets ARGB sous forme de
 *  caractères, comme After Effects en encodage BINARY. `labels[i]` = étiquette n° i + 1. */
function makePreferences() {
    return {
        labels: DEFAULT_LABELS.slice(),
        names: DEFAULT_LABEL_NAMES.slice(),
        reads: [],
        // « Autoriser les scripts à écrire des fichiers… » : true, false, ou null (préférence absente)
        scriptWrite: null,
        havePref(section, key) {
            if (key === SCRIPT_WRITE_KEY) return section === 'Main Pref Section v2' && this.scriptWrite !== null;
            return this._index(section, key) !== null;
        },
        getPrefAsLong(section, key) {
            if (key === SCRIPT_WRITE_KEY && section === 'Main Pref Section v2' && this.scriptWrite !== null) return this.scriptWrite ? 1 : 0;
            throw new Error('Pref not found: ' + section + ' / ' + key);
        },
        getPrefAsString(section, key) {
            const i = this._index(section, key);
            if (i === null) throw new Error('Pref not found: ' + section + ' / ' + key);
            if (section === LABEL_TEXT_SECTION) return this.names[i];
            this.reads.push(key);
            let s = '';
            for (let b = 0; b < 8; b += 2) s += String.fromCharCode(parseInt(this.labels[i].substr(b, 2), 16));
            return s;
        },
        _index(section, key) {
            let m = null;
            if (section === LABEL_SECTION) m = /^Label Color ID 2 # (\d+)$/.exec(key);
            if (section === LABEL_TEXT_SECTION) m = /^Label Text ID 2 # (\d+)$/.exec(key);
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
        /** Éléments sélectionnés dans le panneau Projet. */
        get selection() { return this.items.filter((it) => it.selected); },
        rootFolder: new FolderItem('Racine'),
    },
    preferences: makePreferences(),
    presetsApplied: [],
    undoDepth: 0,
    undoGroups: [],
    commands: [],          // identifiants passés à executeCommand
    menuNames: MENU_COMMANDS,
    beginUndoGroup(name) { this.undoDepth++; this.undoGroups.push(name); },
    endUndoGroup() { this.undoDepth--; },
    /** 0 si le nom n'est pas celui d'une commande (autre langue d'AE). */
    findMenuCommandId(name) { return this.menuNames[name] || 0; },
    /** 3799 « Convert to Editable Text » : chaque calque sélectionné marqué psdText devient
     *  un calque texte (sa source disparaît). Les autres commandes sont seulement notées. */
    executeCommand(id) {
        this.commands.push(id);
        const comp = this.project.activeItem;
        if (id !== 3799 || !comp || !comp.selection) return;
        for (const st of comp.selection) {
            if (!st.psdText) continue;
            st.kind = 'text';
            st.text = st.psdText;
            st.source = null;
            delete st.psdText;
        }
    },
    reset() {
        this.project.activeItem = null;
        this.project.items = [];
        this.preferences = makePreferences();
        this.presetsApplied = [];
        this.undoDepth = 0;
        this.undoGroups = [];
        this.commands = [];
        this.menuNames = MENU_COMMANDS;
    },
};

// ---------------------------------------------------------------------------
//  Faux système de fichiers (lit le vrai disque)
// ---------------------------------------------------------------------------

function normalize(p) { return path.normalize(String(p)); }

class FakeFile {
    constructor(p) { this.path = normalize(p); }
    get name() { return path.basename(this.path); }
    get displayName() { return decodeURIComponent(this.name); }
    get fsName() { return this.path; }
    get absoluteURI() { return this.path.replace(/\\/g, '/'); }
    get exists() { return fs.existsSync(this.path) && fs.statSync(this.path).isFile(); }
    get parent() { return new FakeFolder(path.dirname(this.path)); }
    get length() { return this.exists ? fs.statSync(this.path).size : 0; }
    /** Lecture seulement ('r') ; read(n) rend n octets, un caractère par octet (BINARY). */
    open(mode) {
        if (mode !== 'r' || !this.exists) return false;
        this._pos = 0;
        return true;
    }
    read(n) {
        const buf = fs.readFileSync(this.path).subarray(this._pos, this._pos + n);
        this._pos += buf.length;
        return buf.toString('latin1');
    }
    close() { return true; }
    remove() {
        try { fs.unlinkSync(this.path); return true; } catch (e) { return false; }
    }
    toString() { return this.absoluteURI; }
}

class FakeFolder {
    constructor(p) { this.path = normalize(p); }
    get name() { return path.basename(this.path); }
    get fsName() { return this.path; }
    get absoluteURI() { return this.path.replace(/\\/g, '/'); }
    get exists() { return fs.existsSync(this.path) && fs.statSync(this.path).isDirectory(); }
    get parent() { return new FakeFolder(path.dirname(this.path)); }
    /** Dossier temporaire du système (Folder.temp), ici un sous-dossier propre aux tests. */
    static get temp() { return new FakeFolder(path.join(require('os').tmpdir(), 'siming-fake-ae')); }
    create() { fs.mkdirSync(this.path, { recursive: true }); return true; }
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
        TextLayer: TextLayerRef, ShapeLayer: ShapeLayerRef,
        FootageItem, FolderItem, SolidSource, FileSource, PlaceholderSource,
        KeyframeEase: P.KeyframeEase, KeyframeInterpolationType: P.KeyframeInterpolationType,
        PropertyValueType: P.PropertyValueType, PropertyType: P.PropertyType,
    };
    sandbox.alert = (msg) => sandbox.alerts.push(String(msg));
    // system.callSystem : commandes notées, rien n'est lancé
    sandbox.system = { calls: [], callSystem(cmd) { this.calls.push(String(cmd)); return ''; } };
    // $.colorPicker : couleurs de départ notées ; renvoie pickedColor (-1 = annulé)
    sandbox.colorPicks = [];
    sandbox.pickedColor = 0x336699;
    sandbox.$ = {
        global: sandbox, fileName: '', os: 'Windows/64 10.0', evalFile: (file) => runFile(sandbox, file),
        colorPicker: (c) => { sandbox.colorPicks.push(c); return sandbox.pickedColor; },
    };
    vm.createContext(sandbox);
    return sandbox;
}

module.exports = {
    CompItem, FakeComp, LayerRef, CameraLayerRef, LightLayerRef, TextLayerRef, ShapeLayerRef, app, FakeFile, FakeFolder, createSandbox, runFile,
    FootageItem, FolderItem, SolidSource, FileSource, PlaceholderSource,
    KeyframeEase: P.KeyframeEase, KeyframeInterpolationType: P.KeyframeInterpolationType, PropertyType: P.PropertyType,
};
