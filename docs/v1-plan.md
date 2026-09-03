# The road to v1.0.0 — plan (2026-08-20, Todd + Cowork)

**The decision:** effective leaves beta as **1.0.0** — not 0.1.0
stable. We are declaring an API stable and inviting outside
contributors; 1.0.0 says that plainly. The occasion: effective becomes
a default part of the of-tomorrow-framework payload and lands in the
byollm repos, where open-source contributions are expected.

**Process rule for this whole plan:** every step runs as a PR through
effective's own governance machinery (protected paths, `--governance-pr`
elevation where the change IS constitutional). The repo that enforces
the constitution is seen obeying it — that is the credibility a v1
trades on.

## 1. Close the known bug (the repo's own 1.0.0 exit criterion)

Merge **PR #15** (`fix/severity-override-escape-hatches`) — repro-first,
regression case pinned, no protected files. Merging empties
`docs/known-bugs.md`, which is the state a v1 ships in.

## 2. Land or retire the stray branch

`governance/pre-push-tag-skip` (52173fa — tag-only pushes skip the
pre-push gate, hook-snapshot resync docs) is ahead of main with no PR.
Open one and take it through review, or delete it with a line saying
why. An unmerged commit on a governance branch is exactly the ambiguity
a v1 shouldn't carry.

## 3. Triage the 18 open issues — every entry gets a stamp

Each entry in `docs/open-issues.md` gets exactly one of:

- **decide-now** — the answer ships in or before v1;
- **post-1.0** — deliberately deferred, tagged with a milestone, and
  the entry says so (deferred-by-decision reads fine on a 1.0;
  deferred-by-drift does not);
- **closed** — won't do, with the reason.

Expected decide-now set (Cowork's read; CC may argue): **the agent-vs-
human protected-path workflow** and **block-weakening vs
block-every-edit** — both are what outside contributors hit in their
first week, and contributors are the reason for this release. Likely
also **baseline/ratchet for existing-codebase adoption**, since the
rollout below adopts effective into four existing codebases and will
either exercise or expose that answer immediately.

## 4. Repo hygiene

Delete the ~10 merged/stale branches (`release/v0.1.0-rc.*`,
`docs/open-issues*`, merged `feat/*`). Update `docs/RELEASING.md` for
stable versioning — its own text says the rc dist-tag dance "stops
mattering at 0.1.0"; rewrite for 1.0.0 and semver-with-changelog
going forward. CHANGELOG gets a 1.0.0 section that tells the story,
not just the diffs.

## 5. Release 1.0.0

Tag through the release process, `latest` on npm. The README's framing
shifts from "in development" to stable-with-contribution-guide;
CONTRIBUTING.md is re-read start to finish against what a stranger
actually experiences (the governance labels, the protected-path
refusals they'll meet) — the first PR from outside should not be the
test of whether the docs match the machinery.

## 6. Rollout — framework first, then the byollm repos

1. **of-tomorrow-framework:** effective in the payload — generated
   `effective.config.ts` + starter constitution per suite, a CI step
   in the generated workflow, and the framework's own selftest runs
   it. This is "default going forward" (Todd's ask): every new suite
   is born with it.
2. **byollm (public):** first retrofit, deliberately — its
   constitution is the example every outside contributor reads.
   Written against the repo's real rules (MUTATIONS.md discipline,
   registry/MUST conventions, no-envelope-in-logs), not a generic
   template.
3. **byollm-cloud, then byollm-cloud-web:** the shakedown. These repos
   already run verify gates, mutation checks and conform — the
   constitution either complements that machinery or fights it, and
   which one is a v1 finding we want before strangers adopt.
   Friction here feeds back as issues in this repo, worked through
   the same triage as §3.

## Done when

known-bugs empty; no unmerged governance branches; every open issue
stamped; 1.0.0 on npm as `latest`; the framework generates effective
into new suites; all four existing repos green under their own
constitutions; and the first outside PR to any of them meets the
machinery the docs describe.

---

## Status check + execution order (2026-09-02, Todd + Cowork)

Todd's call: requests have gone quiet, validation is done – knock out
the last batch and ship 1.0.0. State against the plan:

- **This file was never committed** – untracked since 08-20. Committed
  now; the plan is only a plan when it's in the ledger.
- **Step 1 (PR #15):** still open – `fix/severity-override-escape-hatches`
  (bf99ba1) is 1 commit ahead of main. Merging it empties
  known-bugs.md. → FIRST.
- **Step 2 (stray branch):** `governance/pre-push-tag-skip` (52173fa)
  is checked out locally, ahead of main, still no PR. It's also the
  change the 1.0.0 TAGGING flow itself wants (tag-only pushes skip the
  pre-push gate) – so it gets its PR and lands SECOND, before the
  release needs it.
- **Step 3 (triage):** zero stamps on ~15 open-issues entries.
  Amended for the quiet-inbox reality: stamp EVERYTHING, build
  NOTHING new. The three decide-now candidates (agent-vs-human
  protected-path workflow; block-weakening vs block-every-edit;
  baseline/ratchet) get decided as WRITTEN POLICY in the docs, not as
  features – a v1 can ship documented decisions; it can't ship
  undecided ambiguity. Everything else: post-1.0 with a milestone, or
  closed with a reason.
- **Step 4 (hygiene):** ~16 stale local/remote branches to delete;
  RELEASING.md rewrite for stable semver; CHANGELOG 1.0.0 story.
  PLUS one drift the plan missed: the README says "npm publish is
  intentionally delayed" while npm serves 0.1.0-rc.8 with `latest`
  pointing at the rc – the banner and the registry disagree. The
  README's beta banner goes; `latest` moves to 1.0.0 at release.
- **Step 5 (release):** unchanged – through the repo's own governance.
- **Step 6 (rollout):** explicitly POST-1.0 and out of this batch –
  the framework payload adoption rides core_005's lane, the byollm
  retrofits follow. The release does not wait on any adoption.

Process rule unchanged: every step is a PR through effective's own
machinery. The repo that enforces the constitution is seen obeying it.
