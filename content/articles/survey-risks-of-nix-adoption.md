+++
date = '2026-11-08T12:03:03+01:00'
draft = true
title = 'Survey: Risks of Nix Adoption'
tags = ['nix', 'security']
+++

The 2025 Nix community survey asked users what they would improve. Of 3,399 respondents, 28.9% had
used Nix for under a year and 38.9% described themselves as beginners. Asked what to improve, they
picked flakes (50.3%), error messages (47.6%), and the reference manual (41.5%).[^survey25]

Nix can pin a compiler and rebuild a system from a lock file.

But what are the risks that people associate or report with adopting Nix?

For the sake of evaluating risks of adopting Nix, the risk factors that people report online are
divided into the following categories:

- the knowledge
- the platform exceptions
- the cache
- the upgrade calendar
- the project governance

## tl;dr

- NixOS does not follow [FHS][fhs] (Filesystem Hierarchy Standard). Vendor binaries need packaging,
  `nix-ld`, or `buildFHSEnv`.[^faq]
- Flakes are experimental and are used by 78.9%. Stabilisation was rejected in November
  2025.[^flakes][^vote]
- NixOS stable gets seven months of fixes. There is no free LTS. Rollback does not undo a
  database migration.[^release][^rollback]
- A binary cache is a trust boundary. The store is world-readable.[^cache][^secrets]
- Nixpkgs was about 91% reproducible in April 2023. Verification is separate.[^malka][^repro]
- The 2024 crisis cost 24 maintainers and produced Lix. Upstream Nix still had 87.5% of
  survey users.[^lwn][^survey25]
- A dev shell does not commit you to the operating-system risks.

[fhs]: https://jorel.dev/NixOS4Noobs/fhs.html

## The cost of learning

The primary and most outspoken cost of Nix adoption is the mental model. The survey is a proxy for
where users get stuck: 62.5% rely on tutorials, 23.3% feel comfortable contributing upstream, and
4.0% claim to understand every error message.[^survey25] The 2024 survey found 39% had used Nix for
under a year and 41% called themselves beginners.[^survey24]

Practitioners describe the same wall. Pierre Zemb says it takes months to feel productive,
and that the language is the hardest part.[^zemb]

The organisational risk is concentration. If two people can debug an evaluation and
everyone else can only run `nix develop`, you have added a bus factor. The sources do not
put a number on that. They show why it happens.

## The filesystem is not a detail

NixOS has no global library path and does not follow FHS. The FAQ says it cannot run
dynamically linked executables for generic Linux out of the box.[^faq] The remedies are
real: package the software, patch the ELF, use `buildFHSEnv`, `nix-ld`, or `steam-run`.
Each is an exception with a maintenance cost.

Vendor software is where this hurts. A corporate thread calls proprietary software "a real
pain, or impossible."[^corporate] Zemb had to disable the Gradle Protobuf plugin's compiler
download and provide `protoc` through the derivation.[^zemb]

Platform coverage is part of the bill. Nix supports Linux and macOS; Windows is WSL
only.[^platforms] The 2025 survey has 90.0% on NixOS, 18.1% on macOS, and 11.0% on Windows
via WSL.[^survey25] The macOS issue documents SDK constraints and sandbox limits, and
Determinate dropped Intel Macs in late 2025.[^macos][^detsys] A mixed fleet will not get the
same experience.

## Flakes are a bet

Flakes are the official entrypoint and an official experiment. nix.dev calls them "an
experimental extension format with outstanding issues."[^flakes] The cons are concrete: no
parameters, the whole directory copied to the store, dependency duplication unless
`follows` is wired, and files that must be staged.[^flakes]

Usage has outrun the label. 78.9% of 2025 respondents use flakes; 50.3% still put them first
on the improvement list.[^survey25] The 2024 survey had 85%.[^survey24] The steering
committee rejected a proposal to declare them stable in November 2025. One member said the
implementation was "bad" enough that the team could not tell what it does; another said
declaring stability "does not magically finish it."[^vote]

Determinate Systems argues the label is misleading.[^detsys-flakes] Lix has its own
compatibility policy.[^lix] The practical question is which interface you standardise on
and what promise you rely on.

## Seven months at a time

NixOS 25.05 gets bugfixes and security updates for seven months, until 2025-12-31.[^release]
A new stable release arrives every six months.[^faq] There is no free LTS; the community
debates extending the window.[^support]

