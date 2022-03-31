+++
title = "Has-style traits in Rust"
+++

I recently experimented with [Rust trait instances on bounded generic types](https://simonshine.dk/blog/rust-traits/). This is the fancy way of saying `impl<T: SomeTrait> AnotherTrait for T`, i.e. any number of `AnotherTrait` instances created as a result of the presence of a `SomeTrait` instance.

Here is a similar but slightly more complicated example of that.

I have a number of things that all have a common base set of properties. I'd like for the common base set to be described with one trait, and all the ways in which the things are different to be described with another trait that may depend on the common things.

```rust
/// First, a simple base struct:
///
/// It contains things that are common to a set of structs.
#[derive(Debug, Clone)]
struct Base {
    foo: u64,
    bar: u64,
}

impl Base {
    fn new(foo: u64, bar: u64) -> Self {
        Self { foo, bar }
    }
}

/// Then, a trait that describes it
///
/// This is an abstract interface over the same struct. It allows us to
/// access other structs as if they were `Base`, as long as they have
/// some way to access a `Base`, e.g. by having a field of type `Base`.
trait BaseTrait {
    fn foo(&self) -> u64;
    fn bar(&self) -> u64;
}

/// Next, a trait that describes things that contain `Base`s
trait HasBase {
    fn get_base(&self) -> Base;
}

/// ...of which the simplest one is that `Base` has itself
impl BaseTrait for Base {
    fn foo(&self) -> u64 {
        self.foo
    }

    fn bar(&self) -> u64 {
        self.bar
    }
}

/// This is the crux:
///
/// A recursive trait instance that enables `BaseTrait`
/// calls on any thing that `HasBase` (i.e. has a `Base`).
impl<T: HasBase> BaseTrait for T {
    fn foo(&self) -> u64 {
        self.get_base().foo()
    }

    fn bar(&self) -> u64 {
        self.get_base().bar()
    }
}

/// Now, a `Thing` with a `Base`
#[derive(Debug, Clone)]
struct Thing {
    base: Base,
    baz: u64,
}

impl Thing {
    pub fn new(base: Base, baz: u64) -> Self {
        Thing { base, baz }
    }
}

/// If `BaseTrait` had many functions, we'd save a lot of lines here.
///
/// This `impl HasBase for Thing` implies `impl BaseTrait for Thing`.
impl HasBase for Thing {
    fn get_base(&self) -> Base {
        self.base.clone()
    }
}

/// So far, this is all great!
///
/// Now I want to make another trait that depends on BaseTrait
trait ExtensionTrait: BaseTrait {
    fn foo_bar_sum(&self) -> u64 {
        self.foo() + self.bar()
    }

    fn bar_baz_sum(&self) -> u64 {
        self.bar() + self.baz()
    }

    fn baz(&self) -> u64;
}

/// And what's more natural than give this trait to `Thing`
impl ExtensionTrait for Thing {
    fn baz(&self) -> u64 {
        self.baz
    }
}

fn main() {
    let some_thing = Thing::new(Base::new(2, 3), 5);

    println!(
        "foo = {}, bar = {}, baz = {}",
        some_thing.foo(),
        some_thing.bar(),
        some_thing.baz(),
    );

    println!(
        "foo + bar = {}, bar + baz = {}",
        some_thing.foo_bar_sum(),
        some_thing.bar_baz_sum()
    );
}
```