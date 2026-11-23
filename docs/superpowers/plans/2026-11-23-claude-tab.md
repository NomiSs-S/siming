# Onglet Claude : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un onglet « Claude » du hub qui dialogue avec Claude Code (abonnement de l'équipe), joint le contexte AE, affiche les questions de Claude et sait observer un geste manuel.

**Architecture:** le hub lance `claude -p` en flux JSON (processus enfant, Node de CEP), avec le serveur MCP SIMING comme seuls outils ; le service MCP gagne `ask_user` (questions relayées au hub par événements CEP) ; l'hôte gagne `context`, `activeComp`, `snapshot` ; la différence d'observation est calculée côté client (pur).

**Tech Stack:** JS natif (client), ExtendScript ES3 (hôte), Node de CEP (`child_process`, `fs`), tests `node tests/run.js` (jsdom + faux AE).

**Spec:** `docs/superpowers/specs/2026-11-23-claude-tab-design.md`

## Global Constraints

- Hôte ES3 strict, UTF-8 avec BOM ; un groupe d'annulation par action utilisateur (les lectures n'en ouvrent pas).
- Client sans framework ; `CSInterface.evalScript` seulement dans `bridge.js` ; composants de `js/ui/`.
- Un seul bouton principal : **Envoyer**. Statut sur une ligne. Pas d'`alert`.
- Identifiants en anglais ; textes et commentaires en français, tutoiement.
- Claude Code lancé avec : `-p --input-format stream-json --output-format stream-json --verbose --include-partial-messages --strict-mcp-config --setting-sources project,local --tools "" --allowedTools mcp__siming__*` (vérifié sur 2.1.185 : `--setting-sources project,local` garde la connexion, coupe hooks et plugins personnels). Jamais `--bare` (il ne lit pas la connexion OAuth).
- Dossier de travail `<USER_DATA>/SIMING/claude-work/` ; fil sauvé dans `<USER_DATA>/SIMING/claude-thread.json`.
- `MCP_TOOL_TIMEOUT=900000` dans l'environnement du processus.
- Version 1.6.0, outil `claude` 1.0.0, `"hubOnly": true`.

## Review Focus

1. Claude Code absent ou non connecté : l'onglet doit le dire et proposer quoi faire, jamais rester muet.
2. Le processus `claude` meurt en plein travail (plantage, Arrêter) : la vue sort de l'état « travaille » et la conversation reste reprenable.
3. Une question `ask_user` arrive alors que le hub est fermé, ou d'un Claude Code de terminal : réponse immédiate « personne pour répondre ».
4. Comp de plus de 300 calques ou valeurs non sérialisables (CUSTOM_VALUE) dans la photo : pas d'exception, résumé honnête.
5. Lignes de flux JSON coupées entre deux paquets `stdout` ou illisibles : rassemblées par lignes, les illisibles ignorées.

---

### Task 1 : outil `claude` réservé au hub

**Files:** `extension/client/tools.json`, `tools/manifest.js`, `extension/client/js/standalone.js`, `extension/client/js/hub.js`, `tests/manifest.test.js`, `tests/hub.test.js`.

- [ ] Test : `buildManifest` d'une liste avec `{ id: 'claude', hubOnly: true }` ne contient pas `com.siming.tool.claude` ; le hub ne propose pas « ouvrir dans un panneau » pour un outil `hubOnly` ; `ctx.claude` reçu par `mount` vaut l'env passé à `startHub`.
- [ ] Implémenter, tests verts, commit.

### Task 2 : hôte `mcp.context`, `mcp.activeComp`, `mcp.snapshot`

**Files:** `extension/host/tools/mcp.jsx`, `tests/mcp-host.test.js`.

