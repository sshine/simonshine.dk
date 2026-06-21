+++
date = '2026-05-18T01:50:06+02:00'
draft = true
title = "If flakes are experimental, what's the experiment?"
+++

## tl;dr

You're in luck: [flakes aren't real](https://jade.fyi/blog/flakes-arent-real/), so none of this matters!

**NOTE: This is a DRAFT! In particular, I've dug into the commit histories of Nix flakes on both mainline, Lix and
Determinate Nix and found out they're very actively developed. I will be reconsidering my conclusions somewhat.**

## Summary

- "experimental" originally meant "we're still evaluating whether this is a good idea or not"
- the experiment has ended, but the outcome of whether the experiment succeeded cannot be expressed
- since the community has diverged on whether the experiment succeded, we cannot answer it in unity
- on the one hand, flakes are obviously a success: they're widely in use throughout the gitverse
- on the other hand, flakes have obviously failed: they scope creep and the attempts to finalize them died
- ironically, flakes become a social experiment in open-source governance instead of a feature experiment
- meanwhile, the technical limitations of flakes appear to get resolved independently as they get reimplemented
- what flakes provides is a banner for joined effort: since they're divisive, the **post-flake movement** is born
- flake-parts already offers "top-level configurations" with no dependency on a contended runtime
- the dendritic patterns happens to align with the post-flake movement because it is catchy and researchy
- libraries can't solve _convergence_; new Nix users all follow the same flowchart and get stuck at flakes
- the post-flake movement reframes flakes as a _design pattern_, with flake-parts as a strong common denominator
- a more radical move than merging flakes would be to _remove_ them from the Nix CLI entirely
- flakes are defined by their (stalled) implementation; is it time to create a flake specification?

## Story Time!

*(Skip this section, this is just me ranting about discovering new design patterns.)*

This year I have officially taken over the role of [terranix](https://terranix.org) maintainer, as well as the ownership
of the terranix.org domain. This is the first open-source project with real users that I've been responsible for after
30 years of being an open-source consumer. To celebrate, for the purpose of dogfooding, and to provide another example
usage for documentation, I decided to maintain DNS records for terranix.org with terranix and [deSEC.io][desec].

[desec]: (https://desec.io).

[ingolf]: https://ingolf-wagner.de/

Since I [declared the novelty budget dead](/articles/is-the-novelty-budget-dead/), and because I'm already sold on [the
dendritic pattern][dendritic], I decided to complicate the project flake with [flake-file][flake-file] and found myself
wasting the whole evening just tinkering with inputs and outputs and reading source code. I rabbit-holed deeper on
[unflake][unflake] and [trix][trix] since they were mentioned on the [Nix Freaks][nix-freaks] podcast. None of these are
really as simple as flakes: Flakes are a recognizable pattern with a known starting point for reading, where I don't
have to decode the author's domain-specific language.

[dendritic]: https://denful.dev/

So here I am in 2026, exactly one year after Shahar coined the term dendritic and Vic picked it up and ran with it.
There are dozens of contributors to flake-alternatives that offer various degrees of flake compatibility, some of which
don't require the experimental feature to be enabled, some which entirely replace parts of flakes (e.g. input pinning),
soften the input deduplication (no `nixpkgs_7`, `nixpkgs_8`, ...), allow for [other version-control systems][nixtamal]
than git.

[flake-file]: https://github.com/denful/flake-file
[den]: https://github.com/denful/den
[unflake]: https://github.com/denful/den
[nix-freaks]: https://fulltimenix.com/nix-freaks
[flake-parts]: https://flake.parts
[import-tree]: https://github.com/denful/import-tree
[nixtamal]: https://nixtamal.toast.al/#toc-entry-1

While the typical dendritic invocation is via [flake-parts][flake-parts] and [import-tree][import-tree], the dendritic
pattern extends flakes by saying flake-parts modules are just one kind of "top-level configuration". Projects like
Vic's [with-inputs][with-inputs], aanderse's [trix][trix], Max Siling's [unflake][unflake], toastal's
[nixtamal][nixtamal]: they experiment with "the flake space", by not requiring experimental feature flags.

[with-inputs]: https://github.com/denful/with-inputs
[trix]: https://github.com/aanderse/trix
[unflake]: https://codeberg.org/goldstein/unflake
[denful]: https://github.com/denful

## What's an experiment?

The Nix Reference Manual defines an [experimental feature][experimental] this way:

[experimental]: https://releases.nixos.org/nix/nix-2.24.0/manual/development/experimental-features.html

> An experimental feature enables developers to iterate on and deliver a new idea without committing to it or requiring
> a costly long-running fork. It is primarily an issue of implementation, targeting Nix developers and early testers."

Experimental feature flags in Nix were introduced at the same time as flakes ([Nix 2.4][nix-24]).

[nix-24]: https://www.tweag.io/blog/2021-12-20-nix-2.4/

The goal was to avoid experimental stuff landing in `master` causing instability and longer release cycles.

Since flakes were the big experiment and flakes are not going to land in mainline Nix, experimental feature flags
were a success.

## Flake code activity in NixOS/nix, May 2025 – May 2026

**Scope:** 127 commits across `src/libflake/`, `src/libflake-c/`, `src/libflake-tests/`, `src/nix/flake.cc`, and `src/nix/flake.md`. 25 unique authors. ~2,200 insertions / ~1,600 deletions.

### Bug fixes (the largest category)
- **Fingerprint / eval cache:** stopped forcing `revCount` in the fingerprint and restored fingerprint behavior for untrustworthy `revCount` values (avoids unnecessary cache invalidation).
- **URL and flakeref parsing:** fixed `%2F` handling in URL paths; fixed handling of unescaped spaces, quotes, and chevrons in queries/fragments; stopped crashing on flakerefs containing newlines; fixed assertion crash when a malformed URL falls through to the path scheme; restored plain `git` input recognition; restored path-separator handling for indirect and git-archive flakerefs.
- **Lock-file / override semantics:** fixed "deep overrides"; disallowed inputs from having both a `flakeref` and a `follows`; rejected empty paths in `inputUpdates` (and matching reject in the C API); `lockFlake()` now respects an input's lock file when updating.
- **Registry / refs:** fixed `dir` parameter being ignored in the flake registry; fixed flake-id flakerefs that include revisions.
- **Misc correctness:** fixed an argument-order evaluation footgun in `libflake`; removed an incorrect assertion in `nix flake check`; fixed a memory leak in a C-API flake test; mounted inputs on `storeFS` to restore `fetchToStore()` caching.

### New / changed features
- `builtins.getFlake` now supports path values.
- `builtins.flakeRefToString` now evaluates attributes.
- `nix flake clone` now supports all input types.
- `nix flake check`: skips substitutable derivations (much faster checks); logs success in verbose mode; prints failing attribute paths; drops the "(ignored)" suffix in `--keep-going` errors.
- `nix flake show`: logs the attribute name when something "must be a derivation".
- `nix flake archive`: refactored `storePath` computation into a lambda; switched to a "deducing this" recursive lambda.
- New `NonEmptyInputAttrPath` and `AttrPath` / `AttrSelectionPath` types tightening internal contracts.
- Lazy fetcher attributes (thunks emitted for them) — meaningful evaluation-perf change for flake inputs.
- `FlakeCommand` moved into a header so subcommands can be registered separately.
- Avoid copying flakes to the store unnecessarily.

### Performance / evaluator interactions
- Lazy fetcher-attribute thunks (above).
- Faster `nix flake check` via skipping substitutable derivations.
- Various `libexpr` changes that ripple into flake eval: proxy `ListView` for list access, statically allocated common symbols, replaced `std::unordered_*` with Boost hash maps in hot paths, `emptyBindings` made a global constant.

### Refactoring and modernization
- Bumped the codebase to **C++23**, then applied `clang-format` universally.
- Replaced string-based `Path` with `std::filesystem::path` across `libutil`, `libstore`, `libfetchers`, and `libflake`; introduced `PathFmt` to fix double-quoting issues that fell out of that.
- Removed top-level `using namespace nix;`, cleaned up unnecessary includes, ran IWYU on `libflake`.
- Removed unused `maybeParseFlakeRef` / `maybeParseFlakeRefWithFragment`.
- Moved `openEvalCache` into `libflake`; used `ref<LockedFlake>` where non-null is guaranteed.
- Reworked user-facing message tense (future → present).

### C API (`libflake-c`)
- Embedded C API symbols in release binaries.
- Improved input-override error-message clarity.
- Rejected empty input-override paths.
- Various `extern "C"` cleanups and FFI fixes.

### Build / tests / infra
- Meson: added then reverted then re-added library `soversion`/SONAME; consolidated ASAN options.
- Enabled ASAN builds in CI treewide.
- Gave unit tests a writable `$HOME`; cleared `NIX_STORE` in fetcher/expr/flake test environments.
- Added tests for spaces in URIs.
- Fixed static builds (most recent commit in the window) and added more MinGW fixes.

### Documentation
- Added `self-attribute` documentation.
- Added a git-tags example.
- Fixed manual links and check-page link fragments.
- Updated developer-facing links to nix.dev.

### Top contributors
Sergei Zimmerman (26), Eelco Dolstra (22), Robert Hensing (18), John Ericson (11), Jörg Thalheim (9), Amaan Qureshi (8), Taeer Bar-Yam (5), Farid Zakaria (4).

### Overall character of the year
Bug fixes dominate, particularly around URL/flakeref parsing, lock-file overrides, and fingerprint/cache correctness. Net feature growth is modest: lazy fetcher attributes and `getFlake` accepting paths are the most user-visible additions. A large share of the churn is modernization (C++23, `std::filesystem::path`, IWYU, formatting) that touches flake code incidentally rather than redesigning it. No commits in the window indicate movement toward stabilizing the `flakes` experimental flag itself.

## Can you get flakes without `--experimental-features flakes`?

It turns out you can!

You just have to spend a dozen hours reading research-grade code.

Ironically, this is a lot more experimental in the real sense of the word than enabling a built-in feature flag.

By now, the Nix community is diverging on whether flakes are experimental or not: They're widely used, they're considered
stable by Determinate Systems (who employ Eelco), they have well-known deficiencies that keep them locked behind the
feature flag, and there is limited incentive to improve on those deficiencies within the CLI.

It should be clear that "experimental" here means "the feature flag is not moving further as it is." We're not really
experimenting. The problems advancing flakes within the Nix CLI are socio-technical and more complex than just
performance-optimizing lazy functional runtime semantics. They're feature-complete by some standard, and have immature
runtime characteristics by others.

I personally quit politics after it consumed my teenage years. I like technical stuff now.

And so I'm driven to these post-flake solutions even though they cost a lot more time to understand.

### unflake

[unflake][unflake] is a single Python file by [Max Siling][max] that resolves flake-style inputs without the
experimental feature. You point it at a `flake.nix`, and it writes an `unflake.nix` you can import like any other Nix
expression.

[max]: https://goldstein.lol/

Run it via Nix without installing anything:

```shell
nix run -f https://ln-s.sh/unflake unflake
```

The minimal shape is just a replacement of the `inputs`/`outputs` ceremony:

```nix
# flake.nix (before)
{
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  inputs.flake-parts.url = "github:hercules-ci/flake-parts";
  outputs = inputs: { /* your code */ };
}
```

```nix
# default.nix (after)
import ./unflake.nix (inputs:
  # your code
)
```

Running `unflake` once reads `flake.nix` and writes `unflake.nix`.

Running it again updates everything; `unflake -u nixpkgs` updates just one input.

An ergonomic upgrade is `inputs.nix`, which is just the inputs attrset and accepts arbitrary Nix:

```nix
# inputs.nix
{
  nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  flake-parts.url = "github:hercules-ci/flake-utils";

  _unflake.dedupRules = [{
    when = { type = "github"; owner = "nixos"; repo = "nixpkgs"; ref = "nixpkgs-unstable"; };
    set  = { ref = "nixos-unstable"; };
  }];
}
```

The `dedupRules` block is the thing you can't easily express in stock flakes: unify "technically different but morally
identical" inputs (here, `nixpkgs-unstable` → `nixos-unstable`) without writing a wall of `.follows`. unflake treats
*every* input as if `.follows` were set globally, which is the assumption most flakes in the wild already lean on.

If your project already uses [npins][npins], pass `-b npins` and unflake will write its resolved dependencies into
`npins/sources.json` instead of generating `unflake.nix`.

[npins]: https://github.com/andir/npins

### trix

[trix][trix] is a Rust CLI by [Aaron Andersen][aanderse] that reads your existing `flake.nix` and `flake.lock` and
evaluates them. Your flake stays as-is; trix delegates to `nix-build`, `nix-shell`, and `nix-instantiate` under the
hood, injecting the experimental flags only on the inner calls that genuinely need them.

[aanderse]: https://github.com/aanderse

Run it without installing:

```shell
nix run github:aanderse/trix
```

For a stock `flake.nix`:

```nix
{
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  outputs = { self, nixpkgs }: {
    packages.x86_64-linux.hello = nixpkgs.legacyPackages.x86_64-linux.hello;
  };
}
```

The commands mirror the `nix` subcommands you already know:

```shell
trix build .#hello
trix shell .#hello
trix develop .#default
trix run github:aanderse/trix # >_<
```

The first run generates a standard `flake.lock` — the same one `nix flake lock` would produce — so you can switch
between trix and stock flakes without conflict. trix also evaluates in-place rather than copying your working
directory into the store, which is a nice side benefit.

A `direnv` helper ships in the package. In `~/.config/direnv/direnvrc`:

```bash
source ~/.nix-profile/share/trix/direnvrc
```

Then in a project's `.envrc`:

```bash
use trix
# or for a specific devshell:
use trix .#myshell
```

Where unflake says "let's stop pretending we need a flake runtime", trix says "let's keep the flake format but route
it through the stable CLI". Different corners of the post-flake space, same underlying point: the experimental flag is
gating the implementation, not the design.

## Let's end the experiemnt

[flake-parts][flake-parts] provide "[_top-level configurations_][den-pat]" with no dependency on contended runtimes.

[den-pat]: https://github.com/mightyiam/dendritic#the-pattern

There are several ways to execute them, with or without experimental features, with or without actual experimenting.

What libraries can't solve, however, is convergence: People who begin using Nix all follow the same flowchart initially:

1. Install Nix or NixOS
2. Find home-manager
3. Get confused why home-manager modules aren't NixOS modules
4. Find out flakes exist
5. Either assess "they're experimental, I'm overwhelmed enough as it is!"
6. Or assess "Flakes sound cool, all my favorite projects seem to use them."

I happened to start my Nix life with a colleague who pushed flakes hard. At the same time, I was overwhelmed by a very
steep learning curve of bare-metal Rust and setting up on-prem CI for cross-compilation on NixOS. So I pulled the brake
on flakes for some weeks. Over time I use them everywhere because I trusted that my colleague had good taste.

What would happen if, instead of merging flakes in the Nix CLI, we removed them entirely?

They'd stop being "experimental" and better implementations would get an even playing field.

The real, massive adoption of flakes would have to accept they live behind an experimental feature flag, and the
experiment is over. We all won. But we need to move on. To what?

## Call for unity

The post-flake movement is viewing flakes as more of a design pattern than a hardcoded feature inside a CLI. A pattern
you can disassemble and use parts of, but with strong common denominators, especially focused on flake-parts. The
immediate benefit of using shared patterns is recognizability and reuse of other people's strong ideas.

But since the post-flake movement currently lives mostly inside a research vessel called [Denful][dendritic], it'd be
lovely if this vessel could eventually dock somewhere and give back technical solutions untangled from the politics from
five years ago.

- Nix flakes don't have a schema, they're [whatever `nix flake check` accepts][great-flake-check]
- Flake-parts attempt to be that schema without being normative about it
- [flake-schemas][flake-schemas] are not standardized beyond Determinate Nix
- Flakes are, in general, defined by their implementation, warts and all
- Let the flake subcommand live in a nixpkgs package that can simply be installed

[great-flake-check]: https://goldstein.lol/posts/great-nix-flake-check/
[flake-schemas]: https://github.com/DeterminateSystems/flake-schemas

Maybe it is time to remove the bloat, and normalize them beyond their current implementation.

Maybe it is time to specify what flakes are?
