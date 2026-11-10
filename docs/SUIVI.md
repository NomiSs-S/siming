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

### 2026-10-07 : trois retours d'interface et Boîte à outils (1.3.0, à valider dans AE)

Spec : `docs/superpowers/specs/2026-10-07-boite-a-outils-design.md`.
- **Quick Tools par défaut** : premier de `tools.json` (rail, touche 1, outil de la première ouverture). Ordre : Quick Tools, Boîte à outils, Unparent, Libellés.
- **Interface étroite** : cause = `min-width: 260px` sur `.s-app`, le panneau était rogné à droite (vu dans Chrome à 220 px). Retirée ; rangées qui passent à la ligne (`flex-wrap`, grilles `auto-fit`, `@media (max-width: 259px)`) ; segmentés à « … » ; « … » du rail allumé quand l'outil affiché y est rangé. CEP 11 = Chromium 88 : pas de `@container`.
- **Barre de défilement** aux couleurs de la charte (`::-webkit-scrollbar`).
- **Boîte à outils** (outil `toolbox` 1.0.0) : Copier la frame (PNG rendu par `saveFrameToPng`, copié par Node du panneau, repli `system.callSystem`), Séquencer calques / keyframes (Cascade, Inverse, Aléatoire ; « offset » = **Écart**, « step » = **Par paquets de**, choix de Simon), Null relié, Fond (forme à expressions, pastille de couleur `$.colorPicker`), Format 16:9 / 4:5 / 1:1 / 9:16 (plus petit côté gardé, contenu recentré), Afficher la source dans le Projet, Convertir les textes PSD. Deux questions posées à Simon : sens d'offset / step, et aléatoire = ordre mélangé (écart régulier).
- Géométrie de Quick Tools déplacée dans `siming.jsx` (`SIMING.geom`, `SIMING.ae.*`) pour être partagée. Manifeste : `--enable-nodejs`. `ui.valueBar({ integer })`, `SIMING.runProgram`. 5 icônes (45).
- Relecture du code (agent) : corrigé `short` (mot réservé ES3, ajouté au test de syntaxe), keyframes perdues si l'une ne se repose pas (refus d'emblée des marqueurs et valeurs particulières, retour arrière), déplacement libre reposé en seconde passe, identifiant 3799 retiré (aucune commande lancée sans nom reconnu), début des calques créés posé à 0, Z en dimensions séparées, chemin de frame limité au dossier de l'outil.
- Tests : 227, 0 échec. Rendu vérifié dans Chrome à 340 et 220 px (page de démonstration branchée sur le vrai cœur et le faux AE).
Choix faits sans demander (à corriger si besoin) : null nommé « Contrôle » (« Contrôle <calque> » pour un seul), placé juste au-dessus du plus haut calque sélectionné ; fond = couleur de fond de la comp tant qu'aucune couleur n'est choisie ; format qui modifie la comp (pas de duplication) ; textes PSD : comp active seulement (pas les précompos) ; écart 0–30 images et paquets 1–10 au curseur.
État : à tester dans AE (sections Hub et Boîte à outils de `docs/TESTS-MANUELS.md`, recharger le panneau ou relancer `tools/dev-install` pour le nouveau manifeste), puis Release 1.3.0.

### 2026-10-07 : Boîte à outils, cinq gestes de plus (toujours 1.3.0, non publiée)

Demande de Simon : « implémente les idées 1, 2, 3, 4 et 6 » de la liste proposée.
- **Exporter la frame** en PNG à côté du projet (`Frames/<comp>_<image>.png`) ; Alt + clic : et la montrer dans l'Explorateur / le Finder.
- **Alt + clic sur Afficher la source** : fichier source dans l'Explorateur / le Finder (dossier s'il manque).
- **Décliner dans les autres formats** (une copie par format, `Pub 9x16`, original intact) ; Alt + clic sur une case de format : une copie dans ce format.
- **Zone de travail** : sur la sélection ; rogner la compo (timecode de départ qui suit, comme la commande d'AE).
- **Convertir les expressions en keyframes** (une par image du calque, constantes allégées sauf position et texte, expression désactivée).
Convention retenue : Alt + clic = variante d'un geste, Entrée rejoue la variante, chaque variante dans le registre (23 actions). `SIMING.runProgram(…, { anyExit })` (explorer.exe sort en 1). Programmes construits par l'hôte seulement (jamais d'après un chemin du panneau). Recentrage partagé (`resizeComp`). 5 icônes (50). Faux AE : `comp.duplicate`, zone de travail, timecode de départ, marqueurs de comp, `File.copy`, fichier du projet, expressions simulées (`exprFn`, `expressionError`, `setValuesAtTimes`). Tests : 237, 0 échec ; rendu vérifié dans Chrome à 340 et 180 px.
Choix faits sans demander : dossier `Frames` (pas le dossier du projet lui-même) ; numéro d'image sur 5 chiffres ; fichier remplacé s'il existe ; rogner = comportement d'AE (timecode qui suit) plutôt qu'un retour à 0 ; position et texte jamais allégés.

### 2026-10-07 : séquences en pictos, recadrer l'image, aide en fiches (toujours 1.3.0, non publiée)

Demande de Simon (3 points) ; une question posée : « recadrer » = l'image (largeur et hauteur), pas la durée.
- **Séquencer** : moins de texte ; modes en pictos (calques en escalier : `seqCascade`, `seqReverse`, `seqRandom`, `ui.segmented` accepte `{ icon }`), « Écart » et « Paquets » côte à côte, **un seul bouton** qui montre le picto du mode. L'hôte choisit : keyframes sélectionnées sur au moins 2 calques (ou 2 propriétés) = keyframes, sinon au moins 2 calques = calques, sinon message.
- **Recadrer l'image** (Zone de travail) : `cropToLayers`, comp à la taille de la boîte visible des calques sélectionnés (pixels entiers vers l'extérieur), calques sans parent décalés, rien ne bouge à l'image. « Rogner la compo » devient « Rogner la durée » (picto `rognerDuree`), le picto `rogner` va au recadrage.
- **Aide** des quatre outils refaite en fiches (`ui.helpDialog`) : en-tête (picto, nom, version), phrase d'intro, groupes de fiches (picto ou numéro d'étape, nom, une phrase, touches en pastilles), pied et « Compris ». Un texte simple garde l'ancien dialogue. Test de garde : aide en fiches pour chaque outil, pictos existants, phrases courtes.
- Tests : 240, 0 échec ; rendu vérifié dans Chrome (Boîte à outils à 340 px, aides à 340 et 220 px).
Choix faits sans demander : la boîte de recadrage peut agrandir la comp si les calques dépassent ; « Paquets » au lieu de « Par paquets de » ; « Recadrer l'image » seul sur sa ligne dans la grille.

