#!/bin/bash
# SIMING - installation de développement (machine de l'auteur uniquement).
# Active les extensions non signées (PlayerDebugMode), génère le manifeste
# et relie le dossier extension/ au dossier des extensions CEP.
set -e
cd "$(dirname "$0")/.."
for v in 11 12; do defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1; done
node tools/manifest.js
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions"
mkdir -p "$DEST"
rm -f "$DEST/com.siming"
ln -s "$(pwd)/extension" "$DEST/com.siming"
echo
echo "SIMING relié : $DEST/com.siming"
echo "Relance After Effects, puis Fenêtre > Extensions > SIMING."
