+++
date = '2026-11-08T22:30:23+01:00'
draft = false
title = 'Embedding Scheme in Rust: scheme-rs vs. steel'
tags = ['rust', 'scheme']
+++

[Steel][steel] and [scheme-rs][scheme-rs] are both Rust crates that put a Scheme interpreter inside
your process. Steel is the older one: first commit February 2020, 1,213 commits, version 0.8.3,
2,654 GitHub stars, and about 78% of its commits from Matt Paras. scheme-rs started in August 2023,
has 263 commits, version 0.2.0, 342 stars, and about 66% from Matt Plant with another 26% from
Linus Shoravi.

Steel implements [R5RS][r5]; scheme-rs implements [R6RS][r6].

[steel]: https://github.com/mattwparas/steel
[scheme-rs]: https://github.com/maplant/scheme-rs
[r5]: https://standards.scheme.org/official/r5rs.pdf
[r6]: https://www.r6rs.org/final/r6rs.pdf

## tl;dr

- Steel is R5RS with Racket-like modules, contracts, runtime dylibs, a package manager and an LSP.
  It has 569 Rust tests and about 421 Scheme assertions.
- scheme-rs is R6RS with a full numeric tower, R6RS conditions, records and ports, delimited
  continuations, a concurrent cycle-collecting GC and `Send`/`Sync` async embedding. It has 60 Rust
  tests, 39 of which belong to the GC.
- Steel is the more adopted project. But I couldn't find its R5RS and R7RS suites in CI.
- Neither is 1.0, both are bus-factor-1, and both have real correctness bugs open.
- Steel is MIT/Apache-2.0, builds on Linux, macOS and Windows, and its core targets wasm. scheme-rs
  is MPL-2.0 and tests on Linux.
- Pick Steel for a batteries-included scripting layer; pick scheme-rs for a standards-shaped runtime
  with async and threads.

## Two projects, six years apart

| Signal | Steel | scheme-rs |
|---|---|---|
| First commit | 2020-02-20 | 2023-08-12 |
| Release | 0.8.3, August 2026 | 0.2.0, May 2026 |
| Commits | 1,213 | 263 |
| Top author | ~78%, Matt Paras | ~66%, Matt Plant |
| Stars / forks | 2,654 / 147 | 342 / 25 |
| Open / closed issues | 72 / 85 | 23 / 109 |
| crate downloads, last 90 days | 24.5k | 156 |
| Rust lines | 124.8k | 37.2k |

Steel has the history and the audience. It also nearly died: one commit in 2022, then 298 in 2025
and 148 so far in 2026. scheme-rs is accelerating, with 126 commits in 2026 against 85 in all of
2025, and 47 commits in the last 90 days against Steel's 25.

The version numbers are not the maturity signal. Steel has published nine crate versions since
2023 and still warns that its API may change before 1.0. scheme-rs has published three and has a
changelog. Both are one maintainer away from a bad quarter. scheme-rs at least has a second
substantial contributor in the GC work; Steel's next contributor after Matt is at 6% of commits.

## One standard is much bigger

R5RS is a small report. R6RS adds a library system, conditions, records, enumerations, hashtables,
Unicode, bytevectors, a much richer port layer and `syntax-case`. scheme-rs covers that larger
target in 37k Rust lines; Steel spends 125k on R5RS plus its extensions.

| Feature | Steel | scheme-rs |
|---|---|---|
| Library system | `require`/`provide`, cogs, dylibs | R6RS `library`/`import`, allowlists |
| Macros | `syntax-rules`, `syntax-case`, quickscope | `syntax-rules`, `syntax-case`, custom `...` |
| Continuations | `call/cc`, continuation marks, shift/reset | CPS `call/cc`, prompts, marks |
| Exceptions | engine handlers | R6RS conditions, `raise`, `guard` |
| Numeric tower | fixnum, bigint, rational, float, complex | bignum, rational, float, complex |
| Records | `struct`, SRFI-9 | R6RS syntactic, procedural, inspection |
| Ports | custom ports | R6RS transcoders, buffer modes, port conditions |

Steel's README claims R5RS except `let-syntax`. The repository backs that up with a
[chibi][chibi]-derived suite of 288 R5RS assertions and 69 R7RS assertions, plus 89 success and 10
failure programs. The weak spot is that I found no CI step that runs the two conformance suites.
`cargo test` runs the Rust tests and the script fixtures; the cogs test runner is manual.

scheme-rs has 121 assertions taken from the R6RS specification examples and 31 R7RS assertions, and
`cargo test` runs them. Its 0.2.0 changelog cites progress against an external 2,445-case R6RS suite
("26 of 2445"), but that harness is not in the repository, so I cannot verify it from the checkout.
The `(rnrs)` aggregate is also incomplete: no `(rnrs unicode)`, `(rnrs arithmetic bitwise)`,
`(rnrs sorting)`, `(rnrs programs)` or `(rnrs r5rs)`.

[chibi]: https://github.com/ashinn/chibi-scheme

## Two ways to run Scheme

Steel interprets bytecode and JIT-compiles through [Cranelift][cranelift] when the JIT is enabled.
It can be turned off with `STEEL_JIT=false`, which is useful when something in code generation
misbehaves. Memory is a mix of thread-aware biased reference counting and a mark/sweep collector
for mutable boxes, with four reference-counting backends.

