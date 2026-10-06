# Suivi du projet SIMING

Fichier vivant : le **journal** retrace les décisions, les **pistes** gardent les
idées sans les implémenter trop tôt, les **erreurs** évitent de retomber deux fois
dans le même piège. Ajouter une entrée datée à chaque session.

## Journal

### 2026-10-05 : période ScriptUI (résumé)

- Outil n°1 **Unparent** : détacher temporairement les enfants d'un calque puis
  les rattacher, position conservée (`layer.parent = …` compense comme AE).
  Mémoire double : objet en session + balise `[UP|idParent|NomParent]` en fin de
  commentaire de l'enfant, qui survit au redémarrage. Résolution du parent : id et
  nom, nom unique, id seul, premier homonyme.
- Direction artistique sur canevas (https://claude.ai/artifact/XiZ4HWrNKuWiaYUXKGZhgQ) :
  style natif AE sombre, un seul bleu, **rail d'icônes horizontal**, règle
  « tout tombe sous la souris » (cibles ≥ 32 × 30), charte de tous les composants.
- **Unparent v2** (UX validée sur maquette) : carte Parent cliquable au lieu
  d'« Actualiser », clic sur une ligne = action immédiate, un bouton principal qui
  suit l'état + secondaire en cas mixte, bandeau ambre, filtre Tous / Liés /
  Détachés, section « En attente dans le projet ».
- Test dans AE : ScriptUI ne permet pas d'approcher la maquette (éléments masqués
  qui gardent leur place, bouton du rail étiré, lignes de liste natives). Code
  ScriptUI retiré du projet (55 tests, 0 échec à ce moment-là).

### 2026-10-05 : passage à une extension CEP

Spec : `docs/superpowers/specs/2026-10-05-siming-cep-design.md`.

Décisions :

- Extension **CEP** (HTML/CSS/JS + ExtendScript hôte), nom **SIMING**, identifiant `com.siming`.
- Un panneau hub avec rail + un panneau isolé par outil (« Ouvrir dans un panneau »).
- JS natif sans framework ni build ; pont unique `bridge.js` (seul point à refaire pour UXP).
- Public : l'auteur et quelques collègues, Windows et macOS, AE récent ; tout gratuit.
- Distribution : `.zxp` signé (certificat auto-signé) en Release sur un dépôt GitHub
  public `siming` ; installeur double-clic Windows / macOS qui liste les versions et
  installe via UPIA ; pas de vérification automatique dans le panneau.
- Versions `1.x.y` : 1.0.0 = Unparent ; nouvel outil → mineure ; correction → correctif.

État : spec validée ; plan d'implémentation écrit en 3 parties
(`docs/superpowers/plans/2026-10-05-siming-cep-1-0-0*.md`, 14 tâches, 118 tests visés).
L'ancien dossier d'archive a été supprimé : le plan réécrit intégralement le cœur Unparent et le faux AE.

### 2026-10-05 : SIMING 1.0.0 (CEP) implémenté

Plan : `docs/superpowers/plans/2026-10-05-siming-cep-1-0-0.md`.
Fait : cœur hôte (JSON, routeur), Unparent hôte + API, pont, charte CSS et composants,
vue Unparent v2, hub à rail, panneau isolé, manifeste généré, dev-install, signature,
installeurs Windows / macOS, documentation. `node tests/run.js` : 121 tests, 0 échec.
Précisions par rapport à la spec : version dans `tools.json` (pas de fichier VERSION),
outil du panneau isolé tiré de l'identifiant d'extension, API `unparent.init` et `siming.init`.
Corrections de revue : `analyze`/`resolveTarget` ignorent un enfant re-parenté à la main ; `detach` écrit la balise avant de retirer le parent (avec retour arrière).
Revue finale : corrections (mot de passe masqué, installeurs robustes, Entrée, balise qui fait foi, en attente calculé moins souvent, noms de fichiers sans espaces). Aussi : erreur de démarrage affichée dans le panneau, pas de « Ctrl+Z » quand rien n'a été fait, parent en attente introuvable affiché désactivé. `node tests/run.js` : 132 tests, 0 échec.
État : à valider dans After Effects avec `docs/TESTS-MANUELS.md` (Windows et macOS) ; Release v1.0.0 après validation.

### 2026-10-05 : validation dans After Effects, couleur d'étiquette sur la carte Parent

- Validation par Simon sous Windows : tout fonctionne (hub, panneau isolé, Unparent). macOS : pas encore testé.
- Anomalie : la carte Parent n'affichait pas la couleur d'étiquette du calque, présente sur la maquette mais oubliée dans la spec § 7.3 et dans le plan.
  Corrigé : l'hôte renvoie `target.label` et `target.color` (`SIMING.ae.labelColor` lit les Préférences › Étiquettes en encodage BINARY et se replie sur les 16 couleurs par défaut d'AE, voir `docs/NOTES-EXTENDSCRIPT.md`) ; le composant carte accepte `color` (carré 12 px, absent si « Aucune »).
- `node tests/run.js` : 137 tests, 0 échec. Version inchangée : 1.0.0 n'est pas encore publiée.
- État : prêt pour la Release v1.0.0 (dépôt GitHub public, certificat, signature) dès l'accord de l'auteur. À vérifier dans AE : une couleur d'étiquette personnalisée s'affiche bien (sinon repli silencieux sur la couleur par défaut).

