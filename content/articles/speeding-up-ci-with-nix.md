+++
date = '2026-01-25T12:28:38+01:00'
draft = false
title = 'Speeding up CI with Nix'
tags = ['nix']
+++

In the article [Maintaining libraries with Claude](/articles/maintaining-libraries-with-claude) I
update the CI pipeline to release the package automatically on Hackage and GitHub when pushing a
version tag.

I added a git hook, [check-cabal-sync.sh][ccs], that checks the version in package.yaml against the
version in evm-opcodes.cabal, as well as the version in the git tag, to ensure I ran `hpack` before
releasing; otherwise Hackage upload will fail.

[ccs]: https://github.com/sshine/evm-opcodes/blob/main/.github/hooks/check-cabal-sync.sh

**Total CI running time: 2m30s before**

Of which `haskell-actions/setup` takes: 2m5s.

**After making the extra `hpack` check: 10m30s.** 🤯

The culprit? `cabal install hpack` installs from source.

```yaml
- name: Check cabal file is in sync
  run: |
    cabal install hpack
    .github/hooks/check-cabal-sync.sh
```

Visiting the Hackage index, downloading and compiling the packages are all time-consuming!

I could just install hpack from a binary distribution; maybe `haskell-actions/setup` has it.

But I also want to sync CI tooling with developer tooling and try to bring that 2m5s down.

## Deterministic builds

I have a confession.

For 3 years I have consistently used `import <nixpkgs> {}` in my projects.

What that means is that when my project tooling activates, it looks for the version of nixpkgs in my
NIX_PATH. It's like the UNIX system PATH, but for Nix expressions that resolve to Nix derivations.

That means my builds are not ultimately deterministic:

I might come back to a project after a year and with a completely new, incompatible nixpkgs.

The reason I might only put a default.nix or a shell.nix in a project is speed: Flakes are a little
bit slower, and I really care about latency when entering and leaving my directories.

But facing CI, I don't assume to have an already installed nixpkgs that I conveniently maintain.

## Pinning default.nix

The deterministic alternative is to pin your nixpkgs to a specific version.

A quick selection of options here:

- Hardcode pinning into your .nix files, e.g. via `fetchTarball` or `fetchFromGitHub`
- Using a dependency management system like [niv][niv] or [npins][npins]
- Using flakes because they come with a flake.lock that pins versions

[niv]: https://github.com/nmattia/niv
[npins]: https://github.com/andir/npins

For dependency management, niv or npins are just as good as flakes.

But I'll go with flakes here for secondary reasons.

## Letting go of pre-commit

It was at this moment I had to let go of [pre-commit][pre-commit]:

- I am curiously using nixpkgs-25.11 on this nix-darwin installation because that's how it shipped
- For that reason, `import <nixpkgs> {}` in the default.nix for this project used a stable nixpkgs
- Stable nixpkgs have their binary cache fully matured
- Switching to flakes made pre-commit recompile from source, dragging the uncompiled .NET runtime
  *and* the uncompiled Swift runtime into the build pipeline, and failed. Since this is a dev
  dependency, it reminded me: Why do I need two full toolchains just to copy a file into .git/hooks?

[pre-commit]: https://pre-commit.com/

The key here is: `import <nixpkgs> {}` is replaced with a lambda: `{ pkgs, ... }: ...`

This makes default.nix go from a Haskell package-producing derivation to a function that takes a
`pkgs` and produces a Haskell package-producing derivation. It then only works in a context where
that `pkgs` is specified, which happens to be the flake.

[direnv][direnv] takes care of loading the flake instead.

And the flake.lock (omitted below) contains the pin.

[direnv]: https://direnv.net/

