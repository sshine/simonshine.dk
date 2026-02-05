+++
date = '2026-01-01T00:00:00+01:00'
draft = false
title = 'Funktionel datamodellering'
tags = ['datamatik', 'haskell']
+++

I [Om at blive rekursivt beruset med monoider]({{< relref "rekursivt-beruset-med-monoider.md" >}})
modellerer jeg *superdrinks* som en [monoid][monoid] og viser hvordan man kan programmere med dem
ved hjælp af simple algebraiske datatyper. Og i [Design Patterns i popkultur]({{< relref
        "design-patterns-popkultur.md" >}}) fandt jeg et eksempel på et design pattern:

PPAP kan modelleres som et [frit magma][free-magma]: en algebraisk struktur lukket under komposition,
men uden kommutativitet, idempotens, eller identitetselement. Men hvordan gør man det til en konkret
datastruktur i et programmeringssprog?

[monoid]: https://en.wikipedia.org/wiki/Monoid
[free-magma]: https://en.wikipedia.org/wiki/Magma_(algebra)#Free_magma

Et frit magma er helt oplagt at modellere som en datatype i et type-sikkert programmeringssprog som Java, Rust eller Haskell. Vi kan udnytte typesystemet til at fange de algebraiske egenskaber vi har analyseret, sådan at datatypen opfører sig efter de regler vi har etableret gælder for det fænomen, vi modellerer.

Lad os se på en progression fra simple til sofistikerede modelleringsteknikker, hvor hver tilgang giver os mere og mere kontrol over hvad der sker.

En indholdsfortegnelse over de modelleringsteknikker jeg gennemgår:

