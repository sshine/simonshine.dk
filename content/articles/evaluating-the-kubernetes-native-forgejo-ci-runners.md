+++
date = '2026-10-25T13:19:41+01:00'
draft = true
title = 'Evaluating the Kubernetes-native Forgejo CI runners'
tags = ['nix', 'kubernetes', 'kubenix', 'forgejo']
+++

Until 9 October, CI for my [Forgejo][fj] ran in docker-in-docker: [forgejo-runner][fjr] 6.3.1
with a privileged `docker:29.3.1-dind` sidecar, three replicas. Since then every job runs as a
Kubernetes Job, through the execution-backend protocol that [forgejo-runner v13.1.0][v13] added on
31 August.

A few people have asked what that is like to run for real. Two weeks and 54 tasks in, this is
what I know. The Forgejo side of the same cluster is in [Running Forgejo on a Hetzner Kubernetes
cluster](/articles/running-forgejo-on-a-hetzner-kubernetes-cluster).

[fj]: https://forgejo.org
[fjr]: https://code.forgejo.org/forgejo/runner
[v13]: https://code.forgejo.org/forgejo/runner/releases/tag/v13.1.0

## tl;dr

- forgejo-runner v13.1.0 talks gRPC to an execution backend over a socket. The protocol is
  `plugin.v1alpha`. I run eleboucher's [runner-k8s-plugin][k8sp] as a native sidecar, chart 13.2.1.
- Leaving dind took one job from 266s to 126s and another from 294s to 227s.
- The reason to leave was cgroups. dind's job containers sat beside `kubepods` with no `memory.max`,
  and [Talos][talos]' OOM controller killed [Cilium][cilium] instead of the build.
- Job containers are still privileged, because the nix sandbox has to remount `/proc`.
  `sandbox-fallback = false` makes a lost sandbox fail instead of building impurely.
- Three replicas at capacity 1, one job per node by required anti-affinity, memory requested at a
  2Gi limit, `CARGO_BUILD_JOBS` and `NIX_BUILD_CORES` at 2.
- 2Gi is not enough for `nix flake check` on one Rust project. Lifting the cap brings back the
  Cilium kills.

[k8sp]: https://git.erwanleboucher.dev/eleboucher/runner-k8s-plugin
[talos]: https://www.talos.dev
[cilium]: https://cilium.io

## One Job per job

The plugin architecture lives entirely in the runner. The Forgejo server knows nothing about it;
mine is 15.0.3, and v13 worked against it when I registered a runner from my laptop first. v13 also
drops `set-output`, `set-env`, `add-path` and the `DOCKER_USERNAME`/`DOCKER_PASSWORD` auth.

The backend turns each job into a `batch/v1` Job. Its `main` container sleeps, and the daemon
execs every step into it:

```go
// k8s_pod.go
job.Spec.Template.Spec.RestartPolicy = corev1.RestartPolicyNever
job.Spec.BackoffLimit = new(int32)
*job.Spec.BackoffLimit = 0
```

Kubernetes never retries a failed job. Steps share a `/shared` emptyDir with a size limit.

The plugin's author publishes a Helm chart. I vendor it like every other chart in the cluster:

```toml
# charts.toml
[forgejo-runner]
oci = "oci://git.erwanleboucher.dev/eleboucher/charts/forgejo-runner"
chart = "forgejo-runner"
version = "13.2.1"
```

The chart runs the plugin as an `initContainer` with `restartPolicy: Always`, a native sidecar
that starts before the runner and stops after it, so the socket outlives a draining job. Its
`Role` is small:

```yaml
# charts/forgejo-runner/templates/rbac.tpl
rules:
  - apiGroups: ["batch"]
    resources: ["jobs"]
    verbs: ["create", "get", "list", "watch", "delete"]
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources: ["pods/exec"]
    verbs: ["create", "get"]
  - apiGroups: [""]
    resources: ["pods/log"]
    verbs: ["get", "list", "watch"]
```

## Rendering the chart

[kubenix][kubenix] renders the chart with `chart2json`. The daemon is the official image. The
plugin image is copied into the cluster's own registry with `skopeo`, so a pod start does not
depend on someone else's forge.

```nix
# services/forgejo-runner-k8s.nix
values = {
  replicaCount = 3;
  forgejo.existingSecret = "forgejo-runner-k8s-registration";
  image = {
    repository = "data.forgejo.org/forgejo/runner";
    tag = "13.2.0";
  };
  plugin.image = {
    repository = pluginImage;
    tag = "13.2.1";
  };
  inherit runnerConfig podSpecs;
  # The chart's default assumes stakater/reloader, which this cluster does not run.
  deploymentAnnotations = { };
  podAnnotations."config/hash" = builtins.hashString "sha256" (
    runnerConfig + builtins.toJSON podSpecs
  );
};

objects = builtins.fromJSON (
  builtins.readFile (
    kubenix.lib.helm.chart2json {
      inherit chart values;
      name = "forgejo-runner-k8s";
      namespace = ns;
    }
  )
);
```

