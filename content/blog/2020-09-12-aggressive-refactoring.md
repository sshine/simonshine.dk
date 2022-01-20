+++
title = "Aggressive Refactoring"
+++

Here is a small example of aggressive refactoring in Haskell. I am in the codebase of a compiler for a small smart contract language, and I'm replacing occurrences of `Integer` with occurrences of `Word256`, since the code generator in question targets Ethereum which has 256-bit word sizes.

The compiler was originally made with `Integer`, and in some cases its very own `Word256` which was made in a crude way. `Integer` because this is a very convenient data type in Haskell, even though arbitrary precision in this case is actually wrong, and the crude `Word256` because it seemed simpler to make this type rather than import a library.

But now this is no longer convenient, so I've decided to use `Word256` of the `data-dword` library since that's what [Hevm](http://hackage.haskell.org/package/hevm) uses. There are alternatives: `largeword` and `wide-word`, but the important part for now is interoperability.

And here is the type error I'd like to show:

```
src/Lira/Backends/Evm/EvmCompiler.hs:695:22: error:
    • Couldn't match expected type ‘Integer’
                  with actual type ‘Data.DoubleWord.Word256’
    • In the first argument of ‘push’, namely ‘i’
      In the expression: push i
      In the expression: [push i]
    |
695 |   IntVal  i -> [push i]
    |                      ^
```

Because `IntVal i` now contains a `Word256` and `push` was designed for `Integer`, the types no longer align. Looking at `push`:

```haskell
push :: Integer -> EvmOpcode
push = PUSHN . words'
  where
    words' :: Integer -> [Word8]
    words' i | i < 256 = [fromIntegral i]
    words' i           = words' (i `div` 256) ++ [fromIntegral $ i `mod` 256]
```

There is no logic in this function that prevents it from operating on `Word256` rather than `Integer`. In fact, rather than change the function, just loosen the type signature:

```diff
-push :: Integer -> EvmOpcode
+push :: Integral i => i -> EvmOpcode
 push = PUSHN . words'
   where
-    words' :: Integer -> [Word8]
+    words' :: Integral i => i -> [Word8]
     words' i | i < 256 = [fromIntegral i]
     words' i           = words' (i `div` 256) ++ [fromIntegral $ i `mod` 256]
```

Doing an aggressive refactor like changing a base type in the codebase requires hundreds of changes. But when their nature is like this, I can safely leave this change be and proceed to the next type error.