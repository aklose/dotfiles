#!/usr/bin/env bash
set -euo pipefail

DOTFILES="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP="$HOME/.dotfiles_backup/$(date +%Y%m%d_%H%M%S)"

cd "$DOTFILES/home"
find . -type f | sed 's#^\./##' | while read -r rel; do
  src="$DOTFILES/home/$rel"
  dst="$HOME/$rel"
  if [ -L "$dst" ] && [ "$(readlink "$dst")" = "$src" ]; then
    continue
  fi
  mkdir -p "$(dirname "$dst")"
  if [ -e "$dst" ] || [ -L "$dst" ]; then
    mkdir -p "$BACKUP/$(dirname "$rel")"
    mv "$dst" "$BACKUP/$rel"
    echo "backed up $dst"
  fi
  ln -s "$src" "$dst"
  echo "linked $dst"
done

settings="$HOME/.claude/settings.json"
statusline='{"type": "command", "command": "~/.claude/statusline.sh"}'
if [ -f "$settings" ]; then
  tmp="$(mktemp)"
  jq --argjson sl "$statusline" '.statusLine = $sl' "$settings" > "$tmp"
  cat "$tmp" > "$settings"
  rm "$tmp"
  echo "updated statusLine in $settings"
else
  mkdir -p "$(dirname "$settings")"
  jq -n --argjson sl "$statusline" '{statusLine: $sl}' > "$settings"
  echo "created $settings"
fi
