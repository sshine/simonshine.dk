#!/usr/bin/env bash
# Tag tooling for the simonshine.dk article corpus.
#
# Only bash and awk: no Python. The "too big" threshold for rewriting this as a
# Rust CLI is high; keep it in shell until that is clearly justified.
#
# Commands:
#   tags            active tags and counts
#   tag-candidates  terms that could become tags, with document frequency
#   tag-proposals   one compact line per article: current, established, candidates

set -eu
trap "" PIPE

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTICLES="$ROOT/content/articles"
STOPWORDS="$ROOT/scripts/tag-stopwords.txt"
DECISIONS="$ROOT/scripts/tag-decisions.tsv"
SECTIONS="$ROOT/scripts/tag-sections.txt"

usage() {
  cat <<'EOF'
usage: scripts/tags.sh <command> [options]

commands:
  tags                      active tags and counts
  tag-candidates [--limit N]  candidate terms with document frequency
  tag-proposals             one line per article with current/established/candidate tags
EOF
}

if [ -n "${TAGS_TMP:-}" ]; then
  tmp="$TAGS_TMP"
  mkdir -p "$tmp"
else
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
fi

build_tags() {
  # One line per article: filename<TAB>tag1,tag2,...
  # Only the first front-matter block is read, so `tags =` examples in code
  # blocks are ignored.
  awk '
    FNR == 1 {
      if (file != "") print file "\t" current;
      file = FILENAME; current = ""; fm = 0; fm_seen = 0;
    }
    /^\+\+\+$/ {
      if (!fm_seen) { fm = 1; fm_seen = 1; next }
      if (fm) { fm = 0; next }
    }
    fm && /^tags[ \t]*=/ {
      line = $0;
      sub(/^[^[]*\[/, "", line);
      sub(/\].*/, "", line);
      gsub(/[\047" \t]/, "", line);
      current = line;
    }
    END { if (file != "") print file "\t" current }
  ' "$ARTICLES"/*.md > "$tmp/tags.tsv"
}

build_terms() {
  # One line per (article, term): term, file, title_hits, heading_hits,
  # intro_hits, body_hits, article title.
  awk -v stopfile="$STOPWORDS" -v decisions="$DECISIONS" -v tagsfile="$tmp/tags.tsv" '
    function add(term, heading, intro, upper, lower) {
      if (term == "" || length(term) < 2) return;
      if (term in stop) return;
      if (term !~ /[a-z]/) return;
      seen[term] = 1;
      body[term]++;
      if (heading) heading_count[term]++;
      if (intro) intro_count[term]++;
      if (upper) upper_count[term]++;
      if (lower) lower_count[term]++;
    }
    function add_title(term) {
      if (term == "" || length(term) < 2) return;
      if (term in stop) return;
      if (term !~ /[a-z]/) return;
      seen[term] = 1;
      title_hit[term]++;
    }
    function tokenize(str, mode, heading, intro,    n, i, w, term) {
      gsub(/https?:\/\/[^ \t]+/, " ", str);
      gsub(/!?\[[^]]*\]\([^)]*\)/, " ", str);
      gsub(/\{\{[<%][^}]*[>%]\}\}/, " ", str);
      gsub(/<[^>]*>/, " ", str);
      gsub(/\047/, "", str);
      gsub(/[^A-Za-z0-9_-]+/, " ", str);
      n = split(str, words, " ");
      for (i = 1; i <= n; i++) {
        w = words[i];
        sub(/^[-_]+/, "", w);
        sub(/[-_]+$/, "", w);
        term = tolower(w);
        if (mode == "title") add_title(term);
        else add(term, heading, intro, (!heading && w ~ /^[A-Z]/), (!heading && w !~ /^[A-Z]/));
      }
    }
    function flush(    t) {
      if (file == "") return;
      for (t in seen) {
        printf "%s\t%s\t%d\t%d\t%d\t%d\t%d\t%d\t%s\n",
          t, file, title_hit[t] + 0, heading_count[t] + 0,
          intro_count[t] + 0, body[t] + 0, upper_count[t] + 0,
          lower_count[t] + 0, title;
      }
      delete seen; delete body; delete title_hit;
      delete heading_count; delete intro_count;
      delete upper_count; delete lower_count;
    }
    BEGIN {
      while ((getline line < stopfile) > 0) {
        sub(/#.*/, "", line);
        gsub(/^[ \t]+|[ \t]+$/, "", line);
        if (line != "") stop[line] = 1;
      }
      close(stopfile);
      while ((getline line < decisions) > 0) {
        sub(/#.*/, "", line);
        if (line == "") continue;
        n = split(line, a, "\t");
        if (n >= 2 && a[1] == "rejected") rejected[a[2]] = 1;
      }
      close(decisions);
    }
    FNR == 1 {
      flush();
      file = FILENAME; title = ""; title_tokens = "";
      fm = 0; fm_seen = 0; in_code = 0;
      prose_chars = 0;
    }
    /^\+\+\+$/ {
      if (!fm_seen) { fm = 1; fm_seen = 1; next }
      if (fm) { fm = 0; next }
      next;
    }
    fm {
      if ($0 ~ /^title[ \t]*=/) {
        line = $0;
        sub(/^title[ \t]*=[ \t]*/, "", line);
        if (line ~ /^[\047"]/) {
          q = substr(line, 1, 1);
          line = substr(line, 2);
          sub(q ".*$", "", line);
        } else {
          sub(/[ \t].*$/, "", line);
        }
        title = line;
        tokenize(title, "title", 0, 0);
      }
      next;
    }
    /^```/ { in_code = !in_code; next }
    in_code { next }
    {
      heading = 0;
      line = $0;
      if (line ~ /^#+[ \t]/) {
        heading = 1;
        sub(/^#+[ \t]+/, "", line);
      }
      if (line ~ /^[ \t]*$/) next;
      intro = (!heading && prose_chars < 600);
      tokenize(line, "body", heading, intro);
      prose_chars += length(line);
    }
    END { flush() }
  ' "$ARTICLES"/*.md > "$tmp/terms.tsv"
}

cmd_tags() {
  build_tags
  n=$(wc -l < "$tmp/tags.tsv")
  printf '%-20s %6s  %s\n' 'tag' 'count' 'status'
  awk -F'\t' -v n="$n" -v sectionsfile="$SECTIONS" '
    BEGIN {
      while ((getline line < sectionsfile) > 0) {
        sub(/#.*/, "", line);
        gsub(/^[ \t]+|[ \t]+$/, "", line);
        if (line != "") section[line] = 1;
      }
      close(sectionsfile);
    }
    {
      k = split($2, a, ",");
      for (i = 1; i <= k; i++) if (a[i] != "") c[a[i]]++;
    }
    END {
      for (t in c) {
        if (t in section) s = "section";
        else if (c[t] <= 2) s = "dead";
        else if (c[t] <= 12) s = "good";
        else if (c[t] <= 20) s = "broad";
        else s = "section";
        printf "%-20s %6d  %s\n", t, c[t], s;
      }
    }
  ' "$tmp/tags.tsv" | sort -k2,2nr
}

build_candidate_list() {
  build_tags
  build_terms
  n=$(wc -l < "$tmp/tags.tsv")
  awk -F'\t' -v n="$n" -v stopfile="$STOPWORDS" -v decisions="$DECISIONS" -v tagsfile="$tmp/tags.tsv" '
    BEGIN {
      while ((getline line < tagsfile) > 0) {
        k = split(line, a, "\t");
        if (k < 2) continue;
        m = split(a[2], b, ",");
        for (i = 1; i <= m; i++) if (b[i] != "") established[b[i]] = 1;
      }
      close(tagsfile);
      while ((getline line < decisions) > 0) {
        sub(/#.*/, "", line);
        if (line == "") continue;
        k = split(line, a, "\t");
        if (k >= 2 && a[1] == "rejected") rejected[a[2]] = 1;
      }
      close(decisions);
    }
    {
      t = $1; df[t]++;
      title[t] += $3; head[t] += $4; intro[t] += $5; body[t] += $6;
      upper[t] += $7; lower[t] += $8;
      if (!(t in sample)) sample[t] = $9;
    }
    END {
      for (t in df) {
        if (df[t] < 3) continue;
        if (df[t] > 0.70 * n) continue;
        if (t in established) continue;
        if (t in rejected) continue;
        proper_ratio = (upper[t] + lower[t] > 0 ? upper[t] / (upper[t] + lower[t]) : 0);
        proper_topic = (upper[t] >= 2 && proper_ratio >= 0.6);
        # A candidate must look like a topic, not just any frequent word:
        # hyphenated, consistently capitalised, or present in a title/heading.
        if (!(t ~ /[-_]/ || proper_topic || title[t] > 0 || head[t] > 0)) continue;
        signal = title[t] + head[t] + intro[t];
        if (df[t] <= 12) {
          if (signal < 1 && body[t] < 5 && t !~ /[-_]/ && t !~ /^[A-Z]/ && !proper_topic) continue;
        } else if (df[t] <= 20) {
          if (title[t] + head[t] < 3) continue;
        } else {
          if (title[t] + head[t] < 5) continue;
        }
        score = df[t] * 2 + title[t] * 4 + head[t] * 2 + intro[t] + (body[t] > 10 ? 1 : body[t] / 10);
        if (proper_topic) score += (upper[t] > 20 ? 20 : upper[t]);
        if (t ~ /[-_]/) score += 1;
        if (t ~ /^[A-Z]/) score += 0.5;
        if (df[t] <= 12) status = "candidate";
        else if (df[t] <= 20) status = "broad";
        else status = "wide";
        printf "%.1f\t%d\t%d\t%d\t%d\t%s\t%s\t%s\n",
          score, df[t], title[t], head[t], intro[t], t, status, sample[t];
      }
    }
  ' "$tmp/terms.tsv" | sort -t $'\t' -k1,1nr -k2,2nr > "$tmp/candidates.sorted"
}

cmd_candidates() {
  local limit=25
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --limit) limit="${2:?--limit needs a number}"; shift 2 ;;
      *) usage; exit 2 ;;
    esac
  done
  build_candidate_list
  head -n "$limit" "$tmp/candidates.sorted" > "$tmp/candidates.tsv"
  printf '%-6s %4s %5s %5s %5s  %-24s %-9s  %s\n' score df title head intro term status 'sample title'
  awk -F'\t' '{ printf "%-6s %4d %5d %5d %5d  %-24s %-9s  %s\n", $1, $2, $3, $4, $5, $6, $7, $8 }' "$tmp/candidates.tsv"
}

cmd_proposals() {
  build_candidate_list
  top="${TAG_CANDIDATE_TOP:-12}"
  head -n "$top" "$tmp/candidates.sorted" > "$tmp/candidate-allow.tsv"
  awk -F'\t' -v root="$ROOT/" -v tagsfile="$tmp/tags.tsv" -v allowfile="$tmp/candidate-allow.tsv" '
    BEGIN {
      while ((getline line < tagsfile) > 0) {
        k = split(line, a, "\t");
        if (k < 2) continue;
        order[++nf] = a[1];
        current[a[1]] = a[2];
        m = split(a[2], b, ",");
        for (i = 1; i <= m; i++) if (b[i] != "") established[b[i]] = 1;
      }
      close(tagsfile);
      while ((getline line < allowfile) > 0) {
        k = split(line, a, "\t");
        if (k < 6) continue;
        allow[a[6]] = 1;
        gscore[a[6]] = a[1] + 0;
      }
      close(allowfile);
    }
    {
      t = $1; f = $2;
      sig = $3 * 5 + $4 * 2 + $5 + ($6 > 10 ? 1 : $6 / 10);
      if (sig > 0) {
        key = f SUBSEP t;
        signal[key] = sig;
        title_hit[key] = $3;
        head_hit[key] = $4;
        body_hit[key] = $6;
      }
    }
    END {
      for (idx = 1; idx <= nf; idx++) {
        f = order[idx];
        cur = current[f];
        estimates = "";
        candidates = "";
        ec = 0; cc = 0;
        for (t in established) {
          key = f SUBSEP t;
          if (!(key in signal)) continue;
          if (!(title_hit[key] > 0 || head_hit[key] > 0 || body_hit[key] >= 15)) continue;
          if (cur != "" && index("," cur ",", "," t ",")) continue;
          ec++;
          et[ec] = t; es[ec] = signal[key];
        }
        for (t in allow) {
          key = f SUBSEP t;
          if (!(key in signal)) continue;
          cc++;
          ct[cc] = t; cg[cc] = gscore[t]; cs[cc] = signal[key];
        }
        # Small selection sort for the top three established and four candidates.
        for (i = 1; i <= ec && i <= 3; i++) {
          for (j = i + 1; j <= ec; j++) if (es[j] > es[i]) {
            x = es[i]; es[i] = es[j]; es[j] = x;
            x = et[i]; et[i] = et[j]; et[j] = x;
          }
          estimates = estimates (i > 1 ? "," : "") et[i];
        }
        for (i = 1; i <= cc && i <= 4; i++) {
          for (j = i + 1; j <= cc; j++) if (cg[j] > cg[i] || (cg[j] == cg[i] && cs[j] > cs[i])) {
            x = cg[i]; cg[i] = cg[j]; cg[j] = x;
            x = cs[i]; cs[i] = cs[j]; cs[j] = x;
            x = ct[i]; ct[i] = ct[j]; ct[j] = x;
          }
          candidates = candidates (i > 1 ? "," : "") ct[i];
        }
        rf = f; sub(root, "", rf);
        printf "%s\tcur=%s\test=%s\tcand=%s\n",
          rf, (cur == "" ? "-" : cur),
          (estimates == "" ? "-" : estimates),
          (candidates == "" ? "-" : candidates);        delete et; delete es; delete ct; delete cs; delete cg;
      }
    }
  ' "$tmp/terms.tsv"
}

set +e
case "${1:-}" in
  tags) cmd_tags ;;
  tag-candidates) shift; cmd_candidates "$@" ;;
  tag-proposals) cmd_proposals ;;
  -h|--help|help) usage ;;
  *) usage; exit 2 ;;
esac
status=$?
# A caller may pipe the report through `head`; treat SIGPIPE as success.
if [ "$status" -eq 141 ]; then exit 0; fi
exit "$status"
