+++
date = '2026-10-25T13:00:29+01:00'
draft = false
title = 'Running Forgejo on a Hetzner Kubernetes cluster'
tags = ['nix', 'kubernetes', 'kubenix', 'forgejo']
+++

I host my own git. Since May 2026 that has been a single [Forgejo][fj] pod on a Talos cluster at
Hetzner, deployed from Nix with [kubenix][kubenix] and the upstream [forgejo-helm][fjh] chart.

The first deploy was Forgejo 14.0.4 on chart 16.2.2, SQLite, and a 20Gi volume. Five months later
it runs on Postgres, has been knocked over by crawlers three times. Most of what changed in the
deployment came from those outages.

[fj]: https://forgejo.org
[kubenix]: https://github.com/hall/kubenix
[fjh]: https://code.forgejo.org/forgejo-helm/forgejo-helm

## tl;dr

- The chart is vendored and pinned in `charts.toml`; kubenix renders it with `chart2json`, so the
  Helm values are a Nix attrset and `nix build .#test` asserts on the output.
- No OAuth client secret is in git. A Job generates it into Vault, and VSO renders it back.
- A runner that registers on every pod start from an `emptyDir` leaves three offline rows per
  rollout. I have 29 of them.
- A crawler walking every ref of one repository in every archive format put 16.2G of tarballs on a
  20Gi volume. Source archives are now off.
- A crawler on `blame`, `commit`, `commits` and `src` pages took the Actions API down, and three
  release runs were recorded as failures while their steps passed. An Envoy Gateway rate limit of
  60 a minute on those paths fixed it.
- Hetzner volumes only grow. Going from 40Gi to 10Gi was a new claim, a `tar` pipe, and a sha256
  over all 3638 files.

## The chart is a directory

The chart is vendored with `helm-vendor`, a small CLI of mine that keeps a registry in
`charts.toml` and unpacks each chart into `charts/`. Forgejo publishes its chart only as an OCI
artifact:

```toml
# charts.toml
[forgejo]
oci = "oci://code.forgejo.org/forgejo-helm/forgejo"
chart = "forgejo"
version = "17.2.0"
```

A bump is `just vendor-update forgejo 17.2.0`, and the diff is the whole chart.

Every directory under `charts/` becomes a store path, and every service module receives the set as
`charts`:

```nix
# lib/cluster.nix
chartDrv = name: path: pkgs.runCommandLocal "${name}-chart" { } "cp -r ${path} $out";
vendoredCharts = lib.mapAttrs chartDrv inputs.self.charts;

# ...
specialArgs = {
  charts = vendoredCharts;
  oauth = sharedOauthBootstrap;
  pgBackup = sharedPgBackup;
  # ...
};
```

The first deploy fetched the chart with `kubenix.lib.helm.fetch` and a `sha256`, and now it is a
path.

## Values are Nix

`chart2json` runs `helm template` at evaluation time and hands back JSON, which the module parses
and appends to its own objects:

```nix
# services/forgejo.nix
objectsRaw = builtins.fromJSON (
  builtins.readFile (
    kubenix.lib.helm.chart2json {
      chart = charts.forgejo;
      name = "forgejo";
      namespace = ns;
      values = {
        replicaCount = 1;
        persistence = {
          enabled = true;
          create = true;
          mount = true;
          claimName = "gitea-data";
          size = "10Gi";
          storageClass = "hcloud-volumes";
          accessModes = [ "ReadWriteOnce" ];
        };
        resources = {
          requests = { cpu = "250m"; memory = "512Mi"; };
          limits.memory = "2Gi";
        };
        gitea = {
          admin.existingSecret = "forgejo-admin";
          additionalConfigFromEnvs = [
            {
              name = "FORGEJO__DATABASE__PASSWD";
              valueFrom.secretKeyRef = { name = "forgejo-pg-app"; key = "password"; };
            }
          ];
          config.database = {
            DB_TYPE = "postgres";
            HOST = "forgejo-pg-rw.${ns}.svc.cluster.local:5432";
            NAME = "forgejo";
            USER = "app";
          };
        };
        httpRoute.enabled = true;
        ingress.enabled = false;
      };
    }
  )
);
```

The chart defaults to the rootless image. The database moved off SQLite in May onto a
[CloudNativePG][cnpg] cluster called `forgejo-pg`, built by a shared `pgBackup.mkCluster`; the
chart reads the password from the `Secret` CNPG generates. Routing is the chart's own HTTPRoute,
plus a TCPRoute for SSH.

[cnpg]: https://cloudnative-pg.io

`just service-deploy forgejo` builds the manifest and applies it. Before that, `nix build .#test`
runs property tests over every rendered service:

```nix
# lib/tests.nix
forgejo = [
  (it "is reachable over https and ssh" [
    (has "HTTPRoute" "forgejo")
    (has "TCPRoute" "forgejo-ssh")
  ])
  (it "reads its credentials from Vault" (
    map (has "VaultStaticSecret") [
      "forgejo-oauth-keycloak"
      "forgejo-admin"
      "forgejo-runner-token"
    ]
  ))
  (it "is backed by its own database" (has "Cluster" "forgejo-pg"))
];
```

