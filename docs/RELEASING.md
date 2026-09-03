# Releasing

The runbook for cutting a release. Written after the rc.8 cycle, when
five weeks between releases was enough to forget the order of
operations; rewritten at 1.0.0, when the rc dist-tag dance stopped
applying and semver started. Follow it top to bottom; every step is
cheap, and the one that gets skipped under time pressure — dating the
changelog — is the one that costs the most later.

## What version to cut

`effective` is at 1.0.0 and follows [semantic
versioning](https://semver.org/) against its **public API**: the
exported functions (`prepare`, `verify`, `audit`, `kickBack`), the
exported schemas and types, the five CLI commands and their flags, and
the config shape `defineConfig` accepts.

```
Q1: Does the change remove or narrow anything a caller could depend on?
    Examples: deleting an export, renaming a CLI flag, tightening a
    schema so a previously-valid config is rejected, changing a
    function's return shape.
    YES → MAJOR (2.0.0). See "Cutting a major" below.
    NO  → Q2.

Q2: Does it add capability?
    Examples: a new rule in a preset, a new CLI flag, a new optional
    config field, a new export.
    YES → MINOR (1.1.0).
    NO  → Q3.

Q3: It is a fix, a docs change, or an internal refactor with no
    observable API change.
    → PATCH (1.0.1).
```

**A rule change is an API change.** This is the one that catches
people. Adding a rule to a preset, or raising an existing rule's
severity, makes a build fail that previously passed — for an adopter
that is indistinguishable from a breaking change, even though no
signature moved. The rule:

- **New rule added to a preset** → MINOR, and the changelog must say
  so under a `### Added` heading naming the rule. Adopters who cannot
  take it yet have `disable` with a rationale.
- **Existing rule's severity raised**, or its `in` glob widened →
  MINOR, called out the same way.
- **Existing rule's severity lowered**, or scope narrowed → PATCH if
  it is fixing a false positive (the rule was wrong); MINOR if it is a
  deliberate policy change.
- **Rule removed from a preset** → MAJOR. An adopter's constitution
  silently stops enforcing something it used to.

Preset files are protected paths, so every one of these arrives
through a `governance`-labelled PR anyway — see
[CONTRIBUTING](../CONTRIBUTING.md#the-two-path-constitutional-change-workflow)
and `docs/decisions.md` § "Are the shipped presets protected paths?".

## Preconditions

- All release work is merged-ready on a feature branch; `main` is
  green in CI.
- `docs/known-bugs.md` has no open entries, or the ones it has are
  deliberate and named in the release notes.
- Every entry in `docs/open-issues.md` carries a stamp (see that
  file's "Stamps" section). An unstamped entry means the triage was
  not finished.
- `package.json` `version` already reflects the release being cut —
  the bump travels with the release PR, and it is a protected-path
  edit (step 3).

## Steps

### 1. Run the full gate locally

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Then the extended checks, which CI also runs — catching a tarball or
advisory problem before the PR is cheaper than after:

```bash
pnpm dup && pnpm unused && pnpm deps:check && pnpm audit:ci && pnpm pack:check
```

`pnpm audit:ci` earns its place here. Advisories accumulate against
pinned transitives with no commit of ours to trigger them, so the gate
goes red on a repo nobody touched — that is exactly what happened
between rc.8 and 1.0.0, and it blocked every PR until a `pnpm.overrides`
pass cleared it. Check it early in the cycle, not on release day.

### 2. Date the changelog and refresh the README banner

- In `CHANGELOG.md`, retitle the current `## [Unreleased]` content as
  `## [X.Y.Z] — YYYY-MM-DD` and leave a fresh, empty `## [Unreleased]`
  above it. Do this NOW, in the release PR — the rc.2–rc.7 cycle
  skipped it and the dates had to be reconstructed from tag
  archaeology later.
- Check the README banner still tells the truth. It claimed npm
  publish was "intentionally delayed" through six published rc's; a
  banner nobody re-reads is worse than no banner. Confirm the stated
  version, the stability claim, and the badge target all match what
  the registry actually serves.

### 3. Push the branch (the protected-path moment)

`package.json` is a protected path, so a diff containing the version
bump trips `protected-paths-respected` — by design. Per
[CONTRIBUTING's two-path workflow](../CONTRIBUTING.md#the-two-path-constitutional-change-workflow):

- **Human path**: push with `--no-verify`, citing the release
  rationale in the commit message. PR review + CI are the
  load-bearing gates; the local hook bypass is ergonomics.
- **Agent path**: agents never `--no-verify`. An agent preparing a
  release stops at this step and hands the push to a human. If a
  maintainer explicitly authorizes the bypass for a specific branch,
  the PR body says so — a disclosed bypass is reviewable; a silent
  one is the thing the rule exists to prevent.

The pre-push hook's verify step diffs against `origin/main`, so
EVERY push from a branch carrying the version bump re-fires the
CRITICAL until the branch merges — expected. The PR's `governance`
label keeps the CI verify gate green (protected-path findings are
elevated, not gating; everything else still gates).

### 4. Open the PR and merge

```bash
gh pr create --title "release: vX.Y.Z" --base main --label governance
```

Normal review flow. The PR body should link the changelog section and
name every protected path the diff touches.

### 5. Tag the merge commit on main

```bash
git checkout main && git pull
git tag vX.Y.Z
git push origin vX.Y.Z
```

Tag **after** merge, **on main** — tags on unmerged feature branches
point at commits that squash-merges may discard.

**Moving a tag.** Normally you don't: a tag is a promise about a commit.
The one case where moving it is legitimate is a tag that was cut but
**never published** — the publish is what makes a version real, so an
unpublished tag has no consumer and froze nothing. That happened at
1.0.0: the tag was cut, a pre-publish review returned HOLD with four
release-blocking findings, and the fixes landed before any publish.
Moving the tag was right there, because the alternative was shipping a
1.0.0 whose schema had "frozen" a shape we had already decided was
wrong. Confirm with `npm view <pkg> versions` that the version is
genuinely absent from the registry before moving anything; once
published, a version is immutable and the answer is a new one.

A tag push normally skips the local pre-push gate, because
`scripts/pre-push.ts` checks whether every commit being pushed is
already on the remote — a tag on a merged commit adds no new history,
so there is nothing new to verify. If the gate runs anyway, either you
are tagging a commit that was never pushed (in which case the gate is
right) or your hook file is a stale snapshot — run `pnpm install` (or
`pnpm exec simple-git-hooks`) to resync it from `package.json`; see
CONTRIBUTING § hooks.

The tag itself also runs CI (`tags: ['v*']`), so the commit you publish
from is verified under its release name, not only under the branch name
it merged as.

### 6. Publish to npm

```bash
pnpm publish
```

`prepublishOnly` rebuilds `dist/`. Requires npm auth and an OTP, so
this step belongs to whoever holds the 2FA device — an agent preparing
a release hands off here.

A stable release publishes with **no `--tag`** and moves `latest`
automatically. That is the whole of it; there is no dist-tag step to
follow. (Through the rc series, `pnpm publish --tag rc` left `latest`
behind and it had to be synced by hand every single time. That
manual step is retired as of 1.0.0 — if you find yourself reaching for
`npm dist-tag add`, you are either cutting a prerelease or doing
something wrong.)

**Prereleases only.** If you are cutting `1.1.0-rc.1` or similar,
publish with `--tag next` and leave `latest` pointing at the current
stable — never move `latest` to a prerelease. The rc series moved
`latest` onto release candidates, which is why `npm install
@oftomorrow/effective` served an rc for months.

### 7. Post-release sanity

```bash
npm view @oftomorrow/effective versions dist-tags
npx -y @oftomorrow/effective@latest --version
```

The second command confirms the published bin actually runs, from the
tag adopters will actually resolve.

### 8. Close the loop

- Move anything the release decided out of `docs/open-issues.md` and
  into `docs/decisions.md` — the entry lifecycle only works if
  someone runs it at release time.
- Delete the release branch, locally and on the remote.

## Cutting a major

2.0.0 is not scheduled and should not be casual — the point of 1.0.0
was to stop moving under adopters. When it comes:

- The changelog gets a **Migration** section, not just a `### Removed`
  list: what breaks, what to change it to, and how to tell whether you
  are affected.
- Deprecate first where possible. A thing removed in 2.0.0 should have
  warned in a 1.x.
- The previous minor keeps getting patch fixes for a stated window.
  Say the window in the release notes rather than leaving it implied.

## What the next version starts with

Open `docs/known-bugs.md` and `docs/open-issues.md` before planning
the next cycle — entries there are queued work, and the entry
lifecycle (fixed → changelog + removed; decided → `docs/decisions.md`)
depends on someone looking. Post-1.0 entries carry a milestone in
their stamp; that is the backlog, already triaged.
