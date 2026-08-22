+++
date = '2026-08-08T01:59:35+02:00'
draft = false
title = 'Hashpinning'
tags = ['rust', 'nix', 'security']
+++

GitHub Actions workflows usually start like this:

```yaml
- uses: actions/checkout@v6
```

`v6` is a git tag that points to some commit for the release of this version of an action. There is
also a `v6.0.1` tag. Every time a minor or patch version is released, e.g. `v6.0.2` or `v6.1.0`, the
`v6` tag is moved to that. Being unspecific means you always get the latest version that begins with
`v6`. This is a feature.

What if a new version of an action changes behavior and makes your CI fail?

What if an action gets compromised and executes arbitrary code in your CI runner?

The simple technique for avoiding accidents and malice is called hashpinning:

```yaml
- uses: actions/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8 # v6.0.1, 2025-12-02
```

This directly references the git commit.

I always put the version and the release date in a comment at the end.

I wrote a CLI tool, [hashpinner][hp], to automate this.

[hp]: https://github.com/sshine/hashpinner

## tl;dr

- `hashpinner --pin` rewrites `uses:` references to commits and annotates each with the tag and date.
- `hashpinner --check` fails on anything unpinned. You can run this as a git hook.
- Comments can lie. `hashpinner --check --deep` checks that each commit is tagged with the version in the comment.
- Because GitHub shares object stores with all forks, you can actually pin to a commit in another
  fork. `hashpinner --deep` checks that a commit is reachable from a ref on the mentioned fork (is
  not an orphan or belongs to another fork).
- `uses:` can nest recursively inside YAML anchors and in local actions at arbitrary paths.
- `pull_request_target` and `workflow_run` fail `--check`, because pinning does not constrain them.
- Under `.forgejo/`, an `owner/repo` reference does not imply github.com as the domain.

## What a moving tag costs

In March 2025 someone pushed a commit to [tj-actions/changed-files][tj] that scanned runner memory
for credentials and printed them into the build log. Then they retargeted every existing version
tag at it. Around 23,000 repositories used that action. Access keys, PATs, npm tokens and private
keys ended up in public logs ([CVE-2025-30066][cve1]). Days later `reviewdog/action-setup` got the
same treatment ([CVE-2025-30154][cve2]).

Anyone pinned to a commit was unaffected.

[tj]: https://github.com/tj-actions/changed-files
[cve1]: https://github.com/advisories/GHSA-mrrh-fwg8-r2c3
[cve2]: https://www.cisa.gov/news-events/alerts/2025/03/18/supply-chain-compromise-third-party-tj-actionschanged-files-cve-2025-30066-and-reviewdogaction

## Pinning

```console
$ hashpinner --check
.github/workflows/ci.yml
    ok    L9  actions/checkout  v4
           · not pinned, but allowlisted
  FAIL   L10  cachix/install-nix-action  v27
           × not pinned to a commit
  FAIL   L11  DeterminateSystems/magic-nix-cache-action  v8
           × not pinned to a commit
```

The default allowlist is `actions/*`, on the theory that GitHub owning your CI is already a given.
`--no-allow` empties it and nothing gets a pass.

```console
$ hashpinner --check --no-allow
.github/workflows/ci.yml
  FAIL    L9  actions/checkout  v4
           × not pinned to a commit
  FAIL   L10  cachix/install-nix-action  v27
           × not pinned to a commit
  FAIL   L11  DeterminateSystems/magic-nix-cache-action  v8
           × not pinned to a commit
```

Pinning them is the same command with `--pin`:

```console
$ hashpinner --pin
.github/workflows/ci.yml
    ok    L9  actions/checkout  v4
           · v4 -> v4.4.0, 2026-07-16
    ok   L10  cachix/install-nix-action  v27
           · v27 -> v27, 2024-05-15
    ok   L11  DeterminateSystems/magic-nix-cache-action  v8
           · v8 -> v8, 2024-09-09
  written
```

```yaml
- uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0, 2026-07-16
- uses: cachix/install-nix-action@ba0dd844c9180cbf77aa72a116d6fbc515d0e87b # v27, 2024-05-15
- uses: DeterminateSystems/magic-nix-cache-action@87b14cf437d03d37989d87f0fa5ce4f5dc1a330b # v8, 2024-09-09
```

