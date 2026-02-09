+++
date = '2026-02-07T13:44:17+01:00'
draft = false
title = 'Vendoring Hugo themes with Nix and Git'
+++

## tl;dr:

- I forked the git repo for my Hugo theme and pushed my feature to a branch
- I refactored the blog repo's Nix code to be multi-file and flake-based
- I switched my Nix-vendored theme to use this git repo/branch
- I made it possible to use the git repo checked out locally for rapid prototyping
- I retained the possibility to use the Nix-vendored theme (same branch, but committed and pushed)
- I found a way to easily deploy using either pathway without changing files (`--theme`, `just`)

## Context

I migrated this website to Hugo in February 2025:

{{< articlelink href="/articles/hugo-static-site-setup/" title="Setting up a Hugo static website with Nix" date="Feb 24, 2025" >}}

It explains how to bootstrap Hugo using Nix, how to add a theme, a devShell, a justfile, how to do
simple SSH-based deployment, and finally how to add a virtual host to an nginx using Let's Encrypt
on your NixOS webserver.

After having run this blog for a year, I want to make some small changes to the theme:

```diff
commit f5c293ea884660fc5be85d1102e259b1d5b05989 (HEAD -> feat/hovering-heading-anchor-links, origin/feat/hovering-heading-anchor-links)        Author: Simon Shine <simon@simonshine.dk>
Date:   Sun Feb 8 16:02:39 2026 +0100

    feat(theme): add hover anchor links to headings

    Add paragraph sign (¶) anchor links that appear on heading hover,
    making it easy to link to specific sections of articles.

    - Add render-heading.html hook to generate heading anchors
    - Style anchors to appear on hover with smooth transition
    - Position anchors to the left of headings using theme colors

diff --git a/assets/css/_extra.scss b/assets/css/_extra.scss
index 8eaa4d4..1596bce 100644
--- a/assets/css/_extra.scss                                                                                                                   +++ b/assets/css/_extra.scss
@@ -1,2 +1,27 @@
 // Do not add any CSS to this file in the theme sources.
 // This file can be overridden to add project-specific CSS.
+
+// Heading anchor links
+.post-content {
+  h1, h2, h3, h4, h5, h6 {
+    position: relative;
+
+    .heading-anchor {
+      position: absolute;
+      left: -1.2em;
+      padding-right: 0.5em;
+      text-decoration: none;
+      color: $primary-color;
+      opacity: 0;                                                                                                                             +      transition: opacity 0.2s ease-in-out;
+
+      &:hover {                                                                                                                               +        color: $primary-color;
+      }
+    }
+
+    &:hover .heading-anchor {
+      opacity: 1;
+    }
+  }
+}
diff --git a/layouts/_default/_markup/render-heading.html b/layouts/_default/_markup/render-heading.html
new file mode 100644
index 0000000..dae6b57
--- /dev/null
+++ b/layouts/_default/_markup/render-heading.html
@@ -0,0 +1,4 @@
+<h{{ .Level }} id="{{ .Anchor | safeURL }}">
+  {{ .Text | safeHTML }}
+  <a class="heading-anchor" href="#{{ .Anchor | safeURL }}" aria-label="Link to this section">¶</a>
+</h{{ .Level }}>
```

I think those changes might be valuable to the upstream, but I want to deploy them locally regardless.

## Vendoring Hugo themes with git and Nix

The process of making your own copy of 3rd party packages your project is called *vendoring*.
Those copies are traditionally placed inside each project and then saved in the project repository.
The Dfetch project has an [excellent summary of software vendoring][dfetch-vendoring], what it is,
why it's helpful, costs and risks.

[dfetch-vendoring]: https://dfetch.readthedocs.io/en/latest/vendoring.html

Vendoring with git involves either copying your vendored project into your current project, or using
multiple git repos and linking them somehow.

For linking git repos using pure git, I'll quickly summarize the options I know:

- I can copy the theme directory into my blog repo and commit it. Not doing that for above mentioned reasons.
- I can use a [git submodule][git-submodule]. They're most standard, but slightly unergonomic when
  bootstrapping because you constantly need to remember to address your submodules (when
  initializing, when updating).
- I can use a [git subtree][git-subtree]. They're somewhat standard (living in git-contrib), and
  they're an improvement in ergonomics, but they pollute the main git repository with commits
  related to subtrees, and it's harder to sync back changes.
- I can use a [git subrepo][git-subrepo]. These were my favorite for a long time, and something I'd
  consider for a pure git solution. They're a lot less popular, and they seem not up-to-date, but
  they're the best of both worlds in terms of ergonomic and pollution-free.
- I can use a [git subproject][git-subproject]. In doing research on the three options I knew about,
  I encountered another take; they're similarly non-standard as git subrepos, and they use the same
  mechanism as git worktrees, but for nesting repos. These deserve a proper evaluation at a later
  time.

