+++
date = '2026-10-21T13:19:47+02:00'
draft = false
title = 'Four ways to install Nix in GitHub Actions'
tags = ['nix']
+++

To run Nix in GitHub Actions, the default CI runner needs Nix installed first.

Here are some popular alternatives for pre-made CI actions that do this:

```yaml
- uses: cachix/install-nix-action@v31
- uses: NixOS/nix-installer-action@v1
- uses: nixbuild/nix-quick-install-action@v35
- uses: DeterminateSystems/nix-installer-action@v23
```

All of these work, and do more or less the same thing. Are they all equally fast?

I've benchmarked each of them by first running the installer, and then running `nixpkgs#hello`.

```yaml
# .github/workflows/install-nix-action.yml
on: workflow_dispatch

jobs:
  bench:
    runs-on: ubuntu-latest
    steps:
      - name: Install Nix
        uses: cachix/install-nix-action@v31

      - name: First build hello from pinned nixpkgs
        run: |
          nix-build --no-out-link -E 'with import (fetchTarball
            "https://github.com/NixOS/nixpkgs/archive/ac62194c3917d5f474c1a844b6fd6da2db95077d.tar.gz") {}; hello'
```

I didn't specify any input parameters on them, and I didn't add any explicit cache or `permissions` block.

The build expression needs neither flakes nor a channel.

Each action ran cold, after `gh cache delete --all`, then warm immediately after, one run in flight
at a time. All of it on `ubuntu-latest`, 2026-10-15.

## The numbers

| Action | Cold install | Warm install | Job total | First build |
| --- | --- | --- | --- | --- |
| install-nix-action | 4.34 s | 4.19 s | 38 s | 14 s |
| NixOS/nix-installer-action | 3.28 s | 3.02 s | 36 s | 14 s |
| nix-quick-install-action | 0.71 s | 0.62 s | 42 s | 17 s |
| DeterminateSystems/nix-installer-action | 8.82 s | 10.08 s and 7.50 s | 24 to 30 s | 5 to 6 s |

While Determinate Nix has a longer installation time, its total running time is lower.

For all but Determinate Nix, installing Nix takes ~1-10% of the time, and the two nixpkgs
evaluations take up ~80% or more.

The pinned `hello` build substitutes 9.7 MiB over five
paths from `cache.nixos.org` in all four jobs, so those 14 s are evaluation, not download.

Determinate Nix builds the same expression in 5 to 6 s. Its `/etc/nix/nix.conf` sets `lazy-trees =
true`, which is the obvious suspect, but it is also a different Nix distribution, so that is two
variables moving at once. Nothing here isolates them.

nix-quick-install-action is 3 to 4 s slower on both build steps, against all four runs of the two
upstream daemon installers. That gap showed on both of its runs.

## Cold and warm are the same run twice

Only Determinate Nix uses cache to install Nix, so `gh cache list` was empty before and after.

The Determinate action writes exactly one entry, 46.87 MiB, during the install step rather than the
post step:

```console
$ gh cache list
8988227201  determinatesystem-nix-installer-x86_64-linux-06522f9daa970bf151faf79cee6ffda3  46.87 MiB
```

Both warm runs restored it, evidenced by the `accessedAt` field moving while `createdAt` stayed put.

No wallclock time gain: a 1.2 s CDN fetch becomes a 1.6 s and then a 1.1 s restore.

What you get is not depending on `cf.install.determinate.systems`.

I see

## What you actually get

| | cachix | NixOS | nixbuild | Determinate |
| --- | --- | --- | --- | --- |
| Nix | 2.35.3 | 2.35.3 | 2.34.7 | Determinate Nix 3.23.2 |
| Mode | daemon | daemon | single-user | daemon |
| `/nix` owner | `root:root` | `root:root` | `runner:root` | `root:root` |
| nix.conf | `/etc/nix` | `/etc/nix` | `~/.config/nix` | `/etc/nix` |
| `experimental-features` | `fetch-tree flakes nix-command` | same | same | empty |
| `<nixpkgs>` resolves | no | yes | no | yes, FlakeHub weekly |
| `/nix` after install | 123M | 155M | 111M | 227M |

`nix flake --help` works on all four, and none adds a channel or sets `NIX_PATH`. The empty
`experimental-features` is not flakes being off, it is flakes not being experimental in Determinate
Nix, so a step asserting on that setting behaves differently there.

The version column is four policies. The first two track current upstream Nix, Determinate tracks
its own, and nixbuild ships prebuilt archives fixed per action release, so `v35` means 2.34.7 until
you pass `nix_version`. That 2.34.7 is also why nix-quick-install ends the job with a 1.2G `/nix`
against 203M to 348M: two nixpkgs `-source` paths of 482 MB and 425 MB enter the store there and
not elsewhere. It tracks the Nix version, not the installer.

Each one fetches its payload from a different host, which matters on a network where that has to be
declared in advance: `releases.nixos.org`, the nix-installer GitHub release, the action's own GitHub
release, and `cf.install.determinate.systems`.

## Phoning home

At defaults the Determinate action exports OpenTelemetry traces and logs to
`https://otel.determinate.systems`, with the ingest token committed in `dist/`. The documented
`diagnostic-endpoint` input does not cover that channel. Both together do:

```yaml
- uses: DeterminateSystems/nix-installer-action@v23
  with:
    diagnostic-endpoint: ""
  env:
    OTEL_SDK_DISABLED: "true"
```

Counted by SNI on the runner, the install step at defaults opens 20 connections to
`otel.determinate.systems` and one to `install.determinate.systems`. With the opt-out, zero and
one. I did not get that remaining one attributed to a channel.

Leaving it on costs nothing while the hosts answer. With both blackholed in `/etc/hosts`, defaults
took 17.33 s to install and 9.07 s in the post step, against 8.05 s and 1.25 s with the opt-out.
Both runs ended green, and nothing in the job log mentions it.

My first blackhole run measured a clean zero and was wrong: both names have AAAA records, so with
only `127.0.0.1` in `/etc/hosts` the traffic left over IPv6. Asserting that resolution really is
loopback is the part that matters.

## What this doesn't show

A single `hello` substitutes 9.7 MiB. Install cost matters less and store behavior matters more as
the closure grows, and nothing here says where those lines cross. Only `ubuntu-latest` on x86_64
was measured, n is 1 per cell, and all four ran bare, which is not how any of them is deployed.

For the Determinate one, bare also means its own cache was off, and it says so on every run:

```console
FlakeHub is disabled because the workflow is misconfigured.
Please make sure that `id-token: write` and `contents: read` are set.
```

Adding those two permissions changes what is being measured, which is the point at which a
benchmark of defaults stops being a benchmark of anything you would run.
