+++
date = '2026-07-05T02:35:37+02:00'
draft = false
title = 'A dendritic sops-nix flake template'
tags = ['nix']
+++

This tutorial sets up a flake using flake-parts, import-tree, devshell and sops-nix.

You can see the template here: https://github.com/sshine/nix-sops-flake-template

Unlike agenix/ragenix, the sops-nix NixOS module does not require importing
a Nix file describing recipients, so it composes cleanly inside flake-parts
modules without triggering [IFDs][ifd].

[ifd]: https://nix.dev/manual/nix/2.26/language/import-from-derivation

## 1. A dendritic flake

This flake auto-imports all .nix files in lib/.

You may want for that directory to be named something else, depending on your project.

I call it modules/, lib/, or nix/, depending on what role Nix plays in the project.

```nix {title="flake.nix"}
{
  description = "a sops-nix flake template";

  inputs = {
    nixpkgs.url = "https://channels.nixos.org/nixos-unstable/nixexprs.tar.xz";
    flake-parts.url = "github:hercules-ci/flake-parts";
    import-tree.url = "github:denful/import-tree";
    devshell = {
      url = "github:numtide/devshell";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    sops-nix = {
      url = "github:Mic92/sops-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    treefmt-nix = {
      url = "github:numtide/treefmt-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    lefthook-nix = {
      url = "github:sudosubin/lefthook.nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    inputs@{ flake-parts, import-tree, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];

      imports = [ (import-tree ./lib) ];
    };
}
```

One `devshells.default` is assembled from every `lib/*.nix` module, so tooling lives next to the concern that needs it.

The base devshell provides `just` as a command runner:

```nix {title="lib/devshell.nix"}
{ inputs, ... }:
{
  imports = [ inputs.devshell.flakeModule ];

  perSystem =
    { pkgs, ... }:
    {
      devshells.default = {
        packages = [
          pkgs.just
        ];
      };
    };
}
```

`lib/sops.nix` contributes the sops tooling and exposes the NixOS module:

```nix {title="lib/sops.nix"}
{ inputs, ... }:
{
  perSystem =
    { pkgs, ... }:
    {
      devshells.default = {
        packages = [
          pkgs.age
          pkgs.sops
          pkgs.ssh-to-age
        ];
      };
    };

  flake.nixosModules.default = inputs.sops-nix.nixosModules.sops;
}
```

`lib/treefmt.nix` contributes a formatter wrapper:

```nix {title="lib/treefmt.nix"}
{ inputs, ... }:
{
  imports = [ inputs.treefmt-nix.flakeModule ];

  perSystem =
    { config, ... }:
    {
      treefmt = {
        projectRootFile = "flake.nix";
        programs.nixfmt.enable = true;
      };

      devshells.default = {
        packages = [ config.treefmt.build.wrapper ];
      };
    };
}
```

The essential commands live in a `justfile`, run from inside the devshell:

```make {title="justfile"}
# List available recipes
default:
    @just --list

# Format the tree with treefmt
fmt:
    treefmt

# Type-check the flake wiring
check:
    nix flake check

# Edit (or create) an encrypted secret
edit file="secrets/hetzner.yaml":
    sops {{file}}

# Re-encrypt every secret after changing .sops.yaml
rekey:
    sops updatekeys secrets/*.yaml

# Check whether any secret needs re-encrypting (the pre-commit hook)
rekey-check:
    sops-rekey-check

# Decrypt a secret to stdout
show file="secrets/hetzner.yaml":
    sops decrypt {{file}}

# Print your age public key
age-pubkey:
    age-keygen -y ~/.config/sops/age/keys.txt
```

Then enable it with direnv:

```sh
$ echo "use flake" > .envrc
$ direnv allow
```

## 2. Identify recipient keys

sops-nix encrypts each secret to one or more *age* public keys.

sops also supports PGP, but we stick to *age* here.

Some common choices are to generate an age key from scratch, or derive one from an SSH key:

- `age-keygen -o ~/.config/sops/age/keys.txt` then take the `# public key:` line.
- `ssh-keyscan -t ed25519 my-host | ssh-to-age`
- `ssh-to-age < /etc/ssh/ssh_host_ed25519_key.pub`

Going with an age key for the user:

```sh
$ AGE_PUBKEY=$(age-keygen -o ~/.config/sops/age/keys.txt 2>&1 | grep -Poi '(?<=public key: ).*')
```

Or if you already did this and didn't store the public key:

```sh
$ AGE_PUBKEY=$(age-keygen -y ~/.config/sops/age/keys.txt)
```

## 3. Create `.sops.yaml`

This file declares which recipients may decrypt which secrets. It is not encrypted. Commit it.

Unlike agenix'es `secrets.nix`, sops never reads this file during Nix evaluation; it's consumed only
by the `sops` CLI when (re)encrypting.

```yaml {title=".sops.yaml"}
keys:
  - &alice age1qz...  # user key
  - &host1 age1xy...  # host key derived from ssh_host_ed25519_key
creation_rules:
  - path_regex: secrets/[^/]+\.yaml$
    key_groups:
      - age:
          - *alice
          - *host1
```

Specifically for the user "sshine" and some `$AGE_PUBKEY`:

```yaml {title=".sops.yaml"}
keys:
  - &sshine age1dmpgxjdt7g6r4rc9606ktrzmzzdktf9p8exhed0xzcdcr5su3y5st5vff4
creation_rules:
- path_regex: secrets/[^/]+\.yaml$
  key_groups:
  - age:
    - *sshine
```

## 4. Create encrypted secrets

From the repo root, with the devshell active:

