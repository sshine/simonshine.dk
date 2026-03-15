+++
date = '2026-03-07T23:03:24+01:00'
draft = false
title = 'Vendored theme workflow after one month'
tags = ["nix", "hugo"]
+++

It's exactly one month since I wrote:

{{< articlelink href="/articles/vendoring-hugo-themes-with-nix-and-git" title="Vendoring Hugo themes with Nix and Git" date="Feb 7, 2026" >}}

I read an interesting article, [The Rust Calling Convention We Deserve][mcyoung-rust-cc] by Miguel
Young de la Sota, and I couldn't help but think that the website was really nicely made:
Inspirational use of CSS3, a personal font choice, and proper underlines under hyperlinks.

[mcyoung-rust-cc]: https://mcyoung.xyz/2024/04/17/calling-convention/

## Relearning my workflow

I've made extending my theme operationally easy:

- I fork and vendor my base theme using Nix
- I documented how I did it so that when I come back, I can relearn.

Writing good, actionable documentation is a favorite hobby of mine.

The number of times my own tutorials have helped me after only a month is countless.

In my current case, the CSS itself is somewhat trivial and unimportant.

But this is a tech blog, so here you go:

```diff
diff --git a/assets/css/_base.scss b/assets/css/_base.scss
index 80de984..09b816f 100644
--- a/assets/css/_base.scss
+++ b/assets/css/_base.scss
@@ -8,7 +8,7 @@ html {
 
 body {
   margin: 0;
-  font-family: sans-serif;
+  font-family: "Source Serif 4", Georgia, serif;
   background: $dark-color;
   color: $light-color;
 }
@@ -19,11 +19,13 @@ h1, h2, h3, h4, h5, h6 {
 
 a {
   color: $primary-color;
-  transition: color 0.35s;
+  transition: color 0.35s, border-color 0.35s;
   text-decoration: none;
+  border-bottom: 1px dotted $primary-color;
 
   &:hover {
     color: $lightest-color;
+    border-bottom-color: $lightest-color;
   }
 }
 
diff --git a/assets/css/_extra.scss b/assets/css/_extra.scss
index 1596bce..1f1923a 100644
--- a/assets/css/_extra.scss
+++ b/assets/css/_extra.scss
@@ -11,6 +11,7 @@
       left: -1.2em;
       padding-right: 0.5em;
       text-decoration: none;
+      border-bottom: none;
       color: $primary-color;
       opacity: 0;
       transition: opacity 0.2s ease-in-out;
```

The interesting part is: How do I experiment with the CSS on my live website by switching to the
development version of the theme already cloned into `themes/m10c-dev`? And how do I, once it seems
to work, push this to my fork, [github.com/sshine/hugo-theme-m10c][fork], and switch back to using
the GitHub version?

Almost all of this was quite obvious to me by rereading my blog post from one month ago.

One thing stood out as unintuitive: In order to relink `themes/default` to a newer version after I
pushed my changes to GitHub, I needed to run `just build-nix` as documented in my `justfile`

```justfile
# Build the Hugo site using default.nix
build-nix:
    nix build .# --out-link public-result
```

The idea is that you go to `justfile` to get inspired about relevant commands.

This one seemed to me the most relevant, even though it doesn't obviously say anything about themes.
Because `default.nix` references `theme.nix` it gets re-evaluated.

Another way I could have triggered the theme refetch was to make a trivial change to `flake.nix` so
that direnv would reload, causing the devShell within the flake to re-evaluate `theme.nix`.

This is all very low-technical and hard to relearn: My takeaway is that theme refetching should be
more explicit, e.g. by putting the theme as a flake input. Then I'd know I need to `nix flake
update` it, and I could put that as a `justfile` command that specifically is about bumping the
theme.

[fork]: https://github.com/sshine/hugo-theme-m10c
