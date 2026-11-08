+++
date = '2026-11-08T12:07:14+01:00'
draft = true
title = 'Three places to put Nix'
tags = ['nix']
+++

Every new hire loses their first day to the README. Not because it is wrong, but because it was
right eighteen months ago, and nobody has run it on a clean machine since. The packages moved, the
install steps changed, and the part that mattered lived in a colleague's shell history.

That cost never appears in a budget. It is paid in small amounts by everyone who joins, it comes
back with every hire, and no one owns it.

Nix is one answer. The question worth asking is not whether to adopt it, but how far into the
delivery path it goes. There are three places it can sit, and each has a different price and a
different exit. How much Nix code goes in each place is a separate question, and I have written
about [those three levels][tl] before.

## tl;dr

- A short `shell.nix` replaces the setup section of the README. Stopping means going back to a
  README that drifts.
- At the CI boundary, Nix costs one more job and returns a record of everything in the artifact.
- Production is the only tier with a real exit cost. Stop at CI until someone owns the next step.

## The laptop

The first place is the developer environment. One file lists the tools, and the tools arrive when
you enter the directory.

```nix
# shell.nix
{pkgs ? import <nixpkgs> {}}:
pkgs.mkShell {
  packages = [pkgs.go pkgs.gopls pkgs.gotools pkgs.go-tools];
}
```

That is the whole commitment. This is also where the time argument lives. The learning curve is
real, and I have written about [the novelty budget][nb] elsewhere. The difference is who pays. One
engineer spends a day learning enough Nix to write that file; every hire after them runs one
command. The README charges the same knowledge again to each person, in smaller amounts, and never
records it.

The people who pay and the people who benefit are not the same people. One engineer spends the day,
and the team collects for years. That is the shape of an investment that does not happen unless a
manager counts it.

Nix is open source, so the line item here is time, not licences.

Stopping at this tier costs almost nothing. Delete the file and you are back to the README, which
is exactly as good as it was before.

## The CI boundary

The second place is CI, and it is the interesting one, because it is a seam. If CI emits a container
image, production can consume that image without knowing Nix exists. The build uses Nix; the
artifact is ordinary.

Here the argument stops being about setup and becomes about what you can answer. A container image
built from a Dockerfile contains what the Dockerfile says, plus what the base image brought, plus
whatever a build step installed without mentioning it. A Nix build records every input in a lock
file. That record exists whether or not anyone asked for it.

This is also what makes vulnerability scanning less blind. A scanner that walks the closure a Nix
build produces sees what will be deployed. A scanner pointed at an image still has to discover that,
and it can miss what arrived by other means. Neither scanner patches anything, and both depend on
the pin being recent, so this is an inventory rather than a guarantee.

Stopping here is cheap for the same reason. The artifact outlives the build system. Keep the last
image, change the pipeline, and production never notices.

## Production

The third place is production. Now Nix is not building an artifact, it is the thing that runs: a
NixOS host, a system closure, or a deployment that expects Nix on the other side.

This is the only tier with a real exit cost. Leaving means replacing the machine image, the
configuration, and the deployment path at the same time. That is not a reason to avoid it, but it is
a reason to arrive with an owner and a migration plan.

The lock-in here is positional, not proportional. It is not about how much Nix you wrote, but about
where it sits. A version-controlled `.zshrc` deployed by Nix works with or without Nix. The same
file expressed as a NixOS module only works with it. The first sits at the edge; the second has
moved inward.

The diagnostic is one question: delete Nix tomorrow and see what remains. If a person can still
apply the file, you are at the edge. If nothing remains, you have made a bet.

Adopt to the CI boundary. Keep Nix at the edge of what you already ship. Move into production when
someone owns it, and not before.

[nb]: /articles/is-the-novelty-budget-dead
[tl]: /articles/three-levels-of-nix
