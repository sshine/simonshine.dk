+++
title = "Getting recursively drunk with monoids"
+++

**Disclaimer:** I am not a *mixologist*. This is not professional cocktail advice!

Sam Horvath-Hunt blogged about [modelling cocktails as monoids](https://dev.to/samhh/monoids-and-semigroups-2b94). This is a really cool example of FP modelling that I want to expand on. (Lennart Kolmodin once wrote that the dance steps of Tango form a monoid.)

First, I will demonstrate my ignorance by assuming that cocktail recipes are free commutative monoids over ingredients:

- The order in which you add ingredients does not matter,
- If you add two cocktails together, you get another cocktail,
- The identity cocktail is the empty cocktail with no ingredients in it.

Second, I want to up the ante with a recursive cocktail recipe.

It comes from a sketch in the computer science student revue at DIKU (University of Copenhagen): [Superdrinks](https://github.com/dikurevy/Public-Archive/blob/bb88d10bb88b69687f4448b83eeebcf526a81892/2002/sketches/RekursivDrink.tex) (2002); credits go to Uffe Christensen, Uffe Friis Lichtenberg, Jonas Ussing, Niels H. Christensen, Torben Æ. Mogensen, Jørgen Elgaard Larsen who either co-wrote or enacted the sketch.

A superdrinks consists of:
- 1 part gin,
- 2 parts lemon,
- 3 parts superdrinks.

Now, according to the sketch there are plenty of bad ways to materialize this drink; one such is through approximation: take 1 part gin, 2 parts lemon and 3 parts of whatever is your current best approximation of superdrinks. Iterate this process enough times and you will have a gradually finer superdrinks.

Recursively,

$$
superdrinks(n) = 1 × gin
               + 2 × lemon
               + 3 × superdrinks (n-1)
$$

As for $superdrinks(0)$, it could be water. It could be gin! Experimenting a little,

```
superdrinks(1) = 1 × gin + 2 × lemon + 3 × superdrinks(0)

superdrinks(2) = 1 × gin + 2 × lemon + 3 × superdrinks(1)
               = 1 × gin
               + 2 × lemon
               + 3 × (1 × gin + 2 × lemon + 3 × superdrinks(0))
               = 4 × gin + 8 × lemon + 9 × superdrinks(0)
```

The relationship between the number of parts of each ingredient can be expressed in [closed form](https://en.wikipedia.org/wiki/Closed-form_expression) eliminating recursion:

$$
superdrinks(n) = \tfrac{3^n - 1}{2} × gin
               + (3^n - 1) × lemon
               + 3^n × superdrinks(0)
$$

(You can find the closed form either by recognizing that the series *3 × 3 × ...* with *n* occurrences is *3ⁿ*, that there's always one less part lemon than *superdrinks(0)*, and that there's always half the amount of gin of that; or you can solve their [recurrence relation](https://en.wikipedia.org/wiki/Recurrence_relation); or you can expand the three number series using a function,

```haskell
> let superdrinks (gin, lemon, super) = (1 + 3*gin, 2 + 3*lemon, 3*super)
> unzip3 $ take 6 $ iterate superdrinks (0,0,1)
([0,1,4,13,40,121],[0,2,8,26,80,242],[1,3,9,27,81,243])
```

and [look](https://oeis.org/search?q=1%2C4%2C13%2C40%2C121) [them](https://oeis.org/search?q=2%2C8%2C26%2C80%2C242) [up](https://oeis.org/search?q=3%2C9%2C27%2C81%2C243).)

## It is time to get schwifty.

The following ingredients are enough to make gin-tonic and superdrinks:

```haskell
data Ingredient = Gin | Tonic | Lemon
  deriving (Eq, Ord, Show)
```

A cocktail is any set of ingredients and their multiplicity:

```haskell
newtype Cocktail = Cocktail (Map Ingredient Natural)
  deriving (Eq, Ord, Show)

emptyCocktail :: Cocktail
emptyCocktail = Cocktail Map.empty
```

For convenience,

```haskell
parts :: Natural -> Ingredient -> Cocktail
parts n ingredient =
  Cocktail (Map.singleton ingredient n)

combine :: Cocktail -> Cocktail -> Cocktail
combine (Cocktail c1) (Cocktail c2) =
  Cocktail (Map.unionWith (+) c1 c2)
```

One consequence of this modelling is:

```haskell
> let gintonic = combine (1 `parts` Gin) (2 `parts` Tonic)
> gintonic == combine gintonic gintonic
False
```

Since these are cocktail *recipes*, I'd like to normalize the quantities of each ingredient so that recipes don't eventually say "2 parts gin, 4 parts tonic" or "0 parts gin":

```haskell
normalize :: Cocktail -> Cocktail
normalize (Cocktail ingredients) =
  Cocktail . normalize' $ ingredients
  where
    scale = foldr1 gcd (Map.elems ingredients)
    normalize' = Map.map (`div` scale) . Map.filter (/= 0)
```

*(Note that while `foldr1` is [partial](https://wiki.haskell.org/Avoiding_partial_functions), because of Haskell's non-strict semantics, it is never evaluated when `ingredients` is empty because it is used within `Map.map` zero times.)*

Demonstrating `normalize`:

```haskell
> normalize emptyCocktail 
Cocktail (fromList [])

> normalize (0 `parts` Gin)
Cocktail (fromList [])

> normalize $ combine (2 `parts` Gin) (4 `parts` Tonic)
Cocktail (fromList [(Gin,1),(Tonic,2)])
```

It would be tempting to specialize the `Eq Cocktail` instance to use `normalize` so that `c == combine c c` for all `c`. But I don't like to do that because if you ever need to compare for structural equality, you can't, whereas equality under normalization can be achieved with:

```haskell
> let (=~) = (==) `on` normalize
> (1 `parts` Gin) =~ (2 `parts` Gin)
True
```

It would also be tempting to add normalization to `combine` so that the combination of two cocktails is a normalized cocktail. But since this blog post is about monoidal cocktails and `combine` is the best candidate for a composition operator, such choice actually breaks the law of associativity:

```haskell
> let norm_combine c1 c2 = normalize (combine c1 c2)

> gin1 `norm_combine` (gin1 `norm_combine` tonic1)
Cocktail (fromList [(Gin,2),(Tonic,1)])

> (gin1 `norm_combine` gin1) `norm_combine` tonic1
Cocktail (fromList [(Gin,1),(Tonic,1)])
```

So while I like the notion of normalizing cocktail recipes, making it a part of the `Semigroup Cocktail` instance would probably be a bad idea, leaving the much simpler instances:

```haskell
instance Semigroup Cocktail where
  (<>) = combine

instance Monoid Cocktail where
  mempty = emptyCocktail
```

As for superdrinks, the recipe can now be expressed as:

```haskell
superdrinks :: Natural -> Cocktail -> Cocktail
superdrinks n base = mconcat
  [ ((3^n - 1) `div` 2) `parts`  Gin
  ,  (3^n - 1)          `parts`  Lemon
  ,  (3^n)              `rounds` base
  ]

rounds :: Natural -> Cocktail -> Cocktail
rounds n = mconcat . genericReplicate n
```

Whether the *best* approximation is using a base of `mempty` or, as the revue sketch suggests, ``n `parts` Gin``, is highly subjective. For a 5th approximation of superdrinks using pure gin as 0th approximation,

```haskell
> normalize $ superdrinks 5 (1 `parts` Gin)
Cocktail (fromList [(Gin,182),(Lemon,121)])
```

Cheers!