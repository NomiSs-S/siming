# Plan : Quick Tools (SIMING 1.1.0)

Spec : `docs/superpowers/specs/2026-10-06-quicktools-design.md`. Méthode : test qui
échoue d'abord, puis code, `node tests/run.js` à 0 échoué après chaque tâche, un
commit par tâche. Pas de validation intermédiaire demandée par l'auteur : livrer
l'outil complet, puis retours dans After Effects.

- [x] **T1 Préparation** : préréglage déplacé en `extension/host/presets/ElasticController.ffx` ;
  icônes `eclair`, `keyframe`, 6 alignements, 6 répartitions dans `docs/design/icons.json`
  et `js/icons.js` régénéré ; hub limité à la rangée de chiffres (`e.code` Digit) avec test.
- [x] **T2 Faux AE étendu** (`tests/fake-ae-props.js`, `tests/fake-ae.js`, `tests/fake-ae.test.js`) :
  propriétés et keyframes, interpolation et ease, expression, effets et `applyPreset`,
  transformations, `sourceRectAtTime`, `selectedProperties`, caméras, dimensions séparées, 3D.
- [x] **T3 Cœur hôte, fonctions pures** (`host/tools/quicktools.jsx`, `tests/quicktools-core.test.js`) :
  `easeArrays`, `anchorTarget`, `compensate`, matrices 2D, `bounds`, `alignDeltas`,
  `distributeDeltas`, `isElastic`, `ELASTIC_EXPRESSION`.
- [x] **T4 API hôte** (`tests/quicktools-api.test.js`) : `init`, `ease`, `elastic`,
  `elasticRemove`, `anchor`, `align`, `distribute` par le routeur ; cas nominaux,
  ignorés, sélection vide, préréglage absent ; groupes d'annulation.
- [x] **T5 Composants** (`js/ui/controls.js`, `charte.css`, `tests/ui-controls.test.js`) :
  `ui.valueBar`, `ui.point9`.
- [x] **T6 Vue** (`client/tools/quicktools.js`, `tests/quicktools-view.test.js`) : quatre
  sections, réglages mémorisés, pavé numérique, Entrée, statut, dialogue des ignorés.
- [x] **T7 Intégration** : `tools.json` (1.1.0, outil 1.0.0), manifeste régénéré, tests
  hub / pages / manifeste adaptés, README, journal, notes ExtendScript, charte,
  `docs/TESTS-MANUELS.md`, `node tools/release.js --dry-run`, commit, push.
- [ ] **T8 Retours** : test dans AE par l'auteur, corrections, Release 1.1.0.
