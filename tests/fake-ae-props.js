'use strict';
/*
 * Faux modèle de propriétés After Effects pour les tests : propriétés, keyframes,
 * groupes, effets. Comme pour les calques, chaque accès renvoie une POIGNÉE NEUVE
 * sur un état partagé (comparer deux poignées avec === est faux, comme en ExtendScript).
 * Sous-ensemble de l'API ExtendScript utilisé par SIMING ; les règles d'AE qui
 * piègent sont imitées (longueur des tableaux d'ease, setValue avec keyframes,
 * influence hors 0,1–100, dimensions séparées).
 */

const KeyframeInterpolationType = { LINEAR: 6612, BEZIER: 6613, HOLD: 6614 };
const PropertyValueType = {
    NO_VALUE: 6412, ThreeD_SPATIAL: 6413, ThreeD: 6414, TwoD_SPATIAL: 6415, TwoD: 6416, OneD: 6417,
    COLOR: 6418, CUSTOM_VALUE: 6419, MARKER: 6420, LAYER_INDEX: 6421, MASK_INDEX: 6422, SHAPE: 6423, TEXT_DOCUMENT: 6424,
};
const PropertyType = { PROPERTY: 6212, INDEXED_GROUP: 6213, NAMED_GROUP: 6214 };

function KeyframeEase(speed, influence) {
    if (!(influence >= 0.1 && influence <= 100)) throw new Error('KeyframeEase: influence must be between 0.1 and 100');
    this.speed = Number(speed);
    this.influence = Number(influence);
}

const EPS = 1e-6;
const copy = (v) => (Array.isArray(v) ? v.slice() : v);
const dimsOf = (v) => (Array.isArray(v) ? v.length : 1);

// ---------------------------------------------------------------------------
//  États
// ---------------------------------------------------------------------------

/** État d'une propriété : { name, matchName, value, spatial, canSetExpression }. */
function makePropState(opts) {
    return {
        kind: 'property',
        name: opts.name, matchName: opts.matchName || opts.name,
        value: copy(opts.value === undefined ? 0 : opts.value),
        spatial: !!opts.spatial,
        keys: [],                         // { time, value, inType, outType, inEase, outEase, selected, inTangent, outTangent, autoBezier }
        expression: '', expressionEnabled: false,
        canSetExpression: opts.canSetExpression !== false,
        selected: false,
        separated: false,                 // Position : dimensions séparées
        hiddenUnlessSeparated: !!opts.hiddenUnlessSeparated,   // X / Y / Z Position
        parent: null,
    };
}

/** État d'un groupe (transformation, effets, un effet). */
function makeGroupState(opts, children) {
    const g = {
        kind: 'group', name: opts.name, matchName: opts.matchName || opts.name,
        indexed: !!opts.indexed, children: [], parent: null, selected: false,
    };
    (children || []).forEach((c) => { c.parent = g; g.children.push(c); });
    return g;
}

/** Groupe Transformation d'un calque (2D ou 3D). */
function makeTransform(threeD) {
    const zero = threeD ? [0, 0, 0] : [0, 0];
    const hundred = threeD ? [100, 100, 100] : [100, 100];
    return makeGroupState({ name: 'Transform', matchName: 'ADBE Transform Group' }, [
        makePropState({ name: 'Anchor Point', matchName: 'ADBE Anchor Point', value: zero, spatial: true }),
        makePropState({ name: 'Position', matchName: 'ADBE Position', value: zero, spatial: true }),
        makePropState({ name: 'X Position', matchName: 'ADBE Position_0', value: 0, hiddenUnlessSeparated: true }),
        makePropState({ name: 'Y Position', matchName: 'ADBE Position_1', value: 0, hiddenUnlessSeparated: true }),
        makePropState({ name: 'Z Position', matchName: 'ADBE Position_2', value: 0, hiddenUnlessSeparated: true }),
        makePropState({ name: 'Scale', matchName: 'ADBE Scale', value: hundred }),
        makePropState({ name: 'Rotation', matchName: 'ADBE Rotate Z', value: 0 }),
        makePropState({ name: 'Opacity', matchName: 'ADBE Opacity', value: 100 }),
    ]);
}

function makeEffects() {
    return makeGroupState({ name: 'Effects', matchName: 'ADBE Effect Parade', indexed: true }, []);
}

