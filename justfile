image_name := "git.shine.town/sshine/simonshine.dk"

# See available `just` subcommands
list:
    just --list

# Build the static-site container image to image.tar.gz
build-image:
    nix build .#image -o image.tar.gz

# Push image.tar.gz to the Forgejo registry as :latest and :TAG (SKOPEO_DEST_CREDS = "user:token" for CI)
push-image TAG='latest': build-image
    #!/usr/bin/env bash
    set -euo pipefail
    creds=()
    if [ -n "${SKOPEO_DEST_CREDS:-}" ]; then
      creds=(--dest-creds "$SKOPEO_DEST_CREDS")
    fi
    for tag in latest "{{ TAG }}"; do
      nix run nixpkgs#skopeo -- copy --insecure-policy "${creds[@]}" \
        docker-archive:image.tar.gz \
        "docker://{{ image_name }}:$tag"
    done

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
