# Import PSD : spec

Date : 2026-11-09. Outil concerné : Boîte à outils (`toolbox`). Version visée : 1.5.0 (geste
nouveau et conséquent ; la Boîte à outils passe en 1.1.0).

## Intention

L'import des planches Photoshop est le geste le plus répété de Simon en début de projet, et
le plus long : importer chaque PSD en composition avec les bons réglages, ouvrir chaque
planche, convertir les textes, poser les libellés, puis **redessiner à la main** dans After
les rectangles (souvent arrondis, sous les textes) en calques de forme, pour retrouver des
propriétés animables (taille, arrondi, couleur) qu'un calque PSD n'a pas.

Un seul geste doit faire tout cela, sur tout ou partie des PSD du projet, et s'annuler d'un
Ctrl+Z.

## Projet type (relevé sur un vrai projet)

```
PROJET_CLIENT/                    racine du projet
  01_RUSHS/  02_RESSOURCES/01_DONNEE/  02_RESSOURCES/02_ASSET/1.psd … 7.psd
  03_PROJET/PROJET_CLIENT.aep  04_SONS/  05_EXPORTS/
```

Panneau Projet d'After : `00_COMP`, `01_PRECOMP & SOLID`, `02_ASSET` (dossier où vont les
imports), `03_SONS`. Après import de `1.psd` : une compo « 1 » et un dossier « 1 Calques »
contenant la précompo « 1 » et les métrages `<calque>/1.psd`.

