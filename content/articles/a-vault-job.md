+++
date = '2026-10-10T13:04:12+02:00'
draft = false
title = 'A Vault Job'
tags = ['nix', 'kubernetes', 'secrets', 'kubenix']
+++

When deploying software services, they usually link to other services using long-lived static
credentials (API keys or passwords). For example, a web application and its database, or an LLM
provider access token. When the service supports it, those long-lived static credentials can be
replaced with short-lived tokens obtained through OIDC-based workload identity federation, with
access controlled by RBAC.

I've been tinkering a lot with OIDC and RBAC recently because I'm handing over responsibility that
can't be tied to my identity. But before I get there with everything that I run, here's a writeup of
what I've been doing in the past year with long-lived static credentials that makes secrets rotation
possible.

The approach in this blog post is valuable when the transition to OIDC and RBAC for internal
services is still too abstract, or you have no choice.

## Internal and external secrets

A secret is internal when it is issued by you to connect to another service hosted by you

A secret is external when it is issued by a 3rd party to connect to a 3rd party service

This dichotomy can, of course, be further complicated by organizational structures with more than
one set of walls in the building. The class of secrets that I really address here are ones that can
programmatically be altered.

Internal secrets can typically be altered by running a program inside your infrastructure that reads
and updates the secret. External secrets can often not easily be re-issued automatically:

1. In unlikely cases, the external service has an endpoint that lets you deprecate and re-issue a secret.
2. Most often, this is hidden behind a web-based dashboard for human fingers and copy-pasting.
3. Sadly, sometimes you need to call a person on the phone or write them an email to rotate a secret.

It is very hard to rotate secrets that require humans in the loop, so this post focuses entirely on
when you're in control, because the service is internal, and as a consequence, you can do the same
in the unlikely case that your external endpoint allows it. I have never actually seen this happen
outside of major cloud providers.

## Nobody needs to know

The tl;dr:

- A Kubernetes `Job` generates the secret in-cluster and writes it to Vault.
- It never appears on my laptop, in git, or in a password manager / keyring.
- The `Job` is idempotent: it checks whether the path is populated before writing.
- `Job.spec` is immutable, so the name carries a hash of the script.
- Editing the script makes a new `Job` instead of a rejected apply.
- A `VaultStaticSecret` renders the Vault path back into a Kubernetes `Secret` that pods mount.
- The `Job` is given write access and no read access, which breaks the obvious idempotency check in
  a way that rotates your secret on every deploy.

## Vaults and Secrets

In plain Kubernetes, secrets are stored as [`Secret`][secret], stored unencrypted at rest by default.

[secret]: https://kubernetes.io/docs/concepts/configuration/secret/

[Vault][vault] stores secrets and hands them out to pods. A pod authenticates with its
ServiceAccount token, Vault asks the Kubernetes API whether that token is real, and if a *role* maps
that ServiceAccount to a *policy*, Vault issues a token carrying it.

[vault]: https://developer.hashicorp.com/vault

A policy is path-scoped. This one can write one KV path and read nothing:

```hcl
path "secret/data/incidental/bootstrap" {
  capabilities = ["create", "update"]
}
path "secret/metadata/incidental/bootstrap" {
  capabilities = ["read"]
}
```

`secret/data/...` is the value. `secret/metadata/...` is version info, timestamps, and whether the
path exists at all. On a KV v2 mount they are separate paths with separate capabilities.

## Getting a secret out of Vault and into a pod

To automate the propagation of Vault secrets into Kubernetes `Secret`s, the [Vault Secrets
Operator][vso] (VSO) renders the result as an ordinary `Secret`:

[vso]: https://developer.hashicorp.com/vault/docs/platform/k8s/vso

```nix
kubernetes.resources.vaultstaticsecrets.incidental-bootstrap = {
  metadata.namespace = "incidental";
  spec = {
    vaultAuthRef = "vault/default";
    mount = "secret";
    path = "incidental/bootstrap";
    type = "kv-v2";
    refreshAfter = "30s";
    destination = {
      name = "incidental-bootstrap";
      create = true;
      overwrite = true;
    };
  };
};
```

The pod then reads it like any other `Secret`:

```nix
env = [
  {
    name = "INCIDENTAL_BOOTSTRAP_TOKEN";
    valueFrom.secretKeyRef = {
      name = "incidental-bootstrap";
      key = "token";
    };
  }
];
```

