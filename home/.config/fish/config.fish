# The following lines were added by Docker Desktop to add commands to your PATH.
export PATH="$PATH:/Users/aklose/.docker/bin"
# End of Docker Desktop section.

export PATH="$HOME/.local/bin:$PATH"

set -gx EDITOR "zed --wait"
set -gx VISUAL "zed --wait"

if status is-interactive
    starship init fish | source

    neofetch
end
