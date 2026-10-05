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

## CEP (à compléter pendant l'implémentation)

- Le panneau (Chromium) et le moteur ExtendScript sont séparés : ils ne s'échangent que des chaînes via `CSInterface.evalScript(script, callback)`. Le callback reçoit `EvalScript error.` si le script échoue sans être attrapé.
- ExtendScript n'a pas `JSON` : le cœur hôte fournit son propre `stringify` / `parse` (sans `eval`).
- En développement, les extensions non signées ne se chargent qu'avec `PlayerDebugMode = 1` pour la version CSXS concernée (registre Windows `HKCU\Software\Adobe\CSXS.<n>`, préférences macOS `com.adobe.CSXS.<n>`).
- Sous macOS, après `defaults write com.adobe.CSXS.<n> PlayerDebugMode 1`, il peut falloir `killall cfprefsd` (ou une reconnexion) pour que After Effects voie le réglage.
- `CSInterface.evalScript` est asynchrone : un seul appel à la fois par vue, commandes désactivées pendant l'appel (une seule action par double clic).
- Les arguments passent encodés (`encodeURIComponent` du JSON) et le retour aussi : aucun texte de calque n'est interprété comme du code.
- Un panneau CEP ne lit pas de paramètres fiables dans `MainPath` : le panneau isolé déduit son outil de `CSInterface.getExtensionID()`.
- Tous les panneaux d'une extension partagent le moteur ExtendScript : chaque panneau recharge `host/siming.jsx` (mémoire de session d'Unparent remise à zéro, les balises suffisent).
- Ouvrir un panneau isolé ré-exécute `siming.jsx` dans ce moteur partagé et vide donc la mémoire de session du hub ouvert à côté. Conséquence : **la balise fait foi**. La mémoire n'est qu'un reflet des balises : un calque sans balise n'est jamais considéré comme détaché, même si la mémoire disait le contraire (cas d'un Ctrl+Z, qui retire la balise sans prévenir le panneau).
