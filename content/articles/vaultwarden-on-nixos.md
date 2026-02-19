+++
date = '2026-02-19T08:51:15+01:00'
draft = false
title = 'Vaultwarden on NixOS'
tags = ['nix']
+++

This post is about self-hosting [Vaultwarden][vaultwarden], an unofficial Bitwarden server, so that
you can have self-hosted password management. Bitwarden clients on computers and phones can be
configured to use a custom server.

[vaultwarden]: https://github.com/dani-garcia/vaultwarden

I found a few blog posts that deserve some credit; sadly, none of them provide the simplest possible
configuration, or every piece of information I needed.

- [Vaultwarden NixOS - Install/Configure Server](https://www.ersocon.net/articles/vaultwarden-nixos~05f8a119-c382-413b-a945-43bf3266418b)
- [Migrating vaultwarden to nixos | Yet Another SysAdmin Website](https://www.adyxax.org/blog/2023/12/20/migrating-vaultwarden-to-nixos/)
- [I use NixOS for my home-server, and you should too! - DEV Community](https://dev.to/jasper-clarke/i-use-nixos-for-my-home-server-and-you-should-too-1n7p)
- [Self Hosting Vaultwarden and Setting up SSL Certificates under Tailscale in Nixos - Alper Çelik's blog](https://blog.alper-celik.dev/posts/self-hosting-vaultwarden-and-setting-up-ssl-certificates-under-tailscale-in-nixos/)

They either assume you want to host your Vaultwarden on a VPN (making Let’s Encrypt not an option),
using secrets management, using Borg as backup system, or using postgresql as the database. All
reasonable choices, but hardly the simplest possible.

I’ll start with what I am using:

```nix
{ pkgs, lib, config, ... }: {
  config = lib.mkIf config.services.vaultwarden.enable {
    # The service
    services.vaultwarden = {
      dbBackend = "sqlite";
      config = {
        ROCKET_ADDRESS = "127.0.0.1";
        ROCKET_PORT = 8222;
        DOMAIN = "https://vault.example.org";
        SIGNUPS_ALLOWED = true;
        ADMIN_TOKEN = "$argon2id$v=19$m=65540,t=3,p=4$...";
        LOG_FILE = "/var/lib/bitwarden_rs/access.log";
      };
    };

    # The CLI tool
    environment.systemPackages = [
      pkgs.vaultwarden
    ];

    # The nginx reverse proxy
    services.nginx = let vault-host = "vault.example.org"; in {
      enable = true;
      recommendedGzipSettings = true;
      recommendedOptimisation = true;
      recommendedProxySettings = true;
      recommendedTlsSettings = true;

      virtualHosts."${vault-host}" = {
        forceSSL = true;
        enableACME = true;
        extraConfig = ''
          access_log /var/log/nginx/${vault-host}.access.log;
          error_log /var/log/nginx/${vault-host}.error.log;
        '';
        locations."/" = {
          proxyPass = "http://127.0.0.1:${toString config.services.vaultwarden.config.ROCKET_PORT}";
          proxyWebsockets = true;
          extraConfig = ''
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
          '';
        };
      };
  };
}
```

Some notes:
- Default service port is 8222, not 8000 as one blog post said
- User creation depends on the admin interface, which needs to be enabled
- `ADMIN_TOKEN` for enabling admin interface depends on secrets management for proper setup; when setting a plaintext admin password in `ADMIN_TOKEN`, the web UI warns about it and suggests to run `vaultwarden hash` to generate an argon2 hash. This is easier than enabling sops-nix, or similar.

  > You are using a plain text `ADMIN_TOKEN` which is insecure.
  > Please generate a secure Argon2 PHC string by using `vaultwarden hash` or `argon2`.

  but you need to not just enable the service, also install `pkgs.vaultwarden` to get access to that command.

- Inviting users seems to depend on SMTP settings, but [this discussion](https://github.com/dani-garcia/vaultwarden/discussions/4531) suggests that you don't have to use SMTP.
- `services.vaultwarden.backupDir` doesn't seem to work on its own; the systemd service complains:
  > backup-vaultwarden[528518]: Backup folder '/blah/blah/vaultwarden' does not exist

  the "data directory" defaults to /var/lib/bitwarden_rs and can be set with the `DATA_FOLDER` environment variable, and that's where the sqlite database lives.

Some pages I consulted for peace of mind:

- https://github.com/dani-garcia/vaultwarden/wiki/Enabling-admin-page
- https://github.com/kagiko/vaultwarden-wiki/blob/4fc6807a95700f66ef545cf4bcf6af968acbda72/Backing-up-your-vault.md
