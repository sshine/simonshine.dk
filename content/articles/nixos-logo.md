+++
date = '2025-12-30T03:23:47+01:00'
draft = false
title = 'Animating the NixOS logo'
tags = ['nix', 'rust']
+++

I really like NixOS.

I also like to draw the NixOS logo.

While there are SVGs and PNGs at [github:nixos/branding][nixos-branding], the logo is very geometric
and should be easily expressed as a program. My first attempt with [turtle graphics][web-sys-turtles]
was an experiment to work with HTML Canvas via Wasm. It works by instructing a small robot turtle,
Bob, to walk and paint in the shape of a λ; you then repeat that six times:

```rust
fn draw_snowflake(bob: &mut CanvasTurtle, long: f64, short: f64, gap: f64) {
    const COLORS: [&str; 2] = ["#7EBAE4", "#5277C3"];
    for i in 0..6 {
        bob.fill_color(Some(COLORS[i % COLORS.len()].to_string()));
        bob.line_color(COLORS[i % COLORS.len()]);
        draw_lambda(bob, long, short);
        bob.forward(short * 1.5);
        bob.left(60.0);
        bob.forward(gap);
    }
}
```

I parameterised the lengths of the lambda; the official logo doesn't specify the lengths.

I proceeded to draw the NixOS logo inside itself a few times in a crude way:

```rust
fn draw_nested_snowflakes(bob: &mut CanvasTurtle) {
    bob.teleport(Position::new(400.0 - 120.0, 400.0 + 200.0), bob.angle());
    draw_snowflake(bob, 600.0, 150.0, 32.0);

    bob.teleport(Position::new(400.0 - 50.0, 400.0 + 50.0), bob.angle());
    draw_snowflake(bob, 200.0, 50.0, 8.0);

    bob.teleport(Position::new(400.0 - 25.0, 400.0), bob.angle());
    draw_snowflake(bob, 60.0, 15.0, 2.0);

    bob.teleport(Position::new(400.0 - 18.0, 400.0 - 15.0), bob.angle());
    draw_snowflake(bob, 15.0, 3.75, 0.0);
}
```

Drawing the Nix flake within the Nix flake: Nixception!

![NixOS Inception](/img/nixos-inception.png)

Drawing a single lambda was done by exploring left and right until it looked right:

```rust
fn draw_lambda(bob: &mut CanvasTurtle, long: f64, short: f64) {
    bob.pen_down();

    bob.forward(long);
    bob.right(120.0);
    bob.forward(short);
    bob.right(60.0);
    bob.forward(short);
    bob.left(120.0);
    bob.forward(short);
    bob.right(60.0);
    bob.forward(short / 2.0);
    bob.right(60.0);
    bob.forward(short / 2.0);
    bob.right(60.0);
    bob.forward(short * 1.5);
    bob.left(60.0);
    bob.forward(short);
    bob.right(60.0);
    bob.forward(short);
    bob.right(120.0);

    bob.pen_up();
}
```

[nixos-branding]: https://github.com/sshine/web-sys-turtles
[web-sys-turtles]: https://github.com/sshine/web-sys-turtles

Sure, compile-time animation you say. I want to see the logo move!

## Boids

One of my students wrote a boids simulator in JavaScript where the boids change color based on their
neighbors. I really liked the idea and made something similar; celebrating new year's, a clique of
boids will explode into fireworks if they hang out too much, and every once in a while, they
collectively take the shape of the NixOS logo.

{{< rawhtml >}}
<canvas id="canvas" style="width: 100%; height: 100%;"></canvas>
<script src="/js/boids.js"></script>
{{< /rawhtml >}}

*(Slightly broken on mobile, since the NixOS logo has a fixed size that may exceed your screen, and
boids following the logo will wrap around the screen and accidentally break formation.)*

![Nix boids](/img/nix-boids.png)

It does kind of look like six dicks.
