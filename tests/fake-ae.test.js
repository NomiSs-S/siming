'use strict';
/* Le faux After Effects imite bien les pièges d'ExtendScript. */
const assert = require('assert');
const vm = require('vm');
const { createSandbox, app, KeyframeEase, KeyframeInterpolationType, CameraLayerRef, FakeComp, FakeFile, ImportOptions, ImportAsType } = require('./fake-ae');
const { scene } = require('./helpers');

module.exports = function (test) {
    test('faux AE : propriétés, keyframes, ease par dimension, sélection', () => {
        const s = scene();
        const L = s.comp.layer(2);                          // A
        const pos = L.position;
        assert.strictEqual(pos.propertyDepth, 2);
        assert.strictEqual(pos.propertyGroup(2).name, 'A');
        pos.setValueAtTime(0, [0, 0]);
        pos.setValueAtTime(1, [100, 50]);
        assert.deepEqual(pos.valueAtTime(0.5), [50, 25]);
        s.comp.time = 1;
        assert.deepEqual(pos.value, [100, 50]);
        assert.throws(() => pos.setValue([1, 1]), /keyframes/);
        pos.setSelectedAtKey(2, true);
        assert.deepEqual(pos.selectedKeys, [2]);
        pos.selected = true;
        assert.deepEqual(s.comp.selectedProperties.map((p) => p.name), ['Position']);
        pos.setTemporalEaseAtKey(2, [new KeyframeEase(0, 75)], [new KeyframeEase(0, 75)]);   // spatiale : un seul
        assert.strictEqual(pos.keyInTemporalEase(2)[0].influence, 75);
        assert.throws(() => pos.setTemporalEaseAtKey(2, [new KeyframeEase(0, 1), new KeyframeEase(0, 1)]), /1 KeyframeEase/);
        const sc = L.scale;
        sc.setValueAtTime(0, [100, 100]);
        assert.throws(() => sc.setTemporalEaseAtKey(1, [new KeyframeEase(0, 50)]), /2 KeyframeEase/);   // échelle 2D : deux
        assert.throws(() => new KeyframeEase(0, 0), /influence/);
        sc.setInterpolationTypeAtKey(1, KeyframeInterpolationType.HOLD);
        assert.strictEqual(sc.keyOutInterpolationType(1), KeyframeInterpolationType.HOLD);
    });

    test('faux AE : setValueAtKey ne crée rien, tangentes spatiales, Bézier automatique', () => {
        const s = scene();
        const pos = s.comp.layer(2).position;
        pos.setValueAtTime(0, [0, 0]);
        pos.setValueAtTime(1, [100, 50]);
        pos.setValueAtKey(2, [200, 50]);
        assert.strictEqual(pos.numKeys, 2, 'aucune keyframe ajoutée');
        assert.deepEqual(pos.keyValue(2), [200, 50]);
        assert.strictEqual(pos.keySpatialAutoBezier(1), true, 'spatiale : automatique au départ');
        assert.deepEqual(pos.keyInSpatialTangent(1), [0, 0]);
        pos.setSpatialTangentsAtKey(1, [10, 0], [12, 0]);
        assert.strictEqual(pos.keySpatialAutoBezier(1), false, 'tangentes à la main : plus automatique');
        assert.deepEqual([pos.keyInSpatialTangent(1), pos.keyOutSpatialTangent(1)], [[10, 0], [12, 0]]);
        pos.setValueAtKey(1, [5, 5]);
        assert.deepEqual(pos.keyInSpatialTangent(1), [10, 0], 'la valeur change, pas les tangentes');
        const sc = s.comp.layer(2).scale;
        sc.setValueAtTime(0, [100, 100]);
        assert.throws(() => sc.keySpatialAutoBezier(1), /not spatial/);
        assert.throws(() => pos.setValueAtKey(1, [1, 2, 3]), /dimensions/);
        s.comp.layer(2).locked = true;
        assert.throws(() => pos.setValueAtKey(1, [1, 1]), /locked/);
    });

    test('faux AE : dimensions séparées, expression, verrou', () => {
        const s = scene();
        const L = s.comp.layer(2);
        assert.strictEqual(L.transform.property('ADBE Position_0'), null, 'X Position cachée tant que non séparée');
        L.position.dimensionsSeparated = true;
        assert.throws(() => L.position.setValue([1, 2]), /separated/);
        L.transform.property('ADBE Position_0').setValue(42);
        assert.strictEqual(L.property('X Position').value, 42);
        L.position.expression = 'value';
        assert.strictEqual(L.position.expressionEnabled, true);
        s.A.locked = true;
        assert.throws(() => { s.comp.layer(2).position.expression = ''; }, /locked/);
    });

    test('faux AE : effets, préréglage sur les calques sélectionnés, caméra sans boîte', () => {
        const s = scene();
        const A = s.comp.layer(2), B = s.comp.layer(3);
        assert.strictEqual(A.effect('Elastic Controller'), null);
        const file = { name: 'ElasticController.ffx', exists: true, fsName: 'x' };
        s.comp.select(s.B);
        A.applyPreset(file);                                // AE applique aux calques sélectionnés : B, pas A
        assert.strictEqual(A.effect('Elastic Controller'), null);
        assert.strictEqual(B.effect('Elastic Controller').property(1).value, 20);
        assert.strictEqual(B.effect(1).property('Decay').value, 60);
        assert.deepEqual(app.presetsApplied, [{ file: 'ElasticController.ffx', layers: ['B'] }]);
        s.comp.select();
        A.applyPreset(file);                                // rien de sélectionné : le calque appelé
        assert.strictEqual(A.effect('Elastic Controller').name, 'Elastic Controller');
        A.effect('Elastic Controller').remove();
        assert.strictEqual(A.property('ADBE Effect Parade').numProperties, 0);
        assert.throws(() => A.applyPreset({ name: 'x.ffx', exists: false }), /not found/);
        A.selected = true;
        assert.deepEqual(s.comp.selectedLayers.map((l) => l.name), ['A']);
        s.comp.addLayer('Cam', { kind: 'camera' });
        const cam = s.comp.layer(6);
        assert.ok(cam instanceof CameraLayerRef);
        assert.strictEqual(typeof cam.sourceRectAtTime, 'undefined');
        assert.deepEqual(A.sourceRectAtTime(0, false), { top: 0, left: 0, width: 100, height: 100 });
    });

    test('faux AE : un calque est un nouvel objet à chaque accès', () => {
        const s = scene();
        assert.notStrictEqual(s.comp.layer(1), s.comp.layer(1));
        assert.strictEqual(s.comp.layer(1).index, 1);
        assert.strictEqual(s.comp.layer(2).parent.name, 'Parent');
    });

    test('faux AE : verrou et cycle lèvent une erreur', () => {
        const s = scene();
        s.A.locked = true;
        assert.throws(() => { s.comp.layer(2).parent = null; }, /locked/);
        assert.throws(() => { s.comp.layer(1).parent = s.comp.layer(3); }, /cycle/);
    });

    test('faux AE : projet indexé à partir de 1, reset vide tout', () => {
        scene();
        assert.strictEqual(app.project.numItems, 1);
        assert.strictEqual(app.project.item(1).name, 'Comp 1');
        app.reset();
        assert.strictEqual(app.project.numItems, 0);
        assert.strictEqual(app.project.activeItem, null);
    });

    test('faux AE : importFile fabrique la compo d\'après la recette, range les métrages dans « <nom> Calques » ; openInViewer et addFolder', () => {
        const { FakeFile, FolderItem } = require('./fake-ae');
        const sb = createSandbox();
        const file = new FakeFile('/tmp/x/Fond.psd');
        const opts = new sb.ImportOptions(file);
        assert.strictEqual(opts.canImportAs(sb.ImportAsType.COMP_CROPPED_LAYERS), true);
        assert.strictEqual(new sb.ImportOptions(new FakeFile('/tmp/x/a.png')).canImportAs(sb.ImportAsType.COMP), false);
        opts.importAs = sb.ImportAsType.COMP_CROPPED_LAYERS;
        app.importRecipes[file.fsName] = { layers: [{ name: 'A', psdText: 'a' }, { name: 'G', group: { layers: [{ name: 'B' }] } }] };
        const comp = app.project.importFile(opts);
        assert.ok(comp instanceof sb.CompItem);
        assert.strictEqual(comp.name, 'Fond');
        assert.deepStrictEqual(comp.layers.map((s) => s.name), ['A', 'G']);
        assert.strictEqual(comp.layers[0].source.name, 'A/Fond.psd');
        assert.strictEqual(comp.layers[0].source.mainSource.file.name, 'Fond.psd');
        assert.strictEqual(comp.layers[1].source.layers[0].source.name, 'B/Fond.psd');
        const calques = app.project.items.filter((it) => it instanceof FolderItem && it.name === 'Fond Calques');
        assert.strictEqual(calques.length, 1);
        assert.strictEqual(comp.layers[0].source.parentFolder, calques[0]);
        assert.strictEqual(comp.parentFolder, null, 'la compo reste à la racine');
        app.importRecipes[file.fsName] = { throws: 'boom' };
        assert.throws(() => app.project.importFile(opts), /boom/);
        // openInViewer rend la compo active ; addFolder crée un dossier à la racine
        assert.strictEqual(app.project.activeItem, null);
        comp.openInViewer();
        assert.strictEqual(app.project.activeItem, comp);
        assert.deepStrictEqual(app.viewerOpens, [comp.id]);
        const f = app.project.items.addFolder('Dossier');
        assert.ok(f instanceof FolderItem && f.parentFolder === null && app.project.items.indexOf(f) >= 0);
        app.project.items = [];
        assert.strictEqual(typeof app.project.items.addFolder, 'function', 'après un reset aussi');
    });

    // ---- Styles de calque : groupe masqué sans style, copier-coller (commandes 19 et 20), effet Dégradé ----

    const styleComp = () => {
        const comp = new FakeComp(1, 'C');
        app.project.items.push(comp);
        app.project.activeItem = comp;
        return comp;
    };

    test('faux AE : sans style, « ADBE Layer Styles » est masqué (selected lève), sans que le groupe disparaisse', () => {
        const comp = styleComp();
        comp.addLayer('Nu');
        const root = comp.layer(1).property('ADBE Layer Styles');
        assert.ok(root, 'la propriété existe');
        assert.throws(() => { root.selected = true; }, /hidden/);
        assert.strictEqual(root.selected, false);
    });

    test('faux AE : un calque déclaré avec des styles les montre (groupes « nom/enabled », enabled vrai ou faux)', () => {
        const comp = styleComp();
        comp.addLayer('Avec', { styles: ['outerGlow', { style: 'dropShadow', values: { distance: 7, blur: 12 } }] });
        const root = comp.layer(1).property('ADBE Layer Styles');
        root.selected = true;
        assert.strictEqual(root.selected, true);
        assert.strictEqual(root.property('outerGlow/enabled').enabled, true);
        assert.strictEqual(root.property('dropShadow/enabled').enabled, true);
        assert.strictEqual(root.property('innerShadow/enabled').enabled, false);
        for (const g of ['innerShadow', 'outerGlow', 'innerGlow', 'bevelEmboss', 'chromeFX', 'solidFill', 'gradientFill', 'patternFill', 'frameFX']) {
            assert.ok(root.property(g + '/enabled'), g);
        }
        assert.ok(root.property('ADBE Blend Options Group').property('ADBE Adv Blend Group').property('ADBE Layer Fill Opacity2'));
        assert.strictEqual(root.property('dropShadow/enabled').property('dropShadow/distance').value, 7);
        assert.strictEqual(root.property('dropShadow/enabled').property('dropShadow/blur').value, 12);
        assert.throws(() => comp.addLayer('Faux', { styles: ['nimporte'] }), /nimporte/);
    });

    test('faux AE : Copier (19) puis Coller (20) recopient les styles sélectionnés sur le calque sélectionné, valeurs comprises', () => {
        const comp = styleComp();
        comp.addLayer('Source', { styles: [{ style: 'outerGlow', values: { blur: 30 } }] });
        comp.addLayer('Cible');
        const src = comp.layer(1).property('ADBE Layer Styles'), dst = comp.layer(2).property('ADBE Layer Styles');
        src.selected = true;
        app.executeCommand(19);
        src.selected = false;
        comp.layer(2).selected = true;
        app.executeCommand(20);
        assert.deepStrictEqual(app.commands, [19, 20]);
        dst.selected = true;                                    // n'est plus masqué
        assert.strictEqual(dst.property('outerGlow/enabled').enabled, true);
        assert.strictEqual(dst.property('outerGlow/enabled').property('outerGlow/blur').value, 30);
        assert.strictEqual(dst.property('dropShadow/enabled').enabled, false);
        // copie, pas partage : modifier la cible ne touche pas la source
        dst.property('outerGlow/enabled').property('outerGlow/blur').setValue(5);
        assert.strictEqual(src.property('outerGlow/enabled').property('outerGlow/blur').value, 30);
    });

    test('faux AE : Coller sans Copier, ou Copier sans groupe de styles sélectionné, ne fait rien', () => {
        const comp = styleComp();
        comp.addLayer('Source', { styles: ['outerGlow'] });
        comp.addLayer('Cible');
        comp.layer(2).selected = true;
        app.executeCommand(20);                                 // presse-papiers vide
        assert.throws(() => { comp.layer(2).property('ADBE Layer Styles').selected = true; }, /hidden/);
        app.executeCommand(19);                                 // rien de sélectionné qui se copie
        app.executeCommand(20);
        assert.throws(() => { comp.layer(2).property('ADBE Layer Styles').selected = true; }, /hidden/);
    });

    test('faux AE : l\'effet « ADBE Ramp » se pose sur un calque de forme avec ses sept paramètres', () => {
        const comp = styleComp();
        const shape = comp.layers.addShape();
        const fx = shape.property('ADBE Effect Parade').addProperty('ADBE Ramp');
        assert.strictEqual(fx.matchName, 'ADBE Ramp');
        for (let i = 1; i <= 7; i++) assert.ok(fx.property('ADBE Ramp-000' + i), 'ADBE Ramp-000' + i);
        fx.property('ADBE Ramp-0001').setValue([10, 20]);
        fx.property('ADBE Ramp-0002').setValue([1, 0, 0, 1]);
        fx.property('ADBE Ramp-0003').setValue([30, 40]);
        fx.property('ADBE Ramp-0004').setValue([0, 0, 1, 1]);
        fx.property('ADBE Ramp-0005').setValue(1);
        fx.property('ADBE Ramp-0006').setValue(0);
        fx.property('ADBE Ramp-0007').setValue(0);
        assert.deepStrictEqual(shape.property('ADBE Effect Parade').property('ADBE Ramp').property('ADBE Ramp-0003').value, [30, 40]);
        assert.throws(() => fx.property('ADBE Ramp-0002').setValue([1, 0, 0]), /dimensions/, 'une couleur a quatre canaux');
    });

    test('faux AE : une recette d\'import peut déclarer des styles sur un calque', () => {
        const file = new FakeFile('/x/Fond.psd');
        app.importRecipes[file.fsName] = { layers: [{ name: 'A', styles: ['outerGlow'] }, { name: 'B' }] };
        const opts = new ImportOptions(file);
        opts.importAs = ImportAsType.COMP_CROPPED_LAYERS;
        const comp = app.project.importFile(opts);
        comp.layer(1).property('ADBE Layer Styles').selected = true;
        assert.throws(() => { comp.layer(2).property('ADBE Layer Styles').selected = true; }, /hidden/);
    });

    test('faux AE : importFile importe un calque de forme Photoshop comme After 26.2 (métrage à la taille du document, tracé en masque), un calque de pixels à sa boîte', () => {
        const { FolderItem } = require('./fake-ae');
        const file = new FakeFile('/x/Fond.psd');
        const opts = new ImportOptions(file);
        opts.importAs = ImportAsType.COMP_CROPPED_LAYERS;
        const comp = app.project.importFile(opts);   // recette par défaut : un groupe « Fond » (Rectangle 1 = forme, PourQUOI ??? et Calque 0 = pixels)
        const sub = comp.layers[0].source;
        const [rect, text, pixels] = sub.layers;
        assert.deepStrictEqual([rect.source.width, rect.source.height], [comp.width, comp.height], 'forme : taille du document');
        assert.strictEqual(rect.masks.length, 1, 'son tracé en masque');
        assert.deepStrictEqual(rect.masks[0].vertices, [[759, 272], [1620, 272], [1620, 477], [759, 477]]);
        assert.deepStrictEqual([comp.width / 2, comp.height / 2], rect.transform.children.find((c) => c.matchName === 'ADBE Position').value, 'position au centre du document');
        assert.deepStrictEqual([pixels.source.width, pixels.source.height], [861, 205], 'pixels : la boîte');
        assert.ok(!pixels.masks && !text.masks);
        // le dossier du Projet qui reçoit l'import : la racine, ou app.importFolder
        assert.strictEqual(comp.parentFolder, null);
        const cible = new FolderItem('Cible');
        app.project.items.push(cible);
        app.importFolder = cible;
        const other = new FakeFile('/x/Autre.psd');
        const o2 = new ImportOptions(other);
        o2.importAs = ImportAsType.COMP_CROPPED_LAYERS;
        const dedans = app.project.importFile(o2);
        assert.strictEqual(dedans.parentFolder, cible);
        assert.strictEqual(app.project.items.filter((it) => it.name === 'Autre Calques')[0].parentFolder, cible);
        app.reset();
        assert.strictEqual(app.importFolder, null);
    });

    test('bac à sable : $.global est le contexte global', () => {
        const sb = createSandbox();
        vm.runInContext('$.global.X = 42;', sb);
        assert.strictEqual(vm.runInContext('X', sb), 42);
    });
};