The templates leave `metadata.namespace` out, which `helm install --namespace` forgives and a
manifest applied as a whole does not:

```nix
kubernetes.objects = map (o: lib.recursiveUpdate o { metadata.namespace = ns; }) objects;
```

[kubenix]: https://github.com/hall/kubenix

## Podspecs are Nix

Each label points at a PodSpec file. The plugin reads it with a YAML parser, and JSON is YAML, so
the podspecs stay structured Nix until they reach the ConfigMap. That lets the tests assert on them.

```nix
# services/forgejo-runner-k8s.nix
mkPodSpec = spec: builtins.toJSON (spec // { restartPolicy = "Never"; });

podSpecs."podspec-nixos.json" = mkPodSpec {
  affinity = jobAntiAffinity;
  containers = [
    {
      name = "main";
      image = jobImage;
      imagePullPolicy = "Always";
      securityContext.privileged = true;
      resources = jobResources;
      env = jobEnv;
    }
  ];
};
```

The ubuntu podspec is the same with `node:20-bookworm`.

## runner.yaml

The labels map names to podspecs, and the plugin section names the socket:

```yaml
runner:
  capacity: 1
  timeout: 3h
  labels:
    - "nixos:k8s:///config/podspec-nixos.json"
    - "ubuntu-latest:k8s:///config/podspec-ubuntu.json"
    - "nixos-k8s:k8s:///config/podspec-nixos.json"
    - "ubuntu-k8s:k8s:///config/podspec-ubuntu.json"
container:
  docker_host: "-"
plugins:
  k8s:
    address: "unix:///plugin/forgejo-runner-k8s.sock"
    options:
      namespace: forgejo
      poll_timeout: 10m
```

The chart sets the sidecar's `--listen` from a value, and the daemon reads its address from this
file. Nothing reconciles the two, and a mismatch is a runner that starts and never claims a job, so
a test compares them.

The `config/hash` annotation came from a mistake. A running daemon keeps the `runner.yaml` it
started with. When I scaled up after changing the labels, old and new pods declared different
labels under one runner id. Hashing the config into the pod template makes a config change a
rollout.

Registration is a shared secret. A just recipe runs `forgejo-cli` inside the Forgejo pod and pipes
the result into Vault without it passing through my terminal:

```bash
forgejo forgejo-cli actions generate-secret > "$f"
uuid=$(forgejo forgejo-cli actions register --name forgejo-runner-k8s \
  --labels nixos-k8s,ubuntu-k8s --secret-file "$f")
```

A `VaultStaticSecret` renders `uuid` and `token` as the Secret the chart mounts, and the daemon
starts with `--uuid` and `--token-url file://...`. Registration is idempotent on the secret, so a
replaced pod reattaches to its row instead of adding an offline one.

## Against dind

The plugin ran beside dind on `-k8s` labels for a day. The smoke test passed in 224s against 266s
on dind, including a full pull of a freshly published job image. That evening it took over `nixos`
and `ubuntu-latest`, and dind went to `replicas = 0` as the rollback. No job had needed a docker
daemon: images are built with `skopeo` transports, and the old config already set `docker_host:
"-"`.

| Job            | dind | plugin |
|----------------|------|--------|
| test-image     | 266s | 126s   |
| build-and-push | 294s | 227s   |

Speed was not the reason. On 9 October a Rust `nix build`, about 2.4 GiB, pushed one worker into
memory pressure, and Talos v1.12's userspace OOM controller killed five pod cgroups in four
seconds. Cilium went second, and the node had no CNI for about four minutes.

A privileged container shares the host cgroup namespace, so dockerd created job containers at
`/sys/fs/cgroup/docker/<id>`, a sibling of `kubepods`, with `memory.max = max`. Talos ranks only
children of `kubepods`, with this default:

```text
memory_max.hasValue() ? 0.0 : weight[class] * memory_current
```

The build was never a candidate, and priority classes do not enter into it. Cilium has no memory
limit, so it scores on usage alone. On that worker it was the victim in 6 of 27 retained OOM
actions. The kernel OOM killer never ran.

A Job sits in `kubepods` under a `memory.max`, which the controller reads. The dind rollback got
the same fix, in case it is ever needed:

```bash
# services/forgejo.nix, the dind sidecar's command
cg=$(sed -n 's|^0::||p' /proc/self/cgroup)
case "$cg" in
  /kubepods/*/pod*/*) ;;
  *) echo "dind: $cg is not a pod cgroup" >&2; exit 1 ;;
esac
exec dockerd-entrypoint.sh --cgroup-parent="${cg%/*}"
```

## The sandbox still wants privileged

Dropping `privileged` from the job containers was part of the swap. A local build passed without
it. The next day a Rust project's CI failed:

```console
error: home directory "/homeless-shelter" exists; please remove it to assure purity of builds without sandboxing
error: recipe `image` failed on line 135 with exit code 1
⚙️ [runner]: plugin exec: exit code 1
```

