'use strict';
/* API publique de la Boîte à outils, appelée comme par le pont (SIMING.call), sur le faux AE. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { loadHost, callHost, app, ROOT } = require('./helpers');
const { FakeComp, FootageItem, FileSource, FakeFile, KeyframeInterpolationType, KeyframeEase } = require('./fake-ae');
const P = require('./fake-ae-props');

function host() {
    const { sandbox } = loadHost();
    const call = (fn, args) => {
        const env = callHost(sandbox, 'toolbox', fn, args);
        assert.strictEqual(env.ok, true, env.error && env.error.message);
        return env.data;
    };
    return { call, sandbox };
}

/** Comp « Rig » active (1920 × 1080, 25 i/s) : A (100 × 100) en [100, 100], B en [500, 300], C en [900, 900]. */
function rig() {
    const comp = new FakeComp(300, 'Rig');
    app.project.activeItem = comp;
    app.project.items.push(comp);
    const A = comp.addLayer('A');
    const B = comp.addLayer('B');
    const C = comp.addLayer('C');
    comp.layer(1).position.setValue([100, 100]);
    comp.layer(2).position.setValue([500, 300]);
    comp.layer(3).position.setValue([900, 900]);
    return { comp, A, B, C, L: (st) => comp.layer(comp.layers.indexOf(st) + 1) };
}

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, (msg || '') + ' attendu ' + b + ', obtenu ' + a);
const footage = (name, opts) => new FootageItem(name, new FileSource(new FakeFile(path.join(ROOT, 'medias', name)), true), opts);

/** Désélectionne toutes les propriétés et keyframes d'un calque (état du faux AE). */
function unselectAll(st) {
    for (const g of [st.transform, st.effects]) {
        for (const p of P.allProps(g)) { p.selected = false; p.keys.forEach((k) => { k.selected = false; }); }
    }
}

