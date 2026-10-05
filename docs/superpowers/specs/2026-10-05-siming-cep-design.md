# Spec de design : SIMING, extension CEP pour After Effects (v1.0.0)

Date : 2026-10-05. Remplace les specs ScriptUI (retirées).

## 1. Contexte et objectif

SIMING est une bibliothèque d'outils After Effects (AE) regroupés dans un panneau.
La première version était en ScriptUI ; le test dans AE a montré que ScriptUI ne
permet pas d'approcher la maquette (lignes de liste, survols, arrondis, éléments
masqués qui gardent leur place, boutons natifs). On repart sur une **extension CEP** :
une interface HTML/CSS/JS dans un panneau AE, et un cœur ExtendScript qui agit
sur le projet.

**Réussite de la 1.0.0** : Unparent v2 fonctionne dans AE avec un rendu fidèle à la
maquette (canevas « SIMING Tools — DA », planches « Charte graphique » et
« Unparent v2 » : https://claude.ai/artifact/XiZ4HWrNKuWiaYUXKGZhgQ) ; un collègue
installe ou met à jour SIMING en double-cliquant sur un installeur ; ajouter un
outil reste simple.

**Public** : l'auteur et quelques collègues, Windows et macOS, AE récent.
**Contrainte** : tout reste gratuit.

## 2. Décisions

| Sujet | Décision |
|---|---|
| Plateforme | Extension CEP (HTML/CSS/JS + ExtendScript hôte) |
| Nom | **SIMING** (identifiant `com.siming`, dépôt GitHub public `siming`) |
| Organisation | Un panneau hub « SIMING » avec rail d'outils + un panneau isolé par outil |
| Interface | JS natif, sans framework ni étape de build |
| Pont | Un seul module `bridge.js`, seul point à réécrire pour un futur UXP |
| Liste des outils | Un seul fichier `extension/client/tools.json`, lu par le hub et par `release.js` |
| Distribution | Paquet `.zxp` signé (certificat auto-signé gratuit) publié en Release GitHub |
| Mise à jour | Installeur double-clic (Windows `.bat`, macOS `.command`) qui liste les Releases, propose la dernière ou une version au choix, installe via UPIA |
| Versions | `1.x.y` : nouvel outil = mineure, correction = correctif ; 1.0.0 = Unparent |
| Vérification auto des mises à jour dans le panneau | Non (l'auteur prévient ses collègues) |
| Tests | Node : cœur hôte sur faux AE, pont de bout en bout, vues sur jsdom |

## 3. Arborescence

```
siming/
  extension/                   contenu exact du paquet .zxp
    CSXS/manifest.xml          généré par tools/release.js (et tools/dev-install)
    client/
      index.html               hub
      tool.html                un outil seul : tool.html?tool=<id>
      tools.json               liste des outils : id, nom, icône, version, script
      css/charte.css           jetons (variables CSS) + styles des composants
      lib/CSInterface.js       bibliothèque officielle Adobe, copiée telle quelle
      js/siming.js             espace de noms, registre, réglages, thème
      js/bridge.js             appels client -> hôte
      js/ui/*.js               composants de la charte
      js/hub.js                rail, pile de vues, statut, réglages, à propos
      js/standalone.js         page tool.html
      js/icons.js              tracés SVG (repris de docs/design/icons.json)
      tools/unparent.js        vue Unparent
    host/
      siming.jsx               JSON, helpers AE, annulation, routeur, chargement des outils
      tools/unparent.jsx       cœur Unparent + API
  tests/                       run.js, faux AE, tests hôte / pont / vues / paquet
  tools/                       dev-install, make-cert, release.js, installeurs
  docs/                        charte, notes, suivi, installation, tests manuels, specs
```

La version de l'ensemble est le champ `version` de `extension/client/tools.json` (voir le plan).

## 4. Manifeste et panneaux

- `manifest.xml` déclare, pour l'hôte AE (`AEFT`, version minimale fixée à
  l'implémentation selon la plus ancienne version d'AE de l'équipe) et le runtime
  `CSXS 11.0` :
  - `com.siming.hub` : panneau « SIMING », `client/index.html` ;
  - un panneau par outil, `com.siming.tool.<id>` : « SIMING – <Nom> »,
    `client/tool.html?tool=<id>` ;
  - `ScriptPath` commun : `host/siming.jsx`.
- Les panneaux sont ancrables et apparaissent dans Fenêtre › Extensions.
- Bouton « Ouvrir dans un panneau » dans l'en-tête de chaque outil du hub :
  `CSInterface.requestOpenExtension("com.siming.tool.<id>")`. Limite CEP : un
  panneau isolé par outil à la fois.
- `tools.json` est la seule liste d'outils :
  `[{ "id": "unparent", "name": "Unparent", "icon": "delier", "version": "2.0.0", "script": "tools/unparent.js" }]`.
  Le hub le lit au démarrage et charge les scripts ; `release.js` le lit pour
  générer le manifeste. Avec le champ `version` de `tools.json`, aucun numéro n'est recopié à la main.

## 5. Pont client -> hôte

API côté client :

```js
SIMING.bridge.call(toolId, fnName, args)   // -> Promise<data>, rejette avec Error(message)
```

- Sérialisation : `args` en JSON, puis `encodeURIComponent`, injecté dans
  `evalScript('SIMING.call("unparent","detach","<encodé>")')`. Côté hôte :
  `decodeURIComponent` puis parse JSON. Aucun texte utilisateur n'est jamais
  interpolé brut dans le script évalué.
- Réponse : une chaîne JSON, toujours une enveloppe
  `{ "ok": true, "data": … }` ou `{ "ok": false, "error": { "message": "…", "line": 12 } }`.
- La chaîne `EvalScript error.` (échec CEP) devient l'erreur « Erreur du script hôte ».
- Un seul appel à la fois par vue : la vue désactive ses commandes pendant l'appel.
- Pour UXP plus tard, seul ce fichier change (même API `call`).

## 6. Cœur hôte (`host/siming.jsx`)

ExtendScript ES3, UTF-8 avec BOM.

- `SIMING.json.stringify / parse` : implémentation maison, parse par descente
  récursive (jamais `eval`), échappement correct des accents, guillemets, `\n`
  et caractères de contrôle.
- `SIMING.ae` : `getActiveComp`, `layerId` (Layer.id, repli index), `sameLayer`
  (par index), `findLayerById`, `findLayersByName`, `findCompById`,
  `undo(name, fn)` (fin du groupe dans un `finally`).
- `SIMING.registerTool(id, api)` : enregistre un objet de fonctions publiques.
- `SIMING.call(id, fn, encodedArgs)` : route vers `api[fn](args)`, attrape toute
  erreur, renvoie l'enveloppe JSON. Outil ou fonction inconnus : erreur explicite.
- Au chargement, `$.evalFile` de chaque `host/tools/*.jsx` (chemin capturé via
  `$.fileName` au chargement). Un outil hôte cassé est noté et remonté par
  `SIMING.call("siming", "status")` sans empêcher les autres.

## 7. Unparent (v2.0.0)

### 7.1 Cœur (repris de la version ScriptUI archivée)

Inchangé sur le fond : balise `[UP|idParent|NomParent]` en fin de commentaire de
l'enfant détaché, mémoire de session, `resolveParent` (id et nom concordants, nom
unique, id seul, premier homonyme), `analyze`, `resolveTarget`, `detach`,
`restore` (groupes d'annulation « Unparent : détacher » / « Unparent : rattacher »),
`planActions`, `findPending`. La compensation de position est celle d'AE
(`layer.parent = …`), à l'instant courant.

### 7.2 API hôte

Toutes renvoient un **état complet** pour que la vue se redessine en un aller-retour.

| Fonction | Arguments | Effet |
|---|---|---|
| `pick` | `{ compId?, targetId? }` | Lit la sélection ; sans sélection et avec un parent courant dans la comp active, ré-analyse ce parent |
| `refresh` | `{ compId, targetId }` | Ré-analyse le parent courant |
| `detach` | `{ compId, targetId, ids }` | Détache ces enfants |
| `restore` | `{ compId, targetId, ids }` | Rattache ces enfants |
| `restorePending` | `{ pendingCompId, ids, compId?, targetId? }` | Rattache un groupe en attente (éventuellement dans une autre comp), puis renvoie l'état du parent courant |

État renvoyé :

```json
{
  "comp":    { "id": 100, "name": "Comp 1" },
  "target":  { "id": 1001, "name": "Parent", "label": 1, "color": "#B53838" },
  "entries": [ { "id": 1002, "name": "A", "state": "linked" } ],
  "plan":    { "nLinked": 2, "nDetached": 1,
               "primary":   { "action": "detach",  "ids": [1002, 1003], "label": "Détacher les 2 restants" },
               "secondary": { "action": "restore", "ids": [1005], "label": "Rattacher 1 détaché" },
               "banner": "1 enfant détaché sur 3" },
  "pending": [ { "compId": 200, "compName": "Comp 2", "parentName": "Tete", "found": true, "ids": [2002, 2003] } ],
  "report":  { "done": 1, "skipped": [] },
  "status":  { "text": "« A » détaché · Ctrl+Z pour annuler", "level": "ok" }
}
```

`comp` et `target` valent `null` quand rien n'est ciblé. `report` vaut `null`
hors action. `status.level` ∈ `info | ok | warn | error`.

### 7.3 Vue (comportement validé sur la maquette)

1. **Carte Parent** (56 px, toute la carte cliquable) : vide = « Prendre le calque
   sélectionné » + aide ; remplie = carré de la couleur d'étiquette du parent (`target.color`, absent si `null`), nom du parent, « n enfants · Comp ». Clic = `pick`.
2. **Bandeau ambre** (`plan.banner`), absent quand vide.
3. **Bouton principal** (40 px) = `plan.primary` ; **bouton secondaire** (32 px)
   = `plan.secondary`, absent sinon. Bouton principal désactivé s'il n'y a rien à faire.
4. **Enfants** : compteur, segmenté Tous / Liés / Détachés avec les nombres, liste
   à lignes de 32 px (icône d'état, nom, pastille « lié » / « détaché » ; au
   survol la pastille laisse place à l'action « Détacher » / « Rattacher »).
   Clic sur une ligne = action immédiate sur cet enfant. Le filtre est local à la vue.
5. **En attente dans le projet** : jusqu'à 3 boutons « Rattacher n enfants à « X » »,
   puis « + n autres parents en attente ». Absent si vide.
6. **Calques ignorés** (`report.skipped` non vide) : fenêtre de dialogue HTML de la
   charte listant les calques et la raison ; statut en `warn`.
7. Entrée = bouton principal quand la vue a le focus.

## 8. Interface client

- **`charte.css`** : jetons de `docs/CHARTE-GRAPHIQUE.md` en variables CSS, puis
  styles des composants. Le fond suit la couleur de panneau d'AE
  (`appSkinInfo.panelBackgroundColor`, relue sur l'événement de changement de
  thème) ; si elle diffère du gris de la charte, les surfaces se décalent d'autant.
- **Composants** (`js/ui/`) : fonctions qui créent et renvoient des éléments DOM,
  sans framework : `rail` (avec « … » en cas de débordement), `toolHeader` (titre,
  aide, « Ouvrir dans un panneau »), `sectionTitle`, `card`, `primaryButton`,
  `button`, `segmented`, `banner`, `rowList`, `statusLine`, `dialog`, `icon`.
  Seulement ceux-là en 1.0.0 ; barre de valeur, point 9, etc. arrivent avec leurs outils.
- **Enregistrement d'un outil** (le script listé dans `tools.json`) :

  ```js
  SIMING.registerTool("unparent", {
    help: "…",
    mount(view, ctx) { /* ctx = { bridge, ui, status, settings, openStandalone, meta } */ }
  });
  ```

  `meta` reprend l'entrée de `tools.json` (nom, icône, version). `index.html`
  monte tous les outils dans une pile de vues ; `tool.html?tool=<id>` monte un
  seul outil avec sa propre ligne de statut. Même code dans les deux cas.
- **Hub** : rail horizontal (outil actif : fond surface, icône bleue, trait bas
  2 px), touches 1…n pour changer d'outil, ligne de statut commune `vX.Y.Z`,
  vue Réglages : outil au lancement (dernier ou un outil précis), « À propos »
  (version de SIMING et de chaque outil).
- **Réglages** : `localStorage` du panneau (`siming.startTool`, `siming.lastTool`).
- **Icônes** : SVG en ligne (`currentColor`), tracés repris de `docs/design/icons.json`.

## 9. Gestion des erreurs

- Erreur de pont ou d'hôte : statut `error` avec le message ; la vue reste utilisable.
- Pas de comp active, rien de sélectionné, calque sans enfant : messages de statut
  (`error` / `warn`) renvoyés par l'hôte.
- Comp active changée depuis le ciblage : l'hôte renvoie `warn` « La composition
  active a changé : clique sur la carte Parent », sans agir.
- Calques ignorés (verrouillés, parent introuvable, déjà dans l'état visé) : listés
  dans le dialogue, les autres sont traités.
- Outil client qui plante au montage : message dans sa vue, les autres outils marchent.

## 10. Tests (`node tests/run.js`, doit afficher `0 échoué(s)`)

- **Hôte** : faux AE repris de l'archive (calques recréés à chaque accès, index à
  partir de 1, verrou, cycles, `app.project.item(i)`, groupes d'annulation) ;
  tests du cœur Unparent repris ; tests du JSON maison (accents, guillemets,
  caractères de contrôle, nombres, imbrication) et du routeur (enveloppe, outil
  ou fonction inconnus, erreur attrapée avec sa ligne).
- **Pont de bout en bout** : un faux `CSInterface.evalScript` évalue le script dans
  le bac à sable du faux AE ; on vérifie client -> hôte -> calques -> état.
- **Vues** : jsdom (seule dépendance npm, en `devDependencies`) ; montage d'Unparent
  avec le pont branché sur le faux AE ; clics sur la carte, une ligne, le bouton
  principal, le secondaire, le filtre, un parent en attente ; vérification des
  libellés, du bandeau, du statut, du dialogue et de l'état des calques. Hub :
  rail, changement d'outil, outil cassé isolé, réglages.
- **Paquet** : `release.js --dry-run` produit un manifeste cohérent avec le champ `version` de `tools.json`
  et `tools.json` (identifiants, titres, chemins, version), sans signer.
- **Manuel** : `docs/TESTS-MANUELS.md` réécrit (installation, installeur, hub,
  panneau isolé, rendu, scénarios Unparent, mise à jour, retour à une version).

## 11. Paquet, installation, mise à jour

- **`tools/dev-install`** (`.bat` et `.command`) : active `PlayerDebugMode` pour
  les versions CSXS concernées sur la machine de l'auteur uniquement, génère le
  manifeste et crée un lien du dossier `extension/` vers le dossier des
  extensions de l'utilisateur. On modifie, on recharge le panneau.
- **`tools/make-cert`** : crée une fois le certificat auto-signé avec ZXPSignCmd
  (outil gratuit d'Adobe, téléchargé une fois, chemin dans une variable
  d'environnement). Le certificat et son mot de passe restent **hors du dépôt**.
- **`tools/release.js`** : lit le champ `version` de `tools.json`, génère le manifeste,
  signe `extension/` en `dist/SIMING-<version>.zxp` (horodaté). L'auteur crée
  ensuite la Release GitHub `v<version>` avec ce fichier et une ligne de notes
  (« Ajout : … », « Correction : … ») ; automatisable plus tard avec `gh`.
- **Installeur** `SIMING - Installer.bat` (Windows, PowerShell intégré) et
  `SIMING - Installer.command` (macOS, `curl` + `osascript` pour lire le JSON) :
  1. interroge `https://api.github.com/repos/<compte>/siming/releases` (sans compte) ;
  2. affiche la version installée et la liste (dernière en tête, notes en une ligne) ;
     Entrée = dernière, ou numéro au choix ;
  3. télécharge le `.zxp` dans un dossier temporaire ;
  4. demande de fermer AE s'il tourne ;
  5. installe avec UPIA (installeur Adobe livré avec Creative Cloud) ;
     si UPIA est introuvable, explique et propose ZXP Installer (gratuit) ;
  6. affiche « SIMING x.y.z installé ✓ ».
  Le même fichier sert à l'installation, aux mises à jour et aux retours en arrière.
- **Notice** d'une page (`docs/INSTALLATION.md`, aussi jointe aux Releases) :
  premier lancement (Windows SmartScreen : « Informations complémentaires ›
  Exécuter quand même » ; macOS : clic droit › Ouvrir), installer, mettre à jour,
  revenir à une version, trouver le panneau.
- **Versions** : `version` (dans `tools.json`) = `1.0.0` à la première Release ; nouvel outil → `1.(n+1).0` ;
  correction → `1.n.(m+1)`. Chaque outil a aussi sa version, affichée dans « À propos ».

## 12. Périmètre

**1.0.0** : hub SIMING, Unparent v2, panneau isolé, composants listés au § 8,
pont et cœur hôte, tests, dev-install, make-cert, release.js, installeurs Windows
et macOS, notice, documentation à jour, dépôt git et GitHub public `siming`
(créés avec l'accord de l'auteur).

**Hors 1.0.0** : autres outils (Quick Tools, Point d'ancrage, Renommer, Échelonner,
Null de contrôle, Nettoyer le projet), barre de valeur, point 9, passage à UXP,
vérification automatique des mises à jour, publication automatisée.

## 13. Points à vérifier à l'implémentation

- Version minimale `AEFT` et versions CSXS à activer en debug selon les AE de l'équipe.
- Chemins et options exacts d'UPIA sur Windows et macOS, et comment lire la version installée.
- Comportement de `requestOpenExtension` sur un panneau déjà ouvert.
- Événement CEP de changement de thème d'AE et propriétés d'`appSkinInfo`.
- Lecture de `tools.json` en local depuis le panneau (XHR sur fichier autorisé en CEP).
- Limite de débit de l'API GitHub sans compte (60 requêtes par heure et par IP : suffisant).