**Produces:**
- `context({}) -> { project: { name, path, dirty }, comp: null | { id, name, width, height, frameRate, duration, time, numLayers }, layers: [{ index, id, name, kind, source? }], properties: [{ layer, path, numKeys? }] }`
- `activeComp({}) -> { id, name } | null`
- `snapshot({ compId, from, count }) -> { comp: { id, name, width, height, duration, frameRate, numLayers }, layers: [LayerShot], next: number | null }` (paquets de `count` ≤ 20 calques à partir de l'index `from`, `next` = index suivant ou null).
- `LayerShot = { id, index, name, kind, source?: { id, name }, parent: id | null, inPoint, outPoint, startTime, enabled, solo, shy, locked, threeD, props: { [key]: { path, value?, keys?, expression? } } }`, `key` = matchNames jointes par `/`, avec `#n` (index de propriété) sous `ADBE Effect Parade` et `ADBE Mask Parade` ; `path` = noms affichés joints par ` › `.

- [ ] Tests : `context` sur `scene()` (sélection rapportée) ; `snapshot` paginé (`next`), clés stables d'une photo à l'autre, effet indexé `#1`, CUSTOM_VALUE rendu `'[valeur personnalisée]'` ; `activeComp` null sans comp.
- [ ] Implémenter en réutilisant `layerInfo`, `readLeaf`, `layerKind`, `pathOf` ; BOM vérifié ; commit.

### Task 3 : différence d'observation (`js/claude/observe.js`)

**Produces:** `SIMING.claude.diffComp(before, after) -> Change[]`, `SIMING.claude.observationText(diffs: [{ comp, changes }], extra?: { newItems: string[] }) -> string`, `SIMING.claude.countChanges(diffs) -> number`.
`before` / `after` = `{ comp, layers: LayerShot[] }` (paquets de la tâche 2 réunis).
`Change = { kind: 'layerAdded'|'layerRemoved'|'renamed'|'moved'|'prop'|'keys'|'expression'|'effectAdded'|'effectRemoved'|'parent'|'switch'|'timing'|'comp', layer?: { id, index, name }, ... }`.

- [ ] Tests : position changée → ligne `Transformation › Position (ADBE Position) : [960,540] → [1720,980]` ; effet ajouté listé avec ses réglages ; keyframes ajoutées (nombre + temps) ; calque ajouté / supprimé ; rien changé → `[]` ; texte enveloppé `<observation comp="Nom (id N)">`.
- [ ] Implémenter (pur, sans DOM), commit.

### Task 4 : `ask_user` dans le serveur MCP

**Files:** `extension/client/js/mcp/protocol.js`, `server.js`, `service.js`, `tests/mcp-protocol.test.js`, `tests/mcp-server.test.js`.

**Produces:**
- Outil `ask_user` `{ question: string, options?: [{ label, description? }], multiple?: boolean }` (hors file d'attente AE).
- `createHandler({ …, ask })` : `ask({ question, options, multiple }, meta) -> Promise(string)` ; `handle(msg, meta)` avec `meta = { client }` ; le serveur passe `{ client: req.headers['x-siming-client'] || '' }`.
- Événements `mcp.EVENTS.ask = 'com.siming.mcp.ask'` (service → hub `{ id, client, question, options, multiple }`), `answer = 'com.siming.mcp.answer'` (hub → service `{ id, text }`), `tab = 'com.siming.mcp.tab'` (hub → service `{ client }` : onglet actif, `''` à la fermeture).
- Service : question pour un `client` différent de l'onglet actif → aussitôt `mcp.NOBODY` (« Personne ne peut répondre dans SIMING : décide prudemment ou arrête-toi et explique. »).

- [ ] Tests : `ask_user` rend la réponse de `ask` ; sans `ask` → `NOBODY` ; `meta.client` transmis ; un appel `run_extendscript` n'attend pas une question en cours (pas dans la file) ; serveur transmet l'en-tête.
- [ ] Implémenter, commit.

### Task 5 : lecture du flux (`js/claude/stream.js`) et Markdown (`js/claude/markdown.js`)

**Produces:**
- `SIMING.claude.lineSplitter(onLine) -> (chunk: string) => void` (garde le reste incomplet).
- `SIMING.claude.parseEvent(obj) -> ViewEvent[]` : `{ type: 'init', sessionId, model }`, `{ type: 'delta', text }` (de `stream_event` / `text_delta`), `{ type: 'text', text }` (bloc texte complet d'un message `assistant`), `{ type: 'tool', id, name, input }`, `{ type: 'toolResult', id, isError, text, images: [{ data, mimeType }] }`, `{ type: 'done', sessionId, isError, text }`, `{ type: 'auth', text }` (résultat en erreur dont le texte parle de login / authentification / clé API / 401).
- `SIMING.claude.toolLabel(name, input) -> string` (préfixe `mcp__siming__` retiré ; libellés de `activityLabel`).
- `SIMING.claude.renderMarkdown(doc, text) -> DocumentFragment` : paragraphes, `**gras**`, `` `code` ``, blocs ```` ``` ````, listes `-` / `1.` ; jamais d'HTML brut.

- [ ] Tests à partir de lignes réelles (format vérifié sur 2.1.185 : `system/init`, `stream_event` `content_block_delta`, `assistant`, `user` `tool_result`, `result`) ; ligne coupée en deux paquets ; ligne illisible ignorée ; Markdown avec `<script>` rendu en texte.
- [ ] Implémenter, commit.

### Task 6 : lancer Claude Code (`js/claude/cli.js`)

**Produces:**
- `SIMING.claude.candidates(platform, env) -> string[]`
- `SIMING.claude.findClaude({ fs, execFile, platform, env, configured }) -> Promise(path | null)`
- `SIMING.claude.buildArgs({ port, token, client, resume, model, systemPrompt }) -> string[]`
- `SIMING.claude.createSession({ spawn, file, args, cwd, env }) -> { send(text), stop(), on(type, fn), alive }` : écrit `{"type":"user","message":{"role":"user","content":text}}\n` ; événements `ViewEvent` + `{ type: 'exit', code, stderr }`.
- `SIMING.claude.SYSTEM_PROMPT` (consignes du § 5.4 de la spec).
- `SIMING.claude.loginCommand(platform, file) -> { file, args }` (terminal qui lance `claude`).

- [ ] Tests avec faux `spawn` (EventEmitter) : arguments exacts (`--mcp-config` JSON avec `Authorization: Bearer` et `X-Siming-Client`) ; `--resume` seulement si donné ; message écrit en JSON ligne ; sortie du processus → `exit` ; Windows `.cmd` lancé via `shell: true`.
- [ ] Implémenter, commit.

### Task 7 : la vue (`tools/claude.js`) et ses réglages

**Files:** `extension/client/tools/claude.js`, `css/charte.css`, `index.html` (scripts `js/claude/*`), `js/mcp/settings.js` (chemin de Claude Code, modèle, Tester), `tests/claude-view.test.js`.

- [ ] Tests (faux `ctx.claude` + faux processus) : sans Node → message « dans After Effects seulement » ; Claude introuvable → aide d'installation ; envoi = contexte `<contexte_ae>` préfixé, bulle utilisateur, flux de texte, ligne d'outil, fin ; question `ask` → carte, clic sur option → `answer` émis, saisie réactivée ; erreur d'auth → bouton Se connecter ; Observer : photo au début et à la fin → pastille « Observation : n changements » jointe au message suivant ; Nouvelle conversation efface le fil et le fichier ; fil restauré au montage.
- [ ] Implémenter, commit.

### Task 8 : documentation et version

- [ ] `tools.json` 1.6.0 ; README (section Claude) ; `docs/TESTS-MANUELS.md` ; `docs/SUIVI.md` ; `docs/NOTES-EXTENDSCRIPT.md` (lancer Claude Code depuis CEP) ; `CLAUDE.md` (état 1.6.0) ; `node tests/run.js` → `0 échoué(s)` ; `node tools/release.js --dry-run` ; commit.
