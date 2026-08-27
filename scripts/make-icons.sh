#!/usr/bin/env bash
# Rasterize public/icons/mark.svg into the PNG sizes the manifest and iOS need.
# Re-run after editing mark.svg. Requires rsvg-convert (librsvg).
set -euo pipefail
cd "$(dirname "$0")/.."

ICONS=public/icons
SRC=$ICONS/mark.svg

command -v rsvg-convert >/dev/null || { echo "rsvg-convert not found (pacman -S librsvg)"; exit 1; }

rsvg-convert -w 192 -h 192 "$SRC" -o "$ICONS/icon-192.png"
rsvg-convert -w 512 -h 512 "$SRC" -o "$ICONS/icon-512.png"
# iOS ignores the manifest's icons and reads apple-touch-icon; 180px is the
# size current iPhones ask for.
rsvg-convert -w 180 -h 180 "$SRC" -o "$ICONS/apple-touch-icon.png"

# Maskable: Android crops to a platform-chosen shape, so the mark has to sit
# inside the 80%-diameter safe circle. Scale it to 62% on a full-bleed field.
rsvg-convert -w 512 -h 512 "$ICONS/mark-maskable.svg" -o "$ICONS/icon-maskable-512.png"

echo "wrote:"
ls -1 "$ICONS"/*.png
