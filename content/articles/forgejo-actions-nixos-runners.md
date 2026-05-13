+++
date = '2026-04-23T22:06:40+02:00'
draft = false
title = 'NixOS runners on Forgejo Actions'
+++

> **Note:** You can see the project in action here: https://git.shine.town/infra/runners

I decided to bootstrap a Kubernetes cluster with [Talos](https://www.talos.dev/) and
[kubenix](https://kubenix.org/) during my vacation.

A lot of experience came out of that, and I'm trying to unpack it gradually.

One of the things I host on this cluster is [Forgejo](https://forgejo.org/), which is
[Codeberg](https://codeberg.org/)'s fork of Gitea. Forgejo has [Forgejo
Actions](https://forgejo.org/docs/next/user/actions/reference/) which is a CI system that mimicks
GitHub Actions, and it has a [Container Registry](https://forgejo.org/docs/next/user/packages/container/)
much like GHCR, or DockerHub.

The purpose of running Forgejo in a Kubernetes cluster is practical: I want for the cluster to
become self-contained, and almost all services running in it are open source and their Helm charts
and OCI images exist on the internet. This means downloading them for redeployments inevitably leads
to external failure. Hosting and vendoring local mirrors means predictable behavior.

The standard approach for CI runners is to use `ubuntu-latest`. Since all my infrastructure and all
my projects are defined using Nix, this requires either installing the Nix package manager on every
CI invocation, installing and caching it, building a CI action that makes this easier, or making a
custom image that contains it already.

I'll go with building a custom container image with Nix. I might as well make this image NixOS-based
by baking a minimal NixOS userland in, push it to my Forgejo registry, and reference it as `runs-on:
nixos`.

## The image

The image is built with `dockerTools.buildImage` from nixpkgs. No Dockerfile, no layers to reason
about -- just a Nix expression that declares what goes in.

```nix
pkgs.dockerTools.buildImage {
  name = "nixos";
  tag = "latest";

  copyToRoot = [
    rootEnv
    nixConf
    sslCerts
    # ...filesystem scaffolding
  ];

  config = {
    Cmd = [ "/bin/bash" ];
    Env = [
      "PATH=/bin"
      "SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt"
      "NIX_SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt"
      "HOME=/root"
    ];
  };
}
```

`rootEnv` is a `buildEnv` containing the packages the runner needs: bash, coreutils, git, curl, nix itself, and a handful of compression tools. The nix binaries are symlinked from a small derivation rather than pulling in the full Nix profile, keeping the image lean.

A `nix.conf` is baked in with flakes enabled and sandboxing off (containers are already sandboxed):

```
build-users-group =
experimental-features = nix-command flakes
sandbox = false
substituters = https://cache.nixos.org
trusted-public-keys = cache.nixos.org-1:6NCHdD59X431o0gWypbMrAURkbJ16ZPMQFGspcDShjY=
```

Setting `build-users-group =` to empty avoids the need for a multi-user Nix installation. There's only root in this container.

## Building and pushing

The CI pipeline builds the image, tags it with the nixpkgs date, and pushes it with
[skopeo](https://github.com/containers/skopeo):

```yaml
- name: Build runner image
  run: nix build .#nixos -o nixos.tar.gz

- name: Push image to registry
  run: |
    registry="docker://git.shine.town/infra/runners/nixos"
    creds="forgejo_admin:${{ secrets.RUNNERS_PACKAGE_UPLOAD_KEY }}"
    for tag in latest unstable "${{ steps.nixpkgs-date.outputs.date_tag }}"; do
      nix run nixpkgs#skopeo -- copy \
        --insecure-policy \
        --dest-creds "$creds" \
        docker-archive:nixos.tar.gz \
        "${registry}:${tag}"
    done
```

I use skopeo instead of Docker because there's no Docker daemon in the CI environment. `nix run nixpkgs#skopeo` pulls it ephemerally -- no need to install it in the runner image.

The date tag comes from flake.lock: extract the `lastModified` timestamp from the nixpkgs input and format it as `YYYYMMDD`. This means I can always trace which nixpkgs snapshot a runner image was built from.

## Bootstrapping

The workflow runs on `ubuntu-latest` to build the image, then tests it on `nixos` -- the image it just pushed. There's a chicken-and-egg problem here: the first push has to be done manually or from a runner that already exists. After that, the pipeline is self-sustaining.

The `ubuntu-latest` job installs Nix via the Determinate Systems installer with `--init none` (no systemd in containers) and `--no-confirm` (no interactive prompts). I only did that because the normal Nix installer complains when installing as root.

## Keeping it updated

A `justfile` automates the bump:

```
bump:
    nix flake update
    @last_modified=$(nix eval --impure --expr \
      '(builtins.fromJSON (builtins.readFile ./flake.lock)).nodes.nixpkgs.locked.lastModified') && \
        date_tag=$(date -u -d "@${last_modified}" +%Y%m%d) && \
        git add flake.lock && \
        git commit -m "chore(ci): Update nixos to ${date_tag}" && \
        git push
```

`just bump` updates nixpkgs, commits with the date, and pushes. The CI pipeline picks it up, builds a new image, and pushes it to the registry.

I do this because when I revisit this projects months later, I won't be able to remember what command I was using.

## Using it

Any repo on the Forgejo instance can now use the NixOS runner:

```yaml
jobs:
  build:
    runs-on: nixos
    steps:
      - uses: actions/checkout@v4
      - run: nix build
      - run: nix flake check
```

No Nix installation step. No cache configuration. The flake's `nix develop -c` pattern from my [earlier article on CI with Nix](/articles/speeding-up-ci-with-nix/) works without modification -- just drop the `nix-quick-install-action` step.

I have made it a goal in life to avoid using Docker. 

Here are some of the choices and the reasoning behind:

- `pkgs.dockerTools`* instead of Docker Buildx: TODO
- skopeo instead of Docker CLI: Skopeo is used to interact with container registries.
- Determinate Nix with `--init none`: The default Nix installer tries to set up systemd services,
  which fails in containers. The Determinate Systems installer accepts `--init none` to skip this.
- SSL certificates: Without explicitly symlinking `ca-bundle.crt`, Nix can't reach the binary
  cache. Both `SSL_CERT_FILE` and `NIX_SSL_CERT_FILE` need to be set.
- `nodejs`: Forgejo's runner machinery expects `node` to be available.

The result is a minimal, reproducible runner image built entirely from Nix expressions, versioned by its nixpkgs snapshot, and self-updating through its own CI pipeline.
