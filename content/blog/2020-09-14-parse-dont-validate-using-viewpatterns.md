+++
title = "'Parse, Don't validate' using ViewPatterns"
+++

In 2019, Alexis King wrote the [Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/) article that catches some of the essences of type-driven software development and design. Several books were released on this matter, including Alexander Granin's [Functional Design and Architecture](https://leanpub.com/functional-design-and-architecture), Sandy Maguire's [Thinking with Types: Type-Level Programming in Haskell](https://leanpub.com/thinking-with-types), or even Edwin Brady's [Type-Driven Development with Idris](https://www.manning.com/books/type-driven-development-with-idris) for a book about the future.

This blog post is about where Alexis' three words got me today.

I refactor a Haskell library that handles Ethereum VM opcodes, and in particular, the part of the library that lets you convert a `Word8` into an `Opcode`.

The first iteration of the code was derived from [Hevm](http://hackage.haskell.org/package/hevm), which interprets binary opcodes using [this function](https://github.com/dapphub/dapptools/blob/master/src/hevm/src/EVM.hs#L2402):

```haskell
readOp :: Word8 -> ByteString -> Op
readOp x _  | x >= 0x80 && x <= 0x8f = OpDup (x - 0x80 + 1)
readOp x _  | x >= 0x90 && x <= 0x9f = OpSwap (x - 0x90 + 1)
readOp x _  | x >= 0xa0 && x <= 0xa4 = OpLog (x - 0xa0)
readOp x xs | x >= 0x60 && x <= 0x7f =
  let n   = x - 0x60 + 1
      xs' = BS.take (num n) xs
  in OpPush (word xs')
readOp x _ = case x of
  0x00 -> OpStop
  ...
  _ -> OpUnknown x
```

I would like for that function to live in [evm-opcodes](https://github.com/sshine/evm-opcodes/), but it needs cleaning up:

1. The `x >= 0x80 && x <= 0x8f` stuff is hard to read, but it also sort of ties together the hex codes and the `OpDup` constructor. If the hex codes were only mentioned here, that'd be fine, but they are littered throughout the codebase, making the interpreter harder to read.

2. Instead of inventing an `OpUnknown` error case, use `Nothing`. One may argue that `OpUnknown x` is better represented as `Left x`, but the caller already has `x`.

The first rewrite looks like this:

```haskell
isDUP, isSWAP, isLOG, isPUSH :: Word8 -> Bool
isDUP b  = b >= 0x80 && b <= 0x8f
isSWAP b = b >= 0x90 && b <= 0x9f
isLOG b  = b >= 0xa0 && b <= 0xa4
isPUSH b = b >= 0x60 && b <= 0x7f

-- | Parse an 'Opcode' from a 'Word8'. In case of 'PUSH' instructions, read the
-- constant being pushed from a subsequent 'ByteString'.
readOp :: Word8 -> ByteString -> Maybe Opcode
readOp b bs
  | isDUP b   = pure . DUP  . fromWord8 $ b - 0x80
  | isSWAP b  = pure . SWAP . fromWord8 $ b - 0x90
  | isLOG b   = pure . LOG  . fromWord8 $ b - 0xa0
  | isPUSH b  = let n = fromIntegral (b - 0x60 + 1)
                in PUSH <$> word256 (BS.take n bs)
  | otherwise = readOp' b

readOp' :: Word8 -> Maybe Opcode
readOp' word = case word of
  0x00 -> pure STOP
  ...
  _    -> Nothing
```

This fixes some things and makes other things worse. While `isDUP` can be used elsewhere, removing many magical constants in many places, it preserves some magical constants in `readOp` that are now no longer on the same line. This means they may drift apart.

In the case of `readOp`, a better programming pattern is needed. It is time to parse, rather than validate. Omitting a few imports and helper functions,

```haskell
readDUP, readSWAP, readLOG :: Word8 -> Maybe Opcode
readDUP b = do
  guard (b >= 0x80 && b <= 0x8f)
  pure (DUP (fromWord8 (b - 0x80)))

readSWAP b = do
  guard (b >= 0x90 && b <= 0x9f)
  pure (SWAP (fromWord8 (b - 0x90)))

readLOG b = do
  guard (b >= 0xa0 && b <= 0xa4)
  pure (LOG (fromWord8 (b - 0xa0)))

readPUSH :: Word8 -> ByteString -> Maybe Opcode
readPUSH b bs = do
  guard (b >= 0x60 && b <= 0x7f)
  let n = fromIntegral (b - 0x60 + 1)
  PUSH <$> word256 (BS.take n bs)
```

The `is...` functions may come handy since their definitions repeat throughout another codebase. They can be written without duplicating the hex ranges:

```haskell
isDUP, isSWAP, isLOG  :: Word8 -> Bool
isDUP = isJust . readDUP
isSWAP = isJust . readSWAP
isLOG = isJust . readLOG

isPUSH :: Word8 -> ByteString -> Bool
isPUSH b bs = isJust (readPUSH b bs)
```

As for using these `read...` parsers instead of their `is...` predecessors, GHC's extension called [ViewPatterns](https://gitlab.haskell.org/ghc/ghc/-/wikis/view-patterns#basic-view-patterns) enables the following syntax:

```haskell
readOp :: Word8 -> ByteString -> Maybe Opcode
readOp (readDUP -> Just dup) _ = Just dup
readOp (readSWAP -> Just swap) _ = Just swap
readOp (readLOG -> Just log) _ = Just log
readOp b (readPUSH b -> Just push) = Just push
readOp b _bs = case b of
  0x00 -> pure STOP
  ...
  _    -> Nothing
```

At this point, a hierarchy of `is...` and `read...` helper functions are composed to form `readOp` in a way that does not leak hex codes and does not duplicate those hex codes. The `readOp (read...)` and `readOp ... Just ... = Just ...` repetitions make it seem like there could be a better way.

But I'm happy for now.