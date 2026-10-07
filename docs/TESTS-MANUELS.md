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
- [ ] Première ouverture (installation neuve, ou après avoir effacé les réglages du panneau) : Quick Tools affiché, premier du rail, touche 1 ; puis Boîte à outils, Unparent, Libellés. Un ordre déjà réglé à la main reste le même après mise à jour.
- [ ] Panneau étroit (≈ 260 px) : rien ne déborde ; avec plusieurs outils, le menu « … » apparaît.
- [ ] Panneau très étroit (ancré à 180–220 px de large) : **rien n'est rogné à droite** ; les aides de section passent sous leur titre, Ancrage au-dessus d'Aligner (Quick Tools), Répartir en 3 colonnes, couleur d'une nature sous son nom (Libellés › Règles), touche d'un raccourci sous son libellé (Réglages), boutons de la Boîte à outils l'un sous l'autre ; quand l'outil affiché est rangé dans « … », « … » est allumé en bleu.
- [ ] Barre de défilement (panneau court, Réglages › Raccourcis, récapitulatif de Libellés) : fine, grise, arrondie, sans flèches ; plus épaisse au survol, plus claire quand on la tient ; plus de barre claire de Windows.
- [ ] Touches 1…n (rangée de chiffres, avec ou sans Maj en AZERTY) changent d'outil dans l'ordre du rail (pas dans un champ) ; infobulle du rail « Nom (1) ».
- [ ] Réglages : trois onglets Outils / Raccourcis / Général, le dernier ouvert est retrouvé après fermeture/réouverture. Général : outil au lancement (menu déroulant lisible en thème sombre) respecté après réouverture ; « À propos » liste les versions.
- [ ] Réglages › Outils : glisser une ligne par sa poignée (la ligne suit la souris, contour bleu) réordonne le rail au relâchement ; ↑ ↓ sur la poignée aussi ; les touches 1…n, les infobulles et la pastille de touche de chaque ligne suivent ; ordre retrouvé après réouverture.
- [ ] Réglages › Outils : l'œil masque un outil du rail (ligne atténuée, compteur « n · 1 masqué »), les chiffres se décalent ; l'outil masqué reste ouvrable par Fenêtre › Extensions › SIMING – <Outil> ; le dernier outil visible ne peut pas être masqué.
- [ ] Réglages › Raccourcis : la recherche filtre par action, outil ou touche (accents ignorés) ; Échap vide le champ ; « Aucune action ne correspond » si rien.
- [ ] Réglages › Raccourcis clavier : groupes « Panneau » puis un par outil ; clic sur la touche d'« Afficher Quick Tools », frappe Ctrl+Q : le bouton affiche « Ctrl + Q », l'infobulle du rail aussi, Ctrl+Q change d'outil et la touche 2 ne fait plus rien. Choisir pour « Afficher Unparent » la touche 1 déjà prise : statut orange « Raccourci repris à : … », l'autre action affiche « — ». Retour arrière = « — », Échap = inchangé. « Rétablir » remet 1, 2… Lettre tapée en AZERTY (A) : libellé « A », pas « Q ».
- [ ] Raccourci choisi dans le hub, puis panneau isolé « SIMING – Quick Tools » : noter s'il s'applique aussi (mémoire `localStorage` partagée entre extensions du bundle ?) ; sinon les touches par défaut.
- [ ] Changer la luminosité de l'interface d'AE (Préférences › Apparence) : le fond du panneau suit.

- [ ] Pictos : réglages = deux curseurs (rail), « Ouvrir dans un panneau » = fenêtre à barre de titre, à droite de l'aide.
- [ ] Raccourci combiné : Réglages › Raccourcis, clic sur une touche, tenir Ctrl + Alt (le bouton affiche « Ctrl + Alt + … »), frapper 5 : « Ctrl + Alt + 5 ». Revenir à l'outil, panneau focalisé, Ctrl + Alt + 5 : l'action part et After Effects ne réagit pas. Idem Ctrl + Maj + une lettre. Sur Mac : Cmd + une lettre.

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

Préparer dans « Rig » : `A` avec une position animée (deux keyframes), `B` avec une échelle animée, `C` tourné de 45° à 150 %, `D` parenté à `C`, une caméra. Touche 1 : l'outil s'affiche, cinq sections visibles sans défilement dans un panneau de 640 px ; Ancrage et Aligner côte à côte, y compris à 260 px de large.

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

