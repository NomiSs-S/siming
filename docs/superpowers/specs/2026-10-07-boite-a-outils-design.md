# Boîte à outils et retours d'interface (SIMING 1.3.0)

Date : 2026-10-07. Demande de Simon, écrite pour mémoire, sans validation intermédiaire
(voir la mémoire « working tool over reviews »).

## 1. Trois retours

1. **Quick Tools par défaut** : premier outil de `tools.json`, donc premier du rail, touche 1,
   et outil affiché à la première ouverture (réglage « Dernier outil utilisé » vide). Ordre :
   Quick Tools, Boîte à outils, Unparent, Libellés. Un ordre déjà réglé à la main est gardé.
2. **Interface étroite** : la largeur minimale de 260 px imposée par `.s-app` rognait le panneau
   à droite. Elle est retirée ; ce qui était côte à côte passe à la ligne quand la place manque
   (aides de section sous leur titre, Ancrage au-dessus d'Aligner, nom d'une nature au-dessus de
   sa couleur, libellé d'un raccourci au-dessus de sa touche, boutons de geste en une colonne).
   En dessous de 260 px : marges de 8, Répartir en 3 colonnes, version masquée dans le statut,
   libellés longs sur deux lignes. Segmentés : libellé coupé par « … » avec infobulle. Rail :
   « … » allumé quand l'outil affiché y est rangé. Pas de requêtes de conteneur : CEP 11 embarque
   Chromium 88 ; tout passe par `flex-wrap`, grilles `auto-fit` et `@media (max-width)`.
3. **Barre de défilement** : 10 px, piste transparente, curseur `--line` de 4 px arrondi,
   6 px `#5A5A5A` au survol, `--icon-rest` tenu, sans flèches (`::-webkit-scrollbar`).

## 2. Boîte à outils (outil `toolbox`, icône `boite`)

Outil de gestes rapides, comme Quick Tools : pas de bouton principal, dernier geste cerclé,
Entrée le rejoue, chaque geste dans le registre de raccourcis (12 actions, Entrée seule par défaut).
Chaque geste = un groupe d'annulation « Boîte à outils : … ». Chaque réponse de l'hôte porte la
comp active (`id, name, width, height, format, bg`), relue aussi quand le pointeur entre dans la vue.

| Section | Geste | Comportement |
|---|---|---|
| Frame | Copier la frame | `comp.saveFrameToPng` dans `Folder.temp/SIMING/frame-<ms>.png` (anciennes effacées) ; le panneau attend que le fichier soit écrit et stable (`frameState`), puis le copie : Node du panneau (`child_process.execFile`, sans fenêtre), sinon l'hôte (`system.callSystem`). Windows : PowerShell STA, image + format « PNG » (transparence gardée dans les applis qui le lisent). macOS : `osascript` JavaScript, `NSPasteboard`. Préférence « Autoriser les scripts à écrire des fichiers… » lue avant : message clair si elle est coupée. |
| Séquencer | Calques, Keyframes | Mode Cascade (ordre de sélection), Inverse, Aléatoire (ordre tiré au hasard à chaque clic, écart régulier). **Écart** (offset) = images entre deux départs ; **Par paquets de** (step) = combien partent ensemble. Le plus tôt reste en place. Calques : `startTime` décalé, keyframes suivent. Keyframes : un groupe par calque (par propriété s'il n'y a qu'un calque), keyframes retirées puis reposées avec interpolation, ease, continuité, Bézier auto, tangentes, déplacement libre, couleur ; elles restent sélectionnées ; une keyframe non sélectionnée sur le chemin est remplacée et signalée. |
| Créer | Null relié | Au centre des boîtes visibles de la sélection (centre de la comp sans sélection), juste au-dessus du plus haut, sur la durée de la sélection, 3D si toute la sélection l'est. Relie les calques dont le parent n'est pas sélectionné ; s'ils partagent le même parent, le null le prend. Nom « Contrôle » (« Contrôle <calque> » pour un seul). Seul sélectionné ensuite. |
| Créer | Fond (+ pastille) | Calque de forme « Fond » tout en bas : rectangle `[thisComp.width, thisComp.height]`, position `[thisComp.width / 2, thisComp.height / 2]`, ancrage 0 : suit la taille de la comp. Couleur : pastille (sélecteur du système `$.colorPicker`, mémorisée), Alt + clic = couleur de fond de la comp (par défaut). |
| Format de la compo | 16:9, 4:5, 1:1, 9:16 | Plus petit côté gardé, l'autre arrondi au pair (1920 × 1080 → 1080 × 1920, 1080 × 1350, 1080 × 1080). Calques sans parent décalés de la moitié de l'agrandissement (keyframes décalées sans en créer, verrouillés compris, dimensions séparées, point ciblé des caméras et lumières). Format en cours allumé, taille dans l'aide de section. |
| Calques | Afficher la source dans le Projet | Sources des calques sélectionnés sélectionnées dans le panneau Projet (sans doublon), puis commande d'AE « Reveal Layer Source in Project » si son nom est trouvé (anglais ou français). Calques sans source signalés. |
| Calques | Convertir les textes PSD | Calques dont la source est un `.psd`/`.psb` (sélection, sinon toute la comp) : un à la fois, sélection isolée, commande « Convert to Editable Text » (nom anglais, français, sinon 3799) ; converti si un calque texte est apparu, sinon signalé. |

Mots retenus pour offset / step (Simon a choisi « écart + paquets ») : **Écart** (images) et
**Par paquets de**. Aléatoire = « ordre mélangé ».

## 3. Architecture

- Hôte : `host/tools/toolbox.jsx`, fonctions pures exposées dans `_core` (formats, créneaux,
  couleurs, en-tête PNG, programme du presse-papier). Géométrie et sélection de Quick Tools
  déplacées dans `siming.jsx` (`SIMING.geom`, `SIMING.ae.readTransform`, `layerToComp`,
  `layerBox`, `offsetProperty`, `selectedKeyframes`…), partagées par les deux outils.
- Panneau : `tools/toolbox.js` ; `SIMING.runProgram(file, args)` dans `js/siming.js` (Node de CEP) ;
  manifeste : `--enable-nodejs` (contexte séparé, `cep_node.require`). `ui.valueBar({ integer })`.
- Icônes : `boite`, `appareil`, `fond`, `source`, `texte` (45 icônes).
- Tests : `toolbox-core`, `toolbox-api`, `toolbox-view` ; faux AE étendu (null, forme, temps des
  calques, keyframes ajoutées et retirées, PNG, commandes de menu, presse-papier, sélecteur de couleur).

## 4. À vérifier dans After Effects

Rendu de `saveFrameToPng` (synchrone ou non, résolution), copie réelle dans le presse-papier
(Windows, macOS) et collage dans Slack / Photoshop, `cep_node` disponible, noms de menus
français, ID 3799, tangentes et ease après déplacement de keyframes, recentrage d'une caméra
à deux nœuds. Détail : `docs/TESTS-MANUELS.md`, section Boîte à outils.