[git-submodule]: https://git-scm.com/book/en/v2/Git-Tools-Submodules
[git-subtree]: https://www.atlassian.com/git/tutorials/git-subtree
[git-subrepo]: https://github.com/ingydotnet/git-subrepo
[git-subproject]: https://github.com/GeoTimber/git-sub-project/blob/main/ARTICLE.md

With Nix, however, I can make cross-repo references using [fetchers][fetchers] such as `fetchFromGitHub`.
This means my sync between repositories is not manual, and they're pollution-free, but they do
depend on the Nix toolchain.

[fetchers]: https://ryantm.github.io/nixpkgs/builders/fetchers/


## Copying the theme directory

Hugo works so that you can pretty much make any theme change directly in your blog.

I've made such changes by adding so-called [shortcodes][shortcodes]; they're not propagated to the
theme.

So when I make another blog and want to re-use them, I have to copy those shortcodes along.

[shortcodes]: https://gohugo.io/content-management/shortcodes/

I have other changes I really want to stick to the theme because they're styling, and I want to
reuse them easily.

What a rookie will do is copy the theme repo into your blog's repo and commit it entirely:

- (+) You can easily edit the theme for your blog.
- (÷) Changes won't propagate to other blogs using the theme.
- (÷) Changes to your theme get mixed with changes to your blog.
- (÷) You no longer get upstream updates to the theme by the original author.
- (+) You don't care if the upstream disappears because you're using a local copy.

I'm almost doing that in shell.nix:

```nix
{ pkgs ? import <nixpkgs> {} }:
  let
    hugo-theme = builtins.fetchTarball {
      name = "hugo-theme-m10c";
      url = "https://github.com/vaga/hugo-theme-m10c/archive/8295ee808a8166a7302b781895f018d9cba20157.tar.gz";
      sha256 = "12jvbikznzqjj9vjd1hiisb5lhw4hra6f0gkq1q84s0yq7axjgaw";
    };
  in
    pkgs.mkShellNoCC {
      packages = [
        pkgs.hugo
        pkgs.just
      ];

      shellHook = ''
        [ -f hugo.toml ] || hugo new site . --force

        mkdir -p themes
        ln -snf "${hugo-theme}" themes/default
      '';
    }
```

The differences are:

- (+) I copy the theme directory at runtime and don't commit it.
- (÷) I can't easily edit the theme for my own blog.
- (+) I can re-use the theme, and I do get upstream changes.
- (÷) If the upstream disappears, my blog breaks.

I'd like to make changes to the theme in a reusable way, and along the way avoid depending on a 3rd
party git repository.

## Revamping the Nix configuration

Until now I've used only a shell.nix, inlining the theme [derivation][derivation].

[derivation]: https://nix.dev/manual/nix/2.18/language/derivations

I like the simplicity, but since I'm going to modify the theme, I'd like a bit more structure:

```sh
[feng:~/Projects/simonshine.dk] [main] $ eza -lg *.nix
.rw-r--r-- 829 sshine users  8 Feb 16:05 flake.nix
.rw-r--r-- 530 sshine users  8 Feb 16:05 default.nix
.rw-r--r-- 275 sshine users  8 Feb 16:05 shell.nix
.rw-r--r-- 387 sshine users  8 Feb 16:05 theme.nix
```

My main reason for introducing a flake here is that I like to have a single entrypoint into my repo:

```nix
{
  description = "The blog for https://simonshine.dk";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
  };

  outputs = inputs@{ self, nixpkgs, flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      perSystem = { config, self', inputs', pkgs, system, ... }:
        let
          theme = pkgs.callPackage ./theme.nix {};
          site = pkgs.callPackage ./default.nix { inherit theme; };
          shell = pkgs.callPackage ./shell.nix { inherit theme; };
        in {
          devShells.default = shell;
          packages = {
            theme = theme;
            site = site;
            default = site;
          };
        };
    };
}
```

The default.nix serves as a derivation containing the generated site:

```nix
{ pkgs ? import <nixpkgs> {}
, theme ? pkgs.callPackage ./theme.nix {}
}:

pkgs.stdenv.mkDerivation {
  pname = "simonshine-dk";
  version = "0.1.0";

  src = pkgs.lib.cleanSource ./.;

  nativeBuildInputs = [ pkgs.hugo ];

  buildPhase = ''
    mkdir -p themes
    ln -s ${theme} themes/default
    hugo --minify
  '';

  installPhase = ''
    cp -r public $out
  '';

  meta = with pkgs.lib; {
    description = "The blog for https://simonshine.dk";
    homepage = "https://simonshine.dk";
    platforms = platforms.all;
  };
}
```

The shell.nix is mostly the same, with the exception that the theme has been extracted:

```nix
{ pkgs ? import <nixpkgs> {}
, theme ? pkgs.callPackage ./theme.nix {}
}:

pkgs.mkShellNoCC {
  packages = [
    pkgs.hugo
    pkgs.just
  ];

  shellHook = ''
    [ -f hugo.toml ] || hugo new site . --force

    mkdir -p themes
    ln -snf "${theme}" themes/default
  '';
}
```

