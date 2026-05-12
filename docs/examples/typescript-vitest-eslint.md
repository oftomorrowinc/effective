# effective.config — TypeScript + Vitest + ESLint

The most common adoption shape: a TypeScript project using Vitest for
tests and ESLint for linting. If your project matches this shape, the
config below works on first run with at most cosmetic edits.

## Assumed shape

- `tsconfig.json` at repo root
- `package.json` with:
  - `scripts.lint` invoking ESLint (e.g., `"eslint . --max-warnings 0"`)
  - `scripts.typecheck` invoking `tsc --noEmit` (or similar)
  - `scripts.test` invoking `vitest run`
  - `scripts.test:coverage` invoking `vitest run --coverage`
  - `devDependencies` listing `vitest`, `eslint`, and a coverage
    provider (`@vitest/coverage-v8` or `@vitest/coverage-istanbul`)
- A package manager lockfile (`pnpm-lock.yaml`, `yarn.lock`, or
  `package-lock.json`)
- Source under `src/` (or whatever you want `scope.editable` to default
  to — adjust the `lane` rule's expectations accordingly)

`npx effective init` will detect everything in this list and produce a
config close to what's below. The version here is annotated with what
each section does and why so it's clear what to change for adaptation.

## The config

```ts
// effective.config.ts
import { defineConfig, seeds } from 'effective';

export default defineConfig({
  // The recommended preset ships the foundation rules + the catalogue-
  // driven rules at strict severity. See README §Status for the per-
  // rule split between real detection and stubbed-with-prompt.
  extends: ['recommended'],

  // The toolchain config tells `effective verify` how to run lint /
  // typecheck / test / coverage in the isolated worktree. Reporter
  // flags are appended so the JSON parsers shipped with `effective`
  // receive parseable output. (If your script already emits JSON, the
  // flag is harmless — most reporters accept the flag idempotently.)
  toolchain: {
    lint: 'pnpm lint --format json',
    typecheck: 'pnpm typecheck',
    test: 'pnpm test --reporter json',
    coverage: 'pnpm test:coverage --reporter json',
  },

  // Built-in exception templates spread first; project-specific
  // instances go below the spread. See README §Exceptions for the
  // categories shipped in `seeds.builtInExceptions`.
  exceptions: {
    ...seeds.builtInExceptions,

    // 'our-postgres-driver-quirk': {
    //   id: 'our-postgres-driver-quirk',
    //   category: 'external-library-drift-defense',
    //   mechanism: 'ts-expect-error',
    //   context: 'pg@8.x leaves stale connections under specific error shapes',
    //   retirementCondition: 'Resolved when we migrate to pg@9 or postgres.js',
    //   addedDate: '2026-05-12',
    //   status: 'active',
    // },
  },

  meta: {
    name: 'your-project-name',
    version: '0.1.0',
  },
});
```

## Adaptation

### Different package manager

`pnpm lint --format json` becomes:

- `yarn lint --format json` for yarn
- `npm run lint -- --format json` for npm (the `--` is required to
  forward args to the underlying script)

`init` detects the lockfile and generates the right form.

### Different script names

If your scripts are named differently (e.g., `lint:ci`, `test:unit`,
`coverage:report`), point the toolchain entries at the actual script
name:

```ts
toolchain: {
  lint: 'pnpm lint:ci --format json',
  test: 'pnpm test:unit --reporter json',
}
```

`init` prefers `:ci` variants when present.

### Missing scripts

If a script doesn't exist at all (common: `typecheck` is often
implicit, no script defined), init OMITS the corresponding toolchain
entry. The matching rule (`toolchain.typecheck-clean`) then has no
command to run and silently skips — no findings, no defense.

Two fixes:

1. **Add the missing script before init.** For typecheck, the
   typical line is `"typecheck": "tsc --noEmit"` in `package.json`.
2. **Add the toolchain entry manually after init.** Edit the
   generated config and add the line yourself:
   ```ts
   toolchain: {
     typecheck: 'pnpm exec tsc --noEmit',
     // ...
   }
   ```

