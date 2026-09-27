image_name := "git.shine.town/sites/simonshine.dk"

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
      skopeo copy --insecure-policy "${creds[@]}" \
        docker-archive:image.tar.gz \
        "docker://{{ image_name }}:$tag"
    done

# Create scaffolding and hugo.toml
init:
    hugo new site . --force

# Serve website on http://127.0.0.1:1313/
serve:
    hugo serve -D

# Screenshot pages at PHONE and DESKTOP widths into shots/ (for eyeballing CSS changes)
shots WIDTHS='390 1280' *PATHS='/ /articles/ /about/ /articles/nix-boids/':
    #!/usr/bin/env bash
    set -euo pipefail
    mkdir -p shots
    hugo serve -D --port 1414 --renderToMemory >/dev/null 2>&1 &
    server=$!
    trap 'kill $server 2>/dev/null || true' EXIT
    until curl -sf http://127.0.0.1:1414/ >/dev/null; do sleep 0.2; done
    for w in {{ WIDTHS }}; do
      for p in {{ PATHS }}; do
        name="$(echo "$p" | tr -cs 'a-zA-Z0-9' '-' | sed 's/^-//;s/-$//')"
        out="shots/${name:-home}-${w}.png"
        playwright screenshot --channel chromium-headless-shell --full-page \
          --viewport-size "$w,900" "http://127.0.0.1:1414$p" "$out" >/dev/null
        # A full-page capture is as wide as the document, so anything above the
        # viewport width is content the phone can only reach by scrolling sideways.
        actual="$(file -b "$out" | grep -oE '[0-9]+ x [0-9]+' | cut -dx -f1 | tr -d ' ')"
        if [ "$actual" -gt "$w" ]; then
          echo "OVERFLOW $out: ${actual}px wide at ${w}px viewport"
        fi
      done
    done
    echo "wrote shots/"

# Create new post in content/posts/
post MDFILE:
    mkdir -p content/articles
    hugo new content 'content/articles/{{ MDFILE }}' || true

# Build the Hugo site using default.nix
build-nix:
    nix build .# --out-link public-result

# Build the Hugo site using shell.nix with random color scheme
# Color schemes defined in config/{green,cyan,purple,red,orange,blue,yellow}/params.toml
# To test a specific color: hugo --environment <color>
build-dev:
    #!/usr/bin/env bash
    COLORS=(green cyan purple red orange blue yellow)
    RANDOM_COLOR=${COLORS[$RANDOM % ${#COLORS[@]}]}
    echo "Building with $RANDOM_COLOR color scheme"
    hugo --minify --environment $RANDOM_COLOR

# Deploy DIR to REMOTE_DIR on SERVER using tar/ssh/scp
deploy DIR='public/' SERVER='feng' REMOTE_DIR='/var/www/simonshine.dk':
    just build-dev
    tar cfz public.tgz {{ DIR }}
    scp public.tgz {{ SERVER }}:{{ REMOTE_DIR }}
    ssh {{ SERVER }} 'cd {{ REMOTE_DIR }} && tar xfz public.tgz'