And theme.nix is only different by living in its own file and by targeting my fork of the theme:

```nix
{ pkgs ? import <nixpkgs> {} }:

pkgs.stdenv.mkDerivation {
  pname = "hugo-theme-m10c";
  version = "8295ee8";

  src = pkgs.fetchFromGitHub {
    owner = "sshine";
    repo = "hugo-theme-m10c";
    rev = "feat/hovering-heading-anchor-links";
    sha256 = "BFwCbYj9K2k6UwYzmnX4sfZ9NjzOdfjUMdesOwdlUn8=";
  };

  installPhase = ''
    mkdir -p $out
    cp -r * $out/
  '';
}
```

Common to all these files is that they work without flakes by defaulting their input to in-directory
or in-path references. The `? import <nixpkgs> {}` part ruins reproducibility, but it's a tradeoff:
You get reproducibility via flakes, you get speed without.

I think this gradual opt-in to flakes is very nice.

This is also a good reason to not inline everything into flake.nix.

## Vendoring Hugo themes with git

I'll fork the original repository and make any changes there.

[My fork][m10c-dev] will serve as a basis for my local deployment as well as propagating the change upstream.

[m10c-dev]: https://github.com/sshine/hugo-theme-m10c

```nix
let
  hugo-theme = builtins.fetchFromGitHub {
    owner = "sshine";
    repo = "hugo-theme-m10c";
    rev = "862c6e941be9bc46ce8adc6a2fa9e984ba647d6f";
    sha256 = "12jvbikznzqjj9vjd1hiisb5lhw4hra6f0gkq1q84s0yq7axjgaw";
  };
in
  ...
```

Nix will automatically fetch and deploy the second git repo.

But now developing on my blog is split between two repos.

For practical development purposes, I want to simply clone my fork:

```sh
git clone git@github.com:sshine/hugo-theme-m10c.git themes/m10c-dev
sed -i "s/^theme = .*/theme = 'm10c-dev'/" hugo.toml
```

## Managing dual deployment modes

When using `nix build .#` for production, the theme gets symlinked to `themes/default` from the Nix store. But for development, I want to use `themes/m10c-dev` as a git clone. The problem is that `hugo.toml` can only specify one theme.

I found four approaches that don't require constantly editing `hugo.toml`, which I'll list below.

I went with option 2 because it aligns with having a justfile, so I can have one just command for
each way to deploy.

### Option 1: Symlink switching

Keep `theme = 'default'` in `hugo.toml`, but control what `themes/default` points to.

For development:
```bash
ln -snf m10c-dev themes/default
```

For production, Nix could handle this automatically in both `shell.nix` and `default.nix`:
```nix
ln -snf "${theme}" themes/default
```

This is simple and works with existing tooling.

The Nix build would always override the symlink during builds anyway.

It's quite elegant, but I fear I might get confused what the symlink points to at any one moment.

### Option 2: Command-line override (my preference)

Hugo accepts a `--theme` flag that overrides the config file setting:

```bash
# Development
hugo server --theme m10c-dev

# Production (using git-cloned development theme)
hugo --theme m10c-dev

# Production (using the Nix-vendored theme; --theme could be omitted)
hugo --theme default
```

This way I don't need to change the config file, I run different commands:

```justfile
# Build the Hugo site using default.nix
build-nix:
    nix build .# --out-link public-result

# Build the Hugo site using shell.nix
build-dev:
    hugo --minify --theme m10c-dev
```

### Option 3: Environment-based config files

Hugo supports per-environment configuration files. Create `config/dev/hugo.toml`:

```toml
theme = 'm10c-dev'
```

Then use different commands for each environment:

```bash
# Development
hugo server --environment dev

# Production (using git-cloned development theme)
hugo --environment dev

# Production (using the Nix-vendored theme; --theme could be omitted)
hugo  # uses default environment
```

The Nix build doesn't specify an environment, so it uses the default configuration.

Since I only change a single option, I'd prefer to not have multiple config files.

### Option 4: Smart shell.nix

Modify the `shellHook` in `shell.nix` to automatically detect and use the local development theme:

```nix
shellHook = ''
  mkdir -p themes

  # Use m10c-dev if it exists, otherwise use vendored theme
  if [ -d themes/m10c-dev ]; then
    ln -snf m10c-dev themes/default
  else
    ln -snf "${theme}" themes/default
  fi
'';
```

This makes the development shell automatically use your local clone when present, while production
builds remain unchanged. While I like this flexibility, the two `just` commands are sufficient for
my needs.

## Summary

Nix lets you vendor software for projects that don't have package managers capable of doing it, or
projects that use multiple toolchains that can't address vendoring cross-toolchain dependencies.

Once configured, vendoring with Nix lets you skip some git complexity.

The standard choices for vendoring with git aren't necessarily the best.
