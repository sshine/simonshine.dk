+++
title = "A review of JSON Schema libraries for Haskell"
+++

[JSON Schema](http://json-schema.org/) is a JSON format that describes JSON formats.

It is mostly used to validate that a JSON value has the correct format, but it can also be used to generate random values that fit a schema definition. This may be useful for testing.

The latest version of JSON Schema is called "Draft 2020-12", and the way to define a schema using this draft:

```json
{
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    ...
}
```

[Previous versions](http://json-schema.org/specification.html) were called Draft-03 (2010), Draft-04 (2013), ... up to Draft-08 which was renamed into Draft 2019-09. When exploring Haskell libraries that handle JSON Schema definitions, they tend to have stalled on an earlier draft. There seems to be a pattern, and Juspay's [medea](https://hackage.haskell.org/package/medea) package has already summarised what's going on in their README section [Why Medea?](https://github.com/juspay/medea#why-medea); where their answer goes in depth with some sober roasting, I'll summarise:

> - The JSON Schema standard is complex
> - It *[...]* covers considerably more than simply validating JSON documents
> - JSON Schema requires arbitrary URI resolution

This reminds me of Bloodhound's [support for ElasticSearch version 1 and 5](https://github.com/bitemyapp/bloodhound#version-compatibility) (and why the library doesn't support version 6, 7, or 8): The complexity and constant release of new ElasticSearch API versions makes it difficult to make a typed library around it. I'm not sure exactly how to phrase it, but Haskell seems like a bad fit for this type of highly volatile interface. Adding recursive, unbounded network I/O as part of the validation makes a Haskeller less likely to pursue a full implementation.

Never the less. I did a deep scan for the word "schema" on https://hackage.haskell.org/packages/ and procured the following list of JSON Schema-specific packages. They fall into one of two categories.

## When a spec is too complex, a few things can happen

First, there's the "we tried and gave up" category; they all have in common that they're attempts to make a working library for an early version of JSON Schema, and they all have in common that they're abandoned; such is the fate of open source sometimes.

- [aeson-schema](https://hackage.haskell.org/package/aeson-schema): Only Draft-03, [recommends hjsonschema](https://github.com/ocramz/aeson-schema#other-libraries) instead.
- [hjsonschema](https://hackage.haskell.org/package/hjsonschema): Only Draft-04, [announced deprecated](https://github.com/seagreen/hjsonschema#deprecation-notice) in an attempt to be too modular.
- [jsonschema-gen](https://hackage.haskell.org/package/jsonschema-gen), [jsons-to-schema](https://hackage.haskell.org/package/jsons-to-schema): Only Draft-04, neither does validate, generates schemas based on values, [some limitations](https://github.com/garetht/jsons-to-schema/#future-plans) apply.

Then there are the libraries that appear to be JSON Schema-related libraries judging by their name, but they are, in fact, all variations that explicitly do not attempt to support JSON Schema, but build something similar with more limited assumptions:

- [json-schema](https://hackage.haskell.org/package/json-schema): "It's haskell specific and has no relation to json-schema.org."
- [aeson-schemas](https://hackage.haskell.org/package/aeson-schemas): Last updated in 2022! Type-safe schema language using Template Haskell. But it doesn't come with an option to load a JSON Schema .json file. So they're schemas in JSON, but not *JSON Schema* schemas.
- [hschema-aeson](https://hackage.haskell.org/package/hschema-aeson): Last updated in 2022! A similar project that lets me specify schemas for Haskell data types and encode them as JSON. So they're schemas in JSON, but not *JSON Schema* schemas.
- [schematic](https://hackage.haskell.org/package/schematic): Last updated in 2021. "It can be [thought of as a subset of *JSON Schema*](https://github.com/typeable/schematic)", "Schematic schemas can be exported to json-schema".
- [medea](https://hackage.haskell.org/package/medea): Last updated in 2021. "Medea is a schema language for JSON document structure. It is similar to JSON Schema, but is designed to be simpler and more self-contained."
- *([quick-schema](https://hackage.haskell.org/package/quick-schema): Last updated 2015. Minimalistic JSON schema language. Not maintained, and not exactly up to par.)*

## Summary

If you wish to mostly support a 10-12 year old draft of JSON Schema using an unmaintained package that currently fails to build in a modern build environment, you have two options: aeson-schema, and hjsonschema. While one recommends the other, and the other is self-deprecated, I'm not completely sarcastic when I say that **aeson-schema** could work. It appears well made, and you may want to support a super old JSON Schema definition before it got complex, or even extend it to a later draft.

If you wish for *any* coverage of Draft 2020-12, you're in bad luck. Haskellers simply gave up and wrote alternative JSON schema libraries. If you're not trying to release a JSON specification into the public domain, and you're just picking a good internal pipe language that supports JSON, any of **aeson-schemas**, **hschema-aeson**, **schematic**, and **medea** may be good choices. Or you may look at entirely different serialisation frameworks.

While I cannot currently prioritise evaluating each of these, since I am in the process of releasing a specification for my new pet project, [JSON Flashcard](https://github.com/json-flashcard), and I do need for a specification format and not just a library, I'm trying my luck with **schematic**, because it allows me to *export to JSON Schema*, without trying to support it fully.