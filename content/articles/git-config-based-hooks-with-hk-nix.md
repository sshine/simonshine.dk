+++
date = '2026-08-01T00:00:00+01:00'
draft = false
title = 'Git config-based hooks with hk-nix'
+++

[hk][hk] is a fast, modern git hook manager and project linter configured in [Pkl][pkl].
[`hk-nix`][hk-nix] is to hk what [lefthook-nix][lefthook-nix] is to lefthook: you install hk with
Nixpkgs, declare your hooks in Nix, pin every tool with Nix, and the hooks install themselves
whenever you enter the [devshell][devshell]. It is the same stack I [previously built with
lefthook][lefthook-article], with a nicer configuration language and one fewer workaround.

[hk]: https://hk.jdx.dev/
[pkl]: https://pkl-lang.org/
[hk-nix]: https://github.com/nix-tools/hk-nix
[lefthook-nix]: https://github.com/sudosubin/lefthook.nix
[lefthook-article]: /articles/lefthook-treefmt-direnv-nix/
[devshell]: https://github.com/numtide/devshell

## Synergies

**Nix + direnv:** You only ever need to install these two manually: Nix being the package manager,
and direnv being the thing that activates the Nix devshell. All other tooling is derived, pinned and
installed for you.

**Nix + hk:** every command a hook runs is referenced by an absolute `/nix/store` path, so the exact
tool that runs locally runs in CI. Adding a hook in one place adds a hook everywhere; `nix flake
check` runs the same hooks over the whole tree.

**hk + direnv:** the git hooks install automatically when you `cd` into the project directory. No
manual `hk install` step, no "remember to set it up after cloning". Clone the repo, enter it and
`direnv allow` (direnv will remind you). When the hooks change, direnv reinstalls them for you.

## Getting started

Here is a complete, self-contained `flake.nix` using [flake-parts][flake-parts] that installs hk and
runs [nixfmt][nixfmt] as a pre-commit hook. Starting from flake-parts makes it easy to split the
configuration into modules as the project grows.

[flake-parts]: https://flake.parts/
[nixfmt]: https://github.com/NixOS/nixfmt

```nix
# flake.nix
{
  inputs = {
    nixpkgs.url = "https://nixos.org/channels/nixpkgs-unstable/nixexprs.tar.xz";
    flake-parts.url = "github:hercules-ci/flake-parts";

    hk-nix.url = "github:nix-tools/hk-nix";
    hk-nix.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs =
    inputs@{ flake-parts, hk-nix, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [ "x86_64-linux" "aarch64-darwin" ];
      imports = [ hk-nix.flakeModules.default ];

      perSystem =
        { config, pkgs, lib, ... }:
        {
          hk-nix.settings.hooks."pre-commit" = {
            fix = true;
            stash = "git";
            steps.nixfmt = {
              glob = "**/*.nix"; # "*.nix" would incidentally do the same
              check = "${lib.getExe pkgs.nixfmt} --check {{files}}";
              fix = "${lib.getExe pkgs.nixfmt} {{files}}";
            };
          };

          devShells.default = pkgs.mkShell {
            packages = [ config.hk-nix.package pkgs.git ];
            shellHook = config.hk-nix.shellHook;
          };
        };
    };
}
```

Activate it for direnv:

```console
$ echo "use flake" > .envrc
$ direnv allow
```

Entering the devshell via `direnv allow` or `nix develop` runs `config.hk-nix.shellHook`, which
installs the git hooks. Now any `git commit` runs nixfmt over your staged `*.nix` files; with
`fix = true`, hk formats them in place, and `stash = "git"` keeps unstaged changes out of the way
while it does.

`config.hk-nix.package` is hk with the generated `hk.pkl` baked into it as `HK_FILE`, so the
configuration lives in the Nix store next to every tool it references. Nothing is written into the
working tree, and there is nothing to `.gitignore`.

Importing `hk-nix.flakeModules.default` also sets `checks.hk`, so CI gets the same hook, read-only
over every file, for free:

```console
$ nix flake check
```

## What hk-nix adds on top of hk

hk on its own configures hooks; it does not install anything by itself. hk-nix closes that gap:

1. **It installs hk itself.** The hk binary is pinned through your flake and put on the devshell
   `PATH`. Nobody installs hk out of band, and everyone runs the same version.
2. **It installs every tool your hooks reference.** Whether a step is a builtin or a custom
   `check`/`fix` string, the formatter, linter, or checker it names is pinned from Nixpkgs and
   referenced by `/nix/store` path. There is nothing to `apt install` or `npm install`; the same
   binaries run locally and in CI via `nix flake check`.
3. **It keeps the hooks installed and recent.** Because installation happens in the devshell
   `shellHook`, the hooks are (re)installed every time direnv (re)loads the environment: on a
   freshly cloned repo on a new machine, and again whenever the hooks themselves change.

For reinstalls, direnv needs to know where your hooks are defined in `.envrc`, e.g.:

```bash
watch_file nix/hooks.nix
watch_file flake.nix
use flake
```

