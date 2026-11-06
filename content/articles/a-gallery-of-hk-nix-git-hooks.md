+++
date = '2026-11-05T11:19:29+02:00'
draft = false
title = 'A gallery of hk-nix git hooks'
tags = ['nix', 'git']
+++

I've been obsessed with git commit hooks this year. Since discovering [lefthook.nix][lefthook-nix]
this year, and later replacing it with my own [hk-nix][hk-nix] wrapper around hk, I've been enjoying
faster and less buggy commit hooks with support for git 2.54's config-based hooks.

[lefthook-nix]: https://simonshine.dk/articles/lefthook-treefmt-direnv-nix/
[hk-nix]: https://simonshine.dk/articles/git-config-based-hooks-with-hk-nix/

This is a walkthrough of all the git hooks I've made this year. 36 of my repositories have a
`nix/hooks.nix`. Every one of them started as a copy of the previous one, and then grew whatever
that project turned out to need.

I read through all of them and collected the distinct hooks into an [examples directory][ex] in
[hk-nix][hk-nix].

[ex]: https://github.com/nix-tools/hk-nix/tree/main/examples
[hk-nix]: https://github.com/nix-tools/hk-nix

Each file there is a flake-parts module of the shape a project keeps in `nix/hooks.nix`, so you can
copy one into your own flake and change the paths.

## Which hook a check belongs in

Almost every decision in those files is about placement, not about the command.

**pre-commit** runs on every commit, so it has to be instant, and it is the only hook allowed to
rewrite the tree. That's what `fix = true` and `stash = "git"` are for: hk applies the fix and puts
unstaged work aside while it does, so a partial `git add -p` survives.

**commit-msg** has to be instant for the same reason.

**pre-push** is allowed to take seconds. It is the last point where catching something is still
cheap, and it is where everything that reads the whole workspace goes: clippy, the test suite, the
generators.

It's not always perfect to put a `nix flake check` as a pre-commit hook, so depending on the time it
takes, it may end up as a pre-push hook, simply because it often reads the whole git tree. It's
possible to spread those checks [across several steps][fch].

[fch]: https://github.com/nix-tools/hk-nix/blob/main/examples/flake-check-hook.nix

## Formatting and commit messages

To check code (and Markdown) formatting using [treefmt][tfmt] on pre-commit, and to check
[check_conventional_commit][ccc] on commit-msg belong to every project. [treefmt-nix][tfmt-nix] owns
which formatter handles which syntax, and hk-nix only decides when it runs. It's a bit superfluous
with both hk-nix and treefmt-nix, but I like what both have to offer.

I moved the [deadnix][dn] dead-code eliminator to a pre-push hook; it doesn't offer to rewrite the
tree with the dead code eliminated, and it might not be the right choice.

[tfmt]: https://github.com/nix-tools/hk-nix/blob/main/examples/treefmt.nix
[tfmt-nix]: https://github.com/numtide/treefmt-nix
[ccc]: https://github.com/nix-tools/hk-nix/blob/main/examples/conventional-commits.nix
[dn]: https://github.com/nix-tools/hk-nix/blob/main/examples/nix-hygiene.nix

## Regenerate auto-generated files

Auto-generated files should generally not be committed to git, since it provides noise. But
sometimes auto-generating files to be committed is exactly the point of their existence.

An example is this [cargo-readme] hook: the hook regenerates it to stdout, diffs, and offers the
write as its fix:

[cargo-readme]: https://github.com/webern/cargo-readme/

```nix
# examples/cargo-readme.nix
readme = "${cargo-readme} ${readmeArgs} | ${mdformat} -";
...
hk-nix.settings.hooks."pre-push".steps.readme = {
  check = "${readme} | diff - README.md";
  fix = "${readme} > README.md";
};
```

Piping through mdformat is a necessity. Read [hk-nix and mdformat gotchas](/articles/hk-nix-mdformat-gotchas/).

## Scanning for secrets

Secret scanning is run on pre-commit rather than pre-push, because catching a leak one hook later is
tedious. By then it is in the local git history and the secret has to be surgically removed, or
rotated, since orphaned git objects persist longer than you might think.

```nix
betterleaks.check =
  "${lib.getExe pkgs.betterleaks} dir --redact --no-banner --config .betterleaks.toml {{files}}";
```

`--redact` makes the hook not print the secret it just found into a terminal or a CI log.

Another secrets-related git commit hook is [sops-rekey][sr], which catches a secret that is no
longer encrypted to the recipients `.sops.yaml` would assign it (the user forgot to run `sops
updatekeys`). There is no read-only way to ask sops that, so the check re-keys a throwaway copy of
each file and sees whether anything changed.

```nix
let rekey-check = ...; in
{
  hk-nix.settings.hooks."pre-commit".steps.sops-rekey = {
    glob = [ ".sops.yaml" "secrets/*.yaml" ];
    check = lib.getExe rekey-check;
  };
}
```

[sr]: https://github.com/nix-tools/hk-nix/blob/main/examples/sops-rekey.nix

## Valid git tags

I have a pre-push hook that prevents me from `git tag`'ing a release with a version that differs
from Cargo.toml:

```nix
# examples/tag-version.nix
hk-nix.settings.hooks."pre-push".steps.tag-version.check =
  ''printf '%s\n' "{{hook_stdin}}" | ${lib.getExe check-tag-version}'';
```

## Hermetic build guards

[hermetic-assets][ha] is a pre-push hook that checks that the build process doesn't include attempts
to download files, since Nix sandboxes are intentionally network-isolated. This kind of problem
occurs when you start depending on JavaScript ecosystem components.

```nix
let rg = lib.getExe pkgs.ripgrep; in
{
  hk-nix.settings.hooks."pre-push".steps.hermetic = {
    glob = "*.rs";
    check = ''! ${rg} --quiet -e 'asset!\("https?://' -e 'host: *Asset' -e 'iconify::' {{files}}'';
  };
};
```

[strip-comments][sc] deletes every comment that is not a doc comment, with ast-grep rules built
from Nix. That one has its own post:
[hk-nix + ast-grep: Remove all comments](/articles/hk-nix-ast-grep-remove-all-comments/).

[ha]: https://github.com/nix-tools/hk-nix/blob/main/examples/hermetic-assets.nix
[sc]: https://github.com/nix-tools/hk-nix/blob/main/examples/strip-comments.nix

There's a bunch more at [github:nix-tools/hk-nix/examples][hk-nix-examples].

[hk-nix-examples]: https://github.com/nix-tools/hk-nix/tree/main/examples
