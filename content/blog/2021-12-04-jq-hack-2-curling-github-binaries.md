+++
title = "jq hack #2: curl'ing GitHub binaries"
+++

Something I see quite often is a combination of `grep` and `cut` to extract URLs from JSON objects, for example:

```
$ curl -s https://api.github.com/repos/go-gitea/gitea/releases/latest \
  | grep browser_download_url \
  | cut -d '"' -f 4 \
  | grep '\linux-amd64$' \
  | wget -i -
```

This is neat because `grep` and `cut` are almost always available on Linux. And the approach works for all kinds of plaintext documents with a semi-expectable format, not just JSON, so the approach is worth keeping around. But for JSON in particular, this approach is unnecessarily fragile because of a few unreasonable assumptions:

- Whitespace formatting: If, for example, GitHub decides to start compacting their JSON output, this script would stop working, since it assumes "browser_download_url" is on a separate line with its URL value.
- JSON escape sequences: If, for example, the queried output contains JSON escape sequences, then those will not be evaluated, so `\u....` would become six characters rather than one Unicode character.

For a `jq` version that is stable across legal JSON syntax variation, one could do this instead:

```
$ curl -s https://api.github.com/repos/go-gitea/gitea/releases/latest \
  | jq -r '.assets[]
           | .browser_download_url
           | select(endswith("linux-amd64"))'
https://github.com/go-gitea/gitea/releases/download/v1.15.7/gitea-1.15.7-linux-amd64
```

That's the tl;dr.

## Explaining how this query works

- `curl -s` only prints the file contents, not debug information about the download.
- `jq -r` outputs plaintext instead of JSON *if and only if* the object you're printing is a JSON string.
- `.assets[]` enters the "assets" sub-field and splits the list it contains into multiple results,
- `.browser_download_url` reduces each of those multiple results to its sub-field,
- `select(endswith("linux-amd64"))` removes results that don't match.

Here is a variation of the query that produce the same result:

```
$ curl -s https://api.github.com/repos/go-gitea/gitea/releases/latest \
  | jq -r '.assets
           | map(.browser_download_url
                 | select(endswith("linux-amd64")))
           | .[]'
https://github.com/go-gitea/gitea/releases/download/v1.15.7/gitea-1.15.7-linux-amd64
```

The difference is that here, `.assets` instead of `.assets[]` does not split the sub-field into multiple results. Instead, `map(...)` runs `...` on each element in the one result being a list (and not the many results being the list's elements). 

The query itself in both cases is

```
.browser_download_url | select(endswith("linux-amd64"))
```

which first turns each list element into its sub-field, being only the URL, and then removes that URL from the inside of the list if it isn't the right one. Lastly, `.[]` takes the list of remaining URLs and turns them into multiple string results.

This `map()` variation is worth considering because it also lets us filter based on criteria made on the full asset object, and not just the URL itself. For example, to remove any uploads from the result that were not made by the GiteaBot user,

```
$ curl -s https://api.github.com/repos/go-gitea/gitea/releases/latest \
  | jq -r '.assets | map(select(.uploader.login == "GiteaBot")
                         | .browser_download_url
                         | select(endswith("linux-amd64")))
                   | .[]'
https://github.com/go-gitea/gitea/releases/download/v1.15.7/gitea-1.15.7-linux-amd64
```

## Exploring a big JSON document with jq/less

In the process of deriving the final `jq` query, I relied on using [`jq` and `less` as an ad-hoc JSON browser](https://dev.to/sshine/jq-hack-1-colored-less-3fo3) using the following steps:

```
$ curl -s https://api.github.com/repos/go-gitea/gitea/releases/latest \
  | jq -C . | less -R
```

Thought: So there's an `.assets` list, and `.browser_download_url` is a direct child field in each underlying asset object... how many elements does this `.assets` have?

```
$ curl -s https://api.github.com/repos/go-gitea/gitea/releases/latest \
  | jq '.assets | length'
72
```

Thought: And how many assets are actually related to "linux-amd64"?

```
$ curl -s https://api.github.com/repos/go-gitea/gitea/releases/latest \
  | jq -r '.assets[] | .browser_download_url | select(contains("linux-amd64"))'
https://github.com/go-gitea/gitea/releases/download/v1.15.7/gitea-1.15.7-linux-amd64
https://github.com/go-gitea/gitea/releases/download/v1.15.7/gitea-1.15.7-linux-amd64.asc
https://github.com/go-gitea/gitea/releases/download/v1.15.7/gitea-1.15.7-linux-amd64.sha256
https://github.com/go-gitea/gitea/releases/download/v1.15.7/gitea-1.15.7-linux-amd64.xz
https://github.com/go-gitea/gitea/releases/download/v1.15.7/gitea-1.15.7-linux-amd64.xz.asc
https://github.com/go-gitea/gitea/releases/download/v1.15.7/gitea-1.15.7-linux-amd64.xz.sha256
```