Editing a hook now triggers a direnv reload, which regenerates the config and reinstalls the hooks.

## Built-in linters

hk ships [140+ pre-configured linters, formatters, and checkers][hk-builtins] as *builtins*:
ready-made step definitions (globs, commands, sensible defaults) that you reference by name instead
of hand-writing. hk-nix exposes each one as `config.hk-nix.builtins.<name>`:

[hk-builtins]: https://hk.jdx.dev/builtins

```nix
perSystem =
  { config, ... }:
  let hk-builtins = config.hk-nix.builtins; in
  {
    hk-nix.settings.hooks."pre-commit" = {
      fix = true;
      stash = "git";
      steps = {
        gitleaks.builtin = hk-builtins.gitleaks;
        check_merge_conflict.builtin = hk-builtins.check_merge_conflict;
        actionlint.builtin = hk-builtins.actionlint;
      };
    };
  };
```

*(So far, [123 out of 143 hooks](https://github.com/nix-tools/hk-nix/issues/1) are vendored via Nixpkgs.)*

A builtin identifies the tool; hk-nix pins it from Nixpkgs and injects it into the step's `PATH` by
absolute store path. Two independent knobs adjust that: `.override` repins the tool, and every key
besides `builtin` merges into the generated hk step. Here both are used at once, taking gitleaks
from a flake input of your own rather than Nixpkgs, and narrowing the step to one subtree:

```nix
steps.gitleaks = {
  builtin = hk-builtins.gitleaks.override { package = inputs'.my-tools.packages.gitleaks; };
  glob = "src/**/*";
};
```

## Leave formatting to treefmt

hk has formatting builtins, and you could stack up one per language. I don't, because formatting is
the job [treefmt][treefmt] exists to own, and [treefmt-nix][treefmt-nix] already wires it into `nix
fmt` and a `checks.treefmt`. So treefmt stays the single source of truth for formatting, and hk runs
it as one step:

[treefmt]: https://treefmt.com/
[treefmt-nix]: https://github.com/numtide/treefmt-nix

```nix
imports = [
  hk-nix.flakeModules.default
  inputs.treefmt-nix.flakeModule
];

perSystem =
  { config, ... }:
  let treefmt-bin = "${config.treefmt.build.wrapper}/bin/treefmt"; in
  {
    treefmt = {
      projectRootFile = "flake.nix";
      programs.nixfmt.enable = true;
      programs.prettier.enable = true; # add formatters for every language you use
    };

    # --fail-on-change turns "would reformat" into a non-zero exit so the commit is
    # blocked; --no-cache avoids a writable-cache requirement inside the nix flake
    # check sandbox.
    hk-nix.settings.hooks."pre-commit".steps.treefmt = {
      check = "${treefmt-bin} --fail-on-change --no-cache {{files}}";
      fix = "${treefmt-bin} --no-cache {{files}}";
    };
  };
```

`config.treefmt.build.wrapper` is a treefmt binary with your generated configuration baked in,
referenced by absolute store path like every other tool. `{{files}}` is the staged files; treefmt
applies whichever formatter matches each one and ignores the rest. That leaves hk the builtins
treefmt cannot express, because they analyze or gate rather than rewrite.

## Config-based hooks

hk-nix defaults to hk's support for **[config-based hooks][git-config-hooks]**, a mechanism
introduced in git 2.54. 

[git-config-hooks]: https://github.blog/open-source/git/highlights-from-git-2-54/#h-config-based-hooks

Historically a git hook could only be an executable script in `.git/hooks/` (or in another directory
named by `core.hooksPath`). Sharing hooks across repositories meant copying scripts around or
leaning on a third-party manager, and a repository could effectively run only one script per event.

So a hook manager's task, historically, was also to keep track of multiple scripts per event.

Git 2.54 lets you define hooks in git *configuration* instead, per-repository (`.git/config`),
per-user (`~/.gitconfig`), or system-wide (`/etc/gitconfig`). A hook is declared with a
`hook.<name>.command` and the event it fires on:

```gitconfig
[hook "linter"]
	event = pre-commit
	command = ~/bin/linter --cpp20
```

You can configure several hooks for the same event, and Git runs them in the
order it encounters their configuration:

```gitconfig
[hook "linter"]
	event = pre-commit
	command = ~/bin/linter --cpp20

[hook "no-leaks"]
	event = pre-commit
	command = ~/bin/leak-detector
```

Any traditional script in `$GIT_DIR/hooks` still runs, and it runs *last*, so existing hooks are
unaffected. `git hook list` shows the configured hooks and where each one comes from, and an
individual hook can be turned off without deleting its configuration:

```gitconfig
[hook "linter"]
	enabled = false
```

For hk-nix this matters because installation writes hk's entry into `.git/config` rather than
dropping scripts into `.git/hooks`, leaving that directory untouched. hk-nix always installs the
config-based way (it never passes `--legacy`), and prepends a recent git to `PATH` so the
config-based path is actually taken.
