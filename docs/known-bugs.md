# Known bugs — needing reproduction + fix

Engineering defects we've been told about (or have observed) but
haven't yet fixed. Captured here so they're visible to anyone using
effective during release prep without polluting the design-discussion
doc (`docs/open-issues.md`) or the user-facing changelog
(`CHANGELOG.md`).

Each entry frames what's broken, where it was reported, the current
reproduction status, the suspected cause, and the next investigation
step. Entries leave this file when fixed — the audit trail lives in
git history and the changelog under the version that shipped the fix.

This file is for **behavior that is wrong**. Two adjacent files cover
the neighboring cases:

- `docs/open-issues.md` — deferred design questions ("should we add
  this feature?", "how should this rule be scoped?"). If an entry in
  this file turns out to be a design decision rather than a defect,
  move it there.
- `CHANGELOG.md` — shipped or shipping behavior. Once a bug here is
  fixed, the resolution lands under `[Unreleased]` (or the next
  version) and the entry is removed from this file.

## How to add an entry

Each entry follows this template:

- **Short title.** Rule id, command name, or affected surface (e.g.,
  `` `verify --staged` fails on detached HEAD ``).
- **The bug.** One paragraph describing the observed behavior.
- **Reported.** Where + when + by whom (external adopter, internal
  CI, dogfood repo). Date helps the next person triaging staleness.
- **Reproduction.** One of: `confirmed in-house`, `needs repro`,
  `partially reproduced` (with notes on what conditions
  reproduce vs don't).
- **Suspected cause.** One or more numbered hypotheses about what's
  going wrong. If the cause is confirmed, mark it `(confirmed)`;
  otherwise leave as a hypothesis until the investigation step
  resolves it.
- **Next step.** Concrete action — minimal repro, code path to
  inspect, adopter ask. Should be the thing that someone picking
  up this entry would do next.
- **Workaround (if known).** What adopters can do until the fix
  lands. Optional — many bugs have no clean workaround.

New entries go above the "Future additions" section at the bottom
of this file.

## How entries leave

When a bug is fixed:

1. The fix lands with a test that pins the resolved behavior.
2. The entry is removed from this file.
3. The fix is captured in `CHANGELOG.md` under the version that
   ships it.

When an entry turns out not to be a bug — the behavior is correct
but the desired behavior is an open question — move it to
`docs/open-issues.md` and re-frame as a design question.

When an entry stales past reasonable repro effort (the reporter
can't or won't help, no in-house repro after a few sessions),
flag it as `stale` in the title and decide whether to keep
tracking or to close as `cannot-reproduce` with a final note.

---

## Catalogue rules with stubbed detection present as active at the CLI surface

**The bug.** Fourteen catalogue rules ship prompt-projected with their
detection stubbed — `checkRef` returns `[]`. They appear in
`effective rules` with a live severity (CRITICAL or HIGH) and no marker,
and `audit` counts them among the rules it evaluated. README § Status
lists them honestly; the tool itself does not. An adopter reading
`effective rules` reasonably concludes the rule is enforced.

**Reported.** Pre-publish five-agent review, 2026-09-03 (governance
agent, F4). Confirmed by inspection.

**Reproduction.** Confirmed: run `effective rules` and compare the
listing against README § Status.

**Suspected cause.** (confirmed) Stub detection was a deliberate
shipping strategy — the prompt projection is real and useful before the
check exists — but nothing tags the rule as stubbed in the data model,
so no surface can disclose what the docs disclose.

**Next step.** Add a `detection: 'stubbed' | 'implemented'` marker to the
rule shape, surface it in `rules` output and in audit's summary, and
generate README § Status from it so the two cannot drift. Deferred past
1.0.0 because it is additive (a new optional field plus presentation),
so it lands in a 1.x without breaking the frozen schema.

**Workaround.** README § Status is accurate; treat it as authoritative
over the CLI listing until this lands.

## Two mutation survivors in `verify`'s finding assembly

**The bug.** The unconsumed-toolchain-findings fold-in and
`dedupeBySignature` can each be deleted individually with the full suite
still green — they mask each other. Whichever one is removed, the other
produces the same observable output for every case the tests cover.

**Reported.** Pre-publish five-agent review, 2026-09-03 (correctness
agent, F4). Verified by the reviewer running the deletions.

**Reproduction.** Confirmed: delete either block, run `pnpm test`,
observe 520/520 still passing.

**Suspected cause.** (confirmed) No test constructs the case that
distinguishes them — a duplicate finding arriving from BOTH a rule and
an unconsumed parser result, where dedupe is what collapses it.

**Next step.** Write the distinguishing fixture, then pin both paths
separately. The behavior is believed correct; what is missing is the
test that would notice if it stopped being correct. Coverage is not the
gap — both lines execute; equivalence is.

**Workaround.** None needed; no known incorrect output. This is a
regression-net hole, not a live defect.

## Future additions

This section is a placeholder. New bug reports — surfaced during
release prep, adopter feedback, or CI flakes worth investigating —
should be added above this section following the template at the
top of the file.

Smaller items that don't warrant a full entry yet (one-line
observations, "I saw this once" notes) can be added inline as a
running log; promote them to full entries when they recur or when
investigation is worth scoping.

If an item turns out to be a deferred design decision rather than
a defect, move it to `docs/open-issues.md` instead.
