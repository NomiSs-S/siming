# SIMING : conventions du projet

Bibliothèque d'outils pour After Effects, sous forme d'**extension CEP** : interface
HTML/CSS/JS dans un panneau (`extension/client/`), cœur ExtendScript qui agit sur le
projet (`extension/host/`). Spec de référence :
`docs/superpowers/specs/2026-10-05-siming-cep-design.md`. Visuel :
`docs/CHARTE-GRAPHIQUE.md` (maquettes : https://claude.ai/artifact/XiZ4HWrNKuWiaYUXKGZhgQ).

**État : 1.0.0** (plan d'origine : `docs/superpowers/plans/2026-10-05-siming-cep-1-0-0.md`).

## Structure

- `extension/client/tools.json` : version de l'ensemble, dépôt GitHub et liste des outils (seule source).
- `extension/client/` : `index.html` (hub), `tool.html` (outil seul, déduit de l'identifiant d'extension),
  `css/charte.css`, `js/bridge.js` (seul contact avec AE), `js/keys.js` (raccourcis :
  registre d'actions, un outil y enregistre ses gestes via `ctx.keys`), `js/ui/` (composants),
  `tools/<id>.js` (vues).
- `extension/host/` : `siming.jsx` (JSON, helpers AE, annulation, routeur),
  `tools/<id>.jsx` (cœur et API de chaque outil).
- `tests/` : `node tests/run.js`. `tools/` : dev-install, make-cert, release.js, installeurs.
- `docs/SUIVI.md` : journal, pistes, erreurs. À mettre à jour à chaque session.
- `docs/NOTES-EXTENDSCRIPT.md` : pièges techniques ExtendScript et CEP. Y ajouter chaque piège découvert.

## Règles de code

**Hôte (`.jsx`)**
- ES3 strict : pas de `forEach`, `map`, `filter`, `indexOf`, `trim`, `JSON`, `Object.keys`, `let`, `const`, fonctions fléchées.
- UTF-8 **avec BOM** ; après toute réécriture complète d'un `.jsx`, vérifier que le BOM est là.
- Jamais `===` entre deux objets calque : comparer `index` ou `id` (`SIMING.ae.sameLayer`).
- Chaque action utilisateur = un seul groupe d'annulation via `SIMING.ae.undo(nom, fn)`.
- Les fonctions d'API reçoivent et renvoient des données JSON (identifiants, noms), jamais d'objets AE ; elles renvoient l'état complet dont la vue a besoin.
- Logique métier en fonctions pures exposées pour les tests.

**Client (`.js`, `.css`, `.html`)**
- JS natif moderne, sans framework ni build. Pas d'appel direct à `CSInterface.evalScript` hors de `bridge.js`.
- Composants de `js/ui/` réutilisés plutôt que recodés ; un composant nouveau s'écrit quand un outil en a besoin, pas avant.
- Charte : jetons CSS de `charte.css`, au plus un bouton principal par outil (verbe + quantité ; aucun dans un outil de gestes rapides, où Entrée rejoue le dernier geste), cibles cliquables d'au moins 32 × 30, statut sur une ligne (info / ok / warn / error), pas d'`alert` (dialogue de la charte).

**Partout** : identifiants en anglais ; commentaires et textes d'interface en français, tutoiement dans les aides.

## Vérification

```
node tests/run.js
```

Doit afficher `0 échoué(s)`. Le rendu se vérifie aussi dans After Effects avec
`docs/TESTS-MANUELS.md`. `node --check` refuse `.jsx` : le test de syntaxe passe par `vm.Script`.

## Versions

`1.x.y` : nouvel outil → mineure ; correction → correctif. Modifier `version` et la
version de l'outil dans `tools.json`, jamais le manifeste (généré).

## Pièges d'outillage de cette machine

- Les commandes Bash longues (au-delà d'environ 8 Ko) échouent : écrire les gros fichiers avec l'outil Write, les petits avec des heredocs, un fichier par commande.
- Dépôt GitHub public `NomiSs-S/siming`, branche `main` (`origin`). ZXPSignCmd, certificat de signature et son mot de passe sont dans `~/.siming/`, hors dépôt.
- Ne jamais committer le certificat de signature ni son mot de passe.

## Ajouter un outil

1. Ajouter l'entrée dans `extension/client/tools.json` (id, nom, icône, version, script).
2. Vue : `extension/client/tools/<id>.js` avec `SIMING.registerTool(id, { help, mount })`.
3. Cœur : `extension/host/tools/<id>.jsx` avec `SIMING.registerTool(id, api)`.
4. Tests hôte et vue dans `tests/`, branchés dans `tests/run.js`.
5. Monter la version mineure dans `tools.json`, documenter dans le README, noter les décisions dans `docs/SUIVI.md`.
6. `node tools/release.js --dry-run`, puis `node tools/release.js` et la Release GitHub (notice des collègues : `docs/INSTALLATION.md`).
