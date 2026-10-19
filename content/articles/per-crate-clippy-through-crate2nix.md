+++
date = '2026-10-19T11:22:14+02:00'
draft = true
title = 'Per-crate clippy through crate2nix'
tags = ['nix', 'rust']
+++

I don't allow `.unwrap()` in tests:

```toml
# Cargo.toml
[workspace.lints.clippy]
expect_used = "deny"
unwrap_used = "deny"
```

The usual argument for allowing it is that tests may cut corners, since only programmers run them.
I think that gets it backwards. A test that panics on `None` reports a crash at the line that
unwrapped, when it should report a failed assertion at the line that was checking something.

A rule like that needs the linter to look at test code, which means `--all-targets`:

```bash
cargo clippy --workspace --all-targets --all-features -- -D warnings
```

My CI runs on a small machine that also hosts coding agents and gets hammered by AI crawlers. A
`cargo clippy` check there meant compiling the whole dependency tree a second time, next to the
crate2nix build and the test run. Three compiles of one workspace, on a box already losing the
argument for its own CPU.

## tl;dr

- nixpkgs' `buildRustCrate` gained a configurable `capLints` in March 2026 ([a523dd74ac01][cap])
  and `useClippy` in May 2026 ([#521993][clip]). Together they run `clippy-driver` in place of
  `rustc` on individual crates.
- Applied to the six workspace members only, 162 of a crate's 163 derivation inputs stay identical
  to the ordinary build, so linting costs those six crates and not the 430 below them.
- `capLints` defaults to `"allow"`, which caps every lint including clippy's. Turn on `useClippy`,
  leave the default, and you get a check that runs, reports nothing and passes.
- crate2nix emits no `rust-version`, so clippy loses its MSRV floor and fires lints that
  `cargo clippy` suppresses. Mine was `clippy::chunks_exact_to_as_chunks`.
- `crateWithTest` separates compiling tests from running them, so the lint check and the
  integration check share one compile. The workspace compiles once per `nix flake check`.

[cap]: https://github.com/NixOS/nixpkgs/commit/a523dd74ac01
[clip]: https://github.com/NixOS/nixpkgs/pull/521993

## Why crate2nix and not crane

Both read `Cargo.lock`. The difference is whether cargo also drives the build.

[crane][crane] keeps it: `buildDepsOnly` runs cargo to populate `target/`, exports that directory,
and later derivations run cargo again against it. [crate2nix][c2n] takes the graph away at
evaluation time and emits one derivation per crate, each calling `rustc` directly.

[crane]: https://github.com/ipetkov/crane
[c2n]: https://github.com/nix-community/crate2nix

On a machine that keeps losing processes, I want Nix owning that graph. A crate that finishes is a
store path, so an interrupted run costs one crate instead of one artifact directory holding all of
them. `--max-jobs` then bounds the real concurrency, because Nix is scheduling the units rather
than cargo inside a single derivation.

It is also the only way to address one crate's compiler invocation, which is the whole trick.

## Swapping rustc for clippy-driver, per crate

`buildRustCrateForPkgs` receives each crate's attributes, so the workspace members can be picked
out by name:

```nix
# nix/_cargo-nix.nix
crate:
base (
  crate
  // lib.optionalAttrs (lint && builtins.elem crate.crateName members) {
    useClippy = true;
    capLints = "forbid";
    rust-version = msrv;
    extraRustcOpts = (crate.extraRustcOpts or [ ]) ++ [ "-D" "warnings" ];
  }
)
```

`members` comes from `builtins.readDir ../crates`, and `msrv` from the workspace manifest.
Dependencies fall through untouched and keep the store paths the ordinary build produced.

The check is then those six crates, with `runTests` to reach their test targets:

```nix
# nix/_clippy.nix
linted = lib.mapAttrsToList (
  name: member:
  member.build.override {
    features = cargoNix.allFeatures name;
    runTests = true;
    testCrateFlags = [ "--list" ];
  }
) cargoNix.workspaceMembers;
```

A one-crate source change rebuilds 11 derivations in 63 seconds.

## Three ways to get a check that tests nothing

Each of these passed while looking at less than I thought.

`capLints` defaults to `"allow"`. That caps every lint to allow, clippy's included, so `useClippy`
runs clippy-driver and emits nothing. nixpkgs says as much in a comment above the parameter.
`"forbid"` here means uncapped rather than raised: `#[allow]` and `#[expect]` keep working, and
`-D warnings` is what makes anything fail.

No `rust-version` reaches the compiler. crate2nix does not emit it, `CARGO_PKG_RUST_VERSION`
arrives empty, and clippy stops suppressing suggestions that postdate the declared minimum. With
`rust-version = "1.85"` in the manifest and none in the derivation, this fired under Nix and never
under cargo:

```console
error: using `chunks_exact` with a constant chunk size
  --> src/blob.rs:34:63
   = note: `-D clippy::chunks-exact-to-as-chunks` implied by `-D warnings`
```

Features resolve from the manifest alone. There is no `--all-features`. One of my test files opens
with `#![cfg(feature = "testing")]`, nothing else asks for that feature, and so it compiled into a
binary holding zero tests, which passed:

```console
running 0 tests
test result: ok. 0 passed; 0 failed; 0 ignored
```

Nine database tests, absent from a green check. The repair is a feature list per member: defaults
plus whatever its own manifest declares.

## One compile for both checks

`crateWithTest` builds the test binaries in one derivation and runs them in another.
`testCrateFlags`, `testInputs` and `testPreRun` are read only by the runner, so two checks can ask
for different runs of one build. The lint check lists tests; the integration check runs them
against a Postgres:

```nix
# nix/_integration.nix
member.build.override {
  features = cargoNix.allFeatures crate;
  runTests = true;
  testCrateFlags = [ "--include-ignored" ];
  testInputs = lib.optional (wants crate needsDatabase) postgresql;
  testPreRun = lib.optionalString (wants crate needsDatabase) database;
}
```

Both resolve to the same derivation:

```console
$ nix-store -q --requisites "$drv" | grep rust_qr-sheet-0.1.1-test.drv
/nix/store/f64x19j6law93vif5m4kdpy33f1fk2qw-rust_qr-sheet-0.1.1-test.drv
```

With all three repairs in, the per-crate counts match `cargo test --workspace --all-features`
exactly: 36 and 9, then 5, 8, 10, then 8 and 5 and 9, then 31 and 5. I planted a failing assertion
to see the status survive the `tee` the runner pipes through:

```console
> thread 'pipeline::planted_failure' (47) panicked at src/pipeline.rs:429:5:
> assertion `left == right` failed: planted
error: Cannot build '/nix/store/c8xdqrgr5x96vafgaza1g2hrwh9bdsc6-run-tests-rust_qr-photos-0.1.1.drv'.
```
