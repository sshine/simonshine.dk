+++
date = '2026-02-20T00:55:22+01:00'
draft = false
title = 'nixos-anywhere on Hetzner'
tags = ['nix']
+++

## tl;dr:

- I installed NixOS using [nixos-anywhere][nixos-anywhere] for the first time.
- Along the way I also finally tried (and succeeded) to use [disko][disko] and [deploy-rs][deploy-rs].
- Deploying from MacBook's aarch64-darwin to the VM's x86-64 required a few tweaks.

Tonight I wanted to try and run OpenClaw. I thought I would give it a persistent VM and that it
should run NixOS, of course. I already run several NixOS VMs in the cloud, but their deployment was
made with [nixos-infect][nixos-infect], which I promised myself I wouldn't do again.

I have some ambitions about easily deploying NixOS on Hetzner, and with the existence of
[hcloud-upload-image][hcloud-upload-image], I should be able to spawn VMs with snapshots made from
an existing installation. I've used this to deploy [Talos Linux][talos] for self-managed Kubernetes.

Since I don't deploy NixOS very often, I've post-poned building a NixOS snapshot.

But since my next NixOS VM is moments away, I might as well make something repeatable.

## nixos-infect vs. nixos-anywhere

nixos-infect works by running a shell script directly on the live system, mutating it in-place. It
installs the Nix package manager, builds a NixOS configuration, then attempts to replace the running
system's files and bootloader without ever rebooting into a clean environment.

nixos-infect is inherently fragile: you're essentially performing surgery on a running patient. It
can fail in subtle ways depending on the host distro, the bootloader layout, or what services are
running. Recovery from a failed infection often means reprovisioning from scratch anyway. It has no
concept of declarative disk partitioning and relies on the target's existing partition layout.

nixos-anywhere takes a cleaner approach. It boots the target machine into a minimal NixOS-based
kexec environment first (entirely in RAM), which means it's no longer running the original OS at all
when it does its work. From that clean slate it uses [disko][disko] to declaratively wipe and
repartition the disks according to your configuration, then installs NixOS fresh. Because the
original OS is no longer mounted or running, there are no conflicts, no locked files, and no
ambiguity about what state the system is in.

nixos-anywhere has significant practical advantages:
- Disk layout is fully declarative and reproducible via disko, so your partition scheme lives in
  your flake alongside everything else.
- The process is idempotent and predictable. You can run it repeatedly with the same outcome.
- It works well with secrets management tools like agenix and sops-nix out of the box, since you can
  inject secrets during installation.
- It integrates cleanly into automated provisioning pipelines (Terraform, OpenTofu, etc.), making it
  the natural choice for fleet management or cloud VM bootstrapping on providers like Hetzner.

## Picking a name

As they say, there are two big problems in Computer Science:

1. Cache invalidation
2. Naming things
3. Off-by-one errors

I'm always stuck on picking names for my servers, because they tend to stick around.

So I told Claude about my other servers (真，道，风) and got some suggestions:

> 神 (shén) — Spirit/deity. An AI agent that's always "on" has something of an animating presence to it.
>
> 灵 (líng) — Soul, intelligence, or supernatural efficacy. Often used in contexts of sentience and responsivenes.
>
> 思 (sī) — Thought, reflection. Simple and elegant; a server whose purpose is to think.
>
> 觉 (jué) — Awareness, perception, awakening. Has a nice connotation of ongoing consciousness.
>
> 常 (cháng) — Perpetual, constant, enduring. Directly references the "always running" nature of the agent — and it echoes the Daoist concept from the 道德经: 道可道，非常道.

I'll go with 神 (shén), but I'll keep the other names around.

## First, a Debian 13 VM

I'll use [hcloud OpenTofu provider][hcloud-opentofu] to make me a VM and the [DigitalOcean
provider][do-opentofu] for my DNS entries.

Yet another weekend project I haven't progressed on: Move DNS to [desec.io][desec-io].

