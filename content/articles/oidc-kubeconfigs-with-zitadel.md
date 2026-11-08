+++
date = '2026-11-08T00:07:52+01:00'
draft = false
title = 'OIDC kubeconfigs with Zitadel'
tags = ['kubernetes', 'nix', 'kubenix']
+++

Kubeconfig that outlive the persons holding it are a compliance anti-pattern.

[Zitadel][zitadel] can be the issuer instead: `kubectl` opens a browser, gets a short-lived token,
and the API server maps a project role to a Kubernetes group.

*(Zitadel is a modern replacement for Keycloak. You can use Keycloak for all of this, too.)*

[zitadel]: https://zitadel.com/

From a fresh cluster:

1. vendor and deploy Zitadel,
2. create one project role,
3. point `kubectl` at the OIDC app.

## Vendor and deploy Zitadel

Vendor the Zitadel chart [using the `helm-vendor` CLI][helm-vendor-post]:

[helm-vendor-post]: /articles/helm-vendor-vendoring-helm-charts-with-nix

```console
$ helm-vendor add zitadel https://charts.zitadel.com 10.0.4
```

The chart's bundled PostgreSQL is off by default. Turn it on for a first cluster; use a database
you operate for anything real. The chart is rendered with [kubenix][kubenix] below.

[kubenix]: https://kubenix.org/

The values that matter are the external domain and the masterkey Secret.

```nix
# services/zitadel.nix
{ kubenix, charts, ... }:
{
  kubernetes.resources.namespaces.zitadel = { };
  kubernetes.objects = builtins.fromJSON (builtins.readFile (kubenix.lib.helm.chart2json {
    chart = charts.zitadel;
    name = "zitadel";
    namespace = "zitadel";
    values = {
      postgresql.enabled = true;
      zitadel.masterkeySecretName = "zitadel-masterkey";
      zitadel.configmapConfig = {
        ExternalDomain = "zitadel.example.com";
        ExternalSecure = true;
        ExternalPort = 443;
      };
      zitadel.configmapConfig.FirstInstance.Org.Human = {
        UserName = "john";
        Email = "john@example.com";
        Password = "ChangeMe123!";
        PasswordChangeRequired = true;
      };
      gateway.httpRoute = {
        enabled = true;
        hostnames = [ "zitadel.example.com" ];
        parentRefs = [ { name = "main"; namespace = "gateway"; } ];
      };
      login.gateway.httpRoute = {
        enabled = true;
        hostnames = [ "zitadel.example.com" ];
        parentRefs = [ { name = "main"; namespace = "gateway"; } ];
      };
    };
  }));
}
```

Create the namespace and masterkey before the first apply. The placeholder password forces a change
on first login:

```console
$ kubectl create namespace zitadel
$ kubectl create secret generic zitadel-masterkey -n zitadel \
    --from-literal=masterkey="$(openssl rand -hex 16)"
```

Then apply the service. The setup job creates the first instance and admin user. The two
`gateway.httpRoute` values assume a Gateway named `main`; use the chart's ingress values instead if
that is what you run.

## One project role, one group

In the Zitadel console, create a project `kubernetes` and a role `cluster-admin`. Create a Native
OIDC app `kubernetes-api` with PKCE, redirect `http://localhost:8000`, development mode, JWT access
tokens, both role assertions, and user info inside the ID token. Copy the client ID and project ID.

Kubernetes wants a `groups` array; Zitadel asserts project roles as a nested object. A Complement
Token action flattens them:

```javascript
// Zitadel action: groupsClaim
function groupsClaim(ctx, api) {
  if (ctx.v1.user.grants == undefined || ctx.v1.user.grants.count == 0) return;
  const groups = [];
  ctx.v1.user.grants.grants.forEach((grant) => {
    grant.roles.forEach((role) => groups.push(role));
  });
  api.v1.claims.setClaim("groups", groups);
}
```

Name the action `groupsClaim`, matching the function. Attach it to both Complement Token triggers:
Pre Userinfo creation and Pre Access Token creation. Check `allowed to fail`, so a user without a
role can still log in. Grant `cluster-admin` to the people who should have it.

The client must request the project audience, or the action doesn't see any grants.

The kubeconfig below makes the client do that.

The cluster repo reconciles the same objects with an in-cluster Job similar to the one described in
the article [A Vault Job](/articles/a-vault-job#nobody-needs-to-know), with Vault calls replaced by
Zitadel's management API.

## A kubeconfig that expires

Point `kubectl` at the OIDC app. The kubeconfig has no client certificate; it runs the
[int128/kubelogin][kubelogin] plugin, which opens the browser. Set `CLIENT_ID` and `PROJECT_ID`, and
point the cluster at your API server and CA:

[kubelogin]: https://github.com/int128/kubelogin

```console
$ CLIENT_ID=... PROJECT_ID=...
$ kubectl config set-cluster cluster --server=https://kube.example.com:6443 \
    --certificate-authority=ca.crt
$ kubectl config set-credentials zitadel \
    --exec-api-version=client.authentication.k8s.io/v1 \
    --exec-command=kubectl-oidc_login \
    --exec-arg=get-token \
    --exec-arg=--oidc-issuer-url=https://zitadel.example.com \
    --exec-arg=--oidc-client-id="$CLIENT_ID" \
    --exec-arg=--oidc-extra-scope=email \
    --exec-arg=--oidc-extra-scope="urn:zitadel:iam:org:project:id:$PROJECT_ID:aud" \
    --exec-interactive-mode=IfAvailable
$ kubectl config set-context zitadel --cluster=cluster --user=zitadel
$ kubectl config use-context zitadel
```

Add `pkgs.kubelogin-oidc` to the devshell; it provides `kubectl-oidc_login`. On Talos, the API
server learns to trust the issuer with these flags:

```yaml
# talos/patches/oidc.yaml
cluster:
  apiServer:
    extraArgs:
      oidc-issuer-url: https://zitadel.example.com
      oidc-client-id: <client-id>
      oidc-username-claim: email
      oidc-groups-claim: groups
      oidc-username-prefix: "oidc:"
      oidc-groups-prefix: "oidc:"
```

Finally, bind the prefixed group in the same kubenix service:

```nix
# services/zitadel.nix (continued)
kubernetes.resources.clusterRoleBindings.zitadel-cluster-admins = {
  roleRef = { apiGroup = "rbac.authorization.k8s.io"; kind = "ClusterRole"; name = "cluster-admin"; };
  subjects = [ { apiGroup = "rbac.authorization.k8s.io"; kind = "Group"; name = "oidc:cluster-admin"; } ];
};
```

`kubectl get nodes` now opens Zitadel. After login, `kubectl auth whoami` shows
`oidc:alice@example.com` and `oidc:cluster-admin`. The token expires; the browser login renews it.
