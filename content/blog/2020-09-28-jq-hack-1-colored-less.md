+++
title = "jq hack #1: colored less"
+++

Sometimes you want to look at a lot of JSON output in the terminal. Sometimes this JSON output is nicely formatted, and often it is compacted by a REST endpoint. Examples of verbose output:

```
$ kubectl get nodes -o json
$ curl 'https://hacker-news.firebaseio.com/v0/topstories.json'
```

In both cases you can pipe the output through:

```
$ ... | jq -C . | less -R
```

The `-C` parameter to `jq` forces colors. When omitted, `jq` will only print colors when an interactive terminal is detected. Piping further into `less` removes the colors. Additionally, we have to tell `less` to interpolate those ANSI colors so that we don't see a bunch of `ESC[1;39m` codes.

```json
$ kubectl get nodes -o json | jq -C . | less -R
{
  "apiVersion": "v1",
  "items": [
    {
      "apiVersion": "v1",
      "kind": "Node",
      "metadata": {
        "annotations": {
...
:
```

Here,
  - `jq -C`:
    ```
    --color-output / -C and --monochrome-output / -M:

    By default, jq outputs colored JSON if writing to a terminal.
    You can force it to produce color even if writing to a pipe
    or a file using -C, and disable color with -M.
    ```
  - `less -R`:
    ```
    -R or --RAW-CONTROL-CHARS
    
    Like -r, but only ANSI "color" escape sequences are output in
    "raw" form. Unlike -r, the screen appearance is maintained
    correctly in most cases. ANSI "color" escape sequences are
    sequences of the form:

        ESC [ ... m

    where the "..." is zero or more color specification characters.
    For the purpose of keeping track of screen appearance, ANSI color
    escape sequences are assumed to not move the cursor. [...]
    ```