Constat sur les 7 PSD : chacun contient **un plan de travail** (groupe avec bloc `artb`)
nommé comme le fichier. La compo « 1 » contient donc la précompo « 1 » (le plan de travail),
qui contient les vrais calques : la planche est un niveau plus bas. Les textes ont un bloc
`TySh`, certains un style `lfx2` (ombre portée). Les formes vectorielles ont `vogk`
(forme d'origine : type, boîte, coins, arrondis), `vscg`/`SoCo` (remplissage), `vstk`
(contour), `vsms`/`vmsk` (tracé). Exemples : « Rectangle » de `7.psd` (lueur externe),
« fond noir » de `1.psd`.

## Le geste

1. Bouton **« Importer les PSD »** dans la Boîte à outils (section « Calques », ou section
   « Import » à part : au choix du constructeur selon la place).
2. SIMING cherche le dossier source : depuis le .aep enregistré, il remonte les dossiers
   parents jusqu'à en trouver un qui contient `02_RESSOURCES/02_ASSET` (au plus 3 niveaux).
   Introuvable, ou projet jamais enregistré : il propose de choisir un dossier
   (sélecteur système, qui part du dossier du projet s'il existe). Un lien « Changer de
   dossier » permet toujours d'en choisir un autre.
3. Une **liste** montre tous les `.psd` du dossier (pas les sous-dossiers), chacun avec une
   case à cocher. Ceux déjà présents dans le projet (un métrage dont le fichier est ce PSD)
   sont **décochés** et marqués « déjà importé » ; les autres sont cochés. « Tout / Rien »
   en tête de liste.
4. Bouton principal **« Importer N PSD »** (verbe + quantité, N = cases cochées).
   C'est le seul bouton principal de la vue liste ; elle se ferme une fois l'import fait.
5. Chaque PSD coché est importé en **Composition, tailles de calques conservées**
   (`ImportAsType.COMP_CROPPED_LAYERS`), avec **styles de calque modifiables**, dans le
   dossier `02_ASSET` du panneau Projet (créé à la racine s'il n'existe pas).
6. Puis, dans la compo importée et **toutes ses précompos** (récursivement) :
   - textes Photoshop convertis en texte modifiable (même mécanique que `convertPsdText`) ;
   - formes Photoshop recréées en calques de forme (voir plus bas), calque PSD d'origine
     **supprimé** de la compo ;
   - libellés posés avec les règles enregistrées de l'outil Libellés (`labels.rules`),
     sans passer par son aperçu.
7. Un seul groupe d'annulation pour l'ensemble. Statut sur une ligne, par exemple
   « 3 PSD importés · 12 textes · 4 formes · Ctrl+Z pour annuler ».

Un PSD déjà importé et recoché est importé **une seconde fois**, à côté (After le nomme
« 3 2 ») : jamais de remplacement, pour ne pas casser une compo déjà animée.

## Recréation des formes

Source de vérité : le fichier PSD lui-même, lu côté panneau (Node, activé dans le
manifeste), pas ce qu'After en montre. Pour chaque calque de forme du PSD :

| Forme d'origine (`vogk`, `keyOriginType`) | Calque de forme After |
|---|---|
| Rectangle | groupe avec **Rectangle** paramétrique (taille, position) |
| Rectangle arrondi | **Rectangle** paramétrique + **Arrondi** (rayon) |
| Ellipse | **Ellipse** paramétrique |
| Polygone, ligne, forme personnalisée, tracé à la plume (pas d'origine, ou origine non paramétrique) | **Tracé** à l'identique (sommets et tangentes de `vsms`/`vmsk`) |

Pour toutes : même position dans la compo, même **remplissage** (couleur unie ; dégradé
linéaire ou radial simple en Remplissage dégradé), même **contour** (épaisseur, couleur,
alignement si After le permet), même opacité et mode de fusion, même nom de calque, même
place dans la pile, mêmes parent et points d'entrée / sortie que le calque PSD remplacé,
mêmes **styles de calque** (recopiés depuis le calque PSD importé avec styles modifiables,
avant sa suppression).

**Styles de calque, décision de Simon** : « quasi tous les effets de base » : ombre
portée, ombre interne, lueur externe, lueur interne, biseau et estampage, satin,
incrustation couleur, incrustation dégradé, contour (les styles qu'After sait
reproduire). Incrustation de motif : After ne la gère pas → la forme reste le calque PSD.
Constat sur les planches : le « Rectangle » de `7.psd` porte une **lueur externe**
(blanche, Écran, 43 %), pas d'ombre portée ; les ombres portées sont sur des textes
(`3.psd`, `4.psd`), déjà couverts par la conversion des textes. Un style présent mais
désactivé (`enab: false`) n'est pas recréé ; `masterFXSwitch: false` = aucun style.
Si After importe les styles en modifiables par script, ils sont recopiés du calque PSD ;
sinon ils sont recréés d'après le `lfx2` du PSD.

**Relevé sur la planche test** (valeurs à reprendre dans les tests) : origine `vogk`
`keyOriginType` 1 = rectangle, 2 = rectangle arrondi (`keyOriginRRectRadii`), 5 =
ellipse, 8 = polygone (`keyOriginPolySides`) ; `keyOriginBoxCorners` sont déjà dans
les coordonnées du document, après transformation (`Trnf`). « Rectangle 2 » est un carré
de 152 px tourné de 45° (centre 291, 806) ; « Rectangle 3 » contient **deux** origines
rectangle (deux sous-tracés) ; « Rectangle 1 » a 4 rayons de 55 px ; « Ellipse 1 » a un
dégradé linéaire à 129°. Une origine peut être périmée (tracé retouché après coup) :
on ne la croit que si ses coins coïncident avec les points du tracé `vsms`, sinon Tracé.

Une forme qu'on ne sait pas reproduire fidèlement (remplissage motif, contour pointillé
non représentable, opération de combinaison de formes complexe…) **reste le calque PSD**,
sans être citée dans le rapport (même règle que la conversion des textes). Mieux vaut un
calque PSD intact qu'une forme approximative.

Les rectangles à coins inégaux : un Rectangle d'After n'a qu'un rayon. Coins tous égaux →
Rectangle + Arrondi ; sinon → Tracé à l'identique.

## Ce qui n'en fait pas partie

- Pas de mise à jour d'un import existant quand le PSD change.
- Pas de recréation des calques image, des objets dynamiques, ni des masques de fusion.
- Pas de sous-dossiers de `02_ASSET` parcourus.
- Rien d'automatique à l'ouverture du projet : uniquement sur le bouton.

## Ce qui serait un échec

- Une compo déjà animée modifiée ou cassée.
- Une forme recréée qui ne tombe pas **exactement** au même endroit, à la même taille ou
  de la même couleur que dans Photoshop : ça oblige à tout revérifier, donc ça ne sert à
  rien.
- Plusieurs Ctrl+Z pour revenir en arrière.
- Un rapport bavard qui liste tout ce qui n'a pas été converti.

## Répartition

- **Panneau** : lecture binaire des PSD (Node `fs`), extraction des formes en JSON
  (identifiant de calque, nom, type, boîte, rayons, tracé, remplissage, contour, opacité,
  fusion, styles, rectangle du plan de travail). Logique pure, testée sous Node.
  Fichier proposé : `extension/client/js/psd.js` (ou `js/psd/` si plusieurs fichiers).
- **Hôte** (`toolbox.jsx`, ou `tools/psdimport.jsx` s'il devient gros) : liste des PSD et
  état « déjà importé », import, parcours des compos, conversion des textes, création des
  calques de forme d'après le JSON, suppression des originaux, libellés. Réutilise
  `convertPsdText` (sa boucle interne, extraite pour agir sur une compo donnée) et le cœur
  de l'outil Libellés (`analyze` + `apply`, ou une fonction partagée).
- Le panneau envoie à l'hôte, pour chaque PSD coché, son chemin et les formes extraites.

## Points techniques à vérifier dans After Effects

1. **Styles de calque modifiables** : `ImportOptions` n'expose pas ce choix. Vérifier ce
   qu'After applique par script (dernier réglage utilisé dans la boîte d'import ?). Si
   impossible : les styles sont fusionnés et la recréation des styles sur les formes doit
   alors venir du `lfx2` lu dans le PSD (ajout des styles par commande de menu
   `Calque › Styles de calque › …`, puis valeurs posées). À noter dans
   `docs/NOTES-EXTENDSCRIPT.md` dans les deux cas.
2. **Correspondance calque PSD ↔ calque After** : par nom de calque et ordre dans le
   groupe (les noms peuvent se répéter, contenir des espaces finaux ou `/`). Le métrage
   s'appelle `<nom du calque>/<fichier>.psd`. La spec laisse au constructeur le choix de la
   méthode, à condition qu'elle soit fiable sur les exemples de `PROJET_CLIENT`.
3. **Coordonnées** : celles du PSD sont dans le document ; la précompo du plan de travail
   a pour origine le coin du plan de travail (`artb`). Tenir compte aussi des précompos de
   groupes imbriqués. Vérification : la forme recréée recouvre exactement le calque PSD
   (même boîte, au pixel).
4. **Commande « Convertir en texte modifiable »** : elle agit sur la compo active ; ouvrir
   chaque compo dans le visualiseur avant (`openInViewer`), puis revenir à la compo
   d'origine à la fin.
5. **Annulation** : vérifier qu'import + modifications tiennent dans un seul
   `SIMING.ae.undo`. Si After ne le permet pas, repli accepté : **deux Ctrl+Z** (les
   conversions, puis l'import), indiqués dans le statut ; pas de bouton d'annulation maison.

## Lots et erreurs

Un PSD dont After refuse l'import n'arrête pas le lot : les autres sont importés, et le
statut l'ajoute en fin de ligne (« · 1 PSD illisible »), niveau `warn` ; ce que ce PSD avait
créé est retiré. Un PSD que le lecteur du panneau ne sait pas lire est importé quand même,
sans formes (« · 1 avertissement »), et une étape qui échoue après l'import est sautée pour
la compo concernée (même avertissement) : la compo importée reste. Les raisons (fichier,
calque, message) sont données par la fenêtre « Éléments ignorés ». Le panneau lit tous les PSD
cochés puis envoie le lot entier à l'hôte en un seul appel (un seul groupe d'annulation).

## Tests

- Panneau : lecteur PSD testé sur la **planche test de Simon** (`docs/test-plache
  photoshop.psd`, à déplacer en `tests/fixtures/psd/planche-test.psd`) : 1920 × 1080,
  ellipse à remplissage dégradé (« Ellipse 1 »), rectangle arrondi (« Rectangle 1 »),
  rectangles (« Rectangle 2 », « Rectangle 3 », dans « Groupe 1 »), polygone
  (« Polygone 1 »), texte (« PourQUOI ??? »). Elle n'a ni ombre portée, ni tracé plume, ni
  plan de travail : ces cas se relèvent sur les PSD de `PROJET_CLIENT` (lus sur le
  disque de Simon, jamais versionnés : projet client), au besoin en en tirant les valeurs
  attendues dans les tests. Première étape du plan : relever les descripteurs réels
  (`vogk`, `vscg`, `vstk`, `vsms`, `lfx2`, `artb`) sur ces fichiers avant d'écrire le lecteur.
- Hôte : avec le simulacre d'AE existant (`tests/`) : recherche du dossier, état « déjà
  importé », création des formes d'après un JSON, suppression de l'original, rapport.
- Manuel : scénario ajouté à `docs/TESTS-MANUELS.md` sur `PROJET_CLIENT`.

## Décisions prises par Claude (à vérifier)

- Réimport d'un PSD déjà importé = seconde copie, jamais de remplacement.
- Libellés posés avec les règles enregistrées, sans aperçu.
- Repli d'annulation : deux Ctrl+Z plutôt qu'un bouton maison (Simon a validé « c'est
  ok » sans trancher entre les deux).
- Un PSD en échec n'arrête pas le lot.
- Formes non reproductibles laissées en calque PSD, sans mention.
- Recherche du dossier : remontée d'au plus 3 niveaux depuis le .aep.
- Lecture des PSD côté panneau (Node) plutôt qu'en ExtendScript.
