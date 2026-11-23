# Onglet Claude : discuter avec Claude dans After Effects

Date : 2026-11-23. Version visée : SIMING 1.6.0 (nouvel outil).
S'appuie sur le serveur MCP de la 1.4.0 (`2026-11-06-claude-code-mcp-design.md`).

## 1. Intention

Simon veut, pour **toute l'équipe**, un onglet « Claude » dans le hub SIMING où l'on parle à
Claude sans quitter After Effects. Claude doit comprendre le projet et **travailler comme la
personne** : il voit la comp ouverte et la sélection, il agit dans AE, il pose ses questions
dans le panneau. Un bouton **Observer** lui montre un geste fait à la main pour qu'il le
refasse ailleurs.

Cas réels donnés par Simon :
- déplacer un logo dans une dizaine de compositions ;
- appliquer plusieurs effets sur beaucoup de calques.

## 2. Buts, non-buts, anti-buts

**Buts**
- Un fil de discussion dans un onglet du hub, réponses affichées au fil de l'eau.
- Connexion par l'**abonnement Claude de l'équipe**, rien à payer en plus.
- Contexte AE joint à chaque message (projet, comp active, sélection, temps courant).
- Questions de Claude affichées dans l'onglet, avec choix cliquables et réponse libre ; Claude attend la réponse.
- Observer : photographier l'état avant / après un geste manuel et donner la différence à Claude.
- Marche sur Windows et macOS, pour chaque collègue.

**Non-buts**
- Enregistrer les clics, menus ou raccourcis de l'utilisateur (After Effects ne les expose pas).
- Rejouer exactement le chemin de l'utilisateur : Claude reproduit le **résultat**.
- Gérer plusieurs conversations en parallèle, ou un historique consultable des anciennes.
- Remplacer Réglages › Claude (Claude Code dans un terminal reste possible).

**Anti-buts** (échec même si ça « marche »)
- Claude qui agit sur les fichiers de l'ordinateur ou lance des commandes hors d'AE.
- Une action lourde (enregistrer, supprimer des éléments, rendre, écrire des fichiers) sans accord.
- Un After Effects figé pendant que Claude réfléchit.
- Un onglet incompréhensible pour un collègue qui n'a jamais installé Claude Code.

## 3. Contraintes

- Une application tierce ne peut pas proposer la connexion claude.ai elle-même ; l'Agent SDK
  et l'API demandent une clé API facturée à l'usage. L'abonnement passe donc par **Claude Code**
  installé sur le poste et connecté au compte d'équipe.
- CEP : Node disponible en contexte séparé (`cep_node.require`), Chromium 88 (CEP 11) à 99.
- Un seul appel ExtendScript à la fois ; AE ne prévient d'aucun geste de l'utilisateur.
- Sur macOS, une application lancée depuis le Dock n'a pas le `PATH` du terminal : `claude`
  doit être cherché explicitement.
- Sur Mac, les événements souris passent mieux que les pointer events (correctif 1.5.3).

## 4. Approches

| Approche | Pour | Contre | Choix |
|---|---|---|---|
| **A. Piloter Claude Code sans terminal** (`claude -p`, flux JSON), outils = serveur MCP SIMING | Abonnement d'équipe ; réutilise tout le MCP existant ; Claude Code gère le modèle, le contexte, la reprise | Claude Code à installer et connecter sur chaque poste ; dépend du format de sortie de la CLI | **Retenue** |
| B. Appeler l'API Messages avec une clé, boucle d'outils maison | Rien à installer | Facturé à l'usage, hors abonnement ; clé à distribuer | Écartée |
| C. Agent SDK d'Anthropic | Boucle d'agent fournie | Exige aussi une clé API | Écartée |

Simon a validé A (2026-11-23).

## 5. Architecture

```
Onglet Claude (hub, tools/claude.js)
  │  spawn  claude -p --input-format stream-json --output-format stream-json …
  ▼
Claude Code (processus enfant, un par conversation)
  │  HTTP MCP 127.0.0.1:<port>/mcp + jeton  (configuration passée en ligne de commande)
  ▼
Service com.siming.mcp (serveur MCP existant)  ──evalScript──▶  host (mcp.jsx, claude.jsx)
  │  événements CEP ask / answer
  ▲
Onglet Claude (affiche la question, renvoie la réponse)
```

