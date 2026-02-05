+++
date = '2025-09-04T11:34:00+02:00'
draft = false
title = 'Design Patterns i popkultur'
tags = ['datamatik']
+++

Jeg har, som mange andre, været grebet af sangen PPAP:

{{< youtube Ct6BUPvE2sM >}}

Jeg har ikke kunnet lade sangen slippe, fordi PIKOTARO tydeligvis formidler abstrakt algebra:

Studiet af algebraiske strukturer, hvor man betragter sammensætningen af matematiske objekter, der
ikke nødvendigvis er tal.

Abstrakt algebra finder bred anvendelse i programmering. Vi kalder det et [designmønster][fp-design],
fordi det er et abstrakt mønster som går igen, når vi arbejder med konkrete datastrukturer.
Designmønstre er værd at lære fordi man med tiden kan arbejde på et højere niveau, hvor man kan
drage på flere af sine erfaringer, fordi mange ting er lavet på den samme måde.

[fp-design]: https://fsharpforfunandprofit.com/fppatterns/

## Hvilket designmønster arbejder PIKOTARO med?

En af de grundlæggende principper ved *al* programmering er **komposition**: Man har to værdier, som
man sætter sammen og får en ny værdi der kombinerer de to. Værdier kan være alt fra heltal,
sammensatte datatyper til funktioner, eller endda hele softwaremoduler. Det er kun et spørgsmål om
hvilke kompositionsoperatorer, man har til rådighed.

Eksempler på kompositions-operatorer, du måske kender:

- `+` (plus) komponerer to tal til deres sum i ℤ/64 (overflow antaget).
- `;` (semikolon) komponerer to statements under sekventiel afvikling.
- `gcc -o hello hello.o main.o` komponerer to objektfiler i C under linking.

I tilfældet af PPAP -- eller Pen-Pineapple-Apple-Pen -- kan man udtrykke sangen som
datatype-komposition mellem værdierne _pen_, _apple_ og _pineapple_ som tilsammen giver en række
interessante sammensatte objekter. Sangen drager mig til at stille følgende spørgsmål, for at forstå
hvordan datatypen skal modelleres:

1. Findes der et neutralt element, som ikke påvirker tingen den kombineres med?
2. Gør det nogen forskel hvilken orden, man kombinerer med? Er pen + apple = apple + pen?
3. Gør det nogen forskel hvilken rækkefølge, man kombinerer med? 
4. Hvor mange ting kan man generere ud fra de tre ting? Endeligt eller uendeligt mange?
5. Har de ting der genereres en struktur, eller er det alt sammen tilfældigt?
5. Hvis strukturen er endelig, findes der så største og mindste elementer?

Og når jeg er klogere på nogle af svarene, vil jeg efterfølgende spørge:

7. Hvordan kan man bedst modellere en datatype for komposition af ovenstående?
8. Hvis der er tale om vilkårlig rekursion, kan man abstrahere rekursionen vha. fikspunkt-typer?

## Sangteksten

Jeg har afskrevet sangteksterne, så jeg kan analysere dem (og synge med 🎶):

> I have a pen,
> I have a apple,
> ngh,
> apple-pen.
>
> I have a pen,
> I have a pineapple,
> ngh,
> pineapple-pen.
>
> apple-pen,
> pineapple-pen,
> ugh,
> pen-pineapple-apple-pen.
>
> Dance time (omkvæde)
>
> pen-pine-app-app-apple-apple,
> pen-pine-app-app-apple-pen,
> pen-pine-app-app-apple-apple-apple-pineapple-pineapple-apple-pen,
> pen-pine-app-app-apple-apple-apple-pineapple-pineapple-apple-pen,
> ah-ah-pineapple-pen-pineapple-apple-apple,
> ah-ah-pineapple-pen-pineapple-apple-apple,
>
> I have a pen,
> I have a pen,
> ngh,
> long pen.
>
> I have a apple,
> I have pineapple,
> ngh,
> apple-pineapple.
>
> long pen,
> apple-pineapple,
> ngh,
> pen-pineapple-apple-pen.

