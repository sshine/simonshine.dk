# Agent notes

## Tagging articles

Tags live in the TOML front matter of `content/articles/*.md`:

```toml
+++
tags = ['nix', 'git', 'hooks']
+++
```

Work with two levels: **established tags** and **candidate tags**.

### Established tags

Run:

```sh
just tags
```

This prints the active tags, their article counts, and a health status:

- `dead` — 0–2 articles. Do not create more dead tags.
- `good` — 3–12 articles. The target size for a topic tag.
- `broad` — 13–20 articles. Acceptable for a genuinely broad topic.
- `section` — more than 20 articles, or explicitly listed in
  `scripts/tag-sections.txt` (`nix`, `datamatik`). A section is navigation,
  not a topic tag.

Prefer established tags. A good topic tag has enough neighbours to browse but
is not shared by most of the blog.

### Candidate tags

Run:

```sh
just tag-candidates
just tag-candidates 60      # change the output limit
```

The script reads the corpus with bash/awk, strips code and markup, and prints
terms that are used in at least 3 articles but are not established tags. It
shows document frequency (`df`), title/heading/intro counts, status, and a
sample title. Candidate output is generated on demand; do not maintain a static
list of potential tags.

To see established and candidate suggestions per article:

```sh
just tag-proposals
```

Each line contains the current tags (`cur`), established tags that look central
to the article (`est`), and candidates from the global shortlist that occur in
the article (`cand`). `cand` is limited to the current top 12 candidates, so it
stays a shortlist rather than a list of every word in the article.

### Rules

- Use **2–5 tags** per article. At most one section tag.
- Tag what the article is **about**, not every technology it mentions. A term
  in the body is not enough; prefer title, headings, intro, or sustained
  discussion.
- A new tag needs **3+ articles**. A one- or two-article tag is a keyword, not
  a tag: use a broader established tag and wait.
- Target **3–12 articles** per topic tag. Never add a tag present in more than
  70% of articles.
- `rust` and `haskell` are valid tags. Use them when the language is part of the
  article's subject, not merely its implementation language.
- `nix` and `datamatik` are section tags. They are allowed but are not enough on
  their own; pair them with a specific tag where possible.
- `git` is an editorial-interest tag. Use it for articles about git practice,
  history, hooks, and workflows. Not everything that touches a repository is a
  git article.
- `hooks` is deliberately separate from `git`: all hook articles are git
  articles, but not all git articles are about hooks. Use both when the article
  is about git hooks.
- Do **not** add `pre-commit`, `lefthook`, `lefthook-nix`, `sops-nix`, or
  `nixos-anywhere` as tags. Use `git`/`hooks`/`hk-nix`, `secrets`, and `nix`
  respectively. These decisions live in `scripts/tag-decisions.tsv`.
- If an article is the first of a new topic, leave it with the nearest
  established tags. The candidate report will resurface the term when a third
  article makes it a real neighbourhood.
- Do not read all articles to derive tags. Run the commands and read only their
  output.

### Files

- `scripts/tags.sh` — the bash/awk tag tool.
- `scripts/tag-stopwords.txt` — generic words that should not become tags.
- `scripts/tag-sections.txt` — broad section tags.
- `scripts/tag-decisions.tsv` — accepted/rejected candidate decisions; rejected
  terms are filtered from the reports.

Keep this tool in bash while it stays small. The threshold for replacing it with
a Rust CLI is high; do not introduce a compiled tool for convenience alone.
