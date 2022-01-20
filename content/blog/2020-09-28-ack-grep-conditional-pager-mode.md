+++
title = "Conditionally go into pager mode when grepping (acking)"
+++

There is a general theme in GNU shell commands that if a program is able to deliver ANSI-colored output, it only does so in interactive shells, or if explicitly instructed. If you want to pipe output but have colors remain for later printing, you sometimes have to augment both the sending and the receiving command.

Of the many alternatives to `grep` I use `ack`.

Given the following `~/.ackrc`,

```
--flush
--pager
less -R -F
```

whenever I `ack` for something, it uses `less` as a pager, and if the search results fit a screen, it just prints them, including colors, and otherwise it enters `less`'es interactive mode.

Here the `ack` parameters are explained:

- The parameter `--flush` tells `ack` to "*flush output immediately.  This is off by default unless ack is running interactively (when output goes to a pipe or file).*" So with `--flush`, output is always sent immediately.

- The parameter `--pager` tells `ack` to pipe its output through `less -R -F`. This is equivalent to always running `ack ... | less -R -F` when typing `ack ...`.

Here the `less` parameters are explained:

- `-R` (`--RAW-CONTROL-CHARS`) prints ANSI color escape sequences. That means colored output and not a bunch of `ESC[1;39m` codes.
- `-F` (`--quit-if-one-screen`) "*causes less to automatically exit if the entire file can be displayed on the first screen.*"

The one drawback I have experienced so far is that if you do a very slow `ack` with very few results that don't take up a lot of screen space, you won't get those results until `ack` has finished or it eventually uses an entire screen, since then it knows to activate the pager rather than print directly.

You can circumvent this last quirk with `less -X` (`--no-init`) which "*disables sending  the  termcap  initialization  and  deinitialization strings to the terminal,*" but it means that `less` will not wipe its output from the terminal when you hit <kbd>q</kbd>.

Decide which drawback you like less, or let me know of third options!