```hcl
# An SSH key for passwordless access
resource "hcloud_ssh_key" "m1_key" {
  name       = "m1-key"
  public_key = file("keys/id_ed25519_m1.pub")
}

# A DNS entry
resource "digitalocean_record" "shen_mechanicus_xyz" {
  domain = digitalocean_domain.mechanicus_xyz.name
  type   = "A"
  name   = "shen"
  value  = hcloud_primary_ip.mechanicus_primary_ip4_shen.ip_address
}

# A reverse DNS entry
resource "hcloud_rdns" "mechanicus_rdns_ip4_shen" {
  server_id  = hcloud_server.shen_server.id
  ip_address = hcloud_server.shen_server.ipv4_address
  dns_ptr    = "shen.mechanicus.xyz"
}

# A public IPv4 address
resource "hcloud_primary_ip" "mechanicus_primary_ip4_shen" {
  name          = "mechanicus_shen_ip4"
  type          = "ipv4"
  assignee_type = "server"
  auto_delete   = false
  datacenter    = "fsn1-dc14"
}

# A public IPv6 address
resource "hcloud_primary_ip" "mechanicus_primary_ip6_shen" {
  name          = "mechanicus_shen_ip6"
  type          = "ipv6"
  assignee_type = "server"
  auto_delete   = false
  datacenter    = "fsn1-dc14"
}

# A VM
resource "hcloud_server" "shen_server" {
  image       = "debian-13"
  name        = "shen.mechanicus.xyz"
  server_type = "cx23" # Intel x86_64, 2 vCPU, 4GB RAM
  datacenter  = "fsn1-dc14"
  ssh_keys    = [
    hcloud_ssh_key.m1_key.id,
  ]

  public_net {
    ipv4_enabled = true
    ipv6_enabled = true
    ipv4 = hcloud_primary_ip.mechanicus_primary_ip4_shen.id
    ipv6 = hcloud_primary_ip.mechanicus_primary_ip6_shen.id
  }
}
```

## Following the wiki guide

I found the guide [Install NixOS on Hetzner: nixos-anywhere][nixos-anywhere-hetzner-guide] on the
NixOS Wiki. Sadly, [the nixos-anywhere page][nixos-anywhere-wiki] doesn't contain a full example.
I'm reminded that my intent to improve the wikis stalled a long time ago, drowned in politics and
having to use MediaWiki markup.

It consists of four parts:

- flake.nix
- config.nix
- hardware-config.nix
- disko-config.nix

I copy-pasted these and initially only modified the "users" section from "eugene" to "root.

Additionally, as I always do, I provide a [justfile][just] to help remind me how to do this:

```justfile
list:
  @just --list

deploy:
  nix run github:nix-community/nixos-anywhere -- \
    --flake '.#my-hetzner-vm' \
    --target-host root@shen.mechanicus.xyz \
    --build-on-remote
```

And this... just worked.

Logging in after the deployment, I was presented with a naked system and no /etc/nixos.

This is to be expected: I'm deploying from somewhere else, so the machine has no responsibility for
itself.

I'll need to redeploy with some additional software installed so that it can run OpenClaw.

## Remote deployment from MacOS without nixos-anywhere or nixos-rebuild

Because nixos-anywhere shuts down the server, redeploying isn't a live operation.

I need an alternative that just rebuilds NixOS and doesn't wipe or shut down the VM.

I've remotely redeployed NixOS before, but only from NixOS.

If my current system were NixOS, I'd run `nixos-rebuild --target-host ...`.

But I've decided to take my nix-darwin installation seriously, so here I am improvising.

Some other options:

1. rsync + SSH + remote nixos-rebuild: Copy files, log in, run commands. Too manual for my taste.
3. [deploy-rs][deploy-rs]: Supports nix-darwin and flakes.
2. [colmena][colmena]: Supports nix-darwin and flakes.
4. [nixinate][nixinate]: Seems dead.
5. [NixOps][nixops]: Dead.

> **Edit:** Reading through [this Discourse thread from 2023][discourse-deploy] after I succeeded, I
> would probably have tried colmena, but my thought was this: "deploy-rs, I've heard that before! I've
> wanted to use it, Serokell seem super competent." -- and so I went with something recognizable.

I'll extend my justfile:

```justfile
list:
  @just --list

deploy:
  nix run github:nix-community/nixos-anywhere -- \
    --flake '.#my-hetzner-vm' \
    --target-host root@shen.mechanicus.xyz \
    --build-on-remote

redeploy:
  nix run github:serokell/deploy-rs -- '.#my-hetzner-vm'
```

### flake.nix

Some changes:
- Switched to nixos-unstable
- Added deploy-rs as a flake input
- Added deploy.nodes.my-hetzner-vm as a flake output
- Specifically added `remoteBuild = true;` because the MacBook is aarch64.
- Specifically added `sshUser = "root";` because it defaults to current user on my system.

