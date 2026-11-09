# Import PSD : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** un geste « Importer les PSD » dans la Boîte à outils : liste à cocher des `.psd` de
`02_RESSOURCES/02_ASSET`, import en compositions, puis dans chaque planche textes convertis,
formes Photoshop recréées en calques de forme (avec leurs styles), libellés posés.

**Architecture :** le panneau lit les PSD en binaire (Node `fs`, via `SIMING.nodeRequire`) et en
tire un JSON de formes, en coordonnées du document PSD. L'hôte importe, retrouve chaque calque
PSD dans l'arbre des compos importées, calcule le décalage document → compo **depuis le calque
After lui-même** (sa boîte = la boîte de pixels du PSD, tailles de calques conservées), crée le
calque de forme, pose les styles, supprime l'original. Un seul appel hôte pour le lot.

**Tech Stack :** JS natif (panneau, CEP, Node activé), ExtendScript ES3 (hôte), tests Node
(`node tests/run.js`, simulacre `tests/fake-ae.js`).

**Spec :** `docs/superpowers/specs/2026-11-09-import-psd-design.md` (à lire en entier).

## Global Constraints

- Hôte ES3 strict, UTF-8 **avec BOM**, jamais `===` entre calques, `SIMING.ae.undo(nom, fn)` pour
  l'action entière, fonctions d'API en JSON (cf. `CLAUDE.md`).
- Panneau : pas de `evalScript` hors `bridge.js` ; composants `js/ui/` ; un seul bouton principal
  dans la vue liste : « Importer N PSD » ; pas d'`alert` ; statut sur une ligne.
- Identifiants en anglais, textes d'interface et commentaires en français, tutoiement dans l'aide.
- Versions : `tools.json` `version` 1.4.0 → **1.5.0**, outil `toolbox` 1.0.0 → **1.1.0** ; jamais
  le manifeste.
- Styles pris en charge : ombre portée, ombre interne, lueur externe, lueur interne, biseau et
  estampage, satin, incrustation couleur, incrustation dégradé, contour. Incrustation de motif →
  la forme reste le calque PSD. `enab: false` → style ignoré ; `masterFXSwitch: false` → aucun.
- Formes non reproductibles : calque PSD laissé tel quel, **non cité** dans le rapport.
- Les PSD du projet client de référence (`PROJET_CLIENT`) ne sont jamais copiés dans le dépôt.
- Décision de plan (Claude) : les styles sont **toujours** recréés d'après le `lfx2` du PSD, que
  l'import les ait rendus modifiables ou non : un seul chemin, testable sans After.
- Décision de plan (Claude) : After ne laisse pas toujours écrire les couleurs d'un dégradé par
  script (`ADBE Vector Grad Colors`). Si l'écriture échoue, la forme reste le calque PSD (règle
  « intact plutôt qu'approximatif »), sans message.

## Review Focus

1. Calque PSD dont le nom se répète (deux « Rectangle 1 ») : chaque forme remplace le bon calque.
2. Origine `vogk` périmée (tracé retouché après coup) : jamais de rectangle paramétrique faux,
   repli sur Tracé.
3. PSD sans plan de travail mais avec groupes (planche test), et PSD avec plan de travail
   (projet client) : la forme tombe au pixel dans les deux cas (décalage tiré du calque After).
4. Projet jamais enregistré, ou dossier `02_ASSET` absent : sélecteur de dossier, aucun plantage.
5. Calque PSD verrouillé ou masqué : remplacé quand même, forme masquée / verrouillée pareil.

Chaque point a son test dans la tâche qui possède le code (renvois `RF1`…`RF5`).

**Ordre d'exécution :** 1, 3, 2, 4, 5, 6, 7, 8, 9 (les formes consomment les styles).

---

### Task 1 : lecteur PSD (structure et descripteurs)

**Files :**
- Create : `extension/client/js/psd/reader.js`
- Create : `tests/fixtures/psd/planche-test.psd` (déplacé depuis `docs/test-plache photoshop.psd`)
- Test : `tests/psd-reader.test.js` (branché dans `tests/run.js`, avant `toolbox-core`)

