+++
date = '2026-04-24T12:25:31+02:00'
draft = false
title = 'Is the novelty budget dead?'
+++

Michael Snoyman wrote a thinkpiece called [The Boring Haskell Manifesto](https://www.snoyman.com/blog/2019/11/boring-haskell-manifesto/) (2019) about how to adopt Haskell into your organization, and how to make your organization productive with Haskell for non-wizards.

The article introduced me to the concept of a "[novelty budget](https://shimweasel.com/2018/08/25/novelty-budgets)" (Mark Wotton, 2018): the limit your project has on new, cool stuff. If you exceed your novelty budget you impose too much risk: new software with unknown limitations, spontaneous learning curves, longer onboarding, harder to hire, longer to develop, things you might need to scrap and rewrite in a less fancy way.

This is especially important for Haskell, since the compiler, GHC, ships with a lot of very advanced language features. But the novelty budget is present in every organization with programmers who want to use Rust and Kubernetes in production because it's exciting, and not because it aligns with what the organization is already doing.

But does it make sense to think of all these risks in the same way with LLMs? If you have proven that a tech-stack can be supported (LLMs perform differently depending), what’s the cost of building with Nix and Rust then?

I’m not saying all the risk of using unfamiliar, sophisticated tools is gone, but that the cost of picking advanced tools is radically lower if the tradeoff makes sense: Rust > Go, unless you need compilation to be fast more than you need type safety. Nix > Docker.

## The case for Nix

One of the things that always bugged me with starting on a new software project is the "Getting
Started" section of a README: It lists the software you need to install, but not how, because that
depends on your flavor of operating system. It always forgets some steps and pieces of software:

- The README wasn't updated after something changed
- Differences between operating systems ("*... oh, it's `-dev` on Blerb Linux!*")
- Drift between major version changes (missing in Debian Trixie, present in Bookworm)
- Non-chronological, non-deterministic, untested and non-reproducible: The README wasn't written in
  the order that a clean bootstrap would require. Sections were added in the middle that belonged in
  the start, and forget that new machines don't come with certain things.

Fundamentally, the README is comments, and comments lie.

These annoyances were already a problem for developers and a reason why reproducible build systems
were made. These build systems were guarded by complexity, meaning adoption has always been low and
either depended on the presence of a wizard, a long-term corporate strategy, or preferrably both.

But I'd like to make the case that investing in something like Nix makes more sense today:

- For agents to prosper, the development environment should be as automated as possible. The number
  of times I need to tell my agent to stop while I install something that enriches its environment
  (a package, an environment variable, or similar) steals my precious, limited attention.
- The operating environment should be modifiable programmatically so that agents can solve their own
  problems as they encounter them.
- The novelty budget argument weighs less: The agent is the expert, and you just need to be able to
  make sense of the choices. "Explain it like I'm 5" works. As long as the starting templates and
  the agent skills to operate are in place, your agents can retain organizational knowledge and
  operate on it.

Investing in a highly automatable development environment with hooks and declarative configuration
at all levels means your agents can modify their own environment. This was already a good idea for
humans but justifiably "expensive" in terms of setup time, burden of maintenance, and risk of losing
the ability if a wizard employee leaves.

## The case for Rust

The most common objection to adopting Rust in a new project is the learning curve. The borrow
checker famously makes newcomers feel like the compiler is fighting them, and the cognitive overhead
of ownership, lifetimes, and type-level concurrency primitives can slow development to a crawl for
developers coming from garbage-collected languages.

This was a legitimate novelty budget concern: a developer who left took their hard-won mental model
of lifetimes with them. Production Rust codebases tend to encode domain knowledge in the type system
in ways that are dense and hard to reason about without prior exposure. Hiring is harder. Onboarding
takes longer. I've seen examples of both.

But:

- Rust's compiler errors are among the most legible in existence, and LLMs excel at explaining them.
  "What does this lifetime error mean and how do I fix it?" is exactly the kind of question an agent
  handles well.
- The type safety and memory safety guarantees catch entire classes of bugs before they ever reach
  runtime. The agent can write and iterate on Rust without the human needing to internalize lifetime
  rules from first principles.
- The organizational knowledge encoded in the type system is precisely the kind of knowledge an
  agent can retain and operate on — a well-typed Rust codebase is, in some sense, a machine-readable
  specification of your domain.


The novelty budget argument for Rust softens significantly. Compilation time is less of a
disadvantage because it mainly affects developer productivity, and agents will just continue exactly
when compilation is done. You still need someone to understand the high-level architecture, but the
day-to-day battle with the borrow checker no longer needs to cost developers the way it once did.

## The case for Kubernetes

I'm mentioning Kubernetes here because I don't think the dead novelty budget justifies it:

The argument for Nix and Rust is that the knowledge was always valuable, but expensive to acquire
and retain. With LLMs, that cost drops — the knowledge is still there, just cheaper to access.
Kubernetes doesn't just require knowledge. It requires ongoing operational work. The complexity is
not in learning it, but in running it.

Every abstraction layer -- Deployments, Services, Ingresses, ConfigMaps, Secrets, CRDs, operators,
sidecars, namespaces, RBAC policies -- is not something you learn once and move on from. It actively
shapes your architecture. While LLMs can help, the cost of Kubernetes is not just intellectual, but
operational.

Kubernetes is declarative and homogenic, which is an ideal environment for an agent to operate. But
the cost of its complexity is not nullified by operating your cluster with agents. An LLM can
explain Kubernetes to you. It can help you write the manifests and untangle the errors. But it
cannot make the operational overhead go away. The problem is not that you will lose the ability to
operate the thing — it is that the operation of the thing itself causes unnecessary complexity.

Kubernetes as a technical investment has its place.

When you genuinely need its capabilities -- multi-tenant workloads, complex scheduling, or stateful
applications at scale -- the overhead is justified. So I'm just mentioning that just because the
novelty budget might be dead, technology can still be expensive for other reasons.

Some technology generates ongoing complexity, slows down iteration, and adds failure modes that don't
go away even when everyone understands them perfectly. The novelty budget does not capture that.
