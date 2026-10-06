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

### 2026-10-06 : Quick Tools implémenté (1.1.0, à valider dans AE)

Spec : `docs/superpowers/specs/2026-10-06-quicktools-design.md` ; plan : `docs/superpowers/plans/2026-10-06-quicktools.md`.
Décisions de Simon : un seul outil à quatre sections empilées (Lissage, Elastic, Point d'ancrage, Aligner + Répartir), livré complet ; lissage = Bézier, vitesse 0 et influence, appliqué au relâchement de la barre comme au picto ; Elastic = pseudo-effet « Elastic Controller » (20 / 40 / 60) de son préréglage (`host/presets/ElasticController.ffx`), expression reprise telle quelle, réglages dans le panneau Effets seulement, bouton « Retirer » ; point d'ancrage par le carré 3 × 3 et le pavé numérique, position compensée ; aligner et répartir comme la fenêtre d'AE, sur les bords visibles, Sélection ou Composition. Ni maquette ni validation intermédiaire : retours sur l'outil réel.
Fait : faux AE étendu (`tests/fake-ae-props.js` : propriétés, keyframes, ease, expressions, effets, `applyPreset`, transformations), cœur hôte ES3 avec matrices 2D (parents, rotation, échelle, dimensions séparées, 3D en X/Y), composants `valueBar` et `point9`, vue, hub limité à la rangée de chiffres (le pavé numérique revient aux outils), 14 icônes, docs. `node tests/run.js` : 165 tests, 0 échec. `tools.json` 1.1.0, outil 1.0.0.
État : à tester dans AE (section « Quick Tools » de `docs/TESTS-MANUELS.md`, lien de développement en place, redémarrer AE), puis corrections et Release 1.1.0 « Ajout : Quick Tools ».

### 2026-10-06 : refonte de l'interface Quick Tools (avant Release 1.1.0)

Maquette « Quick Tools v2 » sur le canvas de design (prototype cliquable + largeurs 260 / 400 px), puis implémentation directe à la demande de Simon. Spec : § 10 de `2026-10-06-quicktools-design.md`.
Décisions de Simon : garder les trois curseurs de lissage distincts (pas d'influence commune) ; pas de courbe dessinée devant les curseurs mais trois pictos de keyframe sobres, moitié gauche / droite / entier remplie. Repris de la maquette sans objection : Ancrage et Aligner côte à côte, cases pleines de 36 px, plus de bouton bleu, dernier geste cerclé et rejoué par Entrée, Elastic avec icône ressort et croix.
Fait : `ui.easeKey`, icône `ressort` (36 icônes), styles `s-ease-row`, `s-tool-grid`, `s-tool`, `s-gesture-row`, `s-place-row`, `is-last` (anciens `s-bar-row`, `s-icon-row`, `s-row-inline`, `s-btn-ghost`, `s-point9-row` retirés), vue réécrite, tests de vue mis à jour (165, 0 échec), charte, README, CLAUDE.md (« au plus un » bouton principal), tests manuels.
État : à tester dans AE avec le reste de Quick Tools (redémarrer AE ou recharger le panneau), puis Release 1.1.0.

### 2026-10-06 : retours de Simon dans AE : ancrage animé, sens Entrée / Sortie, Réglages (ordre, raccourcis)

Trois retours après test de Quick Tools dans After Effects, corrigés et complétés sans validation intermédiaire (spec Quick Tools § 11, spec CEP « Raccourcis clavier »).
- **Point d'ancrage sur un calque animé** : cause = `setValueAtTime` posait une keyframe de position à l'instant courant et laissait les autres, le calque bougeait partout ailleurs. Désormais `offsetProperty` décale chaque keyframe existante d'ancrage et de position (chaque keyframe de position compensée avec l'échelle et la rotation **de son instant**, dimensions séparées gérées), n'en crée aucune, et relit puis repose les tangentes spatiales manuelles. Aligner / répartir gardent la keyframe à l'instant courant, comme la fenêtre Aligner d'AE.
- **Entrée / Sortie** : cause = l'hôte suivait le vocabulaire d'AE (Easy Ease In = côté entrant de la keyframe) alors que Simon parle du mouvement (« entrée » = son départ = côté sortant de la première keyframe). `applyEase` inversé (mode `in` → `keyOut…`), pictos échangés (Entrée = moitié droite, l'icône de la keyframe obtenue), commentaire explicite dans l'hôte et `docs/NOTES-EXTENDSCRIPT.md` pour ne pas « recorriger ».
- **Réglages** : nouveau module `js/keys.js` (registre d'actions, liaisons par défaut ou choisies dans `siming.keys`, un seul écouteur `keydown` par page sur `e.code`, Maj ignorée sur la rangée de chiffres pour l'AZERTY, capture d'une frappe, conflits : une touche par groupe, le hub toujours actif, deux outils peuvent partager). Le hub enregistre « Afficher <outil> » (chiffre de la place dans le rail), Quick Tools ses 27 gestes (Entrée = rejouer, pavé 1–9 = ancrage, le reste sans touche) et n'écoute plus le clavier lui-même. Vue Réglages : Outil au lancement, **Ordre des outils** (Monter / Descendre, `siming.toolOrder`, le rail et les touches suivent), **Raccourcis clavier** (par groupe, clic = capture, Retour arrière = aucun, Échap = annuler, Rétablir), À propos. Icônes `monter` / `descendre` (38). Unparent garde son Entrée propre (bouton principal), pas encore dans le registre.
- Faux AE : `setValueAtKey`, tangentes spatiales, Bézier automatique. `node tests/run.js` : 176 tests, 0 échec. Version inchangée (1.1.0 non publiée).
État : à retester dans AE (sections Hub et Quick Tools de `docs/TESTS-MANUELS.md`, recharger le panneau), puis Release 1.1.0.

### 2026-10-06 : Réglages repensés pour beaucoup d'outils

Demande de Simon : retravailler la fenêtre Réglages en prévoyant beaucoup de futurs outils, en restant ergonomique.
Fait : trois onglets (Outils, Raccourcis, Général ; dernier onglet mémorisé dans `siming.settingsTab`). Outils : liste unique qui remplace la liste radio de démarrage et les boutons Monter / Descendre ; poignée à glisser (ou ↑ ↓ au clavier), œil pour masquer un outil du rail (`siming.hiddenTools` ; jamais tous ; un outil masqué n'a pas de chiffre et reste ouvrable en panneau isolé), pastille de la touche de chaque outil, recherche à partir de 7 outils. Raccourcis : champ de recherche (action, outil ou touche, accents ignorés), compteur par groupe. Général : outil au lancement en menu déroulant, « À propos », rappel de l'installeur pour les mises à jour. Composants `ui.searchField` et `ui.select` ; icônes `masque` et `poignee` ajoutées, `monter` / `descendre` retirées (38 icônes). Tests : 179, 0 échec.
Choix faits sans demander (à corriger si besoin) : masquer plutôt que désinstaller (un outil masqué reste installé et disponible en panneau isolé) ; recherche des outils seulement à partir de 7 outils ; « Outil au lancement » déplacé dans Général.
État : à vérifier dans AE (section Hub de `docs/TESTS-MANUELS.md`), surtout le glisser de la poignée dans CEP et le menu déroulant en thème sombre.

### 2026-10-06 : Libellés implémenté (1.2.0, à valider dans AE)

Demande de Simon : poser automatiquement l'étiquette de couleur des calques sélectionnés selon leur nature (jaune texte, bleu forme, fuchsia vidéo, orange image, vert logo, rouge fond et nul), avec reconnaissance par le nom (« LOGO_xxxx »). Précisions : couleurs d'AE seulement, analyse uniquement sur demande, un récapitulatif de tous les changements modifiable vite, réglage facile.
Fait : outil `labels` (hôte `host/tools/labels.jsx`, vue `tools/labels.js`), icône `etiquette`, composants `ui.swatch`, `ui.labelSwatch`, `ui.labelPicker`, nom des étiquettes lu dans les préférences (`SIMING.ae.labelName`). Onglet Calques : Sélection / Composition, carte = analyser, bouton « Appliquer N libellés » (Entrée), récapitulatif groupé par règle (À changer / Tous) ; clic sur une ligne = couleur à la main pour ce calque, pastille d'un groupe = change la règle. Onglet Règles : mots-clés (prioritaires, dans l'ordre) et une étiquette par nature (12 natures), « Ne pas changer » possible partout, rétablir les défauts. Règles dans `siming.labels.rules`. Faux AE complété (calques texte et forme, sources, dossiers, noms d'étiquettes). Tests : 195, 0 échec. Rendu vérifié dans Chrome à 280 px (page de démonstration avec réponses du vrai cœur).
Choix faits sans demander (à corriger si besoin) : pas d'OCR, des mots-clés en mots entiers (pluriel en s/x accepté, « fondu » ne déclenche pas « fond ») cherchés dans le nom du calque, de la source, du fichier et des dossiers du projet ; « .ai » = extension ; un calque texte au nom automatique n'est pas comparé par son contenu ; changer la pastille d'un groupe modifie la règle enregistrée (le choix d'une ligne ne vaut que pour l'analyse en cours) ; défauts pour les natures non citées : son vert d'eau, réglage violet, précompo grès, caméra rose, lumière pêche, autre inchangé ; solide rouge comme les fonds ; le panneau Projet n'est pas touché.

### 2026-10-06 : Libellés en sélection multiple, geste en un clic, pictos du canevas, raccourcis combinés

Demande de Simon (4 points).
- **Sélection multiple dans le récapitulatif** : Ctrl + clic (ajouter / retirer), Maj + clic (plage dans l'ordre affiché), clic sur le nom d'un groupe (bouton : tout le groupe, Ctrl = ajouter) ; lignes sélectionnées en `--accent-soft` ; appuyer sur une ligne sélectionnée ouvre le sélecteur pour toute la sélection (aucune couleur cochée et « Plusieurs couleurs » si elles diffèrent) ; une ligne hors sélection repart seule ; Échap désélectionne ; sélection oubliée à une nouvelle analyse et après « Appliquer », gardée après un choix de couleur.
- **Geste en un clic** : `ui.pressToOpen` ouvre le sélecteur au bouton enfoncé (pointerdown) ; relâcher sur une couleur la choisit, relâcher sur le bouton laisse ouvert (simple clic), relâcher ailleurs ferme. Clavier (Entrée / Espace) : ouverture classique, focus sur la couleur. Lignes du récapitulatif, pastilles de règle et des natures.
- **Pictos du canevas** (maquette Quick Tools) : `reglages` = deux curseurs, nouvelle icône `panneau` (fenêtre à barre de titre) pour « Ouvrir dans un panneau », placé après l'aide comme sur le canevas (40 icônes).
- **Raccourcis combinés** : le registre gérait déjà Ctrl / Alt / Maj / Cmd, mais un panneau CEP ne reçoit pas ces combinaisons tant qu'il ne les réclame pas à After Effects. `SIMING.keys.interest(os)` liste les frappes à réclamer (codes VK Windows, kVK macOS ; chiffres aussi avec Maj ; toutes les touches pendant la capture d'un raccourci), `SIMING.claimKeys(cs)` appelle `registerKeyEventsInterest` au démarrage et à chaque changement (`keys.onChange`). Capture : le bouton affiche « Ctrl + Alt + … » pendant qu'on tient les modificateurs ; libellé correct avec AltGr (« Ctrl + Alt + E », pas « € ») ; Ctrl + Retour arrière devient une touche, Retour arrière seul = aucun.
Tests : 200, 0 échec. Rendu et geste vérifiés dans Chrome (page de démonstration).

### 2026-10-06 : SIMING 1.2.0 publiée, partage avec les collègues

Demande de Simon : commencer à partager SIMING avec des collègues, mises à jour par l'installeur. Publiée sans test complet dans AE, à sa demande (corrections éventuelles en 1.2.1). Release https://github.com/NomiSs-S/siming/releases/tag/v1.2.0 : `SIMING-1.2.0.zxp` (signature vérifiée), installeurs Windows et macOS, `INSTALLATION.md` ; notes « Ajout : Quick Tools et Libellés, raccourcis combinés ». La 1.1.0 n'a jamais été publiée : la 1.2.0 apporte Quick Tools et Libellés d'un coup. Commit 3654966 sur `main`.

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
- Entrée (bouton principal) dans le registre de raccourcis `SIMING.keys`, comme les gestes de Quick Tools.
- Rafraîchissement automatique à la sélection (pas d'événement AE : à étudier côté CEP).
- Couleur d'étiquette du parent aussi sur les boutons « En attente dans le projet » (présente sur la maquette, pas encore codée).

**Libellés**
- Étiqueter aussi les éléments du panneau Projet (sources), en option.
- Réordonner les mots-clés (priorité) par glisser, comme la liste des outils.
- Restreindre un mot-clé à certaines natures (ex. « fond » seulement pour images, vidéos, solides).
- Partager les règles avec les collègues (copier / coller un texte, ou fichier).
- Sélectionner dans la timeline les calques d'un groupe du récapitulatif.

**Idées de Simon notées le 2026-10-06 (étude faite, pas encore demandées)**
- Copier la frame courante dans le presse-papier : `comp.saveFrameToPng` puis Node (`child_process` : PowerShell `Clipboard.SetImage` en STA, `osascript` sur Mac), plus une boîte d'outils rares (exporter la frame, copier timecode / infos de comp / noms de calques, révéler la source, médias manquants, polices, convertir expressions en keyframes, zone de travail).
- Retours Frame.io : d'abord vérifier le panneau Frame.io intégré d'AE ; sinon API v4 (OAuth Adobe, serveur local Node pour le retour), recherche de la vidéo par nom normalisé, mémoire compo ↔ vidéo dans le commentaire de comp, saut à la frame, cocher un retour. Limites : décalage de timecode et de cadence, versions, annotations dessinées.

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
- Quick Tools, `applyPreset` : applique-t-il bien au seul calque visé une fois la sélection réduite à lui ? Sinon l'effet se poserait sur d'autres calques.
- Quick Tools, `setTemporalEaseAtKey` : la longueur lue sur `keyInTemporalEase` suffit-elle partout (Position spatiale, Échelle, couleur) ?
- Quick Tools, `sourceRectAtTime` : boîte attendue sur un solide, une précomposition, un calque texte ? Calque 3D : rotation X/Y ignorée, à documenter si gênant.
- Quick Tools, `$.fileName` dans un outil chargé par `$.evalFile` : donne-t-il le chemin de `quicktools.jsx` (d'où celui du préréglage) ?
- Quick Tools, `setValueAtKey` sur une keyframe spatiale : conserve-t-il les tangentes manuelles ? (relues et reposées par précaution)
- Hub et panneau isolé : partagent-ils le même `localStorage` (ordre des outils, raccourcis choisis) ?
- Libellés : `getPrefAsString('Label Preference Text Section 7', 'Label Text ID 2 # n')` donne-t-il le nom affiché dans AE (version française : « Rouge » ou « Red » ?), accents corrects ? Sinon les noms français par défaut s'affichent.
- Raccourcis combinés : `registerKeyEventsInterest` remplace-t-il la liste précédente à chaque appel ? Ctrl + Alt + 5 arrive-t-il au panneau (Windows AZERTY = AltGr) ? Les touches seules continuent-elles de marcher ? Une liste de plus de 500 frappes pendant la capture est-elle acceptée ?
- Geste en un clic : dans CEP, le relâchement au-dessus d'une couleur arrive-t-il bien à la case (pas de capture implicite du pointeur) ?
- Libellés : `layer.label` se change-t-il sur un calque verrouillé ? (sinon il est listé dans « Calques ignorés »)
- Libellés : natures des cas limites (séquence d'images, PSD / AI importés en métrage, fichier manquant, calque de modèle 3D, calque de données) ; `File.displayName` disponible sur la source ?
- Voir aussi la spec CEP § 13 (version AEFT minimale, UPIA, `requestOpenExtension`, thème, lecture de `tools.json`).
