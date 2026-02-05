+++
date = '2026-01-25T01:11:55+01:00'
draft = false
title = 'zsh config for NixOS + nix-darwin'
tags = ['nix']
+++

## tl;dr:

- I'm taking Nix more seriously on my MacBook
- I want to share my zsh config across all systems
- Because my zsh config was NixOS-only, I've had to refactor it

## Why

I've been running NixOS for 3 years now.

During this whole time I've also owned a MacBook.

And while I started installing Nix on my MacBook, I didn't really appreciate it until installing
NixOS on an x86-64-based laptop. Nix, compared to Homebrew, just felt complicated and unnecessary
as a way to install programs.

Fast-forward, I've fully synced my basic Nix configuration between my NixOS servers and my NixOS
laptops: One git repository, multiple system configurations via a flake, sharing nixosModules when
possible. My shell, editor and basic terminal programs are the same across all systems, which is
amazing.

[Leaving my job as a teacher][quit-teaching] and handing back the work MacBook, I've found myself
having to re-occupy my personal MacBook. I've reset it and want to get the Nix setup right. Using
[nix-darwin][nix-darwin] and [Determinate Nix][det-nix], I want to fully replace Homebrew.

> **Disclaimer:** I don't run Determinate Nix on my NixOS machines. While I don't share the full
> perspective of the [118-post thread criticising Determinate Nix][det-nix-discourse] spanning more
> than two months, I do think there's something speculative about running binary blobs in your free
> system. Since I trust the people at Determinate Nix at a personal level, this is mainly a
> principle. Since my MacBook is full of binary blobs, it's not a free system, and it should be a
> perfect place to test Determinate Nix to evaluate its functionality.

[quit-teaching]: /articles/end-of-teaching-retrospective
[nix-darwin]: https://github.com/nix-darwin/nix-darwin
[det-nix]: https://docs.determinate.systems/determinate-nix/
[det-nix-discourse]: https://discourse.nixos.org/t/announcing-determinate-nix/54709

## Export zsh configuration

I'm not quite ready to merge my nix-darwin flake into my NixOS systems flake.

I don't think it's a good idea, either. Flakes only have one set of inputs.

So when too many machines share a flake, they all share inputs.

But I'm taking one step towards modularizing the parts that I'm using across system config flakes.

Besides `nixosConfigurations`, the flake schema also exposes `nixosModules` and `darwinModules`.



```nix
{
  description = "sshine's VPS config";

  inputs = { ... };

  outputs = { self, nixpkgs, ... } @ inputs:
  {
    nixosConfigurations.server = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      specialArgs = inputs;
      modules = [ ./machines/server-config.nix ];
    };

    # ...

    nixosModules = {
      zsh = ./programs/zsh.nix;
      vim = ./programs/vim.nix;
    };

    darwinModules = {
      zsh = ./programs/zsh.nix;
      vim = ./programs/vim.nix;
    };
  };
}
```

`nixosModules` and `darwinModules` are not the same: The two systems have different options.

So when exposing the same modules, you have to make sure they're compatible with both sets.

It's kind of like writing a shell script that works in two shells.

You stick to the common denominators, and you fall back to `interactiveShellInit` when nothing else works.

I'll share the zsh config, and then summarize what I needed to change to make it cross-platform compatible.

```nix
# Platform-agnostic zsh configuration (works on NixOS and nix-darwin)
{ pkgs, ... }:
{
  environment.systemPackages = [
    pkgs.atuin # ^R
    pkgs.eza # ls
    pkgs.git # prompt, aliases
    pkgs.zoxide # j, ji commands
    pkgs.zsh-syntax-highlighting
  ];

  # Works on both platforms
  environment.shellAliases = {
    # files
    rm = "rm -iv";
    ls = "eza -lg";
    tree = "eza -lgT";

    # git
    gs = "git status";
    gd = "git diff";
    gdc = "git diff --cached";
    gca = "git commit --amend";
    gcv = "git commit --verbose";
    gap = "git add -p";
    gl = "git log --decorate=short --color | less -R";
    gpr = "git pull --rebase";
    gcp = "git cherry-pick";
    gria = "git rebase -i --autosquash";
    grb = "git rebase -i --autosquash $(git merge-base HEAD master)";
  };

  programs.direnv.enable = true;
  programs.direnv.nix-direnv.enable = true;

  programs.zsh = {
    # Common options (both platforms)
    enable = true;
    enableCompletion = true;

    promptInit = ''
      autoload -U promptinit
      promptinit
      prompt off

      function git_branch_name() {
        branch=$(git symbolic-ref HEAD --short 2>/dev/null)
        if [ ! -z "$branch" ]; then
          echo -n " [%F{red}$branch%f]"
        fi
      }

      # Omit username, print hostname + '$' with red when root, otherwise green:
      # https://zsh.sourceforge.io/Doc/Release/Prompt-Expansion.html
      prompt='[%(!.%F{red}.%F{green})%m%f:%F{blue}%~%f]$(git_branch_name) %(!.%F{red}#%f.$) '

      # See: https://zsh.sourceforge.io/Doc/Release/Options.html#Prompting
      setopt prompt_cr    # print carriage return before printing a prompt in line editor
      setopt prompt_sp    # attempt to preserve partial lines using ansi control chars
      setopt prompt_subst # perform {parameter, command, arithmetic} expansion in prompts

      export PROMPT_EOL_MARK="" # don't show end-of-line marker on partial lines
    '';

    interactiveShellInit = ''
      # Enable bash completion compatibility
      autoload -U bashcompinit && bashcompinit

      # Disable ^S and ^Q flow control
      unsetopt FLOW_CONTROL

      # Copy-paste
      bindkey '^U' kill-whole-line
      bindkey '^Y' yank

      # ^R
      eval "$(atuin init zsh --disable-up-arrow)"

      # j as jumpy cd alternative
      eval "$(zoxide init zsh --cmd j)"

      # Syntax highlighting (must be sourced last)
      ZSH_HIGHLIGHT_HIGHLIGHTERS=(main brackets)
      source ${pkgs.zsh-syntax-highlighting}/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
    '';
  };
}
```

Configuration options that work on both systems:
- `environment.systemPackages`
- `environment.shellAliases`
- `programs.direnv.enable`
- `programs.direnv.nix-direnv.enable`

Configuration options that don't work on nix-darwin:
- Completion
- Syntax highlighting
- `programs.zsh.setOptions` 
- `programs.zsh.shellAliases`

By setting options, loading completion, moving `shellAliases` up one level, and importing syntax
highlighting in `interactiveShellInit`, I've made a module that is both a `nixosModule` and a
`darwinModule`!

I can now put this module in a flake that can be imported by all my systems.
