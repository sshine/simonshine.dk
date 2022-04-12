+++
title = "Writing code on doors"
+++
Did you ever see pseudo-code in job ads that looked like

```rust
if ($you.like_to_work($here) === True) {
    $job.apply();
}
```

and thought to yourself a bunch of things about variables not being in scope, and whether their actual code has utterly specific library functions? Did you ever try to design an authentic piece of pseudo-code and found how difficult it is to remain concise enough to get the point across, but also idiomatic enough to even care expressing this as code?

At my local office, a sign was recently posted with instructions to lock the office.

Shortly after, another sign followed.

![The code on these doors is highly ambiguous!](code-on-doors.png)

## Analysis

Having policies listed on the door is a bit messy, but it gets the point across. Perhaps some of the mess can be reduced by analysing the process through which they ended up here, and produce a shorter version.

Growing an office policy is an iterative process, and two separate methods of adding new rules were used: Adding to the paper with the existing policy, and hanging up new paper. The fact that a new rule is added with a pen is not actually a problem, but is the greatest feature of paper tech that we have yet to reinvent elsewhere.

Both methods introduce redundancy: The hand-written "Turn off coffee machine" and all but one of the printed bullets are listed twice. Since the lists are short, it is easy to determine what the key point is: Start the dishwasher before weekends begin.

Being new to Rust, I wanted to write the stupid pseudo-code version of this. My first iteration simply tried to reduce code duplication by making the weekend-dishwasher rule conditional:

```rust
impl Shutdown for Office {
    fn leave(&mut self, now: DateTime<Local>) {
        self.lights(Off);
        self.lock(On);
        self.coffee_machine.stop();

        if now.weekday() == Weekday::Fri {
            self.dishwasher.start();
        }
    }
}
```

The basic thing I like about this code is that it looks like Rust, but doesn't go much into what a `Shutdown` or an `Office` actually is.

## Ambiguity

The lovely and sometimes frustrating thing about human language is that it leaves room for ambiguity. You can say multiple things at once, say different things to different people with one message, and leave room for interpretation.

The moment you write human instructions as programming code, the ambiguity becomes glaringly apparent. Once I had read the instructions as programming code, I immediately thought, "Wait, what if Friday is a bank holiday?" I actually want a softer definition of weekend.

## Abusing ambiguity

So wait...

I'm starting the dishwasher on Fridays, no matter what, just because it's weekend? This seems like an X-Y problem. I know how dishwashers work. We don't want to accumulate smell over the weekend, and we like to tidy our workspace so that arriving to it gives you energy. But we also don't want to pointlessly start dishwashers on Fridays. What are the actual criteria?

```rust
impl Shutdown for Office {
    fn leave(&mut self, now: DateTime<Local>) {
        self.lights(Off);
        self.lock(On);
        self.coffee_machine.stop();

        if now.is_beginning_of_weekend() && self.dishwasher.is_full() {
            self.dishwasher.start();
        }
    }
}
```

So wait...

- We only start the dishwasher on Fridays if it's full?
- What if it's half-full, or it's full and isn't a Friday?
- What if the dishwasher has already started? Do we assume that `.start()` is idempotent, do we stop the machine just to start it again, or do we busy-wait for the machine to stop just to start it a second time? It is Friday, after all!

A problem of joining the two pieces of paper was that they carried different implicit assumptions; joining them, the absence of any non-Friday dishwasher logic should not imply a hard rule against using the dishwasher on non-Fridays. We could be more explicit about overlapping event handlers, but that sounds like boilerplate code.

## You start empty dishwashers?

It was at this time that I changed the policy and let go of the "Dishwasher Friday" rule. I know, I know. Cleaning nazi! Party pooper! But really, as these rules are explicated further, I am sure that people will appreciate how rarely they actually have to start the dishwasher once they wield the powers of formal logic.

1. Let's not start empty dishwashers just because we can. And let's add soap.
2. A lady came by and suggested that we also want to turn off the AC when we leave.
3. Every once in a while, the coffee machine needs some more love beyond just being turned off. It is smart enough to alert to its needs.
4. Since we're programming, and Rust has sequential evaluation semantics, let's not turn off the lights and lock the door before we've performed the tasks that are better performed with unimpaired vision and being able to leave.

```rust
impl Shutdown for Office {
    fn leave(&mut self) {
        self.air_condition(Off);

        if !self.coffee_machine.status_ok() {
            self.coffee_machine.do_maintenance();
        }
        self.coffee_machine.stop();

        if !self.dish_washer.is_empty() &&
           !self.dishwasher.is_running() &&
           !self.dish_washer.is_complete()
        {
            self.dish_washer.add_soap();
            self.dish_washer.start();
        }

        self.lights(Off);
        self.lock(On);
    }
}
```
