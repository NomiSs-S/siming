# Checklist de tests manuels dans After Effects

À dérouler avant chaque Release. Noter résultats et anomalies dans `docs/SUIVI.md`.

Préparer une comp « Rig » : `Parent` ; trois enfants `A`, `B`, `C` ; un petit-enfant
`C1` parenté à `C` ; un calque `Libre` ; une position animée sur `B`. Une seconde comp
« Autre » : `Tete` avec deux enfants `Oeil_G`, `Oeil_D`.

## Installation

- [ ] `tools/dev-install` (Windows et macOS) : SIMING apparaît dans Fenêtre › Extensions après redémarrage d'AE.
- [ ] macOS, `tools/dev-install.command` : `~/Library/Application Support/Adobe/CEP/extensions/com.siming` est un vrai dossier (pas un lien), sans fichier `._*` ; éjecter le disque KINGSTON, redémarrer AE : SIMING est toujours là.
- [ ] Release signée installée avec l'installeur (Windows et macOS) : le menu de versions s'affiche, « Entrée » installe la dernière, la version installée est indiquée au lancement suivant.
- [ ] Retour à une version précédente avec l'installeur : la version choisie est bien installée.
- [ ] AE ouvert pendant l'installation : l'installeur demande de le fermer.
- [ ] Windows : `SIMING-Installer-Windows.bat` lancé depuis un dossier dont le nom contient une apostrophe (ex. `C:\Users\…\l'atelier`) : l'installeur démarre normalement.
- [ ] macOS 15 (Sequoia) ou plus : premier lancement de `SIMING-Installer.command` refusé, puis **Réglages Système › Confidentialité et sécurité › Ouvrir quand même** : l'installeur s'ouvre (procédure de `docs/INSTALLATION.md`).
- [ ] macOS : `SIMING-Installer.command` fonctionne avec le `/bin/bash` 3.2 livré par Apple (liste des versions lue par le heredoc dans `$(...)`).
- [ ] Installeur (extraction du `.zxp` depuis la 1.4.0), **sans** PlayerDebugMode (Windows : `HKCU\Software\Adobe\CSXS.12`, clé `PlayerDebugMode` absente ou 0 ; macOS : `defaults delete com.adobe.CSXS.12 PlayerDebugMode`) et sans être connecté à Creative Cloud : SIMING s'ouvre (signature acceptée).
- [ ] Machine où une ancienne version avait été installée par UPIA (dossier `Common Files\Adobe\CEP\extensions\com.siming` ou `/Library/Application Support/Adobe/CEP/extensions/com.siming`) : l'installeur la retire (autorisation ou mot de passe demandé), un seul SIMING dans Fenêtre › Extensions.

## Hub

- [ ] Fond, rail horizontal (48 px), icônes nettes, outil actif bleu avec trait bas, Réglages à droite, statut en bas avec `v1.0.0`.
- [ ] Première ouverture (installation neuve, ou après avoir effacé les réglages du panneau) : Quick Tools affiché, premier du rail, touche 1 ; puis Boîte à outils, Unparent, Libellés. Un ordre déjà réglé à la main reste le même après mise à jour.
- [ ] Panneau étroit (≈ 260 px) : rien ne déborde ; avec plusieurs outils, le menu « … » apparaît.
- [ ] Panneau très étroit (ancré à 180–220 px de large) : **rien n'est rogné à droite** ; les aides de section passent sous leur titre, Ancrage au-dessus d'Aligner (Quick Tools), Répartir en 3 colonnes, couleur d'une nature sous son nom (Libellés › Règles), touche d'un raccourci sous son libellé (Réglages), boutons de la Boîte à outils l'un sous l'autre ; quand l'outil affiché est rangé dans « … », « … » est allumé en bleu.
- [ ] Barre de défilement (panneau court, Réglages › Raccourcis, récapitulatif de Libellés) : fine, grise, arrondie, sans flèches ; plus épaisse au survol, plus claire quand on la tient ; plus de barre claire de Windows.
- [ ] Touches 1…n (rangée de chiffres, avec ou sans Maj en AZERTY) changent d'outil dans l'ordre du rail (pas dans un champ) ; infobulle du rail « Nom (1) ».
- [ ] Réglages : cinq onglets Outils / Raccourcis / Général / Import PSD / Claude, le dernier ouvert est retrouvé après fermeture/réouverture. Général : outil au lancement (menu déroulant lisible en thème sombre) respecté après réouverture ; « À propos » liste les versions.
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

