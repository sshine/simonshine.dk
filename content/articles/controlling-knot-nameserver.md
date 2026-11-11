+++
date = '2026-08-15T11:37:45+02:00'
draft = true
title = 'Controlling the Knot nameserver'
tags = ['dns']
+++

[Knot DNS server][knot-dns] is an open-source, high-performance, secure and stable
authoritative-only DNS server which supports most modern features of the domain name system. It
provides essential DNS features including incremental zone transfers (XFR), dynamic updates (DDNS),
and response rate limiting (RRL), automatic DNSSEC signing, dynamic A/AAAA/PTR record synthesis.

The Fastmail team wrote about [migrating to Knot DNS][fm-knot] in 2024.

## How to interface with Knot

Knot lets you update records in the following ways:

1. Control socket (knotc protocol). Unix socket, no TCP, no auth beyond filesystem permissions.
   Length-prefixed TLV: u8 tag, and for data items u16 len + bytes. Maximum 4 sockets, maximum 8
   concurrent threads. control.timeout defaults to 5 seconds, and conf-* mutations take an exclusive
   lock that blocks everything else.

   - Zone transactions are global server state, not bound to your connection. Nothing records the socket or PID. If your client dies mid-transaction, the transaction stays open and holds zone->cow_lock, which blocks DDNS, XFR-apply, and DNSSEC signing on that zone until someone aborts it.
   - Multi-zone commit is a sequential loop with no cross-zone atomicity. Partial failure leaves earlier zones committed and live.
   - zone-read holds an RCU read lock for the whole dump and blocks every writer command for the duration. Use AXFR for bulk export.

2. DNS UPDATE (RFC 2136 + TSIG) provides atomic compare-and-swap. knotd batches all queued updates
   for a zone into one zone_update_t: N client updates become one journal write, one signing pass,
   one SOA bump, one NOTIFY. Good for many small edits.   

   Opcode 5 DNS message over TCP/TLS/QUIC to port 53, authenticated with TSIG, returns RCODEs. It is
   the standard remote record-editing API that every authoritative server implements. nsupdate is
   its curl. The [dns-update][dns-update] Rust crate speaks this protocol, and supports [deSEC][desec].

3. Redis/Valkey zone backend since v3.5.0. You write with KNOT.ZONE.* / KNOT.UPD.* commands, knotd
   tails a Redis/Valkey stream (XREAD BLOCK) and pulls the change itself. No control socket, no
   polling, push-style.

## Building an API around Knot

To build a DNS service where users can modify the authoritative records, 

<!--
You can also interact with Knot for other purposes:

4. Catalog zones (RFC 9432). Zone lifecycle as DNS data, modifiable by DDNS. Peter Thomassen
   co-authored the RFC and [deSEC][desec] has shipped them since 2019.

5. External validation since v3.5.0. This is a veto hook that can trigger immediately before publication.
-->

[knot-dns]: https://www.knot-dns.cz/
[fm-knot]: https://www.fastmail.com/blog/moving-fastmail-dns-to-knot/
[desec]: https://desec.io/
[dns-update]: https://crates.io/crates/dns-update
[rrset]: https://support.dnsimple.com/articles/understanding-rrsets-rrsigs/
# Knot DNS control plane: options, and a plan for the hidden primary

> [!WARN] Large parts of this document are AI-generated. While I make an effort to not trigger
> anyone, the purpose 

