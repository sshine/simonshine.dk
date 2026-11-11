+++
date = '2026-11-11T15:32:52+01:00'
draft = false
title = 'Managing immutable dotfiles softly'
tags = ['nix']
+++

Nix-based dotfile managers like [home-manager][home-manager] and [hjem][hjem] make a strong promise:
your configuration live immutably in the Nix store, and your home directory contains symlinks to it.
A rebuild gives you the same result every time.

That works beautifully for dotfiles where the programs they configure never write to them.

It falls apart the moment an application wants to edit its own configuration.

A lot of programs expect that they're able to, and a lot of users of those programs don't know the
configuration format without using the program's UI. For me the classic example of a program that I
don't know the configuration format for is VSCodium. I need the menus to search and experiment
before I commit to a Nix-powered configuration.

## The symlink trap

Suppose you manage `~/.config/opencode/cli.json` the obvious way with [hjem][hjem]:

```nix
files.".config/opencode/cli.json".text = builtins.toJSON {
  "$schema" = "https://opencode.ai/v2/cli.json";
  keybinds."input.delete.to.line.start" = "none";
  session.sidebar = "hide";
};
```

Hjem deploys that as a symlink:

```text
~/.config/opencode/cli.json -> /nix/store/...-config-opencode-cli.json
```

The target has mode `0444`. Reading works. Rebuilding works. Then you open OpenCode's settings
editor, change a preference, and hit save.

The program can now fail loudly, silently, or replace the symlink with a file, disregarding your
Nix-managed configuration.

This is not specific to OpenCode. `~/.ssh/config` is another classic example: OpenSSH is picky about
ownership and permissions, and a symlink into a root-owned store path will make the `ssh` command
fail. Any tool that validates, rewrites, or migrates its own config can trip over a store symlink.

## Hack: vendor and copy

With [home-manager][home-manager], a common workaround is to deploy the real content somewhere
harmless and copy it into place during activation:

```nix
home.file.".config/opencode/cli.json-source".text = builtins.toJSON { ... };

home.activation.copyOpencodeCli = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
  cp ~/.config/opencode/cli.json-source ~/.config/opencode/cli.json
  chmod 600 ~/.config/opencode/cli.json
'';
```

This works. The final file is a regular, mutable file owned by you. Redeploying overwrites it. But
now you are writing imperative glue inside a declarative configuration, and the activation script
has to know about ownership, permissions, and ordering.

## Hjem's native copy

Hjem's file entries support a `type` field. The default is `"symlink"`. The other useful value is `"copy"`:

```nix
files.".config/opencode/cli.json" = {
  type = "copy";
  clobber = true;
  permissions = "600";
  text = builtins.toJSON {
    "$schema" = "https://opencode.ai/v2/cli.json";
    keybinds."input.delete.to.line.start" = "none";
    session = {
      sidebar = "hide";
      scrollbar = true;
      grouping = "auto";
    };
  };
};
```

Each option does one job:

- `type = "copy"` keeps the source in the Nix store but installs a real copy at the target path.
- `clobber = true` overwrites that target on every activation, so a rebuild re-seeds it from the store.
- `permissions = "600"` makes the deployed file private to your user.
- `text` is still the declarative source of truth.

The resulting manifest is explicit about the intent:

```json
{
  "clobber": true,
  "permissions": "600",
  "source": "/nix/store/...-config-opencode-cli.json",
  "target": "/home/sshine/.config/opencode/cli.json",
  "type": "copy"
}
```

And the deployed file is exactly what the settings editor expects:

```text
-rw------- 1 sshine users 158 ... /home/sshine/.config/opencode/cli.json
```

No symlink. No activation script. No special case in the application.

## Advantages with soft-copying

The Nix store remains the source of truth. The file in your home directory is a working copy. You get:

- declarative configuration at rest;
- runtime mutability for applications that need it;
- a predictable reset point on every redeploy;
- no custom `cp` or `chmod` logic in an activation script.

The main cost is that changes through your app are temporary and may be lost when you redeploy and
forget to bring the temporary changes with you.

The cost is equally simple: any changes made through the app's settings editor are temporary. The
next `nixos-rebuild switch` will overwrite them. If you decide a setting is worth keeping, move it
into the Nix expression.

That is the "soft" part. The file is not immutably linked to the store, but it is still governed by it.

## Testing the behaviour

Mutate the deployed file the way an application would:

```sh
jq '.session.sidebar = "auto"' ~/.config/opencode/cli.json > /tmp/cli.json
mv /tmp/cli.json ~/.config/opencode/cli.json
```

Then redeploy:

```sh
just switch
```

The file is back to the managed version:

```json
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "keybinds": {
    "input.delete.to.line.start": "none"
  },
  "session": {
    "grouping": "auto",
    "scrollbar": true,
    "sidebar": "hide"
  }
}
```

The mutation is gone, the mode is still `600`, and the file is still writable. That is the whole trick.

## Gotchas

**Secrets do not belong in `text`.** The Nix store is world-readable. Setting `permissions = "600"` protects the deployed copy, not the store source. If a file contains secrets, generate it at activation time or use a proper secret manager. Read [sops-nix templates for passwords in legacy configs](/articles/sops-nix-templates/) for one way to do it.

[hjem]: https://github.com/feel-co/hjem
[home-manager]: https://github.com/nix-community/home-manager
