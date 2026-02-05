+++
date = '2025-07-21T23:24:15Z'
draft = false
title = 'Just: En bedre Makefile'
tags = ['datamatik']
+++

Har du nogensinde arbejdet på et softwareprojekt og set en fil kaldet `Makefile`? Makefiles bruges traditionelt til at automatisere kompileringsprocesser, men mange udviklere bruger dem også til at køre almindelige projektkommandoer som:

```
make test
make deploy
make start
```

Men der findes et bedre alternativ: Justfile

## Problemet med Makefiles til projektkommandoer

Makefiles blev oprindeligt designet til at kompilere filer - ikke til at køre projektkommandoer. Når du bruger Make til at køre tasks som `make test` eller `make deploy`, misbruger du faktisk værktøjet.

Det klassiske tegn på dette misbrug er når du ser `.PHONY` targets i din Makefile:

```makefile
.PHONY: test deploy clean
```

`.PHONY` fortæller Make at disse targets ikke repræsenterer faktiske filer, men bare kommandoer der skal køres. Hvis du markerer alt som `.PHONY`, bruger du ikke Make til dets oprindelige formål - nemlig at bygge filer baseret på deres afhængigheder.

## Introducing Just

[Just](https://github.com/casey/just) er et command runner-værktøj skrevet i Rust, specifikt designet til at køre projektkommandoer.

Den fylder kun omkring 3MB og tilbyder mange fordele:

- **Designet til task-running**: I modsætning til Make er just bygget specifikt til at køre kommandoer
- **Parameter support**: Nem måde at sende argumenter til dine tasks
- **Variable definitioner**: Fleksibel variabelhåndtering
- **Task-afhængigheder**: Definer hvilke tasks der skal køres før andre
- **Automatisk `.env` loading**: Indlæs miljøvariabler automatisk
- **Indbygget hjælpetekst**: Automatisk generering af help-dokumentation

## Eksempel fra dette blog

Her er [justfilen fra denne blog](https://github.com/sshine/datamatik.blog/blob/main/justfile) som eksempel:

```justfile
# See available `just` subcommands
list:
    just --list

# Create scaffolding and hugo.toml
init:
    hugo new site . --force

# Serve website on http://127.0.0.1:1313/
serve:
    hugo serve -D

# Create new post in content/posts/
post MDFILE:
    mkdir -p content/artikler
    hugo new content 'content/artikler/{{ MDFILE }}' || true

# Deploy to DIR on SERVER using tar/ssh/scp
deploy SERVER='feng' DIR='/var/www/datamatik.blog':
    hugo
    tar cfz public.tgz public/
    scp public.tgz {{ SERVER }}:{{ DIR }}
    ssh {{ SERVER }} 'cd {{ DIR }} && tar xfz public.tgz'
```

Som du kan se, er syntaksen ren og intuitiv.

Hver task har en kort beskrivelse, og parametre er tydeligt defineret.

Og parametrene har defaults, så man kan nøjes med at skrive `just deploy`.

Når jeg ikke har blogget i noget tid, kan jeg let genfinde kommandoerne.

Og jeg skal ikke være bange for at en vejledning, jeg har skrevet til mig selv, er desynkroniseret fra de faktiske kommandoer.

## Sammenligning: Makefile vs Justfile

Her er et eksempel på en typisk Makefile fra et større projekt:

```makefile
.PHONY: clean-pyc develop lint-server lint-client lint-docs lint format-server format-client format test coverage

help:
	@echo "clean-pyc - remove Python file artifacts"
	@echo "develop - install development dependencies"
	@echo "lint - check style with black, ruff, sort python with ruff, indent html, and lint frontend css/js"
	@echo "format - enforce a consistent code style across the codebase, sort python files with ruff and fix frontend css/js"
	@echo "test - run tests"
	@echo "coverage - check code coverage"

clean-pyc:
	find . -name '*.pyc' -exec rm -f {} +
	find . -name '*.pyo' -exec rm -f {} +
	find . -name '*~' -exec rm -f {} +

develop: clean-pyc
	pip install -e .[testing,docs]
	npm install --no-save && npm run build

format-server:
	black --target-version py37 .
	ruff check . --fix
	git ls-files '*.html' | xargs djhtml -i
```

Bemærk hvordan denne Makefile:
- Har en lang `.PHONY` linje med alle kommandoer
- Kræver manuel hjælpetekst i `help` target
- Ingen indbygget parameterunderstøttelse

Makefiles er desuden whitespace-sensitive: Indrykningen du ser i starten af linjerne *skal* være
tabs og ikke spaces. Det kan være svært når de fleste editorer er konfigureret til at bruge enten
tabs eller spaces.

## Hvornår skal man stadig bruge Make?

Make har stadig sin plads i softwareudvikling, især til:
- Komplekse kompileringsprocesser (som Linux kernen)
- Projekter hvor du faktisk kompilerer filer baseret på afhængigheder
- Legacy-systemer hvor Make allerede er dybt integreret

Men for de fleste moderne projekter, hvor du bare skal køre scripts og kommandoer, er just et bedre valg.

## Justfile som institutionel hukommelse

Et af problemerne ved softwareudvikling er at huske alle de kommandoer, man skal køre.

Hvilken kommando starter udviklerserveren? Hvordan kører man tests? Hvordan deployer man?

Disse kommandoer kan være svære at huske, især hvis du skifter mellem forskellige projekter.

At have dem i din shell-historik hjælper ikke dine kolleger, og dokumentation bliver ofte forældet.

En justfile fungerer som en del af projektets hukommelse - en simpel, interaktiv tutorial i de mest almindelige kommandoer for projektet. Når nye udviklere kommer til projektet, kan de køre `just --list` og få en øjeblikkelig oversigt over alle tilgængelige kommandoer med beskrivelser.

![just --list](/img/just-list.png)

## Kom i gang

Installation af just er simpel:

```bash
# På MacOS via Homebrew
brew install just

# På Ubuntu/Debian
wget -qO - 'https://proget.makedeb.org/debian-feeds/prebuilt-mpr.pub' | gpg --dearmor | sudo tee /usr/share/keyrings/prebuilt-mpr-archive-keyring.gpg 1> /dev/null
echo "deb [arch=all,amd64,arm64,armhf signed-by=/usr/share/keyrings/prebuilt-mpr-archive-keyring.gpg] https://proget.makedeb.org prebuilt-mpr jammy" | sudo tee /etc/apt/sources.list.d/prebuilt-mpr.list
sudo apt update
sudo apt install just

# Via Cargo (Rust's pakkemanager)
cargo install just
```

Make er ikke død - det har stadig sin plads i komplekse build-systemer.

Men for hverdags task-running er just simpelthen bedre.
