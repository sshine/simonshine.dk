+++
date = '2026-07-05T22:51:02+02:00'
draft = false
title = 'Using sops-nix templates to support passwords in legacy configs'
tags = ['nix']
+++

**Note:** This article builds on my [dendritic sops-nix flake template][sops-nix-template].

[sops-nix-template]: /articles/dendritic-sops-nix-flake-template/

Nix is littered with alternative solutions to things.

Most people who use Nix to manage their [irssi][irssi] configuration would use the [home-manager
irssi extensions][home-manager-irssi]. But I have a principle that I've held onto: I like to keep
program configuration non-nixified so that they can still hypothetically be used outside of Nix.

[irssi]: https://irssi.org/
[home-manager-irssi]: https://nix-community.github.io/home-manager/options/home-manager/programs/irssi.html

## The problem: irssi keeps password authentication in the config file

Irssi was first released in 1999. Back then you didn't think about these things.

But having a password in a configuration file means you can't commit it to git.

Here's a problematic irssi config section:

```nix
chatnets = {
  liberachat = {
    type = "IRC";
    sasl_mechanism = "PLAIN";
    sasl_username = "sshine";
    sasl_password = "p4ssw0rd"; # <- can't commit this!
  };
};
```

*(If you're wondering, that's not actually Nix code, but irssi config code. Damn!)*

What I want is to keep the plaintext master under version control, redacted, and have Nix splice the
real password in at activation, into a file that never touches the Nix store. This way the password
lives in ~/.irssi/config which gets constructed from a combination of a passwordless config and a
sops-nix secret.

## tl;dr

`sops.templates` does exactly that. You give it content containing
`config.sops.placeholder.<name>` markers, and sops-nix renders the finished file
on the box, at a path you choose, with an owner and mode you choose:

```nix
{ config, primaryUser, ... }:
{
  sops.secrets.irssi_libera_sasl_password.sopsFile = ../secrets/dao/irssi.yaml;

  sops.templates."irssi-config" = {
    path = "/home/${primaryUser}/.irssi/config";
    owner = primaryUser;
    mode = "0600";
    content =
      builtins.replaceStrings
        [ "@LIBERA_SASL_PASSWORD@" ]
        [ config.sops.placeholder.irssi_libera_sasl_password ]
        (builtins.readFile ../dot.irssi/config);
  };
}
```

Now I can write the following in my git-committed irssi config:

```nix
chatnets = {
  liberachat = {
    type = "IRC";
    sasl_mechanism = "PLAIN";
    sasl_username = "sshine";
    sasl_password = "@LIBERA_SASL_PASSWORD@"; # <- can commit this!
  };
};
```

I'll set the password manually:

```console
$ sops secrets/dao/irssi.yaml
```

```yaml
irssi_libera_sasl_password: p4ssw0rd
```

Because `.sops.yaml` already has a `creation_rule` for `secrets/dao/*.yaml`
listing both the admin (`&sshine`) and the host (`&dao`) as recipients, there's
nothing new to configure.

## Disable irssi autosave

I had to disable irssi's autosave setting.

Otherwise the irssi config will occasionally write to the constructed file:

```nix
settings = {
  core = {
    settings_autosave = "no";
  };
};
```

Now the config is purely declarative in both directions: Nix owns it, irssi only
reads it. Every rebuild re-renders it from the master; nothing round-trips back.

```console
$ ls -l ~/.irssi/config
lrwxrwxrwx - sshine users  5 Jul 20:20 /home/sshine/.irssi/config -> /run/secrets/rendered/irssi-config

$ ls -l /run/secrets/rendered/irssi-config
.rw------- 7.6k sshine users  5 Jul 20:20 /run/secrets/rendered/irssi-config
```