- **Le processus `claude` vit dans le hub** (là où est l'onglet). Fermer le hub l'arrête ; la
  conversation reprend à la réouverture par `--resume <session_id>`.
- **Le serveur MCP reste dans le service.** L'onglet l'active tout seul s'il est éteint (même
  réglage `claude.json` que Réglages › Claude) et passe sa configuration à Claude Code avec
  `--mcp-config '<json>'` et `--strict-mcp-config` : les autres serveurs MCP du poste ne sont pas chargés.

### 5.1 Lancement de Claude Code

- **Trouver `claude`** : réglage « Chemin de Claude Code » s'il est rempli ; sinon
  Windows : `where claude`, puis `%USERPROFILE%\.local\bin\claude.exe`, `%APPDATA%\npm\claude.cmd` ;
  macOS : `~/.local/bin/claude`, `/opt/homebrew/bin/claude`, `/usr/local/bin/claude`, puis
  `/bin/zsh -lc 'command -v claude'`. Le chemin trouvé est mémorisé.
- **Arguments** (à confirmer contre `claude --help` de la version installée) :
  `-p --input-format stream-json --output-format stream-json --verbose --include-partial-messages`,
  `--mcp-config`, `--strict-mcp-config`, `--allowedTools mcp__siming__*`, outils intégrés coupés
  (`--tools ""` ou, à défaut, `--disallowedTools` sur Bash, Edit, Write, Read, WebFetch, Task,
  AskUserQuestion…), `--append-system-prompt` (§ 5.4), `--resume <id>` pour reprendre.
- **Dossier de travail** : `<USER_DATA>/SIMING/claude-work/` (vide), pour qu'aucun `CLAUDE.md`
  d'un dossier de projet ne s'en mêle.
- **Délai des outils MCP** : variable d'environnement `MCP_TOOL_TIMEOUT` relevée (15 min) pour
  qu'une question en attente de réponse n'expire pas.
- Un processus par conversation, gardé vivant entre les messages (entrée en flux JSON) ;
  relancé avec `--resume` s'il meurt.

### 5.2 Connexion

État de l'onglet, vérifié à l'ouverture :
1. **Claude Code introuvable** : message et lien d'installation (page officielle), champ
   « Chemin de Claude Code », bouton « Chercher à nouveau ».
2. **Pas connecté** (la CLI répond une erreur d'authentification au premier message, ou
   `claude auth status` si la version l'offre) : bouton **Se connecter** qui ouvre un terminal
   lançant `claude` (Windows : `cmd /c start`, macOS : `osascript` → Terminal), avec la consigne
   « tape /login et choisis le compte d'équipe ».
3. **Prêt** : le fil.

Aucun identifiant ne transite par SIMING.

### 5.3 Contexte joint à chaque message

Avant chaque envoi, l'onglet appelle l'hôte (`claude.context`, nouveau, léger) et préfixe le
message d'un bloc :

```
<contexte_ae>
Projet : Pub_Hiver.aep (non enregistré depuis 12 min)
Comp active : MAIN_16x9 (id 42) 1920×1080, 25 i/s, 0:00:20:00, temps courant 0:00:03:10
Calques sélectionnés : 3 « LOGO » (id 118, source logo.ai), 5 « Titre » (texte)
Propriétés sélectionnées : 3 › Transformation › Position (4 keyframes)
</contexte_ae>
```

Claude en tire le détail avec `get_comp`, `get_properties`, etc. Le bloc est affiché en
résumé discret sous le message de l'utilisateur (une ligne, dépliable).

### 5.4 Consignes ajoutées (system prompt)

En plus des `instructions` du serveur MCP : tu travailles pour un motion designer dans AE ;
lis avant d'agir ; reproduis ce qu'il ferait (noms, organisation, conventions du projet) ;
un appel `run_extendscript` par étape logique avec un `undoName` parlant ; **pose tes questions
avec l'outil `ask_user`** (jamais en texte libre suivi d'une action) ; demande avant les actions
lourdes ; réponds en français, brièvement.

### 5.5 Questions de Claude

Nouvel outil MCP **`ask_user`** dans le serveur SIMING :
`{ question, options?: [{ label, description? }], multiple?: bool, allowText?: bool (défaut vrai) }`.

- Le service publie un événement CEP `com.siming.mcp.ask` (id, question, options) et garde
  l'appel MCP ouvert.
