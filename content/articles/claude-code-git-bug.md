+++
date = '2025-07-21T13:03:06Z'
draft = false
title = 'Claude Code og git-bug: Når AI har brug for issue tracking'
tags = ['datamatik', 'git']
+++

Jeg prøvede for nyligt at kombinere Claude Code med issue tracking.

Som udvikler er det en udfordring at holde styr på bugs, opgaver og ideer i sine projekter. Vi
mennesker bruger grafiske issue tracking-værktøjer som Jira og GitHub Projects. Personligt har jeg
været glad for [Linear.app][linear-app], som er gratis op til 250 tickets. Claude Code har sit eget
ad-hoc to-do-system, men den er sessionsbundet, og persister ikke med projektet.

[linear-app]: https://linear.app

Jeg har indtil nu brugt Claude Code til at dumpe dens kontekst ind i tekstfiler såsom
[`CLAUDE.md`][claude-code-best-practices], `PLAN.md` og `doc/XYZ.md` så jeg kan vende tilbage til
den forståelse som opbygges omkring delproblemer.

[claude-code-best-practices]: https://www.anthropic.com/engineering/claude-code-best-practices

Det bliver selvfølgelig noget rod, da min `doc/`-mappe er fyldt med alle slags tanker fra problemer
som skal løses, som er løst, og som ikke skal løses alligevel, til måder at designe noget på, som
jeg ikke skal bruge alligevel. Og min `PLAN.md` bliver længere og længere, så jeg enten skal slette
min historik eller flytte den over i andre filer.

I stedet for at genopfinde issue tracking i tekstfiler, vil jeg gerne finde en issue tracker der
virker fra kommandolinjen, så Claude Code kan tilgå den, og så jeg kan søge på features jeg mangler
at lave, gemme beskrivelser af fejl eller design jeg har undersøgt, og tagge ting automatisk.

[git-bug][git-bug] er med 9.400 stjerner på GitHub en embedded bug tracker. Det betyder, at den
gemmer issue-data som git-objekter i ens repository. Dine bugs og feature-anmodninger følger med
koden og kan synkroniseres med git remotes lige som almindelige commits. Ingen eksterne tjenester
eller databaser er nødvendige.

[git-bug]: https://github.com/git-bug/git-bug#git-bug-a-decentralized-issue-tracker

## Bootstrap af nyt værktøj med Claude Code

Jeg sprang [git-bug's officielle installationsvejledning][git-bug-install] over og hoppede direkte
til `brew install git-bug` fordi jeg kører MacOS og gættede. Jeg gættede rigtigt. Det er fint nok
hvis man hader sine fremtidige kollegaer, og gerne vil have, de skal spilde tid på at læse
installationsvejledninger.

For at sikre konsistent installationer på tværs af platforme, kan man tilføje git-bug til sin `shell.nix`:

```nix
{ pkgs ? import <nixpkgs> {} }:
pkgs.mkShell {
  buildInputs = with pkgs; [
    git-bug
    # andre udviklerværktøjer...
  ];
}
```

Claude Code kan derefter instrueres til at køre git-bug kommandoer via `nix-shell --run "git bug
..."`, hvilket garanterer at værktøjet er tilgængeligt uanset den underliggende platform. Dette
eliminerer "works on my machine"-problemer og gør at ting bare virker uden særlig vejledning.

[git-bug-install]: https://github.com/git-bug/git-bug/blob/trunk/INSTALLATION.md

## Help me help you

I processen med at vænne sig til AI-baseret udvikling, bad jeg Claude Code om at lære mig og den om
git-bug:

> I'd like you to use git-bug via the "git bug ..." sub-command. If you don't know how it works,
> familiarise yourself with this command by typing "git bug" and following sub-commands. Write a quick
> summary into `doc/GIT_BUG.md` when done.  For now, I only want you to consider the following action:
> Listing current tickets, adding a ticket, and marking a ticket's status as e.g.  resolved, delayed,
> blocked, or the default state of "todo".

Claude udforskede systematisk git-bug's kommandostruktur og oprettede dokumentation i `doc/GIT_BUG.md`.
Jeg kan efterfølgende bede den forkorte vejledningen og tilføje den direkte til `CLAUDE.md`, som er mit
projekts standard-kontekst.

Det er smart fordi:

- Vejledningen er simplere og mere målrettet end den indbyggede hjælpefunktion
- Claude Code kan ligeledes genlæse vejledningen for at udføre git-bug-kommandoer senere

Det er et eksempel på det man kalder [Context Engineering][context-eng].

[context-eng]: https://rlancemartin.github.io/2025/06/23/context_engineering/

Her er noget den producerede:

> ## Grundlæggende git-bug kommandoer
>
> Baseret på Claude's udforskning, her er de vigtigste kommandoer:
> 
> ```bash
> # List alle tickets
> git bug bug
> 
> # Opret ny ticket
> git bug bug new --title "Bug titel" --message "Beskrivelse"
> 
> # Luk en ticket (markér som løst)
> git bug bug status close [TICKET_ID]
> 
> # Genåbn en ticket
> git bug bug status open [TICKET_ID]
> ```
> 
> **Vigtigt**: Git-bug understøtter kun "open" og "closed" status. Der er ingen
> indbygget support for tilstande som "delayed", "blocked" eller custom
> statuses. For mere komplekse workflows skal man bruge labels eller
> kommentarer.
> 
> ## Brugerinterfaces: termui og webui
> 
> Git-bug tilbyder to interaktive interfaces udover kommandolinjen:
> 
> ```bash
> # Terminal UI (termui)
> git bug termui
>
> # Web UI (webui)
> git bug webui
> ```
> 
> Terminal UI giver en tekstbaseret interface direkte i terminalen, perfekt til
> dem der foretrækker at arbejde uden at forlade deres udvikingsmiljø.  Web UI
> starter en lokal webserver og åbner en moderne web-interface i din browser.
> Dette giver en mere visuelt tilgængelig måde at browse og administrere
> tickets på.

Her er nogle screenshots af hvordan git bug ser ud i terminalen:

![git bug bug](/img/git-bug-bug.png)

Og her er dens web-grænseflade, som man kan starte lokalt med `git bug webui`:

![git bug webui](/img/git-bug-webui-1.png)
![git bug webui](/img/gitub-gu-webui-2.png)

Jeg kan nu holde styr på hvor langt jeg er nået, men også meget hurtigt bede
Claude om at åbne og lukke relevante issues.

Jeg kunne godt tænke mig at bruge GitHub Projects som issue tracker og altså
åbne og lukke issues ved hjælp af et API-baseret CLI. Men det der er fedt med
git-bug er selvfølgelig, at det virker alle git forges, ikke kun på GitHub.
