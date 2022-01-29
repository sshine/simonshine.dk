+++
title = "A Terraform DNS moment"
+++

# A Terraform DNS moment

**tl;dr:** I stuck the IPv4 and IPv6 address of my VPS into an SPF record field text.

I manage my DNS with Terraform. This means that past domain registration and changing nameservers, I manage DNS with the Terraform command-line interface and git. Today I experienced a moment of happiness when two pieces of personal infrastructure fitted.

The scenario: I'm setting up a send-only email server on a VPS for Gitea notifications. If this works out well, I will consider using it for a newsletter. Doing this on a commercial cloud VPS means that my server's IPv4 address gets a bad score. One way to improve on that score is to add an [SPF record](http://www.open-spf.org/SPF_Record_Syntax/).

For my personal email hosted at FastMail, the SPF record is simpler:

```
$ dig +short TXT simonshine.dk
"v=spf1 include:spf.messagingengine.com -all"
```

Their SPF record contains a bunch of `ip4:...` rules.

To let the world know that I'm sending emails from my VPS, I simply list its IP address:

```
resource "digitalocean_record" "spf_example_com" {
  domain = digitalocean_domain.example_com.name
  type   = "TXT"
  name   = "@"
  value  = "v=spf1 ${format("ip4:%s ip6:%s",
    digitalocean_droplet.example_droplet.ipv4_address,
    digitalocean_droplet.example_droplet.ipv6_address)} -all"
}
```

This encourages receivers of emails from this domain to reject the email if it didn't originate from this server. The part that got me blogging is that I didn't hardcode the IP addresses of my server, but rather, the value was taken from the deployment configuration of the concrete server.
