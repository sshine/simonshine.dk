+++
date = '2026-10-21T11:22:14+02:00'
draft = false
title = 'Per-crate clippy through crate2nix'
tags = ['nix', 'rust']
+++

I don't allow `.unwrap()` or `.expect()` in tests:

```toml
# Cargo.toml
[workspace.lints.clippy]
expect_used = "deny"
unwrap_used = "deny"
```

It is common to disallow `.unwrap()` in normal code, but I like to take it one step further.

I used to allow `.expect()` instead of `.unwrap()`, but with LLMs, the extra effort of disallowing
both costs nothing.

The usual argument for allowing either is that tests may cut corners, since only programmers run
them. But a test that panics will report a crash at the line that unwrapped, when it should report a
failed assertion.

So I need the linter to look at test code, which means `--all-targets`:

```bash
cargo clippy --workspace --all-targets --all-features -- -D warnings
```

This works.

Switching from nixpkgs' `buildRustPackage` to crate2nix has saved a lot of time and compilation
effort by making a derivation for compiling each dependency, which can be shared between builds.

Without this Nix build complexity, you just have a `target/` directory in your workspace root,
typically gitignored, and rebuilding for different purposes can reuse those artifacts. You might
still have redundant build artifacts because tests compile with debug flags.

Switching to cache2nix caused some problems where clippy lints would silently stop reporting for tests.

This post details how I got my Cargo workspace lints back while retaining crate2nix's cache benefits.

[crate2nix]: https://github.com/nix-community/crate2nix

## tl;dr

- nixpkgs' `buildRustCrate` gained a configurable `capLints` in March 2026 ([a523dd74ac01][cap])
  and `useClippy` in May 2026 ([#521993][clip]). Together they run `clippy-driver` in place of
  `rustc` on individual crates.
- `capLints` defaults to `"allow"`, which caps every lint including clippy's. Turn on `useClippy`,
  leave the default, and you get a check that runs, reports nothing and passes.
- crate2nix doesn't emit `rust-version`, so clippy doesn't know which MSRV to attach to.
- crate2nix doesn't emit `lints` either, and `[lints] workspace = true` is cargo's to resolve, so the
  workspace lint table never reaches the compiler. `buildRustCrate` takes one; pass it.
- `crateWithTest` separates compiling tests from running them, so the lint check and the integration
  check share one compile. The workspace compiles once per `nix flake check`.

[cap]: https://github.com/NixOS/nixpkgs/commit/a523dd74ac01
[clip]: https://github.com/NixOS/nixpkgs/pull/521993

## Why crate2nix and not crane

Both read `Cargo.lock`. The difference is whether `cargo` also drives the build.

[crane] uses `cargo`: `buildDepsOnly` runs `cargo` to populate `target/`, exports that directory,
and later derivations run `cargo` again against it. [crate2nix][c2n] exports a graph at evaluation
time and emits one derivation per crate, each calling `rustc` directly, rather than `cargo`.

[crane]: https://github.com/ipetkov/crane
[c2n]: https://github.com/nix-community/crate2nix

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
    inherit lints;
    extraRustcOpts = (crate.extraRustcOpts or [ ]) ++ [ "-D" "warnings" ];
  }
)
```

`members` comes from `builtins.readDir ../crates`, `msrv` and `lints` from the workspace manifest.
Dependencies fall through untouched and keep the store paths the ordinary build produced.

For my workspace's six member crates:

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

So caching the compilation of my shared dependencies works.

## Notes

`capLints` defaults to `"allow"`. Setting it to `"forbid"` still allows `#[allow]` and `#[expect]`.
Setting `-D warnings` makes clippy-driver fail on warnings.

Clippy adjusts warnings based on the 

No `rust-version` reaches the compiler. crate2nix does not emit it, `CARGO_PKG_RUST_VERSION`
arrives empty, and clippy stops suppressing suggestions that postdate the declared minimum. With
`rust-version = "1.85"` in the manifest and none in the derivation, this fired under Nix and never
under cargo:

```console
error: using `chunks_exact` with a constant chunk size
  --> src/blob.rs:34:63
   = note: `-D clippy::chunks-exact-to-as-chunks` implied by `-D warnings`
```

Nothing carries the `[lints]` table down. Each member says `[lints] workspace = true`, which cargo
resolves against the workspace manifest; crate2nix never reads it and emits no lints of its own, so
neither spelling reaches the compiler. `-D warnings` promotes what clippy warns about by default,
and `unwrap_used` is a restriction lint, silent unless asked for. I planted an `.unwrap()` in a
workspace crate: the check compiled it, printed nothing and passed.

`buildRustCrate` takes a `lints` parameter shaped like the manifest table, so the repair is to read
the table once:

```nix
# nix/_cargo-nix.nix
lints = manifest.workspace.lints or { };
```

and add `inherit lints;` beside `useClippy` and `capLints` above. A non-empty table raises the
default `capLints` to `"forbid"` by itself, so the two repairs agree about what they want. The same
planted `.unwrap()`, with the table passed:

```console
… -D warnings -D clippy::expect_used -D clippy::unwrap_used -D unused_must_use --edition 2024
error: used `unwrap()` on an `Option` value
  --> src/lib.rs:19:5
   = note: requested on the command line with `-D clippy::unwrap-used`
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

With the repairs in, the per-crate counts match `cargo test --workspace --all-features`
exactly: 36 and 9, then 5, 8, 10, then 8 and 5 and 9, then 31 and 5. I planted a failing assertion
to see the status survive the `tee` the runner pipes through:

```console
> thread 'pipeline::planted_failure' (47) panicked at src/pipeline.rs:429:5:
> assertion `left == right` failed: planted
error: Cannot build '/nix/store/c8xdqrgr5x96vafgaza1g2hrwh9bdsc6-run-tests-rust_qr-photos-0.1.1.drv'.
```
