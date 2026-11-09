+++
date = '2026-11-02T23:44:40+01:00'
draft = true
title = 'A gateway instead of a load balancer'
tags = ['kubernetes', 'nix', 'forgejo', 'talos', 'hetzner']
+++

When running Kubernetes via Talos Linux on Hetzner VMs, I wanted to hide my nodes on a virtual
network so that they're not directly accessible from the public. This means routing relevant traffic
to and from them. Traffic out is routed via a NAT gateway that I provision, and traffic in is routed
via a Hetzner LB11 load balancer.

After the hardware price hikes of 2026, I no longer wanted to run a highly available cluster with 3
control-plane nodes and 3 worker nodes; I cut down a lot of the hardware and I deprovisioned various
services I had toyed around with but played no critical role in the applications I was running.

The architecture before:
- 3x CX33 (4 vCPU, 8 GB RAM): highly available control-plane across 3 regions
- 3x CX33 (4 vCPU, 8 GB RAM): worker nodes across those same regions
- 1x CPX22 (2 vCPU, 4 GB RAM): NAT gateway
- 2x LB11 load balancers: One for 22, 80, 443, and one for 6443 and 50000

The architecture was now:
- 3x CX33 (4 vCPU, 8 GB RAM): one hybrid control-plane + worker node, and two dedicated worker nodes
- 1x CPX22 (2 vCPU, 4 GB RAM): NAT gateway
- 1x LB11 load balancer for 20, 80, 443, 6443 and 5000

## tl;dr

- I redeployed the CPX22 gateway as a NixOS machine using [nixos-anywhere and disko][nixos-anywhere]
- I killed the LB11 load balancer and repurposed the CPX22 as a ingress/egress gateway
- I relied on Hetzner snapshots before each redeployment of the CPX22 (for the exercise)
- This saves me €7.99/mo. 
- The gateway DNATs ports 80, 443 and 22 to the Envoy NodePorts on the proxy's worker
- It DNATs ports 6443 and 50000 to a Talos HCloud VIP
- Migrating ingress from the LB11 to the CPX22 came with zero downtime

[nixos-anywhere]: /articles/nixos-anywhere-on-hetzner/

## Hetzner VPCs

The cluster runs on a Hetzner Cloud network, `10.0.0.0/16`. The nodes have only private addresses.

It was an `lb11`: five services, twenty-five targets. The five were the cluster's whole public
surface: 80, 443 and 22 to the Envoy NodePorts, 6443 and 50000 to the control plane. It had no
headroom and lived outside Kubernetes. HCCM cannot own a load balancer whose services it did not
declare, and this one carried the API and Talos ports.

It health-checked targets, which mostly meant routing around a node without the proxy. That is a
health check for the wrong object, and the same hop stripped the client address.

## The crawler that found the bill

In October, an anonymous crawler walked the history of one mirrored repository on the Forgejo
instance. It requested `blame`, `commit`, `commits` and `src` pages commit by commit. Each forks git
and walks history. In one twenty-four second window it sent 408 requests, 396 to that repository,
peaking at 34 per second. Pages took 3.5 to 7.5 seconds.

Forgejo burned about 1.9 cores against a 250m request and took its node to 100% CPU. Readiness
timed out and it answered 503 and 504. The Actions API shares its process, so runners could not post
final status and release runs failed even though their steps passed. The fix was a local rate limit
on the expensive path families, 60 per minute. It stopped the crawler and made a legitimate reader
wait.

The reason it had to be a path limit is the load balancer. It was a TCP passthrough, and Hetzner's
per-service PROXY protocol toggle was off:

```text
Services:
  - Protocol:          tcp
    Listen Port:       443
    Destination Port:  30443
    Proxy Protocol:    no
```

Hetzner can send PROXY protocol. This one was not. The cluster side had accepted the header
optionally for two weeks, so 80 and 443 could send it without breaking anything. Enabling it there
and leaving it off on 6443 and 50000 was a manual Hetzner change outside the repository, not
something to do mid-incident.

Envoy only ever saw the load balancer's private address and a few cluster hops. The rate limit can
key on a source CIDR with `type: Distinct`, which is exactly what the incident wanted, but every
request had the same private source. The crawler and a human reader were indistinguishable.

The five-service ceiling and the inability to tell me who was calling were the two arguments that
mattered. The cost was the third. Pure DNAT would preserve the client address, because the
gateway is already the nodes' default route.

## The egress box becomes the gateway

The NAT VM was a `cpx22`: two cores, four gigabytes, local disk, public IPv4 and IPv6, and a private
NIC. It had run Debian 12 from cloud-init since March. Its whole forwarding configuration was two
lines in `/etc/network/interfaces`:

```text
post-up echo 1 > /proc/sys/net/ipv4/ip_forward
post-up iptables -t nat -A POSTROUTING -s '10.0.0.0/16' -o eth0 -j MASQUERADE
```

Every node depended on its private address for egress. I took a Hetzner snapshot, protected both
primary IPs, and kept the server object. A new `cpx22` at list price was 24.99; this one was
grandfathered at 7.99, and deleting it would have released its addresses.

I installed NixOS over rescue with [`nixos-anywhere`][na] from a flake in a separate repository. The
first attempt installed cleanly and never booted: legacy BIOS GRUB on a UEFI machine. From rescue,
`/etc/machine-id` had never been created. An ESP and `efiInstallAsRemovable` fixed it.

[na]: https://github.com/nix-community/nixos-anywhere

The NixOS configuration is a normal NAT module plus the forwards:

