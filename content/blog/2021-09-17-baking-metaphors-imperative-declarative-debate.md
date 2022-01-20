+++
title = "Baking metaphors in the imperative/declarative programming debate"
+++

tl;dr:
- Cake recipes contain both declarative and imperative parts.
- Declarative syntax is better for describing the problem domain.
- Each programming paradigm has its place in software architecture.

## Baking metaphors

An argument is floating around that imperative programming is easier, more natural for humans for the same reason that baking recipes are imperative. Here is a pie recipe for example:

![A pie recipe](https://i.imgur.com/RninUoY.jpg)

Typical baking recipes contain three parts:

- A picture of the expected product
- An ingredients list
- A chronological step-by-step guide

Which of these are imperative, and which are declarative?

Clearly, the picture is declarative; it contains no instructions. The ingredients list is also declarative (or object-oriented?); it contains no imperatives (no verbs). And lastly, the instructions are essentially imperative.

### I almost never read the instructions

*(... this is not baking advice!)*

The first thing I do is look at the picture. It both serves as the motivator (I'd eat that), and as a point of reference that I get back to (either mentally or visually) when baking, to assess my progress.

The second thing I do is loop over the ingredients and ask myself if I'm missing any of these, or if I could substitute or leave out any missing ingredients. Once established that I can begin baking, I determine what group of items go together first. Using a combination of the final picture and a list of a few ingredients, my mind automatically produces the method. My hands will begin to grab the air for the utensils that are necessary, and my mind mostly produces the memory of where they can be found. Only if I rarely or never do a particular thing, I will read how to. I'd definitely read the instructions if I were making a fromage, but never if I made an omelette. And most recipes live in-between.

One of the reasons why I don't like instructions is that they're not flexible wrt. high-level optimizations. In the example pie recipe above, the instructions start out by saying "Butter up 12 muffin pans". What if I'm out of butter, or prefer oil? What if I'm vegan, or my guest is on a diet? What if my muffin pans are non-stick? The first six lines could literally be compacted down to "Roll a dough." if only the reader could be trusted to imagine what kind of dough it is, depending on the ingredients list and the picture.

I am not arguing that cooking recipes should ditch the instructions step. I benefit greatly from them whenever I'm out of my comfort zone, or simply tired; they're opt-in when I execute the recipe.

## Three Layer Haskell Cake

In Haskell, Matt Parsons popularised the [Three Layer Haskell Cake](https://www.parsonsmatt.org/2018/03/22/three_layer_haskell_cake.html) (2018). [Holmusk](https://github.com/Holmusk/three-layer) (well, [Kowainik](https://kowainik.github.io/)) made this picture to go along:

![Holmusk's Three-Layer Haskell Cake](https://i.imgur.com/gdvPgje.png)


tl;dr of each layer is this:

1. Low-level orchestration: **Imperative programming**. This contains the driver that gets the program running. These are tested by running the application (integration tests, end-to-end tests), since that's what can fail here.
2. Services: **Object-oriented programming**. Time, locks, databases, I/O. Build interpreters that tie levels 1 and 3 together, and test them by mocking. A good hierarchy of services are re-usable between programs.
5. Business logic: **Functional programming**. The data types and functions of a domain model, separated from the lower levels with interfaces. Test these with unit tests and property tests.

While you may have paradigm preferences in general, this model argues that there is a right place for each paradigm, and that having a language that supports all paradigms well is important.

One argument, then, is to use a strongly typed, pure functional language with support for imperative programming, rather than the other way around. The reason is the same that Andreas Antonopolous argues on the subject of [Bitcoin's irreversible transactions](https://www.youtube.com/watch?v=4AK9N3HzXLc): Having strong guarantees, you can simulate any weaker ones under certain circumstances, and yet be able to fall back on the stronger guarantees. Having weak guarantees to begin with, you can never establish strong ones. You can write an untyped interpreter in a typed language, but you can't make an interpreted language throw compile-time errors.