scheme-rs compiles everything through a CPS intermediate representation to Cranelift SSA. There is
no interpreter and no bytecode. Its GC is an Immix heap with a concurrent cycle collector, stress
tests and [loom][loom] models for the concurrency. This is the part of scheme-rs that looks most
like research and least like a side project.

I did not build or run either, so I cannot rank their speed. Neither publishes a comparable
benchmark table. Steel's benchmarks page is empty; scheme-rs runs criterion benches in CI. That is
a reproducibility difference, not a performance result.

[cranelift]: https://cranelift.dev
[loom]: https://github.com/tokio-rs/loom

## Embedding is where they diverge

Steel gives you an `Engine`. You create one, run strings, register Rust functions, and optionally
load a compiled `cdylib` at runtime. That runtime dylib loading is why Steel can ship SQLite, regex,
TOML, Markdown, rustls and WebSocket support as installable packages. The cost is that `Engine` is
documented as neither `Send` nor `Sync`, so a multi-threaded host needs care.

scheme-rs gives you a global `Runtime` and a `TopLevelEnvironment`. Values are garbage collected,
and `Gc<T>` is `Send` and `Sync` when `T` is. With the `async` and `tokio` features you can define
async Scheme functions and await them; the runtime is built for sync and async Rust rather than one
thread with a plugin story. Native extensions must be compiled into the host with `#[bridge]` or
the derive macros, because scheme-rs has no dynamic native loading.

Both have some sandboxing. Steel has `Engine::new_sandboxed()`; scheme-rs has import allowlists and
an `eval` flag that denies imports.

## Libraries and tooling

Steel ships 54 Scheme files, about 4.8k lines, covering CLOS, collections, colors, command-line
arguments, contracts, cooperative threads, filesystem, logging, pattern matching, reflection,
sorting, SRFI-9 and SRFI-28, structs, threads, time and transducers. On top of that sit ten native
extension crates and a package manager that installs git or local packages into `$STEEL_HOME`.

scheme-rs ships 27 `.sls` files, about 3.2k lines, shaped like the R6RS libraries: base, lists,
vectors, strings, numbers, hashtables, bytevectors, enums, conditions, exceptions, files, ports,
records, `syntax-rules`, `syntax-case`, `letrec` and `values`. Extras include a pattern matcher,
generators, prompts, threads, async, SRFI-2 and SRFI-197. There is no package manager; libraries are
embedded into the binary or loaded from disk.

Tooling favors Steel clearly. Its LSP does hover, completion, document symbols, goto definition,
rename and macro-aware diagnostics; scheme-rs calls its LSP an MVP with parse diagnostics. Steel
also has a profiler and a wasm playground.

## What the tests actually cover

Steel has 569 Rust test functions, 89 success and 10 failure Scheme programs, and roughly 421
`check-equal?` assertions. Its CI runs coverage through tarpaulin, tests on Linux, macOS and
Windows, builds `steel-core` for wasm, and tests with and without the JIT. It does not gate on
clippy.

scheme-rs has 60 Rust test functions, 39 of them in the GC crate, 14 Scheme-driven suites and about
225 assertions. Its CI runs clippy with `-D warnings` across a feature powerset, runs the benches,
and tests only on Linux. The GC has stress and loom tests that Steel has no equivalent for.

The interesting asymmetry is not the raw count. It is that scheme-rs gates its R6RS and R7RS suites
and Steel does not gate its R5RS and R7RS suites. Steel's suite is larger and more standard-derived;
scheme-rs's suite is smaller and actually run.

## License, docs and reach

Steel is dual MIT/Apache-2.0. scheme-rs is [MPL-2.0][mpl], which is file-level copyleft: fine to
link, but changes to MPL-covered files have to be published. If you are embedding in a proprietary
product and do not want to think about that, Steel is the simpler answer.

Steel's [book][book] is about 13,500 lines of Markdown with generated documentation for dozens of
modules, plus a playground. scheme-rs has about 1,100 lines of [docs site][docs], a 360-line
language reference and good rustdoc examples. Steel wins on volume; scheme-rs's reference is enough
to get started.

Steel uses edition 2021 and builds on Linux, macOS and Windows; its core builds for wasm.
scheme-rs uses edition 2024, so it needs a newer toolchain, and its CI only covers Linux. Steel's
`steel-core` has 57 direct dependencies and a 682-package lockfile; scheme-rs has 32 direct
dependencies and no committed lockfile.

[book]: https://mattwparas.github.io/steel/book
[docs]: https://scheme.rs
[mpl]: https://www.mozilla.org/en-US/MPL/2.0/

## What I would pick

| Requirement | Pick |
|---|---|
| A scripting layer with libraries, editor support and a permissive license | Steel |
| R6RS, a full numeric tower, R6RS records/conditions/ports | scheme-rs |
| Full and delimited continuations | scheme-rs |
| `Send`/`Sync`, async and tokio | scheme-rs |
| Windows, macOS, wasm, or runtime native plugins | Steel |
| Strict CI and a smaller dependency tree | scheme-rs |
| API stability | neither; pin and vendor |

For my own use, the deciding question is whether the Scheme code is the product or the glue. If it
is glue inside a larger Rust application and I want SQLite and regex on day one, I take Steel. If
the language semantics are the point and I need threads or async, I take scheme-rs.

The first thing I would do before depending on Steel is wire its 288 R5RS assertions into CI. The
first thing I would do before depending on scheme-rs is run its missing R6RS libraries against real
code. Neither project has done the other's work.
