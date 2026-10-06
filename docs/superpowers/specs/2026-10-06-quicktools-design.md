# Spec de design : Quick Tools (SIMING 1.1.0)

Date : 2026-10-06. Deuxième outil de SIMING, dans l'extension CEP décrite par
`2026-10-05-siming-cep-design.md`. Validé en discussion avec l'auteur ; pas de
maquette dédiée (les composants viennent de la charte), retours sur l'outil réel.

## 1. Objectif

Regrouper sous la souris quatre gestes quotidiens d'animation, sans ouvrir les
dialogues d'After Effects : lisser la vitesse des keyframes, poser une expression
élastique, placer le point d'ancrage, aligner et répartir des calques. Un clic par
geste, un Ctrl+Z par geste, résultat annoncé dans la ligne de statut.

## 2. Décisions

| Sujet | Décision |
|---|---|
| Découpage | Un seul outil `quicktools` (« Quick Tools »), quatre sections empilées, livré complet en 1.1.0 |
| Structure | Sections toujours visibles : Lissage, Elastic, Point d'ancrage, Aligner ; pictos et icônes agissent au clic ; un seul bouton principal (Elastic) |
| Lissage | « Lissage de vitesse + influence » : Bézier, vitesse 0 et influence voulue sur le côté visé, autre côté conservé |
| Geste du lissage | Le relâchement d'une barre applique, le picto de keyframe applique aussi |
| Elastic | Pseudo-effet « Elastic Controller » (Amplitude 20, Frequency 40, Decay 60) livré en préréglage `.ffx`, expression de l'auteur reprise telle quelle ; réglages dans le panneau Effets, pas dans l'outil ; bouton « Retirer » |
| Point d'ancrage | Carré 3 × 3 de la charte et pavé numérique 1–9 ; position compensée (rien ne bouge à l'écran) |
| Aligner | Comme la fenêtre Aligner d'AE : 6 alignements + 6 répartitions, par rapport à la sélection ou à la composition, sur les bords visibles |
| Quantités | Les boutons portent le verbe seul ; la quantité traitée vient dans le statut (la sélection n'est connue qu'au clic) |
| Touches | Le hub ne réagit qu'à la rangée de chiffres (`e.code` Digit…) ; le pavé numérique revient au point d'ancrage |

## 3. Interface (`extension/client/tools/quicktools.js`)

En-tête d'outil (titre, aide, « Ouvrir dans un panneau »), puis :

1. **Lissage** : trois lignes « bouton icône `keyframe` (32 × 30) + barre de valeur » :
   Entrée, Sortie, Les deux ; plage 1–100 %, défaut 33, valeurs mémorisées
   (`settings`, clés `quicktools.easeIn|easeOut|easeBoth`). Relâchement de la barre
   ou clic sur le picto = `ease`.
2. **Elastic** : une ligne, bouton principal « Appliquer Elastic » (`elastic`) et
   bouton discret « Retirer » (`elasticRemove`). Entrée = bouton principal.
3. **Point d'ancrage** : composant « point 9 positions » (108 × 108, neuf cases de 36,
   pointillé = boîte du calque, points 8 px, choisi 12 px accent avec halo). Clic ou
   pavé numérique 1–9 (disposition du pavé : 7 8 9 en haut) = `anchor({ cell })`.
   Dernier choix surligné et mémorisé (`quicktools.anchorCell`).
4. **Aligner** : segmenté « Sélection | Composition » (mémorisé, `quicktools.alignTo`),
   rangée « Aligner » de six boutons icône (gauche, centre H, droite, haut, centre V,
   bas) = `align`, rangée « Répartir » de six boutons icône = `distribute`. Infobulle
   à l'infinitif sur chaque bouton.

**Statut** : « 12 keyframes lissées, entrée 75 % · Ctrl+Z pour annuler » (ok),
« Elastic appliqué à 2 propriétés », « Point d'ancrage placé sur 3 calques »,
« 3 calques alignés à gauche », « 4 calques répartis » ; avertissements précis
(« Aucune keyframe sélectionnée », « Sélectionne au moins 3 calques pour répartir ») ;
erreur « Aucune composition active ». Éléments ignorés : dialogue « Calques ignorés »
avec les raisons, statut en orange, comme Unparent.