- [Simple algebraiske datatyper (ADT'er)](#simple-algebraiske-datatyper-adt)
- [Phantom types](#phantom-types)
- [Phantom types med GADT'er](#phantom-types-med-gadt)
- [Recursion schemes](#recursion-schemes)
- [GADT’er med DataKinds: Type-level programmering](#gadter-med-datakinds-type-level-programmering)
- [Type families (lukkede)](#type-families-lukkede)
- [Functional dependencies](#functional-dependencies)
- [Frie monader](#frie-monader)
- [Type-level literals & DataKinds](#type-level-literals--datakinds)
- [Singleton-typer](#singleton-typer)

## [Simple algebraiske datatyper (ADT'er)](https://en.wikipedia.org/wiki/Algebraic_data_type)

Den simpleste måde at modellere PPAP på er med en helt almindelig algebraisk datatype:

```haskell
data Base
  = Pen
  | Apple
  | Pineapple
  deriving (Show, Eq)

data PPAP
  = IHaveA Base
  | Ngh PPAP PPAP
  deriving (Show)

-- Kommutativ lighed: pen + apple = apple + pen
instance Eq PPAP where
  (==) (IHaveA a) (IHaveA b) = a == b
  (==) (Ngh a b) (Ngh c d) = (a == c && b == d) || (a == d && b == c)
  _ == _ = False

-- Eksempler:
applePen :: PPAP
applePen = Ngh (IHaveA Pen) (IHaveA Apple)

penApple :: PPAP
penApple = Ngh (IHaveA Apple) (IHaveA Pen)

-- applePen == penApple evaluerer til True!

longPen :: PPAP
longPen = Ngh (IHaveA Pen) (IHaveA Pen)
```

Her bruger man en enkelt datatype som enumerator, og en enkelt datatype til rekursion: Enten har man
en enkelt ting, eller også `Ngh`'er man to ting sammen, som hver især også kunne være sammensat. Da
der er to datatyper, kalder vi den ene for `Base` af mangel på et bedre navn.

Vi har defineret en kommutativ `Eq`-instans, selvom vi i PPAP-sangen ikke har etableret kommutativitet
som en regel — tværtimod konkluderede vi at `pen + apple ≠ apple + pen`. Men i visse domæner kan det
give mening at abstrahere fra rækkefølgen: Hvis vi kun er interesserede i *hvilke ingredienser* der
indgår, ikke præcis hvordan de kombineres, kan kommutativ lighed være nyttig. Det viser at selv den
simpleste datamodellering lader os vælge hvilke egenskaber vi vil enforcer.

Indkodningen her fanger strukturen, men giver ingen garantier på type-niveau andet end lukkethed.
Havde vi fx bare lavet det med strings og konkatenering af strings, kunne vi tilføje noget pludder
midt i et objekt, som slet ikke er med i PPAP. Det er i sig selv mægtigt.

## [Phantom types](https://doc.rust-lang.org/rust-by-example/generics/phantom.html)

Det næste vi kunne tilføje vores datamodellering er at skelne mellem simple og sammensatte objekter.

Altså: forskellen på "pen" og "pineapple-pen", og indkode i vores datamodellering, så vi ved præcis
om der er tale om den ene eller den anden ved at lave forskellige *typer* og ikke bare *værdier* for
de to.

Her vil jeg bruge noget som hedder *phantom types*, som er en måde at indkode typer, der faktisk
ikke er en del af programmet når det kører. De er kun til for at gøre livet svært for programmøren,
når de skriver noget nonsens, som fx at påstå at en pineapple-pen er én ting.

```haskell
-- Phantom type tags (ingen data, kun markører på type-niveau)
data Simple
data Compound

-- PPAP med phantom parameter 'a' som ikke optræder på højresiden
data PPAP a = MkPPAP PPAPInternal

-- Intern repræsentation (skjules fra brugere via modul-eksport)
data PPAPInternal
  = IHaveA Base
  | Ngh PPAPInternal PPAPInternal

-- Smart konstruktører som enforcer type-niveau invarianter:
pen :: PPAP Simple
pen = MkPPAP (IHaveA Pen)

apple :: PPAP Simple
apple = MkPPAP (IHaveA Apple)

pineapple :: PPAP Simple
pineapple = MkPPAP (IHaveA Pineapple)

-- Komposition giver altid Compound
compose :: PPAP a -> PPAP b -> PPAP Compound
compose (MkPPAP a) (MkPPAP b) = MkPPAP (Ngh a b)

-- Nu kan vi skelne mellem simple og sammensatte objekter på typeniveau:
simple :: PPAP Simple
simple = pen

compound :: PPAP Compound
compound = compose pen apple

-- Det ville være en typefejl at påstå at et sammensat objekt er simpelt:
-- badExample :: PPAP Simple
-- badExample = compose pen apple
```

Phantom type-parameteren `a` eksisterer kun på type-niveau — den optræder ikke på højre side af
type-definitionen. Ved at skjule `MkPPAP`-konstruktøren fra modulets public interface (kun eksportere
smart konstruktører) kan vi gennemtvinge, at alle `PPAP Simple` værdier kun laves via `pen`, `apple`,
eller `pineapple`, og at alle sammensætninger har typen `PPAP Compound`.

Selvom phantom-typer kun findes i sprog med generics (fx Java), kan man altså benytte *smart
konstruktører* i alle mindre stærke sprog, og kun eksportere ting som er internt konsistente.

## [Phantom types med GADT'er](https://en.wikipedia.org/wiki/Generalized_algebraic_data_type)

Phantom types med smart konstruktører virker fint, men har én stor begrænsning: man kan ikke pattern
matche og få type-information tilbage. Når man unwrapper `MkPPAP`, mister man informationen om hvorvidt
det var `Simple` eller `Compound`.

Med GADT'er (Generalized Algebraic Data Types) kan vi gøre det bedre — konstruktører kan returnere
forskellige type-instanser, og pattern matching *raffinerer* typen:

```haskell
{-# LANGUAGE GADTs #-}

data Simple
data Compound

data PPAP a where
  Pen       :: PPAP Simple
  Apple     :: PPAP Simple
  Pineapple :: PPAP Simple
  Compose   :: PPAP a -> PPAP b -> PPAP Compound

-- Pattern matching raffinerer typen automatisk:
isSimple :: PPAP a -> Bool
isSimple Pen           = True  -- compileren ved: a ~ Simple
isSimple Apple         = True  -- compileren ved: a ~ Simple
isSimple Pineapple     = True  -- compileren ved: a ~ Simple
isSimple (Compose _ _) = False -- compileren ved: a ~ Compound

-- Vi kan endda skrive funktioner der kun virker på Simple:
showBase :: PPAP Simple -> String
showBase Pen       = "pen"
showBase Apple     = "apple"
showBase Pineapple = "pineapple"
```

Compileren ved at der ikke mangler et mønster i `showBase`, selvom der findes endnu en konstruktør,
`Compose`, fordi den ikke ville være en værdi af typen `PPAP Simple`, men derimod `PPAP Compound`.
Man får derfor lov at bevare type-sikkerheden, men kan skrive mere nøjagtige funktioner, der gør det
rigtige.

Forskellen på almindelige phantom types og GADT'er er altså:

- **Phantom types**: Type-sikkerhed via smart konstruktører og ved at skjule intern logik bag
  modul-eksport. Pattern matching mister type-information, så selvom man kun kan konstruere gyldige
  værdier med sine funktioner, kan man ikke udelukkende dekonstruere gyldige værdier.
- **GADT'er**: Type-sikkerhed *indbygget* i konstruktører. Pattern matching *raffinerer* typen.

GADT'er giver os mere udtrykskraft uden at skulle skjule konstruktører eller stole på at vi bevarer
disciplinen omkring hvad vi eksporterer fra vores modul.

## [Recursion schemes](https://hackage.haskell.org/package/recursion-schemes)

Fra den simple ADT-modellering til den avancerede GADT-modellering sammensættes objekter for at få
nye objekter, som igen kan sammensættes. Der er tale om en rekursiv datastruktur. Det kan man se ved
at `PPAP`-typerne i modelleringerne ovenfor alle har en reference til dem selv.

En teknik som udløser en række "gratis" rekursionsmønstre på tværs af vilkårlige datastrukturer er
at flytte rekursionen til en generaliseret rekursiv datatype. Det kan man med recursion-schemes
biblioteket.

Parameteren `a` repræsenterer "hvad der går i de rekursive positioner", og forskellige valg af `a`
giver forskellige fortolkninger:

```haskell
{-# LANGUAGE DeriveFunctor, TypeFamilies #-}
import Data.Functor.Foldable

-- Base-enumerator (samme som før)
data Base
  = Pen
  | Apple
  | Pineapple
  deriving (Show, Eq)

-- Base functor: Ikke-rekursiv version hvor 'a' står i rekursive positioner
data PPAPF a
  = IHaveAF Base
  | NghF a a
  deriving (Show, Eq, Functor)

-- Newtype wrapper for den rekursive type
newtype PPAP = MkPPAP { unPPAP :: PPAPF PPAP }
  deriving (Show)

-- Gør PPAP til en recursion-scheme-kompatibel type
type instance Base PPAP = PPAPF

instance Recursive PPAP where
  project (MkPPAP x) = x

instance Corecursive PPAP where
  embed = MkPPAP

-- Smart konstruktører
pen, apple, pineapple :: PPAP
pen = MkPPAP (IHaveAF Pen)
apple = MkPPAP (IHaveAF Apple)
pineapple = MkPPAP (IHaveAF Pineapple)

ngh :: PPAP -> PPAP -> PPAP
ngh a b = MkPPAP (NghF a b)
```

Nu kan man udføre rekursion på datastrukturen med generaliserede hjælpefunktioner:

```haskell
-- Catamorfisme: Fold strukturen ned (bottom-up evaluering)
-- Tæl hvor mange komponenter der er i et PPAP-objekt
count :: PPAP -> Int
count = cata f where
  f :: PPAPF Int -> Int
  f (IHaveAF _) = 1
  f (NghF a b) = a + b

-- Beregn dybden af sammensætningen
depth :: PPAP -> Int
depth = cata alg where
  alg :: PPAPF Int -> Int
  alg (IHaveAF _) = 1
  alg (NghF a b) = 1 + max a b

-- Saml alle basiskomponenter (fladgør strukturen)
collect :: PPAP -> [Base]
collect = cata alg where
  alg :: PPAPF [Base] -> [Base]
  alg (IHaveAF b) = [b]
  alg (NghF as bs) = as ++ bs

-- Anamorfisme: Unfold/byg en struktur op (top-down generering)
-- Generer et balanceret træ af en given basis-komponent op til en dybde
generateBalanced :: Int -> Base -> PPAP
generateBalanced maxDepth base = ana coalg (maxDepth, base) where
  coalg :: (Int, Base) -> PPAPF (Int, Base)
  coalg (0, b) = IHaveAF b
  coalg (n, b) = NghF (n-1, b) (n-1, b)

-- Paramorfisme: Fold med adgang til både akkumulerede værdier OG original struktur
-- Tjek om strukturen er symmetrisk
isSymmetric :: PPAP -> Bool
isSymmetric = para alg where
  alg :: PPAPF (PPAP, Bool) -> Bool
  alg (IHaveAF _) = True
  alg (NghF (leftTree, leftSym) (rightTree, rightSym)) =
    leftSym && rightSym && structurallyEqual leftTree rightTree

  structurallyEqual :: PPAP -> PPAP -> Bool
  structurallyEqual x y = cata show' x == cata show' y
    where show' (IHaveAF b) = show b
          show' (NghF a b) = "(" ++ a ++ "," ++ b ++ ")"
```

Recursion schemes gør den rekursive struktur eksplicit og giver os generiske måder at traversere og
transformere træstrukturer. Da frie magmaer essentielt set er binære træer uden omskrivningsregler,
kan den her modellering være nyttig.

Forskellen mellem de forskellige schemes er:

- **Catamorfisme (`cata`)**: Bottom-up fold: Det er den mest almindelige form for rekursion.
- **Anamorfisme (`ana`)**: Top-down unfold: Genererer en værdi rekursivt fra en startværdi.
- **Paramorfisme (`para`)**: Som catamorfisme, men giver adgang til både den akkumulerede værdi og
  den originale substruktur — nyttigt når algoritmen har brug for at inspicere den originale form

## GADT'er med [DataKinds](https://stackoverflow.com/questions/20558648/what-is-the-datakinds-extension-of-haskell/20558716#20558716): Type-level programmering

Indtil videre har vi brugt phantom types til at skelne mellem *kategorier* af objekter (`Simple` vs
`Compound`). Men hvad nu hvis vi vil gå skridtet videre og encode *præcist hvilken PPAP-variant* der er
tale om på type-niveau?

Altså: ikke bare "dette er et simpelt objekt", men "dette er præcist en pen" eller "dette er præcist
en apple-pen sammensat af en pen og en apple, og ikke omvendt".

Her kombinerer vi GADT'er med DataKinds til at løfte hele vores PPAP-univers op på type-niveau:

```haskell
{-# LANGUAGE GADTs, DataKinds, KindSignatures #-}

-- Først definerer vi samtlige mulige PPAP-varianter som en datatype
data BaseType
  = TPen
  | TApple
  | TPineapple
  | TApplePen
  | TPineapplePen
  | TLongPen
  deriving (Show, Eq)

-- Med DataKinds slået til bliver hver variant også defineret som type, der kan fodres
-- til en type-parameter, og ikke kun en værdi-parameter (argument til funktion).
-- Nu kan vi sige PPAP 'TPen eller PPAP 'TApplePen

data PPAP :: BaseType -> * where
  Pen             :: PPAP 'TPen
  Apple           :: PPAP 'TApple
  Pineapple       :: PPAP 'TPineapple

  -- Hver konstruktør specificerer PRÆCIST hvad den tager og returnerer:
  ApplePen        :: PPAP 'TPen -> PPAP 'TApple -> PPAP 'TApplePen
  PineapplePen    :: PPAP 'TPen -> PPAP 'TPineapple -> PPAP 'TPineapplePen
  LongPen         :: PPAP 'TPen -> PPAP 'TPen -> PPAP 'TLongPen

-- Nu kan funktioner være UTROLIGT specifikke:
onlyWorksWithPen :: PPAP 'TPen -> String
onlyWorksWithPen Pen = "This is definitely a pen"
-- Ingen andre cases nødvendige — compileren VED det kun kan være Pen!

-- Kan ikke komponere forkert:
example1 :: PPAP 'TApplePen
example1 = ApplePen Pen Apple  -- ✓ type-korrekt

-- example2 = ApplePen Apple Pen  -- ✗ type fejl! Argumenterne er i forkert rækkefølge
-- example3 = ApplePen Pen Pineapple  -- ✗ type fejl! Giver ikke TApplePen
```

Forskellen på tidligere GADT'er og dette er:

- **Tidlige GADT'er**: Skelnede mellem Simple og Compound (2 kategorier)
- **GADT'er + DataKinds**: Encoder *hver enkelt PPAP-variant* som sin egen type

Dette giver os utrolig præcision — vi kan skrive funktioner der kun accepterer `PPAP 'TPen`, eller
garanterer at returnere `PPAP 'TLongPen`. Ikke-kommutativitet bliver indbygget: `ApplePen` tager sine
argumenter i præcis den rækkefølge, og compileren vil brokke sig hvis man bytter om.

## Type families (lukkede)

Når vi er gået i gang med type-level programmering, altså hvor resultatet af beregningerne primært
havner i afgørelsen om et program må oversætte eller ej, og ikke i afviklingen af programmet, så har 

Vi kan definere type-niveau funktioner der beregner kompositionsresultater:

```haskell
{-# LANGUAGE TypeFamilies, DataKinds #-}

type family Compose (a :: BaseType) (b :: BaseType) :: BaseType where
  -- Primære kombinationer fra sangen:
  Compose 'TPen 'TApple      = 'TApplePen
  Compose 'TPen 'TPineapple  = 'TPineapplePen
  Compose 'TApple 'TPineapple = 'TApplePineapple

  -- Idempotens: pen+pen giver NYT element
  Compose 'TPen 'TPen        = 'TLongPen

  -- Ikke-kommutativitet: omvendt orden giver forskellige resultater
  Compose 'TApple 'TPen      = 'TPenApple
  Compose 'TPineapple 'TPen  = '... -- anderledes end TPineapplePen

  -- Højere-ordens kompositioner:
  Compose 'TApplePen 'TPineapplePen = 'TPenPineappleApplePen
  -- ... etc.

-- Type-sikker komposition:
compose :: PPAP a -> PPAP b -> PPAP (Compose a b)
compose = ...

-- Compiler sikrer:
result1 :: PPAP 'TApplePen
result1 = compose Pen Apple  -- ✓ type-korrekt

result2 :: PPAP 'TLongPen
result2 = compose Pen Pen    -- ✓ ikke-idempotent, nyt element

-- result3 :: PPAP 'TApplePen
-- result3 = compose Apple Pen  -- ✗ type fejl! Giver 'TPenApple, ikke 'TApplePen
```

Type families er type-niveau funktioner. Lukkede families giver os exhaustive pattern matching på type-niveau, hvilket perfekt modellerer PPAP's kompositionsregler. Compileren enforcer at kompositionsresultater matcher, og vi kan encode ikke-kommutativitet direkte.

## Functional dependencies

Multi-parameter type classes med functional dependencies giver en anden tilgang:

```haskell
{-# LANGUAGE MultiParamTypeClasses, FunctionalDependencies, FlexibleInstances #-}

-- Functional dependency: a og b bestemmer uniquely c
class Composable a b c | a b -> c where
  compose :: PPAP a -> PPAP b -> PPAP c

-- Primære kompositioner:
instance Composable 'TPen 'TApple 'TApplePen where
  compose Pen Apple = ApplePen Pen Apple

instance Composable 'TPen 'TPineapple 'TPineapplePen where
  compose Pen Pineapple = PineapplePen Pen Pineapple

-- Ikke-idempotens:
instance Composable 'TPen 'TPen 'TLongPen where
  compose Pen Pen = LongPen Pen Pen

-- Ikke-kommutativitet: forskellig instance for omvendt orden
instance Composable 'TApple 'TPen 'TPenApple where
  compose Apple Pen = PenApple Apple Pen

-- Højere-ordens:
instance Composable 'TApplePen 'TPineapplePen 'TPenPineappleApplePen where
  compose ap pp = ...
```

Functional dependencies udtrykker at `a` og `b` uniquely bestemmer `c` — notationen `a b -> c`. Dette er mere fleksibelt end type families i nogle sammenhænge, da vi kan give forskellige implementations via instances. Det modellerer perfekt PPAP's deterministiske men ikke-kommutative natur.

## [Frie monader](https://hackage.haskell.org/package/free)

Der er en direkte forbindelse mellem "frie magmaer" i abstrakt algebra og "Free"-konstruktioner i Haskell:

For en begyndervenlig introduktion kan man læse [Serokell's Introduction to Free Monads][sero-free]

[sero-free]: https://serokell.io/blog/introduction-to-free-monads

```haskell
{-# LANGUAGE DeriveFunctor #-}
import Control.Monad.Free

data PPAPOp a
  = Compose a a
  | MkPen a
  | MkApple a
  | MkPineapple a
  deriving (Functor, Show)

type PPAP = Free PPAPOp ()

-- Smart konstruktører:
pen :: PPAP
pen = liftF (MkPen ())

apple :: PPAP
apple = liftF (MkApple ())

composeOp :: PPAP -> PPAP -> PPAP
composeOp a b = Free (Compose a b)

-- Interpreter:
interpret :: PPAP -> String
interpret = iter alg where
  alg (MkPen _)       = "pen"
  alg (MkApple _)     = "apple"
  alg (MkPineapple _) = "pineapple"
  alg (Compose l r)   = l <> "-" <> r
```

Free monad konstruktionen ligner den matematiske "frie" konstruktion — vi bygger den mindste struktur der opfylder monad-lovene uden at tilføje ekstra ækvivalenser. Analogt har PPAP ingen omskrivningsregler.

## Type-level literals & DataKinds

Vi kan encode string-navnene direkte på type-niveau:

```haskell
{-# LANGUAGE DataKinds, TypeOperators, GADT'er #-}
import GHC.TypeLits

data PPAP (name :: Symbol) where
  Pen             :: PPAP "pen"
  Apple           :: PPAP "apple"
  Pineapple       :: PPAP "pineapple"
  ApplePen        :: PPAP "pen" -> PPAP "apple" -> PPAP "apple-pen"
  PineapplePen    :: PPAP "pen" -> PPAP "pineapple" -> PPAP "pineapple-pen"

type family ShowCompose (a :: Symbol) (b :: Symbol) :: Symbol where
  ShowCompose "pen" "apple"      = "apple-pen"
  ShowCompose "pen" "pineapple"  = "pineapple-pen"
  ShowCompose "pen" "pen"        = "long-pen"
  -- ... ikke-kommutativitet encoded i forskellige cases

-- Type-level strengmanipulation:
showPPAP :: PPAP name -> String
showPPAP = go where
  go :: forall name. KnownSymbol name => PPAP name -> String
  go _ = symbolVal (Proxy @name)
```

Med GHC.TypeLits kan vi bruge Symbol kind til at have type-level strings. Dette giver endnu mere fancy type-sikkerhed — selve navnene eksisterer på type-niveau.

## Singleton-typer

Singletons bygger en bro mellem term- og type-niveau:

```haskell
{-# LANGUAGE TemplateHaskell, StandaloneKindSignatures, TypeFamilies #-}
import Data.Singletons.TH

$(singletons [d|
  data BaseType = TPen | TApple | TPineapple
    deriving (Show, Eq)
  |])

-- Template Haskell genererer:
-- - Promoted types 'TPen, 'TApple, 'TPineapple
-- - Singleton types SPen, SApple, SPineapple
-- - Type family Sing

-- Brug singletons til runtime-refleksion af type-information:
showBase :: Sing (a :: BaseType) -> String
showBase SPen       = "pen"
showBase SApple     = "apple"
showBase SPineapple = "pineapple"

-- Type-level composition med runtime bridge:
type family Compose (a :: BaseType) (b :: BaseType) :: BaseType where
  Compose 'TPen 'TApple = 'TApplePen
  -- ...

sCompose :: Sing a -> Sing b -> Sing (Compose a b)
sCompose = ...  -- compile-time bevis at composition er valid
```

Singletons er typer med præcis én inhabitant — de bærer type-information til runtime. Dette muliggør dependent type-stil programmering i Haskell, hvor vi kan resonnere om typer runtime mens compileren stadig beviser korrekthed.