## Analyse

Til at starte med er der kun tre objekter: pen, apple, pineapple.

Ingen af dem er særligt neutrale, da de alle bliver til mere, når man kombinerer dem med noget.

Hvad så med rækkefølgen? Til dels virker det til at de vigtigste sammensætninger har en fast
rækkefølge; pen + apple = pen-apple, men pen + pineapple = pineapple-pen. Så rækkefølgen er ikke
ligegyldig.

Allerede i første vers lærer vi, at ved at sammensætte pen og apple, får man en apple-pen:

### [Associativitet][assoc]

[assoc]: https://en.wikipedia.org/wiki/Associativity

- `pen` + `apple` = `apple-pen`
- `pen` + `pineapple` = `pineapple-pen`
- `apple` + `pineapple` = `apple-pineapple`

Gør det nogen forskel hvilken rækkefølge, man kombinerer med? 

Altså, er (`pen` + `apple`) + `pineapple` = `pen` + (`apple` + `pineapple`)?

Fra omkvædet får vi: `pen-pineapple-apple-pen`

Hvis vi arbejder fra venstre mod højre: (`pen` + `apple`) + `pineapple` = `apple-pen` + `pineapple` = ?

Sangen giver os ikke eksplicit denne kombination, så det er uklart. Men måden PPAP kombinerer
tingene på tyder på, at operationen ikke er associativ—strukturen ser ud til at afhænge af hvilket
specifikt par, du kombinerer, ikke bare gruppering. Det gør det mere som en ikke-associativ algebra.

### [Kardinalitet][card]

[card]: https://en.wikipedia.org/wiki/Cardinality

Hvor mange ting kan man generere? 

Med udgangspunkt i tre basiselementer { `pen`, `apple`, `pineapple` }, kan man generere:

- 3 enkelte elementer
- 6 parvise kombinationer (pen-apple, apple-pen, pen-pineapple, pineapple-pen, apple-pineapple, pineapple-apple)
- mange flere kombinationer med tre elementer, selvom sangen lægger op til at man kombinerer to-og-to

Med mindre der er [ækvivalensrelationer][eq] eller omskrivningsregler (som f.eks. apple-pen-apple =
apple-pen eller lignende), kan man generere uendeligt mange forskellige elementer gennem gentagen
kombination. Sangens omkvæd kunne godt antyde det. Men så er der i hvert fald to slags objekter:
De pæne pen-pineapple-apple-pen, long-pen og lignende, og de mere amok omkvæds-riffs.

[eq]: https://en.wikipedia.org/wiki/Equivalence_relation

Hvis nogen er i tvivl om hvordan sådan en sammensætning foregår, eller er i tvivl om at her er tale
om abstrakt algebra, kan I se PIKOTARO udføre operationen her; det abstrakte er selvfølgelig, at der
slet ikke er noget æble eller nogen pen i hans hånd.

Det er noget man skal forestille sig, ligesom med al matematik.

![Hvordan sammensætter man en apple med en pen?](/img/ppap.jpg)

### [Kommutativitet][comm]

[comm]: https://en.wikipedia.org/wiki/Commutative_property

Gør det nogen forskel hvilken orden, man kombinerer med? Er `pen + apple = apple + pen`?

Fra sangteksterne får vi:
- `pen` + `apple` = `apple-pen`
- `pen` + `pineapple` = `pineapple-pen`
- `apple` + `pineapple` = `apple-pineapple`

Men hvad med den modsatte orden?
- `apple` + `pen` = ? (ikke i sangen)
- `pineapple` + `pen` = ? (ikke i sangen)
- `pineapple` + `apple` = ? (ikke i sangen)

Selvom sangen ikke viser alle kombinationer, er der en klar asymmetri i måden tingene sammensættes på. `pen + apple` giver `apple-pen`, ikke `pen-apple`.

