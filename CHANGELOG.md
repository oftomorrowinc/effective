# Changelog

All notable changes to `effective` are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this
project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **`protected-paths-respected` foundation rule.** New CRITICAL rule
  that flags any diff touching files declared under the new
  `Constitution.protected` field. Distinct from the lane rule: lane
  authorizes which files a scope can touch; protected asserts which
  files NO scope touches without elevation. Both can fire on the
  same file. Marked `diffOnly: true` so `audit` skips it cleanly.
- **`Constitution.protected` schema field.** Array of `{ path,
rationale }` entries; the rationale is required (non-empty) so
  adding a protected path forces articulating why it's
  constitutional. Resolved across `extends` so presets can ship
  defaults a project augments. Surfaced through
  `VerifyContext.protectedPaths` and
  `ResolvedConstitution.protectedPaths`; `ProtectedPath` type
  exported from `effective`.
- **`src/init/protected-detection.json`** registry. JSON-only
  contribution point for default protected-path candidates. Init
  evaluates per-entry detection predicates (`devDependency`,
  `fileExists`, `dirExists`) against the project shape and emits
  matching entries into the generated config's `protected` field.
  Adding a new candidate (e.g., "if Biome is detected, protect
  `biome.json`") is a JSON-only PR — no engine code change.
- **`docs/reviewer-spec-forward.md`.** Forward spec for the
  separate `effective-reviewer` package — captures the
  citation-substance checks the deterministic engine can't make
  (context match, inline-rationale drift, fix-vs-suppress judgment)
  so they're available when the reviewer is designed.
- **Drift-prevention test** in `test/presets.recommended.test.ts`
  asserting no rule's prompt projection references the obsolete
  `.effective/exceptions.ts` path. Catches stale refs without
  requiring a manual sweep on every schema change.
- **`effective audit` command + programmatic `audit()` function.**
  Walks the repository for source files and runs every applicable
  rule against current state (no diff). Designed for baseline
  establishment at adoption time — surfaces invisible debt that
  diff-based `verify` would otherwise never catch. Skips diff-only
  rules (with reasons reported), lane rules (no scope), meta rules
  (no agent report), and toolchain rules by default
  (`--include-toolchain` opts in). `--rule <id>` filters to one
  rule; `--json` emits machine-readable output. Exits 0 regardless
  of findings — audit is informational, not a gate.
- **`Constitution.diffOnly?: boolean` field on RuleBase.** Lets
  rules declare that they only run meaningfully against a diff.
  `verify()` ignores the field (runs all rules); `audit()` skips
  rules with `diffOnly: true` and reports them as skipped. Two
  existing rules opt in: `migration-has-exercising-test` and
  `new-exports-have-non-test-callers`.
- **`walkSourceFiles()` utility** in `src/walk.ts`, exported via
  the public surface. Recursively walks a tree, returns absolute
  paths to source files, skips conventional ignored directories.
  Replaces three near-duplicate walker implementations across
  `audit`, `audit-escapes`, and the `new-exports` check.
- **LLM-onboarding documentation suite** under `docs/`:
  `agent-prompt.md` (distilled context for an LLM helping a user
  adopt the package), `decisions.md` (decision trees for the
  recurring "which option here?" choices), `failure-modes.md`
  (error → cause → fix mapping), and `examples/typescript-vitest-eslint.md`
  (the canonical project shape with full working config). The agent
  prompt was iterated through two cold-eval passes — a fresh
  subagent attempted onboarding using only the docs, the gaps it
  surfaced drove the revisions. The onboarding sequence now has a
  dedicated "Establish baseline with `audit`" step between init
  and first verify.

### Changed

- **Existing `runAuditCommand` renamed to `runAuditEscapesCommand`.**
  The old `audit` command name now refers to the broader audit; the
  narrow escape-hatch survey lives at `effective audit-escapes`.
  Programmatic imports must update: `runAuditCommand` →
  `runAuditEscapesCommand` from `src/cli/audit-escapes.ts`.
  `AuditCliResult` similarly renamed to `AuditEscapesCliResult`.
- **`dedupeBySignature` exported from `src/verify.ts`.** Was
  private; audit reuses it.

### Fixed

- `effective audit-escapes` stdout referenced the obsolete
  `.effective/exceptions.ts` path; now points at the inline
  `exceptions` field on the Constitution.

## [0.1.0-rc.1] — 2026-05-12

First public pre-release. The engine, schema, CLI, build, and the
recommended preset's prompt projections are all real and stable enough
to publish. Detection coverage on the catalogue rules is intentionally
partial — see [Status in the README](./README.md#status-v010-rc1) for
the per-rule split.

### Added

- **Three pure functions over a Zod-typed Constitution.** `prepare()`,
  `verify()`, and `kickBack()` operate on the same catalogue substrate;
  every rule's prompt projection and check come from a single source.
- **Six rule kinds + a meta kind.** `pattern`, `lane`, `schema`, `spec`,
  `toolchain`, `custom`, and `meta` (reflexive checks that read an
  agent self-report alongside the diff). The `MetaRule` kind's
  presence makes it tractable for verifiers to ask whether claims in a
  build log are corroborated by the actual diff, separate from whether
  the diff itself violates a rule.
- **Recommended preset (`extends: ['recommended']`).** Foundation
  rules — lane, escape-hatch citation, four toolchain wrappers, three
  spec-discipline rules, the two hygiene/security pattern rules — plus
  21 catalogue-driven rules with full prompt projections. Several of
  the catalogue rules have real detection (see Status table); the rest
  ship as registered stubs that return no findings until a real check
  lands, so the prompt projection is still active.
- **Foundation rules with real detection.**
  `lane.editable-respected`, `exceptions.must-cite-justification`,
  `no-stray-debug-output` (hygiene, CRITICAL), `no-hardcoded-secrets`
  (security, CRITICAL), `toolchain.{lint-clean,typecheck-clean,
tests-pass,coverage-non-decreasing}`, `spec.test-names-land-verbatim`,
  `spec.assertions-not-narrowed`, `spec.no-extra-tests-claiming-spec`.
- **Catalogue rules with real detection (Tier 1.1).**
  `no-disabled-tests-without-exception` (CustomRule respecting
  `exception-id:` annotations on adjacent lines),
  `migration-has-exercising-test` (CRITICAL — new migration files
  whose stem isn't mentioned by any test in the diff),
  `new-exports-have-non-test-callers` (HIGH — walks the repo to
  confirm at least one non-test caller for each new export).
- **`commitMetadata` on `VerifyContext`.** Git sources auto-populate
  subject / SHA / author / ISO date from `git log -1`; callers can
  override or add an `attempt` counter via `VerifyInput.commitMetadata`.
- **CLI:** `effective init`, `effective verify`, `effective audit-escapes`,
  `effective rules`. Init detects package manager from lockfile,
  TypeScript from `tsconfig.json`, and test/lint framework from
  `devDependencies` (with ambiguity flagged as `// EDIT:` comments
  in the generated config). Generates a single
  `effective.config.{ts,js}` with the recommended preset extended,
  the toolchain populated, and the exceptions registry inline.
- **Worktree isolation.** `verify()` against a git source materializes
  `.effective/work` as an isolated worktree and runs the toolchain
  there. `.effective/node_modules` persists between runs for speed;
  the first verify is slow (1–5 minutes for install), subsequent runs
  are fast.
- **Self-CI.** This repo's own GitHub Actions pipeline runs
  `effective verify` against PRs (vs. the base ref) and main pushes
  (vs. `HEAD^`).

### Changed

- **Severity vocabulary:** `CRITICAL | HIGH | MED | LOW`. The earlier
  `BLOCK | NIT` names were collapsed before any non-schema code shipped.
- **Exceptions live inline on the Constitution.** The previous two-file
  model (`.effective/exceptions.ts` separate from `effective.config.ts`)
  was collapsed: the Constitution now carries an optional
  `exceptions: ExceptionRegistry` field, and `init` generates a single
  config with `...seeds.builtInExceptions` spread inside. The
  `defineExceptions()` helper remains exported for users who prefer to
  factor exceptions into a separate file and spread back in.
- **Built-in `recommended` preset auto-wired at config load.**
  `loadConfig` and `loadConfigFromPath` now register the recommended
  preset on the resolve options. Configs that say `extends:
['recommended']` no longer need their callers to pass
  `presetRegistry` explicitly.

### Known limitations

- **Catalogue-rule detection is partial.** The README Status section
  enumerates which rules have real detection vs. registered stubs.
  Roughly: foundation rules + four catalogue rules have real checks;
  the remaining ~17 catalogue rules + MetaRule self-report checks
  ship as stubs with active prompt projections. They will gain
  detection incrementally in 0.1.x.
- **`toolchain.coverage-non-decreasing` fails on `any-output`, not
  against a recorded baseline.** Baseline tracking is its own design
  problem; the rule currently triggers on any coverage command output.
  Projects that want diff-bound coverage gates should disable this rule
  and run coverage separately in CI, as this repo does.
- **`new-exports-have-non-test-callers` skips modified files.**
  Distinguishing newly added exports from pre-existing ones in
  modified files needs git baseline diff parsing; for now only files
  added in the diff are scanned.
- **Worktree dependency install is per-project, not orchestrated.** The
  first `effective verify` on a project will run the detected package
  manager's install command into `.effective/node_modules`. Private
  registries, monorepo hoisting, and peerDep conflicts surface as
  install failures at first verify rather than at init.

### Migration notes

- If you adopted an earlier (pre-tag) version with `.effective/exceptions.ts`:
  delete the separate file and move its `defineExceptions({ ... })`
  body into the `exceptions: { ... }` field of `effective.config.ts`.
  The schema accepts the same shape.