- L'onglet affiche une carte de question dans le fil : boutons d'options, champ libre,
  « Envoyer la réponse ». La zone de saisie principale est désactivée pendant ce temps.
- La réponse repart par `com.siming.mcp.answer` ; le service la rend à Claude en texte.
- Hub fermé ou bouton **Arrêter** : l'appel rend « l'utilisateur n'a pas répondu ».
- L'outil `ask_user` n'est utile qu'avec l'onglet : sans hub ouvert, il rend aussitôt
  « personne pour répondre, décide prudemment ou arrête-toi ».

### 5.6 Observer

Bouton **Observer** dans la barre de l'onglet (bascule, point rouge pendant l'observation).

- **Début** : l'onglet demande à l'hôte une photo (`claude.snapshot`) de la comp active.
- **Pendant** : toutes les 2 s, l'onglet regarde quelle comp est active (appel léger) ; une
  comp vue pour la première fois est photographiée à son tour. (Changer de comp pendant
  l'observation est donc permis.)
- **Fin** : nouvelle photo de chaque comp photographiée ; l'onglet calcule la différence (JS pur,
  testé) et l'attache au prochain message sous forme de pastille « Observation : 7 changements »
  (dépliable, supprimable).

**Photo d'une comp** (hôte, ES3) : réglages de la comp (taille, durée, fréquence) ; pour chaque
calque, par `id` : nom, nature, source (id + nom), parent, temps (in/out/start), interrupteurs ;
toutes les propriétés modifiables avec matchName, valeur, keyframes (temps, valeur, interpolations,
vitesses), expression ; effets et masques dans l'ordre. Limite de taille : au-delà de 300 calques,
seuls les calques sélectionnés au début ou à la fin sont photographiés (dit dans le résumé).

**Différence** (client, pur) : calques ajoutés / supprimés / renommés / réordonnés ; propriété
changée (avant → après) ; keyframes ajoutées, supprimées, déplacées ; expression posée / retirée ;
effet ajouté (avec tous ses réglages) / retiré / modifié ; masque ajouté ; parent changé ;
réglage de comp changé. Le texte envoyé à Claude est structuré et compact :

```
<observation comp="MAIN_16x9 (id 42)">
Calque 3 « LOGO » (id 118, source logo.ai id 7) :
  Transformation › Position (ADBE Position) : [960,540] → [1720,980]
  Transformation › Échelle (ADBE Scale) : [100,100] → [45,45]
Calque 5 « Titre » (id 120) : effet ajouté « Lueur » (ADBE Glo2) : rayon 25, intensité 1,4…
</observation>
```

Claude décide ensuite quoi refaire selon la demande (« fais pareil sur les 10 autres comps »),
en valeurs absolues ou relatives, et passe par `ask_user` quand c'est ambigu.

Les éléments du projet ajoutés (import, nouvelle comp) sont listés par nom, sans photo détaillée.

### 5.7 Interface

```
┌ Claude ─────────────────────────────── [● Observer] [⟲] ┐
│                                                          │
│  Toi   Déplace le logo comme dans MAIN sur les autres    │
│        comps 16x9.                                       │
│        ▸ MAIN_16x9 · 1 calque sélectionné · Observation  │
│                                                          │
│  Claude  Je trouve le logo (logo.ai) dans 9 comps.       │
│        ✓ Lit le projet                                   │
│        ✓ Claude : Logo en bas à droite (9 comps)         │
│        C'est fait ; Ctrl+Z annule d'un coup.             │
│                                                          │
│  ┌ Question ────────────────────────────────────────┐    │
│  │ La comp STORY_9x16 a aussi le logo. Je la prends ?│    │
│  │ [ Oui ] [ Non ] [ Seulement la position ]         │    │
│  │ [ autre réponse…                         ] [↵]    │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│ [ Écris à Claude…                                 ] [➤]  │
│ statut : Claude travaille… (3 actions)       [Arrêter]   │
└──────────────────────────────────────────────────────────┘
```

- Bouton principal unique : **Envoyer** (Entrée envoie, Maj+Entrée = retour à la ligne).
- **⟲ Nouvelle conversation** (confirmation par le dialogue de la charte si un fil existe).
- **Arrêter** pendant que Claude travaille : interrompt le processus (la conversation reste
  reprenable ; les actions déjà faites restent, chacune annulable).
