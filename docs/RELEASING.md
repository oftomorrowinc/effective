# Releasing

The runbook for cutting a release (rc or stable). Written after the
rc.8 cycle, when five weeks between releases was enough to forget the
order of operations. Follow it top to bottom; every step is cheap,
and the two that get skipped under time pressure (dating the
changelog, syncing the dist-tag) are the two that cost the most later.

## Preconditions

- All release work is merged-ready on a feature branch; `main` is
  green in CI.
- `package.json` `version` already reflects the release being cut
  (the bump travels with the release PR — it's a protected-path edit,
  see step 3).

## Steps

### 1. Run the full gate locally

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Optionally also the extended checks (`pnpm dup`, `pnpm unused`,
`pnpm deps:check`, `pnpm pack:check`) — CI runs them, but catching a
tarball problem before the PR is cheaper.

### 2. Date the changelog and refresh the README banner

- In `CHANGELOG.md`, retitle the current `## [Unreleased]` content as
  `## [0.1.0-rc.N] — YYYY-MM-DD` and leave a fresh, empty
  `## [Unreleased]` above it. Do this NOW, in the release PR — the
  rc.2–rc.7 cycle skipped it and the dates had to be reconstructed
  from tag archaeology later.
- Update the `last reviewed YYYY-MM-DD` date in README's banner.

### 3. Push the branch (the protected-path moment)

`package.json` is a protected path, so a diff containing the version
bump trips `protected-paths-respected` — by design. Per
[CONTRIBUTING's two-path workflow](../CONTRIBUTING.md):

- **Human path**: push with `--no-verify`, citing the release
  rationale in the commit message. PR review + CI are the
  load-bearing gates; the local hook bypass is ergonomics.
- **Agent path**: agents never `--no-verify`. An agent preparing a
  release stops at this step and hands the push to a human.

The pre-push hook's verify step diffs against `origin/main`, so
EVERY push from a branch carrying the version bump re-fires the
CRITICAL until the branch merges — expected; that's what the human
`--no-verify` path is for. The PR's `governance` label keeps the CI
verify gate green (protected-path findings are elevated, not gating;
everything else still gates).

### 4. Open the PR and merge

```bash
gh pr create --title "release: v0.1.0-rc.N" --base main
```

Normal review flow. The PR body should link the changelog section.

### 5. Tag the merge commit on main

```bash
git checkout main && git pull
git tag v0.1.0-rc.N
git push origin v0.1.0-rc.N
```

Tag **after** merge, **on main** — tags on unmerged feature branches
point at commits that squash-merges may discard.

Tag-only pushes skip the local pre-push gate (`scripts/pre-push.mjs`
detects them from the refs git feeds the hook): a tag names history
that already passed the PR gate and CI, so there is nothing new to
verify. If the push runs the full gate anyway, your hook file is a
stale snapshot — run `pnpm install` (or `pnpm exec simple-git-hooks`)
to resync it from `package.json`; see CONTRIBUTING § hooks.

### 6. Publish to npm

```bash
pnpm publish --tag rc
```

`prepublishOnly` rebuilds `dist/`. Requires npm auth (and OTP).
Stable releases (no prerelease suffix) publish without `--tag` and
move `latest` automatically.

### 7. Sync the dist-tag (rc releases only)

`--tag rc` does NOT move `latest`. Sync it manually:

```bash
npm dist-tag add @oftomorrow/effective@0.1.0-rc.N latest
npm view @oftomorrow/effective dist-tags   # confirm both point at rc.N
```

This bites every rc (first noted in `docs/open-issues.md` during
rc.3–rc.5 prep). It stops mattering at 0.1.0 stable.

### 8. Post-release sanity

```bash
npm view @oftomorrow/effective versions dist-tags
npx -y @oftomorrow/effective@rc --version
```

The second command confirms the published bin actually runs.

## What the next version starts with

Open `docs/known-bugs.md` and `docs/open-issues.md` before planning
the next cycle — entries there are queued work, and the entry
lifecycle (fixed → changelog + removed; decided → decisions.md)
depends on someone looking.
