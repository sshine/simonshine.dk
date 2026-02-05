+++
date = '2026-02-02T00:44:38+01:00'
draft = false
title = 'Speeding up CI more with Nix'
tags = ['nix']
+++

Recently I wrote [Speeding up CI with Nix](/articles/speeding-up-ci-with-nix/).

I improved a 2m30s build to 1m30s after it had recently deteriorated to 10m30s.

I have another repository that would benefit from Nix.

Not because of speedups, but because it fails to install Chinese fonts properly.

My Typst résumé's CI failed to render Chinese fonts for the longest time; for that reason, I never
actually made use of the PDFs that I released. It is the `fontist/setup-fontist` and `fontist
install --formula noto_serif_cjk` parts below (using 3m2s out of 3m20s):

```yaml
name: Render resume.pdf

on:
  push:
    branches:
      - main

jobs:
  render:
    runs-on: ubuntu-latest

    permissions:
      contents: write

    steps:
      - name: Checkout
        uses: actions/checkout@eef61447b9ff4aafe5dcd4e0bbf5d482be7e7871 # v4.2.1, 2024-10-07

      - name: Setup Typst
        uses: typst-community/setup-typst@f5c90506c7ae74fca20e339034af05c52e0eda92 # v3.1.0, 2024-02-11
        with:
          cache-dependency-path: resume.typ

      - name: Setup Fontist
        uses: fontist/setup-fontist@8fcbe38d74da10b3083cacb83d1ba9b310d128ce # v2.0.1, 2024-02-10

      - name: Install fonts
        run: fontist install --formula noto_serif_cjk

      - name: Compile
        run: typst compile *.typ

      - name: Determine release name
        id: release_name
        run: echo "date=$(date +'%Y-%m-%d')" >> $GITHUB_OUTPUT

      - name: Upload release
        uses: svenstaro/upload-release-action@04733e069f2d7f7f0b4aebc4fbdbce8613b03ccd # v2.9.0, 2024-02-21
        with:
          repo_token: ${{ secrets.GITHUB_TOKEN }}
          tag: v${{ steps.release_name.outputs.date }}
          overwrite: true
          file_glob: true
          file: '*.pdf'
```

For the Nix rewrite, it follows the same template as the previous post:

- Run `nixbuild/nix-quick-install-action` to install Nix
- Run `nix-community/cache-nix-action` to recover cache
- Run `nix develop -c typst compile *.typ` to compile resumé

```yaml
name: Render resume.pdf

on:
  push:
    branches:
      - main

jobs:
  render:
    runs-on: ubuntu-latest

    permissions:
      contents: write

    steps:
      - name: Checkout
        uses: actions/checkout@eef61447b9ff4aafe5dcd4e0bbf5d482be7e7871 # v4.2.1, 2024-10-07

      - name: Install Nix
        uses: nixbuild/nix-quick-install-action@2c9db80fb984ceb1bcaa77cdda3fdf8cfba92035 # v34, 2025-09-24

      - name: Cache Nix store
        uses: nix-community/cache-nix-action@7df957e333c1e5da7721f60227dbba6d06080569 # v7, 2026-01-08
        with:
          primary-key: nix-${{ runner.os }}-${{ hashFiles('flake.nix', 'flake.lock') }}
          restore-prefixes-first-match: nix-${{ runner.os }}-

      - name: Compile
        run: nix develop -c typst compile *.typ

      - name: Determine release name
        id: release_name
        run: echo "date=$(date +'%Y-%m-%d')" >> $GITHUB_OUTPUT

      - name: Upload release
        uses: svenstaro/upload-release-action@04733e069f2d7f7f0b4aebc4fbdbce8613b03ccd # v2.9.0, 2024-02-21
        with:
          repo_token: ${{ secrets.GITHUB_TOKEN }}
          tag: v${{ steps.release_name.outputs.date }}
          overwrite: true
          file_glob: true
          file: '*.pdf'
```

As for the Nix configuration, I'm using a simple flake that just installs `just`, `typst` and adds
the serif CJK font to Typst's font path:

```nix
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
  };

  outputs = inputs@{ flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [ "x86_64-linux" "aarch64-darwin" ];

      perSystem = { pkgs, ... }: {
        devShells.default = import ./shell.nix { inherit pkgs; };
      };
    };
}
```

The flake doesn't produce the PDF as a derivation. That might be fun, too.

It simply exposes a devShell for each of my systems (MacOS, Linux).

And it does so by placing the actual shell definition in shell.nix:

```nix
{ pkgs ? import <nixpkgs> {} }:
pkgs.mkShellNoCC {
  packages = [
    pkgs.typst
    pkgs.just
  ];

  TYPST_FONT_PATHS = "${pkgs.noto-fonts-cjk-serif}/share/fonts";
}
```

The reason why I like to split these up is so that Nix users can also use this without flakes.

As for the speedup:

**Before: 3m23s**

**After: 39s**

But more importantly, I now get working Chinese characters in the rendered PDFs:

![Noto CJK serif font is now working](/img/noto-cjk-serif-example.png)