That local build had passed unsandboxed. `sandbox-fallback` defaults to true, so without privilege
nix built impurely, said so only at debug level, and cargo wrote to `$HOME`. With `--debug`:

```console
PID namespaces do not work on this system: cannot remount /proc
```

Kubernetes masks paths under `/proc` in unprivileged containers. `SYS_ADMIN` alone does not lift
the mask. `procMount: Unmasked` does, but requires `hostUsers: false`, and in a pod user namespace
the sandbox's `pivot_root` fails with `EPERM`. So both podspecs are privileged again, and the job
image refuses to build without a sandbox:

```ini
# nix.conf in the job image
sandbox = true
sandbox-fallback = false
```

A privileged container in an ordinary pod is still in `kubepods` under its limit. dind's problem
was the cgroup its daemon escaped to, not the privilege alone.

## Rough edges

- The protocol is alpha and the plugin is a third party. That is why dind still exists at zero
  replicas.
- Three replicas share one runner uuid, and Forgejo shows one row, id 30. It works. The 29 rows
  from dind's register-on-start days are still listed.
- Each job ends with a burst of `Websocket Ping failed ... use of closed network connection` from
  client-go tearing down the step's exec stream. A healthy run reads like a broken one.
- The runner logs `failed to fetch task` on a DNS hiccup or a 504, and carries on.
- Idle, each pod uses 10 to 21Mi for the runner, 9 to 15Mi for the plugin, and about 1m CPU.
- The namespace is still `pod-security: privileged`, which the job pods now need.

Two failures came from the server side and hit this runner like any other. Copying an Actions
secret row in Postgres made `FetchTask` panic for every runner for 13 minutes 37 seconds, because
the ciphertext is bound to the row id. And a crawler that saturated Forgejo kept runners from
reporting final status, so passing release runs were recorded as failures for six days. That one
is in the Forgejo post.

## One job per node

Two replicas at capacity 2 ran every job on the same worker. The daemon's node does not decide
where its jobs run, and the job pods had no affinity. Now each job takes a node:

```nix
# services/forgejo-runner-k8s.nix
jobResources = {
  requests = { cpu = "500m"; memory = "2Gi"; };
  limits = { cpu = "2"; memory = "2Gi"; };
};

jobEnv = [
  { name = "CARGO_BUILD_JOBS"; value = "2"; }
  { name = "NIX_BUILD_CORES"; value = "2"; }
];

jobAntiAffinity.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution = [
  {
    topologyKey = "kubernetes.io/hostname";
    labelSelector.matchLabels."app.kubernetes.io/managed-by" = "forgejo-runner";
  }
];
```

Memory is requested at the limit because the scheduler places on requests. CPU is burstable,
because over a CPU limit a build is throttled, and over a memory limit it is killed. 2Gi because no
worker had 3Gi free. Cargo and nix size their parallelism from the node's cores, not the cgroup's,
and peak memory follows the job count.

Anti-affinity is required, not preferred, since a preference is dropped exactly when the node is
full. Capacity went to 1 with three replicas, one per worker. A pending pod would queue fine, but a
runner claims the task before its pod exists, and the task's 3h clock starts then. Accepting only
what can start keeps the queue in Forgejo.

The tests read every podspec the ConfigMap carries, not a list of known ones:

```nix
# lib/tests.nix
(it "requests the memory ceiling it may grow into" (empty ''
  .items[] | select(.kind == "ConfigMap" and .metadata.name == "forgejo-runner-k8s-config")
  | .data | to_entries[] | select(.key | startswith("podspec-"))
  | .key as $file | (.value | fromjson).containers[]
  | select(.resources.requests.memory != .resources.limits.memory)
  | "\($file): \(.name)"''))

(it "accepts no more tasks at once than there are nodes to run them" [
  (matches "capacity: 1" (field "ConfigMap" "forgejo-runner-k8s-config" ''.data["runner.yaml"]''))
  (eq "3" (field "Deployment" "forgejo-runner-k8s" ".spec.replicas"))
])
```

Others check that every job container bounds CPU and memory, that the anti-affinity is required on
hostname, and that both parallelism variables are set.

## Where 2Gi ends

Of the 54 tasks since 9 October, 29 succeeded, 23 failed and 2 were cancelled. Most of the failures
are one Rust project. Recent work is light, and a site build finishes in about a minute.

That project's `check` job runs `nix flake check` over a crate2nix build: clippy, unit tests, and
an integration derivation with Postgres in the sandbox. It has failed on every run on this runner.
Each ends in `plugin exec: exit code 137`, then `container not found ("main")`.

In a pod built from the same podspec it was OOMKilled at the 2Gi limit after about five minutes.
`memory.oom.group` is 1 on the container, so one OOM kill takes the whole container, and every
later exec finds it gone. The same commit passes `nix flake check` on a workstation, and its
`release` job passes on this runner. Nothing alerted on any of it.

2Gi is not enough to compile this project. Removing the cap brings back the build that takes
Cilium with it. Running anything on Kubernetes comes down to estimating resource bounds well and
working inside them, and this runner makes that estimate for every repository at once.