/** L'effet « Elastic Controller » tel que le pose le préréglage de l'auteur. */
function makeElasticController() {
    return makeGroupState({ name: 'Elastic Controller', matchName: 'Pseudo/MDS Elastic Controller' }, [
        makePropState({ name: 'Amplitude', matchName: 'Pseudo/MDS Elastic Controller-0001', value: 20 }),
        makePropState({ name: 'Frequency', matchName: 'Pseudo/MDS Elastic Controller-0002', value: 40 }),
        makePropState({ name: 'Decay', matchName: 'Pseudo/MDS Elastic Controller-0003', value: 60 }),
    ]);
}

function makeSliderControl(name) {
    return makeGroupState({ name: name || 'Slider Control', matchName: 'ADBE Slider Control' }, [
        makePropState({ name: 'Slider', matchName: 'ADBE Slider Control-0001', value: 0 }),
    ]);
}

/** Contenus d'un calque de forme : groupe racine, et ce qu'on peut y ajouter. */
function makeShapeContents() {
    return makeGroupState({ name: 'Contents', matchName: 'ADBE Root Vectors Group', indexed: true }, []);
}
const VECTOR_PARENTS = ['ADBE Root Vectors Group', 'ADBE Vectors Group'];
const VECTOR_ITEMS = {
    'ADBE Vector Group': () => makeGroupState({ name: 'Group 1', matchName: 'ADBE Vector Group' }, [
        makeGroupState({ name: 'Contents', matchName: 'ADBE Vectors Group', indexed: true }, []),
        makeGroupState({ name: 'Transform', matchName: 'ADBE Vector Transform Group' }, []),
    ]),
    'ADBE Vector Shape - Rect': () => makeGroupState({ name: 'Rectangle Path 1', matchName: 'ADBE Vector Shape - Rect' }, [
        makePropState({ name: 'Size', matchName: 'ADBE Vector Rect Size', value: [100, 100] }),
        makePropState({ name: 'Position', matchName: 'ADBE Vector Rect Position', value: [0, 0], spatial: true }),
        makePropState({ name: 'Roundness', matchName: 'ADBE Vector Rect Roundness', value: 0 }),
    ]),
    'ADBE Vector Graphic - Fill': () => makeGroupState({ name: 'Fill 1', matchName: 'ADBE Vector Graphic - Fill' }, [
        makePropState({ name: 'Color', matchName: 'ADBE Vector Fill Color', value: [1, 0, 0, 1] }),
    ]),
};

/** Toutes les propriétés (états) d'un groupe, cachées comprises. */
function allProps(g, out) {
    const list = out || [];
    for (const c of g.children) {
        if (c.kind === 'group') allProps(c, list);
        else list.push(c);
    }
    return list;
}

/** Propriétés visibles d'un groupe (X/Y/Z Position seulement en dimensions séparées). */
function visibleChildren(g) {
    const pos = g.children.find((c) => c.matchName === 'ADBE Position');
    const separated = !!(pos && pos.separated);
    return g.children.filter((c) => !c.hiddenUnlessSeparated || separated);
}

function depthOf(state) {
    let d = 0;
    for (let p = state.parent; p; p = p.parent) d++;
    return d + 1;   // + le calque
}

// ---------------------------------------------------------------------------
//  Poignées
// ---------------------------------------------------------------------------

/** ctx = { comp, layerState, layerRef() } fourni par fake-ae. */
function refFor(state, ctx) {
    return state.kind === 'group' ? new GroupRef(state, ctx) : new PropertyRef(state, ctx);
}

function ancestor(state, ctx, n) {
    let s = state;
    for (let i = 0; i < n; i++) {
        if (!s.parent) return ctx.layerRef();
        s = s.parent;
    }
    return refFor(s, ctx);
}

function easeDims(state) { return state.spatial ? 1 : dimsOf(state.value); }
function defaultEase(n) { const a = []; for (let i = 0; i < n; i++) a.push(new KeyframeEase(0, 16.666666667)); return a; }

function lerp(a, b, t) {
    if (Array.isArray(a)) return a.map((x, i) => x + (b[i] - x) * t);
    return a + (b - a) * t;
}

