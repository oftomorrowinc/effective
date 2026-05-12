# Reviewer package — forward spec (not yet built)

Out-of-scope for the current `effective` package. Captured here so when
the reviewer package is designed, the citation-substance checks below
are part of its spec.

## Context

The escape-hatch / exception-citation machinery in the current
`effective` engine prevents two failure modes mechanically:

- **Workers fabricating exception entries.** The `protected-paths-
respected` rule keeps `effective.config.{ts,js}` off-limits to
  workers, so they can't add new exception entries to make their
  citations resolve.
- **Workers citing exception IDs that don't exist or don't match the
  suppression mechanism.** The `exceptions.must-cite-justification`
  rule resolves every cited id and matches its `mechanism` field
  against the comment's actual mechanism kind.

What deterministic checks **can't** catch:

A worker cites a real, registered exception whose registered context
doesn't actually apply to the suppression site. The id resolves; the
mechanism matches; the engine has no quarrel. But the cited exception
is a convenient existing entry the worker grabbed because it sounds
plausible, not because its substance maps to the case at hand.

That's the gap the reviewer package closes.

## What the reviewer is

A separate NPM package (`effective-reviewer` or similar — name TBD)
that consumes the same `Constitution` and `Finding` types as the
engine. Adds an LLM in the loop to make judgment calls deterministic
code can't. Emits findings in the same shape, so `kickBack` can route
on them and `verify` can include them in the verdict.

## What the reviewer checks on citations specifically

For each **new** citation in a diff (added or moved; pre-existing
citations don't get re-judged unless their surroundings changed):

1. **Context match.** Does the cited exception's `context` field
   describe a situation actually present at the citation site?
   - Exception context: "pg@8.x leaves stale connections under
     specific error shapes."
   - Citation site: a database call that handles connection errors.
   - Question for the reviewer: do these substantively match, or did
     the worker grab a database-flavored exception for a case that
     has nothing to do with stale connections?

2. **Mechanism match (belt-and-suspenders).** Already enforced by the
   engine's `exceptions.must-cite-justification` rule, but the
   reviewer verifies as backup in case the engine's check was
   bypassed via a custom check override.

3. **Active status (belt-and-suspenders).** Already enforced by the
   engine. The reviewer flags retired or deprecated citations even
   if the engine missed them.

4. **Inline-rationale drift.** Some suppressions include free-form
   text after the `--` separator alongside the `exception-id:`
   citation:

   ```ts
   // eslint-disable-next-line no-explicit-any -- exception-id: sdk-return-type-drift; the SDK actually returns the wrong shape
   ```

   Does the inline text agree with the exception's registered
   `context`? Or does the worker's stated reason diverge from the
   registered exception's reason, suggesting a citation of
   convenience rather than substance?

5. **Fix-vs-suppress judgment.** Could the underlying issue be fixed
   so the suppression isn't needed at all? The exception path is the
   escape hatch; the reviewer should verify the worker took it
   because the underlying issue genuinely can't be addressed inline,
   not because fixing was inconvenient.

## What the reviewer checks on protected-path edits

The `protected-paths-respected` rule fires CRITICAL on any diff
touching files in `config.protected`. For human contributors, the
workflow is `--no-verify` with rationale in the commit message and
PR description (see `CONTRIBUTING.md` § "The two-path constitutional-
change workflow"). The CI gate catches the diff regardless of
whether `--no-verify` was used locally; the reviewer evaluates the
rationale's substance.

For each PR whose diff touches protected paths, the reviewer:

1. **Confirms substantive rationale in the commit message.** Not
   just "needed for X" or "fixing issue Y" — the rationale should
   name what's being changed at the constitutional level and why
   the change is the right shape. "Adding a built-in exception
   category for the recurring pattern we see in fs.readdir callers"
   is substantive; "small fix" isn't.

2. **Confirms the PR description names which protected file(s) the
   PR edits.** The contributor should have called out the
   constitutional change explicitly so the reviewer doesn't have to
   reconstruct intent from the diff.

3. **Verifies rationale-diff consistency.** The rationale should
   match what the diff actually changes. A rationale claiming "adding
   a new built-in exception category" on a diff that disables a rule
   instead is a soft fabrication signal — the contributor wrote
   plausible-sounding rationale that doesn't describe their actual
   change.

4. **Flags `--no-verify` on non-protected paths.** If the commit was
   pushed with `--no-verify` but the diff doesn't touch any
   protected file, the bypass was unnecessary. Either the
   contributor misunderstood when to use `--no-verify` (worth
   surfacing) or there's an issue that warranted bypassing the gate
   that's not visible in the diff (also worth surfacing).

These checks parallel the citation-substance checks above —
deterministic engine catches structural violations; reviewer
catches substance violations. The CI gate already prevents
protected-path diffs from merging without going through the PR
flow; the reviewer's job is judging whether the rationale that
authorized the change is real.

## Shape of reviewer findings

Same `Finding` interface as deterministic rules. The reviewer's
findings have `source: { kind: 'llm-review', ruleId, model? }` so
downstream code can distinguish them from deterministic findings if
it wants (e.g., to apply different severity thresholds, or to
short-circuit kick-back on deterministic-only failures first).

The verdict semantics already include `'needs-review'` for this case:
`computeVerdict` returns `'needs-review'` when there are no CRITICAL
findings but at least one `llm-review`-sourced finding. CI gates can
choose to treat `needs-review` as pass or fail per project policy.

## What the reviewer is NOT

- Not a replacement for deterministic rules. The reviewer runs
  _alongside_ `verify`, not instead of it. Anything mechanically
  checkable stays mechanical.
- Not a generic LLM code-review tool. The reviewer's scope is
  narrowly the citation-substance gap — checking judgment calls
  about whether claimed exceptions actually apply.
- Not in the `effective` package itself. The engine stays pure; the
  reviewer is a separate dependency users opt into.

## Why this lives in a doc, not in code

Building the reviewer is its own design problem — model selection,
caching, cost management, deterministic rerun behavior, the
prompt projection for the reviewer LLM, integration with project-
specific judgment criteria. Worth doing carefully when there's
adoption demand for it. Capturing the _what_ now so the _how_ can
be designed when the time comes.

See also: `docs/agent-prompt.md` (the LLM-as-adoption-helper
projection); the reviewer is the LLM-as-citation-checker projection.
Both consume the same Constitution, both emit Findings, both fit the
same loop. The two roles don't share an implementation but they do
share the substrate.
