# Checklist de tests manuels dans After Effects

À dérouler avant chaque Release. Noter résultats et anomalies dans `docs/SUIVI.md`.

Préparer une comp « Rig » : `Parent` ; trois enfants `A`, `B`, `C` ; un petit-enfant
`C1` parenté à `C` ; un calque `Libre` ; une position animée sur `B`. Une seconde comp
« Autre » : `Tete` avec deux enfants `Oeil_G`, `Oeil_D`.

## Installation

- [ ] `tools/dev-install` (Windows et macOS) : SIMING apparaît dans Fenêtre › Extensions après redémarrage d'AE.
- [ ] Release signée installée avec l'installeur (Windows et macOS) : le menu de versions s'affiche, « Entrée » installe la dernière, la version installée est indiquée au lancement suivant.
- [ ] Retour à une version précédente avec l'installeur : la version choisie est bien installée.
- [ ] AE ouvert pendant l'installation : l'installeur demande de le fermer.
- [ ] Windows : `SIMING-Installer-Windows.bat` lancé depuis un dossier dont le nom contient une apostrophe (ex. `C:\Users\…\l'atelier`) : l'installeur démarre normalement.
- [ ] macOS 15 (Sequoia) ou plus : premier lancement de `SIMING-Installer.command` refusé, puis **Réglages Système › Confidentialité et sécurité › Ouvrir quand même** : l'installeur s'ouvre (procédure de `docs/INSTALLATION.md`).
- [ ] macOS : `SIMING-Installer.command` fonctionne avec le `/bin/bash` 3.2 livré par Apple (liste des versions lue par le heredoc dans `$(...)`).
- [ ] Noter la commande et le chemin exacts d'UPIA qui fonctionnent sur chaque système (spec § 13).

## Hub

- [ ] Fond, rail horizontal (48 px), icônes nettes, outil actif bleu avec trait bas, Réglages à droite, statut en bas avec `v1.0.0`.
- [ ] Panneau étroit (≈ 260 px) : rien ne déborde ; avec plusieurs outils, le menu « … » apparaît.
- [ ] Touches 1…n (rangée de chiffres, avec ou sans Maj en AZERTY) changent d'outil dans l'ordre du rail (pas dans un champ) ; infobulle du rail « Nom (1) ».
- [ ] Réglages : outil au lancement respecté après fermeture/réouverture ; « À propos » liste les versions.
- [ ] Réglages › Ordre des outils : Monter / Descendre réordonne le rail aussitôt, les touches 1…n et les infobulles suivent, l'ordre est retrouvé après fermeture/réouverture.
- [ ] Réglages › Raccourcis clavier : groupes « Panneau » puis un par outil ; clic sur la touche d'« Afficher Quick Tools », frappe Ctrl+Q : le bouton affiche « Ctrl + Q », l'infobulle du rail aussi, Ctrl+Q change d'outil et la touche 2 ne fait plus rien. Choisir pour « Afficher Unparent » la touche 1 déjà prise : statut orange « Raccourci repris à : … », l'autre action affiche « — ». Retour arrière = « — », Échap = inchangé. « Rétablir » remet 1, 2… Lettre tapée en AZERTY (A) : libellé « A », pas « Q ».
- [ ] Raccourci choisi dans le hub, puis panneau isolé « SIMING – Quick Tools » : noter s'il s'applique aussi (mémoire `localStorage` partagée entre extensions du bundle ?) ; sinon les touches par défaut.
- [ ] Changer la luminosité de l'interface d'AE (Préférences › Apparence) : le fond du panneau suit.

## Panneau isolé

- [ ] Bouton « Ouvrir dans un panneau » d'Unparent : le panneau « SIMING – Unparent » s'ouvre et s'ancre.
- [ ] Cliquer de nouveau le bouton quand le panneau est déjà ouvert : noter le comportement (spec § 13).
- [ ] Le panneau isolé fonctionne comme dans le hub, avec sa propre ligne de statut.