Corporate evaluators notice. One thread says most companies cannot upgrade every six months
and compares the cadence with Red Hat and Ubuntu LTS.[^corporate] The same thread says
enterprises cannot recommend experimental features, and that CVE handling "seems not very
nice."[^corporate]

Rollback is narrower than it sounds. `nixos-rebuild switch --rollback` returns to a previous
system generation.[^rollback] It does not undo application data or schema migrations. The
manual lists the state that must persist outside the generation, and its service chapters
require manual PostgreSQL and Nextcloud migrations.[^state]

Then there is the cache. Trustix calls binary substituters "a single point of failure in the
chain of trust."[^trustix] If the cache lacks a path, the build falls back to source. That
is an availability and cost risk. Evaluation memory adds to it: one issue reports a NixOS
profile evaluation at about 1 GB.[^eval]

## Trust lives in the cache

The official custom-cache guide says access to a signing key allows substituting arbitrary
files, including executables that run as root or with extra privileges.[^cache] Garnix explains the
practical version: anyone who can push to a cache can replace executables, and in common CI
setups everyone with repository write access can read the push secret.[^garnix] Reading the
source does not help.

The store is world-readable, so secrets must not enter it.[^secrets] NixOS modules are
another surface: advisories include insecure MySQL defaults, a public Odoo database,
hardcoded OnlyOffice credentials, and a captive-browser privilege escalation.[^advisories]
The Nixpkgs security team's FOSDEM talk counted 1,149 of 1,844 Rust packages locked to
vulnerable dependencies.[^fosdem] The project publishes advisories. The organisation still
has to watch its own closure.

## Reproducible is a rate

Nix is a good starting point for reproducible builds, not a guarantee. The project's page
says builds can still leak timestamps or have other nondeterminisms.[^repro] An independent
study measured nixpkgs rising from 69% in 2017 to about 91% in April 2023.[^malka] The
minimal ISO has been rebuilt bit-for-bit, but the rebuild starts from a 2020 appliance and
some Go builds use an upstream binary.[^iso]

The practical question is what you mean by reproducible. Pinned inputs are one thing.
Bit-for-bit rebuilds are another. Independent verification of the binaries you run is a
third, and it is not automatic.[^repro]

## The project is also a risk

In April 2024 an open letter with more than 100 signatures called for founder Eelco
Dolstra's resignation. LWN reported that the moderation team had been in emergency mode for
over half a year and that 24 maintainers had left.[^lwn]

The board responded on 1 May 2024. Dolstra stepped down, the board acknowledged a series of
crises, and it announced a constitutional assembly for community governance.[^board] Lix
forked from CppNix 2.18.[^lix]

The 2025 survey puts upstream Nix at 87.5%, Lix at 14.8%, and Determinate Nix at
9.8%.[^survey25] That is not a collapsed project. It is a project with a real key-person
risk and a young governance structure. Maintainer capacity is thin: 22.8% had submitted
packages or patches, and 2.9% had merge access.[^survey25]

## The language is the lock-in

Nix is dynamically typed, lazy, and Turing-complete.[^language][^talk] Type errors appear at
evaluation time. The founder's talk notes that evaluation has no CPU or memory bound.[^talk]
A 2025 paper describes the language as "Turing-complete, untyped" with dynamic binding,
subtle shadowing and mixed evaluation strategies.[^paper]

That is why debugging is a skill, not a step. It is also why exit is expensive. A large
configuration is written in the language, the module system and the flake idiom, and the
sources do not measure the cost of porting it. I would treat that cost as an inference, not
a number.[^flakes]

## What I would check

Before adopting Nix, I would ask:

- Who are the two people who can debug an evaluation, package a vendor binary and review an
  upgrade?
- How many FHS exceptions will we have, and who owns each one?
- Which platforms must be first-class, and does CI test them?
- Are we standardising on flakes, the older CLI, or a wrapper?
- Does the seven-month support window fit our upgrade calendar?
- Which caches do we trust, who can push, and can we build from source when the cache
  misses?
- Are secrets out of the store, and who watches CVEs in our closure?
- What does reproducible mean to us, and what does it cost to leave?

Start with a dev shell. If that works, add CI. If the cache and the upgrade calendar still
look acceptable, try a server.

## References

