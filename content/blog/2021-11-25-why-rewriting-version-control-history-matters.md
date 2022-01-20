+++
title = "Why rewriting version control history matters"
+++

> Life is understood backwards, but must be lived forwards.
> --- Søren Kierkegaard

## A summary on good commit messages

Because version control systems, like git and GitHub, are at the heart of modern software development workflows, most workflows are heavily impacted by and defined in terms of how to operate and cooperate around version control.

Making use of issue trackers, pull requests, review tools, and commit messages, there are many right ways to distribute the communication that revolves around a change in source code. So...

Why good commit messages?

- Code is read much more often than it is written. As [Raymond Chen](https://devblogs.microsoft.com/oldnewthing/20070406-00/?p=27343) says:

  > *Even if you don't intend anybody else to read your code, there's still a very good chance that somebody will have to stare at your code and figure out what it does: That person is probably going to be you, twelve months from now.*

- The same reason extends to commit messages. As [Chris Beans](https://chris.beams.io/posts/git-commit/) says:

  > *... a well-crafted Git commit message is the best way to communicate context about a change to fellow developers (and indeed to their future selves). A diff will tell you* what *changed, but only the commit message can properly tell you* why.

- When an entire commit message consists of messages like "wip", "small fix", or "added code", [Peter Hutterer](http://who-t.blogspot.com/2009/12/on-commit-messages.html) suggests this is due to a lack of training in reading code:

  > *If you haven't given much thought to what makes a great Git commit message, it may be the case that you haven't spent much time using `git log` and related tools. There is a vicious cycle here: because the commit history is unstructured and inconsistent, one doesn't spend much time using or taking care of it. And because it doesn't get used or taken care of, it remains unstructured and inconsistent.*

## The cost of rewriting under collaboration

When discovering the solution to a problem, the explored path is rarely the shortest path. Placing good explanations in git history makes it ideal for being read, but there are several costs when one has to "go back" and place them while at the same time collaborate with others:

1. **Cost of learning new tools:** Rewriting git history requires some of the more difficult git commands, but there are simple approaches, too:
   - GitHub lets you [squash pull requests](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/incorporating-changes-from-a-pull-request/about-pull-request-merges#squash-and-merge-your-pull-request-commits); in the web UI, you can squash all commits into a single one and edit the commit message in a textarea. This works best when your pull requests are small.
   - `git commit --fixup` and `git rebase -i --autosquash` are easy to learn and use. Read the [`--fixup & --autosquash` guide](https://fle.github.io/git-tip-keep-your-branch-clean-with-fixup-and-autosquash.html) by Florent Lebreton.
   - `git reset --soft` lets you re-commit everything anew. Read [Git Basics: Rewriting a branch's commit history from scratch](https://medium.com/magnetis-backstage/git-basics-rewriting-a-branchs-commit-history-from-scratch-7bc966716d8b) by Igor Marques da Silva.
   - You can always create a local copy of a branch before attempting to rewrite history. You can even view the history of your copy (using `git log <branch>` and `git show <hash>`) while simultaneously rebuilding the history (using `git add -p` and `git commit -v`).
2. **Cost of wording:** The time and patience to write a good explanation, and the expectation that it will eventually be read. Writing messages to your future self can work as a legitimate motivator.
3. **Cost of merge conflicts:** When rewriting history and force-pushing to a remote branch, this forces collaborators on that branch out of sync by removing conflict-free merge paths, and it risks overwriting contributions.
   - Clearly, **`push --force` is bad, mm'kay?!** Fortunately, [Steve Smith](https://blog.developer.atlassian.com/force-with-lease/) has something to say:

     > *The problem here is that when doing a force push Bob doesn’t know why his changes have been rejected, so he assumes that it’s due to the rebase, not due to Alice’s changes. This is why `--force` on shared branches is an absolute no-no; and with the central-repository workflow any branch can potentially be shared.*
     >
     > *But `--force` has a lesser-known sibling that partially protects against damaging forced updates; this is `--force-with-lease`.*
     >
     > *What `--force-with-lease` does is refuse to update a branch unless it is the state that we expect; i.e. nobody has updated the branch upstream. In practice this works by checking that the upstream ref is what we expect, because refs are hashes, and implicitly encode the chain of parents into their value.*

   - Even when your collaborator is only reviewing or evaluating code, and not pushing changes, a merge conflict caused by force-pushing can cause extra time spent syncing. If this bothers a collaborator, perhaps rewriting history can happen only before and after their role is fulfilled.

The explorative path might truthfully involve a lot of "small fix", "trying", and "oops" steps, but these are not interesting in 6 months. We may be interested in more than perfect hindsight, so leaving a trail of comments in an issue tracker, in a pull request thread, or in a code review is a way to deepen the understanding.

## How to write Good Commit Messages: Quick Reference

- [How to write a git commit message](https://chris.beams.io/posts/git-commit/), by Chris Beams, focuses on the formatting:

  > 1. *Separate subject from body with a blank line*
  > 2. *Limit the subject line to 50 characters,*
  > 3. *Capitalize the subject line*
  > 4. *Do not end the subject line with a period*
  > 5. *Use the imperative mood in the subject line*
  > 6. *Wrap the body at 72 characters*
  > 7. *Use the body to explain what and why vs. how*

- [On commit messages](http://who-t.blogspot.com/2009/12/on-commit-messages.html), by Peter Hutterer, focuses on the *what* and the *why*:

  > 1. *Why is it necessary? It may fix a bug, it may add a feature, it may improve performance, reliabilty, stability, or just be a change for the sake of correctness.*
  > 2. *How does it address the issue? For short obvious patches this part can be omitted, but it should be a high level description of what the approach was.*
  > 3. *What effects does the patch have? (In addition to the obvious ones, this may include benchmarks, side effects, etc.)*

## Some real-world examples

Imagine receiving a pull request with the following commits:

```
commit edc9ff5febb698a05f68650d6d58828202c24daf
Author: John Doe <john.doe@example.com>
Date:   Mon Nov 22 16:23:24 2021 +0100

    WIP
```

This message is clearly a working title that should be rephrased when the author is comfortable. Sometimes you want to commit and push half-done work, and sometimes you want to wait with providing a good explanation.
  
When collaborating, establish a standard way of saying "don't do X yet," where X could be *look at*, *review*, *merge*, *contribute to*, or any other activity that creates potential conflicts between contributors. Typically the word "WIP" means that.

This warrants git history rewriting before merging.

```
commit 11f8a068bec49abdddd7bdf203b77ecbfe48451f
Author: John Doe <john.doe@example.com>
Date:   Thu Nov 4 10:19:40 2021 +0100

    Added cronjob
```
  
Added *what* cronjob, and *why*?

```
commit da8362e0b43ea3b18013f9245a614cf00ce43b60
Author: John Doe <john.doe@example.com>
Date:   Thu Nov 4 12:49:43 2021 +0100

    fixup! Added cronjob
```
  
The author is signalling that they intend to squash the change. With this intent in mind, this clearly warrants git history rewriting before merging.

```
commit 57e0b283f69c576db48003dc1ec3b2f492f79540
Author: John Doe <john.doe@example.com>
Date:   Mon Nov 22 14:30:12 2021 +0100

    small fix
```
  
  This commit should either be squashed into some other commit, or explain what small fix this is. This either warrants rewriting the commit message, or squashing the commit.

```
commit 438cc1ce87dec47081b75d4cbd6ce4abca40b8c0
Author: John Doe <john.doe@example.com>
Date:   Thu Oct 7 19:42:13 2021 +0200

    Added indexed "cachedStatus" field on KnowledgeNodeStore which is automatically filled with the value of KnowledgeNode->data['status']['state']. This might help the speed of common KnowledgeNodeQuery calls. Migration included that needs to run before we can remove the old filtering logic in KnowledgeNodeQuery.
```

Yes, that is a 308-character subject field. Besides coming up with a short, descriptive title, and arguably word-wrapping, this commit message does detail *what* and *why* rather than *how*. The included migration that is mentioned could be split into a separate commit.

![:(](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/lkoxkebkg7dj29ovzrxc.png)