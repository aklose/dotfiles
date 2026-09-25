
export PATH="$HOME/.local/bin:$PATH"

set -gx EDITOR "zed --wait"
set -gx VISUAL "zed --wait"

if status is-interactive
    starship init fish | source

    neofetch
end
