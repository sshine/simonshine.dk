+++
date = '2026-03-07T21:47:14+01:00'
draft = false
title = 'Using lefthook and treefmt with Nix'
+++

In my recent attempts to modernize my CI pipelines, I've experimented with and subsequently let go
of [pre-commit][pre-commit]. The reason why I didn't stick with pre-commit is that [pre-commit drags
in several software runtimes and toolchains][pre-commit-mess] when building it from scratch. When
Nix fails to build something from nixpkgs, it's an omen of [too many chefs][too-many-chefs].

[too-many-chefs]: https://www.youtube.com/watch?v=QrGrOK8oZG8

Alternatives I'm aware of:
- [lefthook][lefthook]: A generic tool written in Go; defines hooks in a lefthook.yml file.
- [husky][husky]: A generic tool written in JavaScript; enough said.
- [cargo-husky][cargo-husky]: A tool specialized to Rust/Cargo; very nice, but not generic enough.

I initially disregarded lefthook because of its special lefthook.yml.

And I'd continue to disregard lefthook if its problems weren't fixable with Nix.

Since every alternative I'm aware of is worse in some way, I'm back to trying it.

[pre-commit]: https://pre-commit.com/
[pre-commit-mess]: /articles/speeding-up-ci-with-nix/#letting-go-of-pre-commit
[lefthook]: https://lefthook.dev/
[lefthook-nix]: https://github.com/sudosubin/lefthook.nix
[husky]: https://github.com/typicode/husky
[cargo-husky]: https://github.com/rhysd/cargo-husky

## tl;dr