I started writing those comments as a habit because if I didn't, there's no chance I would ever
explore and bump any hashpins. With versions, at least I have a human chance to evaluate if
something looks outdated.

Using `hashpinner`, the version number in the comment becomes parseable metadata.

You could argue this is a hack. I think of it as ad-hoc package management.

It's also very easy to write the wrong version number:

```console
$ hashpinner --check
.github/workflows/ci.yml
    ok    L9  actions/checkout  11d5960  v4.4.0, 2026-07-16
    ok   L10  cachix/install-nix-action  ba0dd84  v31.11.1, 2026-08-13
    ok   L11  DeterminateSystems/magic-nix-cache-action  87b14cf  v8, 2024-09-09
```

`hashpinner --deep` fetches the commit graph and asks the repository what each commit actually is:

```console
$ hashpinner --check --deep
.github/workflows/ci.yml
    ok    L9  actions/checkout  11d5960  v4.4.0, 2026-07-16
  FAIL   L10  cachix/install-nix-action  ba0dd84  v31.11.1, 2026-08-13
           × comment says v31.11.1, but this commit is v27, 2024-05-15
    ok   L11  DeterminateSystems/magic-nix-cache-action  87b14cf  v8, 2024-09-09
```

## Existence is not membership

On GitHub, a fork shares its object store with the upstream repository. Push a commit to any public
fork of `actions/checkout` and you can fetch it from `github.com/actions/checkout`. It was never
merged, never reviewed, never on an official branch. But it resolves!

So if someone hashpins on your behalf, you better check where the digest lives.

`hashpinner --deep` checks if the digest is reachable from any ref:

```console
$ hashpinner --check --deep
.github/workflows/ci.yml
  FAIL    L7  cachix/install-nix-action  0000000  v31.11.1, 2026-08-13
           × 0000000 is not reachable from any ref in cachix/install-nix-action;
             on GitHub this is what a commit injected through a fork looks like
```

## Pins get old

The downside of pinning actions is that you lose automatic renewal.

`hashpinner --bump` moves pins onto the latest version.

`hashpinner --check --bump` checks if we have the latest versions and fail otherwise, without writing.

```console
$ hashpinner --check --bump
.github/workflows/ci.yml
  FAIL    L9  actions/checkout  11d5960  v4.4.0, 2026-07-16
           × stale: 11d5960 is not the latest (v7.0.1, 2026-07-17)
  FAIL   L10  cachix/install-nix-action  ba0dd84  v27, 2024-05-15
           × stale: ba0dd84 is not the latest (v31.11.1, 2026-08-13)
  FAIL   L11  DeterminateSystems/magic-nix-cache-action  87b14cf  v8, 2024-09-09
           × stale: 87b14cf is not the latest (v14, 2026-05-15)
```

These parameters nest:

| | network | catches |
|---|---|---|
| `--check` | none | unpinned refs, mutable `docker://` tags |
| `--check --bump` | tags, shallow | pins left behind |
| `--check --deep` | full commit graph | nonexistent pins, fork-injected pins, lying comments |

`--check` alone is fast and offline, which is what makes it usable as a pre-push hook.

## Where `uses:` hides

A `uses:` does not have to be written where it is used:

```yaml
x-shared: &checkout actions/checkout@v4

jobs:
  label:
    steps:
      - uses: *checkout
      - uses: docker://alpine:3.20
      - uses: ./.github/actions/label
```

None of those three lines contains a pinnable reference, and one of them is under a key GitHub has
never heard of. A grep for `@v` finds nothing to complain about.

```console
$ hashpinner --check --no-allow
.github/actions/label/action.yml
  FAIL    L5  peter-evans/create-or-update-comment  v4
           × not pinned to a commit

.github/workflows/label.yml
  FAIL    L4  pull_request_target runs against this repository, with its secrets and a
              write token, on something an outsider did; no amount of pinning constrains
              that. Use pull_request instead, or allow it with
              --allow-trigger pull_request_target
  FAIL   L13  actions/checkout  v4
           · from the anchor defined on line 7
           × not pinned to a commit
  FAIL   L14  docker://alpine:3.20  3.20
           × mutable image reference; pin it as image@sha256:...
    ok   L15  ./.github/actions/label  local
           · local action, scanning .github/actions/label/action.yml
```