**Interfaces :**
- Produces : `SIMING.psd.read(buffer) -> { width, height, layers: PsdLayer[] }` (aussi
  `module.exports` quand `module` existe, pour les tests Node).
  `PsdLayer = { id (lyid), name (luni, sinon nom Pascal), box: { left, top, right, bottom },
  opacity (0-255), blend (clé 4 lettres), hidden (bool), kind: 'group'|'layer', artboard
  (rect ou null), children (groupes seulement), blocks: { vogk, vscg, vstk, vsms, lfx2 (descripteurs
  décodés ou undefined), TySh: bool } }`. Arbre dans l'ordre du panneau Calques (haut en premier) ;
  les enregistrements du fichier sont de bas en haut, un groupe = marqueur de fin (`lsct` 3)
  puis ses enfants puis l'en-tête (`lsct` 1 ou 2).
  `SIMING.psd.descriptor(buffer, offset) -> { value, end }`.

- [ ] **Step 1 : tests en échec** sur la planche test :

```js
const { read } = require('../extension/client/js/psd/reader.js');
const doc = read(fs.readFileSync(path.join(__dirname, 'fixtures/psd/planche-test.psd')));
assert.deepStrictEqual([doc.width, doc.height], [1920, 1080]);
const names = (ls) => ls.map((l) => l.name);
assert.deepStrictEqual(names(doc.layers), ['Groupe 1', 'PourQUOI ???', 'Rectangle 1', 'Ellipse 1', 'Calque 0']);
assert.deepStrictEqual(names(doc.layers[0].children), ['Polygone 1', 'Rectangle 3', 'Rectangle 2']);
const r1 = doc.layers[2];
assert.deepStrictEqual(r1.box, { left: 759, top: 272, right: 1620, bottom: 477 });
assert.strictEqual(r1.blocks.vogk.keyDescriptorList[0].keyOriginType, 2);
assert.strictEqual(doc.layers[1].blocks.TySh, true);
```
  Plus un test de `descriptor` sur un tampon fabriqué à la main (types `Objc`, `VlLs`, `doub`,
  `UntF` → `{ unit, v }`, `TEXT`, `enum` → `{ enum, v }`, `long`, `bool`).
- [ ] **Step 2 :** `node tests/run.js` → les nouveaux tests échouent (module absent).
- [ ] **Step 3 :** écrire `reader.js`. En-tête 26 octets ; sections mode couleur et ressources
  sautées ; infos calques : nombre signé (valeur absolue), enregistrements, blocs additionnels
  (signature `8BIM`/`8B64`, clé, longueur). Piège : en JS, `o += u32()` perd l'avance faite par
  `u32` (lire dans une variable d'abord). Descripteur : nom Unicode, classe (longueur 0 → clé de
  4 lettres), n éléments. `vogk`/`lfx2` : 8 octets de version avant le descripteur, `vstk`/`artb` : 4,
  `vscg` : clé 4 lettres + 4 octets. PSB (version 2) → `throw new Error('PSB non pris en charge')`.
- [ ] **Step 4 :** `0 échoué(s)`.
- [ ] **Step 5 :** commit `feat(psd): lecteur PSD (calques, groupes, descripteurs)`.

### Task 2 : extraction des formes

**Files :**
- Create : `extension/client/js/psd/shapes.js`
- Test : `tests/psd-shapes.test.js`

**Interfaces :**
- Consumes : `SIMING.psd.read` (Task 1), `SIMING.psd.styles` (Task 3).
- Produces : `SIMING.psd.shapes(doc) -> Shape[]`, une entrée par calque vectoriel reproductible,
  en coordonnées du **document** :
  `Shape = { match: { name, nth }, box: { left, top, right, bottom } (boîte de pixels du calque,
  sert au décalage hôte), opacity (0-100), blend ('normal'|'multiply'|'screen'|…), hidden,
  paths: SubPath[], fill: Fill|null, stroke: Stroke|null, styles: Style[] }`.
  `SubPath = { type: 'rect', center: [x,y], size: [w,h], rotation (degrés), roundness }
  | { type: 'ellipse', center, size, rotation } | { type: 'path', vertices: [[x,y]…],
  inTangents, outTangents (relatifs au sommet, convention After), closed }`.
  `Fill = { type: 'solid', color: [r,g,b] (0-1) } | { type: 'gradient', kind: 'linear'|'radial',
  angle, stops: [{ pos (0-1), color }], opacityStops: [{ pos, opacity (0-1) }] }`.
  `Stroke = { width, color, align: 'center'|'inside'|'outside' }`, null si `strokeEnabled` faux.
  `match.nth` = rang (0, 1…) parmi les calques du **même nom** dans tout le document, parcours
  haut → bas en profondeur.

