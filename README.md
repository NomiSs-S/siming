# SIMING

Outils pour Adobe After Effects, réunis dans un panneau : un rail d'outils, une
vue par outil, une ligne de statut commune. Chaque outil peut aussi s'ouvrir seul
dans son propre panneau.

> Version 1.3.0 : extension CEP pour After Effects 2024 et plus (Windows, macOS).

| Outil | Version | Rôle |
|---|---|---|
| Quick Tools | 1.0.1 | Lisser les keyframes, expression Elastic, point d'ancrage, aligner et répartir (sur la partie visible, masques compris) |
| Boîte à outils | 1.0.0 | Frame (copier, exporter), séquencer, null relié, fond, formats et déclinaisons, zone de travail, source, textes PSD, expressions en keyframes |
| Unparent | 2.0.0 | Détacher temporairement les enfants d'un calque, puis les rattacher |
| Libellés | 1.0.0 | Poser les couleurs d'étiquette d'après la nature et le nom des calques |

Quick Tools est le premier outil du rail (touche 1) et celui qui s'ouvre la première fois.
Le panneau se range même très étroit : ce qui ne tient plus côte à côte passe à la ligne.

## Installation

Télécharger l'installeur (Windows `SIMING-Installer-Windows.bat`, macOS
`SIMING-Installer-macOS.zip` qui contient `SIMING-Installer.command`), fermer After
Effects, double-cliquer. L'installeur propose la dernière version (ou une autre)
et l'installe. Pour mettre à jour : même geste. Détail : `docs/INSTALLATION.md`.

Ensuite : After Effects › Fenêtre › Extensions › **SIMING**.

## Unparent : principe

1. Sélectionner le parent dans la timeline, puis cliquer sur la **carte Parent**.
2. Le **gros bouton** détache tous les enfants, puis devient « Rattacher ».
3. **Clic sur une ligne** : détache ou rattache cet enfant seul.
4. **Filtre** Tous / Liés / Détachés ; **bandeau orange** tant qu'un enfant est détaché.
5. **En attente dans le projet** : les autres parents dont des enfants sont encore détachés.

Les enfants gardent leur position apparente ; chaque action s'annule d'un seul
Ctrl+Z. Un enfant détaché garde une balise `[UP|<id>|<nom du parent>]` en fin de
commentaire de calque : c'est sa mémoire, elle survit au redémarrage d'After
Effects et disparaît au rattachement. Ne pas la modifier à la main.

Limites : la compensation se fait à l'instant courant (un enfant animé peut sauter
sur d'autres images, comme dans AE) ; calques verrouillés ignorés et signalés ;
seuls les enfants directs sont traités.

## Quick Tools : principe

Quatre gestes sur la sélection de la timeline, un clic chacun, un Ctrl+Z chacun :

1. **Lissage de vitesse** : règle l'influence (Entrée, Sortie, Les deux), puis clique le
   picto de keyframe de la ligne ou relâche la barre : les keyframes sélectionnées passent en Bézier,
   vitesse 0, influence voulue sur ce côté. Entrée = le départ du mouvement (côté sortant
   de la keyframe), Sortie = son arrivée.
2. **Elastic** : « Appliquer Elastic » pose l'expression de rebond et l'effet « Elastic
   Controller » (Amplitude 20, Frequency 40, Decay 60, à régler dans le panneau Effets)
   sur les propriétés animées sélectionnées ; la croix les enlève.
3. **Point d'ancrage** : une case du carré 3 × 3 (ou 1 à 9 au pavé numérique) place
   l'ancrage des calques sélectionnés sur leur boîte visible, position compensée : rien
   ne bouge, à aucune image. Les keyframes d'ancrage et de position existantes sont
   décalées, aucune n'est créée.
4. **Aligner et répartir** : comme la fenêtre Aligner d'After Effects, par rapport à la
   sélection ou à la composition, sur les bords visibles (rotation, échelle et parents
   pris en compte).

Les boutons portent le verbe seul : la sélection n'est connue qu'au clic, la ligne de
statut dit ensuite combien d'éléments ont été traités. Le dernier geste est cerclé de bleu :
**Entrée** le rejoue sur la nouvelle sélection.

## Boîte à outils : principe

Des gestes moins fréquents, un clic et un Ctrl+Z chacun ; comme Quick Tools, le dernier geste
est cerclé de bleu et **Entrée** le rejoue.

1. **Frame** : l'image de la tête de lecture est rendue et **copiée** dans le presse-papier, prête à
   coller (Slack, mail, Photoshop), ou **exportée en PNG** à côté du projet, dans le dossier
   `Frames` (`Pub_00125.png` ; Alt + clic : et la montrer dans l'Explorateur / le Finder). After
   Effects doit autoriser les scripts à écrire des fichiers (Préférences › Scripts et expressions) ;
   le panneau le rappelle si besoin.
2. **Séquencer** : un picto par mode (Cascade, Inverse, Aléatoire), **Écart** (images entre deux
   départs), **Paquets** (combien partent ensemble), puis un seul bouton : les keyframes
   sélectionnées s'il y en a, sinon les calques. Le plus tôt reste en place. Les keyframes gardent
   leur ease, leurs tangentes et restent sélectionnées (on peut relancer).
3. **Null relié** : au centre des calques sélectionnés, juste au-dessus d'eux, relié à eux (la
   hiérarchie existante est gardée). **Fond** : calque de forme tout en bas, toujours à la taille de
   la compo ; sa couleur se choisit dans la pastille (Alt + clic : couleur de fond de la compo).
