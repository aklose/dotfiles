# dotfiles 🏠

Files under `home/` mirror `$HOME` and are copied into place.

Currently tracked:

- Claude Code status line mod (`mods/statusline`, loaded in place)
- fish config (`~/.config/fish/config.fish`)
- git config (`~/.gitconfig`)

## New machine

```sh
git clone <repo-url> ~/dev/dotfiles
~/dev/dotfiles/install.sh
```

Existing files are moved to `~/.dotfiles_backup/<timestamp>/` before copying.

The script also points `env.CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json` at the status line mod and removes any `statusLine` command, keeping other settings, or creates the file if it's missing. Requires `jq`.

The mod draws a live band above the prompt. Check it with `claude plugin validate mods/statusline` and `claude plugin test mods/statusline`.

## Adding a file

Move it into `home/` at the same relative path, then run `./install.sh`.
