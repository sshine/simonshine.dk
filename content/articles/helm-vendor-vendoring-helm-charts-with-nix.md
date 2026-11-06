+++
date = '2026-11-06T01:29:34+02:00'
draft = false
title = 'helm-vendor: Vendoring Helm Charts With Nix'
tags = ['nix', 'kubernetes', 'helm']
+++

Helm's default workflow fetches charts at deploy time. You `helm repo add`, you `helm upgrade
--install`, and the version you get is whatever the repository index served that morning. This has
implications on both security and stability.

Vendoring the chart addresses both security and stability: unpack the chart into your repository and
commit it. The chart stops being a URL you trust and becomes a directory you can read, diff and
scan.

I wrote a small CLI called [`helm-vendor`][helm-vendor] for this, and this post is a tutorial on
setting it up from an empty directory: a Nix flake, a `charts.toml` registry, a devshell, a CI
check, and a pre-push hook that scans the vendored charts for secrets.

[helm-vendor]: https://github.com/sshine/helm-vendor

## Why vendor

- **Upgrades become reviewable.** Bumping a chart is a diff, not a version string.
- **Nix reads a directory.** No fixed-output derivation, no `sha256` to update, no network at build
  time. The chart path is just a path in the store.
- **The scanner sees what the cluster sees.** Secret scanning, policy checks and human review all
  run against the same bytes that get rendered.
- **Upstream disappearing stops being your problem.** Charts get yanked, repositories move, OCI tags
  get deleted.

## helm-vendor

The `helm-vendor` CLI keeps a declarative registry in `charts.toml` and vendors each chart into
subdirectories of `charts/`. `charts.toml` is found by walking up from the current directory, so the
commands work anywhere in the project tree.

```
$ helm-vendor --help
Vendor Helm charts from a declarative charts.toml registry

Usage: helm-vendor [OPTIONS] <COMMAND>

Commands:
  add         Declare a chart in charts.toml and vendor it. Creates charts.toml if it does not exist
  remove      Undeclare charts and delete their vendored directories
  sync        Vendor charts so charts/ matches charts.toml. Defaults to every chart
  update      Re-pin charts to the latest upstream version and vendor them
  list        List charts and their pinned versions
  completion  Print a shell completion script. Source it with e.g. `eval "$(helm-vendor completion zsh)"`
  help        Print this message or the help of the given subcommand(s)

Options:
      --config <CONFIG>  Path to charts.toml. Auto-detected by walking up from CWD if omitted
  -h, --help             Print help
  -V, --version          Print version