**Composants nouveaux** (`js/ui/controls.js`, charte) :

- `ui.valueBar({ label, min, max, step, unit, value, defaultValue, onInput, onChange })` :
  30 px, libellé à gauche et valeur en mono à droite dans la barre, remplissage
  `--accent-soft` et repère 2 px `--accent-text` ; glisser n'importe où (pointer
  capture), Maj = précision ×0,1, double-clic = saisie au clavier dans la barre,
  Alt + clic = valeur par défaut, molette ±1, flèches ±1 et Maj ±10 ; fond `--accent`
  pendant le glissé. `onInput` pendant le geste, `onChange` au relâchement ou à la
  validation. `el.set(value)`, `el.value`.
- `ui.point9({ value, onPick })` : neuf boutons de 36 × 36 dans un cadre pointillé,
  `el.set(cell)`, pavé numérique géré par la vue.
- Boutons icône existants (`s-icon-btn`) pour les pictos et les alignements.

**Icônes** (`docs/design/icons.json`, grille 16, trait 1,5) : `eclair` (outil),
`keyframe`, `alignLeft`, `alignCenterX`, `alignRight`, `alignTop`, `alignCenterY`,
`alignBottom`, `distLeft`, `distCenterX`, `distRight`, `distTop`, `distCenterY`,
`distBottom`.

## 4. Cœur hôte (`extension/host/tools/quicktools.jsx`)

Contrat d'Unparent : JSON en entrée et en sortie, un groupe d'annulation par action,
jamais `===` entre calques. Réponse commune :

```json
{ "report": { "done": 3, "skipped": ["Ombre : calque verrouillé"] },
  "status": { "text": "3 calques alignés à gauche · Ctrl+Z pour annuler", "level": "ok" } }
```

| Fonction | Arguments | Effet |
|---|---|---|
| `init` | — | Statut de départ |
| `ease` | `{ mode: "in"|"out"|"both", influence }` | Lisse les keyframes sélectionnées |
| `elastic` | — | Pose l'expression et l'effet sur les propriétés sélectionnées ayant des keyframes |
| `elasticRemove` | — | Retire l'expression (et l'effet devenu inutile) |
| `anchor` | `{ cell: 1..9 }` | Place le point d'ancrage des calques sélectionnés |
| `align` | `{ edge, relative: "selection"|"comp" }` | Aligne les calques sélectionnés |
| `distribute` | `{ edge }` | Répartit les calques sélectionnés (sélection seulement) |

`edge` ∈ `left | centerX | right | top | centerY | bottom`.

### 4.1 Lissage

Keyframes sélectionnées = pour chaque propriété de `comp.selectedProperties`, ses
`selectedKeys`. Pour chaque keyframe : interpolation Bézier sur le côté visé (l'autre
côté conservé), puis `setTemporalEaseAtKey` avec `KeyframeEase(0, influence)` sur ce
côté, une par dimension (une seule pour une propriété spatiale), l'autre côté recopié
de l'existant. Influence bornée de 0,1 à 100. Ignorées : keyframe en maintien, calque
verrouillé, propriété sans lissage temporel (erreur AE attrapée).

### 4.2 Elastic