### 2026-10-07 : point d'ancrage sur la partie visible (masques)

Retour de Simon : avec un masque, l'ancrage doit se baser sur ce qui est visible. Cause : la boîte venait de `sourceRectAtTime`, qui ignore les masques.
- `SIMING.ae.visibleRect` : boîte de la source réduite par les masques actifs, dans leur ordre (Ajouter / Éclaircir / Différence = union, Intersection / Obscurcir = partie commune, le premier masque part de rien s'il ajoute, de tout le calque sinon ; Soustraire ne réduit pas la boîte ; masque inversé = tout le calque ; étendue du masque comprise, contour progressif non ; coupée au calque). `SIMING.geom.pathBounds` (boîte exacte d'un tracé de Bézier, extrema des courbes) et `geom.intersect`.
- Utilisée partout où une boîte de calque compte : ancrage, aligner, répartir (Quick Tools), null relié et recadrer l'image (Boîte à outils, via `ae.layerBox`). Masques tous hors du calque : calque listé « rien de visible ».
- Quick Tools 1.0.1 (correction ; SIMING reste 1.3.0, pas encore publiée). Faux AE : masques (`state.masks`, `MaskMode`). Tests : 243, 0 échec.
Limites : la matte de piste et les effets qui rognent (Recadrer, Masque d'écrêtage) ne sont pas pris en compte ; un Soustraire qui couvre tout un côté ne réduit pas la boîte.

### 2026-10-07 : SIMING 1.3.0 publiée

Demande de Simon : « publie-la pour mes collègues ». Publiée sans test dans After Effects, à sa demande (corrections éventuelles en 1.3.1). Release https://github.com/NomiSs-S/siming/releases/tag/v1.3.0 (« Latest ») : `SIMING-1.3.0.zxp` (signature vérifiée ; manifeste avec `--enable-nodejs` sur les 5 panneaux, panneau isolé de la Boîte à outils, 4 cœurs d'outils), installeurs Windows et macOS, `INSTALLATION.md` (nouvelle section : préférence d'écriture de fichiers pour Copier / Exporter la frame). Note affichée par l'installeur : « Ajout : Boîte à outils, Quick Tools par défaut, panneau étroit, aide en fiches ». Outils : Quick Tools 1.0.1, Boîte à outils 1.0.0, Unparent 2.0.0, Libellés 1.0.0.

### 2026-10-12 : installeur macOS qui boucle sur « ferme After Effects »

Retour de Simon (Mac) : l'installeur répétait « After Effects est ouvert : ferme-le » sans fin, After Effects a planté plusieurs fois et une fenêtre disparaissait.
- **Cause de la boucle** : `pgrep -f "Adobe After Effects"` cherchait dans la ligne de commande de tous les processus ; les processus d'appoint rangés dans le dossier d'AE (CEPHtmlEngine, rapporteur de plantage) y figurent et survivent parfois à la fermeture ou à un plantage. Autre piège : fermer la fenêtre d'AE ne le quitte pas sous macOS.
- **Correction** (installeur seul, extension inchangée) : `pgrep -x "After Effects"` ; message « quitte-le avec Cmd + Q », Forcer à quitter s'il ne répond plus ; `i` = installer quand même ; sans clavier, sortie au lieu de boucler. `INSTALLATION.md` mis à jour.
- **Lien de développement** : `tools/._dev-install.command` (métadonnées macOS, 2026-10-08) montre que `dev-install.command` a été lancé sur un Mac depuis ce dépôt : ce Mac a un lien `com.siming` vers le dépôt, en plus de la version installée. L'installeur retire maintenant ce lien avant d'installer (le lien seul, jamais son contenu).
- **Plantages d'AE** : cause non établie sans rapport de plantage (Console › Rapports de plantage › « After Effects… »). Pistes : quitter et relancer AE en boucle pour satisfaire l'installeur, deux SIMING chargés (lien de dev + version installée), lien vers un volume réseau ou partagé. Aucun sondage du panneau vers AE (pas de `setInterval`), rien d'exécuté par le panneau au démarrage qui touche au système.
Tests : 245, 0 échec ; boucle vérifiée dans bash avec un faux `pgrep` (fermé, ouvert puis fermé, `i`, sans clavier), retrait du lien vérifié sur une jonction (dépôt intact).
Publié le jour même à la demande de Simon : commit 3285df0, `SIMING-Installer-macOS.zip` et `INSTALLATION.md` remplacés dans la Release v1.3.0 (extension inchangée).

### 2026-10-12 : lissage de 5 en 5, aligner un calque seul, « mot* » et priorité des règles (1.3.1)

Demande de Simon (3 points).
- **Barres de lissage** : `ui.valueBar` gagne `snap` (ici 5, valeurs entières) : glisser, molette et flèches par multiples de 5 (33 → 35), Maj = à l'unité (glissé fin cumulé : sans cumul, l'arrondi à l'unité mangeait chaque petit déplacement ; le défaut valait aussi pour les barres entières de la Boîte à outils). Un clic sans glisser n'est validé qu'après `ui.DOUBLE_CLICK_MS` (350 ms) : un double-clic ouvre la saisie sur la valeur d'avant sans rien appliquer (avant, le premier clic sautait et lissait les keyframes). Saisie libre (37).
- **Aligner** : un seul calque sélectionné = sur la composition, même en mode Sélection (avant : « au moins 2 calques »).
- **Libellés, mot seul** : « fond* » ne retient un texte que si ses mots sont exactement ceux du mot-clé (`Fond`, `fonds` oui ; `fond_txt`, `fond 2` non). Vaut pour chaque texte regardé (nom, source, fichier, dossiers).
- **Libellés, priorité** : poignée sur chaque mot-clé (glisser, ↑ ↓) ; la poignée du hub (ordre des outils) devient le composant `ui.orderGrip`, partagé ; `SIMING.moveItem` passe dans `js/siming.js`.
Versions : SIMING 1.3.1, Quick Tools 1.1.0, Libellés 1.1.0. Tests : 250, 0 échec ; rendu et gestes vérifiés dans Chrome à 260 px (page de démonstration).
Publiée le jour même à la demande de Simon (« publie »), sans test dans After Effects : Release https://github.com/NomiSs-S/siming/releases/tag/v1.3.1 (« Latest ») : `SIMING-1.3.1.zxp` (signature vérifiée), installeurs Windows et macOS (ce dernier corrigé), `INSTALLATION.md`. Note affichée par l'installeur : « Ajout : lissage de 5 en 5, aligner un calque seul, mot seul et priorité des règles (Libellés) ».

### 2026-11-06 : Claude Code dans After Effects (MCP), 1.4.0 non publiée

Demande de Simon : « ajouter un MCP à SIMING pour que Claude Code puisse agir directement dans After Effects », ExtendScript libre compris (« pouvoir TOUT faire »), et si possible pour les collègues.
Spec : `docs/superpowers/specs/2026-11-06-claude-code-mcp-design.md`.

Décisions :
- **Serveur dans l'extension**, pas de programme à installer : une extension invisible `com.siming.mcp` (`client/claude.html`) fait tourner un serveur MCP (HTTP « streamable », réponses JSON sans SSE) écrit à la main, sans dépendance, dans le Node de CEP. Claude Code s'y relie par `claude mcp add --scope user --transport http siming http://127.0.0.1:47821/mcp --header "Authorization: Bearer <jeton>"`. Écarté : un serveur stdio externe (Node à installer chez les collègues), AppleScript `DoScript` (macOS seul, pas de valeur de retour).
- **Six outils** : `get_project`, `get_comp`, `get_properties` (lecture), `run_extendscript` (corps de fonction : `return`, `log()`), `capture_frame` (frame rendue, réduite à 1568 px), `siming_tool` (16 gestes de Quick Tools et de la Boîte à outils ; Unparent et Libellés, à état, restent à la portée de `run_extendscript`). Chaque appel = un groupe d'annulation « Claude : <undoName> » ; appels l'un après l'autre ; délai d'attente 60 s par défaut (message clair : After Effects occupé).
- **Sécurité** : éteint par défaut (Réglages › Claude) ; écoute 127.0.0.1 seulement ; refuse un autre nom d'hôte (rebinding DNS), toute requête portant `Origin` (navigateur) et tout jeton absent ou faux (403, pas 401 : Claude Code tenterait OAuth). Jeton de 48 caractères hexadécimaux dans `<données de l'utilisateur>/SIMING/claude.json`, renouvelable.
- **Démarrage** : `StartOn` au lancement d'AE ; comme After Effects ne démarre pas toujours les extensions invisibles, le hub (onglet Claude) relance le service par `requestOpenExtension` quand il ne répond pas en 1,5 s. Hub et service se parlent par événements CEP (`com.siming.mcp.reload`, `ping`, `state`, `activity`) ; la ligne de statut du hub montre chaque action de Claude.
- Interface : 4ᵉ onglet **Claude** des Réglages (interrupteur segmenté, état à pastille, commande à copier, Nouveau jeton, Changer de port si le port est pris). Nouveaux styles `.s-state`, `.s-command` (charte).
- Fichiers « ._ » de macOS sur le disque exFAT : `loadTools`, le test de syntaxe et `add-bom.js` les ignorent, `release.js` les retire avant de signer (`._mcp.jsx` aurait été évalué par After Effects).
Fait : `host/tools/mcp.jsx`, `client/js/mcp/{protocol,server,service,settings}.js`, `claude.html`, manifeste, `SIMING.nodeRequire`. Tests : 4 fichiers (hôte, protocole, serveur et service HTTP de bout en bout sur le faux AE, onglet Claude) ; `node tests/run.js` : 287 tests, 0 échec. Version SIMING 1.4.0.
État : à essayer dans After Effects (`docs/TESTS-MANUELS.md` § Claude Code) avant la Release.

### 2026-11-06 : SIMING disparaissait sur Mac (installation par lien vers le disque externe)

Demande de Simon : « jusqu'à maintenant, le plugin ne marche que sur Windows ; sur Mac il disparaît au bout d'un moment. Trouve, corrige, et installe-le proprement sur cet ordinateur ».
- **Cause** : SIMING n'était pas installé sur le Mac, seulement relié : `~/Library/Application Support/Adobe/CEP/extensions/com.siming` était un lien (fait par `tools/dev-install.command` le 8 octobre) vers `/Volumes/EXT 11/PERSO/SIMING/extension`. Le disque externe exFAT s'appelle maintenant KINGSTON : lien mort, After Effects ne voyait plus rien. Même avant le changement de nom, SIMING disparaissait dès que le disque était éjecté ou démonté par la veille (dernier journal du hub, 8 octobre 17:52 : « mach port died », « Heartbeat call failed »). Aucune installation par l'installeur (UPIA ne connaît pas SIMING sur ce Mac). Sous Windows, la jonction vers une lettre de lecteur fixe tenait.
- **Correction** : `tools/dev-install.command` **copie** désormais `extension/` sur le disque interne (sans `._*` ni `.DS_Store`, attributs étendus retirés, marque `.siming-dev`) ; `--link` garde l'ancien lien sur demande. Il refuse de toucher un `com.siming` qui ne vient pas de lui et prévient si un SIMING de l'installeur est aussi dans `/Library`. L'installeur macOS retire aussi une copie de développement marquée (pas seulement un lien). Tests : script lancé pour de vrai dans un dossier temporaire (lien cassé remplacé, `._` exclu, dossier étranger respecté, `--link`).
- **Installé** : SIMING 1.4.0 copié dans `~/Library/Application Support/Adobe/CEP/extensions/com.siming` (PlayerDebugMode 1 pour CSXS 11 et 12 ; After Effects 2026 = 26.2.1 = CEP 12). After Effects 2026 lancé : l'extension invisible `com.siming.mcp` a démarré seule au lancement (journal `CEPHtmlEngine12-AEFT-26.2.1-com.siming.mcp.log`, processus actif) : le `StartOn` marche dans AE 26.2.1.
- Après chaque modification du code sur le Mac : relancer `tools/dev-install.command`, puis After Effects. `node tests/run.js` : 288 tests, 0 échec.

### 2026-11-06 : After Effects planté pendant le premier essai de Claude Code

Signalé par Simon : « After Effects a crashé quand j'ai donné l'extension à Claude ». Enquête : transcription de la session Claude Code (projet LORNA), journaux CEP, vidage Sentry d'After Effects.
- **Ce qui a marché, dans le vrai After Effects (macOS, 26.2.1)** : `claude mcp add` avec la commande de l'onglet Claude, `initialize`, `tools/list`, `get_project`, `run_extendscript` (scripts exécutés, valeurs rendues). Le service redémarre seul avec After Effects et réécoute sur 47821.
- **Le plantage** : Claude a importé par script 5 SVG de la planche (texte en DM Sans, police variable, et Permanent Marker), activé la rastérisation continue et ouvert la comp. 0,2 s plus tard (01:07:09.515), After Effects s'est arrêté (`abort`) dans son fil de rendu, pile `AdobeSVGRE` → `AdobeAGM` → `AdobeCoolType` : le moteur SVG d'AE 2026 en dessinant le texte des SVG. La `capture_frame` demandée 3 s plus tard est arrivée dans un After Effects déjà mort (connexion coupée à 01:07:33, au « Heartbeat call failed » des extensions). SIMING n'est pas en cause : il a transmis le script.
- **Fait** : instructions MCP (vues par Claude à la connexion) : n'importer que des SVG sans texte et recréer les textes en calques texte, essayer d'abord un seul fichier ; proposer d'enregistrer avant un import ou une construction longue ; connexion coupée d'un coup = After Effects planté, le dire au lieu de réessayer. Piège noté dans `NOTES-EXTENDSCRIPT.md`, avec où trouver le vidage d'After Effects. Copie de développement réinstallée (prise en compte au prochain lancement d'AE).

### 2026-11-09 : installeurs réparés, sans UPIA

Demande de Simon : « les installeurs ne marchent plus, mets-les à jour et répare-les ».
- **Cause** (reproduite sous Windows avec le `.zxp` 1.3.1 publié) : UPIA passe désormais par l'application Creative Cloud ; sans session ouverte, `/install` échoue (`status = -631`, « user not signed in » dans `Upia.log`) **mais sort avec le code 0** : l'installeur affichait « SIMING installé » sans rien installer. La liste des versions (API GitHub) marchait.
- **Correction** : les deux installeurs extraient le `.zxp` signé tel quel dans le dossier CEP de l'utilisateur (`%APPDATA%\Adobe\CEP\extensions\com.siming`, `~/Library/Application Support/Adobe/CEP/extensions/com.siming`) : ni UPIA, ni Creative Cloud, ni droits administrateur. Extraction dans un dossier temporaire, contrôle de `CSXS/manifest.xml` et `META-INF/signatures.xml`, puis remplacement. Lien ou jonction de développement : le lien seul est retiré. Ancienne copie UPIA du dossier système : `UPIA --remove SIMING`, puis suppression avec autorisation (UAC, mot de passe macOS). Windows : « q » pour abandonner l'attente d'After Effects.
- `dev-install.command` et `dev-install.bat` remplacent une copie signée posée par l'installeur (même dossier désormais).
- Vérifié : installeur Windows rempli lancé pour de vrai avec `APPDATA` temporaire (jonction factice retirée sans toucher sa cible, 1.3.1 installée puis 1.3.0 par-dessus) ; installeur macOS lancé sous bash avec remplaçants (`ditto` → `unzip`, `osascript` → node, `pgrep`) : 1.3.1 puis 1.2.0, dossier temporaire nettoyé. `node tests/run.js` : 289 tests, 0 échec.
- **Reste à vérifier** : chargement sans PlayerDebugMode d'une copie extraite (signature auto-signée acceptée par CEP, comme le fait ZXP Installer), sur un vrai Mac ; voir `TESTS-MANUELS.md`. Les installeurs corrigés n'atteignent les collègues qu'une fois joints à une Release.
- Le modèle `tools/installer/…` lancé depuis le dépôt (dépôt `__REPO__` non rempli) donnait un 404 de GitHub : il lit maintenant `repository` dans `tools.json`.

### 2026-11-09 : SIMING 1.4.0 publiée

Demande de Simon : « mets tout à jour pour la 1.4 ». Publiée sans test complet dans After Effects (Claude Code vérifié sur Mac le 2026-11-06). Commit 3d3be88 sur `main`. Release https://github.com/NomiSs-S/siming/releases/tag/v1.4.0 (Latest) : `SIMING-1.4.0.zxp` (signature vérifiée, `com.siming.mcp` et `mcp.jsx` inclus, aucun `._`), installeurs sans UPIA, `INSTALLATION.md`. Note affichée : « Ajout : Claude Code dans After Effects (Réglages › Claude), installeur qui ne dépend plus de Creative Cloud » ; les notes demandent de re-télécharger l'installeur une fois. Installeur Windows téléchargé de la Release : liste v1.4.0 en tête.

### 2026-11-09 : Import PSD, import du lot côté hôte (non publié, à valider dans AE)

Tâche 7 du plan Import PSD (spec `docs/superpowers/specs/2026-11-09-import-psd-design.md`) : `psdimport.importBatch`.
- Par PSD : `importFile` en compo (calques rognés), compo et dossier « N Calques » rangés dans `02_ASSET` (racine d'abord, puis ailleurs, sinon créé), puis formes, textes, libellés. Tout dans un groupe d'annulation « Boîte à outils : importer les PSD ».
- Rang des formes : parcours en profondeur de la compo (précompos créées par l'import à leur place), calques repérés par le nom du métrage `<calque>/<fichier>.psd` coupé au dernier « / », rang `nth` parmi les homonymes ; les groupes ne comptent pas.
- `convertTextsIn` (Boîte à outils) et `labelLayers` (Libellés) extraits pour être réutilisés ; `convertPsdText` inchangé.
- Statut : `n PSD importé(s) · t texte(s) · f forme(s)` + ` · k PSD illisible(s)` + ` · k forme(s) en erreur` + ` · textes non convertis (commande introuvable…)` + ` · Ctrl+Z pour annuler`. Les refus voulus (dégradé, calque mis à l'échelle…) ne sont jamais cités.
- Un PSD dont le traitement échoue après l'import est compté illisible et ce qu'il a créé est retiré du projet (dans le même groupe d'annulation).
- Faux After Effects : `importFile` (recettes par chemin), `ImportOptions`, `items.addFolder`, `item.remove()`, `openInViewer`.
- **Reste à vérifier dans After** (voir `NOTES-EXTENDSCRIPT.md`) : onglets de Timeline laissés ouverts, dossier où `importFile` range ses éléments, noms de menu des styles de calque et de la conversion en texte.

### 2026-11-09 : Import PSD, documentation et version 1.5.0 (non publiée, à valider dans AE)

Tâche 9 du plan Import PSD : SIMING 1.5.0, Boîte à outils 1.1.0. Fiche d'aide « Importer les PSD », README (section Boîte à outils, formes et styles recréés, limites), scénario `TESTS-MANUELS.md` § Importer les PSD (sur une copie du projet client de référence, `PROJET_CLIENT`), pièges rassemblés dans `NOTES-EXTENDSCRIPT.md`.
- Recréé : rectangles (tournés, arrondis à rayons égaux ; à coins inégaux, en tracé à l'identique), ellipses, autres formes en tracés, remplissage uni, contour centré ; styles ombre portée, ombre interne, lueur externe, lueur interne, biseautage et estampage, satin, incrustation couleur, contour.
- Laissé en calque PSD, sans jamais le citer dans le statut : dégradés (remplissage, incrustation ; After refuserait les couleurs de dégradé écrites par script, à vérifier), motifs, contour intérieur / extérieur, pointillés ou extrémités et jonctions non standard, plusieurs sous-tracés avec contour ou rotation, soustraction / intersection, calques détourés ou masqués, remplissage à moins de 100 % avec styles, réglage de style sans équivalent. Contours de style, anticrénelage et texture du biseautage : pas recréés, sans message (limite dite dans le README).
- **Pas de geste MCP** : `SIMING.mcp.GESTURES` n'accueille que des gestes de l'hôte, un appel chacun (`bridge.call(outil, geste, args)`). L'import a besoin du panneau, qui lit les PSD (Node, `SIMING.psd.read` puis `shapes`) avant de les envoyer à l'hôte : il ne tient pas dans cette forme. Claude Code peut déjà importer un fichier avec `run_extendscript` ; la recréation des formes reste un geste du panneau.
- **Reste à constater dans After** (tout est dans le scénario) : noms de menu des styles et de la conversion en texte (anglais, français), matchNames et énumérations, dossier où `importFile` range ses éléments, écriture des couleurs de dégradé, `executeCommand` qui agit sur la compo du viewer, styles de calque modifiables ou non à l'import, un seul Ctrl+Z ou deux, taille de la lueur externe (échelle des effets 416,67 %), « Rectangle » de `7.psd` qui recouvre l'original, carré tourné à 45° et deux rectangles de « Rectangle 3 » de la planche test, ellipse en dégradé laissée en PSD, onglets de Timeline laissés ouverts.
- Réimport d'un PSD = seconde copie ; un PSD en échec n'arrête pas le lot ; libellés posés avec les règles enregistrées de l'outil Libellés. Release non faite : `node tools/release.js` et la Release GitHub après les essais dans After.

### 2026-11-09 : Import PSD, corrections de la revue finale (non publié, à valider dans AE)

Revue de toute la branche `feat/import-psd` : la règle « mieux vaut un calque PSD intact qu'une forme approximative » appliquée partout où l'on devinait.
- **Modes de fusion des styles** : Photoshop écrit les énumérations tantôt en code de 4 lettres (`Scrn`, `Mltp`), tantôt en nom long (`screen`, `blendSubtraction`) ; `7.psd` a les noms longs. `styles.js` traduit les deux vers le vocabulaire de l'hôte ; une valeur inconnue (mode, technique, source, style, direction, position) refuse le style au lieu de prendre la valeur par défaut.
- **Contours de style** : une courbe autre que linéaire (lue point par point, jamais par son nom traduit), un satin sans contour linéaire (celui de Photoshop par défaut ne l'est pas, et l'on ne sait pas encore lequel After reproduit), un biseau à texture ou à contour : calque laissé en PSD. Le README ne promet plus d'approximation.
- **Forme d'origine** (rectangle, rectangle arrondi, ellipse) crue seulement si **chaque nœud et ses poignées** sont là où elle les met, dans l'ordre du contour (0,5 px) ; avant, seule la boîte des nœuds était comparée (un coin rentré gardait la même boîte). Appariement origine / sous-tracé par `keyOriginIndex` ; `keyShapeInvalidated` jamais cru. Le tracé à l'identique reste le repli, toujours exact.
- **Taille du métrage** comparée à la boîte du PSD avant de poser une forme (1 px de tolérance) : un écart (styles fusionnés par After, JSON d'un autre calque) devient une « forme en erreur » visible, plus un décalage muet.
- **Compo active vérifiée** après `openInViewer` (et avant chaque commande de style) : jamais de `executeCommand` sur la compo de l'utilisateur ; sinon le PSD est compté illisible.
- **Effets multiples** (`lmfx`, `lfxs`, ex. deux ombres portées) : non décodés (pas de fichier d'exemple pour s'assurer de leur sens à côté de `lfx2`), leur présence laisse le calque en PSD.
- Aussi : base d'un détourage, tracé inversé ou désactivé (drapeaux `vsms`), remplissage initial « tous les pixels » (enregistrement de type 8 du tracé, présent à 0 dans les vrais fichiers) et mode de calque inconnu : laissés en PSD ; limite des angles du contour reprise du PSD ; « 1 PSD illisible » accordé ; progression de lecture peinte avant chaque PSD (lecture asynchrone) ; liste sans dossier : « Aucun dossier : choisis-le avec « Changer de dossier » ».
- Restent pour plus tard (revue, mineurs) : éléments importés dans le dossier sélectionné du Projet, commentaire et branches mortes de `styleValue`, focus à l'ouverture / fermeture de la liste, `render(importBatch)`, `.s-link` / `.s-check-row` hors du bloc des composants, structure de CLAUDE.md, exceptions de la conversion en texte avalées dans le lot, PSD 16 / 32 bits.

### 2026-11-09 : Import PSD, premier essai dans After (1.5.1, non publiée)

Essai sur la planche test (`E:/PERSO/TEST`, vu par le serveur MCP) : ni les formes ni le fond n'étaient convertis.
- **Formes** : After importe un calque de forme (remplissage + tracé vectoriel) en **métrage à la taille du document**,
  ancre au centre, le tracé devenu masque, même en « calques rognés ». La vérification « métrage = boîte du PSD »
  refusait donc chaque forme (« forme en erreur »). Le JSON porte maintenant `canvas` (taille du document) et l'hôte
  accepte les deux tailles : boîte (coin = box) ou document (coin = 0, 0).
- **Fond** : `Calque 0` est un calque de pixels rouge uni, que l'outil ignorait. Le lecteur décode maintenant les
  canaux (8 bits RVB, brut ou PackBits ; zip refusé) des seuls calques de pixels « simples » (liste blanche de blocs)
  et note `uniform` si tout est d'une couleur et opaque ; `shapes.js` en fait un rectangle plein de sa boîte.
- Vérifié dans After via MCP (cœur rechargé par `$.evalFile`) : 1 texte, 5 formes, rendu identique à l'original ;
  l'ellipse en dégradé reste en PSD (voulu). Compo d'essai « planche-test 2 » laissée dans le projet test.
- Retour : « les formes sont toujours des aplats masqués » : la compo regardée était l'import d'avant la correction ;
  le panneau doit être fermé et rouvert pour charger le nouveau code (l'extension pointe sur le dépôt).
- **Points d'ancrage centrés** en fin d'import, dans chaque compo de l'import : `placeAnchor` (Quick Tools, case 5,
  sortie de `anchor` et exposée dans `_core`) ; calque verrouillé ou sans rien de visible laissé.
- **Choix du dossier** : la petite ligne en police à chasse fixe et le lien « Changer de dossier » deviennent une
  carte (`ui.card`, icône `dossier` ajoutée à la charte) : nom du dossier en titre, deux dossiers parents en
  sous-titre, chemin complet en infobulle, clic = changer ; sans dossier, carte en pointillés « Choisir le dossier
  des PSD ». « Cocher : Tout / Rien » remplacé par une ligne « Tous les PSD » à trois états avec le compte
  (`ui.checkList({ allLabel })`).
- Retour : c'est la **fenêtre** de choix qui gênait (arbre de dossiers de Windows de `folder.selectDlg`). La vue
  passe d'abord par `window.cep.fs.showOpenDialogEx(false, true, …, dossier courant)` de CEP (Explorateur,
  Finder) ; erreur ou CEP sans cette fonction : la fenêtre d'After en secours. `list` renvoie `start` (dossier du
  projet) quand 02_ASSET est introuvable, pour y ouvrir la fenêtre. À vérifier dans After : style de la fenêtre.
- **Précompos recadrées** sur leur contenu (`cropPrecomp`, des plus profondes à la planche) : union des boîtes des
  calques, élargie du débordement des styles (ombre portée : distance + taille ; lueur externe, biseau, contour :
  taille), coupée aux bords de la compo (ce qui dépassait restait caché) ; calques sans parent reculés, ancre du
  calque de précompo reposée. Constaté dans After : il **remet à l'échelle** l'ancre des calques d'une compo qui
  change de taille ; l'ancre est donc relevée avant et reposée après. Vérifié via MCP : « Groupe 1 » en 1173 × 278,
  rendu identique. Le faux After des tests imite ce comportement et donne à un calque de précompo la boîte de sa compo.

### 2026-11-10 : SIMING 1.5.1 publiée

Release GitHub v1.5.1 (https://github.com/NomiSs-S/siming/releases/tag/v1.5.1) : `.zxp` signé, installeurs
Windows et macOS, `INSTALLATION.md`. Première version publiée avec Importer les PSD (la 1.5.0 ne l'a pas été).

### 2026-11-10 : Import PSD, styles copiés et dégradés (1.5.2, non publiée, à valider dans AE)

Constaté par script dans After 26.2 (détails dans `NOTES-EXTENDSCRIPT.md`, « Styles de calque » et « Dégradés ») :
After importe un PSD avec ses styles de calque **modifiables** ; Copier (19) puis Coller (20) les recopie
d'un calque PSD sur un calque de forme, réglages compris ; les noms de menu des styles sont faux
(`findMenuCommandId('Ombre portée')` = l'effet) et les groupes s'appellent `<sorte>/enabled` ; les couleurs d'un
dégradé de forme sont inaccessibles, mais l'effet Dégradé (`ADBE Ramp`) convient.

Décisions :

- **Styles de calque : copiés, plus reconstruits.** Supprimés : `js/psd/styles.js` (la conversion de couleur est
  passée dans `shapes.js`), `tests/psd-styles.test.js`, et côté hôte `STYLE_TABLE`, les tables d'énumérations,
  `applyStyles` & co, tout usage des noms de menu. `Shape` n'a plus de champ `styles` ; `shapes.js` ne refuse plus
  un calque à cause de ses styles (`lfx2` illisible, `lmfx` / `lfxs`, style non reproductible, fond < 100 % avec
  styles). `replaceWithShape` copie les styles du calque PSD (`copyLayerStyles`, test « le groupe est-il masqué ? »)
  avant de retirer l'original ; un collage sans effet est une panne visible. Avec styles : remplissage et contour à
  100 % (l'opacité du fond est dans les options de fusion copiées) ; sans : `fillOpacity`.
  Le presse-papiers de l'utilisateur est écrasé (accepté). La sélection de calques est rétablie par identifiant
  (et non plus par index : les index bougent quand la forme prend la place de l'original).
- **Dégradés : effet Dégradé** pour les linéaires à deux couleurs RVB opaques, alignés sur le calque, sans échelle ni
  décalage ni milieu déplacé, en « Classique » : `fill = { type: 'ramp', start, end, startColor, endColor }`
  (géométrie mesurée dans After sur « Ellipse 1 ») ; la forme prend la couleur de départ en remplissage uni et
  l'effet colore le tout. Le reste (radial, 3 arrêts, transparence…) reste un calque PSD. Écarts assumés : le
  lissage de Photoshop aux extrémités (une dizaine de niveaux sur 255), et, ajouts à la consigne, **un dégradé avec
  contour reste en PSD** (l'effet colorerait le contour aussi) et des arrêts qui ne sont pas à 0 et 100 % sont
  reproduits en rapprochant les points (la couleur reste au-delà, comme dans Photoshop).
- `cropPrecomp` / `styleOverflow` : noms de groupes corrigés (`dropShadow/enabled`…), qui ne trouvaient jamais rien.
- Faux After : Copier / Coller des styles, groupe `ADBE Layer Styles` masqué sans style (`selected` lève), calques
  déclarés avec `styles: [...]`, effet `ADBE Ramp` à sept paramètres ; ancien faux des menus de styles retiré.
- La planche test donne 6 formes (Ellipse 1 comprise). `tools.json` : 1.5.2, Boîte à outils 1.1.2.

À valider dans After : scénario « Importer les PSD » de `TESTS-MANUELS.md` (styles copiés, dégradé, sélection
rétablie, un seul Ctrl+Z).

## Pistes

Idées notées, à trier. Ne pas implémenter sans besoin réel.

**Boîte à outils : idées proposées à Simon le 2026-10-07, pas retenues pour l'instant**
- Séquencer depuis la tête de lecture ; répartir la sélection sur une durée donnée.
- Null : un null par calque sélectionné ; nom choisi.
- Textes PSD : aussi dans les précompositions du PSD.
- Décliner : ranger les copies dans un dossier du projet, ou les ouvrir ; dupliquer aussi les précompos imbriquées.
- Copier des infos : timecode courant, nom et taille de la comp, noms des calques sélectionnés.

**Outils à venir**
- **Quick Tools** : curseurs d'influence du lissage de vitesse en entrée, en sortie,
  et les deux, avec un picto de keyframe avant chaque curseur qui applique la valeur
  au clic ; expression Elastic pilotée par un effet « Elastic Controller » (amplitude
  / 200, fréquence / 30, amortissement / 10, basée sur `velocityAtTime` à la dernière
  keyframe) ; alignement façon fenêtre Aligner.
- **Point d'ancrage** : carré 3 × 3, cases de 36 entièrement cliquables, pavé numérique 1–9.
- **Renommer** : rechercher / remplacer avec aperçu, `##` pour la numérotation.
- ~~Échelonner~~ et ~~Null de contrôle~~ : faits dans la Boîte à outils (1.3.0) ; reste un aperçu avant de séquencer, le choix du nom et de la couleur du null.
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
- ~~Copier la frame courante dans le presse-papier~~ (fait, Boîte à outils 1.3.0). Restent pour la boîte d'outils rares : exporter la frame, copier timecode / infos de comp / noms de calques, médias manquants, polices, convertir expressions en keyframes, zone de travail.
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
- **Largeur minimale qui rogne** (2026-10-07) : `min-width` sur le conteneur d'un panneau CEP + `overflow: hidden` = contenu coupé à droite dès qu'on ancre le panneau plus étroit (le `MinSize` du manifeste n'est pas respecté à l'ancrage). Ne pas imposer de largeur : faire passer à la ligne.
- **Mot réservé d'ES3 comme nom de variable** (2026-10-07) : `var short` passe sous Node (tests verts) mais peut faire refuser tout le fichier par ExtendScript. Le test de syntaxe les refuse maintenant.
- **Barres obliques inverses dans un script Node écrit par heredoc** (2026-10-07) : dans un gabarit `` `…` ``, `\\d` devient `\d` puis `d` ; pour modifier du code qui contient des expressions régulières, passer par l'outil Edit.
- **Barre de valeur tassée** (2026-10-07) : `.s-bar` a `flex: 1` (pensé pour une rangée) ; seule dans une colonne flex, elle s'écrase à ~18 px. `.s-stack > .s-bar { flex: none; }`.
- **Fichiers « ._ » de macOS sur le disque exFAT** (2026-11-06) : chaque fichier écrit depuis le Mac sur KINGSTON reçoit un `._<nom>` ; `getFiles('*.jsx')` aurait évalué `._mcp.jsx`, et `add-bom.js` lui avait ajouté un BOM. Ignorés partout, retirés par `release.js`.
- **SVG à texte importé dans After Effects 2026** (2026-11-06) : plantage d'AE au rendu (moteur SVG, polices). Consigne ajoutée aux instructions MCP ; voir `NOTES-EXTENDSCRIPT.md`.
- **Extension reliée à un disque externe** (2026-11-06) : le lien de développement vers `/Volumes/EXT 11/…` est mort quand le disque a été renommé KINGSTON (et chaque éjection ou mise en veille le coupait) : SIMING « disparaissait » sur Mac. Sur Mac, installer par copie (`tools/dev-install.command`).
- **UPIA échoue sans session Creative Cloud et sort avec le code 0** (2026-11-09) : `status = -631` ; l'installeur croyait avoir réussi. Remplacé par l'extraction du `.zxp`. Voir `NOTES-EXTENDSCRIPT.md`, Installation.
- **`pgrep -f` pour savoir si une application tourne** (2026-10-12) : attrape tous les processus dont le chemin contient le nom (processus d'appoint dans le dossier de l'application) ; `pgrep -x` sur le nom exact du processus. Voir `NOTES-EXTENDSCRIPT.md`, Installation (macOS).

- **Ancre remise à l'échelle quand une précompo change de taille** (2026-11-10) : `sub.width = 400` (au lieu de
  1000) fait passer l'ancre des calques qui l'affichent de 500 à 200. Relever l'ancre avant, la reposer après.