### 2026-10-06 : SIMING 1.0.0 publiée

- Dépôt GitHub public créé : https://github.com/NomiSs-S/siming (branche `main`, fusion fast-forward de `feat/siming-cep-1.0.0`).
- ZXPSignCmd 4.1.3 (x64, dépôt Adobe-CEP/CEP-Resources) installé dans `~/.siming/`, avec le certificat auto-signé `siming-cert.p12` (valable jusqu'au 2036-10-03) et son mot de passe `cert-password.txt`. Tout est hors dépôt : à sauvegarder, chaque mise à jour doit être signée avec ce certificat.
- Release : `ZXPSIGNCMD` = chemin Windows de `~/.siming/ZXPSignCmd.exe`, `SIMING_CERT_PASSWORD` = contenu de `cert-password.txt`, puis `node tools/release.js` ; `SIMING-1.0.0.zxp` signé et horodaté (`-verify` : signature valide), installeurs Windows et macOS.
- Release v1.0.0 : https://github.com/NomiSs-S/siming/releases/tag/v1.0.0 (zxp, deux installeurs, `INSTALLATION.md`). L'API `releases` répond 200 et expose le `.zxp` avec la note « Ajout : Unparent » : l'installeur verra la version.
- Reste à faire : tester l'installeur téléchargé sur une machine sans lien de développement (ou après suppression de `%APPDATA%\Adobe\CEP\extensions\com.siming`), valider sous macOS, noter les chemins UPIA ; `MIN_AE` laissé à 24.0.

## Pistes

Idées notées, à trier. Ne pas implémenter sans besoin réel.

**Outils à venir**
- **Quick Tools** : curseurs d'influence du lissage de vitesse en entrée, en sortie,
  et les deux, avec un picto de keyframe avant chaque curseur qui applique la valeur
  au clic ; expression Elastic pilotée par un effet « Elastic Controller » (amplitude
  / 200, fréquence / 30, amortissement / 10, basée sur `velocityAtTime` à la dernière
  keyframe) ; alignement façon fenêtre Aligner.
- **Point d'ancrage** : carré 3 × 3, cases de 36 entièrement cliquables, pavé numérique 1–9.
- **Renommer** : rechercher / remplacer avec aperçu, `##` pour la numérotation.
- **Échelonner** (séquence) : pas en images, ordre pile / inverse / aléatoire, aperçu.
- **Null de contrôle** : nom, position (centre de la sélection ou comp), couleur, parenter la sélection.
- **Nettoyer le projet** : métrages inutilisés, compos vides, solides en double, rangement par type.

**Unparent**
- Option « inclure les petits-enfants » pour aplatir toute une descendance.
- Sélectionner dans la timeline les enfants listés (double-clic sur une ligne).
- Nettoyage des balises orphelines (calques re-liés à la main avec une balise restante).
- Enfants animés : poser des keyframes compensées plutôt que la compensation à l'instant courant.
- Rafraîchissement automatique à la sélection (pas d'événement AE : à étudier côté CEP).
- Couleur d'étiquette du parent aussi sur les boutons « En attente dans le projet » (présente sur la maquette, pas encore codée).

**Hub et distribution**
- Vérification automatique des mises à jour dans le panneau.
- Publication automatisée des Releases avec `gh`.
- Passage à UXP quand After Effects le permettra pleinement (seul `bridge.js` à refaire).

## Erreurs et pièges rencontrés

- **ScriptUI ne libère pas la place d'un élément masqué** (2026-10-05, AE récent) : `visible = false` + `preferredSize.height = 0` laisse un trou. Raison parmi d'autres du passage à CEP.
- **`ListItem.checked` n'est pas interactif dans AE** (2026-10-05) : la coche se dessine mais un clic ne la bascule pas.
- **Drapeaux d'arc SVG collés** (2026-10-05) : dans `a2.5 2.5 0 003.5 3.5`, les deux drapeaux et la coordonnée suivante sont collés ; un analyseur de tracés doit lire les drapeaux caractère par caractère.
- **Backticks dans un script passé à `node -e` entre guillemets doubles** (2026-10-05) : Bash les interprète ; passer par un fichier de script.
- **Commande Bash trop longue refusée** (2026-10-05) : au-delà d'environ 8 Ko ; gros fichiers avec l'outil Write.
- **`node --check` refuse `.jsx`** (2026-10-05) : vérifier la syntaxe avec `vm.Script` après retrait du BOM.
- **`assert.deepStrictEqual` échoue entre contextes vm** (2026-10-05) : autre `Object.prototype` ; utiliser `deepEqual`.
- **BOM à vérifier après réécriture** (2026-10-05) : l'outil Write n'écrit pas de BOM.
- **Nom de propriété qui écrase une méthode d'un faux** (2026-10-05) : dans les faux objets de test, ne pas nommer une méthode comme une propriété d'état du code testé.

## Questions ouvertes à vérifier dans After Effects

- `Layer.id` est-il stable après enregistrement et réouverture du projet ? (sinon la résolution par nom prend le relais)
- Couleur d'étiquette personnalisée : `getPrefAsString` lu en `BINARY` donne-t-il bien la couleur des Préférences › Étiquettes ? (sinon la carte montre la couleur par défaut d'AE)
- Voir aussi la spec CEP § 13 (version AEFT minimale, UPIA, `requestOpenExtension`, thème, lecture de `tools.json`).