Propriétés sélectionnées ayant `numKeys > 0` et acceptant une expression. Calque =
`prop.propertyGroup(prop.propertyDepth)`. Effet cherché par `layer.effect("Elastic
Controller")` ; absent : `applyPreset` de `extension/host/presets/ElasticController.ffx`
(chemin calculé au chargement depuis `$.fileName`), la sélection de calques étant
réduite au calque visé pendant l'appel puis restituée. Les valeurs du préréglage ne
sont pas réécrites. Expression posée telle quelle (constante `ELASTIC_EXPRESSION`,
texte de l'auteur) ; propriété déjà élastique = mise à jour, comptée.

Retrait : propriétés sélectionnées dont l'expression contient
`effect("Elastic Controller")` → expression vidée ; puis, par calque touché, parcours
des propriétés pour vérifier qu'aucune ne cite encore l'effet avant de le supprimer.

### 4.3 Point d'ancrage

Calques sélectionnés, non verrouillés, avec `sourceRectAtTime(temps, false)` de largeur
et hauteur non nulles (caméras et lumières ignorées). Cible dans l'espace du calque :
`[left + width · fx, top + height · fy]`, `fx, fy ∈ {0, ½, 1}` selon la case (1 = bas
gauche … 9 = haut droite, comme le pavé). Compensation : `position += R(rotation Z) ·
S(échelle / 100) · (cible − ancrage)` ; 3D : X et Y seulement, Z inchangé. Propriété
animée : `setValueAtTime(temps)` ; dimensions séparées : X et Y posés séparément.

### 4.4 Aligner et répartir

Boîte d'un calque dans la comp : coins de `sourceRectAtTime` transformés par la chaîne
2D (ancrage, échelle, rotation Z, position, puis parents), rectangle englobant.
Composition : `[0, 0, width, height]`. Référence d'alignement = bord ou centre de
l'union des boîtes (sélection) ou de la comp. Déplacement de chaque calque = référence
− son bord (ou centre), converti dans l'espace de son parent par l'inverse de la
partie linéaire de la matrice du parent, ajouté à la position (à l'instant courant si
animée, dimensions séparées gérées). Sélection : ≥ 2 calques, ≥ 1 par rapport à la
composition. Répartition : ≥ 3 calques, tri par la mesure, extrêmes fixes, les autres
espacés régulièrement. Ignorés : verrouillés, sans boîte.

Fonctions pures exposées dans `api._core` : `easeArrays`, `anchorTarget`,
`compensate`, `layerMatrix`, `bounds`, `alignDeltas`, `distributeDeltas`,
`isElastic`, `ELASTIC_EXPRESSION`.

## 5. Erreurs

Pas de comp active → `error`. Sélection vide ou insuffisante → `warn`, message
précis, rien ne bouge. Élément ignoré → listé avec sa raison, statut `warn`, Ctrl+Z
proposé seulement si quelque chose a été fait. try/catch par élément ; le groupe
d'annulation est toujours fermé. Préréglage introuvable → erreur explicite qui cite le
chemin.

## 6. Tests

Faux AE étendu : propriétés et keyframes (`selectedProperties`, `selectedKeys`,
interpolation, ease par dimension, maintien, expression), effets (`effect(nom)`,
`applyPreset` qui pose un faux « Elastic Controller » à 3 curseurs), transformations
(`sourceRectAtTime`, position, ancrage, échelle, rotation, parent, dimensions
séparées, calques 3D, caméras). Tests : fonctions pures ; API par le routeur (nominal,
ignorés, sélection vide, préréglage absent) ; vue sur jsdom (barre de valeur au glissé,
à la molette, au double-clic, au clavier, Alt + clic ; pictos ; point 9 et pavé
numérique ; segmenté ; boutons d'alignement ; statut ; dialogue des ignorés) ; hub
(rangée de chiffres seulement) ; syntaxe ES3 ; BOM ; manifeste à deux panneaux.
Validation dans After Effects : lignes ajoutées à `docs/TESTS-MANUELS.md`.

## 7. Versions, documentation, livraison

`tools.json` : version 1.1.0, outil `quicktools` 1.0.0. README (section Quick Tools),
`docs/SUIVI.md`, `docs/NOTES-EXTENDSCRIPT.md` (ease par dimension, `applyPreset`,
`sourceRectAtTime`, pseudo-effet en `.ffx`), charte (règle du verbe seul). Manifeste
régénéré (`node tools/release.js --dry-run`) ; test dans AE via le lien de
développement ; Release 1.1.0 « Ajout : Quick Tools » après retours.

## 8. Hors périmètre

Rotation X/Y des calques 3D et caméras dans l'alignement ; réglages Elastic dans le
panneau ; répartition par rapport à la composition ; keyframes de l'ancrage sur toute
la durée (seul l'instant courant est posé).

## 9. Questions ouvertes (à vérifier dans AE)

- `applyPreset` vise-t-il bien le calque visé une fois la sélection réduite à lui ?
- `setTemporalEaseAtKey` sur une propriété spatiale : un seul `KeyframeEase` suffit-il ?
- `sourceRectAtTime` sur une précomposition et un solide : boîte attendue ?
