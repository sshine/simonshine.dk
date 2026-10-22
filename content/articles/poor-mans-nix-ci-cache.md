+++
date = '2026-10-21T11:20:00+02:00'
draft = false
title = "A poor man's Nix CI cache"
tags = ['nix', 'kubernetes', 'forgejo']
+++

A thing I often come back to is [speeding][ci-nix-1] [up][ci-nix-2] CI. For almost 20 years I've
been pushing compilation-heavy code to GitHub. Their free tier always provided enough CI minutes. So
optimizing was never a resource problem, but rather a principle.

[ci-nix-1]: /articles/speeding-up-ci-with-nix/
[ci-nix-2]: 998e526196c894e1726ba35f36c92ab7abe8762b

For GitHub Actions, my go-to strategy is `nixbuild/nix-quick-install-action` and
`nix-community/cache-nix-action` that piggyback on the GitHub CI cache:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6.1.0, 2026-07-16

      - uses: nixbuild/nix-quick-install-action@9f63be77f412a248c9d9a65a4c82cf066cdf8f0c # v35, 2026-06-17

      - name: Restore and save Nix store
        uses: nix-community/cache-nix-action@7df957e333c1e5da7721f60227dbba6d06080569 # v7.0.2, 2026-01-30
        with:
          primary-key: nix-${{ runner.os }}-${{ hashFiles('**/*.nix', '**/flake.lock') }}
          restore-prefixes-first-match: nix-${{ runner.os }}-
          gc-max-store-size-linux: 2G
          purge: true
          purge-prefixes: nix-${{ runner.os }}-
          purge-created: 0
          purge-last-accessed: P1DT12H
          purge-primary-key: never
```

However, I also run a Forgejo instance with a [NixOS-like CI runner][ci-runner] that cannot benefit
from these community actions.

The Forgejo instance simply doesn't have the CI cache of GitHub built-in.

[ci-runner]: https://git.shine.town/infra/runners
[forgejo]: https://forgejo.org/
[kubenix]: https://github.com/hall/kubenix

So here's what I do on Forgejo instead.

I will start by explaining how Forgejo is installed.

## Forgejo itself

The Forgejo Helm chart is vendored with [helm-vendor](https://github.com/sshine/helm-vendor), which
I owe to do a writeup on. Its whole declaration in `charts.toml` is:

<!-- as described in [Vendoring Helm charts with Nix](/articles/vendoring-helm-charts-with-nix/). -->

```toml
[forgejo]
oci = "oci://code.forgejo.org/forgejo-helm/forgejo"
chart = "forgejo"
version = "17.1.1"
```

From there `charts.forgejo` is a path in the Nix store, and `kubenix.lib.helm.chart2json` turns it
into JSON. No network at evaluation time, and the chart cannot change under me between a `nix build`
on my laptop and one in CI.

## A secret that writes itself

One cool part of the values is the OIDC block, because it names a secret that is not in git:

```nix
gitea = {
  admin.existingSecret = "forgejo-admin";
  oauth = [
    {
      name = "Keycloak";
      provider = "openidConnect";
      existingSecret = "forgejo-oauth-keycloak";
      autoDiscoverUrl = "https://keycloak.shine.town/auth/realms/master/.well-known/openid-configuration";
    }
  ];
};
```

`forgejo-oauth-keycloak` holds a Keycloak client secret. I did not want that value in git, not even
encrypted, because then rotating it is a commit. So it is generated in the cluster and never leaves
it.

Forgejo grew a Job for this, then Immich grew a near-identical copy, and at that point it moved into
`lib/oauth-bootstrap.nix` as a builder. What varies between callers is small: the client
representation, and whether the client is created or only re-secreted. Everything else is the same
every time, so the Vault k8s-auth login, the idempotence check, the Keycloak admin token exchange,
the ServiceAccount, the ConfigMap holding the script, and the hash-suffixed Job name all live in one
place.

Callers put the result in `imports`, and its objects and its `VaultStaticSecret` merge into the
service:

```nix
imports = [
  (oauth.mkKeycloakClient {
    namespace = ns;
    clientId = "forgejo";
    rotateOnly = true;
  })
];
```

`rotateOnly` exists because the Forgejo client predates the Job. It carries settings I made by hand
in the Keycloak UI, and a create-or-update would flatten them, so for this caller the Job rotates
the secret and fails if the client is absent rather than creating it.

The Job writes to Vault, [vault-secrets-operator][vso] syncs it down to a Kubernetes Secret, and
Forgejo reads the Secret. The value never passes through my terminal.

[vso]: https://github.com/hashicorp/vault-secrets-operator

I wrote an extensive blog post about that: [A Vault Job](/articles/a-vault-job/).

## The runner

Forgejo's runner takes labels mapping a name to how a job is run:

```yaml
runner:
  capacity: 2
  labels:
    - "ubuntu-latest:docker://node:20-bookworm"
    - "nixos:docker://git.shine.town/infra/runners/nixos:latest"