## Unparent : rendu

- [ ] Carte vide en pointillés, survol bleu ; remplie : nom en gras, « n enfants · Rig ».
- [ ] Carte remplie : carré de la couleur d'étiquette de `Parent` devant le nom ; changer l'étiquette du calque puis recliquer la carte : la couleur suit ; étiquette « Aucune » : pas de carré ; couleur personnalisée dans Préférences › Étiquettes : c'est elle qui s'affiche (sinon la couleur par défaut d'AE apparaît : le noter dans `docs/SUIVI.md`).
- [ ] Bandeau orange présent seulement quand un enfant est détaché, sans laisser de trou sinon.
- [ ] Bouton secondaire présent seulement en cas mixte, sans laisser de trou sinon.
- [ ] Lignes de 32 px ; au survol, la pastille laisse place à « Détacher » / « Rattacher ».
- [ ] Filtre Tous / Liés / Détachés avec les nombres.

## Unparent : comportement

- [ ] Aucune comp ouverte, clic sur la carte : « Aucune composition active ».
- [ ] `Libre` sélectionné : « n'a aucun enfant lié ni détaché ».
- [ ] `Parent` sélectionné : `A`, `B`, `C` « lié », `C1` absent. Bouton « Détacher les 3 enfants ».
- [ ] Bouton principal : rien ne bouge à l'image courante ; `C1` suit `C` ; le bouton devient « Rattacher les 3 enfants ».
- [ ] Déplacer `Parent` : les enfants ne bougent pas.
- [ ] Un seul Ctrl+Z annule l'action entière (nom de l'annulation : « Unparent : détacher » / « Unparent : rattacher »).
- [ ] Clic sur la ligne `A` : `A` seul change d'état ; double-clic rapide : noter s'il part une ou deux actions.
- [ ] Commentaire de `A` détaché : se termine par `[UP|<id>|Parent]`, un commentaire existant est conservé devant.
- [ ] Nom de calque avec guillemets, apostrophe, accents : affichage et actions corrects.
- [ ] Sans sélection, clic sur la carte : « Liste mise à jour ».
- [ ] Changer de comp active puis bouton principal : « La composition active a changé ».
- [ ] `A` verrouillé, bouton principal : dialogue « Calques ignorés », statut orange.
- [ ] Enregistrer, quitter AE, rouvrir : les enfants détachés sont retrouvés et rattachables.
- [ ] Détacher dans « Autre », revenir dans « Rig » : « En attente dans le projet » propose de rattacher `Tete` ; un clic le fait.
- [ ] `B` (position animée) : saut possible sur d'autres images, comme le menu Parent d'AE (limite connue).
- [ ] Projet lourd (centaines de calques) : le panneau reste réactif.
- [ ] Projet de production réel : chronométrer un clic sur une ligne (de la souris au statut) et noter le temps dans `docs/SUIVI.md`.
- [ ] Clic sur une ligne, puis touche Entrée sans toucher à la souris : le bouton principal agit (hub et panneau isolé).
- [ ] Ctrl+Z juste après « Détacher » `A`, puis parent de `A` mis à « Aucun » à la main dans la timeline, puis clic sur la carte : `A` n'apparaît pas comme détaché (ni dans la liste, ni dans « En attente »).

## Quick Tools (1.1.0)

Préparer dans « Rig » : `A` avec une position animée (deux keyframes), `B` avec une échelle animée, `C` tourné de 45° à 150 %, `D` parenté à `C`, une caméra. Touche 2 : l'outil s'affiche, cinq sections visibles sans défilement dans un panneau de 640 px ; Ancrage et Aligner côte à côte, y compris à 260 px de large.