- Lefthook's Go TUI library probes your terminal with [OSC escape sequences][osc]
- This produces garbage output and makes your shell janky afterwards
- Setting `TERM=dumb` via a `LEFTHOOK_BIN` wrapper fixes it
- Using lefthook-nix instead of plain lefthook gives you automatic hook installation
- It also gives you reproducible CI checks from the same config, and a declarative Nix-native setup
- You can [skip to the `flake.nix` code](#a-minimal-flakenix)

[osc]: https://gist.github.com/ConnerWill/d4b6c776b509add763e17f9f113fd25b#sequences

## Why this stack?

The combination of lefthook, treefmt, direnv, and Nix creates powerful synergies:

**lefthook + treefmt**: treefmt orchestrates formatters for any language - Python, Rust, JavaScript, Go, Nix, whatever. One pre-commit hook enforces formatting across your entire codebase. No per-language hook configuration or maintaining separate formatter configs.

**lefthook + direnv**: The git hooks install automatically when you `cd` into the directory. No manual setup step, no "remember to run `lefthook install`". Clone the repo, enter it, you're ready to commit.

**nix + all of the above**: Every contributor gets the full stack - lefthook, treefmt, all formatters, direnv integration, git hooks - by installing one package manager. Clone the repo, have Nix installed, `cd` in, and everything just works. No language runtimes to install, no formatter versions to coordinate, no setup documentation to maintain.

**nix makes workarounds trivial**: When we hit the terminal escape sequence problem with lefthook, the fix was a three-line wrapper script in the flake. In other ecosystems, you'd fork packages or maintain fragile shell aliases. With Nix, you write an inline wrapper, point an environment variable at it, and it's versioned, reproducible, and works everywhere the devshell runs. [Similar to how you can embed access tokens directly in binaries](https://terranix.org/getting-started.html).

## The problem with lefthook in modern terminals

Lefthook uses [charmbracelet/lipgloss][lipgloss] for its terminal UI. This library sends [OSC 10/11
escape sequences][osc] to detect your terminal's color scheme. The terminal responds with escape
sequences written to stdin. When the hook finishes, these responses are still in the input buffer.
Your shell tries to interpret them as commands, producing garbled output like:

[lipgloss]: https://github.com/charmbracelet/lipgloss

```
^[]10;rgb:dddd/dddd/dddd^[\^[[34;1R^[]11;rgb:0000/0000/0000^[\^[[34;1R
```

This happens in kitty, alacritty, and other modern terminal emulators. It will make your shell janky
and requires multiple Ctrl+C presses to recover, which is a dealbreaker for `git commit` considering
how often I type that command.

Neither [`colors: false`][colors-false] nor [`no_tty: true`][no-tty] in the lefthook config prevent
this -- the library sends the queries before reading any config.

[colors-false]: https://lefthook.dev/configuration/colors/
[no-tty]: https://lefthook.dev/configuration/no_tty/

The simple fix that worked for me: run lefthook with `TERM=dumb`. This prevents the library from
probing the terminal entirely. As a bonus, it's noticeably faster since it skips the TUI animation
rendering.

## Why lefthook-nix over plain lefthook

[lefthook-nix](https://github.com/sudosubin/lefthook.nix) wraps lefthook in a
Nix-native interface. Compared to managing lefthook manually:

- **Automatic hook installation.** The devshell's `shellHook` installs the git
  hooks when you enter the shell. No `lefthook install` step, no forgetting to
  set it up after cloning. `cargo-husky` does something very similar, but this
  only benefits Rust projects, and I sorely miss it.
- **Same config for dev and CI.** The `run` function returns both a `shellHook`
  for your devshell and a derivation you can use as a `checks` output. Your CI
  runs the exact same hooks with `nix flake check`.
- **Declarative config in Nix.** No `lefthook.yml` to maintain by hand. The YAML
  is generated from your Nix expression and stays in sync automatically.
- **Pinned and reproducible.** The lefthook version, the formatter, and all
  dependencies are pinned through your flake inputs. Every developer gets the
  same versions.

## A minimal flake.nix

Here's a complete, self-contained `flake.nix` that sets up lefthook with treefmt
as a pre-commit hook:

```nix
{
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs?ref=nixos-unstable";

    treefmt-nix.url = "github:numtide/treefmt-nix";
    treefmt-nix.inputs.nixpkgs.follows = "nixpkgs";

    lefthook-nix.url = "github:sudosubin/lefthook.nix";
    lefthook-nix.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs =
    { self, nixpkgs, treefmt-nix, lefthook-nix, ... }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
      lib = pkgs.lib;

      # Configure formatters (nixfmt, black, rustfmt, etc).
      # treefmt orchestrates formatters for any language from one config.
      treefmt = treefmt-nix.lib.evalModule pkgs {
        projectRootFile = "flake.nix";
        programs.nixfmt.enable = true;
      };

      lefthook = lefthook-nix.lib.${system}.run {
        src = self;
        config = {
          pre-commit.commands.treefmt = {
            # {staged_files} placeholder replaced by lefthook at commit time.
            # --fail-on-change: exit non-zero if formatting needed (blocks commit).
            #   Without this, treefmt reformats and exits 0, committing unformatted code.
            # --no-cache: check staged files fresh, don't trust cache.
            run = "treefmt --fail-on-change --no-cache {staged_files}";
          };
        };
      };
    in
    {
      formatter.${system} = treefmt.config.build.wrapper;

      checks.${system} = {
        formatting = treefmt.config.build.check self;
        hooks = lefthook;
      };

      devShells.${system}.default = pkgs.mkShell {
        inherit (lefthook) shellHook;
        packages = [ treefmt.config.build.wrapper ];

        # Wrap lefthook with TERM=dumb to prevent terminal escape sequence probing.
        # Demonstrates Nix's strength: trivial to create modified tool versions.
        # Inline wrapper, no forking packages, no fragile shell aliases.
        # Versioned with your flake, identical for all devs and CI.
        LEFTHOOK_BIN = toString (
          pkgs.writeShellScript "lefthook-dumb-term" ''
            exec env TERM=dumb ${lib.getExe pkgs.lefthook} "$@"
          ''
        );
      };
    };
}
```

You can activate the flake for direnv like so:

```
echo "use flake" > .envrc
```

The shellHook installs the git hooks automatically.

Now any `git commit` runs treefmt on your staged files.

If files need formatting, the commit is blocked:

```
Error: unexpected changes detected, --fail-on-change is enabled

summary: (done in 2.05 seconds)
  treefmt (2.04 seconds)
```

The formatted files are left in your working tree. Stage them and commit again.

CI gets the same checks for free with `nix flake check`.

## Keeping hooks in sync with your config

One gotcha: the `lefthook.yml` and git hooks are generated when you enter the devshell. If you
change the hook config in `flake.nix`, you need to run `direnv reload` to regenerate them. This is
easy to forget.

Using `treefmt` from PATH (rather than hardcoding a nix store path with `lib.getExe`) reduces this
problem. Changes to treefmt flags still require a reload, but changing which formatters are enabled
in your treefmt config doesn't -- the `treefmt` wrapper on PATH already points to the current
config.

If you use direnv, you can add `watch_file` to your `.envrc` to auto-reload when relevant files
change:

```
watch_file flake.nix
use flake
```

For larger projects, this gets noisy -- every change to `flake.nix` triggers a reload, even if it's
unrelated to the devshell. A better approach is to split your flake into separate modules using
[flake-parts][flake-parts] and [the dendritic pattern][dendritic] This lets you `watch_file` only
the specific module files that affect your devshell:

[flake-parts]: https://terranix.org/getting-started.html
[dendritic]: /articles/dendritic-nix-with-nixos-shell

```
watch_file modules/devshell.nix
watch_file modules/treefmt.nix
use flake
```

Now editing your hook or formatter config triggers an automatic direnv reload,
keeping the generated `lefthook.yml` in sync without manual intervention. Changes
to unrelated modules (NixOS configurations, packages, etc.) don't cause
unnecessary rebuilds of your devshell.