Four things happened there:

2. `docker://alpine:3.20` is a mutable tag. It is pinnable by digest but not by anything git knows,
   so it fails and is never rewritten.
4. `pull_request_target` failed just for existing.

## The trigger pinning cannot fix

A workflow on `pull_request_target` or `workflow_run` runs against *your* repository, with your
secrets and a write-scoped token, in response to something an outsider did. This is a known attack
vector and is impossible to protect against with pinning, since a pull request can simply change the
pin.

`hashpinner` will not give a fall sense of security by accepting these patterns by default.

You can, however, disable failure on these triggers:

```console
$ hashpinner --check --allow-trigger pull_request_target
```

Besides that, `hashpinner` does not analyse `permissions:`, template injection, credential
persistence, or any other CI security aspects. For that you want to look at [zizmor][zizmor].

[zizmor]: https://docs.zizmor.sh/

## Forgejo: same string, different repository

`actions/checkout@v4` under `.github/` means github.com. Under `.forgejo/` it resolves against the
instance's `DEFAULT_ACTIONS_URL`, which Forgejo defaults to `https://data.forgejo.org`. Different
host, different repository, potentially different commit ids.

Sometimes there is no repository there at all:

```console
$ hashpinner --pin --no-allow
.forgejo/workflows/release.yml
  FAIL    L7  softprops/action-gh-release  v3
           × softprops/action-gh-release: git error: git fetch failed: remote: Not found.
             fatal: repository 'https://data.forgejo.org/softprops/action-gh-release/'
             not found
```

hashpinner takes the host from the directory the file is in, and `--forgejo-host` overrides it.

Forgejo also reads only the *first* of `.forgejo/workflows`, `.gitea/workflows` and
`.github/workflows` that exists, and silently ignores the others. hashpinner scans all three and
warns when more than one is present.

## Using hashpinner as a GitHub Action

Two places. Locally, `--check` is offline and takes milliseconds, so it belongs in a pre-push hook
next to clippy. See [Git config-based hooks with hk-nix](/articles/git-config-based-hooks-with-hk-nix).

In CI, there is a composite action that runs unchanged on GitHub-hosted runners and on
[Forgejo runners](/articles/forgejo-actions-nixos-runners) with either a `docker` or a `host` label:

```yaml
- uses: sshine/hashpinner@<sha>                      # GitHub
- uses: https://github.com/sshine/hashpinner@<sha>   # Forgejo, absolute URL
  with:
    version: v0.2.0
    mode: check
    deep: "true"
```

`version` is required and takes an explicit tag, because there is no "latest" URL that works on both
forges: GitHub serves `/releases/latest/download/<asset>` and Forgejo 404s on it. The action
downloads a static musl binary for the runner's architecture and verifies it against a `.sha256`
sidecar before running it.

I'd recommend you pin the action. ;-)

## Installation

```console
$ nix run github:sshine/hashpinner
$ cargo install hashpinner
```

`git` must be on `PATH`; hashpinner uses the `git` CLI to resolve tags. The Nix package wraps the
binary, so that it ships with git access.

The flake also exports an overlay, so a NixOS configuration can take `pkgs.hashpinner` and get it
built against its own nixpkgs:

```nix
# flake.nix
{
  inputs.nixpkgs.url = "https://nixos.org/channels/nixpkgs-unstable/nixexprs.tar.xz";

  inputs.hashpinner.url = "github:sshine/hashpinner";
  inputs.hashpinner.inputs.nixpkgs.follows = "nixpkgs";

  outputs = { nixpkgs, hashpinner, ... }: {
    nixosConfigurations.myhost = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      modules = [
        ({ pkgs, ... }: {
          nixpkgs.overlays = [ hashpinner.overlays.default ];
          environment.systemPackages = [ pkgs.hashpinner ];
        })
      ];
    };
  };
}
```
