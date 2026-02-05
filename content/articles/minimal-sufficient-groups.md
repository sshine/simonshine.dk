+++
date = '2025-02-02T16:11:57+01:00'
draft = false
title = 'Minimal Sufficient Groups'
tags = ['haskell']
+++

This is a programming interview question I got some years ago.

## The problem

When a certain company creates a new project, they enumerate the skills required for the project, and they form a project group where each of those skills are represented. Project groups have two rules:

- **Sufficient:** Each required skill should be represented with at least one group member.

- **Minimal:** Each group member should be essential, so removing any one member from the team should make the rest of the team no longer sufficient. Members can have overlapping skills, as long as everyone is essential in some capacity.

The task is, given a set of employees and their skill sets, and a set of required skills, provide all possible minimal, sufficient project groups.

## My solution

```haskell
{-# LANGUAGE RankNTypes #-}
{-# LANGUAGE ScopedTypeVariables #-}

module MinimalProjectGroups where

import Data.Map.Strict (Map)
import qualified Data.Map.Strict as Map
import Data.Set (Set)
import qualified Data.Set as Set
import Data.Text (Text)
import qualified Data.Text as Text

minimalSufficientGroups
  :: forall employee. forall skill. (Ord employee, Ord skill)
  => Map employee (Set skill) -> Set skill -> Set (Set employee)
minimalSufficientGroups staff requirements =
  Set.filter (\group -> isSufficient group && isMinimal group) allGroups
  where
    allGroups :: Ord employee => Set (Set employee)
    allGroups = Set.powerSet (Map.keysSet staff)

    isSufficient :: Ord employee => Set employee -> Bool
    isSufficient group =
      requirements `Set.isSubsetOf` Set.unions (Set.map skillsOf group)

    skillsOf :: (Ord employee, Ord skill) => employee -> Set skill
    skillsOf employee = Map.findWithDefault Set.empty employee staff

    isMinimal :: Ord employee => Set employee -> Bool
    isMinimal group = all (`isEssentialFor` group) group

    isEssentialFor :: Ord employee => employee -> Set employee -> Bool
    isEssentialFor employee group =
      not (isSufficient (Set.delete employee group))
```

I optimized for natural readability and type generality.

Solving it today I would have factored in the total memory usage of the program, since power sets are exponential. While laziness helps a little, I have come to appreciate explicit control of program memory.