Path-relative commands (e.g., `npx tsc`) work but the package-manager
form (`pnpm exec tsc`) is more robust across environments.

### Pre-existing escape hatches (gradual adoption)

A real codebase usually has dozens of `eslint-disable`,
`@ts-expect-error`, and `c8 ignore` comments without exception
references. Don't retrofit them all up front. Use `override` to
downgrade `exceptions.must-cite-justification` until you've caught
up:

```ts
override: {
  'exceptions.must-cite-justification': {
    severity: 'HIGH',
    rationale:
      'Pre-existing escape hatches lack refs; warn now, retrofit incrementally. Promote back to CRITICAL once all suppressions are cited.',
  },
},
```

Run `npx effective audit-escapes` to see what's already in the
codebase. Add exception entries to the `exceptions` field in batches.

### Custom roles

If your project has workflows beyond the built-in roles
(`test-writer`, `code-writer`, `reviewer`, `free-form`), add them
under `roles`:

```ts
roles: {
  'migration-writer': {
    defaultEditable: ['migrations/**', 'test/migrations/**'],
    expectations: {
      newMigrationExists: true,
      existingTestsPass: true,
    },
  },
},
```

`scope.role: 'migration-writer'` then automatically applies the
relevant editable lane and expectations.

## Common gotchas

### ESLint script must exit non-zero on findings

`effective`'s default `toolchain.lint-clean` rule uses
`failOn: 'count-non-zero'`. ESLint exits zero by default if you have
only warnings; configure `--max-warnings 0` in your `lint` script so
warnings count.

```json
"scripts": {
  "lint": "eslint . --max-warnings 0"
}
```

If the script can't be changed, switch the rule to
`failOn: 'non-zero-exit'` (lint isn't required to be perfectly
clean — just to exit zero).

### Vitest coverage provider must be installed

The coverage command needs a provider:

```bash
pnpm add -D @vitest/coverage-v8
```

Without it, `vitest run --coverage` exits non-zero and the
`toolchain.coverage-non-decreasing` rule fires.

### First `verify` is slow

The first run installs an isolated `node_modules` into
`.effective/node_modules`. Expect 1–5 minutes depending on dep tree
size. Subsequent runs reuse the install.

### `toolchain.coverage-non-decreasing` is currently coarse

It fails on `any-output`, not against a recorded baseline (the
engine doesn't yet track coverage history). Two reasonable
mitigations:

1. Disable the rule and run coverage separately in your existing CI:
   ```ts
   disable: {
     'toolchain.coverage-non-decreasing':
       'Baseline tracking pending; coverage thresholds enforced by vitest config.',
   }
   ```
2. Configure your coverage script to exit non-zero only on a real
   regression (e.g., enforce thresholds in `vitest.config.ts`); the
   rule then fires only when those thresholds drop.

Choose (1) for fastest path; choose (2) if you want effective.verify
to be the single gate.

### Stubbed catalogue rules are silent

Several catalogue rules are registered with stub check functions
(see README §Status). They appear in `prepare()` output (workers
read the guidance) and `kickBack()` cites them if findings emerge
later, but `verify()` won't flag violations until a real check
lands. This is intentional — the prompt projection ships value even
when detection hasn't caught up.

## What this config looks like running

After init, the first verify:

```bash
$ npx effective verify --against main
# ...installs into .effective/node_modules, ~1-5 min the first time
Verdict: ✅ PASS
Findings: 0 total — 0 CRITICAL, 0 HIGH, 0 MED, 0 LOW
No findings.
```

A diff that introduces a violation surfaces it with rule id, location,
and an actionable message. Example for an unannotated `.skip`:

```
Verdict: ❌ FAIL
Findings: 1 total — 1 CRITICAL, 0 HIGH, 0 MED, 0 LOW

⛔ CRITICAL  no-disabled-tests-without-exception  @  test/auth.test.ts:42:3
    Disabled test (.skip) without an exception-id annotation. Either
    fix the test, or register an exception in the config's
    `exceptions` field and cite its id in a comment above or beside
    the disable.
    evidence: it.skip('rejects invalid credentials', () => {
```