The machinery necessary for that to happen comes in four parts:

### 1. A `VaultAuth` naming the role VSO itself logs in as

```nix
vaultauthmethods.default = {
  metadata.namespace = "vault";
  spec = {
    vaultConnectionRef = "default";
    method = "kubernetes";
    mount = "kubernetes";
    kubernetes = {
      role = "vso";
      serviceAccount = "vault-secrets-operator-controller-manager";
      audiences = [ "vault" ];
    };
    allowedNamespaces = [ "incidental" /* ... */ ];
  };
};
```

A namespace missing from `allowedNamespaces` means VSO refuses to reconcile and says so only in its own logs.

### 2. That same ServiceAccount has to exist in every namespace holding a VaultStaticSecret

VSO mints a token for it locally and logs in with that. One per namespace:

```nix
{
  apiVersion = "v1";
  kind = "ServiceAccount";
  metadata = {
    name = "vault-secrets-operator-controller-manager";
    namespace = "incidental";
  };
}
```

### 3. Vault's own `vso` role has to list the namespace too

`allowedNamespaces` is what VSO permits itself; this is what Vault permits. Miss it and the login is
refused on the Vault side only.

### 4. `destination.overwrite = true` 

An apply never prunes, so a `Secret` deleted from source outlives its own removal, and VSO checks
its ownership labels before every write and refuses one it did not create. Without `overwrite` it
stalls forever on an object not present in git.

Since it's easy to forget any of these, deployment happens across namespaces, and failure is silent,
I've made some property tests on both the Vault side and the application using the secret side that
ensure that they always occur when deploying new things.

TODO: Show kubenix property test examples here.

## The Job

So I've got a setup where VaultStaticSecret is established and correctly propagates to a Secret.

Now I want to make a Job that populates the VaultStaticSecret.

```nix
# services/incidental.nix
imports = [
  (vaultBootstrap.mkRandomSecret {
    namespace = ns;
    name = "incidental-bootstrap";
    vaultPath = "incidental/bootstrap";
    fields.token = 48;
  })
];
```

That renders a ServiceAccount, a ConfigMap, a `Job`, and the `VaultStaticSecret` from earlier. The
ConfigMap holds this:

```sh
#!/bin/sh
set -eu

SA_TOKEN=$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)
VAULT_TOKEN=$(vault write -field=token auth/kubernetes/login \
    role=incidental-bootstrap jwt="$SA_TOKEN")
export VAULT_TOKEN

if vault kv metadata get secret/incidental/bootstrap >/dev/null 2>&1; then
  echo "secret/incidental/bootstrap already populated; nothing to do."
  exit 0
fi

randstr() {
  head -c "$1" /dev/urandom | base64 | tr -d '/+=' | head -c "$1"
}

token_value=$(randstr 48)

vault kv put secret/incidental/bootstrap token="$token_value"
echo "secret/incidental/bootstrap bootstrapped."
```

The value exists for the length of one shell variable in a pod that then exits. I have never seen
it. There is nothing to rotate on laptop loss, nothing to put in 1Password, nothing to forget to
remove from a terminal history.

`randstr` strips `/+=` from base64 so the value survives every config format that consumes it
without quoting. It over-reads before truncating, because stripping those characters shortens the
string.

## `Job.spec` is immutable

You cannot edit a `Job` in place. An apply that changes its spec is rejected. So the name carries a
hash of what the `Job` would run:

```nix
scriptData."bootstrap.sh" = bootstrapScript;

specHash = builtins.substring 0 12 (builtins.hashString "sha256" (builtins.toJSON scriptData));
```

```nix
metadata = {
  name = "${name}-${specHash}";
  inherit namespace;
};
```

Change the script, get a new `Job`. Leave it alone, apply the same one forever. With
`ttlSecondsAfterFinished = 300` the old ones clean themselves up.

This is also why the idempotency check matters. A new `Job` runs against a Vault path that is
already populated, on a service that is already using it.

## The bug that check had

Here is what I wrote first:

```sh
if vault kv get secret/incidental/bootstrap >/dev/null 2>&1; then
```

And here is the policy I wrote for it, deliberately:

```hcl
path "secret/data/incidental/bootstrap" {
  capabilities = ["create", "update"]
}
```

