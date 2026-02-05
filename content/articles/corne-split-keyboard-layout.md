+++
date = '2025-04-10T08:57:09Z'
draft = false
title = 'Corne Split Keyboard Layout'
tags = ['datamatik']
+++

I min barsel har jeg leget med et Corne v3 split keyboard, som jeg har købt på Taobao.

Det har 46 taster. Til sammenligning har min MacBook Pro med dansk layout 79 taster.

## De knapper man mister vs. de knapper man får

Man fristes til at fokusere på alle de knapper, man mister, frem for alle de knapper man får.

Især får man noget som alle tastaturer burde have: Ekstra knapper til tommelfingrene.

På et almindeligt tastatur har man 1 stor space-knap til deling mellem begge tommelfingre.

På Corne-keyboardet har hver tommelfinger 3 knapper.

![Corne v3 split keyboard](/img/corne-v3-split-keyboard.jpeg)

Antallet af tommelfinger-knapper varierer en del på forskellige split
keyboards:

- [Lily58](https://www.boardsource.xyz/products/lily58) fra [boardsource.xyz][bs-xyz] (amerikansk webshop) har 4
- [Charybdis MK2](https://bastardkb.com/charybdis/) fra [bastardkb.com][bastard-kb] (hollandsk webshop) har 3-5 (+ trackball)
- [Kinesis Advantage 360](https://kinesis-ergo.com/keyboards/advantage360/) fra Kinesis (amerikansk webshop) har 6

[bs-xyz]: https://www.boardsource.xyz/
[bastard-kb]: https://bastardkb.com/

Split keyboards kan blive rigtigt flotte, fordi man kan vælge farve og tema ved
at vælge byggematerialer.

Man kan også selv vælge om man vil betale for at andre samler dem, eller om man
vil bygge et fra et hvilket som helst sted i supply chain'en.

Her er to andre leverandører:

- [mini36 Low Profile][controller-works-mini36] fra [Controller Works][controller-works].
- [IMK Corne][imkulio] fra [imkulio][imkulio]

[controller-works-mini36]: https://controller.works/products/mini36-low-profile-ergonomic-keyboard
[controller-works]: https://controller.works/
[imkulio]: https://imkulio.com/

Hvis man er interesseret i elektronik, synes man nok, de er ret pæne.

## Layered keyboard layout: Du kender det faktisk

Jeg synes at 3 knapper på hver tommelfinger er rigeligt: Foruden space og
enter, har jeg dedikeret de sidste 4 ud af 6 tommelfinger-knapper til at være
modifiers, som ændrer hvad alle de andre knapper gør. Det er det man kalder et
layered keyboard layout.

Det lyder lidt fremmed, men både computer-tastaturer og smartphone-tastaturer
har lag. Computer-tastaturet har relativt små lag: Caps Lock og Fn-knappen.
Smartphone-tastaturer har en undermenu til tal, symboler og emoji'er.

Et lag gør at den samme knap under bestemte forhold sender en anden keycode til
computeren, den er forbundet til. Det er altså ikke styresystemet på PC'en, der
her afgør hvad der trykkes på, men styresystemet (controlleren) på tastaturet.

På et almindeligt kontor-tastatur sender knapperne F1-F12 bare den keycode som
hører til F1-F12, men når man holder Fn-knappen nede, kan man skrue op og ned
for volumen, skærmstyrke, og man kan starte/stoppe musikken.

Det er samme tanke, taget til en ekstrem.

## Open source hardware og firmware

Corne-tastaturet er 100% open source:

- Hardwarens PCB'er og skematik er tilgængelig på [github.com/foostan/crkbd](https://github.com/foostan/crkbd#corne-keyboard)
- Firmwaren jeg benytter er [QMK](https://qmk.fm/), som virker til Atmel AVR-chips, og ARM-chips som STM32, og nRF.
- Keyboard layout editoren er [VIAL](https://get.vial.today/), som er en cross-platform GUI
- Layoutet er work in progress. Det er det jeg har brugt mest tid på i forbindelse med keyboardet.