```nix
# flake.nix
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

    disko.url = "github:nix-community/disko";
    disko.inputs.nixpkgs.follows = "nixpkgs";

    deploy-rs.url = "github:serokell/deploy-rs";
    deploy-rs.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = inputs@{ self, nixpkgs, deploy-rs, ... }: {
    nixosConfigurations.my-hetzner-vm = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";

      modules = [
        ./config.nix
        inputs.disko.nixosModules.disko
      ];
    };

    deploy.nodes.my-hetzner-vm = {
      hostname = "shen.mechanicus.xyz";
      sshUser = "root";
      profiles.system = {
          user = "root";
          remoteBuild = true;
          path = deploy-rs.lib.x86_64-linux.activate.nixos
            self.nixosConfigurations.my-hetzner-vm;
      };
    };
  };
}
```

### config.nix

Some changes:
- Removed the eugene user and added my public key to the root user instead.
- Added zsh as the default shell and enabled it on the system.
- Added git, Node and pnpm as system packages for OpenClaw.
- Added flakes and nix-command as experimental features; it's 2026!
- Updated `system.stateVersion = "25.11";` since there's no system yet.

```nix
# config.nix
{ config, lib, pkgs, ... }:
{
  imports =
    [
      ./hardware-config.nix
      ./disko-config.nix
    ];

  boot.loader.grub.enable = true;

  services.openssh.enable = true;
  programs.zsh.enable = true;
  users.defaultUserShell = pkgs.zsh;
  users.users.root.openssh.authorizedKeys.keys = [
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFWF+CfMuGgMsnqz8QWcNpxdx5j63UT6Mh7WCqvTH6o5 sshine@m1"
  ];

  programs.neovim = {
    enable = true;
    defaultEditor = true;
  };

  environment.systemPackages = [
    pkgs.gitFull
    pkgs.nodejs_25
    pkgs.pnpm
  ];

  nix.settings.experimental-features = [ "nix-command" "flakes" ];

  system.stateVersion = "25.11";
}
```

### hardware-config.nix

No changes compared to wiki.

```nix
# hardware-config.nix
{ config, lib, pkgs, modulesPath, ... }:
{
  imports = [
    (modulesPath + "/profiles/qemu-guest.nix")
  ];

  networking.useDHCP = lib.mkDefault true;
  nixpkgs.hostPlatform = lib.mkDefault "x86_64-linux";
}
```

### disko-config.nix

No changes compared to wiki.

```nix
# disko-config.nix
{
  disko.devices.disk.main = {
    type = "disk";
    device = "/dev/sda";
    content = {
      type = "gpt";
      partitions = {
        boot = {
          size = "1M";
          type = "EF02";
          priority = 1;
        };
        ESP = {
          size = "512M";
          type = "EF00";
          content = {
            type = "filesystem";
            format = "vfat";
            mountpoint = "/boot";
          };
        };
        root = {
          size = "100%";
          content = {
            type = "filesystem";
            format = "ext4";
            mountpoint = "/";
          };
        };
      };
    };
  };
}
```

## And finally... no, just kidding, there's missing dependencies...

Following the tradition of installing stuff on NixOS, you discover hidden dependencies in the
toolchain that the authors don't tell you about. In this case it was...

```nix
environment.systemPackages = [
  pkgs.gitFull
  pkgs.nodejs_25
  pkgs.pnpm
  pkgs.gnumake
  pkgs.cmake
  pkgs.gcc
];
```

[nixos-anywhere]: https://github.com/nix-community/nixos-anywhere
[nixos-infect]: https://github.com/apricote/hcloud-upload-image/
[hcloud-upload-image]: https://github.com/apricote/hcloud-upload-image/
[talos]: https://www.talos.dev/
[disko]: https://github.com/nix-community/disko
[deploy-rs]: https://github.com/serokell/deploy-rs
[hcloud-opentofu]: https://search.opentofu.org/provider/opentofu/hcloud/latest
[do-opentofu]: https://search.opentofu.org/provider/opentofu/digitalocean/latest
[desec-io]: https://desec.io/
[nixos-anywhere-wiki-guide]: https://wiki.nixos.org/wiki/Install_NixOS_on_Hetzner_Cloud#nixos-anywhere
[nixos-anywhere-wiki]: https://wiki.nixos.org/wiki/Nixos-anywhere
[just]: https://github.com/casey/just
[colmena]: https://colmena.cli.rs/
[nixinate]: https://github.com/MatthewCroughan/nixinate
[nixops]: https://github.com/NixOS/nixops
[discourse-deploy]: https://discourse.nixos.org/t/deployment-tools-evaluating-nixops-deploy-rs-and-vanilla-nix-rebuild/36388/
