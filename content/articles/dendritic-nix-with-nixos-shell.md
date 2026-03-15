+++
date = '2026-03-01T14:03:12+01:00'
draft = false
title = 'Dendritic Nix With nixos-shell'
+++

## tl;dr

- I'm refactoring my system flake using [The Dendritic Pattern][dendritic]
- I'm testing the system flake using [`nixos-shell`][nixos-shell]
- I'll completely wipe my laptop's NixOS installation when ready

[dendritic]: https://github.com/mightyiam/dendritic/
[nixos-shell]: https://github.com/Mic92/nixos-shell

## Table of contents

- [Motivation (some ranting)](#motivation-some-ranting)
- [What is a dendritic flake?](#what-is-a-dendritic-flake)
- [What is nixos-shell?](#what-is-nixos-shell)
- [The bootstrap](#the-bootstrap)

## Motivation (some ranting)

Last week I [experimented with `nixos-anywhere`, `deploy-rs` and `disko` on Hetzner][naoh] which
lets me easily deploy NixOS on a Hetzner VM even though NixOS is not one of the dashboard options.

[naoh]: /articles/nixos-anywhere-on-hetzner/ 

I had some problems deploying `nixos-anywhere` from a MacBook (`aarch64-darwin`) to an `x86_64-linux`
VM. Problems with cross-compilation, package signing, and so on. One approach to this is to have a
Nix binary cache ([Attic](https://github.com/zhaofengli/attic)) of the same architecture, another is
to run a patched version of nixos-anywhere with your local signing keys added.

All of this trouble, however, made me question if things were easier using NixOS as the host system:
I have been using a MacBook for private matters because its battery is suitable for very sporadic
usage, as well as couch durability with a small kid in the house. But my old Lenovo T14 isn't bad on
battery, and I've wanted to run a 12 CPU-core Kubernetes cluster for homelabbing anyways.

## What is a dendritic flake?

In a conventional NixOS flake, `flake.nix` tends to grow into a single large file that defines every
output: NixOS configurations, packages, devShells, formatter settings, and so on. As the system
grows, so does the file. See for example [terranix'es flake.nix][terranix-flake] for something that
is doing way too many things at once.

[terranix-flake]: https://github.com/terranix/terranix/blob/main/flake.nix

You can easily prevent `flake.nix` bloat by placing separate things in separate files and
`import`'ing them. That's what I do [in `hcloud-upload-image`'s `flake.nix`][hui-flake]: the package
lives in `default.nix`, the dev shell lives in `shell.nix`; here, `flake.nix` only contains the list
of things it exports, but not the meat.

[hui-flake]: https://github.com/apricote/hcloud-upload-image/blob/edbd6df141b84ce9bf4b5dfd56f1de4a8cddfa23/flake.nix#L18-L32

In a dendritic flake, the `flake.nix` is a thin root that delegates everything to a directory of modules:

```nix
{
  description = "mechanicus.xyz distributed, dendritic flake";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs?ref=nixos-unstable";

    flake-parts.url = "github:hercules-ci/flake-parts";
    flake-parts.inputs.nixpkgs-lib.follows = "nixpkgs";

    import-tree.url = "github:vic/import-tree";
  };

  outputs = { self, flake-parts, import-tree, ... }@inputs:
    flake-parts.lib.mkFlake
      { inherit inputs; }
      (import-tree ./modules);
}
```

[import-tree](https://github.com/vic/import-tree) recursively discovers every `.nix` file under
`modules/` and produces a single [flake-parts][flake-parts] module with `imports = [ ... ]`. Each
file is a self-contained flake-parts module that can define NixOS configurations, packages,
devShells, or anything else flake-parts supports. Adding a new concern means adding a new file --
`flake.nix` itself never changes.

[import-tree]: https://github.com/vic/import-tree#quick-start
[flake-parts]: https://flake.parts/

> **Note:** [The Dendritic Pattern][dendritic] is not restricted to flakes or flake-parts. The
> import-tree docs give examples of applying the pattern [without flake-parts][den-1] and [without
> even flakes][den-2] by using [with-inputs][with-inputs] and [npins][npins] for flake-like inputs
> that are pinned.

[with-inputs]: https://github.com/vic/with-inputs
[npins]: https://github.com/andir/npins

With flakes, flake-parts and import-tree, every module is a flake-parts module.

## What is nixos-shell?

[`nixos-shell`](https://github.com/Mic92/nixos-shell) is not `nix-shell`.

They solve completely different problems:

- **`nix-shell`** drops you into a shell environment with specific packages available. It does not
  boot an operating system. It is analogous to `nix develop` in the flake world: It just changes the
  environment variables on your host system.

- **`nixos-shell`** boots a full NixOS system inside a QEMU virtual machine and drops you into its
  console. It evaluates a `nixosConfigurations` flake output (or a standalone NixOS module), builds
  a VM image, runs it and drops you into a shell with the current working directory mounted. The VM
  has its own kernel, init system, systemd services, users -- everything a real NixOS install has,
  but ephemeral and local.

`nixos-shell` is useful for testing NixOS configurations before deploying them to real hardware or a
cloud instance. It provides a tight edit-build-boot feedback loop: change a module, run `nixos-shell`,
and see the result in seconds.

Under the hood, nixos-shell 2.x works by calling `extendModules` on your `nixosConfigurations`
output to inject its own modules. These modules set up QEMU with a serial console, mount your
`$HOME` into the VM via 9p, auto-login as root, forward your `$TERM` and `$PATH`, and disable the
firewall.

## The bootstrap

Dang, I never converted this part to a written tutorial.

You can see the progress here: https://github.com/sshine/nixos-ng
