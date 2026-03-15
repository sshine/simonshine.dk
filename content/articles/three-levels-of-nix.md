+++
date = '2026-03-15T12:34:52+01:00'
draft = false
title = 'Three levels of Nix'
tags = ['nix']
+++

When using Nix to orchestrate a new project, I find myself choosing between these three levels:

1. **Just a `shell.nix`:** This is good for starting on, it's easy to sell to colleagues or project
   owners you're not close with or already bought on the idea of Nix. It leaves a very small
   footprint in terms of lines of code: Every lines in this file is worth its own weight, since it
   usually just mentions packages to install. That also makes it very tangible. It could look like:

   ```nix
   {pkgs ? import <nixpkgs> {}}:
   pkgs.mkShell {
     packages = [
       pkgs.go
       pkgs.gopls
       pkgs.gotools
       pkgs.go-tools
     ];
   }
   ```

   You may want `pkgs.mkShellNoCC` or, if/when you get flaky: [numtide/devshell][devshell]

   [devshell]: https://github.com/numtide/devshell

   For some projects you may instead want **just a `default.nix`:** This was the case for
   [Schemesh][schemesh-pr-13] which is a compiled open-source project run mainly by one person who
   is not a NixOS user. While shell.nix provides a developer shell with all the necessary tools,
   open-source project may not necessarily have *one* set of tools, except for building, of course.
   Leaving multiple .nix files here felt like littering.

   Given the right tools, a `default.nix` can be [extremely lean][evm-opcodes-default-nix]:

   [evm-opcodes-default-nix]: https://github.com/sshine/evm-opcodes/blob/main/default.nix

   ```nix
   { pkgs ? import <nixpkgs> {}, ... }: pkgs.haskellPackages.callCabal2nix "evm-opcodes" ./. {}
   ```

   Experienced Nix users may frown at the `? import <nixpkgs> {}` which falls back to whatever
   `nixpkgs` is available in `NIX_PATH`, e.g. the system installation. The outcome here is not
   deterministic. But it comes with two upsides: It works without explicitly pinning which version
   of `nixpkgs` you're using inside the given .nix file, it doesn't require learning about flakes or
   flake-free version pinning, it probably just works most of the time, and `pkgs` will get seeded
   once you import this file into a `flake.nix` which has explicit hash-pinning. Just so you know:
   It's a tradeoff, and I think it's a good one for this level of engagement.

2. **A `default.nix`, a `shell.nix` and a `flake.nix`:** At this level of investment you want to
   enable flakes, but make them entirely optional. A `default.nix` for building the project and
   making it easy to package, a `shell.nix` for providing the developer shell with all the necessary
   tools, and a `flake.nix` for distributing it.

   Making flakes optional comes down to making `shell.nix` and `default.nix` work by themselves and
   referencing them in `flake.nix` so that it doesn't become extremely big and overloaded. You do
   that simply by making them self-contained, e.g. by

   ```nix
   { pkgs ? import <nixpkgs> {}, ... }: ...
   ```

   This inherits the `pkgs` from the `nixpkgs` distribution mentioned in the flake, and falls back
   to whatever `nixpkgs` is on your system. So adding, removing or disregarding the flake, it works.

   Here is an example of such a flake:

   ```nix
   {
   description = "hcloud-upload-image - Quickly upload any raw disk images into your Hetzner Cloud projects";

   inputs = {
       nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
       flake-parts.url = "github:hercules-ci/flake-parts";
   };

   outputs = inputs @ {flake-parts, ...}:
     flake-parts.lib.mkFlake {inherit inputs;} {
       systems = [
         "x86_64-linux"
         "aarch64-darwin"
         # "aarch64-linux"
         # "x86_64-darwin"
       ];

       perSystem = {pkgs, ...}: let
         pkg = pkgs.callPackage ./default.nix {};
         app = {
           type = "app";
           program = "${pkg}/bin/hcloud-upload-image";
         };
       in {
         packages.default = pkg;
         packages.hcloud-upload-image = pkg;

         apps.default = app;
         apps.hcloud-upload-image = app;

         devShells.default = pkgs.callPackage ./shell.nix {};
       };
     };
   }
   ```

   Using [`flake-parts`][flake-parts] is a conscious choice: While a medium engagement with Nix
   tooling would encourage a low dependency footprint, flake-parts carries its own weight well:
   It allows for all the flake extensibility you need, and it greatly simplifies the flake itself.

   On the one hand, flake-parts is the result of an evolution of flake utility libraries, with
   flake-utils being the most common one. You may like to read [Why you don't need flake-utils][no-flake-utils]
   for a historic introduction to the design space.

   The "apps" of flakes let you `nix run github:you/project` without installing.

   Only enabling flakes for systems you've verified / CI'ed adds credibility.

3. A *dendritic* flake with `flake-parts` modules.

   I'll provide a proper write-up of these concepts.

   Until then, you can either see some projects that emphasise this pattern:

   - https://github.com/mightyiam/infra -- an extensive personal system configuration
   - https://github.com/sshine/nixos-ng -- a minimal, reusable template for system configuration
   - https://github.com/sshine/nix-terranix -- a more elaborate project for remote server orchestration

   Or you can read about Dendritic Nix here:

   - https://github.com/mightyiam/dendritic/
   - https://github.com/vic/import-tree#-import-tree-

   Going from optional flakes to all bells and whistles is perhaps a little daunting.

   There are competing concepts that provide the same ergonomics and functionality but with
   different tradeoffs, e.g. [Victor Borja's Dendritic Nix Ecosystem]. Vic is the author behind
   [`import-tree`][import-tree] and provides several appealing alternative paths than flakes. The
   reason I don't yet encourage them over flake-parts is simply that I haven't got around to
   experimenting with them yet.

[schemesh-pr-13]: https://github.com/cosmos72/schemesh/pull/13
[flake-parts]: https://flake.parts
[dendritic]: /articles/dendritic-nix-with-nixos-shell
[import-tree]: https://github.com/vic/import-tree
[no-flake-utils]: https://ayats.org/blog/no-flake-utils

