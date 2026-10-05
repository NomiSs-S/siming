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
- [ ] Touches 1…n changent d'outil (pas dans un champ).
- [ ] Réglages : outil au lancement respecté après fermeture/réouverture ; « À propos » liste les versions.
- [ ] Changer la luminosité de l'interface d'AE (Préférences › Apparence) : le fond du panneau suit.

## Panneau isolé

- [ ] Bouton « Ouvrir dans un panneau » d'Unparent : le panneau « SIMING – Unparent » s'ouvre et s'ancre.
- [ ] Cliquer de nouveau le bouton quand le panneau est déjà ouvert : noter le comportement (spec § 13).
- [ ] Le panneau isolé fonctionne comme dans le hub, avec sa propre ligne de statut.

## Unparent : rendu

- [ ] Carte vide en pointillés, survol bleu ; remplie : nom en gras, « n enfants · Rig ».
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