[^survey25]: NixOS, [2025 Community Survey Results](https://nixos.org/surveys/community/2025/), 2026.
[^survey24]: NixOS, [Nix Community Survey 2024 Results](https://discourse.nixos.org/t/nix-community-survey-2024-results/55403), 2024.
[^zemb]: Pierre Zemb, [Three Years of Nix and NixOS](https://pierrezemb.fr/posts/nixos-good-bad-ugly/), 2025.
[^faq]: nix.dev, [Frequently Asked Questions](https://nix.dev/guides/faq.html), n.d.
[^corporate]: NixOS Discourse, [Issues when suggesting NixOS within corporate environments](https://discourse.nixos.org/t/issues-when-suggesting-nixos-within-corporate-environments/28629), 2023.
[^platforms]: nix.dev, [Supported Platforms](https://nix.dev/manual/nix/2.28/installation/supported-platforms), n.d.
[^macos]: nixpkgs, [Status of macOS](https://github.com/NixOS/nixpkgs/issues/116341), n.d.
[^detsys]: Determinate Systems, [Determinate Nix changelog](https://determinate.systems/blog/changelog-determinate-nix-3132/), 2025.
[^flakes]: nix.dev, [Flakes](https://nix.dev/concepts/flakes.html), n.d.
[^vote]: NixOS Steering Committee, [Vote #3: Stabilize flakes](https://github.com/NixOS/steering-committee/blob/main/vote-logs/0003-stabilize-flakes.md), 2025.
[^detsys-flakes]: Graham Christensen, [Experimental does not mean unstable](https://determinate.systems/blog/experimental-does-not-mean-unstable/), 2023.
[^lix]: Lix, [About Lix](https://lix.systems/about/), 2025.
[^release]: NixOS, [NixOS 25.05 released](https://nixos.org/blog/announcements/2025/nixos-2505/), 2025.
[^support]: NixOS Discourse, [Stable NixOS support length](https://discourse.nixos.org/t/stable-nixos-support-length/77758), 2026.
[^rollback]: NixOS, [Rolling Back Configuration Changes](https://nixos.org/manual/nixos/stable/#sec-rollback), n.d.
[^state]: NixOS, [Necessary system state](https://nixos.org/manual/nixos/stable/#ch-system-state), n.d.
[^trustix]: Trustix, [A new model for Nix binary substitutions](https://nix-community.github.io/trustix/intro.html), n.d.
[^eval]: NixOS/nix, [Memory usage in eval](https://github.com/NixOS/nix/issues/8621), n.d.
[^cache]: nix.dev, [Configure Nix to use a custom binary cache](https://nix.dev/guides/recipes/add-binary-cache.html), n.d.
[^garnix]: Julian K. Arni, [Stop trusting Nix caches](https://garnix.io/blog/stop-trusting-nix-caches/), 2025.
[^secrets]: NixOS, [Secrets](https://nix.dev/manual/nix/stable/store/secrets.html), n.d.
[^advisories]: nixpkgs, [Security Advisories](https://github.com/nixos/nixpkgs/security), n.d.
[^fosdem]: delroth, [Remediating 1000s of untracked vulnerabilities in nixpkgs](https://archive.fosdem.org/2024/events/attachments/fosdem-2024-1983-remediating-thousands-of-untracked-security-vulnerabilities-in-nixpkgs/slides/22601/Remediating_1000s_of_untracked_vulnerabilities_yS8r8je.pdf), FOSDEM 2024.
[^repro]: NixOS, [NixOS Reproducible Builds](https://reproducible.nixos.org/), n.d.
[^malka]: Julien Malka, [Is NixOS truly reproducible?](https://luj.fr/blog/is-nixos-truly-reproducible.html), 2025.
[^iso]: NixOS Discourse, [Minimal installation ISO independently rebuilt](https://discourse.nixos.org/t/nixos-reproducible-builds-minimal-installation-iso-successfully-independently-rebuilt/34756), n.d.
[^lwn]: Daroc Alden, [A leadership crisis in the Nix community](https://lwn.net/Articles/970824/), LWN, 2024.
[^board]: NixOS Foundation Board, [Giving power to the community](https://discourse.nixos.org/t/nixos-foundation-board-giving-power-to-the-community/44552), 2024.
[^language]: nix.dev, [Nix Language](https://nix.dev/manual/nix/2.27/language/), n.d.
[^talk]: Eelco Dolstra, [The Future of Nix](https://edolstra.github.io/talks/guix-feb-2018.pdf), 2018.
[^paper]: Rutger Broekhoff and Robbert Krebbers, [Verified Interpreters for Dynamic Languages with Applications to the Nix Expression Language](https://dl.acm.org/doi/full/10.1145/3747537), 2025.