- **Calque de forme d'un PSD importé à la taille du document** (2026-11-09) : After ne rogne pas un calque de
  remplissage + tracé vectoriel ; il le donne en 1920 × 1080 avec le tracé en masque. Voir `NOTES-EXTENDSCRIPT.md`.

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
- Boîte à outils, frame : `saveFrameToPng` rend-il en pleine résolution ou à celle de la vue ? Synchrone ? Dépend-il de la préférence d'écriture de fichiers (et la clé `Pref_SCRIPTING_FILE_NETWORK_SECURITY` se lit-elle) ? `cep_node` est-il là avec `--enable-nodejs` (pas de fenêtre noire à la copie) ? Collage dans Slack, Photoshop, mail ; transparence ; chemin avec accents ou apostrophe.
- Boîte à outils, commandes de menu : noms exacts en français de « Reveal Layer Source in Project » et « Convert to Editable Text » (sinon : message « introuvable dans cette langue », et noter le libellé exact pour l'ajouter).
- Boîte à outils, séquencer : `comp.selectedLayers` est-il dans l'ordre des clics ou de la pile ? Keyframes recréées identiques (ease, tangentes, déplacement libre, couleur) ? Keyframes de Source Text ?
- Boîte à outils, null : un enfant à la position animée garde-t-il son animation quand on le relie (compensation d'AE) ? Fond et null commencent-ils bien à 0 ?
- Boîte à outils, ajouts : `comp.duplicate()` range-t-il la copie dans le même dossier ? Rogner : la commande native d'AE fait-elle bien avancer le timecode de départ (sinon s'aligner sur elle) ? Marqueurs de comp hors zone ? `setValuesAtTimes` sur Source Text et sur un tracé de masque ? `explorer.exe /select,` avec un chemin accentué ?
- Voir aussi la spec CEP § 13 (version AEFT minimale, UPIA, `requestOpenExtension`, thème, lecture de `tools.json`).
- Claude Code : ~~After Effects démarre-t-il seul l'extension invisible `com.siming.mcp` (`StartOn`) ?~~ Oui sur macOS, AE 26.2.1 (2026-11-06) ; Windows à vérifier. ~~`cep_node.require('http')` écoute-t-il bien ?~~ Oui (macOS, appels de Claude servis). `requestOpenExtension` la lance-t-il depuis le hub ? `event.data` des événements CEP : texte ou objet ?
- Import de SVG à texte dans AE 2026 : plantage aussi par Fichier › Importer (fenêtre d'options SVG) ? Avec une police non variable ? Sous Windows ?
- Claude Code : `navigator.clipboard.writeText` ou `execCommand('copy')` dans le panneau (Copier la commande) ? `e.line` d'une erreur dans le code de `run_extendscript` (ligne du code envoyé ?) ; une capture 4K passe-t-elle sous la limite d'image (réduction par canevas) ?