Og måske intuitivt åbenlyst for nogen som har spillet Fruit Ninja, så går `long-pen` jo hele vejen igennem begge frugter.

### [Idempotens][idem]

[idem]: https://en.wikipedia.org/wiki/Idempotence

Hvad sker der når man kombinerer et element med sig selv? Gælder det at `x + x = x`?

Fra sangteksterne lærer vi noget interessant:

- `pen` + `pen` = `long-pen` — et helt nyt element!

Dette er bemærkelsesværdigt. I stedet for at få `pen` tilbage, eller måske `pen-pen`, får vi `long-pen`.

PIKOTARO viser os at når to penne kombineres, opstår der et kvalitativt anderledes objekt.

For de andre basiselementer har vi ikke eksplicitte eksempler:
- `apple` + `apple` = ? (ikke i sangen)
- `pineapple` + `pineapple` = ? (ikke i sangen)

Men baseret på `long-pen`-eksemplet, kan vi formode at operationen generelt **ikke er idempotent**. I stedet for at returnere det originale element, skaber kompositionen nye, distinkte elementer. Det synes jeg også omkvædet foreslår.

Vi kan kun spekulere, men mon ikke `long-pen` + `long-pen` = `very-long-pen` eller lignende?

### [Lukkethed][closure]

[closure]: https://en.wikipedia.org/wiki/Closure_(mathematics)

Er strukturen lukket under komposition? Eller sagt mere mundret, producerer enhver kombination af to elementer et element der også tilhører strukturen?

Lad os se på evidensen fra sangen:

**Basiselement-kombinationer:**
- `pen` + `apple` = `apple-pen` ✓
- `pen` + `pineapple` = `pineapple-pen` ✓
- `apple` + `pineapple` = `apple-pineapple` ✓
- `pen` + `pen` = `long-pen` ✓

**Højere-ordens kombinationer:**
- `apple-pen` + `pineapple-pen` = `pen-pineapple-apple-pen` ✓
- `long-pen` + `apple-pineapple` = `pen-pineapple-apple-pen` ✓

Hver kombination producerer et gyldigt PPAP-objekt — om det er et simpelt sammensat ord som `apple-pen`, eller mere komplekse konstruktioner som `pen-pineapple-apple-pen`.

Strukturen virker **lukket** under komposition. Man kan kombinere to vilkårlige elementer og få et nyt element i strukturen.

### [Invertibilitet][inv]

[inv]: https://en.wikipedia.org/wiki/Inverse_element

Kan man lave en omvendt operation? Kan man "trække fra" eller "dele" og få de oprindelige elementer tilbage?

Hvis vi har `apple-pen`, kan vi så trække `apple` fra og få `pen` tilbage? Eller dividere med `apple`?

Sangen giver os ingen evidens for sådan en operation: Der er ingen måde at dekomponere `apple-pen` tilbage til `pen` og `apple`.

Når to ting er kombineret, er de kombineret for altid.

Vi kan heller ikke finde inverse elementer — elementer der "annullerer" hinanden. Husk at vi allerede har fastslået at der ikke er noget neutralt element, så der kan heller ikke være inverse, da de ville forårsage neutrale elementer ved kombination (1 - 1 = 0, eller 5 / 5 = 1, for at give konkrete eksempler fra tallenes verden).

PPAP er **ikke invertibel**, da kompositionen kun går én vej.

## Hvad slags algebraisk struktur er PPAP?

Nu hvor vi har undersøgt en række egenskaber ved PPAP's kompositionsoperator, kan vi begynde at placere det i det algebraiske hierarki. Lad os arbejde os opad fra de mest basale til de mest strukturerede algebraiske begreber.

### [Magma][magma]

[magma]: https://en.wikipedia.org/wiki/Magma_(algebra)

Et **magma** er den mest basale algebraiske struktur. Det er blot:
- En mængde af elementer
- En binær operation (en måde at kombinere to elementer på)

