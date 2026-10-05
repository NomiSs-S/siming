#!/bin/bash
# SIMING - installation et mise à jour (macOS). Double-cliquer ce fichier.
REPO="__REPO__"
UPIA="/Library/Application Support/Adobe/Adobe Desktop Common/RemoteComponents/UPI/UnifiedPluginInstallerAgent/UnifiedPluginInstallerAgent.app/Contents/MacOS/UnifiedPluginInstallerAgent"

finish() { echo; read -r -p "  Appuie sur Entrée pour fermer." _; exit "${1:-0}"; }

echo
echo "  SIMING - installation / mise à jour"
echo

installed=""
for d in "$HOME/Library/Application Support/Adobe/CEP/extensions/com.siming" "/Library/Application Support/Adobe/CEP/extensions/com.siming"; do
  m="$d/CSXS/manifest.xml"
  if [ -f "$m" ]; then
    installed=$(sed -n 's/.*ExtensionBundleVersion="\([^"]*\)".*/\1/p' "$m" | head -n 1)
    break
  fi
done
if [ -n "$installed" ]; then echo "  Version installée : $installed"; else echo "  SIMING n'est pas encore installé."; fi

json=$(curl -fsSL -H "User-Agent: SIMING-Installer" -H "Accept: application/vnd.github+json" "https://api.github.com/repos/$REPO/releases") || { echo "  Impossible de joindre GitHub."; finish 1; }

list=$(osascript -l JavaScript - "$json" <<'JXA'
function run(argv) {
  var out = [];
  JSON.parse(argv[0]).forEach(function (r) {
    if (r.draft) return;
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
tmp="${TMPDIR:-/tmp}/$name"
echo "  Téléchargement de $tag..."
curl -fsSL -H "User-Agent: SIMING-Installer" -o "$tmp" "$url" || { echo "  Téléchargement impossible."; finish 1; }

while pgrep -f "Adobe After Effects" >/dev/null; do
  read -r -p "  After Effects est ouvert : ferme-le, puis appuie sur Entrée " _
done

if [ ! -x "$UPIA" ]; then
  echo "  Installeur Adobe (UPIA) introuvable : Creative Cloud est-il installé ?"
  echo "  Secours : installe $tmp avec ZXP Installer (gratuit) : https://aescripts.com/learn/zxp-installer/"
  finish 1
fi
echo "  Installation..."
if "$UPIA" --install "$tmp"; then
  echo
  echo "  SIMING $tag installé. Ouvre After Effects > Fenêtre > Extensions > SIMING."
  finish 0
else
  echo "  L'installeur Adobe a échoué."
  finish 1
fi