class PropertyRef {
    constructor(state, ctx) {
        Object.defineProperty(this, '_state', { value: state, enumerable: false });
        Object.defineProperty(this, '_ctx', { value: ctx, enumerable: false });
    }
    get name() { return this._state.name; }
    get matchName() { return this._state.matchName; }
    get propertyType() { return PropertyType.PROPERTY; }
    get isSpatial() { return this._state.spatial; }
    get canSetExpression() { return this._state.canSetExpression; }
    get canVaryOverTime() { return true; }
    get propertyDepth() { return depthOf(this._state); }
    propertyGroup(n) { return ancestor(this._state, this._ctx, n === undefined ? 1 : n); }
    get propertyValueType() {
        const s = this._state, d = dimsOf(s.value);
        if (s.valueType) return PropertyValueType[s.valueType];   // test : type imposé (MARKER, CUSTOM_VALUE…)
        if (d === 1) return PropertyValueType.OneD;
        if (d === 2) return s.spatial ? PropertyValueType.TwoD_SPATIAL : PropertyValueType.TwoD;
        return s.spatial ? PropertyValueType.ThreeD_SPATIAL : PropertyValueType.ThreeD;
    }
    get selected() { return this._state.selected; }
    set selected(v) { this._state.selected = !!v; }

    // --- dimensions séparées (Position seulement) ---
    get dimensionsSeparated() { return this._state.separated; }
    set dimensionsSeparated(v) {
        if (this._state.matchName !== 'ADBE Position') throw new Error('dimensionsSeparated: Position only');
        this._state.separated = !!v;
    }
    _checkSeparation() {
        const s = this._state;
        if (s.matchName === 'ADBE Position' && s.separated) throw new Error('Position has separated dimensions: use X/Y Position');
        if (s.hiddenUnlessSeparated) {
            const pos = s.parent && s.parent.children.find((c) => c.matchName === 'ADBE Position');
            if (!pos || !pos.separated) throw new Error(s.name + ' is not available: dimensions are not separated');
        }
    }

    // --- valeurs ---
    get numKeys() { return this._state.keys.length; }
    get value() { return this.valueAtTime(this._ctx.comp.time, true); }
    valueAtTime(t) {
        const keys = this._state.keys;
        if (!keys.length) return copy(this._state.value);
        if (t <= keys[0].time) return copy(keys[0].value);
        for (let i = 0; i < keys.length - 1; i++) {
            const a = keys[i], b = keys[i + 1];
            if (t < b.time) {
                if (a.outType === KeyframeInterpolationType.HOLD) return copy(a.value);
                return lerp(a.value, b.value, (t - a.time) / (b.time - a.time));
            }
        }
        return copy(keys[keys.length - 1].value);
    }
    setValue(v) {
        if (this._ctx.layerState.locked) throw new Error('Unable to set value: layer is locked');
        this._checkSeparation();
        if (this._state.keys.length) throw new Error('Cannot set value: property has keyframes, use setValueAtTime');
        if (dimsOf(v) !== dimsOf(this._state.value)) throw new Error('Wrong number of dimensions for ' + this._state.name);
        this._state.value = copy(v);
    }
    setValueAtTime(t, v) {
        if (this._ctx.layerState.locked) throw new Error('Unable to set value: layer is locked');
        this._checkSeparation();
        if (dimsOf(v) !== dimsOf(this._state.value)) throw new Error('Wrong number of dimensions for ' + this._state.name);
        const keys = this._state.keys;
        let i = keys.findIndex((k) => Math.abs(k.time - t) < EPS);
        if (i < 0) {
            const n = easeDims(this._state);
            const zero = Array.isArray(v) ? v.map(() => 0) : 0;
            keys.push({ time: t, value: copy(v), inType: KeyframeInterpolationType.LINEAR, outType: KeyframeInterpolationType.LINEAR,
                inEase: defaultEase(n), outEase: defaultEase(n), selected: false,
                inTangent: copy(zero), outTangent: copy(zero), autoBezier: this._state.spatial });
            keys.sort((a, b) => a.time - b.time);
            i = keys.findIndex((k) => Math.abs(k.time - t) < EPS);
        } else {
            keys[i].value = copy(v);
        }
        return i + 1;
    }

