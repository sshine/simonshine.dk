+++
date = '2026-01-07T13:53:14+01:00'
draft = false
title = 'Kubernetes-valgfaget der ikke blev til noget'
tags = ['datamatik', 'kubernetes']
+++

Planen var at stoppe som underviser på fuldtid og have et enkelt valgfag som timelærer. Valgfaget
blev desværre aflyst efter det var blevet godkendt og var blevet valgt af de studerende, for at
spare på eksterne timer. Det var lidt ærgerligt, da jeg havde været transparent omkring planen af
hensyn til at give god tid til at finde min afløser.

Titlen skulle have været "Cloud Native Kubernetes" og var det næstmest populære valgfag til foråret.

Mit liv bliver en god del simplere uden en halv dags undervisning, en hel masse kursusplanlægning og
en masse løbende forberedelse. Og min løn går også lidt op ved ikke at undervise. Men jeg får ikke
lov at max'e ud på Kubernetes ud over hvad der er nødvendigt på arbejdet.

Jeg offentliggør valgfagsbeskrivelsen her, så den kan bruges af mig selv eller andre i fremtiden.

Inden jeg gør det, så er her en idé som jeg mistede motivationen for at lave:

## Kubelings

Inspireret af [Rustlings][rustlings] som er et interaktivt tutorial til at lære at programmere Rust,
tænkte jeg at man kunne lave Kubelings: En Kubernetes controller, der bor i din control plane,
observerer dit cluster og fortæller, hvor langt du er kommet i et interaktivt tutorial, som består i
at deploye ting til clusteret.

[rustlings]: https://rustlings.rust-lang.org/

Efter at have pitchet idéen til en ven, som er DevOps-konsulent, sagde hun, der allerede fandtes
noget som hed [Killercoda][killercoda] og [Sailor.sh][sailor]. De er begge interaktive, web-baserede
"playground"-miljøer, hvor man i 1-4 timer kan få lov at låne et Kubernetes-cluster gratis.

De er begge aftagere fra [Katacoda][katacoda], som lukkede for gratis, offentlig brug i 2022.
Blandt andre betalte tjenester findes også [KodeKloud][kodekloud] og [Play with Kubernetes][pwk].

[killercoda]: https://killercoda.com/
[sailor]: https://sailor.sh/
[katacoda]: https://www.oreilly.com/online-learning/leveraging-katacoda-technology.html
[kodekloud]: https://kodekloud.com/
[pwk]: https://training.play-with-kubernetes.com/

Men måske mere lig det jeg søger at skabe er [K8sQuest][k8sq], som man installerer i sit eget
Kubernetes-cluster, og så tracker den ellers ens progression. K8sQuest har også en del sikkerhed
imod at man sletter ting som kan være svære at genoprette, og er kritiske for normal drift.

[k8sq]: https://github.com/Manoj-engineer/k8squest

Jeg håber at finde motivationen til at lave Kubelings i forbindelse med et lignende fag i fremtiden.

## Valgfagsbeskrivelse: Cloud Native Kubernetes

### Formål og læringsmål

I Cloud Native Kubernetes-faget lærer du de tekniske færdigheder for
at bygge og idriftsætte skalérbare og resiliente software-applikationer
i moderne cloud-miljøer.

Cloud Native er et sæt konkrete værktøjer og teknikker der understøtter applikationsudvikling på cloud-infrastruktur ved hjælp af
Kubernetes og omkringliggende containerteknologier. Det betyder at
applikationer kan flyttes frit mellem clouds, eller deployes på clusters
der eksisterer samtidigt på tværs af af public, private og hybrid clouds.
Cloud Native er en moderne standard for brugen af clouds. Organisatorisk risiko minimeres ved at hardwaredrift abstraheres væk på en
måde, som kommercielle clouds har opnået konsensus omkring, og
som open source-verdenen har bakket op om. Metoder anvendes til at
udvikle distribuerede softwaretjenester med høj tilgængelighed under
belastning og geografisk spredning.

### Viden

Den studerende ved…
- hvad en container-orkestrator er
- hvilke funktioner de forskellige komponenter i Kubernetes har
- hvilken rolle Kubernetes control-plane har
- hvordan Kubernetes Pods og Deployments er opbygget
- hvilke teknologier der er cloud-agnostiske og kan afvikles på alle clouds
- hvornår horisontal og vertikal skalering gavner
- hvilke rollback-strategier der findes og hvad deres fordele er

### Færdigheder
Den studerende kan…
- installere og overvåge et Kubernetes-cluster på deres egen computer
- klargøre en applikation til afvikling i et container-miljø
- opsætte og tilføje services til en applikations service mesh
- opsætte load-balancers, healthcheck-prober, init-containere mv.
- provisionere ressourcer som CPU, RAM og diskplads til Pods
- udføre en deployment af en applikation i et Kubernetes-cluster
- anvende templates og package management til at vedligeholde applikationer
- bygge simple operators og custom resource definitions (CRD’er)

### Kompetencer
Den studerende kan…
- diagnosticere problemer i en distribueret applikation via real-time debugging
- diskutere hvornår og hvordan en applikation kan skaleres til cloud-drift
- beskrive hvilke egenskaber, der gør et distribueret system selvhelende
- afveje fordele, ulemper og omkostninger ved open source vs. vendor lock-in

### Undervisningsform

Undervisningen er en blanding af præsentationundervisning med anvendelse af hands-on øvelser.

Der arbejdes sammen i grupper om et projekt.

Grupperne opererer et Kubernetes-cluster og skal idriftsætte en app-
likation hvor kravene til driften øges gradvist med mængden af emner,
der dækkes.

### Prøve

Læringsmålene for prøven er identiske med fagets/fagenes læringsmål

- Faget Prøves: Faget/modulet prøves selvstændigt.
- Prøveform: Kombineret skriftlig og mundtlige prøve.
- Opgavetype: Som forudsætning for at gå til eksamen er det et krav at aflevere et gruppeprojekt. Dette er en kort rapport på max 4 normalsider eksklusivt billeder, illustrationer og lignende samt bilag. Rapporten skal beskrive det projekt som de studerende har arbejdet
  på gennem semesteret. Der skal inkluderes links til kode som bliver
  forsvaret til eksamen.
- Formkrav: Max 4 normalsider (2400 tegn)
- Individuel eller gruppeprøve: Gruppeprøve, 3-4 deltagere
- Anvendt sprog til prøven: Dansk (Norsk/Svensk)
- Varighed: Eksamen starter som et gruppeoplæg/-præsentation (ingen præsentationsnoter), der varer i 5 minutter per studerende. Herefter individuel eksamination i 20 minutter inkl. votering.
- Regler om hjælpemidler til eksamen: Det er tilladt at medbringe computer og indleveret rapport.
- Bedømmelsesform: 7-trins skala
- Bedømmer(e): Intern censur
- Kriterier for prøvevurdering: Karakter gives individuelt og er en helhedsvurdering af rapporten, gruppepræsentationen og den individuelle eksamination.


### Litteratur

[The Kubernetes Book, 2025 Edition][kub] af Nigel Poulton
Samt udvalgte frit tilgængelige online-ressourcer.

[kub]: https://leanpub.com/thekubernetesbook

For en introduktion til Cloud Native-begrebet:
- https://en.wikipedia.org/wiki/Cloud-native_computing
- https://aws.amazon.com/what-is/cloud-native/
- https://cloud.google.com/learn/what-is-cloud-native