```sh
sops secrets/hetzner.yaml          # opens $EDITOR, writes encrypted YAML
sops secrets/db-password.yaml      # a second secret file
sops updatekeys secrets/*.yaml     # re-encrypt when recipients change
```

A secret file is plain YAML before encryption:

```yaml {title="secrets/hetzner.yaml"}
hcloud_token: <your-hetzner-cloud-api-token>
```

```yaml {title="secrets/db-password.yaml"}
db-password: hunter2
api-token: sk-...
```

Commit the encrypted `*.yaml` files.

## 5. Consuming secrets in various contexts

### Wrap a CLI in the devshell (command wrapper)

`lib/hcloud.nix` adds an `hcloud` command that decrypts `HCLOUD_TOKEN` on each call:

```nix {title="lib/hcloud.nix"}
{ ... }:
{
  perSystem =
    { pkgs, lib, ... }:
    {
      devshells.default = {
        commands = [
          {
            name = "hcloud";
            help = "hcloud with HCLOUD_TOKEN decrypted from secrets/hetzner.yaml";
            command = ''
              token=$(${lib.getExe pkgs.sops} decrypt "$PRJ_ROOT/secrets/hetzner.yaml" \
                        | ${lib.getExe pkgs.yq-go} -r .hcloud_token)
              HCLOUD_TOKEN="$token" ${lib.getExe pkgs.hcloud} "$@"
            '';
          }
        ];
      };
    };
}
```

### Wire secrets into a NixOS host (flake-parts)

Create `lib/hosts.nix` (or per-host file) that adds NixOS configurations via the flake-parts `flake.nixosConfigurations` output:

```nix {title="lib/hosts.nix"}
{ inputs, self, ... }: {
  flake.nixosConfigurations.my-host = inputs.nixpkgs.lib.nixosSystem {
    system = "x86_64-linux";
    modules = [
      self.nixosModules.default
      ./my-host/configuration.nix
      {
        sops.defaultSopsFile = ../secrets/db-password.yaml;
        sops.age.sshKeyPaths = [ "/etc/ssh/ssh_host_ed25519_key" ];
        sops.secrets.db-password = { };
      }
    ];
  };
}
```

At runtime the decrypted secret appears at `/run/secrets/db-password`, owned `root:root` by default.

### Consume the secret in a system service

```nix
{ config, ... }: {
  sops.secrets.db-password.owner = "postgres";
  services.postgresql.passwordFile = config.sops.secrets.db-password.path;
}
```

## 6. Verify

- `nix flake check` — type-checks the wiring (no IFD: sops-nix never reads the
  encrypted file at evaluation time).
- `sops decrypt secrets/hetzner.yaml` — round-trip decrypt with your local key.
- `hcloud server list` — exercises the devshell wrapper end to end.
- After `nixos-rebuild switch`, `sudo ls -l /run/secrets/`.

## 7. Guard rekeying with a pre-commit hook

`lib/lefthook.nix` installs git hooks on devshell entry: `treefmt` on staged files, plus a `sops-rekey` hook that fails the commit when a secret is no longer encrypted to the recipients `.sops.yaml` would assign it (i.e. you forgot `sops updatekeys`):

```nix {title="lib/lefthook.nix"}
{ inputs, ... }:
{
  perSystem =
    {
      pkgs,
      lib,
      system,
      config,
      ...
    }:
    let
      rekey-check = pkgs.writeShellApplication {
        name = "sops-rekey-check";
        runtimeInputs = [
          pkgs.sops
          pkgs.diffutils
          pkgs.coreutils
        ];
        text = ''
          shopt -s nullglob
          files=(secrets/*.yaml)
          [ ''${#files[@]} -eq 0 ] && exit 0

          needs_rekey=0
          for f in "''${files[@]}"; do
            tmp="secrets/.rekey-check.$$.$(basename "$f")"
            cp "$f" "$tmp"
            trap 'rm -f "$tmp"' EXIT
            if sops updatekeys --yes "$tmp" >/dev/null 2>&1; then
              if ! diff -q "$f" "$tmp" >/dev/null 2>&1; then
                echo "✗ $f is not encrypted to the current .sops.yaml recipients"
                needs_rekey=1
              fi
            else
              echo "✗ could not check $f (is your age key available?)"
              needs_rekey=1
            fi
            rm -f "$tmp"
          done

          if [ "$needs_rekey" -ne 0 ]; then
            echo "run: sops updatekeys secrets/*.yaml"
            exit 1
          fi
        '';
      };

      lefthook = inputs.lefthook-nix.lib.${system}.run {
        src = inputs.self;
        config = {
          pre-commit.commands = {
            treefmt.run = "${config.treefmt.build.wrapper}/bin/treefmt --fail-on-change --no-cache {staged_files}";
            sops-rekey = {
              glob = "{.sops.yaml,secrets/*.yaml}";
              run = lib.getExe rekey-check;
            };
          };
        };
      };
    in
    {
      devshells.default = {
        packages = [ rekey-check ];

        env = [
          {
            name = "LEFTHOOK_BIN";
            value = toString (
              pkgs.writeShellScript "lefthook-dumb-term" ''
                exec env TERM=dumb ${lib.getExe pkgs.lefthook} "$@"
              ''
            );
          }
        ];

        devshell.startup.lefthook.text = lefthook.shellHook;
      };
    };
}
```

lefthook.nix symlinks a generated `lefthook.yml` into the store; ignore it:

```sh
$ echo "/lefthook.yml" >> .gitignore
```

## Conventions

- Group related secrets in one YAML file; address fields by key path
  (`sops.secrets."db/password"` reads the `db.password` field).
- Re-run `sops updatekeys` after changing `.sops.yaml`.
- Treat the user key and the host key as separate recipients. That way a host
  can decrypt on boot without ever needing the user key.
