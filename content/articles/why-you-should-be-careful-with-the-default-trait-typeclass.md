+++
date = '2022-10-25T16:13:28+01:00'
draft = false
title = 'Why you should be careful with the Default trait/typeclass'
tags = ['haskell', 'rust']
+++

You heard it. **`Default` considered harmful!**

tl;dr:
- `Default` has no defining or testable properties
- `Default` is not even guaranteed to be the same between runs
- Defaults are context-specific: One type does not always have one default
- Defaults are useful for transitive derivation, but context drift risks causing errors
- Your `Default` instance is dangerous if you cannot carelessly replace it with any other value
- Haskellers: Use the `default*` pattern instead
- Rustaceans: Use `Default` with care and respect


## `Default` in Rust and in Haskell

Rust's standard library has a [`Default` trait](https://doc.rust-lang.org/std/default/trait.Default.html) that lets you provide a default value for any type:

> ```rust
> pub trait Default {
>     fn default() -> Self;
> }
> ```
> 
> Returns the "default value" for a type.
>
> Default values are often some kind of initial value, identity value, or anything else that may make sense as a default. Sometimes, you want to fall back to some kind of default value, and *don't particularly care what it is.*

The `Default` type class never made it to Haskell's standard library; one lives in the [`data-default`](https://hackage.haskell.org/package/data-default) package, and another one with much more pleasing defaults (sic) lives in [`acme-default`](https://hackage.haskell.org/package/acme-default/docs/Data-Default.html).

When asking Haskellers why, the typical reason is that "type classes should reflect mathematical properties (invariants), and `Default` does not have any properties": Testing an instance of `Default` without making additional assumptions about the type gives you no good things to assert.

The Rust ecosystem does not have a similar mathematical vigilance around the use of traits: You are much more free to define traits in Rust than type classes in Haskell, and they don't have to reflect mathematical depth. Both of these attitudes are fine, so to dig into why `Default` is also bad in Rust, we must dig a little deeper.

## Defaults are useful, but `Default` is sketchy

Software configuration relies heavily on default values.

Defaults let you run complicated software without having read the complete manual.

The features that require custom configuration (such as external APIs) can be disabled by default.

-  The default database can be SQLite for evaluating the software or for a lighter setup.
-  The default logging can be on-screen or in an operating system default directory.
-  The default host/port can be 127.0.0.1:3000, so you don't accidentally expose the service when toying around on semi-public networks.
-  Using your current working directory as the default directory sometimes works.

The implied context here is "a user will run the software and react to any unintended behavior caused by defaults". When the notion of configuration defaults is taken to a programmatic extreme, the implied context is not necessarily true.

## What is the default integer?

3000 seems like a good choice if it's a generic service port number. 0 or 1 both seem like good choices if it's a monoid. If it's a service port number, 0 will mean "[kernel picks a randomly unused port number](https://eklitzke.org/binding-on-port-zero)", which does not produce deterministic behavior. If it's an IPv4 address, [listening on 0.0.0.0](https://www.lifewire.com/four-zero-ip-address-818384) means you will listen on all interfaces, including public ones. Should the default HTTP client parameters be with or without SSL? For simplicity: without. For security: with. It depends on context. You *may think* that your type has a well-defined default, but nesting it inside a bigger structure may cause that to no longer be the case, because *defaultness does not transcend*.

An example of this drift from the real world is when XMonad's [`grabKey` grabbed all unbound keys](https://github.com/xmonad/xmonad/commit/383ffb772e4a), because "`KeySym 0 (NoSymbol)` gets mapped to every unbound `KeyCode`, since that's what `XKeycodeToKeysym` returns for those." So while `KeySym 0 (NoSymbol)` is an obvious pick, it isn't so good inside `XKeycodeToKeysym`.

Another example is when a default prime-field element, 0, caused `.mul_inverse()` to fail. What a poor implementation of multiplicative inverses when it doesn't even work for the *default* prime-field element! The *default*, I tell you! (...and I haven't told you much, because defaults are not characterised by anything *in general*.)

The bad examples of defaults are general to any programming language.

## Does your `Default` *do* anything?

To check if you understand and appreciate how arbitrary defaults should be capable of being, try and see if you agree with some of the instances found in [`acme-default`](https://hackage.haskell.org/package/acme-default/docs/Data-Default.html) package:

- The `Default False` is the answer to the question whether mniip has a favourite Bool.
- The `Default Char` is `'→'` because arrows look fancy when you use them in a chat.
- The `Default Double` is `1.1102230246251565e-16` as the difference between 1 and `sum (replicate 10 0.1)`.
- The `Default Float` is `388.38`, which is approximately equal to twice the molar mass of caffeine in grams per mol.
- The `Default Int` is `18871`, which is the product of a Sophie-Germain prime and a safe prime. You know, for safety *and* for Sophie.
- The `Default Int8` is `29` for *obvious reasons*.

The mockery here serves to highlight the conceptual mistake that defaults are often embedded with meaning that is not warranted in light of being a default, because defaults don't have special meaning.

## Rust: A `Default` case-study

An example of when `Default` is used in Rust can be found in the [Axum web framework](https://github.com/tokio-rs/axum/blob/main/axum/src/routing/mod.rs#L88-L96):

```rust
impl<S, B> Default for Router<S, B>
where
    B: HttpBody + Send + 'static,
    S: Default + Clone + Send + Sync + 'static,
{
    fn default() -> Self {
        Self::with_state(S::default())
    }
}
```

It says that a web app's state must `impl Default`.

This makes you able to start a web app "from scratch".

Is this made carefully?

Because Axum is a web framework and not a web app, providing a generic way to pass the default starting state also passes on the responsibility of defining sensible defaults to the web app developer. Different web apps may use "default" to mean "initial", "empty", or "demo" at their own discretion.

`Default`'s lack of any properties seems to make it a legit placeholder here.

## Summary

Implicit assumptions about the properties of a default for some specific type may hold in some contexts. They may also eventually propagate into errors, like in the examples above. Any legal value of a type should be a valid default.

You may prefer one default over another, but you shouldn't have to.

The recommended pattern in Haskell is to have named value bindings:

```haskell
-- | The default configuration for trying out the software
defaultConfig :: Config
defaultConfig = ...

-- | The default shortcut key for interacting with the software
defaultModMask :: ModMask
defaultModMask = controlMask
```

so that any special context can be referred to in the name of the binding.

In Rust we're stuck with having `Default` in the standard library, so we cannot treat it with the same degree of aversion, since it may occur in the wild. Instead we have to treat it with respect and care, because its only pseudo-property is fragile: It shouldn't matter what the default is.

While avoiding `Default` in Rust is not a general recommendation, the practice of naming things transcends languages. If an `impl Default` demonstrates other properties (i.e. needs to be some value to work, or breaks something when changed), it is probably more than a default. It doesn't have to be the `impl` of any trait, and naming it may be a better option.

**Do you have examples of when a sketchy `Default` caused problems down the line?**

*(Cover art generated by [DreamStudio.ai](https://dreamstudio.ai) asking it to draw "default")*