Krav: Lukkethed (operationen producerer et element i mængden)

Er PPAP et magma? **Ja!**

Vi har en mængde { `pen`, `apple`, `pineapple`, `apple-pen`, `pineapple-pen`, ... } og en kompositionsoperator. Fra lukkethed-afsnittet ved vi at strukturen er lukket — enhver kombination giver et gyldigt PPAP-objekt.

PPAP er **i hvert fald** et magma. Men hvilket slags magma?

Har det nogle af de særlige egenskaber der karakteriserer forskellige slags magmaer?

### Kommutativt magma?

Et kommutativt magma kræver at `a ∗ b = b ∗ a` for alle elementer. Er PPAP kommutativ? **Nej.**

Fra kommutativitetsafsnittet: `pen + apple = apple-pen`, men vi forventer at `apple + pen = pen-apple` (hvis det overhovedet er defineret). Operationen er **ikke kommutativ**.

### Unitalt magma?

Et unitalt magma har et identitetselement `e` hvor `e ∗ a = a ∗ e = a` for alle `a`.

Er PPAP unitalt? **Nej.**

Ingen af elementerne er neutrale — de bliver alle til mere når man kombinerer dem. Der findes **intet identitetselement**.

(Hvis PPAP havde været både unitalt og associativt, ville det være en [monoid][monoid].)

[monoid]: https://en.wikipedia.org/wiki/Monoid

### Idempotent magma?

Et idempotent magma kræver at `a ∗ a = a` for alle elementer. Er PPAP idempotent? **Nej.**

Fra Idempotens-afsnittet: `pen + pen = long-pen ≠ pen`. Operationen er **ikke idempotent** — den skaber nye elementer i stedet for at returnere det originale.

### Frit magma?

Et **frit magma** er et magma uden nogen omskrivningsregler ud over operationen selv. Alle sammensætninger skaber distinkte nye elementer. Der er ingen regler der siger at to forskellige udtryk er ækvivalente, altså fx at `pen` + `pen` = `pen`, eller at `apple` + `apple` = `apple`.

Er PPAP et frit magma? **Meget sandsynligt!**

Evidens fra sangen:
- Hver kombination i sangen skaber objekter, der er unikke
- `pen + pen` skaber et nyt element (`long-pen`)
- Sammensatte udtryk bliver ved med at vokse: `pen-pineapple-apple-pen`
- Ingen ækvivalensrelationer antydes (ingen regler som "apple-pen-apple = apple-pen")
- Omkvædet antyder vilkårlig vækst uden begrænsninger, selvom stilen er lidt anderledes

PPAP er et **ikke-kommutativt, ikke-unitalt, ikke-idempotent magma** — mest sandsynligt et **frit magma** genereret af { `pen`, `apple`, `pineapple` }.

Men det er også den mindst krævende algebraiske struktur.

### [Semigruppe][semigroup]

[semigroup]: https://en.wikipedia.org/wiki/Semigroup

En **semigruppe** er et magma plus associativitet.

Krav: Lukkethed + associativitet

Er PPAP en semigruppe? **Uklart, men sandsynligvis nej.**

Fra associativitetsafsnittet: Sangen giver os ikke nok information til at afgøre det med sikkerhed, men måden PPAP kombinerer tingene på tyder på at operationen **ikke er associativ** — strukturen afhænger af hvilket specifikt par du kombinerer, ikke bare grupperingen.

Hvis PPAP er et frit magma, er det per definition **ikke associativt** (fri magmaer har ingen algebraiske love).

Så PPAP er sandsynligvis **ikke** en semigruppe.

### [Monoid][monoid]

[monoid]: https://en.wikipedia.org/wiki/Monoid

En **monoid** er en semigruppe plus identitetselement.

Krav: Lukkethed + associativitet + identitetselement

Er PPAP en monoid? **Nej.**