- Appels d'outils : une ligne par appel, libellé humain (« Lit la comp », « Capture l'image »,
  ou l'`undoName` pour `run_extendscript`), dépliable pour voir le code et le résultat.
- Images de `capture_frame` affichées en vignette.
- Texte de Claude en Markdown simple (gras, listes, code) rendu sans HTML brut.
- Statut sur une ligne (info / ok / warn / error), jetons de `charte.css`, composants de `js/ui/`.

### 5.8 Réglages (Réglages › Claude, section ajoutée)

Chemin de Claude Code (vide = automatique) ; modèle (vide = celui du compte) ; bouton
« Tester » (lance `claude --version`).

## 6. Sécurité

- Outils intégrés de Claude Code coupés : pas de lecture / écriture de fichiers ni de commande
  shell ; seuls les outils `mcp__siming__*`.
- `run_extendscript` reste sans limite dans AE (choix de la 1.4.0) ; consignes + groupe
  d'annulation par appel + `ask_user` avant les actions lourdes.
- Serveur MCP inchangé : 127.0.0.1, jeton, refus des navigateurs.
- Rien n'est envoyé ailleurs que par Claude Code lui-même (compte de l'utilisateur).

## 7. Découpage du code

| Fichier | Rôle |
|---|---|
| `client/tools/claude.js` | vue de l'onglet (fil, saisie, questions, Observer, états de connexion) |
| `client/js/claude/cli.js` | trouver, lancer, parler à Claude Code (flux JSON ↔ événements) ; modules Node passés en argument (testable avec un faux processus) |
| `client/js/claude/stream.js` | lecture du flux JSON de la CLI → événements de vue (texte, outil, résultat, fin, erreur d'auth) ; pur |
| `client/js/claude/observe.js` | différence entre deux photos, texte d'observation ; pur |
| `client/js/claude/markdown.js` | rendu Markdown réduit en nœuds DOM ; pur |
| `client/js/mcp/protocol.js` | + outil `ask_user` |
| `client/js/mcp/service.js` | + attente de réponse (`ask` / `answer`) |
| `host/tools/claude.jsx` | `context`, `activeComp`, `snapshot` (ES3) |
| `tests/` | flux JSON, différence d'observation, `ask_user`, vue avec faux processus, hôte avec le faux AE |

## 8. Décisions prises à la relecture (choix de Claude, à vérifier par Simon)

1. **Onglet du hub seulement.** Claude n'a pas de panneau isolé : il figure dans `tools.json`
   avec un drapeau (`"hubOnly": true`) que `tools/manifest.js` respecte (pas d'extension
   `com.siming.claude`). Une seule conversation, un seul processus `claude` par poste.
2. **`ask_user` réservé à l'onglet.** L'onglet lance Claude Code avec un en-tête MCP en plus
   (`X-Siming-Client: tab-<id aléatoire du lancement>`). Le service ne publie `ask` que pour un
   appel portant l'en-tête de l'onglet actif ; un Claude Code lancé dans un terminal reçoit
   aussitôt « personne pour répondre ». Le jeton reste celui de `claude.json`.
3. **Fil restauré à la réouverture.** L'onglet enregistre le fil affiché (messages, lignes
   d'outils, questions et réponses, sans les images) dans `<USER_DATA>/SIMING/claude-thread.json`
   avec le `session_id` ; à la réouverture il le réaffiche et reprend par `--resume`.
   « Nouvelle conversation » l'efface. On ne lit jamais les fichiers internes de Claude Code.
4. **Photo sans figer AE.** La photo se prend par paquets (un `evalScript` pour 20 calques au plus,
   le panneau enchaîne), avec un indicateur « Observer prépare… ». Le relevé de la comp active
   toutes les 2 s est suspendu pendant que Claude travaille (pas de concurrence avec ses appels
   MCP), et pendant une photo.

## 9. Laissé au constructeur

- Format exact du flux JSON de la version installée de Claude Code et drapeaux disponibles
  (vérifier par `claude --help`, adapter `stream.js`).
- Rendu détaillé des lignes d'outils et des vignettes, dans la charte.
- Seuils (2 s, 300 calques, 15 min) : ajustables.
- Tests manuels à ajouter dans `docs/TESTS-MANUELS.md` (Mac et Windows, collègue sans Claude Code).