    // --- keyframes (index à partir de 1) ---
    _key(i) {
        const k = this._state.keys[i - 1];
        if (!k) throw new Error('Keyframe index out of range: ' + i);
        return k;
    }
    keyTime(i) { return this._key(i).time; }
    keyValue(i) { return copy(this._key(i).value); }
    /** Change la valeur d'une keyframe existante (jamais d'ajout) ; tangentes conservées. */
    setValueAtKey(i, v) {
        if (this._ctx.layerState.locked) throw new Error('Unable to set value: layer is locked');
        this._checkSeparation();
        if (dimsOf(v) !== dimsOf(this._state.value)) throw new Error('Wrong number of dimensions for ' + this._state.name);
        this._key(i).value = copy(v);
    }
    _spatialKey(i) {
        if (!this._state.spatial) throw new Error('Property is not spatial: ' + this._state.name);
        return this._key(i);
    }
    keySpatialAutoBezier(i) { return this._spatialKey(i).autoBezier; }
    setSpatialAutoBezierAtKey(i, v) { this._spatialKey(i).autoBezier = !!v; }
    keyInSpatialTangent(i) { return copy(this._spatialKey(i).inTangent); }
    keyOutSpatialTangent(i) { return copy(this._spatialKey(i).outTangent); }
    /** Tangentes posées à la main : la keyframe n'est plus en Bézier automatique (comme AE). */
    setSpatialTangentsAtKey(i, inT, outT) {
        if (this._ctx.layerState.locked) throw new Error('Unable to set tangents: layer is locked');
        const k = this._spatialKey(i);
        k.inTangent = copy(inT);
        k.outTangent = copy(outT === undefined ? inT : outT);
        k.autoBezier = false;
    }
    keySpatialContinuous(i) { return !!this._spatialKey(i).sCont; }
    setSpatialContinuousAtKey(i, v) { this._spatialKey(i).sCont = !!v; }
    /** Déplacement libre : ni la première ni la dernière keyframe (comme AE). */
    keyRoving(i) { return !!this._spatialKey(i).roving; }
    setRovingAtKey(i, v) {
        const k = this._spatialKey(i);
        if (v && (i === 1 || i === this._state.keys.length)) throw new Error('setRovingAtKey: first and last keyframes cannot rove');
        k.roving = !!v;
    }
    keyTemporalContinuous(i) { return !!this._key(i).tCont; }
    setTemporalContinuousAtKey(i, v) { this._key(i).tCont = !!v; }
    keyTemporalAutoBezier(i) { return !!this._key(i).tAuto; }
    setTemporalAutoBezierAtKey(i, v) { this._key(i).tAuto = !!v; }
    keyLabel(i) { return this._key(i).label || 0; }
    setLabelAtKey(i, v) { this._key(i).label = Number(v); }
    /** Ajoute une keyframe à t avec la valeur à cet instant (ou renvoie celle qui y est déjà). */
    addKey(t) {
        // test : state.refuseKeyAt = instant où AE refuserait la keyframe
        if (this._state.refuseKeyAt !== undefined && Math.abs(t - this._state.refuseKeyAt) < EPS) throw new Error('addKey refusé');
        return this.setValueAtTime(t, this.valueAtTime(t));
    }
    /** Retire une keyframe ; sans keyframe restante, la valeur fixe devient la sienne (comme AE). */
    removeKey(i) {
        if (this._ctx.layerState.locked) throw new Error('Unable to remove keyframe: layer is locked');
        const k = this._key(i);
        this._state.keys.splice(i - 1, 1);
        if (!this._state.keys.length) this._state.value = copy(k.value);
    }
    keySelected(i) { return this._key(i).selected; }
    setSelectedAtKey(i, v) { this._key(i).selected = !!v; }
    get selectedKeys() {
        const out = [];
        this._state.keys.forEach((k, i) => { if (k.selected) out.push(i + 1); });
        return out;
    }
    keyInInterpolationType(i) { return this._key(i).inType; }
    keyOutInterpolationType(i) { return this._key(i).outType; }
    setInterpolationTypeAtKey(i, inType, outType) {
        if (this._ctx.layerState.locked) throw new Error('Unable to set interpolation: layer is locked');
        const k = this._key(i);
        k.inType = inType;
        k.outType = (outType === undefined) ? inType : outType;
    }
    keyInTemporalEase(i) { return this._key(i).inEase.map((e) => new KeyframeEase(e.speed, e.influence)); }
    keyOutTemporalEase(i) { return this._key(i).outEase.map((e) => new KeyframeEase(e.speed, e.influence)); }
    setTemporalEaseAtKey(i, inEase, outEase) {
        if (this._ctx.layerState.locked) throw new Error('Unable to set ease: layer is locked');
        const k = this._key(i);
        const n = easeDims(this._state);
        const check = (arr, side) => {
            if (!Array.isArray(arr) || arr.length !== n) {
                throw new Error('setTemporalEaseAtKey: ' + side + ' ease needs ' + n + ' KeyframeEase object(s) for ' + this._state.name);
            }
            return arr.map((e) => new KeyframeEase(e.speed, e.influence));
        };
        k.inEase = check(inEase, 'in');
        k.outEase = check(outEase === undefined ? inEase : outEase, 'out');
    }