## No client secret in git

Users log in through Keycloak. The first deploy created the OIDC client with `curl` against the
Keycloak admin API and kept the client secret in an inline `Secret` in `forgejo.nix`, which was the
first thing I replaced.

Now a Job generates the secret in-cluster, sets it on the Keycloak client, and writes it to Vault.
The builder lives in `lib/oauth-bootstrap.nix` and every service that logs in through Keycloak
imports it:

```nix
# services/forgejo.nix
imports = [
  (oauth.mkKeycloakClient {
    namespace = ns;
    clientId = "forgejo";
    rotateOnly = true;
  })
];
```

`rotateOnly` exists because Forgejo's client predates the Job and carries settings made by hand in
the Keycloak UI. A create-or-update would flatten them, so this one only replaces the secret, and
fails if the client is missing.

The [Vault Secrets Operator][vso] renders the Vault path as the `Secret` that the chart's
`gitea.oauth[].existingSecret` points at:

[vso]: https://developer.hashicorp.com/vault/docs/platform/k8s/vso

```nix
# services/forgejo.nix
kubernetes.resources.vaultstaticsecrets.forgejo-oauth-keycloak = {
  metadata.namespace = ns;
  spec = {
    vaultAuthRef = "vault/default";
    mount = "secret";
    path = "forgejo/oauth-keycloak";
    type = "kv-v2";
    refreshAfter = "30s";
    rolloutRestartTargets = [ { kind = "Deployment"; name = "forgejo"; } ];
    destination = { name = "forgejo-oauth-keycloak"; create = true; overwrite = true; };
  };
};
```

The machinery behind that Job, and the way its idempotency check can rotate a secret out from
under a running pod, is in [A Vault Job](/articles/a-vault-job).

## 29 dead runners

Forgejo Actions ran on a `forgejo-runner` Deployment with three replicas and docker-in-docker as a
sidecar. Each pod registered itself on start:

```bash
if [ ! -f .runner ]; then
  forgejo-runner -c /config.yaml register --no-interactive \
    --instance "$FORGEJO_URL" \
    --token "$FORGEJO_RUNNER_TOKEN" \
    --name "$POD_NAME" \
    --labels "ubuntu-latest:docker://node:20-bookworm,nixos:docker://..."
fi
forgejo-runner -c /config.yaml daemon
```

`.runner` holds the runner's identity, and `/data` was an `emptyDir`. Every replaced pod lost it,
registered a new runner, and left the old row behind for good. That is three dead rows per rollout,
and 29 in the table today.

`forgejo forgejo-cli actions register` takes a fixed secret and is idempotent on it, so a replaced
pod re-attaches to its existing row. The runner that replaced dind registers that way, and it is one
row, id 30, across three replicas. The dind Deployment is still in `forgejo.nix` at `replicas = 0`
as the rollback. The new runner has a post of its own, [Evaluating the Kubernetes-native Forgejo CI
runners](/articles/evaluating-the-kubernetes-native-forgejo-ci-runners).

## Crawler attack: 16GiB tarballs

On 2 October the site answered with Envoy's `upstream connect error`. The pod had crashlooped 446
times on `no space left on device`. The 20Gi volume was full, and `/data/repo-archive` for one
repository held 16.2G in 1483 files written over two days.

Envoy's access logs in Loki showed 25,106 archive requests on 29 September and 19,704 the day
after. The user agents rotated through desktop Chrome strings. The client walked every branch and
tag in `.zip`, `.tar.gz` and `.bundle`. Most requests failed at the gateway, but Forgejo finished
generating each archive anyway, so most of the 16.2G was written for nobody.

Forgejo's `archive_cleanup` cron defaults to daily, and a full disk keeps it from running.

The first fix was to delete the archives and the 1688 `repo_archiver` rows that pointed at them,
including 206 left mid-generation, so Forgejo would not advertise files that are gone, then restart
it and grow the volume:

```diff
         persistence = {
-          size = "20Gi";
+          size = "40Gi";
```

I expected the Hetzner CSI driver to grow the filesystem online, but it didn't; the claim sat in
`FileSystemResizePending` until the pod restarted.

The next day archives were pruned hourly, and the day after they were gone:

```nix
# services/forgejo.nix
repository = {
  DISABLE_DOWNLOAD_SOURCE_ARCHIVES = true;
};
"cron.archive_cleanup" = {
  SCHEDULE = "@hourly";
  OLDER_THAN = "2h";
};
```

Nobody here downloads source tarballs. The setting rejects GET and POST on the whole `/archive`
route group, so a request never reaches the generator.

In between, the crawler came back. The disk held at 10%, but the pod was OOMKilled 26 times at a
1Gi limit. One archive measured about 80 MB of memory, and Forgejo generates them one at a
time, so archives alone did not explain it. Every page view forks git inside the same cgroup:

```diff
           limits = {
-            memory = "1Gi";
+            memory = "2Gi";
           };
```

## Green builds recorded red

On 18 October I asked why CI for an unrelated project had failed on every run since the 14th.
Running the same workflows locally on the same commit passed.

