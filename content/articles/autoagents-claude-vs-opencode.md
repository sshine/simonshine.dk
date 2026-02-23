+++
date = '2026-02-22T23:22:30+01:00'
draft = false
title = 'Learning about AutoAgents by benchmarking Claude Code vs. OpenCode'
+++

## tl;dr

- I'm extending [AutoAgents](https://liquidos-ai.github.io/AutoAgents/) so that it supports
  [Z.ai](https://z.ai/subscribe?ic=F8DVGJASYD), a frontier AI company
- Z.ai's GLM-5 model might or might not compete with Claude Opus 4.5 at a very competitive price.
- I'm testing both the [OpenCode](https://opencode.ai/) CLI vs. Claude Code CLI, and Z.ai's GLM-5 against  Claude Opus 4.5.
- Claude is considerably faster, but neglects testing. OpenCode's tests were not end-to-end.
- OpenStack writes tests, but not ones that actually contact the API. When I ask it to do that, it
  does, and the test fails without fixing it, and when I copy-paste the error code from running it,
  it gets fixed.
- Compare their commits [here](https://github.com/sshine/AutoAgents/pull/1/changes) and
  [here](https://github.com/sshine/AutoAgents/pull/2/changes).
- **I'd feel confident to vibe-code the full integration with either stack.**

## Alternative to OpenClaw in Rust

Lately I've been playing around with OpenClaw. I really like the whole idea, and I don't like the
codebase. It uses Node.js and that whole ecosystem just smells like security incidents. I did some
research into who is making AI frameworks in Rust, and I found two interesting projects:

- [AutoAgents](https://liquidos-ai.github.io/AutoAgents/): a modern multi‑agent framework in Rust
  for building intelligent, autonomous agents powered by Large Language Models (LLMs/SLMs) and
  [Ractor](https://github.com/slawlor/ractor) (inspired from Erlang's `gen_server`). I've been using
  [actors with tokio](https://ryhl.io/blog/actors-with-tokio/) extensively before, and I love
  Erlang. With AutoAgents' 390 GitHub stars and Ractor's 2.000+ stars, they're popular but small.
- [Rig](https://rig.rs/): a modular, scalable library for building LLM-powered applications. With
  6.100+ stars on GitHub, this is the more mature choice. While more popular and mature, there's no
  ReAct loop built into Rig, and I don't really need its RAG support at this point.

Neither of these are actually OpenClaw alternatives. OpenClaw is an application, and both of these
are libraries/frameworks for making AI agents.

There were runner-ups like [swarms-rs](https://github.com/The-Swarm-Corporation/swarms-rs),
[Anda](https://github.com/ldclabs/anda), [rs-graphs-llm](a-agmon/rs-graph-llm),
[rigs](https://docs.rs/rigs/latest/rigs/), [agentai](https://docs.rs/agentai/latest/agentai/); I'll
provide a shallow comparison of these another time. They're all somewhat specialized or immature.

A related article to the benchmarking part is [builder.io's OpenCode vs. Claude
Code](https://www.builder.io/blog/opencode-vs-claude-code). Their takeaway: Claude Code is built for
speed. OpenCode is built for thoroughness.

Before showing the benchmark prompt and evaluating the results, here's a quick appendix:

- [AutoAgents overview](#autoagents-overview)
- [Rig overview](#rig-overview)
- [The plan produced by Claude Code](#claudes-plan-add-zai-llm-provider-to-autoagents)
- [The plan produced by OpenCode + GLM-5](#opencode--zai-glm-5s-plan)

## The benchmark prompts

> This directory contains a Rust project called AutoAgents. It currently lacks z.ai API integration.
> There's a documentation website at https://docs.z.ai/api-reference/introduction and I'm using the
> GLM Coding Plan, which the documentation tells me needs to use the
> https://api.z.ai/api/coding/paas/v4 endpoint instead of the general endpoint. Analyse how
> AutoAgents deals with similar providers and help me extend AutoAgents to be able to connect with z.ai.

The follow-up prompt:

> Assuming I have a Z.ai token, how do I run a simple test that this integration works? Since this
> is based on the DeepSeek API integration, please add a test for Z.ai in an equivalent way as how
> DeepSeek is tested.

## Evaluating

Disclaimers:

- I'm testing two variables here, so it's not exactly scientific: Both the model and the CLI are different.
- To properly assess, I'd want to try Claude's CLI with Z.ai's GLM-5, and OpenCode's CLI with Opus.
- The difference in output with two variables is so small that I'd need a harder task to warrant this experiment.

Both agents finished the job successfully.

The Claude version is slightly more thorough (more string aliases, models test update,
debug-friendly smoke test), while the OpenCode version has a cleaner builder integration (passes
through more builder fields like `base_url` and `top_p`). Claude was quite a lot faster, both in
terms of planning, linear execution, and splitting the task into parallel subtasks.

When I ask Claude about testing, it suggests how to run a test, and when running that command and
the test runner executes 0 tests, it says "Right, the test doesn't exist yet. Let me add it." -- the
generated test works fine. Contrary, the OpenCode version has more tests, but not an end-to-end test
that validates the integration with an actual API key. Asking it to make that failed and required
another iteration before it got there.

Functionally their solutions do the same thing: wire up the same API endpoint, same default model
(glm-5), same base URL, same feature capabilities.

I'm not motivated to replace Claude Code with this stack yet: If it ain't broken, don't fix it!

But as a cost-effective alternative that appears on par, OpenStack + Z.ai's GLM-5 seems very promising!

While Claude Code's execution is faster, the OpenCode CLI feels more snappy with better modern
terminal integration, e.g. copy-paste buffering and advanced scrolling functionality that pushes
what I personally expect from terminal UIs.

This was a partial one-shot (the integration isn't complete); full API integration lacks a few
features still.

**I'd feel confident to vibe-code the full integration with either stack.**

## AutoAgents overview

### Architecture

- **Executor Layer**: ReAct and basic executors for agentic loops; streaming response support
- **Memory Layer**: Configurable sliding-window memory with pluggable backends; shared memory between agents
- **Agent Definitions**: Both `DirectAgent` (single-threaded) and `ActorAgent` (distributed, using Ractor)
- **Tool System**: Derive macros for type-safe tool definition; WASM sandbox runtime for sandboxed tool execution
- **LLM Providers**: Unified interface supporting OpenAI, Anthropic, local inference (Mistral-rs, LlamaCpp)
- **Multi-Agent Orchestration**: Typed pub/sub communication; environment management for agent-to-agent messaging

### Context Management

- Sliding-window memory maintains conversation history up to configurable token limits
- Memory hooks allow agents to reflect on their own execution and update internal state
- Extensible memory backends enable plugging in vector stores, databases, or external retrieval systems
- Shared memory blocks across multiple agents in same environment

### Distributed Capabilities

- ActorAgent variant runs on Ractor, enabling distributed agent instances across nodes
- Built-in telemetry with OpenTelemetry integration for observing agent behavior at scale
- Handles agent lifecycle, spawning, and supervision automatically

### Strengths

- Comprehensive tool ecosystem (toolkit crate includes pre-built integrations)
- Type-safe tool derivation macros reduce boilerplate
- Memory system is central, not bolted-on
- WASM tool sandbox prevents malicious/buggy tool code from crashing agent
- OpenTelemetry built-in; production observability out-of-the-box
- Active community (Liquidos AI team + growing contributors)
- Supports edge, cloud, and browser (WASM) targets

### Weaknesses

- Smaller ecosystem compared to Python LangChain/LangGraph
- Documentation is good but examples are still growing
- Ractor integration adds complexity for simple single-agent use cases

### Best For

- Production systems with 10+ persistent agents
- Complex tool calling workflows
- When sandboxing and memory safety matter

## Rig overview

### Architecture
- **Unified Provider Interface**: Abstract trait-based design; swap providers (OpenAI, Anthropic, Cohere, local) without code changes
- **Agent Builder**: Fluent API for configuring agents with preamble (system prompt), context documents, tools, and model parameters
- **Chat/Completion/Prompt Traits**: Agents implement multiple trait interfaces; same agent can be used for chat, completion, or prompt modes
- **RAG Integration**: First-class support for vector stores (MongoDB, in-memory, Qdrant via companion crates); dynamic context retrieval at prompt-time
- **Tool System**: Define tools as structs implementing the `Tool` trait; automatic JSON schema generation for structured tool calling
- **Streaming**: Built-in streaming response support for real-time agent output

### Context Management

- Agent builder accepts static context documents; they are always included in the prompt
- Dynamic context retrieval via RAG: query-time embedding search pulls relevant documents into context
- Temperature, max_tokens, and other model parameters can be set per-agent or overridden per-request
- Supports custom system prompts (preambles) that define agent behavior and constraints

### Distributed/Perpetual Capabilities

- Rig itself is single-process, but designed to be embedded in async Rust services (Tokio-based)
- Use Rig agents within larger orchestration frameworks (actor systems, job queues) for distributed execution
- Telemetry hooks for tracing agent execution; works with OpenTelemetry collectors via Langfuse integration

### Strengths
- Excellent abstraction over multiple LLM providers; minimal provider lock-in
- RAG system is well-designed and flexible
- Tool system is clean and type-safe
- Active ecosystem: companies like Cairnify, Ryzome, deepwiki-rs are built on Rig
- Good documentation with tutorials (arXiv agent, Discord bot examples)
- Streaming support enables real-time agent responses
- Logging/tracing integration through Langfuse

### Weaknesses

- No built-in distributed actor support; must compose with other frameworks
- Memory management is delegated to external RAG system; no native "persistent memory" concept
- Less opinionated about agent loop patterns; ReAct/agentic patterns require custom implementation
- Tool calling loop is implicit; harder to inspect/debug agent decision-making

### Best For

- Applications requiring multi-provider flexibility
- RAG-heavy agents
- Integrating agents into web services

# Claude's Plan: Add z.ai LLM Provider to AutoAgents

## Context

AutoAgents currently supports 10 LLM providers but lacks z.ai integration. The user wants to use the **GLM Coding Plan** which uses a dedicated endpoint (`https://api.z.ai/api/coding/paas/v4/`). The z.ai API is OpenAI-compatible (same request/response format for chat completions), so we can follow the **DeepSeek pattern** — a thin wrapper around `OpenAICompatibleProvider<T>`.

## Key z.ai API Details

- **Auth**: `Authorization: Bearer <API_KEY>` (same as OpenAI)
- **Chat endpoint**: `POST {base_url}/chat/completions`
- **GLM Coding Plan base URL**: `https://api.z.ai/api/coding/paas/v4/`
- **General API base URL**: `https://api.z.ai/api/paas/v4/`
- **Default model**: `glm-5` (flagship, 200K context, 131K max output)
- **SSE streaming**: OpenAI-compatible (`data: [DONE]` terminator)
- **Tool calling**: Supported, but `tool_choice` only accepts `"auto"` (no `"required"`/`"none"`)
- **Structured output**: `response_format` supports `{"type": "json_object"}` but not full JSON schema mode

## Changes

### 1. Create `crates/autoagents-llm/src/backends/zai.rs`

Follow the DeepSeek pattern (`deepseek.rs`):

- Define `ZAIConfig` implementing `OpenAIProviderConfig`:
  - `PROVIDER_NAME`: `"ZAI"`
  - `DEFAULT_BASE_URL`: `"https://api.z.ai/api/coding/paas/v4/"` (GLM Coding Plan as default per user's subscription)
  - `DEFAULT_MODEL`: `"glm-5"`
  - `SUPPORTS_STRUCTURED_OUTPUT`: `false` (no JSON schema mode, only `json_object`)
  - `SUPPORTS_PARALLEL_TOOL_CALLS`: `false`
  - `SUPPORTS_STREAM_OPTIONS`: `true`
  - `SUPPORTS_REASONING_EFFORT`: `false`
- Define `ZAI` struct wrapping `OpenAICompatibleProvider<ZAIConfig>`
- Implement `ChatProvider` by delegating to the inner provider (all 5 methods)
- Stub `CompletionProvider` and `EmbeddingProvider` (return errors)
- Default `ModelsProvider`
- Implement `LLMBuilder<ZAI>::build()` passing all builder fields through
- Unit tests matching DeepSeek's test coverage

### 2. Register in `crates/autoagents-llm/src/backends/mod.rs`

Add:
```rust
#[cfg(feature = "zai")]
pub mod zai;
```

### 3. Add feature flag in `crates/autoagents-llm/Cargo.toml`

- Add `zai = []` feature
- Add `"zai"` to the `full` feature list

### 4. Add `ZAI` variant to `LLMBackend` in `crates/autoagents-llm/src/builder.rs`

- Add `ZAI` variant to the enum
- Add `"zai" | "z.ai" | "zhipu" => Ok(LLMBackend::ZAI)` to `FromStr`

## Files to Modify

| File | Change |
|------|--------|
| `crates/autoagents-llm/src/backends/zai.rs` | **New file** — z.ai provider implementation |
| `crates/autoagents-llm/src/backends/mod.rs` | Add feature-gated `zai` module |
| `crates/autoagents-llm/Cargo.toml` | Add `zai` feature flag |
| `crates/autoagents-llm/src/builder.rs` | Add `ZAI` variant to `LLMBackend` enum + `FromStr` |

## Verification

1. `cargo build --all-features` — confirms compilation
2. `cargo test -p autoagents-llm --all-features` — runs all tests including new z.ai unit tests
3. `cargo clippy --all-features --all-targets -- -D warnings` — lint check
4. `cargo fmt --check` — formatting check

# OpenCode + Z.ai GLM-5's Plan

## Analysis Summary

### z.ai API Characteristics

- OpenAI-compatible: Uses the same request/response format as OpenAI
- Endpoints:
  - General: https://api.z.ai/api/paas/v4
  - Coding (GLM Coding Plan): https://api.z.ai/api/coding/paas/v4
- Chat endpoint: /chat/completions
- Auth: Bearer token via Authorization: Bearer <API_KEY>
- Default model: glm-5
- Supported features: streaming, function calling/tools, thinking mode, structured output (json_object)

### AutoAgents Backend Pattern

The simplest approach is to follow the DeepSeek pattern, which:

1. Defines a config struct implementing OpenAIProviderConfig
2. Wraps OpenAICompatibleProvider<Config>
3. Delegates all methods to the inner provider
4. Implements LLMBuilder<Provider> for the builder pattern

### Integration Plan

1. Create new backend module: crates/autoagents-llm/src/backends/zai.rs

```rust
// Key implementation points:
struct ZaiConfig;
impl OpenAIProviderConfig for ZaiConfig {
    const PROVIDER_NAME: &'static str = "Z.AI";
    const DEFAULT_BASE_URL: &'static str = "https://api.z.ai/api/paas/v4/";
    const DEFAULT_MODEL: &'static str = "glm-5";
    const SUPPORTS_STREAM_OPTIONS: bool = true;
    // Note: Structured output uses json_object, not json_schema
}
pub struct Zai {
    provider: OpenAICompatibleProvider<ZaiConfig>,
}
```

2. Add feature flag in Cargo.toml
```rust
zai = []
# Add to full feature list
```
3. Register backend in backends/mod.rs
```rust
#[cfg(feature = "zai")]
pub mod zai;
```
4. Add to LLMBackend enum in builder.rs
```
pub enum LLMBackend {
    // ... existing variants
    Zai,
}
```

5. Support both endpoint variants
The user should be able to configure:
- Default (general endpoint)
- Coding endpoint via base_url("https://api.z.ai/api/coding/paas/v4/")

### Files to Create/Modify

| File | Action |
|------|--------|
| crates/autoagents-llm/src/backends/zai.rs | Create - New backend module |
| crates/autoagents-llm/src/backends/mod.rs | Modify - Add #[cfg(feature = "zai")] pub mod zai; |
| crates/autoagents-llm/Cargo.toml | Modify - Add zai = [] feature |
| crates/autoagents-llm/src/builder.rs | Modify - Add Zai to LLMBackend enum and FromStr impl |

Do you want me to proceed with this plan, or would you like any modifications? Specifically:
1. Should the default endpoint be the general one (/api/paas/v4) or the coding one (/api/coding/paas/v4)?
2. Should we add explicit support for the "thinking" feature (chain-of-thought), or defer that for a future enhancement?
