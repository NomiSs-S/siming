# Claude Code dans After Effects (serveur MCP de SIMING)

Date : 2026-11-06. Version : SIMING 1.4.0.

## 1. But

Laisser Claude Code lire le projet After Effects ouvert et y agir, sans limite (ExtendScript
libre), pour Simon et ses collègues, sans rien installer d'autre que SIMING et Claude Code.

## 2. Architecture

```
Claude Code ──HTTP (MCP, 127.0.0.1:47821/mcp, jeton)──▶ extension invisible com.siming.mcp
                                                          (claude.html, Node de CEP)
                                                                │ evalScript
                                                                ▼
                                                  SIMING.call('mcp' | outil, fonction, args)
                                                          (host/siming.jsx, tools/mcp.jsx)
```

- **Service** : extension CEP invisible (`Type` Custom, `AutoVisible` false, sans menu),
  démarrée au lancement d'After Effects (`StartOn`) et, à défaut, par le hub
  (`requestOpenExtension`) quand elle ne répond pas.
- **Transport** : MCP « Streamable HTTP » réduit au nécessaire : `POST /mcp` reçoit un message
  JSON-RPC (ou un lot) et répond en `application/json` ; notification = 202 sans corps ;
  `GET` = 405 (pas de flux SSE). Versions de protocole : 2025-06-18, 2025-03-26, 2024-11-05.
- **Sans dépendance** : protocole et serveur écrits à la main (`js/mcp/protocol.js`,
  `js/mcp/server.js`), modules Node (`http`, `fs`, `path`, `crypto`) passés en argument :
  testés sous Node avec le faux AE.
- **Hub ↔ service** : réglages dans `<USER_DATA>/SIMING/claude.json` (`{ enabled, port, token }`,
  écrits par le hub seulement) ; événements CEP `com.siming.mcp.reload` / `ping` (hub → service),
  `state` / `activity` (service → hub).

## 3. Outils MCP

| Outil | Cœur hôte | Rôle |
|---|---|---|
| `get_project` | `mcp.project` | éléments (id, nom, nature, dossier, taille…), élément actif, sélection ; filtres `kind`, `name`, `limit` |
| `get_comp` | `mcp.comp` | format, temps, calques (nature, parent, source, temps, interrupteurs non par défaut, transformation, effets, masques, propriétés animées, expressions), sélection |
| `get_properties` | `mcp.properties` | arbre des propriétés d'un calque (nom, matchName, valeur, keyframes, expression) ; `path`, `depth`, `keys` |
| `run_extendscript` | `mcp.run` | `new Function('log', code)` dans `SIMING.ae.undo('Claude : <undoName>')` ; valeur rendue en données simples, journal, erreur avec ligne |
| `capture_frame` | `mcp.frame` | `saveFrameToPng` dans le dossier temporaire ; le service attend le bloc IEND, réduit à 1568 px (canevas) et renvoie l'image |
| `siming_tool` | outil SIMING | 16 gestes de Quick Tools et de la Boîte à outils (`SIMING.mcp.GESTURES`), sur la comp active et sa sélection |

Règles : un appel à la fois (file d'attente) ; délai 60 s par défaut (`timeoutSeconds`, 5–600) ;
réponse texte tronquée au-delà de 120 000 caractères ; un échec d'outil est un résultat
`isError`, pas une erreur JSON-RPC. Les `instructions` d'`initialize` rappellent ES3, la lecture
d'abord, la vérification par capture, l'interdiction des boîtes de dialogue et de demander avant
d'enregistrer, supprimer, écrire des fichiers ou rendre.

## 4. Sécurité

- Éteint par défaut ; port fermé tant que l'onglet Claude n'est pas sur Activé.
- Écoute `127.0.0.1` seulement. Refus (403) : `Host` autre que `127.0.0.1` / `localhost`
  (rebinding DNS), en-tête `Origin` présent (navigateur), jeton absent ou faux (comparaison en
  temps constant). 403 plutôt que 401 : Claude Code tenterait une connexion OAuth.
- Jeton aléatoire de 24 octets, renouvelable (« Nouveau jeton ») ; fichier de réglages en
  `0600` quand le système le permet.
- Ce que Claude fait reste un script : tout est possible dans le projet ouvert. Garde-fous :
  groupe d'annulation par appel, instructions, ligne de statut du hub.

## 5. Interface (Réglages › Claude)

Interrupteur segmenté Éteint / Activé ; état à pastille (Éteint, Démarrage, Actif + port + appels,
erreur, Service introuvable) ; « Changer de port » si le port est pris ; commande
`claude mcp add …` à copier (bouton principal) ; Nouveau jeton ; rappels (`claude mcp remove`,
`/mcp` pour reconnecter, Ctrl+Z).

## 6. Limites connues

- After Effects ne démarre peut-être pas seul l'extension invisible : ouvrir le hub une fois.
- Claude Code se connecte à son lancement : After Effects fermé à ce moment, `/mcp` puis
  reconnecter.
- Un appel bloqué par une fenêtre modale d'AE expire, mais peut s'exécuter plus tard.
- Unparent et Libellés (à état) ne sont pas dans `siming_tool` : `run_extendscript` suffit.