4. **Format de la compo** : 16:9, 4:5, 1:1, 9:16. Le plus petit côté est gardé (1920 × 1080 →
   1080 × 1920), le contenu reste centré, keyframes comprises. Le format en cours est allumé.
   **Décliner** crée une copie de la compo dans chacun des autres formats (`Pub 9x16`…), l'original
   ne change pas ; Alt + clic sur un format : une seule copie, dans ce format.
5. **Zone de travail** : la caler **sur la sélection**, **rogner la durée** de la compo à la zone de
   travail (comme la commande d'AE : le timecode de départ suit), ou **recadrer l'image** de la
   compo sur les calques sélectionnés (largeur et hauteur, rien ne bouge à l'image).
6. **Afficher la source dans le Projet** (Alt + clic : son fichier dans l'Explorateur / le Finder),
   **Convertir les textes PSD** en texte modifiable (sélection, sinon toute la compo) et
   **Convertir les expressions en keyframes** (une par image, expression désactivée, son texte gardé).

Alt + clic donne la variante d'un geste ; Entrée rejoue la variante choisie.

## Libellés : principe

Rien n'est automatique : l'outil propose, tu corriges, il pose.

1. **Sélection** ou **Composition**, puis clic sur la **carte** : chaque calque reçoit une
   couleur proposée.
2. Le **récapitulatif** groupe les calques par règle (À changer / Tous). **Appuie** sur une
   ligne : les couleurs s'ouvrent, glisse sur l'une d'elles et **relâche** (un seul geste) ; ou
   clique, puis clique la couleur. « Ne pas changer » écarte le calque. Clic sur la pastille d'un
   groupe : change la règle elle-même (gardée pour la suite) et relance l'analyse.
   **Plusieurs calques à la fois** : Ctrl + clic (ajouter / retirer), Maj + clic (plage), clic
   sur le nom d'un groupe (tout le groupe) ; appuyer sur une ligne sélectionnée colore toute la
   sélection. Échap désélectionne.
3. Le **bouton bleu** (« Appliquer 12 libellés », ou Entrée) pose les étiquettes : un seul Ctrl+Z.

Onglet **Règles** :
- **Mots-clés**, prioritaires, le premier de la liste gagne : mots entiers séparés par des
  virgules, cherchés dans le nom du calque, de sa source, de son fichier et des dossiers du
  projet qui la contiennent (majuscules, accents et pluriel ignorés). « logo » trouve
  `LOGO_client.png`, `logoClient` ou le dossier `Logos`, pas `logotype`. « .ai » vise
  l'extension du fichier. Un calque texte ne compte que par un nom donné à la main.
- **Par nature** : Texte, Forme, Vidéo, Image, Son, Solide, Nul, Réglage, Précompo, Caméra,
  Lumière, Autre ; chacune une étiquette ou « Ne pas changer ».

Par défaut : logo vert, fond / bg / background / arrière-plan rouge ; texte jaune, forme bleue,
vidéo fuchsia, image orange, solide et nul rouges. Couleurs et noms sont ceux des
Préférences › Étiquettes d'After Effects : les 16 étiquettes d'AE, pas de couleur libre.
Raccourcis réglables : Appliquer (Entrée), Analyser, Analyser et appliquer.

## Réglages

Le bouton Réglages du rail ouvre trois onglets, pensés pour beaucoup d'outils :

- **Outils** : la liste des outils du rail. Glisse la poignée d'une ligne pour changer
  l'ordre (ou ↑ ↓ au clavier sur la poignée) ; l'œil masque un outil du rail (il reste
  disponible en panneau isolé, et on ne peut pas tout masquer). Chaque ligne montre la
  touche de l'outil : les 9 premiers outils visibles ont 1 à 9. Un champ de recherche
  apparaît à partir de 7 outils.
- **Raccourcis** : recherche (action, outil ou touche), puis une touche par action
  (afficher un outil, rejouer le dernier geste, chaque geste de Quick Tools et de la Boîte à outils) ; clic sur
  la touche, puis frappe du nouveau raccourci : une touche seule ou une combinaison avec
  Ctrl, Alt, Maj (Cmd sur Mac), par exemple Ctrl + Alt + 5 ; Retour arrière = aucun,
  « Rétablir » pour revenir aux défauts. Le panneau réclame ses raccourcis à After Effects,
  qui sinon garderait les combinaisons pour lui.
- **Général** : outil au lancement (menu déroulant : dernier utilisé ou un outil
  précis) et « À propos ».

Le dernier onglet ouvert est retrouvé. Les raccourcis agissent quand le panneau a le focus ; ils sont repérés
par la touche physique, donc valables en AZERTY comme en QWERTY.

## Développement

```
node tests/run.js        # tests sans After Effects (faux AE, pont, vues)
```

Installation de développement : `tools/dev-install.bat` (Windows) ou
`tools/dev-install.command` (macOS), puis recharger le panneau après chaque
modification. Publication : `node tools/release.js` (voir le plan, Tâche 13).

Documentation : `CLAUDE.md` (conventions), `docs/SUIVI.md` (journal, pistes,
erreurs), `docs/NOTES-EXTENDSCRIPT.md` (pièges), `docs/CHARTE-GRAPHIQUE.md`,
`docs/design/icons.json` (tracés des icônes), `docs/superpowers/specs/` (specs).