- [ ] **Step 1 : tests en échec** (planche test, valeurs relevées le 2026-11-09, tolérance 0,01
  sauf mention) :
  - « Rectangle 1 » → un `rect`, `center` [1189.5, 374.5], `size` [859, 203], `rotation` 0,
    `roundness` 55, `fill` solide [9.9455, 107.2685, 169] / 255, `stroke` null, `styles` [].
  - « Rectangle 2 » → `rect` `center` [291, 806], `size` [152, 152] (±0,01), `rotation` 45 (±0,01).
  - « Rectangle 3 » → **deux** `rect` : centre [711.5, 824.5] taille [177, 177], centre [928, 824]
    taille [176, 176].
  - « Ellipse 1 » → `ellipse` `center` [360.5, 369.5], `size` [351, 351] ; `fill` `gradient`
    `linear`, `angle` 129.
  - « Polygone 1 » → `path` fermé de 5 sommets, premier [1246.5, 636] (±0,5).
  - « PourQUOI ??? » et « Calque 0 » absents.
  - **RF2** : planche lue puis coins `keyOriginBoxCorners` de « Rectangle 1 » décalés de 10 px en
    mémoire → `path`, pas `rect`.
  - **RF1** : `doc` construit à la main avec deux « Rectangle 1 » (un dans un groupe, un à la
    racine en dessous) → `match.nth` 0 pour celui du groupe, 1 pour l'autre.
  - Rayons inégaux dans `keyOriginRRectRadii` → `path`.
  - `styles(lfx2)` qui rend `null` → calque absent du résultat.
- [ ] **Step 2 :** tests en échec.
- [ ] **Step 3 :** écrire `shapes.js`. `keyOriginType` : 1 rectangle, 2 rectangle arrondi,
  5 ellipse, autres → `path`. Plusieurs origines dans `keyDescriptorList` = plusieurs sous-tracés.
  `keyOriginBoxCorners` (coins A B C D, déjà transformés) → centre = moyenne, taille = |AB|, |BC|,
  rotation = atan2(AB). Ellipse : `keyOriginShapeBBox` (+ `Trnf` pour la rotation).
  `vsms` : après 8 octets d'en-tête, enregistrements de 26 octets ; type 0/3 = début de sous-tracé
  fermé/ouvert ; 1/2/4/5 = nœud : tangente avant, ancre, tangente après, chacun **y puis x**, en
  virgule fixe 8.24 relative à la hauteur / largeur du document. Une origine n'est crue que si
  la boîte des nœuds d'un sous-tracé coïncide (0,5 px) avec la boîte de ses coins. Couleurs `RGBC`
  0-255 → 0-1 (`redFloat`… déjà 0-1). Opacité 0-255 → 0-100.
- [ ] **Step 4 :** verts. **Step 5 :** commit `feat(psd): formes Photoshop en JSON`.

### Task 3 : extraction des styles de calque

**Files :**
- Create : `extension/client/js/psd/styles.js`
- Test : `tests/psd-styles.test.js`

