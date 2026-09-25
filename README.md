# dotfiles 🏠

Files under `home/` mirror `$HOME` and are symlinked into place.

Currently tracked:

- Claude Code status line (`~/.claude/statusline.sh`)
- fish config (`~/.config/fish/config.fish`)

## New machine

```sh
git clone <repo-url> ~/dev/dotfiles
~/dev/dotfiles/install.sh
```

Existing files are moved to `~/.dotfiles_backup/<timestamp>/` before linking.

The script also sets `statusLine` in `~/.claude/settings.json`, keeping any other settings, or creates the file if it's missing. Requires `jq`.

## Adding a file

Move it into `home/` at the same relative path, then run `./install.sh`.