- [ ] Barre de valeur : glisser n'importe où (saut au clic), Maj = précision, molette ±1 et Maj ±10, flèches, double-clic = saisie (Entrée valide, Échap annule), Alt + clic = 33. Valeurs retrouvées après fermeture/réouverture.
- [ ] Première keyframe de `A` sélectionnée, picto « Entrée » à 75 % : le **départ du mouvement** est lissé (éditeur de graphiques : Bézier, vitesse 0, influence 75 sur le côté sortant de la keyframe, côté entrant inchangé ; icône de keyframe : moitié droite arrondie) ; statut « 1 keyframe lissée, entrée 75 % » ; un seul Ctrl+Z (« Quick Tools : lisser »). Dernière keyframe, picto « Sortie » : l'arrivée est lissée (côté entrant).
- [ ] Relâcher la barre « Les deux » applique aussi. Keyframes d'échelle (2D) : les deux dimensions reçoivent l'influence. Keyframe en maintien : ignorée et listée dans le dialogue.
- [ ] Rien de sélectionné : « Aucune keyframe sélectionnée », rien ne change.
- [ ] Position de `A` sélectionnée, « Appliquer Elastic » : effet « Elastic Controller » (20 / 40 / 60) sur `A` seul, même si `B` était aussi sélectionné ; sélection de calques rétablie après coup ; expression active, rebond visible après la dernière keyframe. Second clic : l'effet n'est pas doublé.
- [ ] Croix « Retirer Elastic » : expression vidée, effet retiré si plus aucune propriété du calque ne le cite (en garder une pour vérifier le contraire).
- [ ] `C` (tourné, 150 %) sélectionné, case 9 du carré puis touche 9 du pavé numérique : l'ancrage va en haut à droite de la boîte, le calque ne bouge pas à l'écran ; `D` parenté suit sans bouger. Touche 9 de la rangée de chiffres : rien (ou changement d'outil si un 9e outil existe). Case mémorisée.
- [ ] `A` (position animée, deux keyframes) sélectionné, case 5 : les deux keyframes de position sont décalées, **aucune keyframe créée**, `A` ne bouge à aucune image (parcourir la timeline) ; tracé de mouvement et tangentes conservés. `B` (échelle animée) : idem, chaque keyframe compensée avec l'échelle de son instant. Ancrage lui-même animé : ses keyframes décalées d'autant.
- [ ] Calque texte, forme, solide, précomposition : boîte correcte pour l'ancrage (noter les écarts, surtout précomposition). Caméra sélectionnée : « pas de boîte visible », listée.
- [ ] `A`, `B`, `C` sélectionnés, Sélection, « Aligner à gauche » : bords gauches visibles alignés (calque tourné : son rectangle englobant) ; `D` parenté à `C` aligné sur la composition : se place bien malgré l'échelle et la rotation du parent.
- [ ] Composition, « Centrer verticalement » : milieu de la comp. Position animée : keyframe posée à l'instant courant ; dimensions séparées : X et Y modifiées.
- [ ] Répartir avec 2 calques : « au moins 3 » ; avec 4 calques : extrêmes fixes, espacement régulier ; calque verrouillé : dialogue « Éléments ignorés ».
- [ ] Pictos de keyframe : moitié droite remplie = Entrée, moitié gauche = Sortie, losange plein = Les deux ; nets à 100 % et 200 % d'échelle d'écran.
- [ ] Réglages › Raccourcis clavier, groupe « Quick Tools » : 27 gestes ; donner une touche à « Aligner à gauche », revenir à l'outil, la frapper : alignement fait et case cerclée ; donner Pavé 5 à « Appliquer Elastic » : « Ancrage : centre » affiche « — » et Pavé 5 applique Elastic.
- [ ] Dernier geste cerclé de bleu (un seul à la fois). Changer de sélection, Entrée : le geste est rejoué (alignement : avec Sélection / Comp au moment du rejeu). Aucun geste encore : Entrée ne fait rien. Entrée dans un champ de saisie = valider la saisie seulement.
- [ ] Panneau isolé « SIMING – Quick Tools » : identique, pavé numérique actif quand le panneau a le focus.
