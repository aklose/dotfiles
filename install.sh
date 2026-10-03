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
mods="$DOTFILES/mods/statusline"
if [ -f "$settings" ]; then
  tmp="$(mktemp)"
  jq --arg mods "$mods" 'del(.statusLine) | .env.CLAUDE_CODE_PLUGIN_DIRS = $mods' "$settings" > "$tmp"
  cat "$tmp" > "$settings"
  rm "$tmp"
  echo "updated $settings"
else
  mkdir -p "$(dirname "$settings")"
  jq -n --arg mods "$mods" '{env: {CLAUDE_CODE_PLUGIN_DIRS: $mods}}' > "$settings"
  echo "created $settings"
fi

if [ -L "$HOME/.claude/statusline.sh" ] && [ ! -e "$HOME/.claude/statusline.sh" ]; then
  rm "$HOME/.claude/statusline.sh"
  echo "removed stale ~/.claude/statusline.sh"
fi
