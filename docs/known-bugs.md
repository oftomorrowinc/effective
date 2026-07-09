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

## `init` scaffolds toolchain commands the default parsers can't parse

**The bug.** Three related mismatches between what `init` writes into
the generated config's `toolchain` block and what the engine's parsers
can consume, each producing a silently-decorative gate:

1. **node-test projects get `--test-reporter spec`**, but
   `parseNodeTest` parses TAP (`not ok` lines). Spec-format output
   yields zero findings, so `count-non-zero` gates see count 0.
2. **The coverage command is suffixed with the _test_ reporter flag**
   (e.g. `--reporter json` for vitest), which emits a test-run report
   rather than `coverage-summary.json`; `parseV8` finds no `total`
   entry and the coverage gate never fires.
3. **`init` detects jest / biome / oxlint but never emits a
   `toolchain.parsers` block**, so the engine applies the default
   vitest/eslint parsers to output they can't parse.

**Reported.** Full-package code-quality review, 2026-07-07 (three-lens
review session that also produced the `respectGitignore` feature).
Static-analysis finding; behaviors verified by reading
`src/cli/init.ts:156-203` against `src/toolchain/parsers/*`.

**Reproduction.** Confirmed by inspection; runtime repro straightforward
(init a node-test or jest project, plant a failure, watch the gate pass).

**Suspected cause.** (confirmed) `init`'s command templates and the
parser registry evolved separately; nothing ties "command emits format
X" to "parser for X exists."

**Next step.** Make `init` emit a `parsers` block matching what it
detected, switch node-test scaffolds to TAP output, and generate a
coverage command that actually produces `coverage-summary.json` (e.g.
`vitest run --coverage --coverage.reporter=json-summary`). Related
engine-side hardening (count-based gates falling back to exit code
when output is unparseable) shipped separately — that turns these
from silent passes into loud failures, but init should still scaffold
commands that parse.

**Workaround.** Hand-edit the generated `toolchain` block: use
supported output formats (eslint `--format json`, vitest
`--reporter json`, TAP for node-test) and add a `parsers` block
for jest.

## `runCommand` buffer overflow is invisible to callers

**The bug.** When a child's stdout/stderr exceeds the 50 MiB cap,
`runCommand` (src/toolchain/run.ts) SIGTERMs the child and resolves
with truncated buffers, `timedOut: false`, and no overflow flag — the
exit code surfaces as a generic signal kill. A toolchain gate on
`non-zero-exit` fails with no hint that output was truncated, and
`any-output` semantics operate on partial data.

**Reported.** Full-package code-quality review, 2026-07-07. Verified
by inspection of the `bufferGuard` path.

**Reproduction.** Confirmed by inspection; repro is a command that
prints > 50 MiB.

**Suspected cause.** (confirmed) `bufferOverflowed` is tracked
internally but never exposed on `RunResult`.

**Next step.** Add `overflowed: boolean` (or similar) to `RunResult`
and mention truncation in the toolchain finding's output tail when
set. Additive API change; land with the next batch of toolchain
work.

**Workaround.** None needed in practice yet — 50 MiB is far above
normal toolchain output; hit it only with verbose reporters.

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
