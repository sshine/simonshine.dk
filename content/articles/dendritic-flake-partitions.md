+++
date = '2026-06-21T13:39:00+02:00'
draft = false
title = 'Dendritic flake partitions'
tags = ['nix']
+++

## tl;dr

- Some of my sandboxed CLI agents aren't in nixpkgs, so they ride along as flake inputs.
- They're heavy, and were polluting the `flake.lock` of every machine that consumes the flake.
- [flake-parts partitions](https://flake.parts/options/flake-parts-partitions) move those inputs into a nested flake that's only evaluated when you actually
build the thing.
- Because my flake is dendritic ([import-tree](https://github.com/denful/import-tree)), I tuck that nested flake inside the import tree using import-tree's ignored-paths convention: `_inputs/flake.{nix,lock}`.

While researching this I found a good guide, [Dr. Steve's Dendritic Design with the Flake Parts
Framework:  A guide on how to structure your Nix code with Flake Parts using the Dendritic
Pattern](https://github.com/Doc-Steve/dendritic-design-with-flake-parts). It covers aspects,
collectors, factories, but doesn't mention flake-parts partitions or lazy input loading.

So this blog post might still be worth a read.

## The problem

[bubblebox](https://github.com/sshine/bubblebox) is my rewrite of [numtide's
claudebox](https://github.com/numtide/claudebox) for multiple agent frameworks. It wraps coding
agents in a bubblewrap/seatbelt sandbox. Some agents are in nixpkgs (`claude-code`, `opencode`), and
some aren't, so they come as flake inputs:

```nix
# flake.nix — before
inputs = {
  nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  flake-parts.url = "github:hercules-ci/flake-parts";
  import-tree.url = "github:denful/import-tree";

  hermes-agent.url = "github:NousResearch/hermes-agent";
  pi-mono = {
    url = "github:badlogic/pi-mono";
    flake = false;
  };
};
```

`hermes-agent` alone drags in `uv2nix`, `pyproject-nix`, `pyproject-build-systems` and their own
nixpkgs pins. All of that lands in my root `flake.lock`, and transitively lands in the `flake.lock`
of my system configuration. Even when I don't actually install hermes or pi.

## Flake-parts partitions make the inputs lazy

A [partition](https://flake.parts/options/flake-parts-partitions) is a second evaluation of your
flake-parts modules with *extra inputs* attached. You route an output attribute to it and point it
at a small flake that holds only those inputs:

```nix
# nix/partitions.nix
{ inputs, ... }:
{
  imports = [ inputs.flake-parts.flakeModules.partitions ];

  partitionedAttrs = {
    packages = "agents";
    apps = "agents";
  };

  partitions.agents.extraInputsFlake = ./agents/_inputs;
}
```

In this sub-flake, the extra flake inputs are added:

```nix
# nix/agents/_inputs/flake.nix
{
  inputs = {
    hermes-agent.url = "github:NousResearch/hermes-agent";
    pi-mono = {
      url = "github:badlogic/pi-mono";
      flake = false;
    };
  };
  outputs = _: { };
}
```

Now the root `flake.lock` is back to four nodes:

```console
$ nix eval --impure --expr 'builtins.attrNames (builtins.fromJSON (builtins.readFile ./flake.lock)).nodes'
[ "flake-parts" "import-tree" "nixpkgs" "root" ]
```

The hermes/pi tree lives entirely in `nix/agents/_inputs/flake.lock`.

Consumers of bubblebox never inherit it.

### How is this lazy?

Two mechanisms stack:

1. Separate lock: `extraInputsFlake` is a nested flake with its own `flake.lock`. Its inputs are not
   root inputs, so they never enter the root lock graph and never propagate to anyone depending on
   bubblebox.

2. Lazy evaluation: `partitionedAttrs.packages = "agents"` says "take the whole `packages` output
   from the partition." That partition re-evaluates the same modules, so it still produces
   `claudebox`, `opencodebox`, `pingbox` alongside `hermesbox` and `pibox`. But Nix builds attribute
   sets lazily, selecting one attribute never forces its siblings:

   ```console
   $ nix build .#claudebox   # never touches hermes-agent or pi-mono
   $ nix run   .#pibox       # *now* pi-mono gets fetched, from the nested lock
   ```

   `claudebox` and `opencodebox` don't reference the heavy inputs. Their thunks are never forced, so
   they're never fetched. The day I actually want pi, `nix run .#pibox` resolves it from
   `agents/_inputs/flake.lock` on the spot.

The net effect: the inputs exist, are pinned, are one command away — and cost nothing until used.

## Folding the partition into the import tree

bubblebox is *dendritic*: every file under `nix/` is a flake-parts module, auto-imported by
[import-tree](https://github.com/denful/import-tree). Each sandboxed agent contributes itself to a
shared `boxes` option:

```nix
# nix/agents/hermes.nix
{ inputs, ... }:
{
  perSystem =
    { system, ... }:
    {
      boxes.hermesbox = {
        tool =
          inputs.hermes-agent.packages.${system}.default
            or (throw "hermes-agent has no package for ${system}");
        toolBinary = "hermes";
        homeBindings = [ ".hermes" ".config/hermes" ];
        description = "Sandboxed environment for Hermes Agent";
      };
    };
}
```

So where does the partition's `flake.nix` go? If I drop it anywhere under `nix/`, import-tree slurps
it as a module and the whole thing falls over.

I have two options: I can either specify the partition outside of `nix/`, or inside of `nix/` by
prefixing it with an underscore, making import-tree ignore the flake. (flake.nix is not a
flake-parts module, so importing it would both be wrong and fail.)

As an experiment, I've opted for keeping the nested flake in an import-tree ignored directory:

```
nix/agents/
├── hermes.nix          # module — imported
├── pi.nix              # module — imported
└── _inputs/
    ├── flake.nix       # ignored by import-tree (path has /_)
    └── flake.lock      # the partition's private lock
```

## Caveats

`nix flake check` and `nix flake show` evaluate *every* output, so they will pull the partition's
inputs — the laziness is about day-to-day builds and the lock graph, not whole-flake introspection.
