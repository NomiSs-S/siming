# Charte graphique SIMING (v2, CEP)

Référence visuelle de tous les outils. Maquettes : canevas « SIMING Tools — DA »
(https://claude.ai/artifact/XiZ4HWrNKuWiaYUXKGZhgQ), planches « Charte graphique »
et « Unparent v2 ». Implémentation : `extension/client/css/charte.css`.

Principe : **natif, dense, un seul bleu, tout tombe sous la souris**. Le panneau
doit ressembler à un panneau d'After Effects, en plus net. Le bleu ne sert qu'à
l'action principale, à l'outil actif et à la valeur sélectionnée.

## 1. Couleurs (variables CSS)

| Variable | Valeur | Usage |
|---|---|---|
| `--bg-deep` | `#161616` | séparateurs, contours de barre |
| `--bg-inset` | `#1B1B1B` | fond des champs, listes, segmentés |
| `--bg-bar` | `#1D1D1D` | rail d'outils, ligne de statut |
| `--bg-panel` | `#232323` | fond du panneau (suit la couleur de panneau d'AE) |
| `--bg-surface` | `#2C2C2C` | cartes, menus, outil actif, en-têtes de section |
| `--bg-control` | `#343434` | boutons secondaires |
| `--bg-hover` | `#2A2A2A` | survol d'une ligne |
| `--segment-on` | `#3E3E3E` | choix actif d'un segmenté |
| `--line` | `#3B3B3B` | bordures, pistes |
| `--text-strong` | `#EDEDED` | titres |
| `--text` | `#DADADA` | texte courant |
| `--text-muted` | `#9A9A9A` | titres de section, unités, statut |
| `--accent` | `#2A6FC0` | fond du bouton principal, case cochée |
| `--accent-hover` | `#3079CF` | survol du bouton principal |
| `--accent-press` | `#245FA6` | bouton principal appuyé |
| `--accent-text` | `#5AA6F5` | icône active, repère, lien |
| `--accent-soft` | `#2A3A4E` | ligne sélectionnée, pastille « lié » |
| `--ok` | `#63C285` | statut « fait » |
| `--warn` | `#E3A33B` | statut « attention », calque détaché |
| `--warn-soft` | `#3A2F1C` | bandeau et pastille « détaché » |
| `--error` | `#E5675B` | statut « erreur », champ invalide |

Désactivé : opacité 0,38. Contraste du texte ≥ 4,5:1 sur son fond.

## 2. Typographie

Police du système (`system-ui`, Segoe UI sous Windows, SF sous macOS) ; valeurs en
mono (`Consolas`, `ui-monospace`).

| Rôle | Taille / graisse | Couleur |
|---|---|---|
| Titre d'outil | 13 px, 600 | `--text-strong` |
| Titre de section | 10 px, 600, majuscules, +8 % d'espacement | `--text-muted` |
| Libellé, bouton, liste | 12 px, 400 | `--text` |
| Bouton principal | 13 px, 600 | blanc |
| Valeur numérique | 12 px mono | `--text` |
| Statut, aide | 11 px | `--text-muted` |

## 3. Ergonomie : tout tombe sous la souris

Règle n°1. On doit pouvoir enchaîner les outils vite, sans viser.

- **Aucune cible cliquable sous 32 × 30 px.**
- La zone cliquable est toujours plus grande que le dessin : toute la ligne d'une
  liste ou d'une case, toute la carte, toute la barre d'un curseur, toute la case du point 9.
- Pas de poignée de curseur à attraper : on glisse n'importe où dans la barre.
- Choix fréquents à un clic (segmentés, valeurs rapides) plutôt que dans un menu
  déroulant (réservé aux listes de plus de 4–5 choix).
- L'action principale est la plus grosse cible (40 px), toujours au même endroit.
- Un outil de gestes rapides (Quick Tools) n'a pas d'action principale : le dernier geste
  est cerclé `--accent-text` et Entrée le rejoue sur la nouvelle sélection.
- Raccourcis en bonus, jamais obligatoires (Entrée, chiffres du rail, molette, pavé numérique) ;
  chaque geste est une action nommée, réglable dans Réglages › Raccourcis clavier.

## 4. Mesures

| Élément | Valeur |
|---|---|
| Grille de base | 4 px |
| Marges du panneau | 12 |
| Entre contrôles / entre sections | 8 / 16 |
| Champ, menu, barre de valeur, segmenté | hauteur 30 (segment 26 dans un cadre de 30) |
| Ligne de liste | hauteur 32 |
| Bouton, bouton icône | hauteur 32 |
| Bouton principal | hauteur 40, pleine largeur |
| Carte cliquable | hauteur 56 |
| Rail d'outils | hauteur 48, boutons 44 × 40 |
| Ligne de statut | hauteur 24 |
| Rayon | 4 (pastilles : 9) |
| Largeur minimale à tenir | 260 |

## 5. Structure d'un panneau

De haut en bas :

1. **Rail d'outils horizontal** (48) : un bouton icône par outil ; l'actif en
   `--bg-surface`, icône `--accent-text`, trait bas de 2 px. Réglages poussés à
   droite. Débordement : bouton « … » qui ouvre la liste des outils restants.
2. **En-tête d'outil** : nom, puis à droite aide et « Ouvrir dans un panneau » (picto fenêtre).
3. **Sections** : titre en petites majuscules, compteur aligné à droite, contenu.
4. **Action principale** : verbe + quantité (« Détacher les 3 enfants »), actions
   secondaires dessous.
5. **Ligne de statut** (24) : pastille + message + version.

Dans un panneau isolé (« SIMING – <Outil> »), pas de rail ; le reste est identique.

## 6. Composants

| Composant | Règles |
|---|---|
| Bouton principal | Fond `--accent`, texte blanc ; survol `--accent-hover`, appui `--accent-press`, désactivé à 0,38. Au plus un par outil, aucun dans un outil de gestes rapides. |
| Bouton secondaire | Fond `--bg-control`, bordure `#444`, 32 px. |
| Bouton discret | Transparent, texte `--text-muted`, fond `#2E2E2E` au survol. |
| Bouton destructif | Transparent, bordure `#7A3530`, texte `#F0948B` ; toujours précédé d'une confirmation. |
| Bouton icône | 32 × 32, icône 16 ; bascule « on » : fond `--accent`, icône blanche. |
| Carte cliquable | 56 px, toute la carte réagit. Vide : bordure pointillée `#4A4A4A`, survol fond `#1E2A38` + bordure `--accent-text`. Remplie : fond `--bg-surface`, carré 12 px de la couleur d'étiquette AE du calque (absent si « Aucune »), titre en gras, sous-titre discret, icône d'action à droite. |
| Bandeau | Fond `--warn-soft`, texte `--warn`, icône à gauche ; absent (pas masqué) quand il n'a rien à dire. |
| Segmenté | Cadre `--bg-inset` + bordure `--line`, segments égaux, actif `--segment-on` / `--text-strong`, nombres en mono atténué. |
| Liste à lignes | Cadre `--bg-inset`, lignes de 32, toute la ligne cliquable ; icône d'état, nom, pastille d'état ; au survol, fond `--bg-hover` et la pastille laisse place à l'action. |
| Pastille d'état | « lié » : `--accent-soft` / `#BFDBFA` ; « détaché » : `--warn-soft` / `--warn`. |
| Champ texte | 30 px, fond `--bg-inset`, focus : bordure + halo `--accent` ; erreur : bordure `--error` + message dessous. |
| Champ numérique | Valeur à droite en mono, unité discrète ; glisser sur le libellé change la valeur ; ↑/↓ ±1, Maj ±10. |
| Barre de valeur (curseur) | 30 px, libellé et valeur dedans, remplissage `--accent-soft` + repère 2 px `--accent-text` ; glisser n'importe où, Maj = précision, double-clic = saisie, Alt + clic = défaut, molette ±1 ; pendant le glissé fond `--accent`. Bipolaire : remplit depuis le centre. |
| Menu déroulant | Fermé : fond `--bg-surface`, chevron ; ouvert : menu `--bg-surface`, élément survolé `--accent` ; séparateurs. |
| Case, radio, interrupteur | Toute la ligne (30) cliquable ; case 16, interrupteur 36 × 20. Case = appliquée avec l'action ; interrupteur = effet immédiat. |
| Point 9 positions | Carré 108 × 108, 9 cases de 36 entièrement cliquables ; pointillé = boîte du calque ; point 8 px `#5E5E5E`, choisi 12 px `--accent-text` avec halo ; pavé numérique 1–9. |
| Picto de keyframe (lissage) | Bouton icône 32 × 30 devant son curseur ; losange 16 au trait 1,5, moitié remplie selon le côté lissé : droite = Entrée (le mouvement part de la keyframe), gauche = Sortie (il y arrive), entier = Les deux : c'est l'icône de la keyframe obtenue dans AE ; repos `#8A8A8A`, survol `--accent-text`. Clic = appliquer la valeur du curseur. |
| Grille de cases | Cases pleines de 36 px de haut (`--bg-surface`, icône 16), 3 ou 6 colonnes égales, 2 px d'écart ; survol `--accent-soft` / `--accent-text`. On vise une case, pas une icône. |
| Dernier geste | Contour intérieur 1 px `--accent-text` (classe `is-last`) sur la commande du dernier geste ; un seul à la fois ; Entrée le rejoue. |
| Onglets de Réglages | Segmenté pleine largeur sous le titre : Outils, Raccourcis, Général ; le dernier ouvert est mémorisé. Chaque onglet tient en une colonne qui défile, même avec beaucoup d'outils. |
| Liste des outils (Réglages) | Lignes de 34 : poignée 28 × 32 (six points, curseur main ; glisser = déplacer, ↑ ↓ au clavier), icône, nom, pastille de touche en mono (`--bg-inset`, cachée si aucune), œil 32 × 32 (masquer du rail ; ligne masquée atténuée à 0,45, œil barré). Pendant le glissé : fond `--bg-surface` et contour `--accent-text`. Le dernier outil visible ne se masque pas. |
| Champ de recherche | 30 px, fond `--bg-inset`, loupe à gauche, croix pour vider ; focus = bordure et halo `--accent` ; Échap vide ; filtre sans tenir compte des accents ni des majuscules ; « Aucun … ne correspond » si rien. Pour toute liste qui peut dépasser une dizaine d'éléments. |
| Raccourci (Réglages) | Ligne de 30 : libellé de l'action, touche à droite en mono dans un cadre `--bg-inset` (96 px mini), « — » atténué si aucune ; clic = « Appuie sur une touche… » cerclé `--accent-text`, modificateurs tenus affichés en direct (« Ctrl + Alt + … »), touche seule ou combinaison, Retour arrière = aucun, Échap = annuler ; conflit signalé dans la ligne de statut (l'autre action perd sa touche) ; bouton « Rétablir les raccourcis par défaut ». |
| Étiquette de couleur | Carrés de 18 (14 dans une ligne), couleurs et noms des Préférences › Étiquettes d'AE ; Aucune = carré barré, Ne pas changer = carré pointillé. Bouton pastille : 30 de haut, cadre `--bg-inset`, carré seul (32 de large) ou carré + nom + chevron (136). |
| Sélecteur d'étiquette | Fenêtre flottante `--bg-surface` sous le bouton (au-dessus si la place manque) : nom de la couleur survolée, 16 cases de 34 × 30 en 4 × 4, puis Aucune et Ne pas changer en lignes pleines ; choisie = contour `--text-strong` (aucune et « Plusieurs couleurs » si la sélection en mélange) ; geste en un clic : bouton enfoncé = ouvert, relâché sur une couleur = choisie, relâché sur le bouton = reste ouvert, ailleurs = fermé ; flèches, Échap et clic dehors ; un seul ouvert à la fois. |
| Récapitulatif (Libellés) | Liste à lignes groupée par règle : en-tête 34 (bouton pastille de la règle, nom, compteur), lignes de 32 : couleur actuelle → couleur posée, nom, pastille d'état discrète (« à la main » en `--accent-soft`, « déjà bon », « inchangé ») ; toute la ligne ouvre le sélecteur. Sélection multiple : Ctrl + clic, Maj + clic (plage), nom du groupe (bouton, tout le groupe) ; ligne sélectionnée en `--accent-soft`, nom en `--text-strong` ; le sélecteur ouvert depuis une ligne sélectionnée colore toute la sélection ; Échap désélectionne. |
| Ligne de statut | Pastille 6 px : gris info, `--ok`, `--warn`, `--error` ; s'efface à l'action suivante. |
| Dialogue | Fond `--bg-surface`, titre en question, conséquence en une ligne, actions à droite. Remplace `alert`. |
| Infobulle | Attribut `title` ou bulle de la charte, phrase courte à l'infinitif. |
| État vide | Cadre pointillé, icône, phrase qui dit quoi faire. |
| Progression | Barre 4 px `--accent` sur `--line`, au-delà d'environ 50 éléments traités. |

En 1.0.0, seuls les composants dont Unparent et le hub ont besoin sont codés
(spec § 8) ; les autres arrivent avec les outils qui les utilisent.

## 7. Icônes

- Grille 16 px, trait 1,5, extrémités rondes, sans remplissage, couleur `currentColor`.
- Tracés : `docs/design/icons.json` (lier, délier, ancre, renommer, échelonner,
  null, nettoyer, rafraîchir, cibler, chercher, réglages (deux curseurs), aide, visible, verrou,
  panneau (fenêtre à barre de titre : « Ouvrir dans un panneau »),
  ajouter, fermer, valider, attention, déplier, menu, plus, éclair, keyframe, ressort,
  étiquette, aligner et répartir).
- Teintes par contexte via CSS : repos `#8A8A8A`, survol `--text`, actif `--accent-text`, blanc sur fond bleu.

## 8. Textes

- Verbes courts à l'infinitif : « Détacher », « Rattacher », « Créer le null ».
- Le bouton principal dit combien d'éléments il touche, sauf quand la sélection n'est connue qu'au clic (Quick Tools) : verbe seul, la quantité vient dans la ligne de statut.
- Le statut dit ce qui s'est passé et rappelle `Ctrl+Z` après une action.
- Tutoiement dans les aides et états vides.