- [ ] Barres de lissage (1.3.1) : glisser n'importe où (saut au clic) donne 5, 10… 100 ; Maj enfoncée pendant le glissé : à l'unité, sans saut ; molette et flèches de 5 en 5 (33 → 35 → 40), Maj : ±1. Clic simple : appliqué une fraction de seconde après. **Double-clic** : la saisie s'ouvre sur la valeur d'avant, **rien n'est appliqué** (un seul groupe dans l'historique après saisie de 37 + Entrée) ; Échap annule. Alt + clic = 33. Valeurs retrouvées après fermeture/réouverture.
- [ ] Aligner (1.3.1) : un seul calque sélectionné, mode **Sélection**, « Aligner à gauche » : collé au bord gauche de la composition (statut « … de la composition »).
- [ ] Première keyframe de `A` sélectionnée, picto « Entrée » à 75 % : le **départ du mouvement** est lissé (éditeur de graphiques : Bézier, vitesse 0, influence 75 sur le côté sortant de la keyframe, côté entrant inchangé ; icône de keyframe : moitié droite arrondie) ; statut « 1 keyframe lissée, entrée 75 % » ; un seul Ctrl+Z (« Quick Tools : lisser »). Dernière keyframe, picto « Sortie » : l'arrivée est lissée (côté entrant).
- [ ] Relâcher la barre « Les deux » applique aussi. Keyframes d'échelle (2D) : les deux dimensions reçoivent l'influence. Keyframe en maintien : ignorée et listée dans le dialogue.
- [ ] Rien de sélectionné : « Aucune keyframe sélectionnée », rien ne change.
- [ ] Position de `A` sélectionnée, « Appliquer Elastic » : effet « Elastic Controller » (20 / 40 / 60) sur `A` seul, même si `B` était aussi sélectionné ; sélection de calques rétablie après coup ; expression active, rebond visible après la dernière keyframe. Second clic : l'effet n'est pas doublé.
- [ ] Croix « Retirer Elastic » : expression vidée, effet retiré si plus aucune propriété du calque ne le cite (en garder une pour vérifier le contraire).
- [ ] `C` (tourné, 150 %) sélectionné, case 9 du carré puis touche 9 du pavé numérique : l'ancrage va en haut à droite de la boîte, le calque ne bouge pas à l'écran ; `D` parenté suit sans bouger. Touche 9 de la rangée de chiffres : rien (ou changement d'outil si un 9e outil existe). Case mémorisée.
- [ ] `A` (position animée, deux keyframes) sélectionné, case 5 : les deux keyframes de position sont décalées, **aucune keyframe créée**, `A` ne bouge à aucune image (parcourir la timeline) ; tracé de mouvement et tangentes conservés. `B` (échelle animée) : idem, chaque keyframe compensée avec l'échelle de son instant. Ancrage lui-même animé : ses keyframes décalées d'autant.
- [ ] Calque texte, forme, solide, précomposition : boîte correcte pour l'ancrage (noter les écarts, surtout précomposition). Caméra sélectionnée : « pas de boîte visible », listée.
- [ ] **Masques** : image 1920 × 1080 avec un masque rectangulaire (mode Ajouter) sur son quart haut droit, case 5 : l'ancrage va au centre du **masque**, pas de l'image ; cases 7 et 3 : coins du masque. Masque courbe (ellipse) : bords de l'ellipse. Deux masques Ajouter : boîte des deux ; Ajouter puis Intersection : leur partie commune ; Soustraire seul : toute l'image ; masque inversé : toute l'image ; étendue du masque à +20 : boîte agrandie de 20. Masque animé : boîte à l'instant courant. Aligner à gauche avec ce calque : son bord visible sert de référence. Noter : contour progressif, matte de piste (non pris en compte).
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
- [ ] Mot seul (1.3.1) : règle « fond* », calques `Fond`, `FOND`, `fond_txt`, `fond 2` : seuls `Fond` et `FOND` vont dans le groupe « fond* ». Le dossier de projet « Fond » compte aussi (comme pour les autres mots-clés).
- [ ] Priorité (1.3.1) : onglet Règles, glisser la poignée d'un mot-clé tout en haut (puis ↑ ↓ au clavier, focus sur la poignée) : l'ordre est gardé après fermeture d'AE ; retour à Calques : ré-analyse, un calque qui répond à deux règles prend celle du haut.
- [ ] Panneau isolé « SIMING – Libellés » : identique ; à 260 px de large, rien ne déborde (pastilles nommées des natures, sélecteur, poignées des mots-clés).

## Boîte à outils (1.3.0)

Préparer dans « Rig » (1920 × 1080) : trois calques `A`, `B`, `C` animés en position (deux keyframes chacun, une en Bézier avec un ease et une tangente tirée à la main), un calque verrouillé, une caméra à deux nœuds, un PSD importé en composition (calques conservés) qui contient au moins deux textes et une image. Touche 2 : l'outil s'affiche.

- [ ] **Copier la frame** : Préférences › Scripts et expressions › « Autoriser les scripts à écrire des fichiers… » **décochée** : message orange qui dit quoi cocher. Cochée : statut « Frame 1920 × 1080 copiée dans le presse-papier » ; coller dans Slack, un mail, Photoshop, Paint (Windows) / Aperçu › Nouveau depuis le presse-papier (macOS) : l'image de la tête de lecture. Noter : temps de rendu sur une comp lourde, résolution obtenue en Demi / Quart, transparence (comp sans fond) dans Photoshop, et si une fenêtre noire apparaît un instant (elle ne devrait pas : la copie passe par Node du panneau).
- [ ] **Séquencer, un seul bouton** : modes en pictos (calques en escalier qui descend, qui monte, en désordre ; nom au survol), le bouton montre le picto du mode choisi ; keyframes sélectionnées sur 2 calques = elles sont séquencées, sinon les calques ; rien d'utilisable : « Sélectionne au moins 2 calques, ou des keyframes sur 2 calques ».
- [ ] **Séquencer des calques** : sélectionner `A`, `B`, `C` (dans cet ordre, sans keyframe sélectionnée), Écart 5, Cascade : `B` part 5 images après `A`, `C` 10 images après ; keyframes déplacées avec leur calque ; un seul Ctrl+Z. Inverse : `C` d'abord. Aléatoire : chaque clic donne un nouvel ordre, toujours tous les 5 images. Paquets 2 : `A` et `B` ensemble, `C` 5 images après. Calque verrouillé : listé dans « Éléments ignorés ». Calques rognés (point d'entrée ≠ début) : c'est le point d'entrée qui s'aligne.
- [ ] **Séquencer des keyframes** : sélectionner les keyframes des trois calques, Cascade, Écart 5 : chaque calque décalé de 5 images ; dans l'éditeur de graphiques, l'ease, la tangente tirée à la main, l'interpolation (linéaire / Bézier / maintien), les keyframes « déplacement libre » et leur couleur sont conservés ; les keyframes restent sélectionnées (relancer avec Inverse fonctionne). Un seul calque, keyframes de Position et d'Échelle sélectionnées : décalées propriété par propriété. Keyframe déplacée sur une keyframe non sélectionnée : statut orange « 1 keyframe remplacée ». Source Text (texte animé) : noter si ça marche.
- [ ] **Null relié** : `A` et `B` sélectionnés : null « Contrôle » au centre de leurs boîtes, juste au-dessus du plus haut, de la durée des deux, seul sélectionné ; déplacer le null entraîne `A` et `B`, rien n'a sauté. `A` et `B` enfants d'un même parent `P` : le null devient enfant de `P`, la hiérarchie tient. Calques 3D : null 3D. Rien de sélectionné : null au centre de la comp. Noter la couleur d'étiquette obtenue.
- [ ] **Fond** : pastille › sélecteur de couleur du système, choisir une couleur : la pastille la montre (gardée après fermeture d'AE) ; « Fond » posé tout en bas, de la taille de la comp ; changer la taille de la comp (Composition › Paramètres) : le fond suit. Alt + clic sur la pastille : retour à la couleur de fond de la comp (pastille en pointillés).
- [ ] **Format** : 16:9 allumé sur une comp 1920 × 1080 (taille affichée à droite du titre). 9:16 : comp en 1080 × 1920, tout le contenu reste centré, à toutes les images (keyframes décalées, aucune créée), calque verrouillé recentré et toujours verrouillé, caméra à deux nœuds (position et point ciblé) ; un seul Ctrl+Z. 4:5 → 1080 × 1350, 1:1 → 1080 × 1080. Changer de comp puis survoler le panneau : le format allumé suit.
- [ ] **Afficher la source dans le Projet** : un calque image sélectionné : sa source est sélectionnée et montrée dans le panneau Projet (dossier ouvert, défilement) ; noter si After Effects en français trouve la commande (sinon seulement sélectionnée, sans défilement). Calque texte : listé « pas de source ».
- [ ] **Convertir les textes PSD** : dans la comp du PSD, rien de sélectionné : les textes deviennent des calques texte modifiables (police, contenu), l'image est listée « pas un calque texte Photoshop » ; un seul Ctrl+Z. After Effects en français : noter si la commande est trouvée par son nom. Un seul calque texte sélectionné : lui seul.
- [ ] **Exporter en PNG** : projet jamais enregistré : message orange. Projet enregistré : `Frames/<comp>_<image>.png` à côté du `.aep`, numéro d'image = celui du timecode affiché ; ré-exporter la même image remplace le fichier. Alt + clic : la frame est aussi montrée, sélectionnée, dans l'Explorateur / le Finder, sans fenêtre noire. Nom de comp avec « : » ou « / » : fichier quand même (caractères remplacés).
- [ ] **Décliner dans les 3 autres formats** (comp 1920 × 1080 « Pub ») : trois compos « Pub 4x5 », « Pub 1x1 », « Pub 9x16 » à côté de l'original, sélectionnées dans le panneau Projet, contenu centré à toutes les images, parentés intactes ; l'original n'a pas bougé et reste ouvert ; un seul Ctrl+Z les supprime. Alt + clic sur la case 9:16 : une seule copie. Noter si les précompos imbriquées sont partagées (attendu) et le dossier des copies.
- [ ] **Zone de travail › Sur la sélection** : de l'entrée du premier calque à la sortie du dernier. **Rogner la durée** (zone de 2 s à 7 s) : durée 5 s, la timeline commence à 0:00:02:00 (comme Composition › Rogner la composition à la zone de travail d'AE : comparer avec la commande native et noter toute différence), calques et keyframes à la même place par rapport au timecode, calque verrouillé compris ; marqueur de comp avant la zone : listé « retiré ». Un seul Ctrl+Z.
- [ ] **Recadrer l'image** : sélectionner un logo au milieu d'une comp 1920 × 1080 : la comp prend exactement la taille de sa boîte visible (calque tourné : son rectangle englobant), rien ne bouge à l'image, les autres calques suivent ; un seul Ctrl+Z. Deux calques éloignés : la boîte des deux. Caméra seule : message. Calque qui dépasse de la comp : la comp s'agrandit (noter si c'est gênant).
- [ ] **Aide** (point d'interrogation) des quatre outils : fiches avec picto ou numéro, nom en gras, une phrase, touches en pastilles (Alt + clic, Entrée…) ; défile si besoin ; Échap, Entrée, clic dehors ou « Compris » ferment ; lisible à 220 px.
- [ ] **Alt + clic sur Afficher la source** : image ou vidéo sélectionnée : son fichier sélectionné dans l'Explorateur / le Finder ; fichier manquant : son dossier ouvert (statut orange) ; texte ou forme : message.
- [ ] **Convertir les expressions en keyframes** : position avec `wiggle(2, 50)` sélectionnée : une keyframe par image sur la durée du calque, le mouvement est identique, l'expression est désactivée (texte gardé, réactivable) ; un seul Ctrl+Z. Calque sélectionné sans propriété : toutes ses expressions. Opacité à expression constante : 2 keyframes. Expression en erreur : listée, laissée telle quelle. Source Text animé par expression : noter le résultat. Comparer avec Animation › Assistant d'images clés › Convertir l'expression en images clés.
- [ ] Dernier geste cerclé de bleu, Entrée le rejoue (variante Alt comprise) ; Réglages › Raccourcis, groupe « Boîte à outils » : 23 gestes ; donner une touche à « Copier la frame » et la frapper.
- [ ] Panneau isolé « SIMING – Boîte à outils » : identique ; à 200 px de large, rien n'est rogné, les libellés longs passent sur deux lignes.

## Claude Code (1.4.0)

Il faut Claude Code installé (`claude` dans un terminal). Projet de test : la comp « Rig ».

- [ ] Après `tools/dev-install` (ou l'installeur) et redémarrage d'AE : rien de nouveau dans Fenêtre › Extensions (le service `com.siming.mcp` est invisible) ; Réglages du hub : cinq onglets Outils / Raccourcis / Général / Import PSD / **Claude**, lisibles à 260 px.
- [ ] Onglet Claude : **Éteint** par défaut, pastille grise « Éteint : … », pas de commande affichée. **Activé** : statut vert « Claude Code peut agir… », état « Démarrage du service… » puis, en 2 s au plus, pastille verte « Actif sur cet ordinateur, port 47821 ». Le fichier `claude.json` existe dans `~/Library/Application Support/SIMING/` (macOS) / `%APPDATA%\SIMING\` (Windows). Noter si l'état reste sur « Démarrage » ou passe à « Service introuvable ».
- [ ] **Copier la commande** : statut « Commande copiée » ; la coller dans Terminal (macOS), PowerShell et Invite de commandes (Windows) : « Added HTTP MCP server siming » ; `claude mcp list` : `siming` connecté (✓).
- [ ] Démarrage du service sans le hub : activé, quitter AE, le relancer **sans ouvrir le panneau SIMING**, puis `claude mcp list` : noter si `siming` est connecté (After Effects lance-t-il seul l'extension invisible ?). Sinon, ouvrir le hub une fois : connecté dans les 2 s.
- [ ] Dans Claude Code : « Quelle est la comp active et ses calques ? » : réponse juste (get_comp). « Crée un texte "Bonjour" centré qui apparaît en fondu sur 1 s » : le texte est là ; Édition montre « Annuler Claude : … » ; **un seul** Ctrl+Z (Cmd+Z) retire tout. La ligne de statut du hub affiche « Claude : … » à chaque action, le compteur d'appels monte.
- [ ] « Regarde la frame à 1 s » : Claude décrit l'image juste (capture_frame) ; préférence « Autoriser les scripts à écrire des fichiers… » décochée : message qui dit quoi cocher. Noter le délai et la taille de l'image reçue sur une comp 4K.
- [ ] Gestes : sélectionner des keyframes, « lisse les keyframes sélectionnées à 60 % en entrée et en sortie » : siming_tool (quicktools / ease), même résultat que dans Quick Tools ; « ajoute un null relié aux calques sélectionnés ».
- [ ] Erreur : demander un script qui échoue à mi-chemin : Claude reçoit l'erreur avec sa ligne, ce qui a été fait reste et s'annule d'un Ctrl+Z.
- [ ] After Effects occupé : ouvrir Composition › Paramètres de composition (fenêtre modale) puis demander quelque chose à Claude : après 60 s, « After Effects n'a pas répondu… » ; fermer la fenêtre : noter si l'action part ensuite.
- [ ] **Éteint** : la pastille redevient grise ; dans Claude Code, l'appel suivant échoue (connexion refusée) ; `/mcp` montre `siming` en échec. Réactivé : `/mcp` › reconnecter.
- [ ] **Nouveau jeton** : statut orange, la commande change ; Claude Code échoue (403) jusqu'à `claude mcp remove --scope user siming` puis la nouvelle commande.
- [ ] Port pris : avant de lancer AE, `python3 -m http.server 47821 --bind 127.0.0.1` ; onglet Claude : pastille rouge « Port 47821 déjà pris… » et bouton **Changer de port** ; un clic : nouveau port, nouvelle commande, service actif.
- [ ] Sécurité : `curl -i -X POST http://127.0.0.1:47821/mcp -d "{}"` (sans jeton) : 403 ; depuis un autre ordinateur du réseau : connexion impossible.
- [ ] Panneaux Unparent ouverts pendant que Claude agit : rien ne casse (le service recharge `siming.jsx` à son démarrage, comme chaque panneau).

## Importer les PSD (Boîte à outils 1.1.2)

À faire sur une **copie** d'un projet client de référence, `PROJET_CLIENT` (`02_RESSOURCES/02_ASSET` avec 7 planches ; jamais l'original : le geste ajoute des compositions et des calques). Il faut un After Effects où l'on a le droit d'écrire dans le projet. Touche 2 : la Boîte à outils s'affiche ; le geste est dans la section Calques, aide (point d'interrogation) : fiche « Importer les PSD ».

Tests automatiques sur une planche réelle : `SIMING_PSD_SAMPLES=<dossier contenant 7.psd> node tests/run.js` ; sans cette variable, ces tests sont sautés.

**Liste**
- [ ] Clic sur « Importer les PSD » : la boîte est remplacée par la liste (titre, icône Réglages, carte du dossier, case « Tous les PSD », bouton « Importer N PSD », Annuler). Dossier montré = `02_RESSOURCES/02_ASSET` trouvé depuis le `.aep` ; **7 PSD** listés dans l'ordre naturel (`1.psd`, `2.psd`, … `7.psd`). Ceux déjà dans le projet : décochés, pastille « déjà importé ». Projet jamais enregistré, ou dossier introuvable : liste vide et statut « … choisis le dossier des PSD » (info / orange) ; la carte du dossier, en pointillés, dit pourquoi (« Projet non enregistré », « 02_RESSOURCES/02_ASSET introuvable depuis le projet » ou le réglage en vigueur, « Dossier introuvable » pour un dossier choisi à la main qui a disparu) ; un clic dessus permet de choisir le dossier.
- [ ] Échap, Annuler : la boîte revient, la ligne de statut est vidée (aucun « annulé » : rien n'avait commencé). Clic sur la carte du dossier : la boîte de dialogue s'ouvre sur le dossier courant (`selectDlg`) ; choisir un autre dossier le liste ; Annuler dans la boîte de dialogue ne change rien. « Importer 0 PSD » : bouton inactif.

**Import de `7.psd` seul** (les autres décochés)
- [ ] Statut « 1 PSD importé · t texte(s) · f forme(s) · Ctrl+Z pour annuler », sans mention des refus voulus. Compo et dossier « 7 Calques » rangés dans `02_ASSET` du panneau Projet, pas à la racine. **Noter** où `importFile` les met d'abord (racine, ou dossier sélectionné dans le Projet). L'import range dans tous les cas tout élément neuf dont le parent n'est pas neuf : refaire l'essai avec un dossier du Projet sélectionné, plus rien ne doit y rester.
- [ ] « Rectangle » recréé en calque de forme : coin arrondi **59**, lueur externe **copiée du calque PSD** (mêmes réglages : ouvrir Styles de calque sur la forme et sur l'original, comparer taille, opacité, mode ; plus aucune table de réglages dans SIMING). Il recouvre **exactement** l'original : alterner Ctrl+Z / Ctrl+Maj+Z et comparer (même boîte, au pixel, rien ne saute). La lueur a la taille de Photoshop. Remplissage et contour de la forme sont à **100 %** (l'opacité du fond est dans les options de fusion copiées).
- [ ] Textes convertis en calques texte modifiables (police, contenu) ; libellés posés (texte jaune, forme bleue…, selon les règles de l'outil Libellés).
- [ ] **Annulation** : un seul Ctrl+Z défait tout (compo, dossiers, formes, textes, libellés). Sinon, **consigner** qu'il en faut deux (les conversions, puis l'import) : repli prévu par la spec, à indiquer dans le statut.
- [ ] Après coup : une compo ouverte dans un onglet de la Timeline par compo traitée (précompos de groupes comprises) ; la compo qui était active au départ est rouverte. **Noter** si c'est gênant.
**Styles de calque copiés (Copier / Coller, identifiants 19 et 20)**
- [ ] Les styles de la forme sont **ceux du calque PSD** : lueur externe de « Rectangle » ; « etoile » : lueur externe **et** incrustation couleur. Comparer chaque réglage (mode, couleur, opacité, taille, étendue, angle, altitude) à l'original dans Calque › Styles de calque. Aucun réglage n'a été recopié à la main : s'il diffère, c'est le collage.
- [ ] Un calque PSD **sans style** : la forme n'en a pas, remplissage et contour à l'opacité du fond de Photoshop. Un calque **avec style et fond à moins de 100 %** : la forme a remplissage et contour à **100 %** et les options de fusion copiées donnent le même aspect que l'original (l'opacité du fond ne s'applique pas deux fois).
- [ ] **Presse-papiers** : après l'import, il contient les styles du dernier calque copié (accepté). La **sélection** de calques de la compo qui était ouverte est inchangée ; aucune propriété ne reste sélectionnée.
- [ ] **Compo active** : la commande agit sur la compo ouverte dans le viewer (la compo traitée est ouverte avant). Noter si un style atterrit sur un calque d'une autre compo. Si le collage ne donne rien (visualiseur verrouillé, focus ailleurs…), la forme est comptée « en erreur » et le calque PSD reste, forme à demi faite retirée.
- [ ] Un seul Ctrl+Z défait aussi les collages de styles (sinon : consigner combien il en faut).
- [ ] After en français : la conversion en texte est trouvée par son nom (« Convertir en texte modifiable »). Sinon, le statut dit « textes non convertis (commande introuvable dans cette langue d'After Effects) » : le noter. Les styles, eux, n'en dépendent plus (identifiants numériques).
- [ ] Précompos recadrées : un calque à ombre portée ou lueur externe dans un groupe ne voit pas son ombre coupée (le recadrage compte les groupes `dropShadow/enabled`, `outerGlow/enabled`, `bevelEmboss/enabled`, `frameFX/enabled` actifs).

**Planche test** (`tests/fixtures/psd/planche-test.psd`, 1920 × 1080)
- [ ] Le carré tourné à 45° est recréé en forme (rotation autour de son centre, mêmes sommets que l'original).
- [ ] Les deux rectangles de « Rectangle 3 » (dans « Groupe 1 ») : recréés tous les deux, au bon rang parmi les homonymes, aucun ne remplace l'autre.
- [ ] L'**ellipse en dégradé** (« Ellipse 1 », bleu vers gris à 129°) est recréée : forme + effet **Dégradé** (Effets › Dégradé) réglé en linéaire, départ au sens du dégradé de Photoshop, arrivée à l'opposé. Comparer à l'original : même sens, mêmes couleurs aux extrémités, un lissage légèrement plus doux sur l'original (écart d'une dizaine de niveaux, accepté). La **planche test donne 6 formes** (Ellipse 1 comprise). Rectangle arrondi, polygone : recréés. Texte « PourQUOI ??? » : converti. Aucun refus voulu n'apparaît dans le statut.
- [ ] **Dégradés laissés en PSD** : un dégradé radial, à trois couleurs, avec transparence, ou une forme à dégradé **et** contour : le calque PSD reste, sans message.
- [ ] **Satin** : un calque à satin (contour par défaut de Photoshop) : la forme est recréée avec le satin d'After copié, plus aucun refus lié aux styles. Comparer le rendu à l'original (même satin ?) et **consigner** tout écart.
- [ ] **Deux ombres portées** sur un même calque (effets multiples) : la forme est recréée et ses styles sont ceux d'After (copiés), sans message : vérifier que les deux ombres sont présentes.
- [ ] **Taille du métrage** : si le métrage d'un calque importé n'a ni la taille de la boîte du PSD ni celle du document, la forme n'est pas posée et le statut dit « 1 forme en erreur » (rien de tel attendu : After n'inclut pas les styles dans les pixels). La fenêtre « Éléments ignorés » dit le fichier, le calque et les deux tailles.
- [ ] **Fond plus grand que la planche** (un calque de pixels uni qui déborde du document) : recréé en rectangle plein, sans « forme en erreur ». **Noter** la taille que prend son métrage dans After (rogné au document, ou boîte entière) : le code accepte les deux.
- [ ] **Compo active** : pendant l'import, cliquer dans un autre panneau ou verrouiller le visualiseur ; si la compo traitée n'est pas devenue la compo active, le PSD reste importé, les formes et textes de cette compo sont sautés (statut orange « N avertissements », raison « Compo non active dans le visualiseur » dans la fenêtre « Éléments ignorés ») et rien n'est lancé sur une autre compo (vérifier que la compo de départ n'a pas bougé).
- [ ] Autres refus voulus : un calque détouré ou masqué, la base d'un détourage, un rectangle dont un point a été déplacé à la main (recréé en tracé), un contour intérieur / extérieur : calque PSD laissé tel quel, ni message ni forme en erreur.

**Lot et erreurs**
- [ ] Les 7 PSD d'un coup : statut « 7 PSD importés · … » (pluriels corrects), un seul Ctrl+Z (ou deux : consigner), durée raisonnable ; progression « Lecture des PSD… (3 / 7) » puis « Import des PSD… » visible. Réimporter `7.psd` : seconde copie (jamais de remplacement), la liste le marque « déjà importé » mais le laisse cochable.
- [ ] Un fichier `.psd` qu'After refuse (renommer un `.txt`) dans le lot : les autres sont importés, statut orange « · 1 PSD illisible » (« 2 PSD illisibles » au pluriel), rien de ce PSD ne reste dans le projet, et la fenêtre « Éléments ignorés » donne son nom et la raison. Un PSD qu'After importe mais que SIMING ne sait pas lire (un PSB renommé en `.psd`, un fichier tronqué) : importé quand même, sans formes, « · 1 avertissement » et la raison dans la fenêtre ; ses textes et libellés sont faits.
- [ ] Un calque texte **verrouillé** dans Photoshop (si After reporte le verrou) : non converti, signalé dans la fenêtre (« Titre : calque verrouillé »). La forme recréée garde l'**étiquette** du calque PSD (étape « libellés » coupée : même étiquette que l'original).
- [ ] Un calque verrouillé recréé en forme : le nouveau calque est aussi verrouillé, l'original a disparu.
- [ ] Panneau isolé « SIMING – Boîte à outils » : la liste tient à 200 px de large, le dernier nom ne déborde pas.

**Sous-dossiers et réglages de l'import** (1.5.2)

À faire sur une copie de `PROJET_CLIENT` dont `02_RESSOURCES/02_ASSET` contient aussi des sous-dossiers : `VIDEO_A/VERSION_1`, `VIDEO_A/VERSION_2` et `VIDEO_B`, chacun avec un ou deux PSD, plus un dossier caché (`.cache`) et un `._1.psd` (Mac).
- [ ] La liste montre d'abord les PSD de la racine (intitulé = nom du dossier lu), puis un intitulé gris par sous-dossier (`VIDEO_A/VERSION_1`, `VIDEO_A/VERSION_2`, `VIDEO_B`, ordre naturel) au-dessus de ses PSD. Les intitulés n'ont pas de case ni de survol ; ni `.cache` ni `._1.psd` n'apparaissent. La case « Tous les PSD » et le compte portent sur tous les PSD, le statut dit « N PSD trouvés ». Un dossier sans sous-dossier : liste plate, sans intitulé.
- [ ] Importer des PSD de plusieurs sous-dossiers : dans le panneau Projet, `02_ASSET/VIDEO_A/VERSION_1`, `…/VERSION_2`, `02_ASSET/VIDEO_B` sont créés ; chaque compo et son dossier « <nom> Calques » sont dans le dossier de son PSD. Ceux de la racine restent dans `02_ASSET`. Un second import : les dossiers existants sont réutilisés (aucun « VIDEO_A » en double). Un seul Ctrl+Z défait tout, dossiers créés compris.
- [ ] Réglages › **Import PSD** (cinq onglets : l'onglet apparaît entre Général et Claude) : Dossier des PSD `02_RESSOURCES/02_ASSET`, Chutier de dépose `02_ASSET`, cinq étapes cochées. Entrée ou sortie du champ enregistre ; une valeur vide, absolue (`/x`, `C:/x`), avec `..` ou un caractère interdit (`a:b`) est refusée : message orange sur la ligne de statut, le champ retrouve sa valeur. « Rétablir » remet tout.
- [ ] Chutier `Import/PSD` : le prochain import crée `Import > PSD > …` (et plus rien dans `02_ASSET`). Dossier des PSD changé (`02_RESSOURCES/Autre`) : la liste ouverte est relue au retour dans la Boîte à outils ; un dossier choisi à la main (clic sur la carte) n'est pas remplacé. Ouvrir un autre projet sans fermer After, puis la liste : les PSD sont ceux du nouveau projet (le dossier trouvé automatiquement n'est pas gardé).
- [ ] Choisir à la main un dossier très haut (`C:\` ou le dossier personnel) : la lecture s'arrête (statut orange « lecture arrêtée après 3000 éléments : choisis un dossier plus précis »), After ne se fige pas.
- [ ] L'icône Réglages en haut de la liste (infobulle « Réglages de l'import ») ouvre Réglages sur l'onglet Import PSD ; la liste reste ouverte au retour. Dans le panneau isolé « SIMING – Boîte à outils » : pas d'icône.
- [ ] Étapes coupées une à une, sur un PSD de référence : sans « textes », aucun texte converti et pas de « · N textes » dans le statut ; sans « formes », les calques PSD restent (et les PSD ne sont pas lus : import plus rapide, pas de « Lecture des PSD… ») ; sans « libellés », étiquettes laissées ; sans « recadrer », précompos à la taille de la planche ; sans « ancres », ancres où After les met. Les autres étapes se font normalement.
