+++
title = "Implement Rust trait for all types that have another trait"
+++
Rust traits are powerful. A particularly neat thing you can do is implement a trait for several types at once. To give a simple example, a trait for squaring numbers mainly depends on multiplying them:

```rust
trait Square {
    fn square(&self) -> Self;
}
```

We could implement this trait for a single type like so:

```rust
impl Square for u64 {
    fn square(&self) -> Self {
        self * self
    }
}
```

But instead of adding `impl Square for ...` for each type we want to `.square()`, this `impl` can be generalised to all types that `impl Mul`:

```rust
impl<T: Mul<Output = T> + Copy> Square for T {
    fn square(&self) -> Self {
        *self * *self
    }
}
```

The key here is `impl<T: ...> Square for T { ... }`, that is, `for T`, the type that the `impl` takes as parameter. When eventually the constraints on `T` become too many, they can be moved to a `where` clause:

```rust
impl<T> Square for T
where
    T: Mul<Output = T> + Copy,
{
    fn square(&self) -> Self {
        *self * *self
    }
}
```

Here's an example of `.square()` being used for multiple types that already `impl Mul`:

```rust
fn main() {
    println!(
        "{}, {}, {}, {}",
        10u8.square(),
        3u16.square(),
        4u32.square(),
        5u64.square()
    );
}
```