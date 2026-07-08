# Usage

> **Who this is for.** You've decided to adopt the package and want to know
> how to wire it up. This document covers configuration, scope authoring,
> exception registry maintenance, CI integration, and gradual adoption on
> existing codebases.
>
> If you want to know **why** the package is shaped the way it is, see
> [DESIGN.md](./DESIGN.md). If you want a fast pitch, see [README.md](./README.md).

---

## Table of contents

- [Getting started](#getting-started)
  - [Installation](#installation)
  - [Running init](#running-init)
  - [Your first verify](#your-first-verify)
- [Configuration](#configuration)
  - [The effective.config.ts file](#the-effectiveconfigts-file)
  - [Extending presets](#extending-presets)
  - [Disabling rules](#disabling-rules)
  - [Overriding rule severity](#overriding-rule-severity)
  - [Toolchain config](#toolchain-config)
  - [Custom rules](#custom-rules)
  - [Custom roles](#custom-roles)
- [Scope authoring](#scope-authoring)
  - [The required fields](#the-required-fields)
  - [Editable paths](#editable-paths)
  - [Role selection](#role-selection)
  - [Expectations](#expectations)
  - [Linking to specs](#linking-to-specs)
- [The exceptions registry](#the-exceptions-registry)
  - [The exceptions field](#the-exceptions-field)
  - [Citing exceptions in code](#citing-exceptions-in-code)
  - [Retirement and lifecycle](#retirement-and-lifecycle)
- [Integration patterns](#integration-patterns)
  - [With Claude Code](#with-claude-code)
  - [With a custom agent loop](#with-a-custom-agent-loop)
  - [As a pre-push hook](#as-a-pre-push-hook)
  - [In CI](#in-ci)
  - [On an existing PR](#on-an-existing-pr)
- [Adopting on an existing codebase](#adopting-on-an-existing-codebase)
  - [The gradual adoption path](#the-gradual-adoption-path)
  - [What the audit walks (gitignore, carve-outs)](#what-the-audit-walks-gitignore-carve-outs)
  - [Surveying existing escape hatches](#surveying-existing-escape-hatches)
  - [Promoting overrides back to CRITICAL over time](#promoting-overrides-back-to-critical-over-time)
- [Understanding `prepare()` output](#understanding-prepare-output)
  - [What gets added to your prompt](#what-gets-added-to-your-prompt)
  - [The Pre-Success Checklist](#the-pre-success-checklist)
  - [Controlling the checklist via scope](#controlling-the-checklist-via-scope)
- [Working with findings](#working-with-findings)
  - [Finding shape](#finding-shape)
  - [Filtering and grouping](#filtering-and-grouping)
  - [Building kick-back prompts](#building-kick-back-prompts)
- [Common patterns](#common-patterns)
  - [Per-role workflows](#per-role-workflows)
  - [Multi-attempt loops](#multi-attempt-loops)
  - [Pre-commit verification](#pre-commit-verification)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

---

## Getting started

### Installation

```bash
npm install @oftomorrow/effective
# or
pnpm add @oftomorrow/effective
# or
yarn add @oftomorrow/effective
```

Peer dependencies: `zod >= 3.x`. No other runtime dependencies.

### Running init

```bash
npx effective init
```

The init command:

1. Reads your `package.json` scripts and lockfile.
2. Detects your package manager (npm / pnpm / yarn) from the lockfile.
3. Generates a starter `effective.config.{ts,js}` at the repo root —
   `.ts` if a `tsconfig.json` exists, `.js` otherwise. The generated
   config includes the exceptions registry inline under an
   `exceptions:` field with `...seeds.builtInExceptions` spread.
4. Adds `.effective/` to your `.gitignore` (engine workspace only —
   no user-authored files live there).

The first `effective verify` after init does the install into
`.effective/node_modules` (1–5 minutes); subsequent runs reuse it.

What it doesn't do:

- Doesn't auto-detect every detail. Custom roles, toolchain commands beyond
  the obvious four, and project-specific exceptions are left for you to
  fill in.
- Doesn't make decisions about severity overrides. You see what would have
  failed and decide what to override or fix.

Review the generated `effective.config.ts` before committing. The comments
in it explain each section.

### Your first verify

```ts
import { verify } from '@oftomorrow/effective';
import { config } from './effective.config';

const result = await verify({
  scope: {
    goal: 'Smoke test on current state',
    editable: ['**/*'], // wide open for this first check
    role: 'free-form',
  },
  config,
  source: {
    kind: 'git',
    repo: '.',
    work: 'HEAD',
    baseline: 'HEAD~1', // verify the last commit
  },
});

console.log(`Verdict: ${result.verdict}`);
for (const finding of result.findings) {
  console.log(`[${finding.severity}] ${finding.ruleId}: ${finding.message}`);
  if (finding.location) {
    console.log(`  at ${finding.location.file}:${finding.location.line}`);
  }
}
```

On a new project with the recommended preset, the first run will likely
surface findings. That's normal — see [Adopting on an existing
codebase](#adopting-on-an-existing-codebase) for the gradual-adoption path.

---

## Configuration

### The effective.config.ts file

Lives at the repo root. Looks like this:

```ts
// effective.config.ts
import { defineConfig, presets, rule } from '@oftomorrow/effective';

export const config = defineConfig({
  extends: [presets.recommended],

  // Disable rules that don't fit your project
  disable: {
    'spec.assertion-narrowed':
      'We use property-based tests; this rule produces false positives here.',
  },

  // Downgrade severity for rules you can't satisfy yet
  override: {
    'exceptions-must-cite-justification': {
      severity: 'HIGH',
      rationale:
        'Existing escape hatches lack refs; warn now, retrofit gradually.',
    },
  },

  // Add custom rules
  rules: [
    rule.forbidPattern(/TODO\(@nobody\)/, {
      in: 'src/**',
      severity: 'HIGH',
      message: 'TODO without an owner; assign to a person or remove.',
    }),
  ],

  // Custom roles (in addition to test-writer, code-writer, reviewer, free-form)
  roles: {
    'migration-writer': {
      defaultEditable: ['migrations/**', 'test/migrations/**'],
      expectations: {
        newMigrationExists: true,
        seedingTestForMigrationExists: true,
        existingTestsPass: true,
      },
    },
  },

  // How to run your toolchain
  toolchain: {
    lint: 'pnpm lint:ci --format json',
    typecheck: 'pnpm typecheck',
    test: 'pnpm test --reporter json',
    coverage: 'pnpm test:coverage --reporter json',
  },

  meta: {
    name: 'my-project',
    version: '1.0.0',
  },
});
```

### Extending presets

Presets are pre-composed constitutions. The recommended preset includes
the full catalogue:

```ts
extends: [presets.recommended],
```

You can extend multiple presets; later wins on conflicts:

```ts
extends: [presets.recommended, presets.typescriptStrict],
```

Project-specific rules in your config win over preset rules.

### Disabling rules

`disable` turns a rule off entirely. The rule's prompt projection no longer
flows into `prepare()`'s output, and `verify()` no longer checks for the
rule. Both projections go silent.

```ts
disable: {
  'spec.assertion-narrowed': 'Property-based tests produce different patterns.',
  'no-disabled-tests-without-exception': 'Vitest plugin we use handles this differently.',
},
```

Rationale is required. The disable is a deviation from the standard; the
deviation must be justified.

Use `disable` for rules that _don't fit your project at all_. If the rule
_does_ fit but you can't satisfy it yet, use `override` instead.

### Overriding rule severity

`override` keeps the rule active but changes its severity:

```ts
override: {
  'exceptions-must-cite-justification': {
    severity: 'HIGH',
    rationale: 'Existing escape hatches lack refs; warn now, retrofit gradually.',
  },
  'spec.test-names-land-verbatim': {
    severity: 'MED',
    rationale: 'Tests cite the spec but use renamed Given-When-Then format.',
  },
},
```

Severity levels: `CRITICAL`, `HIGH`, `MED`, `LOW`. Only `CRITICAL` fails the
verdict. Anything else surfaces as a finding but doesn't fail.

Use `override` for rules that fit your project but can't be fully satisfied
yet. The findings are still visible (so you see what would have failed)
without blocking.

### Toolchain config

Tell the package how to run your existing quality tools:

```ts
toolchain: {
  lint: 'pnpm lint:ci --format json',
  typecheck: 'pnpm typecheck',
  test: 'pnpm test --reporter json',
  coverage: 'pnpm test:coverage --reporter json',
},
```

The commands run against the isolated worktree at `.effective/work`. Each
command's output is parsed and converted to findings.

If a tool's output format isn't auto-detected, hint via `parsers`:

```ts
toolchain: {
  lint: 'pnpm lint:ci --format json',
  parsers: {
    lint: 'eslint',
  },
},
```

Supported parsers: `eslint`, `biome`, `oxlint`, `tsc`, `vitest`, `jest`,
`node-test`, `v8`, `istanbul`.

For a tool with non-standard output, use `custom` and provide a callback
in code:

```ts
toolchain: {
  custom: {
    'my-checker': 'pnpm my-custom-check --json',
  },
  parsers: {
    'my-checker': 'custom',
  },
},
```

Then register the parser function:

```ts
import { registerParser } from '@oftomorrow/effective';

registerParser('my-checker', async ({ stdout, exitCode }) => {
  const parsed = JSON.parse(stdout);
  return parsed.issues.map((issue) => ({
    ruleId: `my-checker.${issue.code}`,
    severity: issue.level === 'error' ? 'CRITICAL' : 'MED',
    category: 'custom',
    location: { file: issue.file, line: issue.line },
    evidence: issue.snippet,
    message: issue.message,
    source: { kind: 'toolchain', tool: 'custom', nativeRuleId: issue.code },
  }));
});
```

### Custom rules

Define project-specific rules in your config:

```ts
rules: [
  rule.forbidPattern(/console\.log/, {
    in: 'src/**',
    notIn: 'src/**/__tests__/**',
    severity: 'CRITICAL',
    message: 'console.log in production code; use the logger instead.',
  }),

  rule.requirePattern(/import .* from 'zod'/, {
    in: 'src/schemas/**',
    severity: 'HIGH',
    message: 'Schema files should import zod.',
  }),

  rule.custom({
    id: 'no-default-exports-in-services',
    category: 'architecture',
    severity: 'CRITICAL',
    description: 'Service modules should use named exports.',
    checkRef: 'noDefaultExportsInServices',
    prompt: {
      summary: 'Service modules use named exports, not default exports.',
      guidance: 'In services/**, avoid `export default`. Use named exports so consumers see what they\'re importing.',
    },
  }),
],
```

For `custom` rules, the `checkRef` points to a function you export from
your config or a sibling file. The function receives the diff context and
returns `Finding[]`.

### Custom roles

Define roles specific to your workflow:

```ts
roles: {
  'migration-writer': {
    defaultEditable: ['migrations/**', 'test/migrations/**'],
    expectations: {
      newMigrationExists: true,
      seedingTestForMigrationExists: true,
      existingTestsPass: true,
    },
  },
  'docs-writer': {
    defaultEditable: ['docs/**', '**/*.md'],
    expectations: {
      lintCleanForEditableFiles: true,
    },
  },
},
```

Scope objects that reference these roles get the expectations applied:

```ts
const scope = {
  goal: 'Write a migration for the new schema',
  role: 'migration-writer',
  // editable not specified — falls back to role's defaultEditable
};
```

---

## Scope authoring

### The required fields

Every scope needs at minimum:

```ts
{
  goal: 'Human-readable description of what is being done',
  editable: ['glob/**', 'patterns/**'],
}
```

`role` defaults to `'free-form'` if omitted. `expectations` is optional;
when set, it overrides role defaults.

### Editable paths

Editable paths use gitignore-style globs with negation:

```ts
editable: [
  'app/**', // include everything under app/
  'lib/**', // include everything under lib/
  '!app/legacy/**', // exclude app/legacy/
  '!**/*.generated.*', // exclude generated files anywhere
];
```

The lane rule (active by default) enforces that no file outside this list
is modified in the diff. Both additions and deletions count.

Tips:

- Be specific when possible. `editable: ['app/api/signals/**']` is better
  than `editable: ['app/**']` because it catches scope creep.
- Always include test paths if the work involves tests:
  `['app/api/signals/**', 'test/api/signals/**']`.
- For the test-writer role, often you want only the test path:
  `['test/api/signals/**', 'fixtures/**']`.

### Role selection

Pick the role that matches the work:

```ts
role: 'test-writer'; // writing tests for unimplemented behavior
role: 'code-writer'; // implementing behavior to pass tests
role: 'reviewer'; // auditing diff; read-only
role: 'free-form'; // unscoped work; full constitution applies
```

Or a custom role from your config:

```ts
role: 'migration-writer';
role: 'docs-writer';
```

### Expectations

Most of the time you don't need to set expectations — the role defaults
cover the common case. Override when your specific work has unusual
needs:

```ts
{
  role: 'code-writer',
  expectations: {
    // Override: this code-writer task has no production tests yet
    coverageNonDecreasing: false,
    // The rest fall through to code-writer defaults
  },
}
```

Available expectations (all optional booleans):

- `newTestsExist`, `newTestsFail`, `existingTestsPass`, `allTestsPass`
- `lintClean`, `lintCleanForEditableFiles`, `typecheckClean`,
  `coverageNonDecreasing`
- `noLaneViolations`, `noUntrackedScopeExpansion`, `noParallelSystemsAdded`
- `noNewExceptionsWithoutJustification`
- `specdTestNamesLandVerbatim`, `assertionsMatchSpec`

### Linking to specs

If the work has a written spec, link to it:

```ts
{
  goal: '...',
  spec: 'docs/specs/rate-limiter.md',
  expectations: {
    specdTestNamesLandVerbatim: true,
  },
}
```

The spec-discipline rules will then verify that test names declared in
the spec actually land in committed test files.

---

## The exceptions registry

### The exceptions field

The exceptions registry lives inline on the Constitution under
`exceptions` in `effective.config.{ts,js}`. Generated by `init`:

```ts
// effective.config.ts
import { defineConfig, seeds } from '@oftomorrow/effective';

export default defineConfig({
  extends: ['recommended'],

  exceptions: {
    // Built-in exception categories: CLI fatal-exit, library drift defense,
    // type narrowing of impossible, TTY-bound paths, Zod internal
    // introspection, etc.
    ...seeds.builtInExceptions,

    // Project-specific exceptions
    'our-postgres-driver-quirk': {
      id: 'our-postgres-driver-quirk',
      category: 'external-library-drift-defense',
      mechanism: 'ts-expect-error',
      context:
        'pg@8.x leaves stale connections in the pool under specific error shapes',
      retirementCondition: 'Resolved when we migrate to pg@9 or postgres.js',
      addedDate: '2026-04-15',
      status: 'active',
    },

    'tracing-must-survive-restart': {
      id: 'tracing-must-survive-restart',
      category: 'race-condition-defense',
      mechanism: 'c8-ignore',
      context:
        'Distributed tracing spans need to survive process restart. The defensive read handles partial-state spans.',
      retirementCondition: 'When OTLP-collector enables persistent buffers.',
      addedDate: '2026-04-20',
      status: 'active',
    },
  },
});
```

`defineExceptions()` is still exported for users who prefer to factor
the registry into a separate file and spread it back into `exceptions`.

Each exception entry needs:

- `category` — built-in category or project-specific string
- `context` — why this exception exists, non-empty
- `retirementCondition` — what would let this exception retire
- `addedDate` — ISO date

The fields are required because exceptions are sanctioned debt, and
sanctioned debt needs to be traceable.

### Citing exceptions in code

Every escape hatch comment cites its exception ID:

```ts
/* c8 ignore start -- exception-id: cli-fatal-exit -- CLI dispatch branch */
if (require.main === module) {
  main().then((rc) => process.exit(rc));
}
/* c8 ignore stop */

// @ts-expect-error -- our-postgres-driver-quirk: pg@8.x stale-connection workaround
const conn = await poolGetConnection();

// eslint-disable-next-line no-await-in-loop -- exception-id: sequential-by-design-await -- per-task dispatch ordering
for (const task of tasks) {
  await dispatch(task);
}
```

Format: `-- <exception-id>: <inline justification>`

The `exceptions-must-cite-justification` rule (active in the recommended
preset) checks every escape hatch in the diff and validates:

1. The exception ID resolves to an active entry in the registry.
2. The inline justification is non-empty.

Unknown IDs fail. Empty justifications fail. Disabled or retired exception
IDs fail.

### Retirement and lifecycle

When a retirement condition is met, update the exception's status:

```ts
'our-postgres-driver-quirk': {
  category: 'external-library-drift-defense',
  context: '...',
  retirementCondition: 'Resolved when we migrate to pg@9 or postgres.js',
  addedDate: '2026-04-15',
  status: 'retired',
  retiredNote: 'Migrated to postgres.js on 2026-08-12.',
},
```

The next `verify` run will flag all escape hatches that cite the retired
ID. Either remove those hatches or migrate them to a different exception.

---

## Integration patterns

### With Claude Code

```ts
import { prepare, verify, kickBack } from '@oftomorrow/effective';
import { config } from './effective.config';
import { spawn } from 'child_process';

async function runClaudeCode(prompt: string, worktree: string) {
  const args = [
    '--dangerously-skip-permissions',
    '--output-format',
    'stream-json',
    '-p',
    prompt,
  ];
  await new Promise((resolve, reject) => {
    const child = spawn('claude', args, { cwd: worktree, stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? resolve(null) : reject(code)));
  });
}

const scope = {
  goal: 'Add rate limiter to /api/signals',
  role: 'code-writer',
  editable: ['app/api/signals/**', 'lib/rate-limit/**', 'test/**'],
};

let prepared = prepare({
  scope,
  config,
  original:
    'Add rate limiting to the signals endpoint, max 100 requests per minute per IP.',
});

for (let attempt = 1; attempt <= 5; attempt++) {
  await runClaudeCode(prepared.prompt, '.effective/work');

  const { verdict, findings } = await verify({
    ...prepared,
    source: {
      kind: 'git',
      repo: '.',
      work: 'feature/rate-limit',
      baseline: 'main',
    },
  });

  if (verdict === 'pass') {
    console.log(`Done in ${attempt} attempts.`);
    break;
  }

  prepared = {
    ...prepared,
    prompt: kickBack({ findings, previousPrompt: prepared.prompt }),
  };
}
```

### With a custom agent loop

The same pattern works with any model client:

```ts
import { prepare, verify, kickBack } from '@oftomorrow/effective';
import { config } from './effective.config';
import Anthropic from '@anthropic-ai/sdk';
import { writeFilesFromDiff } from './my-file-writer';

const client = new Anthropic();

async function callModel(prompt: string): Promise<string> {
  const message = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }],
  });
  return message.content[0].type === 'text' ? message.content[0].text : '';
}

let prepared = prepare({ scope, config, original: userPrompt });

for (let attempt = 1; attempt <= 5; attempt++) {
  const response = await callModel(prepared.prompt);
  await writeFilesFromDiff(response, '.effective/work');

  const { verdict, findings } = await verify({
    ...prepared,
    source: { kind: 'git', repo: '.', work: 'feature-x', baseline: 'main' },
  });

  if (verdict === 'pass') break;
  prepared = {
    ...prepared,
    prompt: kickBack({ findings, previousPrompt: prepared.prompt }),
  };
}
```

### As a pre-push hook

```bash
# .husky/pre-push
#!/usr/bin/env sh
npx effective verify --against main
```

The CLI form runs `verify` against the current branch with `main` as
baseline, prints findings to stderr, and exits non-zero on `fail` verdict.

### In CI

```yaml
# .github/workflows/verify.yml
- name: Verify against constitution
  run: npx effective verify --against ${{ github.base_ref }}
```

The CLI auto-detects PR context from common CI env vars. For non-PR runs:

```yaml
- name: Verify HEAD
  run: npx effective verify --work HEAD --baseline HEAD~1
```

### On an existing PR

For ad-hoc verification of a PR branch you don't have checked out:

```bash
git fetch origin pull/123/head:pr-123
npx effective verify --work pr-123 --baseline main
```

The package creates an isolated worktree of `pr-123`, runs the toolchain
there, and returns findings without touching your working tree.

### Verify options for runners and iterative debugging

Beyond the basic `verify({ scope, config, source })` call, the
programmatic API and CLI both surface several options designed for
two specific shapes of caller: long-running agent runners (per-step
inline verification) and adopters iterating on the constitution
itself (fast worktree reuse).

**`skipCategories` / `skipRules`** — skip rules during a verify
pass. The programmatic-API mirror of `audit`'s
`--include-toolchain` opt-in, in reverse:

```ts
const result = await verify({
  ...prepared,
  source: { kind: 'inline', changedFiles },
  skipCategories: ['toolchain'],
  // OR: skipRules: ['toolchain.lint-clean', 'toolchain.tests-pass'],
});
```

The primary use case is inline-source callers in agent runners
doing per-step gating. Spawning lint/typecheck/test on every step
is slow (1–5s per run) and wrong-by-design at intermediate commits
(a test-writer's commit is supposed to fail `tests-pass` because
implementation lands later in the chain). Skip toolchain at
per-step gates; let toolchain rules fire at PR time via
`effective verify --against main` against the committed branch.

Skipped rules show up in `result.skipped` with reason
`'category-excluded'` or `'rule-excluded'`, parallel to audit's
existing skipped-rules output. The shape is shared (`SkippedRule`).

The CLI's `verify --against` path runs every applicable rule by
default — `skipCategories` is programmatic-API-only. Callers
wiring the CLI into CI should use `disable` in their
`effective.config.ts` if they want a permanent opt-out rather than
a per-invocation skip.

**`keepWorktree` — control `.effective/work` cleanup.** Default
`'on-pass'`: keep the worktree if the run produced any CRITICAL
finding so you can `cd .effective/work && pnpm typecheck` and see
the real error. `'always'`: keep regardless of verdict (useful for
iterative debugging). `'never'`: always remove (appropriate for
ephemeral CI runners).

```ts
const result = await verify({ ...prepared, source, keepWorktree: 'always' });
```

CLI:

```bash
npx effective verify --against main --keep-worktree         # =always
npx effective verify --against main --keep-worktree=on-pass # default
npx effective verify --against main --keep-worktree=never   # CI
npx effective verify --against main --no-keep-worktree      # =never
```

**`skipInstall` — skip the worktree's lockfile install.**
`prepareWorktree` runs `pnpm install --frozen-lockfile` / `npm ci`
/ `yarn install --immutable` in the worktree after `git worktree
add` — this is what populates per-package `node_modules` so
workspace projects' `tsc` and `vitest` find their binaries.
Adopters who've populated `node_modules` some other way (e.g.,
mounted from a previous run via `--keep-worktree=always`) can skip
it:

```ts
const result = await verify({ ...prepared, source, skipInstall: true });
```

CLI: `--skip-install`. The combination
`--keep-worktree=always --skip-install` is the fast-iteration
default for working on the constitution itself.

### Programmatic vs. CLI surface

The CLI is the cleanest path for CI integration and ad-hoc
adopters; the programmatic API is for callers building runners,
gates, or custom tooling. Both share the same engine; both consume
the same `effective.config.{ts,js}`. Switching between them is
zero-cost — your config doesn't change.

---

## Adopting on an existing codebase

### The gradual adoption path

Step 1: install and run `init`.

```bash
npm install @oftomorrow/effective
npx effective init
```

Step 2: run `verify` against your current state to see what would have
failed.

```bash
npx effective verify --work HEAD --baseline HEAD~10
```

Most existing codebases will see findings — particularly for the
`exceptions-must-cite-justification` rule (because no escape hatches have
refs yet) and for any rule that depends on conventions you haven't adopted.

Step 3: triage the findings.

- For rules that _don't fit your project_: add them to `disable` with rationale.
- For rules that _fit but can't be satisfied yet_: add them to `override`
  with a downgraded severity (`HIGH` or `MED`) and rationale.
- For rules you _want to enforce going forward but not retroactively_:
  override to `HIGH`, then promote back to `CRITICAL` once retroactive
  fixes are done.

Step 4: commit your `effective.config.{ts,js}` (which now holds the
inline exceptions registry too).

Step 5: integrate `verify` into your dev loop — pre-push hook, CI, agent
loop. New work has to satisfy the rules from this point forward.

Step 6: incrementally retire overrides as the codebase catches up.

### What the audit walks (gitignore, carve-outs)

`effective audit` (and `audit-escapes`, which shares the same file set)
honors your `.gitignore` by default: files **git itself would ignore** —
untracked _and_ matched by an ignore rule, including nested
`.gitignore` files — are skipped. This keeps the audit's verdict
identical between a workstation (where gitignored local tooling sits on
disk) and CI (where it never exists).

Tracked files are **always** scanned, even when an ignore pattern
matches them — adding a `.gitignore` entry after the fact can never
hide committed code from the audit. Outside a git work tree the walk is
unfiltered.

Both knobs live under the config's `audit` field:

```ts
export default defineConfig({
  extends: ['recommended'],
  audit: {
    // Restore the walk-everything-on-disk behavior:
    respectGitignore: false,
    // Carve tracked, non-gitignored paths out of the audit walk
    // (picomatch globs against repo-relative paths). Use sparingly —
    // every entry is code the audit stops vouching for:
    exclude: ['vendor/**'],
  },
});
```

### Surveying existing escape hatches

Before you populate the `exceptions` field in your config, see what's
already in the codebase:

```bash
npx effective audit-escapes
```

Output:

```
Found 247 escape hatches without exception refs:
  src/cli/dispatch.ts:42      /* c8 ignore */
  src/sdk-wrapper.ts:128      // @ts-expect-error
  src/api/handler.ts:67       // eslint-disable-next-line no-await-in-loop
  ...

Suggested categorization:
  CLI fatal-exit (likely):           18 sites
  Sequential-by-design await:        47 sites
  Type narrowing of impossible:      82 sites
  Zod internal introspection:         3 sites
  External library drift defense:    51 sites
  Uncategorized:                     46 sites
```

The audit doesn't auto-add anything. It surfaces the patterns so you can
decide which exceptions to register and which sites should actually have
the disable removed.

### Promoting overrides back to CRITICAL over time

The override block in your config is a roadmap. As you address each
overridden rule:

```ts
// Phase 1: just adopted
override: {
  'exceptions-must-cite-justification': {
    severity: 'HIGH',
    rationale: 'Existing escape hatches lack refs; warn now, retrofit gradually.',
  },
  'spec.test-names-land-verbatim': {
    severity: 'HIGH',
    rationale: 'Existing tests use Given-When-Then naming.',
  },
},

// Phase 2: catalogued existing escape hatches
override: {
  // exceptions-must-cite-justification removed; back to CRITICAL
  'spec.test-names-land-verbatim': {
    severity: 'HIGH',
    rationale: 'Existing tests use Given-When-Then naming.',
  },
},

// Phase 3: aligned tests with spec convention
override: {
  // both removed; full strict
},
```

Each phase is its own PR. Each phase removes an override and ratchets the
constitution closer to strict.

---

## Understanding `prepare()` output

When you call `prepare({ scope, config, original })`, you get back a
`PreparedAgent` bundle:

```ts
{
  prompt: string; // the augmented prompt — what you dispatch
  scope: Scope; // the scope you passed in, returned for type-safe spread
  config: Constitution; // the constitution you passed in, returned for type-safe spread
  mode: 'full' | 'concise'; // which projection was rendered
}
```

The `prompt` is your original prompt augmented with three things, in order:

1. The scope context (goal, role, editable paths, expectations)
2. The relevant rule guidance for the scope
3. The Pre-Success Checklist — the items the worker should verify before
   marking the work done (full mode only; concise mode omits the checklist)

The output is plain text designed to be passed verbatim to the model. You
don't need to parse or post-process it. The structure is consistent enough
that workers learn to read it the same way every time.

The `scope` and `config` fields are returned so the same values can flow
into `verify()` via spread: `await verify({ ...prepared, source })`. This
keeps the prepare → verify roundtrip honest at the type level — the
scope and config the worker was prepared against are exactly the ones
verify evaluates them by. Without the bundle, the two calls were
independent and drift was caller-hygiene.

### `mode: 'full' | 'concise'`

Default is `'full'`. Pass `mode: 'concise'` to emit a much shorter
projection — one-line summaries of applicable rules with no guidance,
no examples, no checklist. Typical size against the recommended preset:
~3–5 KB vs. ~15–30 KB for full mode.

Use concise mode when:

- You're calling `prepare()` at high frequency (per agent step in a
  long-running runner)
- The `verify` + `kickBack` loop is your safety net — kickBack already
  re-emits a tripped rule's full guidance, so the agent learns
  specifics on demand rather than memorizing the catalogue up front
- The token bill matters at scale

Use full mode (the default) when:

- An agent is new to a role and needs the catalogue up front
- You're in retrospective dialog walking through what fired and why
- Dispatch is infrequent and the cost is irrelevant

See `docs/examples/agent-loop-integration.md` for the canonical wiring.

### What gets added to your prompt

The shape, roughly:

```
[Your original prompt]

## Scope
Goal: <scope.goal>
Role: <scope.role>
Editable paths:
- app/api/signals/**
- lib/rate-limit/**
Expectations:
- All tests pass
- Lint clean for editable files
- Coverage non-decreasing

## Rules in scope
[Active rule guidance, grouped by category. Each rule's `PromptProjection.guidance`
appears here. Rules filtered out by scope role/editable paths are omitted.]

## Pre-Success Checklist
[Bulleted checklist; see below.]
```

The rule guidance section is the densest part. Each active rule contributes
a paragraph or two describing what the rule expects and what would violate
it. Rules with examples in their `PromptProjection.examples` field include
those inline.

### The Pre-Success Checklist

The checklist is a bulleted summary of what the worker should verify before
declaring the work done. It's grouped into sections matching the
constitution's structure:

```
## Pre-Success Checklist

Before marking Success, verify each item:

**Completion claims**
- Work landed: code changes are in the worktree and compile cleanly
- Verified end-to-end: every load-bearing claim exercised against real
  execution, not inferred

**Test rigor**
- Spec'd test names land verbatim in committed test files
- Tests would fail if you deleted the function body
- All branches covered

**Architectural invariants**
- New code is wired to the runtime

**Honest reporting**
- Status line matches reality
```

The checklist is _derived from active rules_, not authored separately. Each
checklist item corresponds to one or more rules that would emit findings if
the item failed. This means the checklist and the verifier always agree:
anything the checklist asks the worker to verify is something `verify()`
will actually check.

**The checklist is filtered to the scope's role and editable paths.** A
test-writer working on `test/api/**` doesn't see items about data-discipline
rules that only fire on `app/api/**` writes; a docs-writer doesn't see test
rigor items. The filter signals (in order of precedence):

1. **Role.** Rules declare `appliesToRoles`; rules whose roles don't include
   the scope's role are excluded.
2. **Editable paths.** Pattern rules with an `inGlob` field are excluded if
   their glob doesn't intersect `scope.editable`.
3. **Expectations.** If `scope.expectations` explicitly opts in or out of a
   category (e.g., `coverageNonDecreasing: false`), the corresponding rules
   are demoted or excluded.
4. **Manual override.** Rules pinned via `scope.relatedRules` are always
   included.

**Fallback for low-confidence filtering:** if filtering yields fewer than 5
items, the full checklist appears with a note that filtering wasn't
confident. Better to be slightly verbose than to silently drop a load-bearing
item.

### Controlling the checklist via scope

You can shape the checklist by adjusting the scope you pass to `prepare()`:

```ts
// Narrower scope = tighter checklist
const scope = {
  goal: 'Add rate limiter unit tests',
  role: 'test-writer',
  editable: ['test/api/rate-limit/**'], // tests only
  expectations: {
    newTestsExist: true,
    newTestsFail: true, // test-writer should produce failing tests
    existingTestsPass: true,
  },
};

// Wider scope = broader checklist
const scope = {
  goal: 'Implement rate limiter end-to-end',
  role: 'free-form',
  editable: ['app/**', 'lib/**', 'test/**'],
  // expectations omitted; falls through to defaults
};
```

If your work spans multiple roles (you're writing both code and tests in
the same pass), use `'free-form'` — the full constitution applies with no
role-specific filtering.

If a specific rule matters for your work even though filtering would
exclude it, pin it via `relatedRules`:

```ts
{
  goal: '...',
  role: 'code-writer',
  editable: ['app/api/signals/**'],
  relatedRules: ['no-disabled-tests-without-exception'],
  // Even though this is code-writer and editable doesn't include test/**,
  // the disabled-tests rule still appears in the checklist.
}
```

---

## Working with findings

### Finding shape

Every finding looks like:

```ts
{
  ruleId: 'no-disabled-tests-without-exception',
  severity: 'CRITICAL',
  category: 'tests',
  location: {
    file: 'test/auth/login.test.ts',
    line: 47,
  },
  evidence: 'it.skip(\'rejects invalid credentials\', async () => {',
  message: '.skip on a test without an exception ref. Add a tracked exception to the config\'s `exceptions` field and cite its ID in the comment, or fix the underlying test failure.',
  source: {
    kind: 'rule',
    ruleId: 'no-disabled-tests-without-exception',
  },
}
```

The `verify` result includes a `summary` for quick counts:

```ts
{
  verdict: 'fail',
  findings: [/* ... */],
  summary: {
    block: 3,
    high: 7,
    low: 12,
    nit: 4,
    total: 26,
  },
}
```

### Filtering and grouping

Findings are plain objects; filter and group however you want:

```ts
const blockers = findings.filter((f) => f.severity === 'CRITICAL');
const byCategory = Object.groupBy(findings, (f) => f.category);
const fromRules = findings.filter((f) => f.source.kind === 'rule');
const fromToolchain = findings.filter((f) => f.source.kind === 'toolchain');
```

For dashboards:

```ts
const byFile = Object.groupBy(
  findings.filter((f) => f.location),
  (f) => f.location!.file,
);
for (const [file, fileFindings] of Object.entries(byFile)) {
  console.log(`${file}: ${fileFindings.length} findings`);
}
```

### Building kick-back prompts

`kickBack` produces a focused follow-up prompt:

```ts
const nextPrompt = kickBack({
  findings,
  previousPrompt: prompt,
  output: agentOutput, // optional; the model's last response
});
```

The next prompt explicitly:

- Cites the failed rules with IDs and severities
- Includes evidence from each finding
- States what would satisfy the rule
- Rules out shortcuts (e.g., "coverage dropped on X" → "add a test for X,"
  not "consider adjusting the coverage threshold")

You can also build kick-back prompts manually if you have specific needs:

```ts
const summary = findings
  .filter((f) => f.severity === 'CRITICAL')
  .map(
    (f) =>
      `- [${f.ruleId}] at ${f.location?.file}:${f.location?.line}: ${f.message}`,
  )
  .join('\n');

const manualPrompt = `${previousPrompt}\n\nThe following must be fixed:\n${summary}`;
```

---

## Common patterns

### Per-role workflows

For multi-step workflows where different roles handle different parts:

```ts
// Step 1: test-writer
const testScope = {
  goal: 'Write failing tests for rate limiter',
  role: 'test-writer',
  editable: ['test/rate-limit/**'],
};
const testPrompt = prepare({ scope: testScope, config, original: userPrompt });
await runStep(testPrompt);
const testResult = await verify({ scope: testScope, config, source });
if (testResult.verdict !== 'pass') {
  // Kick back to test-writer step
}

// Step 2: code-writer (only after step 1 passes)
const codeScope = {
  goal: 'Implement rate limiter to pass tests',
  role: 'code-writer',
  editable: ['app/api/signals/**', 'lib/rate-limit/**'], // not test/
};
const codePrompt = prepare({ scope: codeScope, config, original: '' });
await runStep(codePrompt);
const codeResult = await verify({ scope: codeScope, config, source });
```

The lane rule enforces that the test-writer step doesn't touch app code,
and the code-writer step doesn't touch tests. Each step's prompt and
verification are role-aware.

### Multi-attempt loops

The README's lede shows the basic loop. Real loops typically add:

- Max-attempts budget (5 is a common starting point)
- Crash handling (subprocess failures, model timeouts)
- Different role-routing on failure (test-writer kicks back to test-writer;
  code-writer kicks back to test-writer when the failure is "tests failed,"
  to code-writer when the failure is "implementation broken")

The package doesn't ship a runner that handles all this — see
[DESIGN.md](./DESIGN.md#why-not-a-runner) for why. Your runner is your runner.

### Pre-commit verification

Run `verify` in a pre-commit hook for fast local feedback:

```bash
# .husky/pre-commit
npx effective verify --staged
```

`--staged` mode verifies only the staged changes against `HEAD`, runs only
the rules that apply to file-level changes (skips coverage, since coverage
needs a real test run), and exits quickly. Useful for "did I just add a
console.log" type catches.

---

## Troubleshooting

**`.effective/node_modules` is huge.**

That's expected — it's a full install of your project's dependencies. It
persists between runs to make `verify` fast. If you want to reclaim disk
space:

```bash
rm -rf .effective/node_modules
```

The next `verify` will reinstall.

**`verify` is slow on first run.**

First run installs `node_modules` into `.effective/`. Subsequent runs reuse
it. If your project is large, expect 30s-2min on first run; 5-10s on
subsequent runs.

**Findings reference rule IDs I don't recognize.**

Look them up in the active catalogue:

```bash
npx effective rules --search <rule-id>
```

This shows the rule's prompt projection, severity, related catalogue
entries, and the principle it operationalizes.

**The lane rule keeps firing on files I expected to be in scope.**

Check your scope's `editable` patterns. Common mistakes:

- `editable: ['src/**']` doesn't include `test/**`. Add `'test/**'` if
  the work modifies tests.
- `editable: ['**/*.ts']` doesn't include `package.json` if you need to
  update deps. Add `'package.json'` explicitly.
- Negation must follow inclusion: `['src/**', '!src/legacy/**']` works;
  `['!src/legacy/**', 'src/**']` does not.

**A toolchain command isn't being run.**

Check your `toolchain` config. Each command runs only when the relevant
rule fires. If you've disabled the lint-must-be-clean rule, the lint
command doesn't run.

**I want to verify a branch I don't have checked out.**

```bash
git fetch origin some-branch:some-branch
npx effective verify --work some-branch --baseline main
```

The package creates an isolated worktree of `some-branch` and runs the
toolchain there without touching your working tree.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full flow.

In short:

- **New catalogue entries** need a signature, a why-it-happens explanation,
  a structural countermeasure, and at least one observed instance with
  citation.
- **New rules** must correspond to a catalogue entry, have both prompt and
  check projections, and ship with a fixture test.
- **New exception categories** need a recurring shape (not project-specific),
  a context explaining when it's valid, and a retirement condition.

The bar is high because the package's value is the catalogue. Every entry
becomes part of every consumer's verification. Quality over quantity.