```diff
commit 028d6d46819a8c5dafc6f575d5f1c56fceadc0ae
Author: Simon Shine <simon@simonshine.dk>
Date:   Mon Jan 26 22:44:36 2026 +0100

    fix: Replace implicit NIX_PATH pinning with flake.lock

diff --git a/.envrc b/.envrc
index 1d953f4..3550a30 100644
--- a/.envrc
+++ b/.envrc
@@ -1 +1 @@
-use nix
+use flake
diff --git a/default.nix b/default.nix
index 8bb541e..8e4840f 100644
--- a/default.nix
+++ b/default.nix
@@ -1,6 +1,4 @@
-let
-  # Use nixpkgs available on the system
-  pkgs = import <nixpkgs> {};
+{ pkgs, ... }: let
   haskellDependencies = with pkgs.haskellPackages; [
     stack
     cabal-install
@@ -16,15 +14,5 @@ let
     root = ./.;
     modifier = drv: addBuildTools drv haskellDependencies;
   };
-
-  # Extend the build environment with pre-commit installed and activated
-  withPreCommitHook = old: {
-    nativeBuildInputs = (old.nativeBuildInputs or []) ++ [ pkgs.pre-commit ];
-    shellHook = (old.shellHook or "") + ''
-      if [ -d .git ]; then
-        pre-commit install --hook-type pre-push
-      fi
-    '';
-  };
 in
-  package.overrideAttrs withPreCommitHook
+  package
diff --git a/flake.lock b/flake.lock
new file mode 100644
index 0000000..ab5717d
...
diff --git a/flake.nix b/flake.nix
new file mode 100644
index 0000000..6d1ab26
--- /dev/null
+++ b/flake.nix
@@ -0,0 +1,15 @@
+{
+  description = "Opcode types for Ethereum Virtual Machine (EVM)";
+  inputs = {
+    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
+    flake-parts.url = "github:hercules-ci/flake-parts";
+  };
+
+  outputs = inputs:
+    inputs.flake-parts.lib.mkFlake { inherit inputs; } {
+      systems = [ "x86_64-linux" "aarch64-darwin" ];
+      perSystem = { config, self', pkgs, ... }: {
+        packages.default = import ./default.nix { inherit pkgs; };
+      };
+    };
+}
```

## GitHub Actions and Nix CI

Installing Nix and setting up its cache comes in two steps that can be copy-pasted from the
examples: [nix-community/cache-nix-action][cache-nix-action] and [nixbuild/nix-quick-install-action][nix-quick-install].
Flakes are enabled by default, so I don't need to explicitly add them to the nix.conf.

Besides installing Nix and setting up its cache, everything is almost the same:

I prefix commands that need access to tooling with `nix develop -c`.

I simplify the jobs/steps to conditional states.

I got rid of the build matrix for simplicity; testing multiple compilers felt wasteful.

[nix-quick-install]: https://github.com/nixbuild/nix-quick-install-action#nix-quick-install-action
[cache-nix-action]: https://github.com/nix-community/cache-nix-action?tab=readme-ov-file#examples

```yaml
name: Haskell CI

on:
  push:
    branches:
      - main
    tags:
      - 'v*'
  pull_request:
    branches:
      - main

jobs:
  build:
    runs-on: ubuntu-latest
    env:
      CONFIG: "--enable-tests --enable-benchmarks"

    steps:
      - name: Checkout
        uses: actions/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8 # v6.0.1, 2025-12-02

      - uses: nixbuild/nix-quick-install-action@2c9db80fb984ceb1bcaa77cdda3fdf8cfba92035 # v34, 2025-09-24
        with:
          nix_conf: |
            keep-env-derivations = true
            keep-outputs = true

      - name: Restore and save Nix store
        uses: nix-community/cache-nix-action@106bba72ed8e29c8357661199511ef07790175e9 # v7, 2026-01-08
        with:
          primary-key: nix-${{ runner.os }}-${{ hashFiles('**/*.nix', '**/flake.lock') }}
          restore-prefixes-first-match: nix-${{ runner.os }}-
          gc-max-store-size-linux: 1G
          purge: true
          purge-prefixes: nix-${{ runner.os }}-
          purge-created: 0
          purge-last-accessed: P1DT12H
          purge-primary-key: never

      - name: Build Nix dev shell
        run: nix develop -c true

      - name: Check cabal file version is in sync
        run: nix develop -c .github/hooks/check-cabal-sync.sh

      - name: Build source code
        run: nix develop -c cabal build $CONFIG

      - name: Test
        run: nix develop -c cabal test $CONFIG --test-show-details=always

      - name: Run HLint
        run: nix develop -c hlint src/

      - name: Run benchmarks
        run: nix develop -c cabal bench $CONFIG

      - name: Generate Haddock
        run: nix develop -c cabal haddock $CONFIG

      - name: Generate sdist for package release
        run: |
          rm -rf dist-newstyle/sdist/
          nix develop -c cabal sdist

      - name: Upload to Hackage
        if: startsWith(github.ref, 'refs/tags/v')
        run: nix develop -c cabal upload --publish --token "${{ secrets.HACKAGE_TOKEN }}" dist-newstyle/sdist/evm-opcodes-*.tar.gz

      - name: Create GitHub Release
        if: startsWith(github.ref, 'refs/tags/v')
        uses: softprops/action-gh-release@a06a81a03ee405af7f2048a818ed3f03bbf83c7b # v2.5.0, 2025-12-01
        with:
          files: dist-newstyle/sdist/evm-opcodes-*.tar.gz
          generate_release_notes: true
```

## How does it perform?

**A non-release push: 1m31s**

**A release push: 1m37s**

🥳

I beat `haskell-actions/setup` and I sync'ed my developer tooling with CI.