```

`runs-on: nixos` gets a container built from
[git.shine.town/infra/runners](https://git.shine.town/infra/runners). It is a `dockerTools.buildImage`
wrapping a `buildEnv` of bash, coreutils, git, curl, openssh, nodejs, skopeo and a `nix` profile,
plus an `/etc/nix/nix.conf`. The full `nixos-image.nix` is mostly a long list of package names, so
here is the shape of it:

```nix
rootEnv = buildEnv {
  name = "root-env";
  paths = [ nixProfile pkgs.bashInteractive pkgs.coreutils pkgs.git /* ... */ pkgs.skopeo ];
  pathsToLink = [ "/bin" "/etc" "/lib" "/share" ];
};

packages.nixos = pkgs.dockerTools.buildImage {
  name = "nixos";
  tag = "latest";
  copyToRoot = [ rootEnv nixConf sslCerts /* /tmp, /root, passwd, group */ ];
  config.Cmd = [ "/bin/bash" ];
};
```

Because the labels say `docker://`, the runner Deployment needs a Docker daemon beside it. Making
that start in the right order took two attempts:

```nix
# dind is a sidecar (initContainer + restartPolicy Always), not a plain container:
# only that ordering makes the runner wait for the startupProbe, and the runner
# exits 1 when it starts before dind has written the client certs to /certs.
initContainers = [
  {
    name = "dind";
    image = "docker:29.3.1-dind";
    restartPolicy = "Always";
    startupProbe = {
      exec.command = [ "sh" "-c" "test -f /certs/client/ca.pem && docker info >/dev/null" ];
      periodSeconds = 2;
      failureThreshold = 45;
    };
    # ...
  }
];
```

A plain second container races, and a sidecar with a startupProbe does not.

The probe waits for something to finish instead of sleeping for a guessed number of seconds.

## The runner builds itself, inside itself

This is my favourite part.

The workflow that publishes the runner image tests it by building the image again, inside the image
it just published:

```yaml
name: Build, push and test runner images

on:
  push:
    branches:
      - main
  workflow_dispatch:

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Nix
        run: .forgejo/scripts/install-nix.sh

      - name: Build runner image
        run: nix run nixpkgs#just -- build

      - name: Push image to registry
        env:
          SKOPEO_DEST_CREDS: forgejo_admin:${{ secrets.RUNNERS_PACKAGE_UPLOAD_KEY }}
        run: nix run nixpkgs#just -- push

  test-image:
    needs: build-and-push
    runs-on: nixos
    steps:
      - uses: actions/checkout@v4

      - name: Build runner image
        run: just build
```

The first job runs on `ubuntu-latest`, which has neither Nix nor `just`, so it installs one and
fetches the other. The second runs on `nixos` and calls `just build` directly, because `just` is in
the image.

## Trick one: put the tools in the runner

`nix run nixpkgs#just` resolves the flake registry, fetches a nixpkgs tarball, evaluates it, then
downloads `just` and its closure: 138 MiB for a program that runs for four seconds.

The worse case was in my Hugo sites' workflows, which pushed images with skopeo:

```make
push-image TAG='latest': build-image
    for tag in latest "{{ TAG }}"; do
      nix run nixpkgs#skopeo -- copy --insecure-policy "${creds[@]}" \
        docker-archive:image.tar.gz \
        "docker://{{ image_name }}:$tag"
    done
```

`skopeo`'s closure is 2.6 GiB unpacked across 65 paths: gnupg, gpgme, tpm2-tss, openldap. Every job
downloaded all of it. And `skopeo` was already in the runner image, in `rootEnv`, and had been for
months. The justfile was downloading a copy of a program sitting on `PATH`.

The fix is one word:

```make
push-image TAG='latest': build-image
    for tag in latest "{{ TAG }}"; do
      skopeo copy --insecure-policy "${creds[@]}" \
        docker-archive:image.tar.gz \
        "docker://{{ image_name }}:$tag"
    done
```

Same for `just`, once I added `pkgs.just` to `rootEnv`.

**Before: 2.8 GiB downloaded per job. After: 207 MiB.**

Some limitations apply: A project pins its own nixpkgs, the runner image pins its own; so whatever
binary my image has is not the same as my project unless I make a coordinated effort to sync them:

|         | runner image | one of my sites |
|---------|--------------|-----------------|
| gcc     | 15.3.0       | 15.2.0          |
| python3 | 3.14.7       | 3.13.13         |
| hugo    | 0.165.0      | 0.161.1         |

So you cannot bake a project's *build inputs* into the runner and expect a cache hit; those store
paths differ. But `just`, `skopeo`, `curl`, `jq`, everything a workflow invokes as a command rather
than as a build input, often does'nt need to match.

## Trick two: a Nix cache on every node

207 MiB per job beats 2.8 GiB, but it is the same 207 MiB every time, and most of it is not even my
project. `dockerTools` calls `runCommand` internally, `runCommand` is `stdenv` with a C compiler, so
gcc arrives at 85 MiB. `buildLayeredImage`'s layer script is a Python program, so python3 arrives at
53 MiB. The Hugo binary doing the actual work is 18 MiB.