Context: replacing PowerDNS with Knot DNS behind a high-performance Rust API. The problem to
solve is not "how do I talk to Knot", it is "how do I stop the API database and the nameserver
state from diverging", which desec-stack has carried as an open issue since 2019
([#196](https://github.com/desec-io/desec-stack/issues/196), with
[#1218](https://github.com/desec-io/desec-stack/issues/1218) as a live symptom).

Source references below are against Knot DNS 3.6 master (`2a06f465e`).

## The options

- **A. Hidden primary in Rust, Postgres as the source of truth.** A Rust service serves
  AXFR/IXFR and sends NOTIFY, synthesizing zone contents directly from Postgres; Knot receives,
  signs, and serves. Zone lifecycle rides a catalog zone that the same service generates.
  There is exactly one durable write per change, so there is no second store to reconcile and no
  outbox. Propagation becomes a comparison of monotone serials, and convergence is owned by the
  secondaries' own refresh/retry timers, so a missed change repairs itself. The cost is that you
  are writing a nameserver, and that Knot rewrites your serial when it signs (see below).

- **B. Redis/Valkey zone backend.** Knot 3.5 added a database zone store via CZ.NIC's `knot.so`
  Redis module (`doc/configuration.rst:838-899`): transactions (`KNOT.ZONE.BEGIN/STORE/COMMIT`,
  incremental `KNOT.UPD.ADD/REMOVE/COMMIT`), up to 8 zone instances per zone so the signer writes
  the signed version to a different instance, update history for IXFR, many readers on one
  database, and a change event stream that knotd tails with `XREAD BLOCK`
  (`src/knot/server/server.c:930-955`). This is upstream's answer to the same gap Option A fills,
  without writing a nameserver. It is Redis specifically, not a pluggable backend, so Postgres
  cannot be pointed at it; Redis is a poor system of record for ownership and billing data, so
  Postgres would remain and Redis would be a materialized view fed by an outbox. Eleven months
  old and a custom C module, so worth prototyping and not yet worth betting on.

- **C. DNS UPDATE (RFC 2136 + TSIG) plus a transactional outbox.** The API commits to Postgres,
  writes an outbox row in the same transaction, and a worker applies the change to Knot as a DNS
  UPDATE. Prerequisites (`src/knot/updates/ddns.c:216-262`) carry the compare-and-swap condition
  so replay is always safe, and knotd batches all queued updates for a zone into one journal
  write, one signing pass, one SOA bump and one NOTIFY
  (`src/knot/events/handlers/update.c:132-234`). Two durable writes remain, so divergence is
  possible, but it is bounded lag rather than permanent disagreement provided the apply step is
  idempotent and Postgres commits first. This is what desec-stack
  [PR #1187](https://github.com/desec-io/desec-stack/pull/1187) is building in Python, and its
  shape matches where Fastmail ended up.

- **D. Invert: Knot owns zone data, Postgres follows.** Expose RFC 2136 to end users directly
  with per-domain TSIG keys, let knotd's ACLs (`update-owner`, `update-owner-match`,
  `update-type`) enforce tenant scope, and have Postgres hold only ownership, tokens, billing and
  audit. This removes the hot path from the API entirely, which is attractive for dynDNS traffic,
  and it is the only option where the nameserver is itself the write API. It also means the API
  can no longer answer a GET without asking Knot, and Knot's per-zone stores become the thing you
  must back up and reason about. A different architecture rather than a variant of the others.

- **E. Port the status quo.** Keep desec-stack's current structure and swap the PowerDNS HTTP API
  for the knotd control socket, which is what
  [PR #1208](https://github.com/desec-io/desec-stack/pull/1208) does for nsmaster. Cheapest path
  and it inherits #196 unchanged, because the ordering that causes #196 (apply to the nameserver
  first, commit the database second) is preserved.

The rest of this document plans Option A.

## Why A, and what it actually buys

The two directions of divergence are not equally bad. The nameserver behind Postgres is lag:
temporary, repairable by replay. The nameserver *ahead* of Postgres, holding state the API does
not know it created, is permanent and needs manual repair; that is exactly #1218's stranded
domain. desec-stack writes to PowerDNS first and commits Postgres second, specifically to avoid
the first case, which trades a recoverable failure for an unrecoverable one.

Option A removes the choice. Zone contents are a pure function of committed Postgres state,
materialized on demand. There is no second write that can fail, so neither direction of
divergence exists as a concept. That is stronger than any two-phase commit across two databases,
and it is the entire argument for the option.

## Two problems to solve before anything else

### 1. A signing secondary rewrites your serial

Confirmed in `src/knot/events/handlers/refresh.c:558-600`. When `dnssec-signing` is on for a
secondary zone, `ixfr_slave_sign_serial` rewrites the SOA serial of every incoming changeset into
Knot's own local series and stores your serial separately in the KASP database:

```c
uint32_t new_to = serial_next(new_from, conf, ch->soa_from->owner, SERIAL_POLICY_AUTO, 1);
knot_soa_serial_set(ch->soa_from->rrs.rdata, new_from);
knot_soa_serial_set(ch->soa_to->rrs.rdata, new_to);
*master_serial = ch_to;
```

So the serial the world sees is not the serial Postgres minted, and "has this change taken
effect on server X" stops being a DNS query. Reading it back per zone per server through
`keymgr master-serial` or the control socket is the wrong shape: 8 control threads total
(`src/knot/ctl/process.h:11`), 5s default timeout.

**Resolution: a two-hop check with a 1:1 expensive hop.** Run exactly one signer tier. Hop 1 maps
the Postgres serial to the signer's local serial, read from the signer once per change, batched,
and cached in Postgres as a `(zone, our_serial, signer_serial)` row. Hop 2 compares the signer's
serial against each public server's SOA, which is a plain DNS query answerable from anywhere at
any scale. The per-zone control socket cost is paid once against one host rather than N times
against N hosts.

The alternative that removes the problem entirely is to sign in the hidden primary and make Knot
a plain secondary. That is a much larger project (it is what NLnet Labs' Cascade is), but it is
worth checking whether deSEC is already headed that way: PR #1187 adds a
`0047_domain_csk_private_key` migration, which suggests key material already lives in Postgres.

### 2. Bulk transfer behavior needs measuring

Fastmail set out with this exact topology and abandoned it. One of their reasons, from
[their writeup](https://www.fastmail.com/blog/moving-fastmail-dns-to-knot/): "When a lot of
domains needed to be updated at once, we ran out of TCP socket tuples because of sockets in
TIMEWAIT state... causing AXFRs to the secondaries to start failing." Writing the primary in Rust
does not help, because the secondaries initiate those connections. They did fix it, with the
kernel `tcp_tw_reuse` tunable, so this is a tuning exercise rather than an architectural dead end;
see the Fastmail section at the end for the full accounting.

Compounding it: every change is a REFRESH event that occupies one of at most 10
`background-workers` (`doc/reference.rst:330`, event dispatch at `src/knot/events/events.c:30-32`)
for the duration of an outbound network exchange, and `remote-pool-limit` defaults to 0, meaning
no outbound connection reuse at all.

Mitigations that exist today: `remote-pool-limit` and `remote-pool-timeout` for connection reuse,
`notify-delay` and `update-delay` for coalescing, `refresh-jitter` to spread mass refreshes, and
the OS tuning Knot's own documentation recommends for mass transfers
(`doc/configuration.rst:217-225`: `tcp_tw_reuse`, shorter `tcp_fin_timeout`, wider ephemeral port
range). Whether that is sufficient at deSEC's zone count is unproven either way.

**This is the first thing to measure, before writing any Rust.** See the validation plan.

Their second reason does not apply here. "The unique identifiers are not generated in a
consistent way if you have multiple different primary servers" describes Knot's
`catalog-role: generate`, which derives the member id as
`hex(siphash24(member_dname ‖ be64(catalog_member_time)))` with the timestamp from each host's
own timer database (`src/knot/catalog/generate.c:12-53`). Two Knot generators disagree, hence mass
resync on failover. In Option A the Rust service generates the catalog, so the id is chosen
deterministically from the domain name or a stable Postgres key and is identical on every
replica.

## Topology

```
Postgres  ──►  Rust hidden primary  ──XFR──►  Knot signer  ──XFR──►  Knot public servers
(truth)        (XFR + NOTIFY out)             (DNSSEC)               (anycast)
                       │                           │
                       └── catalog zone ────────────┴──► zone lifecycle everywhere
```

The catalog zone is served by the Rust primary as an ordinary zone, so adding a domain is a row
in Postgres and nothing else. Member ids are deterministic. Batch member changes, because every
catalog update reloads all configured zones (`doc/configuration.rst:721-731`).

## Postgres schema

The changelog design constrains everything else, because IXFR needs deltas addressable by
starting serial, and the library will panic if a delta lacks its SOA pair (see traps below).

```sql
-- Truth.
CREATE TABLE zone (
  id           bigserial PRIMARY KEY,
  name         text NOT NULL UNIQUE,          -- absolute, lowercase
  serial       bigint NOT NULL DEFAULT 1,     -- internal counter; published as low 32 bits
  soa_params   jsonb NOT NULL,                -- mname, rname, refresh, retry, expire, minimum
  catalog_id   text GENERATED ALWAYS AS (...) STORED,  -- deterministic, never time-derived
  deleted_at   timestamptz
);

CREATE TABLE rrset (
  zone_id  bigint NOT NULL REFERENCES zone(id) ON DELETE CASCADE,
  owner    text   NOT NULL,                   -- absolute, lowercase
  rtype    int    NOT NULL,
  ttl      int    NOT NULL,
  rdatas   text[] NOT NULL,                   -- presentation format, one element per RDATA
  PRIMARY KEY (zone_id, owner, rtype)
);

-- History, for IXFR.
CREATE TABLE zone_version (
  zone_id bigint NOT NULL REFERENCES zone(id) ON DELETE CASCADE,
  serial  bigint NOT NULL,
  at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (zone_id, serial)
);

CREATE TABLE zone_delta (
  zone_id bigint NOT NULL,
  serial  bigint NOT NULL,                    -- the version this delta produces
  op      char(1) NOT NULL CHECK (op IN ('+','-')),
  owner   text NOT NULL,
  rtype   int NOT NULL,
  ttl     int NOT NULL,
  rdata   text NOT NULL,
  FOREIGN KEY (zone_id, serial) REFERENCES zone_version(zone_id, serial) ON DELETE CASCADE
);
CREATE INDEX ON zone_delta (zone_id, serial);

-- Propagation tracking.
CREATE TABLE serial_map (                     -- hop 1: our serial to the signer's
  zone_id bigint NOT NULL,
  serial  bigint NOT NULL,
  signer_serial bigint,
  PRIMARY KEY (zone_id, serial)
);

CREATE TABLE notify_hint (                    -- fan-out hints only, safe to lose
  zone_id bigint NOT NULL,
  serial  bigint NOT NULL,
  PRIMARY KEY (zone_id)
);
```

Two deliberate choices:

**`zone_delta` never stores the SOA.** The IXFR builder synthesizes the SOA pair for every delta
from `zone.soa_params` plus the two serials, so a delta cannot be missing its SOA by construction.
This removes a panic (see traps) structurally rather than by discipline.

**`notify_hint` is not a conventional outbox.** It carries a hint, not a change. Losing a row
delays convergence to the next refresh interval; it cannot cause divergence. This is what
distinguishes A from C: there is no queue whose loss means permanent disagreement.

Write path, one transaction:

```sql
BEGIN;
  SELECT serial FROM zone WHERE id = $1 FOR UPDATE;   -- serialize per zone
  UPDATE zone SET serial = serial + 1 WHERE id = $1 RETURNING serial;
  -- upsert/delete rrset rows
  INSERT INTO zone_version (zone_id, serial) VALUES ($1, $new);
  INSERT INTO zone_delta   (...) VALUES ...;          -- the computed diff
  INSERT INTO notify_hint  (zone_id, serial) VALUES ($1, $new)
    ON CONFLICT (zone_id) DO UPDATE SET serial = EXCLUDED.serial;
COMMIT;
```

Serials are an internal `bigint`, published as the low 32 bits. RFC 1982 comparison stays correct
as long as consecutive published values differ by less than 2^31, which holds trivially.

The serial counter must outlive the zone row. If a domain is deleted and re-added, a fresh row
restarts at 1, which is below what secondaries remember and produces exactly the replication
confusion Fastmail describes. Either soft-delete only and never reuse a row, or keep a separate
`zone_serial_watermark(name, serial)` that no deletion touches and seed new zones from it.

Retention: prune `zone_version` and its deltas below the minimum confirmed serial across all
servers, minus a safety margin. A secondary asking for a pruned serial gets AXFR, which is
correct and expected behavior, not an error path.

## The Rust hidden primary

Correction to an earlier assumption: the `domain` crate does not force an in-memory zone tree.
`zonetree::Zone` is `Arc<dyn ZoneStore>`, and `ZoneDiff`'s own documentation states the async
design exists to support "a database possibly reached via a network".
[Issue #630](https://github.com/NLnetLabs/domain/issues/630) is a one-line Cargo feature-gating
bug and nothing more. No fork required.

Work list, roughly in order:

1. Enable both `unstable-xfr` and `unstable-zonetree` (works around #630).
2. `impl ZoneStore for PgZone`: `class`, `apex_name`, `read`, `write`, `as_any`. `write` is not
   defaulted, so provide a stub that returns an error; this primary is read-only.
3. `impl ReadableZone for PgRead`: `query` (SOA at minimum), `walk`, and `is_async() -> false`.
4. `impl ZoneDiff` and `ZoneDiffItem` over `zone_delta`, with the SOA pair synthesized.
5. `impl XfrDataProvider<Option<Key>>`: resolve the zone from `req.message().sole_question()`,
   check the TSIG key from `req.metadata()` against an allowlist, select the deltas covering
   `diff_from..current`, return `XfrData::new(Zone::new(store), diffs, false)`.
6. Stack `TsigMiddlewareSvc` immediately before `XfrMiddlewareSvc`, which is required ordering so
   the key reaches the provider as request metadata.
7. Write outbound NOTIFY. `domain` ships only the receiving middleware; the sender is small.
8. Catalog zone generation as a synthetic zone over the same store.

Traps, all read from `domain` 0.12.2 source:

- **IXFR deltas without SOA records panic the process.** `ixfr.rs:87` and `:97` do
  `diff.get_removed(qname, Rtype::SOA).await.unwrap()`. The schema above prevents this by
  synthesizing the SOA pair; keep it that way.
- **`walk` is a synchronous callback** (`Box<dyn Fn(...)>`), so no awaiting inside it. Return
  `is_async() -> false` and do Postgres I/O in the `spawn_blocking` thread. The async branch calls
  `blocking_send` from what would be an async context and is exercised by nothing in-tree, since
  the bundled store returns `false`.
- **You group rows into RRsets yourself.** The callback takes `&SharedRrset`, so query
  `ORDER BY owner, rtype` and group.
- **Cascade does not use this middleware at all**, hand-rolling AXFR/IXFR over its own store. Read
  that as a warning about fitness, tempered by the fact that a hidden primary is a far smaller job
  than a signer with review pipelines.

## DNSSEC

Keys stay in the signer tier: KASP LMDB, or PKCS#11 if HSM. The API learns DS and CDS state by
querying CDS/CDNSKEY over DNS from the signer rather than reading the KASP filesystem, which
avoids co-location. deSEC also needs DS for RFC 9615 `_signal` bootstrapping, served by
`mod-authsignal`, which Peter Thomassen contributed to Knot 3.3.5.

`dnssec-metadata-db: timer` moves hot metadata out of KASP and is documented as improving signing
performance for many zones (`doc/reference.rst:3386-3400`), with the warning that the timer
database then becomes precious.

## External validation is a blast-radius limiter here, not a consistency mechanism

Knot 3.5's `external-validation` pauses every zone update just before publication, emits D-Bus
`external_verify(zone, serial)`, and waits for `zone-commit` or `zone-abort`
(`doc/operation.rst:1543-1582`). In Option C that is a real prepare phase, because the API writes
directly and could write something wrong. In Option A the signer only ever receives what the
hidden primary derived from committed Postgres state, so there is nothing to veto on consistency
grounds.

It is still useful as a guard against bugs in zone generation: reject a delta that removes more
than some fraction of a zone's records, or that empties the apex NS set. Note the cost, a blocked
background worker per pending validation with `external.timeout` (default 300s) auto-rejecting, so
apply it selectively rather than to every zone.

## Failure modes

| Event | Effect | Mitigation |
|---|---|---|
| Hidden primary down | No updates propagate; secondaries serve from journal | Set `expire-max-interval` generously (weeks) so a liveness failure cannot become an outage |
| Postgres down | Primary must refuse XFR rather than serve partial data | Fail closed; secondaries keep serving |
| NOTIFY lost | Convergence delayed to the refresh interval | Tune `refresh-min-interval` against SOA query load |
| Delta pruned before request | Secondary receives AXFR | Correct by design, not an error |
| Secondary far behind | IXFR falls back to AXFR | `ixfr-from-axfr`, `ixfr-benevolent` |
| Signer serial map lost | Propagation status unknown, data unaffected | Re-read `master-serial` from the signer |
| Mass transfer storm | TCP tuple exhaustion | The open question; see below |

## Validation plan

Ordered so the cheapest experiment is the one most likely to invalidate the design.

1. **Bulk transfer at target zone count, days not months, no Rust required.** Stand up a stock
   Knot primary holding N synthetic zones at deSEC's scale, a Knot secondary, and force mass
   change. Measure wall time to converge, TIME_WAIT accumulation, and background worker
   saturation, with `remote-pool-limit` off and on. This is the Fastmail question and it decides
   whether Option A is viable at all.
2. **Signer throughput.** With at most 10 background workers and one event per zone at a time,
   measure sustained re-sign plus XFR-apply rate against the expected dynDNS edit rate.
3. **`domain` with a real Postgres store.** Confirm `is_async() -> false` plus `spawn_blocking`
   carries the load, and that IXFR deltas round out correctly against a Knot secondary.
4. **Serial mapping cost.** Measure `master-serial` reads for N zones against one signer via the
   control socket, given 8 threads and a 5s timeout.

If (1) fails and the mitigations do not close the gap, Option C is the fallback and most of the
schema above survives, because the changelog is what makes replay safe there too.

## Licensing note

Everything in Knot, `src/libknot` included, is GPL-2.0-or-later, relicensed down from GPLv3 in
`c2a6056b5` (March 2025). There is no linking exception. Option A barely touches libknot, which is
a side benefit: the residual control socket work (status reads, `zone-refresh` nudges,
`master-serial`) can be a small native Rust TLV codec rather than an FFI binding.
`python/libknot/README.md` is the de facto protocol specification.

## Open questions

- Does bulk XFR hold at deSEC's zone count? Experiment 1 answers this and everything else waits
  on it.
- Sign in the hidden primary and skip the serial mapping entirely? Larger, but removes a whole
  subsystem and makes propagation a plain SOA query. Check whether the CSK-in-Postgres migration
  in PR #1187 already implies this direction.
- Is Option D's direct RFC 2136 access to end users wanted for dynDNS? It is incompatible with A
  as written, since it introduces a second writer.
- Does Option B's Redis backend mature enough to make the Rust primary unnecessary? It solves the
  same problem with no nameserver to write.

## Prior art

- [desec-stack #196](https://github.com/desec-io/desec-stack/issues/196), the problem statement in
  deSEC's own words; [#1218](https://github.com/desec-io/desec-stack/issues/1218) as a symptom.
- [desec-stack #1187](https://github.com/desec-io/desec-stack/pull/1187) (nslord, DNS UPDATE +
  TSIG) and [#1208](https://github.com/desec-io/desec-stack/pull/1208) (nsmaster, python-libknot,
  deletes the `dbmaster` container). deSEC has already chosen its interfaces.
- [Fastmail's writeup](https://www.fastmail.com/blog/moving-fastmail-dns-to-knot/): tried this
  topology, abandoned it, ended up at Option C's shape with database triggers feeding a
  `KnotDomainsChanged` table keyed by `(Server, DomainId)` and a `NeedsRebuild` re-enqueue flag.
- [RcodeZero at DNS-OARC 41](https://indico.dns-oarc.net/event/47/contributions/1008/): millions
  of zones, PowerDNS to Knot via catalog zones, and they built their own freshness monitoring
  because DNS replication has no built-in way to check secondary freshness.
- [OpenStack Designate](https://docs.openstack.org/designate/latest/contributor/architecture.html):
  `designate-mdns` is this topology in production, reading zone data directly from the database to
  synthesize AXFR responses.
- [NLnetLabs/cascade](https://github.com/NLnetLabs/cascade): a hidden DNSSEC signer on the
  `domain` crate. The codebase to read before writing XFR-serving Rust.
- [Route 53 GetChange](https://docs.aws.amazon.com/Route53/latest/APIReference/API_GetChange.html):
  the only major provider exposing propagation as a first-class API object, PENDING to INSYNC. The
  interface shape to copy.

## Fastmail: the one published account of trying this and stopping

### What they were doing and why

Fastmail's goal was never consistency. They were moving off a PowerDNS pipe backend that generated
every response dynamically, which was "computationally considerably more expensive" under normal
load and fell over under pseudo-random prefix attacks, where a flood of `$randomdomain.fastmail.com`
queries defeats upstream caching because every query name is different. They had already worked
around it by splitting into two systems, TinyDNS for system domains and PowerDNS for user domains,
which they call "hacky". The target was static zone data served cheaply, at a scale they describe as
"100,000's of domains". Consistency between their SQL database and the nameservers was a constraint
to preserve, not a problem to fix.

Their initial strategy is the topology in this document: "an internal hidden primary server and a
number of secondary servers that pull from the primary via AXFR/IXFR", with "only the secondary
servers handling DNS queries from the world", and Knot's catalog zones keeping the zone list in step
between the tiers. Database triggers on their `Domains`, `CustomDNS` and `DKIMRecords` tables drove
zone regeneration on the primary. The post does not say whether the primary was a Knot instance
loaded from generated zone files or something custom, and it never mentions DNSSEC, so their account
covers the replication tier rather than serving XFR out of SQL, and says nothing about signing.

They abandoned it for a single server type: no primary/secondary split, no XFR, no catalog zone.
Triggers now write into a `KnotDomainsChanged` table keyed by `(Server, DomainId)` with
`NeedsRebuild` and `ErrorCount` columns, and a polling loop per server clears `NeedsRebuild`,
rebuilds or purges the zone, and only deletes the row if `NeedsRebuild` is still zero afterward, so
a concurrent edit re-enqueues instead of being lost. The `(Server, DomainId)` primary key means the
table cannot grow without bound while a server is down. They also moved SOA serial bumping into the
trigger, which previously happened on the active primary, "to ensure that the serial can never be
out of date after a change". Their retrospective is about consolidation rather than any specific
defect: "AXFR/IXFR is harder to reason about and less visible to operators", and "less concepts to
learn about".

### Risks this identifies, and how they are addressed

- **TCP tuple exhaustion under mass transfer.** Bulk AXFR left enough sockets in TIMEWAIT that
  transfers to secondaries began failing; they fixed it with the kernel `tcp_tw_reuse` tunable and
  found the fix distasteful rather than insufficient. Treat it as tuning, combined with
  `remote-pool-limit` and `remote-pool-timeout` for outbound connection reuse, which default to off.

- **Catalog identifiers disagreeing between primaries.** Knot's `catalog-role: generate` derives
  member ids from a per-host timestamp, so two primaries produce different ids and a failover
  triggers "a massive amount of resyncing and general Knot confusion"; they note there is no easy
  fix without "a singleton source of truth server". Option A supplies exactly that, generating the
  catalog from Postgres with ids derived deterministically from the domain name.

- **Serials going backwards on delete and re-add.** They explicitly cite "no worry about zone serial
  numbers going backwards if you add -> update -> delete -> re-add a domain which can cause
  AXFR/IXFR replication weirdness". The serial counter must outlive the zone row, via soft delete or
  a watermark table, which is now in the schema above.

- **Tier count as its own cost.** Their first complaint was that the design "required two completely
  separate Knot server setups with completely separate and quite different configurations", and
  Option A has three tiers rather than the two they rejected. Justify the signer tier on DNSSEC
  grounds or collapse it by signing in the hidden primary.

- **XFR is opaque to operators.** Replication being "less visible to operators" is a real cost when
  diagnosing why one server is behind. Make propagation a first-class API object with per-server
  serial state, which RcodeZero also had to build for themselves.

- **Their evidence stops short of our hardest part.** DNSSEC appears nowhere in the post, so nothing
  in their experience speaks to the signing secondary rewriting serials, which is the wrinkle that
  needs the two-hop mapping. That part remains unvalidated by anyone else's published work.

- **Scale is not on our side.** They hit these limits in the hundreds of thousands of domains, below
  where deSEC operates. Experiment 1 in the validation plan should run at the real zone count, not a
  convenient fraction of it.
</content>
</invoke>
