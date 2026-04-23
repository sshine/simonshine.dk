+++
date = '2026-03-03T00:18:09+01:00'
draft = true
title = 'Rabbit-holing Nix FOSS'
+++

While I'm waiting to go to bed, I thought I'd pick a simple low-hanging fruit,

- [terranix/terranix.github.io issue #9: RSS][issue-9]

[issue-9]: https://github.com/terranix/terranix.github.io/issues/9

The ticket suggests I can use [mdbook-rss][mdbook-rss-crate] which hasn't been updated for 4 years.
For such a straight-forward project, it's probably mature. Unfortunately it's not in [nixpkgs][nixpkgs]
which the website uses to fetch mdbook, most easily determined by [searching search.nixos.org][search]

Since it's an old project, maybe it got stalled in the [nixpkgs pull request queue][nixpkgs-queue]?

No, but there's another project called [mdbook-rss-feed][mdbook-rss-feed] in queue as
[mdbook-rss-feed: init at 1.3.0][mdbook-rss-feed-queue] which has stalled since December 31, 2025,
so only 2 months. It even has commits from about two weeks ago. And the git version has moved to
1.4.1. Since the nixpkgs is by the original author, maybe he'd like a default.nix that we can use
until it gets merged, and I can move on.

Why am I going all this way? Once the package is in nixpkgs, I get a binary cached version, which
I'd prefer because of the time it takes to compile Rust. And then there's the whole thing about
giving back to FOSS.

[mdbook-rss-crate]: https://gitlab.com/albalitz/mdbook-rss
[nixpkgs]: https://github.com/nixos/nixpkgs
[search]: https://search.nixos.org/packages?channel=unstable&query=mdbook-rss
[nixpkgs-queue]: https://github.com/NixOS/nixpkgs/pulls?q=is%3Apr+is%3Aopen+mdbook-rss
[mdbook-rss-feed]: https://github.com/saylesss88/mdbook-rss-feed
[mdbook-rss-feed-queue]: https://github.com/NixOS/nixpkgs/pull/475605
