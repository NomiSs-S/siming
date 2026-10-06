# Notes techniques : ExtendScript et CEP

Pièges rencontrés ou anticipés. Ajouter chaque découverte ici, avec la version
d'After Effects où elle a été observée. Les notes propres à ScriptUI (abandonné) ont été retirées avec l'ancienne version.

## Langage ExtendScript (cœur hôte)

- Moteur **ES3**. Absents : `Array.prototype.forEach / map / filter / indexOf`, `String.prototype.trim`, `JSON`, `Object.keys`, `let`, `const`, fonctions fléchées, `Function.prototype.bind`. Écrire des boucles `for` classiques.
- `try / catch / finally` est supporté. Mettre `app.endUndoGroup()` dans le `finally`.
- Les objets d'erreur ont `message`, `line` et `fileName`.
- Fichiers source lus dans l'encodage système sauf si un **BOM UTF-8** est présent : sans BOM, les accents s'affichent mal sur Windows.
- `$.fileName` donne le chemin du script en cours : le lire **au chargement** et le stocker.
- `$.evalFile(fichier)` évalue un fichier et renvoie la valeur de sa dernière expression.
- `Folder.getFiles("*.jsx")` renvoie des `File` et des `Folder` : tester `instanceof File`.
- `encodeURIComponent` / `decodeURIComponent` existent : utilisés par le pont pour transporter les arguments sans risque d'injection.

## Modèle objet After Effects

