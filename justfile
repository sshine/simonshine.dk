# See available `just` subcommands
list:
    just --list

# Create scaffolding and hugo.toml
init:
    hugo new site . --force

# Serve website on http://127.0.0.1:1313/
serve:
    hugo serve -D

# Create new post in content/posts/
post MDFILE:
    mkdir -p content/articles
    hugo new content 'content/articles/{{ MDFILE }}' || true

# Build the Hugo site using default.nix
build-nix:
    nix build .# --out-link public-result

# Build the Hugo site using shell.nix with random color scheme
# Color schemes defined in config/{green,cyan,purple,red,orange,blue,yellow}/params.toml
# To test a specific color: hugo --theme m10c-dev --environment <color>
build-dev:
    #!/usr/bin/env bash
    COLORS=(green cyan purple red orange blue yellow)
    RANDOM_COLOR=${COLORS[$RANDOM % ${#COLORS[@]}]}
    echo "Building with $RANDOM_COLOR color scheme"
    hugo --minify --theme m10c-dev --environment $RANDOM_COLOR

# Deploy DIR to REMOTE_DIR on SERVER using tar/ssh/scp
deploy DIR='public/' SERVER='feng' REMOTE_DIR='/var/www/simonshine.dk':
    just build-dev
    tar cfz public.tgz {{ DIR }}
    scp public.tgz {{ SERVER }}:{{ REMOTE_DIR }}
    ssh {{ SERVER }} 'cd {{ REMOTE_DIR }} && tar xfz public.tgz'