The runner logs said `unable to send final job logs and status: All attempts fail`, nine 503s and a
504. The jobs had passed, but the runner could not report it, and a run whose report never arrives
is recorded as a failure.

A crawler was back on the same repository, on a different set of pages. `blame`, `commit`,
`commits` and `src` each fork git and walk history, and at the gateway they took 3.5 to 7.5 seconds
apiece. One sampled window had 408 requests in 24 seconds, peaking at 34 a second. Forgejo sat at
1.9 cores against a 250m request, its node at 100%, and it failed its readiness check. The Actions
API is served by the same process.

Forgejo's default `robots.txt` already disallows `/*/*/src/`, and the crawler requested it 104
times in those 24 seconds, so the limit sits in [Envoy Gateway][eg]:

[eg]: https://gateway.envoyproxy.io/docs/tasks/traffic/local-rate-limit/

```nix
# services/forgejo.nix
kubernetes.resources.backendtrafficpolicies.forgejo-expensive-pages = {
  metadata.namespace = ns;
  spec = {
    targetRefs = [
      {
        group = "gateway.networking.k8s.io";
        kind = "HTTPRoute";
        name = "forgejo";
      }
    ];
    rateLimit = {
      type = "Local";
      local.rules = [
        {
          clientSelectors = [
            {
              path = {
                type = "RegularExpression";
                value = "/[^/]+/[^/]+/(blame|commit|commits|src|raw)/.*";
              };
            }
          ];
          limit = { requests = 60; unit = "Minute"; };
        }
      ];
    };
  };
};
```

After the apply, Forgejo went from 1871m to 305m and the node from 100% to 50%. Sixty a minute is
two orders of magnitude above a person browsing and one under what took the instance down.

The limit is per path, not per client. The Hetzner load balancer sends no PROXY protocol, so every
request arrives with a node or pod address in `x-forwarded-for`, and the bucket is shared. A reader
can be refused while a crawl runs, which I prefer to an instance that falls over.

What the test protects is that the pattern never catches a clone or a runner:

```nix
# lib/tests.nix
(it "bounds the page families that fork git" [
  (has "BackendTrafficPolicy" "forgejo-expensive-pages")
  (eq "Local" (field "BackendTrafficPolicy" "forgejo-expensive-pages" ".spec.rateLimit.type"))
  (notMatches "(info/refs|git-upload-pack|api)" (
    field "BackendTrafficPolicy" "forgejo-expensive-pages"
      ".spec.rateLimit.local.rules[0].clientSelectors[0].path.value"
  ))
])
```

## Volumes only grow

The cluster was three control planes, three workers and a load balancer across hel1, fsn1 and nbg1,
and it is shrinking toward one location. Forgejo's volume was 40Gi holding 5.5G, and since a
Hetzner volume cannot shrink, shrinking means a new claim and a copy.

On the evening of 18 October:

1. Record bytes and a hash of `/data` as a baseline.
2. Scale Forgejo to 0.
3. Create a 10Gi claim `gitea-data` on `hcloud-volumes`.
4. Run a busybox Job pinned to the hel1 node, mounting both claims.
5. Compare sha256 per file with both sides quiesced.
6. Point the chart at the new claim, deploy, check for HTTP 200, delete the old volume.

The copy took about a minute and a half:

```bash
tar -C /src -cf - . | tar -C /dst -xf -
```

The baseline was off by 641 bytes, because I took it with Forgejo still running. The second
comparison, with nothing writing to either side, came out:

```console
src bytes=5919382292
dst bytes=5919382292
BYTES MATCH
ALL 3638 FILES IDENTICAL
```

The chart supports `claimName`, so the claim name is what selects the volume:

```diff
           persistence = {
-            size = "40Gi";
+            claimName = "gitea-data";
+            size = "10Gi";
```

Downtime was six to seven minutes. The new volume is 9.7G with 5.6G used, its PV pinned to
`csi.hetzner.cloud/location=hel1`. It saves 30 GB, about EUR 1.72 a month; across the downsizing,
volumes went from 520 GB to 190 GB.

## The deploy that turned on backups

The same `just service-deploy forgejo` also shipped CNPG backup config that was staged in the
repository and not meant to go out yet. It enabled WAL archiving to a bucket that did not exist.
`forgejo-pg` reported `ContinuousArchivingFailing`, and Postgres retains WAL when archiving fails,
until the volume fills.

That lasted about four minutes before `spec.backup` came off the live cluster. Backups are now
opt-in in the builder:

```nix
# lib/pg-backup.nix
# Off by default. See the header: the bucket has to exist first.
backup ? false,
```

The volume move and the backup config were unrelated changes that shared a file.

## Still open

- Nothing alerted on any of the three outages. Every alert in the cluster routes to a null receiver.
  `KubePersistentVolumeFillingUp` fired into nothing while the volume filled, and CI failed for six
  days before I asked why.
- Per-client rate limiting needs PROXY protocol on the load balancer. The gateway already accepts it
  as optional, so switching it on is a change on the Hetzner side, and then the rule gains a
  `sourceCIDR` and the limit can rise.
- The dind Deployment is still at `replicas = 0`, and the 29 offline runner rows are still in the
  table.
