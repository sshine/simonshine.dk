+++
title = "Efficient probability testing"
+++

I want share two open-source contributions that were lost on their original audience, yet has taught me something about testing functions that use randomness.

I once had a task at work where a website displayed a banner ad from a selection of banner ads with some internal logic related to categories, weights and fallback banners. Since the result was random, how do you test the selection algorithm?

In the concrete task, I ended up decoupling the `rand()` call from the logic that builds the probability distribution, so that it could be tested deterministically. But below are some other approaches that I really like.

To explore this space I created an Exercism exercise called [`dnd-character`](https://github.com/exercism/haskell/pull/782/files).

It had two purposes,

- let solvers get acquainted with random data generation,
- to test if a random function is implemented correctly.

The idea is to simulate throwing 4 dice and add together the largest 3.

In Haskell, a simple implementation was,

```haskell
import Control.Monad (replicateM)
import Test.QuickCheck.Gen (Gen, choose)

ability :: Gen Int
ability = do
  ds <- replicateM 4 (choose (1, 6))
  return (sum ds - minimum ds)
```

How does one test that this implementation is right?

## Will find another hill to die on

There were two Exercism contributors who answered this,

First @AnAccountForReportingBugs suggested [testing the mean/std.dev.](https://github.com/exercism/problem-specifications/issues/1419) via sampling, but that didn't persuade the crowd (myself included). There were two concerns: performance, and probability of false negatives. -- *"Our unit tests should be 'too fast to notice'"* -- *"With which frequency will this test randomly fail?"* -- *"[...] I'd be happy to be proved wrong by a 100% reliable test that executes in <100ms."* after which they rightfully responded,

> I've provided numbers on multiple occasions, but apparently they aren't good enough. Will find another hill to die on.

I'm saying this approach didn't persuade me, but not that it was wrong or that there didn't exist a sufficient trade-off between efficiency and probability of false negatives. Why was I not persuaded? Because I suck at statistics, and this attempt, as correct as it may be, didn't simplify the concept enough for me to accept it. I wanted to know how many times to re-run the test before a false negative occurred, so that this number could be set at a point that everyone agreed. But others insisted on not having false negatives, no matter how astronomically unlikely they were.

The communication had clearly failed.

## When equations don't persuade, draw graphs

A while later [@jippiee](https://github.com/jippiee) suggested [testing the probability distribution](https://github.com/exercism/java/pull/1623), and actually delivered a PR to the Java track. First, it cached the correct probability distribution, but provided a program that generates it.

```java
int[] distribution = new int[20];
for (int i = 1; i <= 6; i++) {
    for (int j = 1; j <= 6; j++) {
        for (int k = 1; k <= 6; k++) {
            for (int l = 1; l <= 6; l++) {
                int min = Math.min(i, Math.min(j, Math.min(k, l)));
                int sum = i + j + k + l - min;
                distribution[sum]++;
                // System.out.format("%d %d %d %d (min=%d) (sum=%d)%n", i, j, k, l, min, sum);
            }
        }
    }
}
System.out.println(Arrays.toString(distribution));
// [0, 0, 0, 1, 4, 10, 21, 38, 62, 91, 122, 148, 167, 172, 160, 131, 94, 54, 21, 0]
```

And then it samples the exercise function into an array and compares the error with some margin. This solution has two numbers it can easily tune: The number of samples, and the error margin. And the probability of false negatives can be easily derived from these:

```java
private void testDistribution(int cycles, double relativeError, double constantError) {
    if (cycles < 0 || relativeError < 0.0 || constantError < 0.0) {
        throw new IllegalArgumentException();
    }

    int[] distribution = new int[19];
    for (int i = 0; i < cycles; i++) {
        int ability = dndCharacter.ability();
        if (inRange(ability)) {
            distribution[ability]++;
        } else {
            fail("ability out of Range");
        }
    }

    for (int ability = 3; ability <= 18; ability++) {
        double probability = (double) distribution[ability] / cycles;
        double expected    = reference[ability];
        double error       = Math.abs(probability - expected);
        double errorBound  = relativeError * expected + constantError;
        if (error > errorBound) {
            fail();
        }
    }
}
```

I tried to nudge the PR along, and this prompted @jippiee to submit a couple of graphs, one after the other:

This graph illustrates the difference between different probability distributions of different solutions:

![When equations don't persuade, draw graphs.](https://i.imgur.com/K6xabdi.png)

This graph illustrates how a carefully selected error bound will separate even similar solutions that aren't correct:

![When graphs don't persuade, draw more graphs.](https://i.imgur.com/WFGjQdI.png)

> The yellow and green graphs are the distributions of two wrong implementations mentioned at the beginning. The red graph is the reference distribution. The pink graph represents the error bounds for the parameters currently in use: Any distribution that we create by repeatedly calling ability, which falls completely within these bounds is accepted, otherwise rejected.
>
> The blue graph represents the error bounds for the two maximum parameters mentioned. Should the parameters be even larger, it will become increasingly likely that we accept a solution which actually conforms to the green graph ("Throw three dice. Sum them.") than the red one ("Throw four dice. Sum the largest three.").

There weren't any principal criticism of the approach this time. Only: should this comment be here or there? should the explanation be in the source code, or in markdown? should the code that generates the distribution be included, or should it generate a file, or should it be left out? And there was no clear preference on these smaller matters.
  
Eventually, @jippiee silently walked off, not to die on that hill, either.
  
And a couple of years later, yesterday, the PR was closed, rather than merged.

The moral that I derive is that if you introduce too complex concepts, the maintainers of a piece of software will reject it, actively or passively.