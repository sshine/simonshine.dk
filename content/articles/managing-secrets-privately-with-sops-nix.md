+++
date = '2026-05-15T02:37:41+02:00'
draft = false
title = 'Managing Secrets privately with sops-nix'
tags = ['nix', 'kubenix', 'secrets']
+++

## tl;dr

- I want to commit my secrets encrypted to git with [sops-nix][sops-nix]
- I want to publish my infra-as-code, but don't want to publish my git secrets
- So I put my secrets in a private `git+file` flake input

## Motivation

I run Kubernetes clusters managed declaratively with [Talos Linux](https://www.talos.dev/) and [kubenix](https://github.com/hall/kubenix). I want to publish the entire repository that defines the cluster. It includes commands that require authentication (`kubectl`, `talosctl`, `hcloud`, etc.) that don't work without their secrets.

This is where a sane developer would reach for a password manager: [ProtonPass][protonpass] for a SaaS solution, [GNU pass][pass] for self-management, or perhaps the more modern [Passage][passage] which forks GNU pass and uses [age][age] for encryption.

But I want my infrastructure-as-code to be self-contained, including secrets management. The secrets manager and the secrets should be committed to git. When I clone my project on a new machine, I will realize the passwords are nowhere to be found, I'll need to rewire them, relearning how to do that.

With Nix, one of the most popular ways to achieve GitOps secret management is with [sops-nix][sops-nix]: Encrypt your secrets inside git using the [sops][sops] encryption system, let the Nix wrapper handle secrets references in your infra code. This lets me build command wrappers exposed in a devshell where the secret is bundled into the binary, but only decrypted in memory.

[sops-nix]: https://github.com/Mic92/sops-nix
[sops]: https://github.com/getsops/sops
[protonpass]: https://proton.me/pass
[pass]: https://www.passwordstore.org/
[passage]: https://github.com/FiloSottile/passage
[age]: https://github.com/FiloSottile/age

A recent blog post by [Isabel: NixOS and Secrets](https://isabelroses.com/blog/nixos-and-secrets/) (May 8, 2026) gives a good low-level introduction to the use of [sops-nix](https://github.com/Mic92/sops-nix) and also compares [agenix](https://github.com/ryantm/agenix). I haven't used agenix, but judging by this blog post, it's probably a better fit than sops-nix. This blog post mentions [git-crypt](https://github.com/AGWA/git-crypt) for historical reasons and discourages using it without unpacking that advice too much. I need the Nix wiring anyways.

I similarly did a Nix + secrets management deep dive when I started using Nix 3 years ago and found every solution difficult to use. In particular, I really liked [Secrix][secrix] because it has a cool-sounding name and because it lets me embed in-memory secrets into systemd services for exactly the lifetime of the service. But man is it difficult to set up. If only [Vimjoyer's NixOS Secrets Management | SOPS-NIX](https://www.youtube.com/watch?v=G5f6GC7SnhU) video had been out then.

[secrix]: https://github.com/Platonic-Systems/secrix
[secretspec]: https://discourse.nixos.org/t/announcing-secretspec-declarative-secrets-management/67021

So... there's only one more constraint that is the motivation for this entire blog post:

## I don't want to publish my encrypted secrets!

Sure, they're encrypted.

But I've worked with post-quantum cryptography, and I just don't think writing your secrets in code on your outer wall is the same as not telling people your secrets. Call me paranoid. But a secret not shared is ultimately safer than one that is encrypted and shared. Philosophically, a secret is something people don't know how exists. Putting it on display feels like an invitation for people to eventually break it.

So here are my design constraints:

1. I want to commit my secrets, encrypted, to git.
2. I want to publish everything but the secrets.
3. I want the repository to be operational just by cloning my repo(s).

## Two Nix flakes: a public one, and a private one

The structure I settled on is two flakes in each their repo:

- `kubenix-cluster/` -- the public flake. `flake.nix`, `services/*.nix`, `lib/*.nix`. Safe to publish.
- `kubenix-secrets/` -- the private secrets flake, also cloned as `kubenix-cluster/secrets/` — a separate git repository nested inside, with its own `flake.nix`. Holds sops/age-encrypted YAML files. Never published.

The nested repo is wired into the parent as a `git+file` flake input. This keeps the integration inside Nix's input system rather than in ad-hoc bash. The setup took a couple of evenings to land cleanly because Nix's purity rules around git-backed flakes have a couple of edges.

## The two flakes

The parent `kubenix-cluster` flake declares one extra input:

```nix
# flake.nix
kubenix-secrets.url = "git+file:./secrets";
kubenix-secrets.inputs.nixpkgs.follows = "nixpkgs";
kubenix-secrets.inputs.flake-parts.follows = "flake-parts";
kubenix-secrets.inputs.devshell.follows = "devshell";
```

*(Sorry about the [input deduplication][input-dedup]; I swear it's a phase in my life I'll get past.)*

[input-dedup]: https://discourse.nixos.org/t/flake-lock-duplicates-and-transitive-dependencies-why/71174

The `kubenix-secrets/flake.nix` exposes two things to consumers:

```nix
flake = {
  lib.secrets = {
    argocd-admin = ./secrets/argocd-admin.yaml;
    hcloud-token = ./secrets/hcloud-token.yaml;
    kubeconfig   = ./secrets/kubeconfig.yaml;
    talosconfig  = ./secrets/talosconfig.yaml;
    vault        = ./secrets/vault.yaml;
    # ...
  };

  flakeModules.default = {
    imports = [ inputs.devshell.flakeModule ];
    perSystem = { pkgs, system, ... }: {
      devshells.default.packages = [
        pkgs.sops
        pkgs.age
        inputs.sops-nix.packages.${system}.default
      ];
    };
  };
};
```

1. **`lib.secrets`** is a map from logical name to file path. Consumers receive paths to *encrypted* files, never plaintext. That means the parent flake can reference `inputs.kubenix-secrets.lib.secrets.kubeconfig` at Nix-eval time without any decryption happening. Decryption is a runtime concern. This is important, as Isabel points out: assume that the Nix store is world readable.

2. **`flakeModules.default`** is the parent's hook for getting sops/age/sops-nix into its [devshell](https://github.com/numtide/devshell). Importing it is one line in `lib/secrets.nix`:

   ```nix
   { inputs, ... }: {
     imports = [ inputs.kubenix-secrets.flakeModules.default ];
   }
   ```

   The parent repository doesn't need to know which packages the secrets flake wants in the shell — it just imports the module and the right binaries appear.

## Wrapping commands with sops

Every command that needs a decrypted artifact gets a thin devshell wrapper. The pattern:

```nix
{
  name = "kubectl";
  help = "kubectl with sops-decrypted kubeconfig";
  command = ''
    tmp=$(mktemp --tmpdir=/dev/shm kubeconfig.XXXXXX)
    trap 'rm -f "$tmp"' EXIT
    ${lib.getExe pkgs.sops} decrypt "${secrets.kubeconfig}" > "$tmp"
    KUBECONFIG="$tmp" ${lib.getExe pkgs.kubectl} "$@"
  '';
}
```

This needs a bit of unpacking:

- **`${secrets.kubeconfig}`** interpolates to a `/nix/store/...-kubenix-secrets-source/secrets/kubeconfig.yaml` path at Nix-eval time. The encrypted file is copied into the Nix store as part of evaluating the secrets flake, so the wrapper doesn't depend on the working tree at runtime.
- **`mktemp --tmpdir=/dev/shm`** keeps the decrypted plaintext on tmpfs — in RAM, never written to disk.
- **`trap ... EXIT`** unlinks the plaintext the moment the wrapper exits, even on Ctrl-C or error.
- **`${lib.getExe pkgs.kubectl}`** bakes the absolute store path of kubectl into the wrapper. The wrapper does not depend on `kubectl` being on `$PATH` — useful when the wrapper is invoked from a script or hook that doesn't have the devshell environment loaded.

When writing this blog post, I realize that I could probably skip `/dev/shm` and just pipe kubeconfig into stdin via `kubectl --kubeconfig=-`.

The same shape applies to `hcloud` and `talosctl`. For `hcloud` the wrapper extracts a single field from a YAML secret via `yq`:

```nix
command = ''
  token=$(${lib.getExe pkgs.sops} decrypt "${secrets.hcloud-token}" \
            | ${lib.getExe pkgs.yq-go} -r .hcloud_token)
  HCLOUD_TOKEN="$token" ${lib.getExe pkgs.hcloud} "$@"
'';
```

Worth noting: `pkgs.kubectl` is not in the devshell's `packages = [ ... ]` list -- only the wrapper exists. That way `which kubectl` always finds the wrapper, never a raw binary that would silently try to read `~/.kube/config` and surprise me with stale credentials.

## Some gotchas

Quick gotcha summary:

1. Flake inputs with `path:...` are problematic when secrets live outside the main git repo
2. Flake inputs with `git+ssh:...` are problematic when sandboxed AI agents don't have access to your SSH key
3. For sops-nix to work, `~/.config/sops/age/keys.txt` is similarly problematic for sandboxed AI agents

The parent flake is git-backed (`git+file:///.../kubenix-cluster`). Nix enforces a rule for git flakes: **every path the flake reads must be visible to git in the index**. Untracked files are invisible at evaluation, even if they exist on disk.

I wanted to reference a private self-hosted remote copy of `kubenix-secrets`, i.e. `git+ssh`, but ran into problems with SSH keys and my AI agent's sandbox: Using my [bubblebox](https://github.com/nix-tools/bubblebox) fork of [numtide's claudebox](https://github.com/numtide/claudebox), my AI agent gets indirect access to project-local secrets via pre-authenticated commands like `kubectl`, `talosctl` and `hcloud`. But it doesn't get free access to my SSH keys used outside of this project.

The natural-looking declaration for the sub-repo is:

```nix
kubenix-secrets.url = "path:./secrets";
```

Nix rejects this:

```
error: Path 'secrets/flake.nix' in the repository ".../kubenix-cluster" is not tracked by Git.

To make it visible to Nix, run: git -C ".../kubenix-cluster" add "secrets/flake.nix"
```

But I can't `git add secrets/`. `secrets/` is itself a git repository (it has its own `.git`), so git records a **gitlink** — the submodule SHA — not the file contents. Nix still can't read through the parent's index to the inner files. I've added something to the index, but not the something Nix needed.

The fix is to stop pretending `secrets/` is a directory of files in the parent repo and treat it as what it actually is: a separate flake on the filesystem.

```nix
kubenix-secrets.url = "git+file:./secrets"; # or: "git+file:../kubenix-secrets"
```

With `git+file:` Nix evaluates the secrets repo via its own `.git/HEAD`. The parent's index is irrelevant — there's no cross-repo tracking check anymore. The trade-off is that **untracked or unstaged changes inside `secrets/` are invisible to Nix until they're at least staged in the inner repo**. In practice that's the right default for a secrets workflow: rotation should be deliberate. But it is an annoying gotcha in itself that flake users have learned to internalize.

A related sandboxing wrinkle has the same shape. `sops` by default reads its recipient age key from `~/.config/sops/age/keys.txt`. Inside bubblebox, `~/.config/` is host territory and isn't bound in, so when the agent invokes the `kubectl` wrapper, `sops decrypt` runs successfully but can't find a key and bails. Same problem as the SSH keys — a path the host shell takes for granted simply does not exist inside the sandbox.

The quick workaround is to plumb the key in via an environment variable, set in the devshell itself:

```nix
# lib/devshell.nix
devshells.default.env = [
  {
    name = "SOPS_AGE_KEY";
    eval = "$(cat ~/.config/sops/age/keys.txt)";
  }
];
```

`sops` consults `$SOPS_AGE_KEY` before falling back to the keyring file, so this short-circuits the filesystem lookup entirely.

The reason this works at all is timing. devshell's `env.eval` runs at devshell-activation time, and direnv activates the devshell *outside* the sandbox, in my regular shell, where `~/.config/sops/age/keys.txt` is fully readable. The `cat` happens there; the contents get baked into the activation env; direnv hands that env over to the sandbox. Inside bubblebox the key never has to come from disk — it's just a string sitting in the process environment.

## secrets-example/

The split into two repos is great for keeping plaintext keys out of git history, but it leaves a documentation gap: a reader who clones `kubenix-cluster` can see the wrappers reference `secrets.kubeconfig`, `secrets.hcloud-token`, etc., but they can't see what those files actually look like, or how to set those things up.

So alongside the real `kubenix-secrets/` repo I'm publishing a public `kubenix-secrets-example/` directory in the parent -- same set of filenames, same `.sops.yaml`, same directory layout, but encrypted to a throwaway age key checked into the repo. Anyone reading the public version can decrypt it locally, inspect the YAML structure, and understand the wiring.

## Future directions

The goal of this setup is that I can share my kubenix config, repeat the setup elsewhere, and stay true to GitOps without sharing my secrets. I do need to clone a second repo, but I can document this repo publicly without revealing it.

Where this solution falls short:

I briefly mentioned AI agents. In the interaction between AI agents and production secrets, there really only is one good solution: proxying. I.e. the agent operates through a sandbox proxy that translates dummy secrets into real ones.

The solution presented in this article only optimistically prevents agents from reading secrets by embedding them in pre-authenticated command wrappers. Ask your agent to modify secrets management, or add a secret, and it might easily read your command wrapper, decrypt the secret, and whoopsie.

Making such a proxy is just a matter of work. It needs to be application-specific because all CLIs and APIs embed secrets differently. Embedding such a proxy into a GitOps workflow means: Ensuring it is running when entering your devshell, decrypting secrets at rest into the proxy, exposing the proxy within the agent sandbox, and making the command wrappers use the proxy with dummy secrets that don't need to be encrypted.

I have an idea how to do this with nested Linux user namespaces: When entering a sandbox, one namespace layer decrypts the secrets and starts the proxy, another namespace layer does the typical sandboxing by hiding everything but the project directory, the few necessary ~/ resources like ~/.claude, and adds the proxy to this list.

I'm still very eager to explore Linux user namespaces as a technical solution, but I was recently awoken by [Linux user namespaces being completely disabled on Talos Linux by default for security reasons](https://discourse.nixos.org/t/sandbox-true-requires-linux-user-namespaces-what-gives/77519).

In doing research for this article, I also encountered Domen's [SecretSpec][secretspec]: a way to specify what secrets your project depends on in a secrets-manager-agnostic way that provides a way to initialize those secrets. Since I don't have as good a story as `secretspec init`, and since I'm tied to a single secrets manager, this seems like a valuable addition. In fact, [adding "providers" to SecretSpec seems to be an ongoing activity this year](https://github.com/cachix/secretspec/issues), albeit sops/sops-nix is still missing from the list.

This is the most satisfying part of working with Nix: It does feel like we're closer to reaching the singularity because of the high alignment in the shared mindspace.