```nix
# machines/gateway/nat.nix
let
  proxyNode = "10.0.0.7";      # the worker running the Envoy proxy
  controlPlane = "10.0.0.254"; # the Talos VIP
in
{
  networking.nat = {
    enable = true;
    externalInterface = "enp1s0";
    internalIPs = [ "10.0.0.0/16" ];

    forwardPorts = [
      { sourcePort = 80;    destination = "${proxyNode}:30080"; }
      { sourcePort = 443;   destination = "${proxyNode}:30443"; }
      { sourcePort = 22;    destination = "${proxyNode}:30022"; }
      { sourcePort = 6443;  destination = "${controlPlane}:6443"; }
      { sourcePort = 50000; destination = "${controlPlane}:50000"; }
    ];
  };
}
```

The forwards do not belong in `networking.firewall.allowedTCPPorts`. DNAT rewrites them in
PREROUTING, before INPUT, and the NAT module accepts them in `nixos-filter-forward`. The firewall
backend is pinned to iptables; the nftables firewall would build a forward chain with a drop policy
and the rules would have to be written again.

A snapshot is the fallback when the box stops being reachable. The gateway stores only its Nix
closure and a journal. The playbook is: snapshot, build, deploy, test egress from a pod, test
ingress by name. If the change is wrong, `nixos-rebuild --rollback`; if the box is unreachable,
rebuild from the snapshot. A `revert-gateway-vm --really` recipe hardcodes the NixOS snapshot and
refuses without the flag.

## Zero downtime

The load balancer served ingress throughout the reinstall, so only egress was at risk. The first
install took egress down for about an hour, because the machine did not boot. Later rule changes
were a `nixos-rebuild switch` with a firewall reload, and I verified egress from a pod.

The ingress cutover was additive:

1. Add the DNAT rules on the gateway. The load balancer still owns the DNS records.
2. Test each port against the gateway's public address by name, not by changing DNS. `curl
   --resolve` for the web ports, `kubectl --server ... --tls-server-name` for the Kubernetes API,
   `talosctl` for the Talos API.
3. Change the external-dns target from the load balancer to the gateway. A records move, AAAA
   records go away because the nodes have no IPv6 and the gateway has no DNAT path for it.
4. Wait for the old TTLs and public caches, then delete the load balancer.

[external-dns][edns] made the DNS move a single annotation change on the Gateway. The deSEC zones
use `upsert-only`, so I deleted their AAAA records through the deSEC API. The Hetzner-hosted zone
uses `sync`, so the same change removed its AAAA records, including the wildcard.

[edns]: https://github.com/kubernetes-sigs/external-dns

The API path had its own wrong turn. The control plane already had a [Talos virtual IP][talosvip],
but as a Layer2 VIP. Hetzner's private network is routed: every server has a `/32` and sends even
its neighbours via the network gateway. ARP for an address the network does not know goes nowhere,
so only the VIP owner could reach `10.0.0.254`.

The fix was an [HCloudVIPConfig][hcvip], which uses the Hetzner API to register the address as an
alias IP on the holding node. The ordinary route then reaches it. The config needs the Hetzner API
token, so a `just talos-vip` recipe renders it from sops rather than committing it. The gateway
forwards 6443 and 50000 to it; `kubectl` and `talosctl` both work, and the alias IP survived the
try-mode rollback window.

[talosvip]: https://docs.siderolabs.com/talos/v1.12/networking/advanced/vip
[hcvip]: https://docs.siderolabs.com/talos/v1.12/reference/configuration/network/hcloudvipconfig

## hostPorts, NodePorts, and the VIP

This is a layer question. A NodePort is not a listener on every address a node owns. It is a
dataplane rewrite, programmed for the node IPs Kubernetes knows about:

```text
node-IP:30080 -> pod-IP:80
```

The Talos VIP is an alias IP on the control plane. It is a local address in the kernel, but not a
Node IP in the Kubernetes API. Cilium's NodePort dataplane is keyed on Node IPs, so
`10.0.0.254:30080` has no rule. Kube-apiserver and Talos apid are host services bound to `0.0.0.0`,
so they answer on the VIP. That is why 6443 and 50000 work and the web NodePorts do not.

The web path targets the worker running the Envoy proxy, not the VIP:

```text
80/443/22   -> worker:30080/30443/30022
6443/50000  -> vip:6443/50000
```

Pure DNAT preserves the client address when the target is the node serving the proxy. If the proxy
pod moves, ingress still works because the Service uses `externalTrafficPolicy: Cluster`, but the
client address becomes a node address.

If the web ports must live on the VIP too, the listener has to move into the host network namespace.
A `hostNetwork` Envoy on the VIP node binds 80, 443 and 22 on the host, and the VIP's kernel accepts
the connection. A single pinned pod is the smallest version; a DaemonSet with a local proxy on every
node survives a node failure. Both give up the Service's endpoint tracking and need the host ports
to be free.

| | NodePort | hostNetwork / hostPort |
|---|---|---|
| Listener | node dataplane, node IPs | host namespace, pod's node |
| VIP alias | no | yes, if the pod is on that node |
| Load balancing | across endpoints | none |
| Client IP | `Cluster` may SNAT; `Local` preserves | preserved |
| Pod movement | Service follows | pod must follow the VIP |
| Port conflicts | none | host ports |

NodePort is the better abstraction for the web service. The VIP is the better address for the
control-plane APIs. Using each where it fits avoids a host port on every node.

## The bill, after

The load balancer is gone. The five public forwards live on the gateway, which was already paying
for itself as the egress path. Ingress and egress share one address, one NixOS configuration, and
one snapshot.

```console
$ hcloud load-balancer list
ID   NAME   HEALTH   IPV4   IPV6   TYPE   LOCATION   NETWORK ZONE   AGE
```

The five services are now five `forwardPorts` entries; the only public address left also carries
egress.
