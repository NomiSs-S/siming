# Installer SIMING (After Effects)

Gratuit. Une seule chose à faire, pour installer comme pour mettre à jour.

## 1. Récupérer l'installeur (une seule fois)

Sur la page des versions de SIMING : https://github.com/NomiSs-S/siming/releases, télécharge :

- **Windows** : `SIMING-Installer-Windows.bat`
- **macOS** : `SIMING-Installer-macOS.zip`, puis double-clique dessus pour obtenir `SIMING-Installer.command`

Range-le où tu veux (Bureau, Documents) : tu le réutiliseras à chaque mise à jour.

## 2. Installer ou mettre à jour

1. Quitte After Effects (sur Mac : **Cmd + Q** ; fermer sa fenêtre ne le quitte pas).
2. Double-clique sur l'installeur.
3. Appuie sur **Entrée** pour la dernière version (ou tape le numéro d'une autre version).
4. Attends « SIMING … installé ».
5. Ouvre After Effects : **Fenêtre › Extensions › SIMING**.

## Première ouverture de l'installeur

L'installeur vient d'Internet et n'est pas signé, le système te prévient la première fois :

- **Windows** : « Windows a protégé votre ordinateur » → **Informations complémentaires** → **Exécuter quand même**.
- **macOS 14 (Sonoma) et avant** : clic droit sur `SIMING-Installer.command` → **Ouvrir** → **Ouvrir**.
- **macOS 15 (Sequoia) et après** : le clic droit ne suffit plus. Double-clique sur `SIMING-Installer.command` (macOS refuse de l'ouvrir), puis va dans **Réglages Système › Confidentialité et sécurité**, descends jusqu'au message sur `SIMING-Installer.command` et clique sur **Ouvrir quand même** (ton mot de passe de session peut être demandé). Relance ensuite l'installeur.

## Une préférence à cocher (Boîte à outils)

Pour **Copier** ou **Exporter** la frame, After Effects doit autoriser les scripts à écrire des
fichiers, une fois pour toutes : **Préférences › Scripts et expressions** › coche
**« Autoriser les scripts à écrire des fichiers et à accéder au réseau »**. Le panneau te le
rappelle si ce n'est pas fait.

## Claude Code dans After Effects (facultatif)

SIMING peut laisser Claude Code lire ton projet et agir dans After Effects. C'est éteint tant
que tu ne l'actives pas.

1. Installe Claude Code : https://claude.com/claude-code (il te faut un compte Claude).
2. Dans After Effects : **Fenêtre › Extensions › SIMING**, Réglages (dernier bouton du rail) ›
   onglet **Claude** › **Activé**.
3. **Copier la commande**, puis colle-la dans un terminal (Windows : PowerShell ou Invite de
   commandes ; macOS : Terminal) et valide. Une seule fois.
4. Relance Claude Code et demande-lui ce que tu veux faire dans After Effects.

Bon à savoir :

- Chaque action de Claude s'annule d'un **Ctrl+Z** (Cmd+Z sur Mac).
- Pour qu'il voie une frame (`capture_frame`), coche la même préférence que pour Copier la
  frame (ci-dessus).
- Ouvre After Effects **avant** Claude Code. Sinon, dans Claude Code : `/mcp`, puis reconnecte
  « siming ».
- L'onglet Claude dit « Service introuvable » : redémarre After Effects. « Port déjà pris » :
  **Changer de port**, puis recolle la commande.
- Nouveau jeton, nouveau port, ou Claude Code connaît déjà « siming » : lance d'abord
  `claude mcp remove --scope user siming`, puis la nouvelle commande.

## Revenir à une version précédente

Relance l'installeur et tape le numéro de la version voulue.

## En cas de souci

- « Une ancienne installation reste… » : les versions jusqu'à la 1.3.1 s'installaient ailleurs.
  Accepte la demande de Windows (ou tape ton mot de passe sur Mac) pour la retirer ; sinon
  After Effects verrait deux SIMING.
- « Installation impossible » : quitte After Effects, puis relance l'installeur.
- « Impossible de joindre GitHub » : vérifie ta connexion Internet, puis relance.
- SIMING n'apparaît pas dans Fenêtre › Extensions : redémarre After Effects.
- Mac, « After Effects est ouvert » alors qu'il semble fermé : il tourne encore sans fenêtre.
  Quitte-le avec Cmd + Q, ou Cmd + Option + Échap › After Effects › **Forcer à quitter** s'il ne
  répond plus. En dernier recours, tape `i` : l'installation se fait et compte au prochain lancement.