Vi har allerede fastslået, at der **ikke findes noget neutralt element**. Ingen af de tre basiselementer { `pen`, `apple`, `pineapple` } efterlader andre elementer uændrede — de bliver alle til mere når man kombinerer dem med noget.

PPAP er ikke engang en semigruppe, så den kan ikke være en monoid. Selv hvis PPAP var associativ (hvilket det sandsynligvis ikke er), mangler det stadig et identitetselement.

PPAP er helt sikkert **ikke** en monoid.

### [Gruppe][group]

[group]: https://en.wikipedia.org/wiki/Group_(mathematics)

En **gruppe** er en monoid hvor hvert element har en invers.

Krav: Lukkethed + associativitet + identitetselement + invertibilitet

Er PPAP en gruppe? **Nej.**

PPAP er ikke engang en monoid, så det kan heller ikke være en gruppe. Derudover ved vi fra invertibilitetsafsnittet at der **ingen inverse elementer findes** — man kan ikke dekomponere `apple-pen` tilbage til `pen` og `apple`.

PPAP er definitivt **heller ikke** en gruppe.

### Kunne PPAP være et [gitter (lattice)][lattice]?

[lattice]: https://en.wikipedia.org/wiki/Lattice_(order)

En anden mulighed er at betragte PPAP som et gitter — en struktur med to operationer (meet ∧ og join ∨) der opfylder visse love.

**Hvad kunne meet og join betyde i PPAP?**

Man kunne forestille sig at kompositionsoperatoren er join (∨) — den "mindste øvre grænse" eller kombinationen af to elementer:
- `pen ∨ apple = apple-pen` (skaber sammensætning der indeholder begge)

**Test af gitter-egenskaber:**

1. **Kommutativitet**: Gælder `a ∨ b = b ∨ a`?
   - **Nej** — vi har vist at `pen + apple ≠ apple + pen`
   - Gitre kræver kommutative meet/join-operationer

2. **Associativitet**: Gælder `(a ∨ b) ∨ c = a ∨ (b ∨ c)`?
   - **Uklart** — sandsynligvis ikke
   - Gitre kræver associativitet

3. **Idempotens**: Gælder `a ∨ a = a`?
   - **Nej** — `pen + pen = long-pen ≠ pen`
   - Gitre kræver idempotente operationer

PPAP opfylder **ikke** standard gitter-aksiomerne. Der mangler:
- Kommutativitet ✗
- Idempotens ✗
- Sandsynligvis associativitet ✗

## Hvad er PPAP så?

Efter systematisk at have undersøgt en række algebraiske egenskaber og strukturer, kan vi nu konkludere:

Det ser ud til at PPAP er en **ikke-kommutativ algebraisk struktur** — mest sandsynligt et **frit magma** genereret af { `pen`, `apple`, `pineapple` }

### Programmeringsparallel:

Frie magmaer dukker op overalt i programmering:
- **Syntakstræer**: Når du parser kode, bygger du et træ af udtryk før du evaluerer dem
- **Term-konstruktion i formelle sprog**: Logiske udtryk, matematiske formler
- **Strengkonkatenation uden normalisering**: "hello" + "world" skaber en ny streng
- **Ren komposition uden evaluering**: Man sætter ting sammen, men simplificerer ikke

Det er præcis hvad PIKOTARO demonstrerer: Ren komposition af objekter, uden nogen form for reduktion
eller ækvivalens. Man kan blive ved med at kombinere i det uendelige, og hvert resultat er unikt og
distinkt.

## Funktionelle designmønstre

Hvis du vil vide mere om funktionelle designmønstre, kan du se den her video, som sammenligner dem
med de objekt-orienterede designmønstre, du måske har hørt om før (Singleton, Factory,
FactoryFactory, FactoryFactoryFactory, og de mange andre mønstre, som primært kompensere for fejl og
mangler ved det objekt-orienterede paradigme.)

{{< youtube E8I19uA-wGY >}}
