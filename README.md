# SIMING

Outils pour Adobe After Effects, réunis dans un panneau : un rail d'outils, une
vue par outil, une ligne de statut commune. Chaque outil peut aussi s'ouvrir seul
dans son propre panneau.

> Version 1.0.0 : extension CEP pour After Effects 2024 et plus (Windows, macOS).

| Outil | Version | Rôle |
|---|---|---|
| Unparent | 2.0.0 | Détacher temporairement les enfants d'un calque, puis les rattacher |
| Quick Tools | 1.0.0 | Lisser les keyframes, expression Elastic, point d'ancrage, aligner et répartir |

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
   vitesse 0, influence voulue sur ce côté.
2. **Elastic** : « Appliquer Elastic » pose l'expression de rebond et l'effet « Elastic
   Controller » (Amplitude 20, Frequency 40, Decay 60, à régler dans le panneau Effets)
   sur les propriétés animées sélectionnées ; la croix les enlève.
3. **Point d'ancrage** : une case du carré 3 × 3 (ou 1 à 9 au pavé numérique) place
   l'ancrage des calques sélectionnés sur leur boîte visible, position compensée.
4. **Aligner et répartir** : comme la fenêtre Aligner d'After Effects, par rapport à la
   sélection ou à la composition, sur les bords visibles (rotation, échelle et parents
   pris en compte).

Les boutons portent le verbe seul : la sélection n'est connue qu'au clic, la ligne de
statut dit ensuite combien d'éléments ont été traités. Le dernier geste est cerclé de bleu :
**Entrée** le rejoue sur la nouvelle sélection.

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
