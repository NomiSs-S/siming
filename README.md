# SIMING

Outils pour Adobe After Effects, réunis dans un panneau : un rail d'outils, une
vue par outil, une ligne de statut commune. Chaque outil peut aussi s'ouvrir seul
dans son propre panneau.

> **Refonte en cours** : SIMING passe de ScriptUI à une extension CEP (interface
> HTML/CSS) pour un rendu fidèle à la charte. Spec :
> `docs/superpowers/specs/2026-10-05-siming-cep-design.md`.

| Outil | Version | Rôle |
|---|---|---|
| Unparent | 2.0.0 (prévu en 1.0.0) | Détacher temporairement les enfants d'un calque, puis les rattacher |

## Installation (à partir de la 1.0.0)

Télécharger `SIMING - Installer` (Windows `.bat`, macOS `.command`), fermer After
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

## Développement

```
node tests/run.js        # tests sans After Effects (faux AE, pont, vues)
```

Documentation : `CLAUDE.md` (conventions), `docs/SUIVI.md` (journal, pistes,
erreurs), `docs/NOTES-EXTENDSCRIPT.md` (pièges), `docs/CHARTE-GRAPHIQUE.md`,
`docs/design/icons.json` (tracés des icônes), `docs/superpowers/specs/` (specs).