No `read`. A bootstrap that can read back what it wrote is a bootstrap worth stealing a token for.

`vault kv get` reads `secret/data/...`. Vault denies it. `>/dev/null 2>&1` swallows the denial.
`if` sees a non-zero exit and reads it as "not populated". The `Job` then generates a new token and
puts it, **rotating the credential out from under the running pod**. That happens every time I edit
the script, which changes the hash, which makes a new `Job`.

Three correct-looking lines in three files, and the failure only appears on the second deploy.

`vault kv metadata get` reads `secret/metadata/...`, which the policy does grant. It answers whether
the path exists without handing back what is in it:

```sh
if vault kv metadata get secret/incidental/bootstrap >/dev/null 2>&1; then
```

The test asserts the shape rather than the behaviour, since the policy lives in another file:

```nix
(it "leaves a populated path alone" [
  (matches "already populated" script)
  (matches "vault kv metadata get" script)
  (notMatches "vault kv get" script)
])
```

## Example two: a secret that a third party also has to know

A random string is the easy case. An OIDC client secret is the same shape with one extra step: it
has to be registered with Keycloak, or it is just a string nobody accepts.

Same `Job`, same idempotency check, with two Keycloak calls wedged in the middle:

```sh
new_secret=$(randstr 32)

KC_TOKEN=$(curl -sfk -X POST "$KC_URL/realms/master/protocol/openid-connect/token" \
    -d "username=admin" -d "password=$KC_PW" \
    -d "grant_type=password" -d "client_id=admin-cli" \
    | jq -r '.access_token')

CLIENT_ID=$(curl -sfk "$KC_URL/admin/realms/master/clients?clientId=keel" \
    -H "Authorization: Bearer $KC_TOKEN" | jq -r '.[0].id // empty')

client_json=$(jq --arg s "$new_secret" '. + {secret: $s}' /scripts/client.json)
curl -sfk -X POST "$KC_URL/admin/realms/master/clients" \
    -H "Authorization: Bearer $KC_TOKEN" -H "Content-Type: application/json" \
    -d "$client_json"

vault kv put secret/keel/oauth-keycloak key=keel secret="$new_secret"
```

The call site:

```nix
# services/keel.nix
imports = [
  (oauth.mkKeycloakClient {
    namespace = ns;
    clientId = "keel";
    displayName = "Keel";
    client = {
      redirectUris = [ "https://${host}/oauth2/callback" ];
      webOrigins = [ "https://${host}" ];
    };
    extraRandomFields = {
      cookie = 32;
      basicauth = 32;
    };
  })
];
```

`extraRandomFields` is the same trick again, for values Keycloak never sees. oauth2-proxy signs its
session cookie with one. The other is a basic-auth password: Keel speaks no OIDC, so oauth2-proxy
sits in front and replays a password that exists for no other reason.

Neither has any business outside the cluster, so neither leaves it.

The admin password this `Job` logs into Keycloak with arrives the same way everything else does: as
a `VaultStaticSecret` mounted into the `Job`'s own namespace. The chain bottoms out at exactly one
credential I typed by hand, which is the Vault root token, which is sealed.

A third variant does the same against Forgejo: `POST /api/v1/users/$USER/tokens` is the one endpoint
that takes a password rather than a token, which is what lets it run with nothing minted yet. Scoped
to `write:repository` and `write:issue`, because the thing using it opens pull requests and does not
administer a forge.

## What this is not

It is not a way to handle secrets that really do come from outside. My Hetzner token and my deSEC
token were issued by somebody else's web UI and they live in a password manager, as they should.
Those get into Vault by hand, once.

It is also not rotation. Nothing here rotates on a schedule. A populated path is left alone, on
purpose, because the alternative is a `Job` that quietly invalidates a credential a running pod is
holding, which is precisely the bug above.

What it removes is the category of secret that only ever existed because two of my own services
needed to agree on a string, and which I was previously generating with `openssl rand`, pasting into
[sops](/articles/managing-secrets-privately-with-sops-nix), and then having on my laptop for the
rest of its life.

```console
$ kubectl logs -n incidental job/incidental-bootstrap-a3f91c4e8b02
secret/incidental/bootstrap bootstrapped.
```

That is the entire audit trail, and it is the right amount.
