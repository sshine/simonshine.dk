{ pkgs ? import <nixpkgs> { }
, site ? pkgs.callPackage ./default.nix { }
, name ? "git.shine.town/sites/simonshine.dk"
, tag ? "latest"
}:

let
  # nginx serving the static site as an unprivileged, read-only-rootfs friendly
  # container: it logs to stdout/stderr and keeps every writable path under /tmp,
  # so nothing needs a writable image layer at runtime. Port 8080 avoids needing
  # root to bind, so the pod can run as nobody.
  nginxConf = pkgs.writeText "nginx.conf" ''
    worker_processes auto;
    error_log /dev/stderr warn;
    pid /tmp/nginx.pid;

    events {
      worker_connections 1024;
    }

    http {
      include ${pkgs.nginx}/conf/mime.types;
      default_type application/octet-stream;
      access_log /dev/stdout;

      sendfile on;
      tcp_nopush on;
      gzip on;
      gzip_types text/plain text/css application/javascript application/json image/svg+xml;

      client_body_temp_path /tmp/nginx-client-body;
      proxy_temp_path /tmp/nginx-proxy;
      fastcgi_temp_path /tmp/nginx-fastcgi;
      uwsgi_temp_path /tmp/nginx-uwsgi;
      scgi_temp_path /tmp/nginx-scgi;

      server {
        listen 8080;
        root ${site};
        index index.html;

        location = /healthz {
          return 200 "ok\n";
          add_header Content-Type text/plain;
        }

        error_page 404 /404.html;

        location / {
          try_files $uri $uri/ =404;
        }
      }
    }
  '';
in
pkgs.dockerTools.buildLayeredImage {
  inherit name tag;

  # fakeNss gives nginx a resolvable `nobody` user to drop workers to.
  contents = [
    pkgs.nginx
    pkgs.dockerTools.fakeNss
  ];

  extraCommands = ''
    mkdir -p tmp
    chmod 1777 tmp
  '';

  config = {
    Cmd = [
      "${pkgs.nginx}/bin/nginx"
      "-c"
      "${nginxConf}"
      "-g"
      "daemon off;"
    ];
    ExposedPorts = {
      "8080/tcp" = { };
    };
  };
}