- `comp.layer(i)` et `layer.parent` renvoient un **nouvel objet à chaque accès** : `comp.layer(1) === comp.layer(1)` est faux. Comparer `index` ou `id`.
- Index de calques à partir de **1** ; `comp.numLayers` donne le nombre. Idem `app.project.item(i)` / `app.project.numItems`.
- `Layer.id` existe depuis AE 22.0 ; avant, repli sur `index`, qui change quand on réordonne.
- `app.project.activeItem` peut être une comp, un métrage, un dossier ou `null` : tester `instanceof CompItem`.
- `layer.parent = autreCalque` ou `= null` **compense les transformations** comme le menu Parent : position apparente conservée. `layer.setParentWithJump()` garde les valeurs brutes (le calque saute).
- La compensation se fait à l'instant courant : avec des keyframes ou des expressions, d'autres images peuvent sauter (comportement natif).
- Un calque verrouillé lève une erreur si on modifie `parent` ou `comment` : tester `layer.locked`.
- Parenter un calque à l'un de ses descendants lève une erreur (cycle) : envelopper dans un `try`.
- `layer.comment` : chaîne libre visible dans la timeline, bon support d'une mémoire persistante discrète.
- `comp.selectedLayers` : tableau d'objets calque, dans l'ordre de sélection.
- `layer.label` : index d'étiquette, 0 (aucune) à 16. Les couleurs sont dans les préférences : `app.preferences.getPrefAsString('Label Preference Color Section 5', 'Label Color ID 2 # n')` renvoie **4 octets ARGB sous forme de caractères**, pas un texte hexadécimal (`getPrefAsLong` échoue). Les lire avec `$.appEncoding = 'BINARY'` (un caractère par octet), puis rendre l'encodage ; repli sur les couleurs par défaut si la forme est inconnue. Dans le fichier de préférences, les octets imprimables apparaissent entre guillemets (`FFB5"88"` = B53838).
- **Lissage temporel** : `setTemporalEaseAtKey(k, inEase, outEase)` veut des tableaux de `KeyframeEase` dont la longueur dépend de la propriété : 1 pour une propriété spatiale ou 1D, 2 ou 3 pour une propriété 2D/3D non spatiale (échelle). Lire `keyInTemporalEase(k).length` pour connaître la bonne longueur. Passer d'abord `setInterpolationTypeAtKey(k, BEZIER, …)` : changer l'interpolation remet l'ease par défaut. `KeyframeEase` refuse une influence hors 0,1–100.
- **Sens des lissages** (2026-10-06) : After Effects nomme ses keyframes de leur point de vue (Easy Ease In = côté **entrant**, `keyInTemporalEase`). L'animateur parle du mouvement : « entrée » = son départ = côté **sortant** de la première keyframe. Quick Tools suit l'animateur (mode `in` → `keyOut…`) : ne pas « corriger » en relisant le code.
- **Décaler des keyframes sans en créer** (2026-10-06) : `setValueAtTime(t, v)` crée une keyframe à `t` s'il n'y en a pas, et laisse les autres : pour déplacer toute une animation, parcourir `numKeys` et `setValueAtKey(k, keyValue(k) + delta)`. Sur une propriété spatiale (`isSpatial`), relire `keyInSpatialTangent(k)` / `keyOutSpatialTangent(k)` avant et les reposer avec `setSpatialTangentsAtKey` quand `keySpatialAutoBezier(k)` est faux : les tangentes automatiques se recalculent seules, et en reposer une à la main la rend manuelle. À vérifier dans AE : `setValueAtKey` conserve-t-il les tangentes manuelles sans cette précaution ?
- **`setValue` sur une propriété animée** échoue : tester `numKeys > 0` et utiliser `setValueAtTime(temps, valeur)` (keyframe posée à l'instant courant).
- **Dimensions séparées** (`position.dimensionsSeparated`) : `ADBE Position` ne se pose plus, il faut écrire `ADBE Position_0` et `ADBE Position_1`, qui n'existent dans `property()` qu'en mode séparé.
- **Pseudo-effet à plusieurs curseurs** (ex. « Elastic Controller ») : impossible à créer par script, mais un préréglage `.ffx` qui le contient s'applique partout avec `layer.applyPreset(File)`, la définition étant embarquée dans le fichier. `applyPreset` vise les calques **sélectionnés** : isoler la sélection sur le calque voulu, puis la rétablir (`layer.selected`).
- **`sourceRectAtTime(t, false)`** donne la boîte visible dans l'espace du calque (`top`, `left`, `width`, `height`) ; absente sur les caméras et lumières (`typeof layer.sourceRectAtTime !== 'function'`). Pas de `toComp` en ExtendScript : composer soi-même ancrage, échelle, rotation, position et la chaîne des parents (matrices 2D dans `quicktools.jsx`).
- Le `Layer` est un `PropertyGroup` : `numProperties` et `property(i)` permettent de parcourir toutes ses propriétés (utile pour chercher une expression).

## CEP (à compléter pendant l'implémentation)

- Le panneau (Chromium) et le moteur ExtendScript sont séparés : ils ne s'échangent que des chaînes via `CSInterface.evalScript(script, callback)`. Le callback reçoit `EvalScript error.` si le script échoue sans être attrapé.
- ExtendScript n'a pas `JSON` : le cœur hôte fournit son propre `stringify` / `parse` (sans `eval`).
- En développement, les extensions non signées ne se chargent qu'avec `PlayerDebugMode = 1` pour la version CSXS concernée (registre Windows `HKCU\Software\Adobe\CSXS.<n>`, préférences macOS `com.adobe.CSXS.<n>`).
- Sous macOS, après `defaults write com.adobe.CSXS.<n> PlayerDebugMode 1`, il peut falloir `killall cfprefsd` (ou une reconnexion) pour que After Effects voie le réglage.
- `CSInterface.evalScript` est asynchrone : un seul appel à la fois par vue, commandes désactivées pendant l'appel (une seule action par double clic).
- Les arguments passent encodés (`encodeURIComponent` du JSON) et le retour aussi : aucun texte de calque n'est interprété comme du code.
- Un panneau CEP ne lit pas de paramètres fiables dans `MainPath` : le panneau isolé déduit son outil de `CSInterface.getExtensionID()`.
- Tous les panneaux d'une extension partagent le moteur ExtendScript : chaque panneau recharge `host/siming.jsx` (mémoire de session d'Unparent remise à zéro, les balises suffisent).
- **Raccourcis clavier** (2026-10-06) : écouter `keydown` sur `document` et comparer `e.code` (touche physique : `Digit1`, `KeyQ`, `Numpad5`), jamais `e.key`, qui dépend de la disposition. En AZERTY la rangée de chiffres se tape avec Maj (`e.key` = `&`, `e.code` = `Digit1`) : ignorer Maj sur `Digit…`. Pour l'affichage, prendre la lettre réellement frappée (`e.key`) et une table pour le reste (Entrée, Pavé 5, ↑). Un panneau ne reçoit les touches que lorsqu'il a le focus (clic dedans) ; Entrée et Espace sur un bouton focalisé déclenchent le clic natif, ne pas les intercepter.
- **Combinaisons de touches dans un panneau CEP** (2026-10-06) : After Effects garde pour lui les frappes avec Ctrl, Alt ou Cmd (ses propres raccourcis) tant que le panneau ne les a pas réclamées par `CSInterface.registerKeyEventsInterest(JSON)` : un tableau `{ keyCode, ctrlKey?, altKey?, shiftKey?, metaKey? }`, keyCode = touche virtuelle Windows (VK_…, 0x35 pour 5) ou code de touche macOS (kVK_…, 0x17 pour 5). Chaque appel remplace le précédent (à vérifier). Pour capturer un raccourci neuf, réclamer toutes les touches le temps de la capture. Voir `SIMING.keys.interest` et `SIMING.claimKeys`.
- **`localStorage` entre panneaux** : le hub et un panneau isolé sont deux extensions du même bundle ; à vérifier dans AE si elles partagent le même `localStorage` (sinon l'ordre et les raccourcis choisis dans le hub ne s'appliquent pas au panneau isolé, qui garde les défauts).
- Ouvrir un panneau isolé ré-exécute `siming.jsx` dans ce moteur partagé et vide donc la mémoire de session du hub ouvert à côté. Conséquence : **la balise fait foi**. La mémoire n'est qu'un reflet des balises : un calque sans balise n'est jamais considéré comme détaché, même si la mémoire disait le contraire (cas d'un Ctrl+Z, qui retire la balise sans prévenir le panneau).