## Libellés (1.2.0)

Préparer dans « Pub » : un texte (nom automatique), un texte renommé « Logo animé », une forme, une image `LOGO_client.png`, une image rangée dans un dossier de projet « Logos », une image `bg_ciel.jpg`, une vidéo, un fichier son, un solide, un nul, un calque de réglage, une précomposition, une caméra. Touche 4 : l'outil s'affiche.

- [ ] Rien ne bouge tant qu'on ne clique pas la carte : changer la sélection ne déclenche aucune analyse.
- [ ] Sélection de 3 calques, clic sur la carte : récapitulatif « Mot-clé « logo » », « Texte »… ; bouton « Appliquer 3 libellés ». Composition : les 13 calques, groupes dans l'ordre mots-clés puis natures.
- [ ] Couleurs des pastilles = celles des Préférences › Étiquettes (en changer une dans AE, relancer l'analyse : la pastille suit). Noms des couleurs : français par défaut, nom personnalisé s'il a été renommé (vérifier les accents d'un nom personnalisé).
- [ ] Natures reconnues : texte jaune, forme bleue, vidéo fuchsia, image orange, son, solide et nul rouges, réglage violet, précompo grès, caméra rose. Noter toute erreur (séquence d'images, PSD, AI, fichier manquant, calque 3D de modèle).
- [ ] « Logo animé » (texte renommé) en vert ; texte au nom automatique contenant « logo » dans son contenu : reste jaune. Image dans le dossier « Logos » : verte. `bg_ciel.jpg` : rouge.
- [ ] Clic sur une ligne : sélecteur flottant (au-dessus si la place manque en bas), nom de la couleur survolée, flèches, Échap, clic dehors. Choisir une couleur : étiquette « à la main » ; « Ne pas changer » : « inchangé », bouton décompté.
- [ ] Pastille d'un groupe : la règle change, l'analyse se relance, les choix à la main restent ; l'onglet Règles montre la nouvelle couleur.
- [ ] « Appliquer » : étiquettes posées dans la timeline ; un seul Ctrl+Z (« Libellés : appliquer ») remet tout ; statut « N libellés posés ». Calque verrouillé : étiquette posée ou listée dans « Calques ignorés » (noter lequel).
- [ ] Onglet Règles : ajouter un mot-clé (focus dans le champ, couleur libre proposée), le saisir, revenir à Calques : ré-analyse ; retirer ; changer une nature ; « Rétablir les règles par défaut ». Règles retrouvées après fermeture d'AE.
- [ ] Entrée applique (focus dans le panneau, pas dans un champ) ; Réglages › Raccourcis, groupe « Libellés » : donner une touche à « Analyser et appliquer », sélectionner, la frapper.
- [ ] Geste en un clic : appuyer sur une ligne (ou une pastille), glisser sur une couleur, relâcher : couleur choisie, sélecteur fermé. Simple clic : le sélecteur reste ouvert, clic sur une couleur. Relâcher hors du sélecteur : fermé sans choix.
- [ ] Sélection multiple : Ctrl + clic sur 3 lignes (surlignées en bleu), appuyer sur l'une : « Plusieurs couleurs » si elles diffèrent, la couleur choisie va aux 3. Maj + clic : plage. Clic sur le nom d'un groupe : tout le groupe. Échap : désélectionné. Appuyer sur une ligne hors sélection : seule cette ligne change.
- [ ] Panneau isolé « SIMING – Libellés » : identique ; à 260 px de large, rien ne déborde (pastilles nommées des natures, sélecteur).

## Boîte à outils (1.3.0)

Préparer dans « Rig » (1920 × 1080) : trois calques `A`, `B`, `C` animés en position (deux keyframes chacun, une en Bézier avec un ease et une tangente tirée à la main), un calque verrouillé, une caméra à deux nœuds, un PSD importé en composition (calques conservés) qui contient au moins deux textes et une image. Touche 2 : l'outil s'affiche.

- [ ] **Copier la frame** : Préférences › Scripts et expressions › « Autoriser les scripts à écrire des fichiers… » **décochée** : message orange qui dit quoi cocher. Cochée : statut « Frame 1920 × 1080 copiée dans le presse-papier » ; coller dans Slack, un mail, Photoshop, Paint (Windows) / Aperçu › Nouveau depuis le presse-papier (macOS) : l'image de la tête de lecture. Noter : temps de rendu sur une comp lourde, résolution obtenue en Demi / Quart, transparence (comp sans fond) dans Photoshop, et si une fenêtre noire apparaît un instant (elle ne devrait pas : la copie passe par Node du panneau).
- [ ] **Séquencer › Calques** : sélectionner `A`, `B`, `C` (dans cet ordre), Écart 5, Cascade : `B` part 5 images après `A`, `C` 10 images après ; keyframes déplacées avec leur calque ; un seul Ctrl+Z. Inverse : `C` d'abord. Aléatoire : chaque clic donne un nouvel ordre, toujours tous les 5 images. Par paquets de 2 : `A` et `B` ensemble, `C` 5 images après. Calque verrouillé : listé dans « Éléments ignorés ». Calques rognés (point d'entrée ≠ début) : c'est le point d'entrée qui s'aligne.
- [ ] **Séquencer › Keyframes** : sélectionner les keyframes des trois calques, Cascade, Écart 5 : chaque calque décalé de 5 images ; dans l'éditeur de graphiques, l'ease, la tangente tirée à la main, l'interpolation (linéaire / Bézier / maintien), les keyframes « déplacement libre » et leur couleur sont conservés ; les keyframes restent sélectionnées (relancer avec Inverse fonctionne). Un seul calque, keyframes de Position et d'Échelle sélectionnées : décalées propriété par propriété. Keyframe déplacée sur une keyframe non sélectionnée : statut orange « 1 keyframe remplacée ». Source Text (texte animé) : noter si ça marche.
- [ ] **Null relié** : `A` et `B` sélectionnés : null « Contrôle » au centre de leurs boîtes, juste au-dessus du plus haut, de la durée des deux, seul sélectionné ; déplacer le null entraîne `A` et `B`, rien n'a sauté. `A` et `B` enfants d'un même parent `P` : le null devient enfant de `P`, la hiérarchie tient. Calques 3D : null 3D. Rien de sélectionné : null au centre de la comp. Noter la couleur d'étiquette obtenue.
- [ ] **Fond** : pastille › sélecteur de couleur du système, choisir une couleur : la pastille la montre (gardée après fermeture d'AE) ; « Fond » posé tout en bas, de la taille de la comp ; changer la taille de la comp (Composition › Paramètres) : le fond suit. Alt + clic sur la pastille : retour à la couleur de fond de la comp (pastille en pointillés).
- [ ] **Format** : 16:9 allumé sur une comp 1920 × 1080 (taille affichée à droite du titre). 9:16 : comp en 1080 × 1920, tout le contenu reste centré, à toutes les images (keyframes décalées, aucune créée), calque verrouillé recentré et toujours verrouillé, caméra à deux nœuds (position et point ciblé) ; un seul Ctrl+Z. 4:5 → 1080 × 1350, 1:1 → 1080 × 1080. Changer de comp puis survoler le panneau : le format allumé suit.
- [ ] **Afficher la source dans le Projet** : un calque image sélectionné : sa source est sélectionnée et montrée dans le panneau Projet (dossier ouvert, défilement) ; noter si After Effects en français trouve la commande (sinon seulement sélectionnée, sans défilement). Calque texte : listé « pas de source ».
- [ ] **Convertir les textes PSD** : dans la comp du PSD, rien de sélectionné : les textes deviennent des calques texte modifiables (police, contenu), l'image est listée « pas un calque texte Photoshop » ; un seul Ctrl+Z. After Effects en français : noter si la commande est trouvée par son nom. Un seul calque texte sélectionné : lui seul.
- [ ] Dernier geste cerclé de bleu, Entrée le rejoue ; Réglages › Raccourcis, groupe « Boîte à outils » : 12 gestes ; donner une touche à « Copier la frame » et la frapper.
- [ ] Panneau isolé « SIMING – Boîte à outils » : identique ; à 200 px de large, rien n'est rogné, les libellés longs passent sur deux lignes.
