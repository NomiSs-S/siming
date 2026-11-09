#!/bin/bash
# SIMING - installation de développement sur macOS (machine de l'auteur uniquement).
# Active les extensions non signées (PlayerDebugMode), génère le manifeste et COPIE extension/
# dans le dossier des extensions CEP, sur le disque interne.
#
# Pourquoi une copie : le dépôt est sur un disque externe (exFAT). Un lien vers lui faisait
# disparaître SIMING dès que le disque changeait de nom (« EXT 11 » devenu « KINGSTON »), était
# éjecté ou démonté par la mise en veille.
#
#   tools/dev-install.command          copie ; à relancer après chaque modification
#   tools/dev-install.command --link   lien vers le dépôt : une modification compte dès qu'on
#                                      recharge le panneau, mais le disque doit rester branché
#                                      sous le même nom
# SIMING_CEP_DIR : autre dossier d'extensions (tests) ; PlayerDebugMode n'est alors pas touché.
set -e
cd "$(dirname "$0")/.."
SRC="$(pwd)/extension"
DEST="${SIMING_CEP_DIR:-$HOME/Library/Application Support/Adobe/CEP/extensions}"
TARGET="$DEST/com.siming"
MARK=".siming-dev"   # présent dans une copie de développement : l'installeur officiel la retire

if [ -z "$SIMING_CEP_DIR" ]; then
  for v in 11 12; do defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1; done
fi
node tools/manifest.js
mkdir -p "$DEST"

# Installation de développement précédente : un lien (on ne retire que le lien, jamais rm -r,
# qui suivrait vers le dépôt) ou une copie marquée. Tout autre dossier : on n'y touche pas.
if [ -L "$TARGET" ]; then
  rm "$TARGET"
elif [ -e "$TARGET" ]; then
  if [ -f "$TARGET/$MARK" ]; then
    rm -rf "$TARGET"
  elif [ -f "$TARGET/META-INF/signatures.xml" ] && [ -f "$TARGET/CSXS/manifest.xml" ]; then
    # Copie signée posée par l'installeur (même dossier depuis la 1.4.0) : remplacée.
    rm -rf "$TARGET"
    echo "SIMING installé par l'installeur remplacé par la copie de développement."
  else
    echo "Un SIMING qui ne vient pas de ce script est déjà dans $TARGET : rien n'est fait."
    echo "Retire-le à la main (ou désinstalle-le), puis relance ce script."
    exit 1
  fi
fi

if [ "$1" = "--link" ]; then
  ln -s "$SRC" "$TARGET"
  echo
  echo "SIMING relié : $TARGET -> $SRC"
  echo "Le disque doit rester branché sous le même nom, sinon SIMING disparaît d'After Effects."
else
  TMP="$(mktemp -d)"
  cp -R "$SRC" "$TMP/com.siming"
  # Fichiers « ._ » et .DS_Store de macOS : jamais dans l'extension (After Effects évaluerait
  # un ._outil.jsx comme du code), ni attributs étendus (quarantaine, provenance).
  find "$TMP/com.siming" \( -name '._*' -o -name '.DS_Store' \) -delete
  xattr -cr "$TMP/com.siming" 2>/dev/null || true
  touch "$TMP/com.siming/$MARK"
  mv "$TMP/com.siming" "$TARGET"
  rmdir "$TMP" 2>/dev/null || true
  version=$(sed -n 's/.*ExtensionBundleVersion="\([^"]*\)".*/\1/p' "$TARGET/CSXS/manifest.xml" | head -n 1)
  echo
  echo "SIMING $version copié : $TARGET"
  echo "Après une modification du code : relance ce script, puis After Effects."
fi

if [ -d "/Library/Application Support/Adobe/CEP/extensions/com.siming" ]; then
  echo "Attention : un SIMING installé par l'installeur est aussi dans /Library/Application Support/Adobe/CEP/extensions."
  echo "After Effects en verrait deux : supprime ce dossier (mot de passe demandé)."
fi
if pgrep -x "After Effects" >/dev/null; then
  echo "After Effects est ouvert : quitte-le (Cmd + Q) et relance-le."
else
  echo "Lance After Effects, puis Fenêtre > Extensions > SIMING."
fi
