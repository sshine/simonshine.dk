+++
date = '2026-11-04T00:56:50+02:00'
draft = false
title = "GitHub Releases: A poor man's Nix binary cache"
tags = ['nix', 'rust', 'forgejo']
+++

## tl;dr

Run or install binaries without compiling them by relying on GitHub Releases as a binary cache:

```console
$ nix run github:sshine/walltime-rs#walltime-bin -- --version
walltime 0.2.0
```

## Motivation

The simplest way to export a Rust CLI from a Nix flake is with `rustPlatform.buildRustPackage`.

Anyone who adds it as an input compiles it. A Rust developer or a Nix fanatic might accept a few
gigabytes of build dependencies and a few more of build artifacts, plus several minutes of
downloading, for a 4 MiB static binary.

You can run a Nix binary cache with [Cachix][cachix] or [attic][attic]. Cachix is a paid service
with a free tier, and attic is not trivial to run. Uploading a precompiled binary to a GitHub or
Forgejo Release takes one step.

[cachix]: https://www.cachix.org/
[attic]: https://github.com/zhaofengli/attic

Unlike [a poor man's Nix cache](/articles/poor-mans-nix-cache/), which was an nginx proxy in front
of cache.nixos.org, this is a binary cache for programs that are not released on nixpkgs. That
one caches everything and speeds up whatever you build. This one caches exactly one package and
means you do not build it at all.

## Cost of building Rust from source

Measured on [walltime-rs][walltime-rs], a single-crate workspace with no C dependencies, so this is
the cheap end:

[walltime-rs]: https://github.com/sshine/walltime-rs

| | runtime closure | into an empty store | build needs |
|---|---|---|---|
| `packages.default` | 49.3 MiB | 2.7 GiB, 223s | rustc, cargo, 86 store paths |
| `packages.walltime-bin` | 4.2 MiB | 628 MiB, 20s | stdenv |
| tarball as a flake input | 4.2 MiB | 4.2 MiB | nothing |

The runtime difference is glibc and libgcc against a static musl binary:

```console
$ ldd result/bin/walltime
	statically linked
```

This eliminates the entire toolchain from the derivation:

```console
$ nix-store -qR "$(nix eval --raw .#default.drvPath)" | grep -c 'rust\|cargo'
86
$ nix-store -qR "$(nix eval --raw .#walltime-bin.drvPath)" | grep -c 'rust\|cargo'
0
```

## Producing the artifact

There are two static targets and a checksum beside each:

```make
release_targets := "x86_64-unknown-linux-musl aarch64-unknown-linux-musl"

# Assert the release tag names the version cargo would publish
check-version version:
    @pkgid="$(cargo pkgid -p walltime)"; crate="v${pkgid##*#}"; \
    if [ "$crate" != "{{version}}" ]; then \
        echo "tag {{version}} does not match crate version $crate" >&2; exit 1; \
    fi

# Build the static release artifacts and their checksums into dist/
dist version: (check-version version)
    rm -rf dist && mkdir -p dist
    set -e; for target in {{release_targets}}; do \
        cargo build --release --locked --target "$target" -p walltime; \
        name="walltime-{{version}}-$target"; \
        tar -czf "dist/$name.tar.gz" -C "target/$target/release" walltime; \
        ( cd dist && sha256sum "$name.tar.gz" > "$name.tar.gz.sha256" ); \
    done
    @ls -1 dist
```

musl keeps the binary from linking against whatever glibc the caller happens to have.

Cross-compiling with cargo rather than `pkgsCross.*.rustPlatform` keeps this to seconds, because
every dependency is pure Rust and the only thing missing for a foreign target is a linker:

```nix
# rustc finds musl's crt objects in its own `self-contained` directory and can
# link x86_64 unaided; only a foreign architecture needs a cross linker.
aarch64-cc = pkgs.pkgsCross.aarch64-multiplatform-musl.stdenv.cc;
aarch64-linker = "${aarch64-cc}/bin/aarch64-unknown-linux-musl-cc";

devshells.default = {
  packages = [ aarch64-cc ];

  env = [
    {
      name = "CARGO_TARGET_AARCH64_UNKNOWN_LINUX_MUSL_LINKER";
      value = aarch64-linker;
    }
  ];
};
```

If the crate pulls the `ring` dependency in through rustls, both targets need a full C compiler and
not merely a linker, so `CC_<triple>` has to be set beside the linker variable. The `cc` crate
accepts a dashed name there, but a dashed name is not a valid shell identifier and devshell exports
these, so underscore it.

On GitHub, uploading is one step:

```yaml
- name: Build static musl artifacts
  run: nix develop -c just dist "${GITHUB_REF_NAME}"

- name: Create GitHub Release
  uses: softprops/action-gh-release@3d0d9888cb7fd7b750713d6e236d1fcb99157228 # v3.0.2, 2026-07-13
  with:
    generate_release_notes: true
    files: |
      dist/*.tar.gz
      dist/*.tar.gz.sha256
```

*(Quick advertisement for the [`hashpinner`][hashpinner] CLI to make hash-pinning of github actions
easier; it is incidentally an example of this GitHub release-based binary cache: [the
release][hashpinner-release], [the github action][hashpinner-action], and its [x86_64/aarch64
release.nix][hashpinner-release-nix].)*

[hashpinner]: https://github.com/sshine/hashpinner
[hashpinner-release]: https://github.com/sshine/hashpinner/releases/tag/v0.2.0
[hashpinner-action]: https://github.com/sshine/hashpinner/blob/main/.github/workflows/release.yml
[hashpinner-release-nix]: https://github.com/sshine/hashpinner/blob/main/nix/release.nix

## Consuming it

```nix
# Prebuilt release binaries, for consumers who want walltime without a Rust toolchain
# entering their build closure.
{ ... }:
{
  perSystem =
    { system, pkgs, lib, ... }:
    let
      release = {
        version = "0.2.0";
        hashes = {
          "x86_64-linux" = "sha256-5FVCATMr1k9zzauV8scjqqXc3TboAUId7bNQOLgz62k=";
          "aarch64-linux" = "sha256-LTKSJWk41gsaALorxZO2GvLvjRiMNoQHJXOWeJzUipc=";
        };
      };

      triple = {
        "x86_64-linux" = "x86_64-unknown-linux-musl";
        "aarch64-linux" = "aarch64-unknown-linux-musl";
      };

      tag = "v${release.version}";

      tarball = pkgs.fetchurl {
        url = "https://github.com/sshine/walltime-rs/releases/download/${tag}/walltime-${tag}-${triple.${system}}.tar.gz";
        hash = release.hashes.${system};
      };
    in
    lib.optionalAttrs (release.hashes ? ${system}) {
      packages.walltime-bin =
        pkgs.runCommand "walltime-bin-${release.version}"
          {
            meta = {
              description = "CLI for measuring time spent in a process (prebuilt)";
              mainProgram = "walltime";
              license = with lib.licenses; [ mit asl20 ];
              platforms = lib.attrNames release.hashes;
              sourceProvenance = [ lib.sourceTypes.binaryNativeCode ];
            };
          }
          ''
            tar -xzf ${tarball}
            install -Dm755 walltime $out/bin/walltime
          '';
    };
}
```

## Notes

- The pinned `version` deliberately trails `Cargo.toml`. It names the last tag whose artifacts are
  published, not whatever the working tree claims, so bumping the crate cannot point the URL at an
  asset that doesn't exist yet.
- `lib.optionalAttrs (release.hashes ? ${system})` omits the output on systems with no artifact.
  `nix flake show` on a Mac gets no `walltime-bin` rather than an evaluation error. This is also what
  keeps `nix flake check` green on Darwin when the release builds only Linux.
- `sourceProvenance = [ lib.sourceTypes.binaryNativeCode ]` says that it wasn't built from source.
- The hashes are of the tarballs the release publishes, so they can be checked against the `.sha256`
  assets instead of taken on faith.

Bumping is a `just` recipe that prints the lines to paste:

```make
# Print the SRI hashes nix/binary.nix pins, in nixpkgs system order
dist-hashes:
    @for target in {{release_targets}}; do \
        system="${target%%-*}-linux"; \
        hash="$(nix hash file --sri --type sha256 dist/walltime-*-"$target".tar.gz)"; \
        printf '"%s" = "%s";\n' "$system" "$hash"; \
    done
```

## Skipping nixpkgs as well

`walltime-bin` doesn't need the Rust toolchain, but evaluating the flake still fetches nixpkgs and
rust-overlay, and `runCommand` still wants a stdenv to run `tar` in. The 628 MiB breaks down as 485
MiB of nixpkgs tree, 24 MiB of rust-overlay, about 115 MiB of stdenv and 4.2 MiB of program.

A `flake = false` input skips all of it:

```nix
{
  inputs.walltime-bin = {
    url = "https://github.com/sshine/walltime-rs/releases/download/v0.2.0/walltime-v0.2.0-x86_64-unknown-linux-musl.tar.gz";
    flake = false;
  };

  outputs =
    { walltime-bin, ... }:
    {
      packages.x86_64-linux.default = walltime-bin;

      apps.x86_64-linux.default = {
        type = "app";
        program = "${walltime-bin}/walltime";
      };
    };
}
```

Nix unpacks the tarball into the store itself and records the `narHash` in `flake.lock`:

```json
"walltime-bin": {
  "flake": false,
  "locked": {
    "lastModified": 1788575925,
    "narHash": "sha256-H5vGIVaLFY9BHsP0IgksHOjUg/tw0+FkPEtxwzMwk9M=",
    "type": "tarball",
    "url": "https://github.com/sshine/walltime-rs/releases/download/v0.2.0/walltime-v0.2.0-x86_64-unknown-linux-musl.tar.gz"
  }
}
```

No derivation, no stdenv, no nixpkgs: one store path, 4.2 MiB with zero dependencies.

It is the same store path `builtins.fetchTarball` gives you for the same URL and hash:

```console
$ nix eval --raw --impure --expr 'toString (builtins.fetchTarball {
    url = "https://github.com/sshine/walltime-rs/releases/download/v0.2.0/walltime-v0.2.0-x86_64-unknown-linux-musl.tar.gz";
    sha256 = "sha256-H5vGIVaLFY9BHsP0IgksHOjUg/tw0+FkPEtxwzMwk9M=";
  })'
/nix/store/mjgwirfijj5ayfzjsi4zp2z2m2cwwhpm-source
```

The triple is written into the URL, so one input serves one platform, and what lands in the store
is a bare directory with no `$out/bin` and no `meta`. A devshell or a CI job does not care. Behind
`environment.systemPackages` you want the `fetchurl` plus `runCommand` version above, because that
behaves like a package.

## The same trick on a self-hosted forge

I keep [helm-vendor][hv], a CLI that vendors Helm charts from a `charts.toml`, on my own Forgejo
instance. Forgejo serves release assets in the same way GitHub does:

[hv]: https://git.shine.town/infra/helm-vendor

```
https://git.shine.town/infra/helm-vendor/releases/download/v0.6.0/helm-vendor-v0.6.0-x86_64-unknown-linux-musl.tar.gz
```

so the consuming side is the walltime `binary.nix` with a different host, plus a `wrapProgram` to
put `helm` and `diff` on its PATH, because the prebuilt package has to behave like the source one.
Forgejo has no `softprops/action-gh-release`, so the upload is a shell script. I keep it as a
package rather than a heredoc buried in workflow YAML, which gets it shellcheck'd for free:

```nix
packages.forgejo-release = pkgs.writeShellApplication {
  name = "forgejo-release";
  runtimeInputs = [ pkgs.curl pkgs.jq ];
  text = ''
    tag="$1"
    assets="$2"
    api="''${FORGEJO_URL:?}/api/v1/repos/''${FORGEJO_REPO:?}"

    call() {
      local method="$1"
      shift
      curl --fail-with-body --silent --show-error \
        -X "$method" \
        -H "Authorization: token ''${FORGEJO_TOKEN:?}" \
        -H "Accept: application/json" \
        "$@"
    }

    # Re-runnable: adopt an existing release for the tag rather than
    # failing, so a partially uploaded release can be completed.
    if release=$(call GET "$api/releases/tags/$tag" 2>/dev/null); then
      echo "release $tag already exists, updating assets"
    else
      release=$(call POST "$api/releases" \
        -H "Content-Type: application/json" \
        --data "$(jq -n --arg tag "$tag" '{
          tag_name: $tag,
          name: $tag,
          draft: false,
          prerelease: false,
          body: "Statically linked musl binaries. Each tarball has a matching .sha256 asset."
        }')")
      echo "created release $tag"
    fi

    id=$(jq -r .id <<<"$release")

    for file in "$assets"/*; do
      name=$(basename "$file")

      # Uploading a duplicate name would silently create a second asset.
      old=$(call GET "$api/releases/$id/assets" |
        jq -r --arg name "$name" '.[] | select(.name == $name) | .id')
      for asset_id in $old; do
        call DELETE "$api/releases/$id/assets/$asset_id" >/dev/null
      done

      call POST "$api/releases/$id/assets?name=$name" \
        -F "attachment=@$file" >/dev/null
      echo "uploaded $name"
    done
  '';
};
```

The auth header is Gitea's `Authorization: token <t>`, not `Bearer`. Posting an asset name that
already exists creates a *second* asset with the same name rather than replacing it, so a rerun has
to delete first. Uploading whatever `dist/` holds, rather than a written-out list, means a new
target needs no change here.

The Forgejo Actions workflow:

```yaml
name: Release

on:
  push:
    tags: ["v*"]

jobs:
  verify:
    runs-on: nixos
    steps:
      - uses: actions/checkout@v4

      - name: Tag matches crate version
        run: nix develop -c just check-version "${{ github.ref_name }}"

      - name: CI checks
        run: nix develop -c just ci

  release:
    needs: verify
    runs-on: nixos # https://git.shine.town/infra/runners
    steps:
      - uses: actions/checkout@v4

      - name: Build static binaries
        run: nix develop -c just dist "${{ github.ref_name }}"

      - name: Publish release
        env:
          FORGEJO_URL: ${{ github.server_url }}
          FORGEJO_REPO: ${{ github.repository }}
          FORGEJO_TOKEN: ${{ secrets.RELEASE_TOKEN || secrets.GITHUB_TOKEN }}
        run: nix run .#forgejo-release -- "${{ github.ref_name }}" dist
```

`check-version` runs before the check suite so a mistyped tag fails in seconds rather than after the
tests. `secrets.RELEASE_TOKEN || secrets.GITHUB_TOKEN` falls back to the automatic job token, so a
secret is only needed on an instance where that token lacks the scope. Mine needed a PAT for pushing
to the package registry, so I left the escape hatch in.

`runs-on: nixos` is a Nix-based runner image, explained in [A poor man's Nix cache](/articles/poor-mans-nix-ci-cache/).

One Forgejo setting thing that makes the consuming side work without credentials:

```nix
service = {
  DISABLE_REGISTRATION = true;
  REQUIRE_SIGNIN_VIEW = false;
  ENABLE_INTERNAL_SIGNIN = false;
};
```

`REQUIRE_SIGNIN_VIEW = false` is what lets `pkgs.fetchurl` reach a release asset anonymously. If
your instance is private, the fetch needs a `netrc-file` in `nix.conf`, and then the flake is no
longer usable by anyone who has not configured it. I would rather have the binaries public and the
source private than the other way around.