```

Every chart-selecting command takes zero or more chart names, where naming none means all of them.
So `sync` vendors the whole registry and `sync grafana loki` vendors two charts. The only exception
is `remove`, which requires at least one chart name.

## Setting up a Nix flake

`helm-vendor` can be used with plain git and no Nix.

However, Nix integration provides a series of advantages:

- Installs the `helm-vendor` tool in a project devshell
- Automatically installs and manages chart-specific git hooks
- Exposes charts via `chart2json` for [kubenix][kubenix] to manage
- Enables secrets leak detection for rendered charts, not just by scanning templates

I use [flake-parts][flake-parts] with [import-tree][import-tree], so every `.nix` file
under `nix/` is a module and `flake.nix` holds nothing but inputs.

[flake-parts]: https://flake.parts/
[import-tree]: https://github.com/vic/import-tree
[kubenix]: https://kubenix.org/

```nix
# flake.nix
{
  description = "Vendored Helm charts";

  inputs = {
    nixpkgs.url = "https://nixos.org/channels/nixpkgs-unstable/nixexprs.tar.xz";

    flake-parts.url = "github:hercules-ci/flake-parts";
    flake-parts.inputs.nixpkgs-lib.follows = "nixpkgs";

    import-tree.url = "github:vic/import-tree";

    devshell.url = "github:numtide/devshell";
    devshell.inputs.nixpkgs.follows = "nixpkgs";

    helm-vendor.url = "git+https://github.com/sshine/helm-vendor";
    helm-vendor.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs =
    inputs:
    inputs.flake-parts.lib.mkFlake { inherit inputs; } (inputs.import-tree ./nix);
}
```

```nix
# nix/systems.nix
{
  systems = [
    "x86_64-linux"
    "aarch64-linux"
    "aarch64-darwin"
  ];
}
```

The devshell provides `helm-vendor` and the `helm` it shells out to. Shell completion is generated
by the binary itself and knows your chart names, which is the difference between typing
`kube-prometheus-stack` and pressing tab.

```nix
# nix/devshell.nix
{ inputs, ... }:
{
  imports = [ inputs.devshell.flakeModule ];

  perSystem =
    { pkgs, system, ... }:
    {
      devshells.default = {
        packages = [
          inputs.helm-vendor.packages.${system}.default
          pkgs.kubernetes-helm
          pkgs.betterleaks
          pkgs.just
        ];

        devshell.startup.helm-vendor-completion.text = ''
          if [ -n "$ZSH_VERSION" ]; then
            eval "$(helm-vendor completion zsh)"
          elif [ -n "$BASH_VERSION" ]; then
            eval "$(helm-vendor completion bash)"
          fi
        '';
      };
    };
}
```

If you do not want the flake input, the binary is a `nix run` away:

```console
$ nix run git+https://github.com/sshine/helm-vendor -- --help
```

## Adding the first charts

`add` takes a name, a source URL and an optional version. Omit the version and it resolves and pins
whatever upstream currently offers.

```console
$ helm-vendor add cert-manager https://charts.jetstack.io/
  added cert-manager 1.21.2

$ helm-vendor add grafana https://grafana.github.io/helm-charts
  added grafana 10.5.15

$ helm-vendor add loki https://grafana.github.io/helm-charts 6.25.0
  added loki 6.25.0
```

OCI registries work the same way; the URL scheme is the only difference.

```console
$ helm-vendor add argo-cd oci://ghcr.io/argoproj/argo-helm/argo-cd 7.8.4
  added argo-cd 7.8.4
```

Each of those writes one table to `charts.toml` and one directory under `charts/`.

## What charts.toml looks like

```toml
[cert-manager]
repo = "https://charts.jetstack.io/"
chart = "cert-manager"
version = "1.21.2"

[grafana]
repo = "https://grafana.github.io/helm-charts"
chart = "grafana"
version = "10.5.15"

[loki]
repo = "https://grafana.github.io/helm-charts"
chart = "loki"
version = "6.25.0"

[argo-cd]
oci = "oci://ghcr.io/argoproj/argo-helm/argo-cd"
chart = "argo-cd"
version = "7.8.4"
```

Four fields, of which you pick either `repo` or `oci`:

- **table name** is your local name for the chart. It is the key you pass on the command line and
  the directory name under `charts/`.
- **`chart`** is the name upstream publishes. Usually identical to the table name, but not always.
  The desec cert-manager webhook publishes `cert-manager-desec-webhook` while I want to call it
  `cert-manager-webhook-desec` so it sorts next to the Hetzner one.
- **`version`** is the exact version, not a range. Some publishers prefix a `v` (`v1.20.1`,
  `v0.22.0`) and some do not; the file records whatever upstream calls it.
- **`repo` / `oci`** is where it comes from.

Several charts can share a repository. Istio publishes `base`, `cni`, `gateway` and `istiod` from
one URL, and they end up as four tables with the same `repo` and `version`.

## Keeping charts current

`list` reads only the local file. Add `--check` to query upstream for a `LATEST` column:

```console
$ helm-vendor list --check
NAME          VERSION   LATEST     source
argo-cd       7.8.4     10.9.2  ↑  oci://ghcr.io/argoproj/argo-helm/argo-cd
cert-manager  1.21.2    1.21.2     https://charts.jetstack.io/
grafana       10.5.15   10.5.15    https://grafana.github.io/helm-charts
loki          6.25.0    7.3.0   ↑  https://grafana.github.io/helm-charts
```

`--outdated` filters to the rows with an arrow and exits non-zero when there are any, which makes it
a usable nightly CI job:

```console
$ helm-vendor list --outdated
NAME      VERSION   LATEST     source
argo-cd   7.8.4     10.9.2  ↑  oci://ghcr.io/argoproj/argo-helm/argo-cd
loki      6.25.0    7.3.0   ↑  https://grafana.github.io/helm-charts
error: 2 chart(s) outdated
```

`update` re-pins and vendors in one step, so `charts.toml` and `charts/` never disagree:

```console
$ helm-vendor update loki
  loki 6.25.0 -> 7.3.0
  updated loki
```

`--to` pins an exact version instead of resolving the latest, which is how you downgrade after an
upgrade goes badly, or step through a chart's majors one at a time:

```console
$ helm-vendor update grafana --to 10.0.0
  grafana pinned to 10.0.0
  updated grafana
```

And then the payoff, which is the actual reason to vendor at all:

```console
$ git diff --stat
 charts.toml                                        |   2 +-
 charts/grafana/Chart.yaml                          |   7 +-
 charts/grafana/README.md                           |  18 +-
 charts/grafana/templates/_config.tpl               |   2 +-
 charts/grafana/templates/_helpers.tpl              |  74 +-----
 charts/grafana/templates/_pod.tpl                  | 295 +--------------------
 .../templates/image-renderer-deployment.yaml       |   3 -
 charts/grafana/templates/pvc.yaml                  |   4 +-
 charts/grafana/templates/route.yaml                |  14 +-
 charts/grafana/templates/secret-env.yaml           |   1 -
 charts/grafana/templates/secret.yaml               |   1 -
 charts/grafana/templates/servicemonitor.yaml       |   1 -
 charts/grafana/templates/statefulset.yaml          |   4 -
 charts/grafana/values.yaml                         |  67 +----
 14 files changed, 35 insertions(+), 458 deletions(-)
```

You are reviewing a chart upgrade the same way you review a dependency bump in code.

## Verifying in CI

`sync` vendors charts until `charts/` matches `charts.toml`. `sync --check` does the same fetch and
compares instead of writing, exiting non-zero on any difference:

```console
$ helm-vendor sync --check
  ok argo-cd
  ok cert-manager
  ok grafana
  ok loki
4 chart(s) in sync
```

If someone hand-edits a vendored chart, or bumps a version in `charts.toml` without vendoring it:

```console
$ helm-vendor sync --check
  ok argo-cd
  ok cert-manager
  ok grafana
  changed loki
error: 1 chart(s) out of sync: loki
```

This check can be run on every pull request. Without it, `charts/` doesn't have a contract, and a
version bump that never got vendored is invisible until the cluster disagrees with the repository.

## Exposing the charts to Nix

Vendoring makes the charts ordinary paths, so a small module can hand them to the rest of the Nix
flake without anyone spelling out a directory name twice:

```nix
# nix/charts.nix
{ self, lib, ... }:
let
  chartsDir = self + "/charts";
  isChart =
    name: type: type == "directory" && builtins.pathExists (chartsDir + "/${name}/Chart.yaml");
in
{
  flake.charts = lib.mapAttrs (name: _: chartsDir + "/${name}") (
    lib.filterAttrs isChart (builtins.readDir chartsDir)
  );
}
```

```console
$ nix eval .#charts --json | jq
{
  "argo-cd": "/nix/store/fk4px1w7...-source/charts/argo-cd",
  "cert-manager": "/nix/store/fk4px1w7...-source/charts/cert-manager",
  "grafana": "/nix/store/fk4px1w7...-source/charts/grafana",
  "loki": "/nix/store/fk4px1w7...-source/charts/loki"
}
```

A consumer flake takes this repository as an input and reads `inputs.charts.charts.grafana` wherever
a chart path is wanted. In my case that is kubenix, which renders the chart to manifests at
evaluation time, but nothing about the module is kubenix-specific.

## Vendored charts contain things that look like secrets

Here is the part I did not expect when I started vendoring. A chart tarball is not only templates
and `values.yaml`. It ships CI fixtures, README examples and commented-out sample configuration, and
upstream authors write those with placeholder credentials that are shaped exactly like real ones.

Run [betterleaks][betterleaks] over the four charts added above and it finds three:

[betterleaks]: https://github.com/betterleaks/betterleaks

```console
$ betterleaks dir . --verbose
┌─kubernetes-secret-yaml──○
│
│ 101 │     kind: Secret
│ 102 │     metadata:
│ 103 │       name: image-renderer-certificate
│     │ … (3 more lines)
│ 107 │       not-a-real-certificate: UExBQ0VIT0xERVIgQ0VSVElGSUNBVEU=
│     │       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
│
│ attributes:
│   path .......... charts/grafana/ci/with-image-renderer-values.yaml
│   resource ...... fs.content
└○

┌─private-key──○
│
│ 525 │     #     -----BEGIN OPENSSH PRIVATE KEY-----
│     │           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^. (340 bytes)
│ 526 │     #     ...
│ 527 │     #     -----END OPENSSH PRIVATE KEY-----
│     │ … (7 more lines)
│ 535 │     #    -----BEGIN OPENSSH PRIVATE KEY-----
│
│ attributes:
│   path .......... charts/argo-cd/values.yaml
│   resource ...... fs.content
└○

1:38AM INF scanned ~5294272 bytes (5.29 MB) in 596ms
1:38AM WRN leaks found: 3
```

Both are false positives. Grafana's `ci/` directory has a fixture whose base64 payload decodes to
the string `PLACEHOLDER CERTIFICATE`, and Argo CD's `values.yaml` documents its SSH key option with
a commented-out key body of `...`. Neither is a secret, and neither is going away, because they are
upstream's files and not mine.

A scanner that cries wolf on every `helm-vendor sync` gets turned off within a week, so the
allowlists go in `.betterleaks.toml` next to `charts.toml`. Each one is scoped to the specific line
pattern that caused the false positive, with a description saying why it is not a secret:

```toml
# .betterleaks.toml
title = "vendored charts betterleaks config"

# Inherit all upstream rules; only add project-specific allowlists below.
[extend]
useDefault = true

[[allowlists]]
description = "Grafana CI test file with placeholder certificate"
regexTarget = "line"
regexes = [
  "not-a-real-certificate",
]

[[allowlists]]
description = "Argo CD chart example configuration (commented-out SSH key)"
regexTarget = "line"
regexes = [
  "#\\s+-----BEGIN OPENSSH PRIVATE KEY",
]
```

```console
$ betterleaks dir . -c .betterleaks.toml
1:38AM INF scanned ~5294272 bytes (5.29 MB) in 580ms
1:38AM INF no leaks found
```

The allowlist is the interesting artifact here. It is a written record of every chart line that
looks like a credential and is not, reviewed once by a human and then quiet. Anything a future
`helm-vendor update` introduces gets reported, because the allowlists match the known exceptions and
nothing else.

Adding a `useDefault` rule set and then whitelisting three lines is the right shape. Whitelisting
the whole `charts/` directory is not: the point of scanning vendored charts is that a chart you
pulled from an OCI registry this morning is untrusted third-party content in your repository, and a
chart with a real credential baked in is exactly the thing you want to hear about.

## Wiring the scan into a hook

I run this as a pre-push hook with [hk-nix][hk-nix], which I have written about before:

[hk-nix]: https://github.com/nix-tools/hk-nix

{{< articlelink href="/articles/git-config-based-hooks-with-hk-nix/" title="Git config-based hooks with hk-nix" date="Aug 1, 2026" >}}

```nix
# nix/hooks.nix
{ inputs, ... }:
{
  imports = [ inputs.hk-nix.flakeModules.default ];

  perSystem =
    { config, lib, pkgs, ... }:
    let
      # -c is explicit because betterleaks only auto-discovers .betterleaks.toml
      # relative to the target path, and here the targets are individual files.
      betterleaks = "${lib.getExe pkgs.betterleaks} dir -c .betterleaks.toml";
    in
    {
      hk-nix.settings.hooks."pre-push".steps.betterleaks.check = "${betterleaks} {{files}}";

      devshells.default = {
        packages = [ config.hk-nix.hk ];
        devshell.startup.hk.text = config.hk-nix.shellHook;
      };
    };
}
```

Pre-push rather than pre-commit, because scanning five megabytes of YAML takes 600 ms and pre-commit
has to stay under the threshold where you start passing `--no-verify` out of habit. Pre-push is
also the correct boundary: a secret that never leaves your machine is recoverable, and one that
reaches a remote is not.

Add the input alongside the others in `flake.nix`:

```nix
hk-nix.url = "github:nix-tools/hk-nix";
hk-nix.inputs.nixpkgs.follows = "nixpkgs";
hk-nix.inputs.flake-parts.follows = "flake-parts";
hk-nix.inputs.import-tree.follows = "import-tree";
```

## A justfile for the whole thing

```just
_default:
    @just --list --unsorted

# Run the same checks as CI
ci: vendor-check

# Vendor charts so charts/ matches charts.toml (all if no name given)
vendor-sync *names:
    helm-vendor sync {{names}}

# Verify vendored charts match charts.toml (all if no name given)
vendor-check *names:
    helm-vendor sync --check {{names}}

# Show charts whose pinned version is older than upstream
vendor-outdated:
    helm-vendor list --outdated

# Declare a chart and vendor it; omit version to pin the latest
vendor-add name url version='':
    helm-vendor add {{name}} {{url}} {{version}}

# Bump every chart in charts.toml to its latest upstream version
vendor-update-all:
    helm-vendor update

# Scan vendored charts for secrets
leaks *args:
    betterleaks dir . -c .betterleaks.toml {{args}}
```

## Summary

A `charts.toml` registry, 4 .nix files one betterleaks allowlist. Cloning the repository and
entering the devshell gets you a pinned `helm-vendor`, a pinned `helm`, shell completion that knows
your chart names, and a pre-push hook that installs itself.

A chart upgrade is now `just vendor-update-all`, `git diff`, and a commit message that says which
version you moved to. The chart your cluster renders is a file in your repository that a human
approved, which is the property I wanted and could not get from `helm repo add`.
