+++
title = "Extracting the KUBE_CONFIG for a DigitalOcean Terraform .tfstate"
+++

When provisioning a Kubernetes cluster from DigitalOcean with Terraform, the `.tfstate` contains a field called `raw_config` that authenticates `kubectl`. It can elegantly be extracted with `jq`:

```
$ jq -r '.resources[]
        | select(.type == "digitalocean_kubernetes_cluster")
        | .instances[].attributes.kube_config[].raw_config' \ 
    terraform.tfstate
apiVersion: v1
kind: Config
clusters:
- cluster:
    certificate-authority-data: ...
    server: https://...k8s.ondigitalocean.com
  name: your-cluster-name
contexts:
- context:
    cluster: your-cluster-name
    user: your-cluster-name-admin
  name: your-cluster-name
current-context: your-cluster-name
users:
- name: your-cluster-name-admin
  user:
    token: ...
```

If you provision multiple clusters, you cannot simply pipe the multiple `kind: Config`s, but otherwhise, this output can be dumped straight into `~/.kube/config`. Otherwise, you may want to dump it to a specific file before you run

```
KUBECONFIG=some.config kubectl ...
```

Now, I'd like if the `~/.kube/config` could get populated as part of the provisioning, so that `kubectl` commands work immediately after. This is possible with the [`local-exec` provisioner](https://www.terraform.io/docs/language/resources/provisioners/local-exec.html):

```
  provisioner "local-exec" {
    command = <<EOF
      mkdir -p ~/.kube && jq -r \
        '.resources[]
        | select(.type == "digitalocean_kubernetes_cluster")
        | .instances[].attributes.kube_config[].raw_config' \
            terraform.tfstate > ~/.kube/config
EOF
```

I'm not sure exactly how useful this last step is yet. This was just another demonstration of how powerful and useful `jq` is.