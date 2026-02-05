+++
date = '2025-07-26T16:00:57+01:00'
draft = false
title = 'JSON Schema in Haskell using AutoDoCodec'
tags = ['haskell']
+++

In April 2022 I made a [review of Haskell libraries for JSON Schema][json-schema-review].

The outcome of my research was that there weren't really any good libraries for dealing with [JSON Schema][json-schema-website] from within Haskell. That was a surprising disappointment, because Haskell often has very good libraries (although they may be hard to use). The reason is that the JSON Schema specification itself isn't very well-made.

I eventually gave up using any of them.

Today [Albert Krewinkel][albert-krewinkel] wrote me and told me that you can actually use [AutoDoCodec][autodocodec-github] to both generate and validate JSON schemas. The Haskell package [autodocodec][autodocodec-hackage] was announced in [Haskell Weekly #291][haskell-weekly-291] in November 2021 by [Tom Syd Kerckhove][tom-syd-kerckhove]. I knew this library, but had never made the connection that it'd serve all my JSON schema needs. Since my original blog post felt like a dud, here is another post with a happy ending.

AutoDoCodec provides a unified approach to defining codecs that can both serialize/deserialize JSON and generate corresponding JSON schemas automatically. It eliminates the common problem of having separate validation logic and schema definitions that can drift out of sync over time.

Since the JSON schema application as an example is a little dispersed, here's a full example of how one can define a data type, generate its schema, and validate a JSON object against it. You can read the [full source code for the example][json-schema-autodocodec-example] on GitHub.

## Step 1: Define your data type and codec

First, let's define a simple data type with a string, integer, and boolean field, along with its AutoDoCodec instance:

```haskell
{-# LANGUAGE DeriveGeneric #-}
{-# LANGUAGE DerivingStrategies #-}
{-# LANGUAGE OverloadedStrings #-}

import Autodocodec
import Data.Aeson (ToJSON(..), FromJSON(..))
import GHC.Generics (Generic)

data Person = Person
  { personName :: String
  , personAge :: Int
  , personIsActive :: Bool
  } deriving stock (Show, Eq, Generic)

instance HasCodec Person where
  codec = object "Person" $
    Person
      <$> requiredField "name" "The person's name" .= personName
      <*> requiredField "age" "The person's age in years" .= personAge
      <*> requiredField "isActive" "Whether the person is currently active" .= personIsActive

instance ToJSON Person where
  toJSON = toJSONViaCodec

instance FromJSON Person where
  parseJSON = parseJSONViaCodec
```

The `HasCodec` instance defines both the JSON structure and provides field descriptions that will appear in the generated schema. The `ToJSON` and `FromJSON` instances are automatically derived from the codec definition.

## Step 2: Generate the JSON schema

Now we can generate a complete JSON schema from our data type:

```haskell
import Autodocodec.Schema (jsonSchemaViaCodec)
import Data.Aeson.Encode.Pretty (encodePretty)
import Data.ByteString.Lazy.Char8 qualified as L8

main :: IO ()
main = do
  let schema = jsonSchemaViaCodec @Person
  putStrLn "Generated JSON Schema:"
  L8.putStrLn $ encodePretty schema
```

This produces a complete JSON schema with type information, descriptions, and validation rules:

```json
{
    "$comment": "Person",
    "properties": {
        "age": {
            "$comment": "The person's age in years",
            "maximum": 9223372036854775807,
            "minimum": -9223372036854775808,
            "type": "integer"
        },
        "isActive": {
            "$comment": "Whether the person is currently active",
            "type": "boolean"
        },
        "name": {
            "$comment": "The person's name",
            "type": "string"
        }
    },
    "required": ["isActive", "age", "name"],
    "type": "object"
}
```

## Step 3: Validate JSON against the schema

AutoDoCodec provides built-in validation functions to check JSON against the generated schema:

```haskell
import Autodocodec.Schema (validateAccordingTo)
import Data.Aeson qualified as Aeson

-- Valid JSON example
let validJson = Aeson.object
      [ "name" Aeson..= ("Alice" :: String)
      , "age" Aeson..= (30 :: Int)
      , "isActive" Aeson..= True
      ]

-- Invalid JSON example (age as string instead of number)
let invalidJson = Aeson.object
      [ "name" Aeson..= ("Bob" :: String)
      , "age" Aeson..= ("not-a-number" :: String)
      ]

-- Validate using the schema
if validateAccordingTo validJson schema
  then putStrLn "Valid JSON accepted"
  else putStrLn "Valid JSON rejected"

if validateAccordingTo invalidJson schema
  then putStrLn "Invalid JSON incorrectly accepted"
  else putStrLn "Invalid JSON correctly rejected"
```

For more detailed error messages, you can use the parsing functions directly:

```haskell
case Aeson.fromJSON invalidJson of
  Aeson.Success (_ :: Person) -> putStrLn "Parsed successfully"
  Aeson.Error err -> putStrLn $ "Parsing failed: " ++ err
-- Output: "Parsing failed: parsing Scientific failed, expected Number, but encountered String"
```

## Adding validation constraints

AutoDoCodec provides built-in support for adding validation constraints to both numeric and string fields.

### Numeric constraints

To constrain the age field to reasonable values between 0 and 200:

```haskell
-- Define age bounds: 0 to 200 years
ageBounds :: Bounds Integer
ageBounds = Bounds (Just 0) (Just 200)
```

### String length constraints

To ensure the name field is not empty:

```haskell
-- Name length bounds: at least 1 character (non-empty)
nameBounds :: Bounds Word
nameBounds = Bounds (Just 1) Nothing
```

### Updated codec with constraints

```haskell
instance HasCodec Person where
  codec = object "Person" $
    Person
      <$> requiredFieldWith "name" (textWithLengthBoundsCodec nameBounds) "The person's name (non-empty)" .= personName
      <*> requiredFieldWith "age" (dimapCodec fromIntegral fromIntegral (integerWithBoundsCodec ageBounds)) "The person's age (0-200 years)" .= personAge
      <*> requiredField "isActive" "Whether the person is currently active" .= personIsActive
```

This automatically generates JSON schema with proper validation constraints:

```json
{
  "name": {
    "$comment": "The person's name (non-empty)",
    "minLength": 1,
    "type": "string"
  },
  "age": {
    "$comment": "The person's age (0-200 years)",
    "maximum": 200,
    "minimum": 0,
    "type": "integer"
  }
}
```

The constraints are enforced both during JSON parsing and schema validation, ensuring invalid values like empty names or ages outside 0-200 are automatically rejected.

The beauty of AutoDoCodec is that your codec definition serves as both the source of truth for JSON serialization/deserialization *and* schema generation. This eliminates the common problem where validation logic and schema definitions drift apart over time, ensuring they always stay in sync.

[json-schema-website]: https://json-schema.org/
[json-schema-review]: https://simonshine.dk/articles/a-review-of-json-schema-libraries-for-haskell/
[autodocodec-github]: https://github.com/NorfairKing/autodocodec
[autodocodec-hackage]: https://hackage.haskell.org/package/autodocodec
[haskell-weekly-291]: https://haskellweekly.news/issue/291.html
[albert-krewinkel]: https://tarleb.com/about.html
[tom-syd-kerckhove]: https://github.com/NorfairKing/
[json-schema-autodocodec-example]: https://github.com/sshine/json-schema-autodocodec

