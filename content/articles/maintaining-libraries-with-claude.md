+++
date = '2026-01-14T23:38:11+01:00'
draft = false
title = 'Maintaining libraries with Claude'
tags = ['haskell', 'claude']
+++

## tl;dr

- Claude bumps the versions.
- Claude finds missing opcodes.
- Claude finds even more missing opcodes I didn't know about.
- Claude correctly handles compiler warnings that indicate cascading changes.
- Claude correctly handles what files are auto-generated and how to regenerate them.
- Stretch Goal #1: Release via CI to Hackage and GitHub
- Stretch Goal #2: Validate hpack pre-push

## The goal

I maintain an open source library uploaded to a package repository called
[evm-opcodes][evm-opcodes]. It just exposes an enum with the [assembly instructions (opcodes) for
Ethereum's VM][evm-codes], in case you want to build a smart contract compiler in Haskell.

[terranix]: https://terranix.org
[evm-opcodes]: https://hackage.haskell.org/package/evm-opcodes
[evm-codes]: https://www.evm.codes/
[containers]: https://hackage.haskell.org/package/containers
[pvp]: https://pvp.haskell.org/
[stackage]: https://www.stackage.org/

Every few years one of evm-opcodes' few dependencies, [containers][containers], releases a new
"major" version, and the tight dependency version bounds would cause evm-opcodes to fall out of the
[Stackage stable Haskell package set][stackage] for not supporting the latest version. I got tagged
in GitHub issues [here](https://github.com/commercialhaskell/stackage/issues/7916) and
[here](https://github.com/commercialhaskell/stackage/issues/7549) because my GitHub username can be
derived from the package's git source location.

Some Commercial Haskell users rely on packages that are proven to work together, and keeping tight
version bounds encourages individual package maintainers to assure that the newer version still
works with their package.

Bumping versions is a tedious chore, surely Claude Code can do this for me.

I use the opportunity to check if there's been any additions to the EVM opcode set. Since I don't
actively use the package right now, I haven't been doing this regularly. Ethereum has had some major
changes, most notably the switch to proof-of-stake in 2022. I usually read the [Ethereum Yellow
Paper][yellowpaper] and jump to the opcode section and scan through to see if there were any new
instructions. This is a manual and quite error prone approach. I'll just cut out the section of the
PDF and ask Claude to do that, too!

[yellowpaper]: https://github.com/ethereum/yellowpaper

## Uncovering more 

> ❯ Read eth-opcodes-2026-01-14.pdf and verify if this Haskell library is up-to-date wrt. the available opcodes and their arguments in src/EVM/Opcode/Internal.hs
> 
> ```
> ⏺ I'll read both the PDF and the Haskell source file to compare them.
> 
> ⏺ Read(eth-opcodes-2026-01-14.pdf)
>   ⎿  Read PDF (402KB)
> 
> ⏺ Read(src/EVM/Opcode/Internal.hs)
>   ⎿  Read 516 lines
> 
> ⏺ Based on my comparison of the PDF and the Haskell library, here's my analysis:
> 
>   Comparison Results
> 
>   Missing Opcode (in PDF but not in library)
> 
>   PUSH0 (0x5f) - The PDF shows on page 6:
>   - 0x5f PUSH0 with α=0, δ=1 - "Place 0 on the stack"
> 
>   The library only handles PUSH1-PUSH32 (0x60-0x7f):
>   | PUSH !Word256     -- ^ 0x60 - 0x7f (PUSH1 - PUSH32)
> 
>   PUSH0 was introduced in EIP-3855 (Shanghai upgrade, April 2023) and is missing from the library.
> ```

This is exactly the type of update I was looking for.

And I clearly missed it when I did this in October 2024.

> ```
>   All Other Opcodes Match
> 
>   All other opcodes in the PDF are present in the library with correct:
>   - Hex encodings (0x00-0xff ranges)
>   - Stack effects (α = items removed, δ = items added)
>   - Mnemonics
> 
>   [...]
>
>   Note on Cancun Opcodes
> 
>   Neither the PDF nor the library include the newer Cancun upgrade opcodes (March 2024):
>   - BLOBHASH (0x49)
>   - BLOBBASEFEE (0x4a)
>   - TLOAD (0x5c)
>   - TSTORE (0x5d)
>   - MCOPY (0x5e)
> 
> ✻ Brewed for 49s
> ```

Huh! There's a whole set of opcodes the Yellow Paper doesn't mention.

I'm clearly out of touch. I know about [EIPs (Ethereum Improvement Proposals)][eips].

But I didn't know that the Yellow Paper is a piece of history and it's not an exhaustive list of
opcodes.

[eips]: https://eips.ethereum.org/

> ❯ Where are the Cancun upgrades documented if not the yellowpaper?
> 
> ```
> ⏺ The Cancun upgrade opcodes are documented in their respective EIPs (Ethereum Improvement Proposals):
>   ┌─────────────┬──────┬──────────┐
>   │   Opcode    │ Hex  │   EIP    │
>   ├─────────────┼──────┼──────────┤
>   │ BLOBHASH    │ 0x49 │ EIP-4844 │
>   ├─────────────┼──────┼──────────┤
>   │ BLOBBASEFEE │ 0x4a │ EIP-7516 │
>   ├─────────────┼──────┼──────────┤
>   │ TLOAD       │ 0x5c │ EIP-1153 │
>   ├─────────────┼──────┼──────────┤
>   │ TSTORE      │ 0x5d │ EIP-1153 │
>   ├─────────────┼──────┼──────────┤
>   │ MCOPY       │ 0x5e │ EIP-5656 │
>   └─────────────┴──────┴──────────┘
>   You can find these at:
>   - https://eips.ethereum.org/EIPS/eip-4844 (Shard Blob Transactions)
>   - https://eips.ethereum.org/EIPS/eip-7516 (BLOBBASEFEE opcode)
>   - https://eips.ethereum.org/EIPS/eip-1153 (Transient storage opcodes)
>   - https://eips.ethereum.org/EIPS/eip-5656 (MCOPY instruction)
> ```
> 
> **The Yellow Paper tends to lag behind hard forks.** For the most current opcode reference, the https://github.com/ethereum/execution-specs repository is the canonical source - it's effectively the "executable Yellow Paper" maintained in Python. The opcode definitions live in files like ethereum/cancun/vm/instructions/.
> 
> Another good reference is https://www.evm.codes/ which provides an interactive opcode reference that's typically up-to-date with the latest forks.

OK, TIL.

> ❯ Add all of these to the Haskell library; reference the right EIPs in comments in a similar fashion as was done for prior additions.
> 
> ```
> ⏺ I'll add all the missing opcodes to the library. Let me make the necessary edits to src/EVM/Opcode/Internal.hs.
> 
> ⏺ Update(src/EVM/Opcode/Internal.hs)
>   ⎿  Added 2 lines
>       92    | CHAINID           -- ^ 0x46, https://eips.ethereum.org/EIPS/eip-1344
>       93    | SELFBALANCE       -- ^ 0x47, https://eips.ethereum.org/EIPS/eip-1884
>       94    | BASEFEE           -- ^ 0x48, https://eips.ethereum.org/EIPS/eip-3198
>       95 +  | BLOBHASH          -- ^ 0x49, https://eips.ethereum.org/EIPS/eip-4844
>       96 +  | BLOBBASEFEE       -- ^ 0x4a, https://eips.ethereum.org/EIPS/eip-7516
>       97
>       98    -- 50s: Stack, Memory, Storage and Flow Operations
>       99    | POP               -- ^ 0x50
> 
> ⏺ Update(src/EVM/Opcode/Internal.hs)
>   ⎿  Added 4 lines, removed 1 line
>       108    | MSIZE             -- ^ 0x59
>       109    | GAS               -- ^ 0x5a
>       110    | JUMPDEST j        -- ^ 0x5b
>       111 +  | TLOAD             -- ^ 0x5c, https://eips.ethereum.org/EIPS/eip-1153
>       112 +  | TSTORE            -- ^ 0x5d, https://eips.ethereum.org/EIPS/eip-1153
>       113 +  | MCOPY             -- ^ 0x5e, https://eips.ethereum.org/EIPS/eip-5656
>       114
>       112 -  -- 60s & 70s: Push Operations
>       115 +  -- 5f, 60s & 70s: Push Operations
>       116    | PUSH !Word256     -- ^ 0x60 - 0x7f (PUSH1 - PUSH32)
>       117
>       118    -- 80s: Duplication Operations (DUP)
> 
> ⏺ Update(src/EVM/Opcode/Internal.hs)
>   ⎿  Added 1 line
>       113    | MCOPY             -- ^ 0x5e, https://eips.ethereum.org/EIPS/eip-5656
>       114
>       115    -- 5f, 60s & 70s: Push Operations
>       116 +  | PUSH0             -- ^ 0x5f, https://eips.ethereum.org/EIPS/eip-3855
>       117    | PUSH !Word256     -- ^ 0x60 - 0x7f (PUSH1 - PUSH32)
>       118
>       119    -- 80s: Duplication Operations (DUP)
> 
> ⏺ Update(src/EVM/Opcode/Internal.hs)
>   ⎿  Added 2 lines
>       282    CHAINID        -> OpcodeSpec 0x46 0 1 "chainid"
>       283    SELFBALANCE    -> OpcodeSpec 0x47 0 1 "selfbalance"
>       284    BASEFEE        -> OpcodeSpec 0x48 0 1 "basefee"
>       285 +  BLOBHASH       -> OpcodeSpec 0x49 1 1 "blobhash"
>       286 +  BLOBBASEFEE    -> OpcodeSpec 0x4a 0 1 "blobbasefee"
>       287
>       288    -- 50s: Stack, Memory, Storage and Flow Operations
>       289    --                    Hex  α δ
> 
> ⏺ Read(src/EVM/Opcode/Internal.hs)
>   ⎿  Read 30 lines
> 
> ⏺ Update(src/EVM/Opcode/Internal.hs)
>   ⎿  Added 5 lines, removed 1 line
>       299    MSIZE          -> OpcodeSpec 0x59 0 1 "msize"
>       300    GAS            -> OpcodeSpec 0x5a 0 1 "gas"
>       301    JUMPDEST{}     -> OpcodeSpec 0x5b 0 0 "jumpdest"
>       302 +  TLOAD          -> OpcodeSpec 0x5c 1 1 "tload"
>       303 +  TSTORE         -> OpcodeSpec 0x5d 2 0 "tstore"
>       304 +  MCOPY          -> OpcodeSpec 0x5e 3 0 "mcopy"
>       305
>       303 -  -- 60s & 70s: Push Operations
>       306 +  -- 5f, 60s & 70s: Push Operations
>       307 +  PUSH0          -> OpcodeSpec 0x5f 0 1 "push0"
>       308    PUSH n ->
>       309      let (pushHex, pushConst) = push' n
>       310      in OpcodeSpec { opcodeEncoding = pushHex
> ```

The Claude Code harness makes sure to test that the code compiles.

The [default.nix](https://github.com/sshine/evm-opcodes/blob/main/default.nix) I made October 2024
makes sure that my compiler toolchain works out of the box.

I've not worked on a single Haskell project on this laptop; all I need is the [Nix package
manager][nix], and [direnv][direnv].

[nix]: https://nixos.org/
[direnv]: https://direnv.net/

When adding another variant to an enum in Haskell, cascading changes in cases where that enum is
pattern matched shows warnings when compiling. Claude Code picks up on those cases and fills in the
gaps like I would have.

This is a super power of strongly typed, functional languages like Haskell. Rust can do it, too.

> ```
> ⏺ Bash(cabal build 2>&1)
>   ⎿  Resolving dependencies...
>      Build profile: -w ghc-9.10.3 -O1
>      In order, the following will be built (use -v for more details):
>      … +35 lines (ctrl+o to expand)
> 
> ⏺ The library builds, but there's a warning about incomplete pattern matches in EVM.Opcode.Traversal. Let me fix that.
> 
> ⏺ Read(src/EVM/Opcode/Traversal.hs)
>   ⎿  Read 143 lines
> 
> ⏺ I need to add the new opcodes to the pattern matching. Let me make the edits.
> 
> ⏺ Update(src/EVM/Opcode/Traversal.hs)
>   ⎿  Added 2 lines
>        98    CHAINID     -> mapOnOther' CHAINID CHAINID
>        99    SELFBALANCE -> mapOnOther' SELFBALANCE SELFBALANCE
>       100    BASEFEE     -> mapOnOther' BASEFEE BASEFEE
>       101 +  BLOBHASH    -> mapOnOther' BLOBHASH BLOBHASH
>       102 +  BLOBBASEFEE -> mapOnOther' BLOBBASEFEE BLOBBASEFEE
>       103
>       104    -- 50s: Stack, Memory, Storage and Flow Operations
>       105    POP       -> mapOnOther' POP POP
> 
> ⏺ Update(src/EVM/Opcode/Traversal.hs)
>   ⎿  Added 5 lines, removed 1 line
>       111    PC        -> mapOnOther' PC PC
>       112    MSIZE     -> mapOnOther' MSIZE MSIZE
>       113    GAS       -> mapOnOther' GAS GAS
>       114 +  TLOAD     -> mapOnOther' TLOAD TLOAD
>       115 +  TSTORE    -> mapOnOther' TSTORE TSTORE
>       116 +  MCOPY     -> mapOnOther' MCOPY MCOPY
>       117
>       115 -  -- 60s & 70s: Push Operations
>       118 +  -- 5f, 60s & 70s: Push Operations
>       119 +  PUSH0     -> mapOnOther' PUSH0 PUSH0
>       120    PUSH n    -> mapOnOther' (PUSH n) (PUSH n)
>       121
>       122    -- 80s: Duplication Operations (DUP)
> 
> ⏺ Now let me rebuild to verify everything compiles cleanly.
> 
> ⏺ Bash(cabal build 2>&1)
>   ⎿  Build profile: -w ghc-9.10.3 -O1
>      In order, the following will be built (use -v for more details):
>       - evm-opcodes-0.2.0 (lib) (file src/EVM/Opcode/Traversal.hs changed)
>      … +11 lines (ctrl+o to expand)
> 
> ⏺ The build succeeds with no new warnings (just a pre-existing unused import warning). Let me also run the tests to verify everything works.
> 
> ⏺ Bash(cabal test 2>&1)
>   ⎿  Build profile: -w ghc-9.10.3 -O1
>      In order, the following will be built (use -v for more details):
>       - evm-opcodes-0.2.0 (test:test) (first run)
>      … +160 lines (ctrl+o to expand)
> 
> ⏺ All 132 tests pass. Let me update the todo list and summarize the changes.
> 
> ⏺ Done. I've added all 6 missing opcodes to the library:
> 
>   Summary of Changes
> 
>   src/EVM/Opcode/Internal.hs
> 
>   New opcodes added to Opcode' data type:
>   ┌─────────────┬──────┬─────┬─────┬──────────┐
>   │   Opcode    │ Hex  │  α  │  δ  │   EIP    │
>   ├─────────────┼──────┼─────┼─────┼──────────┤
>   │ BLOBHASH    │ 0x49 │ 1   │ 1   │ EIP-4844 │
>   ├─────────────┼──────┼─────┼─────┼──────────┤
>   │ BLOBBASEFEE │ 0x4a │ 0   │ 1   │ EIP-7516 │
>   ├─────────────┼──────┼─────┼─────┼──────────┤
>   │ TLOAD       │ 0x5c │ 1   │ 1   │ EIP-1153 │
>   ├─────────────┼──────┼─────┼─────┼──────────┤
>   │ TSTORE      │ 0x5d │ 2   │ 0   │ EIP-1153 │
>   ├─────────────┼──────┼─────┼─────┼──────────┤
>   │ MCOPY       │ 0x5e │ 3   │ 0   │ EIP-5656 │
>   ├─────────────┼──────┼─────┼─────┼──────────┤
>   │ PUSH0       │ 0x5f │ 0   │ 1   │ EIP-3855 │
>   └─────────────┴──────┴─────┴─────┴──────────┘
>   Each opcode includes an EIP reference in the comments, following the existing style.
> 
>   src/EVM/Opcode/Traversal.hs
> 
>   Added pattern match cases for all new opcodes in mapOpcodeM to fix the incomplete pattern warning.
> 
>   Verification
> 
>   - Library builds cleanly (only pre-existing unused import warning)
>   - All 132 tests pass
> 
> ✻ Brewed for 2m 21s
> ```

## The chore

As for the version bumping, I thought I'd increase the copyright bounds, too.

Claude correctly guesses that it needs to change versions in Markdown and YAML files, but the
`.cabal` project file is generated using `hpack`; an experienced Haskell developer might derive this
from the presence of package.yaml, 

> ❯ Grep for "Copyright" and update the bound to 2026 everywhere. Increase the dependency bound for containers to include 0.8 (so < 0.9). Bump the package version to 0.3.0.
> 
> ```
> ⏺ Search(pattern: "Copyright", output_mode: "content")
>   ⎿  Found 7 lines (ctrl+o to expand)
> 
> ⏺ Search(pattern: "containers|^version:", path: "~/Projects/evm-opcodes", glob: "*.cabal", output_mode: "content")
>   ⎿  Found 4 lines (ctrl+o to expand)
>
> [...]
> 
> ⏺ Now let me regenerate the .cabal file using hpack.
> 
> ⏺ Bash(hpack)
>   ⎿  generated evm-opcodes.cabal
> 
> ⏺ Let me verify by building and running tests.
> 
> ⏺ Bash(cabal build && cabal test 2>&1 | tail -20)
>   ⎿  Resolving dependencies...
>      Build profile: -w ghc-9.10.3 -O1
>      In order, the following will be built (use -v for more details):
>      … +41 lines (ctrl+o to expand)
> 
> ⏺ Done. All changes applied successfully:
> 
>   Summary
> 
>   Version bump: 0.2.0 → 0.3.0
> 
>   Copyright updated to 2018-2026 in:
>   - src/EVM/Opcode/Internal.hs
>   - src/EVM/Opcode.hs
>   - src/EVM/Opcode/Positional.hs
>   - src/EVM/Opcode/Labelled.hs
>   - src/EVM/Opcode/Traversal.hs
>   - LICENSE
>   - LICENSE.md
>   - package.yaml (and regenerated evm-opcodes.cabal)
> 
>   Dependency update: containers >= 0.6 && < 0.8 → containers >= 0.6 && < 0.9
> 
>   Build succeeds as evm-opcodes-0.3.0 and all 132 tests pass.
> 
> ✻ Cooked for 1m 25s
> ```

## Stretch Goal #1: Release via CI to Hackage and GitHub

As a stretch goal, because I release this package so rarely, I always forget the commands.

Let's just make that part of CI.

Now all I need to do is `git tag vX.Y.Z; git push --tags`.

Then CI packages and uploads to Hackage and GitHub releases!

```yaml
name: Haskell CI

on:
  push:
    branches:
      - main
    tags:
      - 'v*'
  pull_request:
    branches:
      - main

jobs:
  # ...

  release:
    name: Release to Hackage
    runs-on: ubuntu-latest
    needs: build
    if: startsWith(github.ref, 'refs/tags/v')

    steps:
      - name: Checkout
        uses: actions/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8 # v6.0.1, 2025-12-02

      - name: Setup Haskell
        uses: haskell-actions/setup@dc63c94789664bb2910876ec3dfeeaa24d23b96b # v2.10.2, 2026-01-11
        with:
          ghc-version: "9.10"
          cabal-version: "3.16"

      - name: Update Cabal
        run: cabal update

      - name: Generate sdist
        run: cabal sdist

      - name: Upload to Hackage
        run: cabal upload --publish --token "${{ secrets.HACKAGE_TOKEN }}" dist-newstyle/sdist/evm-opcodes-*.tar.gz

      - name: Create GitHub Release
        uses: softprops/action-gh-release@a06a81a03ee405af7f2048a818ed3f03bbf83c7b # v2.5.0, 2025-12-01
        with:
          files: evm-opcodes-*.tar.gz
          generate_release_notes: true
```



## Stretch Goal #2: Validate hpack pre-push

As an example of forgetting the commands, I bumped the version in package.yaml, but unlike Claude, I
forgot to run `hpack` to propagate the changes to the .cabal file.

I will forget this again.

So I'll make a git hook that checks if `hpack` was run and fails if it produces any changes that
weren't committed.

This git hook can be added both as a CI step and as a pre-push hook using [pre-commit][pre-commit],
a tool for installing git hooks. I'll wire this into default.nix so that entering the directory with
[direnv][direnv], the hook is automatically installed.

[pre-commit]: https://pre-commit.com/
[direnv]: https://direnv.net/

The hook itself looks like:

```bash
#!/usr/bin/env bash
set -euo pipefail

hpack

if ! git diff --exit-code evm-opcodes.cabal; then
  echo "Error: evm-opcodes.cabal is out of sync with package.yaml"
  echo "Run 'hpack' and commit the changes."
  exit 1
fi

echo "evm-opcodes.cabal is in sync with package.yaml"
```

Its integration with CI is a simple step:

```yaml
- name: Check cabal file is in sync
  if: matrix.ghc == '9.12'
  run: |
    cabal install hpack
    .github/hooks/check-cabal-sync.sh
```

The `if: matrix.ghc == '9.12'` is to prevent this step from executing twice.

It only needs to be released once, even if the test matrix is bigger than that.

As for the direnv integration, the file .envrc contains the line `use nix`.

And the file default.nix looks like this:

```nix
let
  # Use nixpkgs available on the system
  pkgs = import <nixpkgs> {};
  haskellDependencies = with pkgs.haskellPackages; [
    stack
    cabal-install
    haskell-language-server
    hlint
    ghcid
    hpack
  ];

  # Build a Haskell package with those dependencies
  addBuildTools = pkgs.haskell.lib.addBuildTools;
  package = pkgs.haskellPackages.developPackage {
    root = ./.;
    modifier = drv: addBuildTools drv haskellDependencies;
  };

  # Extend the build environment with pre-commit installed and activated
  withPreCommitHook = old: {
    nativeBuildInputs = (old.nativeBuildInputs or []) ++ [ pkgs.pre-commit ];
    shellHook = (old.shellHook or "") + ''
      if [ -d .git ]; then
        pre-commit install --hook-type pre-push
      fi
    '';
  };
in
  package.overrideAttrs withPreCommitHook
```
