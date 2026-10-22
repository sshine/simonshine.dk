+++
date = '2026-10-21T14:10:00+02:00'
draft = false
title = 'hk-nix + ast-grep: Remove all comments'
tags = ['nix', 'rust']
+++

Here's a git pre-commit hook for removing all comments that relies on [hk-nix][hk-nix-article].

[hk-nix-article]: /articles/git-config-based-hooks-with-hk-nix/

It enforces the removal of all source code comments besides certain doc comments.

In Rust, comments that begin with `///` or `//!`, for example.

For a particular project, this addresses source code in Rust, Nix, YAML and shell scripts.

The reason is that recent AI coding models obnoxiously litter all source code with excessive
thinking. One may wonder: Are these comments here to improve the context for when the coding agent
comes around another time, or do they only serve [watermarking mandated by the EU AI Act][wat]?

[wat]: https://www.anthropic.com/news/claude-text-watermark

It turns out that coding agents don't perform better by reading these source code comments.

So they are trash and should be deleted. Well, you might want to keep some comments because they
show up in public documentation elsewhere, like on [docs.rs][docs-rs], or propagated to README files
via [cargo-readme][cargo-readme], like [here][hp-cr].

[docs-rs]: https://docs.rs/hashpinner/latest/hashpinner/
[cargo-readme]: https://github.com/webern/cargo-readme/
[hp-cr]: https://github.com/sshine/hashpinner/blob/a15baf807ecf72d0d4d90ba0098459bc2be6da5f/nix/hooks.nix#L14-L25

## Why not a regex

Stripping comments is somewhat trivial; you pattern match against a somewhat trivial pattern and
remove the lines. But using a method that isn't syntax sensitive turns out to be a problem in edge
cases:

```rust
let url = "https://example.com";       // the // in the string is not a comment
let raw = r#"a // b and /* c */"#;     // nor are these
let ch = '/';
```

```nix
url = "https://example.com/page#fragment";
script = ''
  # a shell comment inside an indented string
'';
```

```bash
#!/usr/bin/env bash
echo "a # b"
```

## ast-grep

[ast-grep] is tree-sitter based and is packaged in nixpkgs and links grammars for Rust, Nix, YAML
and Bash statically, so none of the four needs a dynamic library or a custom language registration.

[ast-grep]: https://ast-grep.github.io/

## The four syntaxes

### Rust

This is the one worth looking at, because the doc distinction is structural. tree-sitter-rust gives
`line_comment` and `block_comment` a `doc` field whose child is a `doc_comment`, and its own
highlight queries lean on it:

```scheme
(line_comment) @comment
(line_comment (doc_comment)) @comment.documentation
```

So the rule is "a comment with no `doc_comment` child", and no part of it reads the comment's text:

```yaml
id: rust-comment
language: rust
rule:
  any:
    - kind: line_comment
    - kind: block_comment
  not:
    has:
      kind: doc_comment
fix: ""
```

Here, `fix: ""` replaces a matched node with the empty string.

The grammar classifies edge cases like `////` and `/***/` as ordinary rather than doc comments.

### Nix, where it does not

tree-sitter-nix only has one type of comment, covering both syntaxes:

```js
comment: ($) =>
  token(choice(seq("#", /.*/), seq("/*", /[^*]*\*+([^/*][^*]*\*+)*/, "/"))),
```

It is a `token(...)`, so it is a leaf with no children. There is no doc distinction and no marker
node, which means a policy of "keep `/** */` in Nix" cannot be expressed structurally at all; you
would be back to `text().starts_with("/**")`. Deleting all of them keeps the rule structural:

```yaml
id: nix-comment
language: nix
rule:
  kind: comment
fix: ""
```

What the grammar *does* give you is the tokenization.

A `#` in a URL and a `#` inside a `''…''` string block are not comment tokens, so they won't be matched.

### YAML

Same situation as Nix: a `#` inside a quoted scalar is safe for the same reason:

```yaml
id: yaml-comment
language: yaml
rule:
  kind: comment
fix: ""
```

### Shell, where one guard is needed

tree-sitter-bash classifies a shebang as a `comment` node.

Without an exception, this rule deletes the first line of every script in the repository:

```yaml
id: bash-comment
language: bash
rule:
  kind: comment
  not:
    regex: '^#!'
fix: ""
```

## Generating the rules from Nix

ast-grep looks for an `sgconfig.yml` with a `ruleDirs` list. Rather than putting five files in the
repository root, build them into the store, so the rules are pinned to the hook that uses them:

```nix
# nix/_comment-rules.nix
{ runCommand, writeText }:
let
  sgconfig = writeText "sgconfig.yml" ''
    ruleDirs:
      - rules
  '';

  rust = writeText "rust.yml" ''
    id: rust-comment
    language: rust
    severity: error
    message: only rustdoc comments are allowed
    rule:
      any:
        - kind: line_comment
        - kind: block_comment
      not:
        has:
          kind: doc_comment
    fix: ""
  '';

  # ... nix.yml, yaml.yml, bash.yml the same way
in
runCommand "comment-rules" { } ''
  mkdir -p $out/rules
  cp ${sgconfig} $out/sgconfig.yml
  cp ${rust} $out/rules/rust.yml
''
```

## Wiring ast-grep into hk

The ast-grep step needs `check` to report without writing, and `fix` to write and then fail, so the
commit stops with the removal in the working tree:

```nix
# nix/hooks.nix
let
  rules = pkgs.callPackage ./_comment-rules.nix { };
  scan = "${pkgs.ast-grep}/bin/ast-grep scan -c ${rules}/sgconfig.yml";
in
{
  hk-nix.settings.hooks."pre-commit".steps.strip-comments = {
    glob = [ "*.rs" "*.nix" "*.yaml" "*.yml" "*.sh" ];
    exclude = [ "charts/**" ];
    exclusive = true;
    check = "${scan} --error {{files}}";
    fix = "${scan} --error {{files}} || { ${scan} --update-all {{files}}; exit 1; }";
  };
}
```

`exclusive = true` keeps it from running in parallel with treefmt, since both write to the same
files.

Naming it so it sorts before `treefmt`, and hk runs it first and alone.

`--error` exits non-zero when a rule matches.

## The whole thing

Here are the ast-grep configuration that enable comment stripping:

```nix
# nix/_comment-rules.nix
{ runCommand, writeText }:
let
  sgconfig = writeText "sgconfig.yml" ''
    ruleDirs:
      - rules
  '';

  rust = writeText "rust.yml" ''
    id: rust-comment
    language: rust
    severity: error
    message: only rustdoc comments are allowed
    rule:
      any:
        - kind: line_comment
        - kind: block_comment
      not:
        has:
          kind: doc_comment
    fix: ""
  '';

  nix = writeText "nix.yml" ''
    id: nix-comment
    language: nix
    severity: error
    message: no comments are allowed in Nix
    rule:
      kind: comment
    fix: ""
  '';

  yaml = writeText "yaml.yml" ''
    id: yaml-comment
    language: yaml
    severity: error
    message: no comments are allowed in YAML
    rule:
      kind: comment
    fix: ""
  '';

  bash = writeText "bash.yml" ''
    id: bash-comment
    language: bash
    severity: error
    message: no comments are allowed in shell
    rule:
      kind: comment
      not:
        regex: '^#!'
    fix: ""
  '';
in
runCommand "comment-rules" { } ''
  mkdir -p $out/rules
  cp ${sgconfig} $out/sgconfig.yml
  cp ${rust} $out/rules/rust.yml
  cp ${nix} $out/rules/nix.yml
  cp ${yaml} $out/rules/yaml.yml
  cp ${bash} $out/rules/bash.yml
''
```

And the hook module that calls it:

```nix
# nix/hooks.nix
{ inputs, ... }:
{
  imports = [ inputs.hk-nix.flakeModules.default ];
  perSystem =
    {
      config,
      pkgs,
      lib,
      ...
    }:
    let
      treefmt = lib.getExe config.treefmt.build.wrapper;

      rules = pkgs.callPackage ./_comment-rules.nix { };
      astGrep = "${pkgs.ast-grep}/bin/ast-grep";
      scan = "${astGrep} scan -c ${rules}/sgconfig.yml";
    in
    {
      hk-nix.settings.hooks = {
        "pre-commit" = {
          fix = true;
          stash = "git";
          steps = {
            strip-comments = {
              glob = [
                "*.rs"
                "*.nix"
                "*.yaml"
                "*.yml"
                "*.sh"
              ];
              exclude = [ "charts/**" ];
              exclusive = true;
              check = "${scan} --error {{files}}";
              fix = "${scan} --error {{files}} || { ${scan} --update-all {{files}}; exit 1; }";
            };

            treefmt.check = "${treefmt} --fail-on-change --no-cache {{files}}";
            treefmt.fix = "${treefmt} {{files}}";
          };
        };

        "pre-push".steps = {
          deadnix.glob = "*.nix";
          deadnix.check = "${lib.getExe pkgs.deadnix} --fail {{files}}";
          clippy.check = "cargo clippy --all-targets --all-features -- -D warnings";
          lock-check.check = "cargo metadata --locked --format-version 1 > /dev/null";
        };

        "commit-msg".steps.conventional.builtin = config.hk-nix.builtins.check_conventional_commit;
      };
    };
}
```

`callPackage` takes the rules from the same nixpkgs the hook's ast-grep comes from, so the rules and
the binary that reads them are pinned together.

## Gotchas

### `--update-all --error` exits 0

The obvious spelling of `fix` does not work:

```console
$ ast-grep scan -c $CFG --update-all --error fix/ ; echo "exit=$?"
exit=0
```

`--error` reports what still matches, and after `--update-all` nothing does. The step would fix the
files and then report success, so the commit would go through. I actually prefer failure to remind
myself or coding agents that illegal comments were added.

### The walker skips hidden directories

ast-grep walks like ripgrep, which means `.github/` is invisible by default:

```console
$ ast-grep scan -c $CFG . | grep -c '.github'
0
$ ast-grep scan -c $CFG --no-ignore hidden . | grep -c '.github'
21
```

With hk this is not a problem, because hk passes staged paths explicitly. In the corresponding
`justfile` recipe, this is a problem, though, and silently ignores hidden files. Any recipe that
walks files using ast-grep needs `--no-ignore hidden`.

### Skip Helm templates

Helm templates end in `.yaml` but contain Go template syntax that produces YAML.

Using a YAML parser to strip comments from these would break the templates.

So I choose to ignore them. They're always located in `charts/**`.

Besides, most chart comments live in `values.yaml` and serve as the chart's interface documentation.

### It leaves the blank line

`fix: ""` removes the node, not the line it sat on:

```rust
let x = 1; // trailing
// own line
```

becomes a line with trailing whitespace and an empty line.

The extra whitespace gets fixed by treefmt which runs immediately afterwards in a separate hook.