**Interfaces :**
- Produces : `SIMING.psd.styles(lfx2) -> Style[] | null` (null = un style actif non reproductible
  → la forme n'est pas recréée ; `lfx2` absent → `[]`). `Style = { kind, … }`, `kind` parmi
  `dropShadow` (`DrSh`), `innerShadow` (`IrSh`), `outerGlow` (`OrGl`), `innerGlow` (`IrGl`),
  `bevelEmboss` (`ebbl`), `satin` (`ChFX`), `colorOverlay` (`SoFi`), `gradientOverlay` (`GrFl`),
  `stroke` (`FrFX`). Valeurs communes : `blend`, `color` [0-1], `opacity` (0-100) ; selon le style
  `angle`, `useGlobalLight`, `distance`, `size` (`blur`), `spread` (`Ckmt`), `noise`. Lit la forme
  simple (`DrSh`) comme les listes (`dropShadowMulti[]`, …).

- [ ] **Step 1 : tests en échec**, descripteurs écrits à la main reprenant `7.psd` :
  - `OrGl` `enab` vrai, `Md` `screen`, `redFloat` 1, `greenFloat` 1, `blueFloat` 1, `Opct` 43 →
    un `outerGlow` `{ blend: 'screen', color: [1, 1, 1], opacity: 43 }` (± arrondi 0,001).
  - `dropShadowMulti` avec une ombre `enab: false` seule → `[]`.
  - `masterFXSwitch: false` avec une ombre active → `[]`.
  - `patternFill` actif → `null`.
  - ombre portée active (couleur [79, 179, 235]/255, `Opct` 99, `lagl` 90, `Dstn` 2, `blur` 49,
    `Ckmt` 0) → `{ kind: 'dropShadow', opacity: 99, angle: 90, distance: 2, size: 49, spread: 0 }`.
  - Test sauté si absent : `$SIMING_PSD_SAMPLES/7.psd` (planche 7 du projet client)
    → `shapes` contient « Rectangle  » (nom avec espace final) : `roundness` 59, `styles` = un
    `outerGlow`.
- [ ] **Step 2 → 4.** **Step 5 :** commit `feat(psd): styles de calque Photoshop en JSON`.

### Task 4 : hôte, dossier et liste des PSD

**Files :**
- Create : `extension/host/tools/psdimport.jsx` (chargé comme les autres outils hôtes : vérifier
  le chargement dans `siming.jsx` et `tests/helpers.js`)
- Modify : `tests/fake-ae.js` (`Folder.selectDialog`, `app.project.importFile`, `ImportOptions`,
  `ImportAsType`, `app.project.items.addFolder`)
- Test : `tests/psdimport-api.test.js`

**Interfaces :**
- Produces (outil hôte `psdimport`, `SIMING.registerTool('psdimport', api)`) :
  - `list(args: { folder?: string }) -> { folder: string|null, files: [{ name, path, imported }],
    status }`. Sans `folder` : depuis `app.project.file`, remontée d'au plus 3 dossiers parents
    jusqu'à un dossier qui contient `02_RESSOURCES/02_ASSET`. `imported` = un `FootageItem` du
    projet a pour fichier ce PSD (`fsName` comparés sans la casse). Fichiers triés par nom naturel
    (`2.psd` avant `10.psd`).
  - `pickFolder(args: { from?: string }) -> { folder: string|null }` : `Folder.selectDialog`,
    départ = dossier du projet s'il existe.
- [ ] **Step 1 : tests en échec** avec `<tmp>/PROJ/02_RESSOURCES/02_ASSET/{1.psd,2.psd,notes.txt}`
  et `<tmp>/PROJ/03_PROJET/p.aep` : `list({})` → `folder` …/02_ASSET, `files` `1.psd`, `2.psd`,
  `imported: false` ; après ajout d'un `FootageItem` de fichier `1.psd` → `imported: true`.
  **RF4** : `app.project.file = null` → `{ folder: null, files: [] }`, statut
  « Projet non enregistré : choisis le dossier des PSD » (`info`) ; arborescence sans
  `02_RESSOURCES/02_ASSET` → « Dossier 02_RESSOURCES/02_ASSET introuvable : choisis le dossier des PSD ».
- [ ] **Step 2 → 4.** **Step 5 :** commit `feat(psdimport): dossier et liste des PSD`.

### Task 5 : hôte, calque de forme d'après le JSON

**Files :**
- Modify : `extension/host/tools/psdimport.jsx`
- Modify : `tests/fake-ae-props.js` (`addProperty` : `ADBE Vector Shape - Ellipse`,
  `ADBE Vector Shape - Group`, `ADBE Vector Graphic - Stroke`, `ADBE Vector Graphic - G-Fill`,
  groupe avec `ADBE Vector Transform Group` / `ADBE Vector Rotation`) ; `Shape` (tracés) ;
  `layer.remove()`, `moveBefore`
- Test : `tests/psdimport-api.test.js`

**Interfaces :**
- Produces : `api._core.replaceWithShape(comp, layer, shape) -> ShapeLayer | null`. Décalage
  `dx = pos[0] - anchor[0] - shape.box.left`, `dy = pos[1] - anchor[1] - shape.box.top` ; calque
  PSD à échelle ≠ 100 % ou tourné → `null`, calque intact. Nouveau calque de forme : même nom,
  juste au-dessus de l'original, mêmes `startTime`/`inPoint`/`outPoint`, `parent`, `enabled`,
  `opacity`, `blendingMode` ; ancre [0, 0], position [dx, dy] ; un groupe par sous-tracé
  (rectangle : `ADBE Vector Rect Size`, `ADBE Vector Rect Position` = centre, `ADBE Vector Rect
  Roundness` ; rotation sur le groupe), puis contour, puis remplissage ; écriture d'un dégradé qui
  lève → calque de forme supprimé, `null`. Puis original supprimé (verrou levé avant), verrou
  reporté sur la forme.
- [ ] **Step 1 : tests en échec** : comp 1920 × 1080, calque PSD « Rectangle 1 » position
  [1189.5, 374.5], ancre [430.5, 102.5] (boîte 861 × 205 en 759, 272), shape de la Task 2 →
  calque de forme « Rectangle 1 » au même index, original supprimé, taille [859, 203], position du
  rectangle [1189.5, 374.5], arrondi 55, couleur reprise. **RF3** : calque PSD décalé de (+100, +50)
  dans la compo → position du rectangle [1289.5, 424.5]. **RF5** : original verrouillé et masqué →
  forme verrouillée et masquée, original supprimé. Échelle 50 % → `null`, calque intact.
- [ ] **Step 2 → 4.** **Step 5 :** commit `feat(psdimport): formes recréées en calques de forme`.

### Task 6 : hôte, styles de calque

**Files :**
- Modify : `extension/host/tools/psdimport.jsx`, `tests/fake-ae.js` (commandes de menu des styles :
  ajoutent `ADBE Layer Styles` › style au calque sélectionné)
- Test : `tests/psdimport-api.test.js`

**Interfaces :**
- Produces : `api._core.applyStyles(comp, layer, styles) -> number` (styles posés). Ajout par
  `app.executeCommand` sur le calque seul sélectionné (même mécanique que `convertPsdText` : noms
  anglais et français des menus Calque › Styles de calque, aucun identifiant numérique de repli),
  puis valeurs par `matchName` (à relever dans After et à consigner dans
  `NOTES-EXTENDSCRIPT.md`). Commande introuvable → style sauté, sans message.
- [ ] **Step 1 : tests en échec** : `[outerGlow screen blanc 43]` → commande « Outer Glow » lancée
  une fois, opacité 43 posée, retour 1 ; `[]` → aucune commande ; `menuNames = {}` → 0, sans erreur.
- [ ] **Step 2 → 4.** **Step 5 :** commit `feat(psdimport): styles de calque recréés`.

### Task 7 : hôte, import du lot

**Files :**
- Modify : `extension/host/tools/psdimport.jsx` ; `extension/host/tools/toolbox.jsx` (extraire la
  boucle de `convertPsdText` en `api._core.convertTextsIn(comp, layers) -> { done, skipped }`,
  comportement de `convertPsdText` inchangé) ; `extension/host/tools/labels.jsx` (exposer
  `api._core.labelLayers(layers, rules) -> number`, même logique que `collect` puis pose)
- Test : `tests/psdimport-api.test.js` ; `tests/toolbox-api.test.js` et `labels-api` restent verts

**Interfaces :**
- Consumes : Tasks 4 à 6, `SIMING.getTool('toolbox')._core.convertTextsIn`,
  `SIMING.getTool('labels')._core.labelLayers`.
- Produces : `importBatch(args: { items: [{ path, shapes: Shape[] | null, error?: string }],
  rules }) -> { imported: [{ name, compId }], status }`. Pour chaque item sans `error` :
  `importFile` (`ImportOptions`, `importAs = ImportAsType.COMP_CROPPED_LAYERS`) ; compo et dossier
  « N Calques » rangés dans le dossier `02_ASSET` du panneau Projet (créé à la racine sinon) ;
  parcours en profondeur de la compo et des précompos créées par cet import ; formes : calques
  repérés par nom de métrage `<nom>/<fichier>.psd` et rang `nth` dans ce parcours ; textes :
  `convertTextsIn` après `openInViewer` de la compo ; libellés sur tous les calques des compos
  importées. Compo active d'origine rouverte à la fin. Le tout dans
  `ae.undo('Boîte à outils : importer les PSD', …)`. Statut :
  `<n> PSD importé(s) · <t> texte(s) · <f> forme(s)` (+ ` · <k> PSD illisible(s)`, niveau `warn`)
  + ` · Ctrl+Z pour annuler` ; pluriels via `S.plural`.
- [ ] **Step 1 : tests en échec** : le faux `importFile` fabrique pour un chemin la compo « 1 »
  contenant la précompo « 1 » avec « Rectangle 1 » (métrage `Rectangle 1/1.psd`),
  « PourQUOI ??? » (`psdText`) et « Calque 0 » ; `importBatch` → un seul groupe d'annulation
  `Boîte à outils : importer les PSD`, « Rectangle 1 » devenu calque de forme, texte converti,
  libellés posés selon `rules`, statut exact `1 PSD importé · 1 texte · 1 forme · Ctrl+Z pour annuler`.
  Item avec `error` en plus → `1 PSD importé · 1 texte · 1 forme · 1 PSD illisible(s) · Ctrl+Z pour annuler`, `warn`.
- [ ] **Step 2 → 4.** **Step 5 :** commit `feat(psdimport): import du lot, textes, formes, libellés`.

### Task 8 : vue, bouton et liste à cocher

**Files :**
- Modify : `extension/client/tools/toolbox.js` (bouton « Importer les PSD », section « Calques » ;
  icône nouvelle `importer` dans `docs/design/icons.json` + `node tools/build-icons.js`) ;
  `extension/client/index.html`, `tool.html` (scripts `js/psd/reader.js`, `styles.js`, `shapes.js`
  après `bridge.js`) ; `extension/client/js/ui/controls.js` : `ui.checkList({ role, emptyText })`
  → `el.setRows([{ key, name, pill, checked }])`, `el.checked() -> keys[]`, `el.setAll(bool)`,
  `onChange` ; styles dans `css/charte.css` (lignes ≥ 32 × 30)
- Test : `tests/toolbox-view.test.js`, `tests/ui-controls.test.js`

**Interfaces :**
- Consumes : `psdimport.list`, `psdimport.pickFolder`, `psdimport.importBatch`, `SIMING.psd.read`,
  `SIMING.psd.shapes`, `settings.get('labels.rules')` (même format que l'outil Libellés).
- Le clic remplace le contenu de la Boîte à outils par une vue liste : chemin du dossier, lien
  « Changer de dossier », « Tout / Rien », `checkList` (pastille « déjà importé »), bouton
  principal « Importer N PSD » (désactivé à 0), bouton « Annuler ». Validation : lecture de chaque
  PSD coché (`fs.readFileSync` par `SIMING.nodeRequire()('fs')`), `shapes` ; erreur de lecture →
  `{ path, error }` ; `importBatch` ; retour à la vue normale, statut de l'hôte. Pendant la
  lecture : statut « Lecture des PSD… (k / n) ».
- [ ] **Step 1 : tests en échec** : deux lignes, `2.psd` décochée avec pastille « déjà importé » ;
  bouton « Importer 1 PSD », puis « Importer 2 PSD » après « Tout » ; `importBatch` appelé une fois
  avec deux `items` et `rules` ; un `read` qui lève → item `error` ; sans Node →
  « Lecture des PSD impossible : Node n'est pas activé dans ce panneau » (`error`).
- [ ] **Step 2 → 4.** **Step 5 :** commit `feat(toolbox): geste Importer les PSD`.

### Task 9 : documentation, version, vérification

**Files :** `extension/client/tools.json`, aide dans `extension/client/tools/toolbox.js`,
`README.md`, `docs/SUIVI.md`, `docs/NOTES-EXTENDSCRIPT.md`, `docs/TESTS-MANUELS.md`,
`extension/client/js/mcp/protocol.js` (`GESTURES`, si la forme des entrées s'y prête).

- [ ] **Step 1 :** versions 1.5.0 / toolbox 1.1.0 ; fiche d'aide « Importer les PSD » : « Les .psd
  de 02_RESSOURCES/02_ASSET ; ceux déjà importés sont décochés. Textes convertis, formes
  recréées, libellés posés. »
- [ ] **Step 2 :** `TESTS-MANUELS.md` : sur une **copie** de `PROJET_CLIENT` : 7 PSD listés ;
  import de `7.psd` ; « Rectangle » recréé, arrondi 59, lueur externe, recouvre exactement
  l'original (comparer avant / après avec Ctrl+Z) ; textes convertis ; un seul Ctrl+Z (sinon deux :
  consigner) ; styles modifiables ou non à l'import (consigner) ; planche test : rectangle tourné
  à 45°, deux rectangles de « Rectangle 3 », ellipse en dégradé (recréée ou laissée en PSD).
- [ ] **Step 3 :** `node tests/run.js` → `0 échoué(s)` ; `node tools/release.js --dry-run` → OK.
- [ ] **Step 4 :** commit `docs: import PSD (1.5.0)`.
