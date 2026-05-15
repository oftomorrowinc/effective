# Open issues — decisions deferred

Issues we know about but haven't decided how to resolve. Captured here
during release-prep sessions so they don't get lost. Each entry frames
the question and outlines the candidate approaches; the goal is to
make the decision when we have enough signal, not to force one
prematurely.

Items that are _already actionable_ (small fix, clear path) belong in
the changelog under `[Unreleased]` instead. This doc is for the cases
where the right answer is genuinely unclear.

---

## `no-hardcoded-secrets` rule scope

**The bug.** The rule's pattern (matching AWS access keys, GitHub
tokens, JWT, Stripe keys, Google API keys, Anthropic keys) defaults
to `**/*` as its `in` glob. In `docs/failure-modes.md` we quote AWS's
canonical "example key" string to demonstrate _what the rule
catches_ — which the rule itself then catches, firing CRITICAL on
its own documentation when the file appears in a diff.

Surfaced in rc.4 PR CI when a docs edit touched `failure-modes.md`.
Same shape as the rc.3 escape-hatch scanner bug: pattern rules with
broad globs catch their own illustrations.

**Two paths**:

1. **Narrow the rule's `in` glob to source / config files**
   (`**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts,json,yaml,yml}`). Matches the
   pattern already used by `no-stray-debug-output`. Loses coverage of
   accidentally-leaked keys in `README.md` / docs. Adopters wanting
   broader scope override per project.
2. **Redact the doc example** so the demonstration string doesn't
   match the regex (e.g., introduce a hyphen or lowercase letter
   that breaks the `[0-9A-Z]` character class). Keeps the rule
   broad; weakens the doc slightly because the illustration is now
   obviously fake.
3. **Register a doc-illustration exception** in
   `seeds.builtInExceptions`. Categorically the right modeling
   ("we're demonstrating the pattern, not committing a secret") but
   creates a precedent that may invite misuse.

**Open question**: what's the right default philosophy — "scan
everything, narrow when bitten" (current) or "scan source code only,
broaden when needed" (matches the pattern of every other rule in the
preset)?

Worth noting: every adopter who writes a README quoting an API-key
shape will hit this. Detection-before-exception (Todd's stated
principle) argues for #1.

---

## Formalizing the agent vs human protected-path workflow

**The convention today**: protected-path edits (e.g., `package.json`
version bumps, `tsconfig.json` paths) require `--no-verify` to push
because the pre-push hook fires CRITICAL on the diff. The convention
that's emerged across rc.2 → rc.5:

- **Human path**: edits a protected file, pushes with `--no-verify`
  citing rationale in the commit message. PR review + CI gate +
  reviewer-pass (future) are the load-bearing layers; `--no-verify`
  on the human's local push is ergonomics.
- **Agent path**: never `--no-verify` on a protected-path push. The
  agent flags the constitutional change needed, the human runs the
  push with elevation.

This is captured in three places informally:

- `CONTRIBUTING.md § "The two-path constitutional-change workflow"`
- `docs/reviewer-spec-forward.md § "What the reviewer checks on
protected-path edits"`
- Conversation memory (`feedback_governance_layering.md`)

**The question**: is informal capture sufficient, or should this be a
first-class part of effective's surface? Options:

1. **Leave as-is.** The convention is documented in
   `CONTRIBUTING.md`; agent tooling that reads
   `docs/agent-prompt.md` already gets the right framing. New
   adopters infer it from the docs.
2. **Promote to a rule.** Add a rule like
   `governance.agent-must-not-bypass-protected-paths` that activates
   when an agent identifies itself (e.g., via a CI environment
   variable or a `scope.actor: 'agent'` field) and a protected-path
   diff is present without elevation evidence. Surfaces violations
   mechanically rather than relying on convention.
3. **Bake into the CLI.** A `--actor=agent` flag (or auto-detection
   via env) that, combined with a protected-path diff, refuses to
   proceed with a CRITICAL rather than just flagging. Hard
   guard-rail; harder to misconfigure.

**Open question**: when (if ever) does this transition from
documented-convention to enforced-rule? Probably tied to the
`effective-reviewer` package, since the reviewer is the layer that
checks substance on protected-path PRs. Worth discussing once that
package's shape firms up.

The risk of doing nothing: as more agents adopt effective, the
convention drifts unless something mechanical preserves it. The risk
of doing it too early: prematurely formalizing a workflow that's still
evolving.

---

## Other items observed but not yet pressing

Quick log of things that surfaced during rc.3 → rc.5 prep but didn't
need immediate action. None are bugs; each is a "we should think
about this before stable":

- **`npm dist-tag latest` requires manual sync after every rc
  publish.** First publish set `latest = rc.3`; subsequent `pnpm
publish --tag rc` only updates `rc`. Could be scripted (a
  `release` npm script that runs publish + `npm dist-tag add` in
  sequence). Resolves automatically when 0.1.0 stable ships (the
  unstamped publish moves `latest` naturally).

- **Coverage non-decreasing semantics not yet implemented.** Renamed
  to `coverage-meets-threshold` in rc.4 to match what the engine
  actually does. The "did coverage drop from main?" check is still a
  real adopter need — would require baseline tracking on disk or
  injected through `verify()`. Worth designing once a real adopter
  asks for it.

- **`prepareWorktree` install-step error path could be smoother.**
  Currently throws with the last 15 stderr lines if `pnpm install
--frozen-lockfile` (etc.) fails. Hasn't been hit yet, but if a
  worktree's install fails mid-creation, the next verify call's
  cleanup might leave artifacts. Worth a smoke test.

- **Worktree install runs every verify** even when the lockfile
  hasn't changed. Workarounds exist (`--keep-worktree=always
--skip-install`), but smarter caching would be a nice DX win —
  e.g., hash the lockfile and skip install when the hash matches.

These are noted, not assigned, not blocking.