Nix substitution is plain HTTP GETs of hash-named, immutable objects: ask for `/<hash>.narinfo`,
verify its signature, then GET the `nar/<filehash>.nar.zst` it points at. Nothing ever changes
content under a given URL, so a generic caching proxy is enough and nothing Nix-aware is required.

A proxy does not need to re-sign anything. It passes cache.nixos.org's narinfo through untouched,
signature included, so `trusted-public-keys` stays as it was and the proxy is untrusted. (There is a
security comment about content addressing missing here that Tim Ferrera addresses on [Full Time Nix
episode 165: Is Tim making the Nix-killer?](https://fulltimenix.com/episodes/is-tim-making-the-nix-killer).)

The poor man's Nix cache is just an nginx proxy:

```nginx
proxy_cache_path /var/cache/nix levels=1:2 keys_zone=nixcache:100m
                 max_size=20g inactive=90d use_temp_path=off;

# Served locally, not proxied: passing the upstream file through would advertise
# its Priority 40 and tie the two, leaving Nix to query both for every path.
location = /nix-cache-info {
  default_type text/x-nix-cache-info;
  return 200 "StoreDir: /nix/store\nWantMassQuery: 1\nPriority: 10\n";
}

location / {
  proxy_pass https://$upstream_host$request_uri;
  proxy_cache nixcache;
  proxy_ignore_headers Cache-Control Expires Set-Cookie Vary X-Accel-Expires;
  proxy_cache_valid 200 90d;
  proxy_cache_valid 404 1m;   # a path missing now may exist later
  proxy_cache_lock on;        # 3 replicas x capacity 2 = 6 concurrent misses
  add_header X-Cache-Status $upstream_cache_status;
}
```

`inactive=90d` is on last access rather than age, so gcc and glibc stay resident because every build
touches them, while a Hugo version I moved off expires on its own. Between that and `max_size`,
there is no garbage collection to write.

### One per node, not one per cluster

My Kubernetes nodes are in Falkenstein, Nuremberg and Helsinki. That makes a single shared cache a
bad idea, because two thirds of the reads would cross a datacentre boundary to reach it, and Fastly
(which powers cache.nixos.org) has a point of presence nearer those nodes than my Falkenstein node.

So it runs as a DaemonSet, one nginx per node, each with its own directory.

That means a `hostPath`, since a DaemonSet cannot hand every pod its own claim:

```nix
{
  name = "cache";
  hostPath = {
    path = "/var/nix-cache";
    type = "DirectoryOrCreate";
  };
}
```

and a line on the Service to restrict access:

```nix
internalTrafficPolicy = "Local";
```

This keeps the CI runner image out of the cache: `http://nix-cache.nix-cache.svc.cluster.local:8080`
stays a single fixed name in `nix.conf`, and every pod is routed to the copy on its own node.
Without that line the Service load-balances across all three.

A few gotchas: DaemonSet didn't need anti-affinity to stay off the control planes, because Talos
taints them `node-role.kubernetes.io/control-plane:NoSchedule` and the DaemonSet has no matching
toleration. And if your cluster enforces the `baseline` PodSecurity profile, hostPath is rejected
outright:

```
Error creating: pods "nix-cache-zsdng" is forbidden:
  violates PodSecurity "baseline:latest": hostPath volumes (volume "cache")
```

Finally, one line in the runner image's `nix.conf`:

```
substituters = http://nix-cache.nix-cache.svc.cluster.local:8080 https://cache.nixos.org
```

cache.nixos.org stays listed second, so missing the cache only costs speed.

One thing I checked before relying on any of it: job containers are spawned by dockerd *inside* the
runner pod, on a Docker bridge nested in the pod's network namespace, and it was not obvious to me
that they would reach a ClusterIP. They do. dockerd copies the pod's `/etc/resolv.conf` into the
containers it starts, so kube-dns and Service routing both work from inside a job.

## Benchmarking

I took `linux-firmware`, 771 MiB compressed, warmed each node's cache with it, and fetched it from a
pod three times per source.

Falkenstein:

| source     | time  | throughput  |
|------------|-------|-------------|
| upstream   | 4.10s | 188.3 MiB/s |
| node-local | 1.44s | 534.9 MiB/s |

Helsinki, where the middle row is what a single shared cache in Falkenstein would have given it:

| source        | time   | throughput  |
|---------------|--------|-------------|
| upstream      |  2.65s | 290.6 MiB/s |
| cache in fsn1 | 10.70s |  72.1 MiB/s |
| node-local    |  1.06s | 725.2 MiB/s |

So the node-local cache is worth about 2.5 to 2.8 times cache.nixos.org, and a single shared cache
would have been four times *worse* than cache.nixos.org for the two nodes that do not host it. The
cost of one per node is that the same gcc is stored three times, which is 85 MiB against 20 GiB of
headroom on each.

Falkenstein is slower than Helsinki in every row, upstream included, on identical instance types.

I'm not sure why.

## Where it stands

Per job, for a small Hugo site:

**Before: 2.8 GiB from cache.nixos.org. After: 207 MiB, served off the runner's own node at 530-730 MiB/s.**