module.exports = function (test) {
    test('API boîte à outils : init et info donnent la comp active (format, fond) ; sans comp, erreur', () => {
        const { call } = host();
        const none = call('init', {});
        assert.strictEqual(none.comp, null);
        assert.strictEqual(call('nullFor', {}).status.level, 'error');
        assert.strictEqual(call('frame', {}).status.level, 'error');
        const r = rig();
        r.comp.bgColor = [0.2, 0.4, 0.6];
        const st = call('init', {});
        assert.strictEqual(st.status.level, 'info');
        assert.deepEqual(st.comp, { id: 300, name: 'Rig', width: 1920, height: 1080, format: '16:9', bg: '#336699' });
        assert.strictEqual(call('info', {}).comp.format, '16:9');
    });

    test('API format : 9:16 garde le plus petit côté, recentre les calques sans parent (keyframes, verrouillé, dimensions séparées, caméra)', () => {
        const r = rig();
        const comp = r.comp;
        r.L(r.A).position.setValueAtTime(0, [960, 540]);
        r.L(r.A).position.setValueAtTime(1, [1060, 540]);
        r.B.parent = r.A;                                   // suit son parent
        r.C.locked = true;
        comp.addLayer('D');
        comp.layer(4).position.dimensionsSeparated = true;
        comp.layer(4).transform.property('ADBE Position_0').setValue(200);
        comp.layer(4).transform.property('ADBE Position_1').setValue(300);
        const cam = comp.addLayer('Caméra', { kind: 'camera', threeD: true });
        comp.layer(5).position.setValue([960, 540, -1000]);
        comp.layer(5).anchorPoint.setValue([960, 540, 0]);  // point ciblé
        const { call } = host();
        const st = call('format', { ratio: '9:16' });
        assert.strictEqual(st.status.text, 'Composition en 9:16 : 1080 × 1920, 4 calques recentrés · Ctrl+Z pour annuler');
        assert.strictEqual(st.status.level, 'ok');
        assert.deepEqual([comp.width, comp.height], [1080, 1920]);
        assert.strictEqual(st.comp.format, '9:16');
        const A = r.L(r.A).position;
        assert.strictEqual(A.numKeys, 2, 'aucune keyframe créée');
        assert.deepEqual([A.keyValue(1), A.keyValue(2)], [[540, 960], [640, 960]], 'décalage (-420, +420) sur chaque keyframe');
        assert.deepEqual(r.L(r.B).position.value, [500, 300], 'enfant : suit son parent, inchangé');
        assert.deepEqual(r.L(r.C).position.value, [480, 1320], 'verrouillé : recentré quand même');
        assert.strictEqual(r.C.locked, true, 'et reverrouillé');
        assert.deepEqual([comp.layer(4).transform.property('ADBE Position_0').value, comp.layer(4).transform.property('ADBE Position_1').value], [-220, 720]);
        assert.deepEqual(r.L(cam).position.value, [540, 960, -1000]);
        assert.deepEqual(r.L(cam).anchorPoint.value, [540, 960, 0], 'point ciblé de la caméra aussi');
        assert.deepEqual(app.undoGroups, ['Boîte à outils : format 9:16']);
        const again = call('format', { ratio: '9:16' });
        assert.strictEqual(again.status.level, 'info');
        assert.strictEqual(again.status.text, 'La composition est déjà en 9:16 (1080 × 1920)');
        assert.strictEqual(call('format', { ratio: '2:1' }).status.level, 'warn');
    });

    test('API sequence calques : cascade, paquets, inverse, au hasard ; keyframes du calque suivent ; verrouillé ignoré', () => {
        const r = rig();
        const comp = r.comp;
        const E = comp.addLayer('E');
        r.L(r.A).position.setValueAtTime(1, [0, 0]);
        comp.select(r.A, r.B, r.C, E);
        const { call } = host();
        const starts = () => [r.A, r.B, r.C, E].map((s) => Math.round(s.startTime * 25));
        let st = call('sequence', { target: 'layers', mode: 'cascade', gap: 2, group: 1 });
        assert.strictEqual(st.status.text, '4 calques séquencés en cascade, écart 2 images · Ctrl+Z pour annuler');
        assert.deepEqual(starts(), [0, 2, 4, 6]);
        assert.strictEqual(r.A.inPoint, 0, 'le plus tôt reste en place');
        st = call('sequence', { target: 'layers', mode: 'cascade', gap: 3, group: 2 });
        assert.deepEqual(starts(), [0, 0, 3, 3], 'paquets de 2 : repartent du plus tôt');
        assert.ok(/par paquets de 2/.test(st.status.text), st.status.text);
        call('sequence', { target: 'layers', mode: 'reverse', gap: 1, group: 1 });
        assert.deepEqual(starts(), [3, 2, 1, 0]);
        call('sequence', { target: 'layers', mode: 'random', gap: 5, group: 1 });
        assert.deepEqual(starts().slice().sort((a, b) => a - b), [0, 5, 10, 15], 'au hasard : mêmes créneaux, ordre mélangé');
        call('sequence', { target: 'layers', mode: 'cascade', gap: 25, group: 1 });
        assert.deepEqual(starts(), [0, 25, 50, 75]);
        near(r.L(r.A).position.keyTime(1), 1, 'les keyframes ont suivi A, revenu à 0');
        r.B.locked = true;
        st = call('sequence', { target: 'layers', mode: 'reverse', gap: 1, group: 1 });
        assert.strictEqual(st.status.level, 'warn');
        assert.deepEqual(st.report.skipped, ['B : calque verrouillé']);
        comp.select(r.A);
        assert.ok(/au moins 2 calques/.test(call('sequence', { target: 'layers' }).status.text));
    });

    test('API sequence keyframes : un groupe par calque, attributs conservés, sélection gardée, remplacements signalés', () => {
        const r = rig();
        const comp = r.comp;
        for (const s of [r.A, r.B, r.C]) {
            const p = r.L(s).position;
            p.setValueAtTime(0, [0, 0]);
            p.setValueAtTime(1, [100, 0]);
            p.setSelectedAtKey(1, true);
            p.setSelectedAtKey(2, true);
            p.selected = true;
        }
        const pb = r.L(r.B).position;
        pb.setInterpolationTypeAtKey(1, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.BEZIER);
        pb.setTemporalEaseAtKey(1, [new KeyframeEase(0, 20)], [new KeyframeEase(0, 75)]);
        pb.setSpatialTangentsAtKey(1, [0, 0], [30, 40]);
        pb.setLabelAtKey(2, 5);
        const { call } = host();
        const st = call('sequence', { target: 'keys', mode: 'cascade', gap: 5, group: 1 });
        assert.strictEqual(st.status.text, '6 keyframes séquencées sur 3 calques en cascade, écart 5 images · Ctrl+Z pour annuler');
        const times = (s) => [1, 2].map((k) => Math.round(r.L(s).position.keyTime(k) * 25));
        assert.deepEqual([times(r.A), times(r.B), times(r.C)], [[0, 25], [5, 30], [10, 35]]);
        const b = r.L(r.B).position;
        assert.strictEqual(b.numKeys, 2);
        assert.deepEqual(b.keyValue(2), [100, 0]);
        assert.strictEqual(b.keyOutInterpolationType(1), KeyframeInterpolationType.BEZIER);
        assert.strictEqual(b.keyInInterpolationType(1), KeyframeInterpolationType.LINEAR);
        assert.strictEqual(b.keyOutTemporalEase(1)[0].influence, 75, 'ease conservé');
        assert.deepEqual(b.keyOutSpatialTangent(1), [30, 40], 'tangente manuelle conservée');
        assert.strictEqual(b.keyLabel(2), 5, 'couleur de keyframe conservée');
        assert.deepEqual([b.keySelected(1), b.keySelected(2)], [true, true], 'toujours sélectionnées : on peut relancer');
        assert.deepEqual(app.undoGroups, ['Boîte à outils : séquencer les keyframes']);
        // Un seul calque : un groupe par propriété ; une keyframe non sélectionnée sur le chemin est remplacée
        comp.layers.forEach(unselectAll);
        const a = r.L(r.A);
        a.scale.setValueAtTime(0, [100, 100]);
        a.scale.setValueAtTime(0.2, [50, 50]);   // non sélectionnée, là où arrivera la keyframe déplacée
        a.scale.setValueAtTime(2, [80, 80]);
        a.scale.setSelectedAtKey(1, true);
        a.scale.selected = true;
        a.position.setSelectedAtKey(1, true);
        a.position.selected = true;
        const st2 = call('sequence', { target: 'keys', mode: 'cascade', gap: 5, group: 1 });
        assert.strictEqual(st2.status.level, 'warn');
        assert.ok(/2 keyframes séquencées sur 2 propriétés/.test(st2.status.text), st2.status.text);
        assert.ok(/1 keyframe remplacée/.test(st2.status.text), st2.status.text);
        assert.deepEqual(a.scale.keyValue(1), [100, 100], 'la keyframe déplacée a pris la place');
        assert.strictEqual(a.scale.numKeys, 2);
        comp.layers.forEach(unselectAll);
        assert.ok(/Aucune keyframe sélectionnée/.test(call('sequence', { target: 'keys' }).status.text));
    });

    test('API sequence keyframes : déplacement libre gardé, marqueurs refusés, retour arrière si une keyframe ne se repose pas', () => {
        const r = rig();
        const keys = (s, prop, times) => {
            const comp = app.project.activeItem;
            const layer = comp.layer(comp.layers.indexOf(s) + 1);
            const p = prop === 'opacity' ? layer.transform.property('ADBE Opacity') : layer[prop];
            times.forEach((t, i) => p.setValueAtTime(t, prop === 'opacity' ? 50 + i : [i * 100, 0]));
            times.forEach((t, i) => p.setSelectedAtKey(i + 1, true));
            p.selected = true;
            return p;
        };
        keys(r.A, 'position', [0, 1]);
        keys(r.B, 'position', [0, 0.5, 1]).setRovingAtKey(2, true);
        keys(r.C, 'opacity', [0, 1])._state.valueType = 'CUSTOM_VALUE';
        const { call } = host();
        const st = call('sequence', { target: 'keys', mode: 'cascade', gap: 5, group: 1 });
        assert.strictEqual(st.status.level, 'warn');
        assert.deepEqual(st.report.skipped, ['C : Opacity : keyframes non déplaçables (marqueurs ou valeur particulière)']);
        const b = r.L(r.B).position;
        [0.2, 0.7, 1.2].forEach((t, i) => near(b.keyTime(i + 1), t, 'keyframe ' + (i + 1) + ' de B'));
        assert.strictEqual(b.keyRoving(2), true, 'déplacement libre reposé une fois toutes les keyframes recréées');
        const c = r.L(r.C).transform.property('ADBE Opacity');
        assert.deepEqual([c.keyTime(1), c.keyTime(2), c.numKeys], [0, 1, 2], 'refusé : rien n\'a bougé');
        // Une keyframe qu'AE refuse de poser : tout revient à sa place
        const r2 = rig();
        keys(r2.A, 'position', [0, 1]);
        const pb = keys(r2.B, 'position', [0, 1]);
        pb._state.refuseKeyAt = 1.2;
        const st2 = call('sequence', { target: 'keys', mode: 'cascade', gap: 5, group: 1 });
        assert.deepEqual(st2.report.skipped, ['B : keyframes laissées en place (addKey refusé)']);
        const b2 = r2.L(r2.B).position;
        assert.deepEqual([b2.numKeys, b2.keyTime(1), b2.keyTime(2)], [2, 0, 1]);
        assert.deepEqual([b2.keyValue(1), b2.keyValue(2)], [[0, 0], [100, 0]]);
        assert.deepEqual([b2.keySelected(1), b2.keySelected(2)], [true, true]);
    });

    test('API nullFor : au centre de la sélection, au-dessus, sur sa durée, relié ; null seul sélectionné', () => {
        const r = rig();
        const comp = r.comp;
        r.B.inPoint = 1; r.B.outPoint = 4;
        r.A.inPoint = 2; r.A.outPoint = 3;
        comp.select(r.B, r.A);
        const { call } = host();
        const st = call('nullFor', {});
        assert.strictEqual(st.status.text, 'Null « Contrôle » relié à 2 calques · Ctrl+Z pour annuler');
        const nul = comp.layer(1);
        assert.strictEqual(nul.name, 'Contrôle');
        assert.strictEqual(nul.nullLayer, true);
        assert.deepEqual(nul.position.value, [350, 250], 'centre de [100…600] × [100…400]');
        assert.deepEqual([nul.inPoint, nul.outPoint], [1, 4]);
        assert.strictEqual(r.L(r.A).parent.name, 'Contrôle');
        assert.strictEqual(r.L(r.B).parent.name, 'Contrôle');
        assert.strictEqual(r.L(r.C).parent, null);
        assert.deepEqual(comp.selectedLayers.map((l) => l.name), ['Contrôle']);
        assert.deepEqual(app.undoGroups, ['Boîte à outils : ajouter un null']);
    });

    test('API nullFor : enfant d\'un calque sélectionné inchangé, parent commun, 3D, sans sélection', () => {
        const r = rig();
        const comp = r.comp;
        const Par = comp.addLayer('P');
        r.A.parent = Par; r.B.parent = Par;      // A et B : même parent P, non sélectionné
        r.C.parent = r.A;                        // C : enfant de A, sélectionné aussi
        comp.select(r.A, r.B, r.C);
        const { call } = host();
        call('nullFor', {});
        const nul = comp.layer(1);
        assert.strictEqual(nul.parent.name, 'P', 'le null prend le parent commun');
        assert.strictEqual(r.L(r.A).parent.name, 'Contrôle');
        assert.strictEqual(r.L(r.C).parent.name, 'A', 'enfant d\'un sélectionné : garde son parent');
        const one = call('nullFor', {});         // sélection = le null précédent seul
        assert.ok(/Null « Contrôle Contrôle » relié à 1 calque/.test(one.status.text), one.status.text);
        comp.select();
        const st = call('nullFor', {});
        assert.ok(/au centre de la composition \(aucun calque sélectionné\)/.test(st.status.text), st.status.text);
        assert.deepEqual(comp.layer(1).position.value, [960, 540]);
        const D = comp.addLayer('D3', { threeD: true });
        comp.layer(comp.numLayers).position.setValue([0, 0, 300]);
        comp.select(D);
        call('nullFor', {});
        const i3 = comp.layers.findIndex((s) => s.name === 'Contrôle D3') + 1;
        assert.strictEqual(comp.layer(i3 + 1).name, 'D3', 'juste au-dessus du calque, tout en bas de la pile');
        assert.strictEqual(comp.layer(i3).threeDLayer, true);
        assert.deepEqual(comp.layer(i3).position.value, [50, 50, 300]);
    });

    test('API background : forme « Fond » en bas, rectangle et position par expression, couleur choisie ou celle de la comp', () => {
        const r = rig();
        const comp = r.comp;
        comp.select(r.A);
        const { call } = host();
        const st = call('background', { color: '#336699' });
        assert.strictEqual(st.status.level, 'ok');
        assert.ok(/Fond #336699 ajouté en bas/.test(st.status.text), st.status.text);
        const fond = comp.layer(comp.numLayers);
        assert.strictEqual(fond.name, 'Fond');
        assert.strictEqual(fond._state.kind, 'shape');
        const group = fond.property('ADBE Root Vectors Group').property(1);
        assert.strictEqual(group.name, 'Fond');
        const vectors = group.property('ADBE Vectors Group');
        assert.strictEqual(vectors.property('ADBE Vector Shape - Rect').property('ADBE Vector Rect Size').expression, '[thisComp.width, thisComp.height]');
        assert.deepEqual(vectors.property('ADBE Vector Graphic - Fill').property('ADBE Vector Fill Color').value, [0.2, 0.4, 0.6, 1]);
        assert.strictEqual(fond.position.expression, '[thisComp.width / 2, thisComp.height / 2]');
        assert.deepEqual(fond.anchorPoint.value, [0, 0]);
        assert.deepEqual(comp.selectedLayers.map((l) => l.name), ['Fond']);
        comp.bgColor = [1, 1, 1];
        call('background', {});
        const fill = comp.layer(comp.numLayers).property('ADBE Root Vectors Group').property(1).property('ADBE Vectors Group').property('ADBE Vector Graphic - Fill');
        assert.deepEqual(fill.property('ADBE Vector Fill Color').value, [1, 1, 1, 1], 'sans couleur : celle du fond de la comp');
    });

    test('API pickColor : sélecteur du système, départ = couleur donnée, annulation', () => {
        rig();
        const { call, sandbox } = host();
        assert.deepEqual(call('pickColor', { color: '#FF8000' }), { color: '#336699' });
        assert.deepEqual(Array.from(sandbox.colorPicks), [0xFF8000]);
        sandbox.pickedColor = -1;
        assert.deepEqual(call('pickColor', {}), { color: null });
        assert.strictEqual(sandbox.colorPicks[1], 0, 'sans couleur : fond de la comp (noir)');
    });

    test('API revealSource : sources sélectionnées dans le Projet (sans doublon), commande d\'AE, calques sans source signalés', () => {
        const r = rig();
        const comp = r.comp;
        const img = footage('photo.png');
        const other = footage('autre.png');
        app.project.items.push(img, other);
        other.selected = true;
        const X = comp.addLayer('photo 1', { source: img });
        const Y = comp.addLayer('photo 2', { source: img });
        const T = comp.addLayer('Titre', { kind: 'text', text: 'Titre' });
        comp.select(X, Y, T);
        const { call } = host();
        const st = call('revealSource', {});
        assert.strictEqual(st.status.text, 'Source « photo.png » sélectionnée dans le panneau Projet · 1 ignoré(s)');
        assert.strictEqual(st.status.level, 'warn');
        assert.deepEqual(st.report.skipped, ['Titre : pas de source (texte, forme, caméra, lumière)']);
        assert.deepEqual(app.project.selection.map((i) => i.name), ['photo.png'], 'ancienne sélection du Projet retirée');
        assert.deepEqual(app.commands, [2517]);
        app.menuNames = {};                      // After Effects dans une autre langue : sélection seule
        comp.select(X);
        assert.strictEqual(call('revealSource', {}).status.level, 'ok');
        assert.deepEqual(app.commands, [2517]);
        comp.select();
        assert.ok(/Aucun calque sélectionné/.test(call('revealSource', {}).status.text));
    });

    test('API convertPsdText : calques texte d\'un PSD convertis un par un (comp entière ou sélection), autres signalés', () => {
        const r = rig();
        const comp = r.comp;
        const psd = (name) => footage(name + '/maquette.psd');
        const T1 = comp.addLayer('Titre', { source: psd('Titre'), psdText: 'Mon titre' });
        const IM = comp.addLayer('Photo', { source: psd('Photo') });
        const T2 = comp.addLayer('Sous-titre', { source: psd('Sous-titre'), psdText: 'Mon sous-titre' });
        comp.addLayer('Image', { source: footage('image.png') });
        const { call } = host();
        const st = call('convertPsdText', {});
        assert.strictEqual(st.status.text, '2 textes Photoshop convertis en texte modifiable · 1 ignoré(s) · Ctrl+Z pour annuler');
        assert.deepEqual(st.report.skipped, ['Photo : pas un calque texte Photoshop']);
        assert.deepEqual(app.commands, [3799, 3799, 3799], 'un calque à la fois');
        assert.strictEqual(T1.kind, 'text');
        assert.strictEqual(T2.kind, 'text');
        assert.strictEqual(IM.kind, 'av');
        assert.deepEqual(comp.selectedLayers, [], 'sélection vidée');
        assert.deepEqual(app.undoGroups, ['Boîte à outils : textes Photoshop']);
        // Sélection : seulement elle ; verrouillé signalé ; aucun PSD : avertissement
        const T3 = comp.addLayer('Légende', { source: psd('Légende'), psdText: 'Légende' });
        const T4 = comp.addLayer('Crédit', { source: psd('Crédit'), psdText: 'Crédit', locked: true });
        comp.select(T3);
        assert.strictEqual(call('convertPsdText', {}).status.text, '1 texte Photoshop converti en texte modifiable · Ctrl+Z pour annuler');
        assert.strictEqual(T4.kind, 'av');
        comp.select(T4);
        const locked = call('convertPsdText', {});
        assert.strictEqual(locked.status.level, 'warn');
        assert.deepEqual(locked.report.skipped, ['Crédit : calque verrouillé']);
        comp.select(r.A);
        assert.strictEqual(call('convertPsdText', {}).status.text, 'Aucun calque Photoshop dans la sélection');
        // After Effects dans une langue inconnue : aucune commande lancée au hasard
        const T5 = comp.addLayer('Note', { source: psd('Note'), psdText: 'Note' });
        app.menuNames = {};
        const n = app.commands.length;
        comp.select(T5);
        const unknown = call('convertPsdText', {});
        assert.strictEqual(unknown.status.level, 'warn');
        assert.ok(/introuvable dans cette langue/.test(unknown.status.text), unknown.status.text);
        assert.strictEqual(app.commands.length, n);
        assert.strictEqual(T5.kind, 'av');
    });

    test('API frame : PNG rendu dans le dossier temporaire, état, copie par system.callSystem, préférence d\'écriture', () => {
        const r = rig();
        r.comp.time = 2;
        const { call, sandbox } = host();
        app.preferences.scriptWrite = false;
        const denied = call('frame', {});
        assert.strictEqual(denied.status.level, 'warn');
        assert.ok(/Autoriser les scripts à écrire des fichiers/.test(denied.status.text));
        app.preferences.scriptWrite = true;
        const st = call('frame', {});
        assert.strictEqual(st.status.text, 'Rendu de la frame…');
        assert.ok(/[\\/]SIMING[\\/]frame-\d+\.png$/.test(st.frame.path), st.frame.path);
        assert.deepEqual(r.comp.frames, [2], 'frame de la tête de lecture');
        const ready = call('frameState', { path: st.frame.path });
        assert.strictEqual(ready.ready, true);
        assert.deepEqual([ready.width, ready.height], [1920, 1080]);
        assert.strictEqual(ready.copy.file, 'powershell.exe');
        assert.ok(ready.copy.args[ready.copy.args.length - 1].includes(st.frame.path));
        const copied = call('copyImage', { path: st.frame.path });
        assert.strictEqual(copied.status.text, 'Frame copiée dans le presse-papier');
        assert.strictEqual(sandbox.system.calls.length, 1);
        assert.ok(sandbox.system.calls[0].startsWith('powershell.exe -NoProfile'), sandbox.system.calls[0]);
        // Fichier refusé hors des frames de l'outil ; frame précédente effacée au rendu suivant
        assert.deepEqual(call('frameState', { path: path.join(ROOT, 'package.json') }), { ready: false, error: 'fichier inconnu' });
        assert.strictEqual(call('copyImage', { path: 'C:/Windows/notepad.exe' }).status.level, 'error');
        const next = call('frame', {});
        assert.ok(!fs.existsSync(st.frame.path) || next.frame.path === st.frame.path, 'ancienne frame effacée');
        sandbox.$.os = 'Macintosh OS 14.0';
        assert.strictEqual(call('frameState', { path: next.frame.path }).copy.file, 'osascript');
        fs.unlinkSync(next.frame.path);
        assert.deepEqual(call('frameState', { path: next.frame.path }), { ready: false });
    });
};
