#!/bin/bash
# SIMING - installation et mise à jour (macOS). Double-cliquer ce fichier.
REPO="__REPO__"
# Modèle lancé depuis le dépôt (pas rempli par release.js) : dépôt lu dans tools.json.
if [ "$REPO" = "__""REPO__" ]; then
  REPO=$(sed -n 's/.*"repository"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$(dirname "$0")/../../extension/client/tools.json" 2>/dev/null | head -n 1)
fi
# Le .zxp signé est extrait tel quel dans le dossier des extensions de l'utilisateur : After Effects
# le charge (signature vérifiée), sans mot de passe. Plus d'UPIA : il passe par l'application
# Creative Cloud, échoue si on n'y est pas connecté (status -631) et sort quand même avec le code 0.
USER_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions"
TARGET="$USER_DIR/com.siming"
# Où UPIA installait SIMING jusqu'à la 1.3.1 : une copie là-bas ferait deux SIMING.
SYSTEM_TARGET="/Library/Application Support/Adobe/CEP/extensions/com.siming"
UPIA="/Library/Application Support/Adobe/Adobe Desktop Common/RemoteComponents/UPI/UnifiedPluginInstallerAgent/UnifiedPluginInstallerAgent.app/Contents/MacOS/UnifiedPluginInstallerAgent"

finish() { echo; read -r -p "  Appuie sur Entrée pour fermer." _; exit "${1:-0}"; }

echo
echo "  SIMING - installation / mise à jour"
echo

installed=""
for d in "$TARGET" "$SYSTEM_TARGET"; do
  m="$d/CSXS/manifest.xml"
  if [ -f "$m" ]; then
    installed=$(sed -n 's/.*ExtensionBundleVersion="\([^"]*\)".*/\1/p' "$m" | head -n 1)
    break
  fi
done
if [ -n "$installed" ]; then echo "  Version installée : $installed"; else echo "  SIMING n'est pas encore installé."; fi

json=$(curl -fsSL -H "User-Agent: SIMING-Installer" -H "Accept: application/vnd.github+json" "https://api.github.com/repos/$REPO/releases?per_page=100") || { echo "  Impossible de joindre GitHub."; finish 1; }

list=$(osascript -l JavaScript - "$json" <<'JXA'
function run(argv) {
  var out = [];
  JSON.parse(argv[0]).forEach(function (r) {
    if (r.draft) return;
    if (r.prerelease) return;
    var a = (r.assets || []).filter(function (x) { return /\.zxp$/.test(x.name); })[0];
    if (!a) return;
    var note = (r.body || '').split('\n')[0].replace(/\t/g, ' ').trim();
    out.push([r.tag_name, a.browser_download_url, a.name, note].join('\t'));
  });
  return out.join('\n');
}
JXA
)

if [ -z "$list" ]; then echo "  Aucune version publiée pour le moment."; finish 0; fi

echo
echo "  Versions disponibles :"
i=0
while IFS=$'\t' read -r tag url name note; do
  i=$((i + 1))
  label="$tag"
  [ "$i" -eq 1 ] && label="$tag  (dernière)"
  echo "    $i) $label   $note"
done <<< "$list"
echo
read -r -p "  Entrée = dernière version, ou tape un numéro : " answer
[ -z "$answer" ] && answer=1
if ! [[ "$answer" =~ ^[0-9]+$ ]] || [ "$answer" -lt 1 ] || [ "$answer" -gt "$i" ]; then echo "  Numéro inconnu."; finish 1; fi

line=$(sed -n "${answer}p" <<< "$list")
IFS=$'\t' read -r tag url name note <<< "$line"
work=$(mktemp -d "${TMPDIR:-/tmp}/siming.XXXXXX") || { echo "  Dossier temporaire impossible."; finish 1; }
tmp="$work/$name"
echo "  Téléchargement de $tag..."
curl -fsSL -H "User-Agent: SIMING-Installer" -o "$tmp" "$url" || { echo "  Téléchargement impossible."; rm -rf "$work"; finish 1; }

# Seule l'application compte (processus « After Effects »). Ne pas chercher « Adobe After Effects »
# dans les lignes de commande (option -f de pgrep) : les processus d'appoint rangés dans son dossier
# (CEPHtmlEngine, AdobeCRDaemon...) survivent parfois à sa fermeture et l'installeur bouclait.
while pgrep -x "After Effects" >/dev/null; do
  echo "  After Effects est ouvert : quitte-le avec Cmd + Q (fermer sa fenêtre ne suffit pas)."
  echo "  S'il ne répond plus : Cmd + Option + Échap, After Effects, Forcer à quitter."
  read -r -p "  Entrée quand c'est fait (i = installer quand même, pris en compte au prochain lancement) : " go || finish 1
  [ "$go" = "i" ] && break
done

echo "  Installation..."
new="$work/com.siming"
if ! ditto -x -k "$tmp" "$new" || [ ! -f "$new/CSXS/manifest.xml" ] || [ ! -f "$new/META-INF/signatures.xml" ]; then
  echo "  Fichier téléchargé illisible ou incomplet : relance l'installeur."
  rm -rf "$work"
  finish 1
fi
xattr -cr "$new" 2>/dev/null || true
mkdir -p "$USER_DIR" || { echo "  Dossier des extensions impossible à créer : $USER_DIR"; rm -rf "$work"; finish 1; }

# Installation précédente. Un lien (tools/dev-install.command --link) : on ne retire que le lien,
# jamais rm -r, qui suivrait vers le dépôt. Sinon c'est une copie de SIMING : remplacée.
if [ -L "$TARGET" ]; then
  rm "$TARGET" && echo "  Lien de développement retiré (tools/dev-install.command pour le remettre)."
elif [ -e "$TARGET" ]; then
  rm -rf "$TARGET"
fi
if ! mv "$new" "$TARGET"; then
  echo "  Installation impossible dans $USER_DIR."
  rm -rf "$work"
  finish 1
fi
rm -rf "$work"

# Ancienne installation par UPIA (dossier système) : retirée, sinon After Effects verrait deux SIMING.
if [ -e "$SYSTEM_TARGET" ] && [ -x "$UPIA" ]; then
  "$UPIA" --remove SIMING >/dev/null 2>&1 || true
fi
if [ -e "$SYSTEM_TARGET" ]; then
  echo "  Une ancienne installation reste dans /Library : macOS va demander ton mot de passe pour la retirer."
  osascript -e "do shell script \"rm -rf '$SYSTEM_TARGET'\" with administrator privileges" >/dev/null 2>&1 || true
  if [ -e "$SYSTEM_TARGET" ]; then
    echo "  Ancienne installation toujours là : supprime ce dossier à la main :"
    echo "    $SYSTEM_TARGET"
  fi
fi

echo
echo "  SIMING $tag installé. Ouvre After Effects > Fenêtre > Extensions > SIMING."
finish 0
