+++
date = '2026-10-24T13:27:13+02:00'
draft = false
title = 'Coding a Harness'
tags = ['agentic', 'claude']
+++

Except for a couple of months using GLM-5.1 because I went to China and couldn't access Claude Code,
I have been using Claude Code exclusively since it came out, which means the entire existence of
vibe coding. First I paid for it myself, and subsequently my employer did. Now that my employer no
longer does that, I am faced with two options:

1. Go back to paying for Claude Code (5x) at $100/mo.
2. Explore other more cost-effective, less restrictive options.

While Claude Opus generally benchmarks as the best, and the subsidized subscriptions makes it
worthwhile to use, I can't help but think that Claude Code has held me back: Sure, it gave me
productivity, but it's a Terms of Service violation to modify the harness itself.

So far, I have not been paid to write an AI harness (I'm sure there's very little money in that,
much like there was very little money in making compilers for most of existence), but I have been
paid to write other AI agents. And other AI agents than coding agents are much simpler. They require
fewer, scoped tools, simpler loops, and somewhat expectable input.

Making your own coding harness proves to be valuable for:

- Growing your agentic developer workflows
- Questioning what's really the peak of AI coding
- Training towards building less complicated models

The prompt I gave Claude Opus 5:

> In ./intron-claude, make a coding harness called intron written in Guile Scheme using a nix flake
> similar to ~/Projects/nursery/mxroute-rs based on ./pi; besides the core eval loop, it should be
> possible to login using OpenCode Go as a provider. The harness should support interactive mode
> using a client-server protocol, and it should feature a TUI that starts both connected to one
> another (detaching is not required), session management, and -p "prompt" -o json for
> non-interactive use; iterate on the server until it works; initially by mocking, and when you are
> ready, I'll provide an API key. the goal is to have a coding harness that is a self-modifiable
> read-eval-print loop that draws like a TUI but allows for arbitrary modification to itself.

