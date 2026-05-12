# Failure modes

When `effective init` or `effective verify` doesn't work, the failure
usually fits one of a small set of shapes. This doc maps each shape to
its diagnosis and fix.

Organized by where the failure surfaces — init, config load, diff
source, toolchain execution, rule findings. Each entry follows the
same structure: error excerpt → what went wrong → fix.

---

## Init

### `Effective is already initialized.`

```
Effective is already initialized. See effective.config.ts.
Pass --force to regenerate.
```

**Diagnosis:** Init detected a pre-existing `effective.config.{ts,js}`
and refused to overwrite. This is the expected behavior on re-runs.

**Fix:** If you want to keep the existing config, do nothing. If you
want init to regenerate from scratch (you'll lose customizations),
run `npx effective init --force`. Idempotent re-runs are safe when
only some files are missing — init fills in what's missing without
touching what's there.

### Ambiguity comment about multiple frameworks

```ts
// EDIT: detected multiple test frameworks (vitest, jest); assumed vitest.
toolchain: {
  test: 'pnpm test --reporter json',
}
```

**Diagnosis:** Both vitest and jest are in your `devDependencies`. Init
picked the first one it detected (alphabetical-ish: vitest, jest,
node-test) and left an `// EDIT:` comment.

**Fix:** Read the comment, confirm or change the assumption, remove the
comment. If your `test` script actually runs jest, change the
`toolchain.test` line to use `--json` (jest's flag) instead of
`--reporter json` (vitest's flag). The comment is the load-bearing
signal that the assumption needs review.

### Generated `.js` config when you wanted `.ts`

**Diagnosis:** Init detected no `tsconfig.json` and produced
`effective.config.js`. This is intentional — init matches the
project's apparent stance on TypeScript.

**Fix:** If your project IS TypeScript but doesn't have a root
`tsconfig.json` (monorepo with `tsconfig.json` in subpackages), either
add a stub `tsconfig.json` at the root or rename `effective.config.js`
to `effective.config.ts` and adjust the imports/exports manually
(`require` → `import`, `module.exports` → `export default`).

---

## Config load

### `No effective.config.{ts,mts,cts,js,mjs,cjs} found`

```
No effective.config.{ts,mts,cts,js,mjs,cjs} found between <cwd>
and the filesystem root. Run `npx effective init` to create one.
```

**Diagnosis:** The CLI walked up from the working directory and found
no config file. Either you haven't run init, or you're running verify
from a subdirectory that's outside the project root.

**Fix:** Run `npx effective init`. If you have a config and the loader
still can't find it, run verify with `--config <path>` pointing at
the absolute path.

### `Invalid Constitution in <path>`

```
Invalid Constitution in /path/to/effective.config.ts:
  - exceptions.our-postgres-driver-quirk.addedDate: Required
  - extends: Expected array, received string
```

**Diagnosis:** Zod schema validation failed on your config. Each
line lists the field path and the schema's complaint.

**Fix:** Read each bullet. Common causes:

- `addedDate: Required` — every exception needs an `addedDate` (ISO
  format: `'2026-05-12'`).
- `id: Required` — every exception needs its `id` field, which usually
  matches the registry key.
- `Expected array, received string` — `extends` takes an array of
  preset names, not a single string. `extends: ['recommended']`, not
  `extends: 'recommended'`.
- `Override rationale required` — `override` entries need a non-empty
  `rationale` string.

If the error message references a schema name you don't recognize,
check the `schemas/` directory or grep the type — Zod reports the
exact field path.

### `extends references unknown preset "<name>"`

```
extends references unknown preset "recommended". Pass
options.presetRegistry with this preset registered, or remove it
from extends.
```

**Diagnosis:** Hit when loading a config programmatically without the
built-in preset registry. Should not happen via the CLI (the CLI's
loader auto-wires the registry).

**Fix:** If you're calling `resolveConstitution` directly, pass
`presetRegistry: { recommended: presets.recommended }`. If you're
using a non-built-in preset, register it in your call to
`verify({ resolveOptions: { presetRegistry: { ... } } })`.

---

## Diff / source

### `verify needs a baseline ref`

```
`verify` needs a baseline ref. Use --baseline <ref> or --against <ref>,
or --staged for index-based verification.
```

**Diagnosis:** The git source needs a baseline ref to diff against. No
flag was supplied.

**Fix:** Pass one of:

- `--against main` — compare HEAD vs. main (most common for PRs)
- `--baseline <ref> --work <ref>` — explicit both sides
- `--staged` — diff the index against HEAD (pre-commit hook usage)

### `git diff <baseline>...<work> failed`

```
git diff --name-status --no-renames origin/main...feature failed
(exit 128): fatal: ambiguous argument 'origin/main...feature'
```

**Diagnosis:** Git couldn't resolve one of the refs. Usually one of:

- The baseline ref isn't fetched (`origin/main` doesn't exist locally
  because no `git fetch` has run)
- The work ref doesn't exist (typo, or you're not on the right
  branch)
- The repo is shallow and the baseline is before the fetch depth

**Fix:**

```bash
git fetch origin main:main      # bring the baseline local
git fetch --unshallow            # if the repo is shallow
```

For CI: `actions/checkout@v4` with `fetch-depth: 0` fetches full
history.

---

## Toolchain execution

### `<tool> exited with code N` from inside the worktree

```
⛔ CRITICAL  toolchain.typecheck-clean  @  (project-wide)
    typecheck exited with code 1. Resolve type errors at the source.
    evidence: typecheck exited with code 1.
```

**Diagnosis:** The configured toolchain command failed in the
isolated worktree (`.effective/work`). Typical causes:

1. **Missing `node_modules`** in the worktree. The first verify
   installs deps; if the install failed silently, subsequent commands
   can't find packages.
2. **Path-relative config** in the toolchain command — e.g., `pnpm
test` works at the repo root but the test script references files
   relative to a directory the worktree doesn't reproduce.
3. **A real failure** — the lint / typecheck / test command would
   also fail outside the worktree.

**Fix:**

- Try running the command in the original repo first
  (`pnpm typecheck` in the project root). If it fails there too,
  that's the issue; fix it.
- If it passes in the project root but fails in the worktree, look at
  `.effective/work` directly to see what's missing. Often
  `.effective/node_modules` doesn't have the package the worktree
  command needs.
- If the worktree install failed (private registry, peer dep
  conflict), the resolution is project-specific — check the original
  install output. Once resolved, re-running verify reuses the cached
  install.

### Worktree dependency install fails on first verify

```
pnpm install --frozen-lockfile failed (exit 1):
  ERR_PNPM_FETCH_401 GET https://npm.your-registry.com/...: Unauthorized
```

**Diagnosis:** The first `verify` invokes the package manager to
install into `.effective/node_modules`. This is the first time
the install runs in a context that may differ from your dev shell
(env vars, registry auth, lockfile expectations).

**Fix:** Run the same install command in the project root to confirm
it works there. The fix is whatever makes that install succeed — npm
auth, registry config, lockfile sync. Once the deps are installed in
`.effective/node_modules`, subsequent verify runs skip the install.

### Coverage rule fires on every run

```
⛔ CRITICAL  toolchain.coverage-non-decreasing  @  (project-wide)
    coverage produced output. Write the missing test.
```

**Diagnosis:** The `coverage-non-decreasing` rule's `failOn:
'any-output'` semantic doesn't match what coverage commands actually
do (they always produce output). The rule's `non-decreasing` name
promises something the engine doesn't yet enforce.

**Fix:** Disable the rule for now and run coverage in your existing
CI step:

```ts
disable: {
  'toolchain.coverage-non-decreasing':
    'Baseline tracking pending; coverage thresholds enforced separately by vitest config.',
},
```

Track the rule's status in the README — when baseline tracking lands,
re-enable.

---

## Rule findings that look wrong

### `no-disabled-tests-without-exception` fires on a test you DID annotate

```
⛔ CRITICAL  no-disabled-tests-without-exception  @  test/auth.test.ts:42:3
    evidence: it.skip('rejects invalid creds', () => {
```

**Diagnosis:** The check looks for `exception-id: <id>` in the same
line, the line above, or the line below the disable. If your
annotation is two lines away, it doesn't match.

**Fix:** Move the annotation closer:

```ts
// GOOD: same line
it.skip('rejects invalid creds', () => {}); // exception-id: tests.flaky-auth

// GOOD: directly above
// exception-id: tests.flaky-auth
it.skip('rejects invalid creds', () => {});

// BAD: too far
// exception-id: tests.flaky-auth
//
// (intervening comment)
it.skip('rejects invalid creds', () => {});
```

The check trusts the citation as surface evidence. The separate
`exceptions.must-cite-justification` rule validates that the cited
id resolves to a real entry in the `exceptions` registry — if you've
moved the annotation correctly but the id doesn't exist, that's the
rule that fires.

### `no-hardcoded-secrets` fires on a test fixture

```
⛔ CRITICAL  no-hardcoded-secrets  @  test/fixtures.ts:7
    evidence: const TEST_TOKEN = "AKIAIOSFODNN7EXAMPLE";
```

**Diagnosis:** The rule intentionally matches real-shaped tokens in
ALL files (including tests) because real tokens accidentally landing
in tests is itself a leak. The fixture is using a real AWS-key shape.

**Fix:** Either:

1. Use a clearly-fake placeholder: `'test-aws-key-placeholder'`
2. Construct the token at runtime via concatenation:
   `const t = 'AKIA' + 'IOSFODNN7EXAMPLE';` — the file source no
   longer contains the contiguous token shape; the rule doesn't
   match. The fixture still works at runtime.

This repo's own `test/foundation-rules.test.ts` uses the
concatenation pattern to test the secret-detection rule without
tripping its own secretlint hook.

### `migration-has-exercising-test` fires on a migration that DOES have a test

**Diagnosis:** The check is a substring match for the migration's
filename stem in any test file in the diff. If your test file
references the migration by path or imports it dynamically, the stem
might not appear literally.

**Fix:** Make sure the test file's source contains the migration's
filename stem (without extension) somewhere — an import statement, a
describe/it name, a comment. Example:

```ts
// test/migrations/0042_user_role.test.ts
import { runMigration } from '../../migrations/0042_user_role.sql?raw';
// ... `0042_user_role` appears in source → check passes
```

If your test exercises the migration but really shouldn't need to
mention its name (e.g., generic migration-runner test), override the
rule's checkRef with a project-specific check via
`verify({ customChecks })`.

### `new-exports-have-non-test-callers` fires on a new export that IS used

**Diagnosis:** The check walks the repo looking for the export name
as a word (`\bExportName\b`) in non-test files. If callers are in
test files only — or in dist/ which is gitignored — the rule fires.

Common false-positive shapes:

- The export is consumed via re-export from `index.ts` and the
  immediate consumer is `index.ts`'s own re-export, with the real
  callers further out. The rule treats re-exports as callers, so
  this should pass — but if the immediate consumer is a test file
  that imports from the index, only test callers are seen.
- The export is consumed by a config file or build script that
  doesn't sit under the source roots (e.g., `eslint.config.js` at
  the repo root). The walker covers everything under `ctx.repo`
  except gitignored / `IGNORED_DIRS` paths.

**Fix:** Confirm the caller is in a file the walker visits. If the
export is only used at build time (config files), prefix it with
`_` to signal intentional non-application-code use, or document the
case as an exception (rule has severity HIGH, not CRITICAL, so a
single false-positive doesn't fail the verdict).

---

## Stubbed rules don't fire

Several catalogue rules are registered with no-op check
implementations (see README §Status). They appear in `prepare()`
guidance, but `verify()` won't flag them until real check
implementations land.

**Diagnosis:** If a rule's prompt projection describes a failure mode
and you've introduced exactly that failure mode in your diff, but
no finding fires, the rule is probably stubbed.

**Fix:** Check `src/presets/rules/stubs.ts` (or the README §Status
section) to confirm. Until detection lands:

- The rule still appears in `prepare()` — workers receive the
  guidance.
- The rule still appears in `kickBack()` citations if findings from
  other rules touch the same concern.
- For project-critical rules, you can register your own
  implementation via `verify({ customChecks: { yourCheckRef: ... } })`
  and the engine will use it instead of the stub.

The stubs are intentional v0.1 ground state. Detection will catch up
incrementally as Tier 2 work lands.