    // --- expression ---
    get expression() { return this._state.expression; }
    set expression(text) {
        if (this._ctx.layerState.locked) throw new Error('Unable to set expression: layer is locked');
        if (!this._state.canSetExpression) throw new Error('This property cannot have an expression');
        this._state.expression = String(text);
        this._state.expressionEnabled = this._state.expression.length > 0;
    }
    get expressionEnabled() { return this._state.expressionEnabled; }
    set expressionEnabled(v) { this._state.expressionEnabled = !!v; }
}

class GroupRef {
    constructor(state, ctx) {
        Object.defineProperty(this, '_state', { value: state, enumerable: false });
        Object.defineProperty(this, '_ctx', { value: ctx, enumerable: false });
    }
    get name() { return this._state.name; }
    set name(v) { this._state.name = String(v); }
    get matchName() { return this._state.matchName; }
    get propertyType() { return this._state.indexed ? PropertyType.INDEXED_GROUP : PropertyType.NAMED_GROUP; }
    get propertyDepth() { return depthOf(this._state); }
    propertyGroup(n) { return ancestor(this._state, this._ctx, n === undefined ? 1 : n); }
    get selected() { return this._state.selected; }
    get numProperties() { return visibleChildren(this._state).length; }
    get canSetExpression() { return false; }
    /** property(index 1..n | nom | matchName) -> poignée, ou null. */
    property(x) {
        const kids = visibleChildren(this._state);
        let s = null;
        if (typeof x === 'number') s = kids[x - 1] || null;
        else s = kids.find((c) => c.matchName === x) || kids.find((c) => c.name === x) || null;
        return s ? refFor(s, this._ctx) : null;
    }
    /** Groupe Effets : ajoute un effet par matchName. Contenus d'un calque de forme
     *  (« ADBE Root Vectors Group », « ADBE Vectors Group ») : groupe, rectangle, fond. */
    addProperty(matchName) {
        if (this._ctx.layerState.locked) throw new Error('Unable to add property: layer is locked');
        let item;
        if (this._state.matchName === 'ADBE Effect Parade') {
            if (matchName === 'ADBE Slider Control') item = makeSliderControl();
            else if (matchName === 'Pseudo/MDS Elastic Controller') item = makeElasticController();
            else throw new Error('Unknown effect: ' + matchName);
        } else if (VECTOR_PARENTS.includes(this._state.matchName)) {
            if (!VECTOR_ITEMS[matchName]) throw new Error('Unknown shape item: ' + matchName);
            item = VECTOR_ITEMS[matchName]();
        } else {
            throw new Error('addProperty: effects and shape contents only in this fake');
        }
        item.parent = this._state;
        this._state.children.push(item);
        return refFor(item, this._ctx);
    }
    remove() {
        if (this._ctx.layerState.locked) throw new Error('Unable to remove: layer is locked');
        const p = this._state.parent;
        if (!p) throw new Error('Cannot remove a root group');
        const i = p.children.indexOf(this._state);
        if (i >= 0) p.children.splice(i, 1);
    }
    /** Test : états des propriétés feuilles du groupe, dans l'ordre de l'arbre. */
    get _leaves() {
        const out = [];
        (function walk(g) { visibleChildren(g).forEach((c) => (c.kind === 'group' ? walk(c) : out.push(c))); })(this._state);
        return out;
    }
}

/** Toutes les propriétés sélectionnées (états) d'un groupe, dans l'ordre de l'arbre. */
function selectedStates(root) {
    const out = [];
    (function walk(g) {
        visibleChildren(g).forEach((c) => {
            if (c.selected) out.push(c);
            if (c.kind === 'group') walk(c);
        });
    })(root);
    return out;
}

module.exports = {
    KeyframeInterpolationType, PropertyValueType, PropertyType, KeyframeEase,
    PropertyRef, GroupRef, refFor, makePropState, makeGroupState, makeTransform, makeEffects,
    makeElasticController, makeSliderControl, makeShapeContents, allProps, selectedStates, visibleChildren,
};
