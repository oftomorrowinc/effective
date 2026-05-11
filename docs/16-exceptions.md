---
id: 01KQ1T3YVG9JRZWHFRX23MMJHS
short_id: D16
name: exceptions
status: active
---

# 16 — Exceptions

## Overview

An exception is an intentional, sanctioned carve-out from an otherwise-strict invariant — "this file is excluded from coverage," "this line is exempt from a type-strictness rule," "this migration is the one allowed to bypass the ULID policy." Exceptions are **not** drift, regressions, or "we'll fix it later" debt. They are things the team decided, on purpose, should be allowed.

This file is the registry of every such carve-out. Two properties matter:

1. **Every exception has a referable id** (`core-16.N`). Escape-hatch comments in code (`/* c8 ignore next */`, `@ts-expect-error`, `eslint-disable`) reference this id. CI enforces that every escape hatch has a valid ref.
2. **Every exception has a justification with names attached.** A reader should be able to tell _why_ the exception was made, when, and what conditions would retire it.

Signals are the raising-and-discussion layer; this decision file is the resolution layer. A signal that proposes "exempt X from Y" becomes either (a) a rejected signal if the proposal was wrong, or (b) a new slice here if the proposal was approved. Signals don't confer exception status — **only a slice in this file does**.

## Process for adding an exception

1. File a signal in `data/businesses/core/signals/` describing the drift you want to sanction and why.
2. Triage: if approved, a new slice is added here referencing the signal.
3. Code-level escape hatches are added with the ref: `/* c8 ignore next -- core-16.N: <short reason> */`.
4. CI scans for escape hatches whose ref doesn't resolve to an active slice — those fail the build.

Retiring an exception looks like: delete the slice here with a `(retired YYYY-MM-DD — reason)` note, let CI flag all orphaned escape-hatch comments, fix the underlying violations, remove the comments.

## Enforcement

- `scripts/ci/validate-exceptions.ts` walks the codebase and verifies: every `c8 ignore`, `ts-expect-error`, `eslint-disable`, `prettier-ignore` comment includes a `core-16.N` ref that resolves to an active slice in this file. Two modes: `pnpm exceptions:audit` (advisory; always exits 0; emits `coverage/exceptions-audit.{json,md}`) and `pnpm exceptions:check` (strict; non-zero exit on any non-compliant directive). The strict variant is wired into `pnpm quality:check`'s chain post-`core/build-app-T70` Layer 6 — every push runs the gate.
- Reviewer Pass 2 (per core-5) backstops the mechanical check.
- Any escape hatch added without a valid ref is a reviewer-reject.

---

### core-16.1 — Coverage-excluded file patterns (active)

**Context:** 100% coverage per core-1.5 + core-2.16 is enforced on product code. Several file classes produce no runtime behavior worth testing: tool configs, pure re-export barrels, generated files, type-only declarations. Including them in the coverage denominator artificially deflates the metric and incentivizes meaningless test-writing.

**Decision:** The `coverage.exclude` block in `vitest.config.ts` (and the mirrored block in `vitest.integration.config.ts`) carves out the following patterns. They do not count toward the 100% threshold but are still subject to linting and type-checking.

- `**/*.test.ts`, `**/*.test.tsx`, `**/*.integration.test.ts`, `**/__tests__/**` — test files and shared test fixtures.
- `**/dist/**` — emitted build output.
- `**/*.d.ts` — ambient type-declaration files.
- `**/*.types.ts` — type-only source files. Files named `*.types.ts` MUST be pure type / interface declarations with no runtime executable logic. Files that contain real runtime functions stay un-suffixed and remain in coverage.
- `**/*.config.ts`, `**/*.config.mts`, `**/*.config.mjs`, `**/*.config.cjs`, `**/*.config.js` — tool configuration (vitest, eslint, prettier, drizzle-kit, etc.).
- `**/src/index.ts` — pure re-export barrels. A barrel that adds logic (validation, factory construction) is in-scope.
- `**/src/test-utils.ts` — test-harness helpers per the original `core-16.1` carve-out.

**Enforcement:** the slice and the two vitest configs match these patterns verbatim. The configs' comment block links here. A file added to the list without a ref to this decision is a reviewer-reject. New patterns require a signal → decision-file edit → config edit, in that order.

The exclude list stays narrow. If a file is producing real runtime behavior, it belongs inside coverage.

**Related:** signal `data/businesses/core/signals/11-validate-exceptions-deferred-and-policy-practice-drift.md` motivated the `*.types.ts` addition (per `core/build-app-T70` Layer 4 — pure-types files were previously hand-rolled into the exclude list, drifting from the slice text).

---

### core-16.2 — `/* c8 ignore */` requires decision ref and justification (active)

**Context:** Some code paths are genuinely hard to exercise in tests — fault-injection harnesses, conditional branches that only fire in specific runtime environments, `process.exit` calls in CLI entry points after assertion failures. 100% coverage would either force a brittle fault-injection test or block the file from committing.

**Decision:** `/* c8 ignore next */`, `/* c8 ignore next N */`, and `/* c8 ignore start ... /* c8 ignore stop */` are allowed on a per-line basis. Every use MUST include:

1. A `core-16.N(.<letter>)?` ref pointing at a slice (parent or child) in this file that sanctions the class of exception.
2. A short justification in the same comment.

Comment shape:

```ts
/* c8 ignore next -- core-16.2.a: process.exit on config-missing; CLI dispatch branch */
```

An ignore comment without a ref, or with a ref that doesn't resolve to an active slice, fails the CI validator and is a reviewer-reject. The five active sub-slices below enumerate the recurring justification classes — anything that doesn't fit one of them is **cut-corners by definition** and the production-callable path MUST be replaced with a real test, not slice-ref'd.

### core-16.2.a — CLI fatal-exit / `argv[1]` dispatch branches (active)

**Context:** Every CLI entrypoint (`scripts/**/*.ts`, `packages/**/cli.ts`) has an `if (process.argv[1] === fileURLToPath(import.meta.url))` dispatch branch that fires only when the file is invoked directly via `tsx`/`node`, never when imported as a module by tests. The branch typically calls a top-level orchestration function and translates its result into a `process.exit(N)`. Both halves are exercised by integration tests that shell out to the CLI; the unit-coverage gate doesn't see them.

**Decision:** `/* c8 ignore start -- core-16.2.a: <reason> */ ... /* c8 ignore stop */` (or `/* c8 ignore next -- core-16.2.a: <reason> */` for single-line dispatches) is the sanctioned form for these branches. Usage count from the audit: ~12 sites.

**Retirement condition:** when an integration-coverage harness exercises every CLI's `argv[1]` dispatch and the branch lands inside the merged-coverage gate's denominator without false-positive timeouts.

### core-16.2.b — Defensive against external-library API contract drift (active)

**Context:** Wrappers around third-party SDKs (the MCP SDK, prettier, eslint, vitest, gray-matter, chokidar, the Supabase client) include defensive branches against the SDK passing through values its TypeScript declarations claim are non-nullable (or vice versa). The branches exist to fail loudly under SDK drift; they are not callable from production code paths.

**Decision:** `/* c8 ignore next -- core-16.2.b: <which SDK + what defense> */` is the sanctioned form. Examples: MCP wire callers always supply an `arguments` object so the `args === undefined` arm fires only against SDK API drift; prettier's `getFileInfo` always returns a config but the `?? {}` fallback exists in case the wrapper escapes that contract. Usage count from the audit: ~55 sites — the largest class.

**Retirement condition:** when SDK contracts are hardened upstream (e.g. MCP SDK declares `arguments: object` non-optional) or when a typed adapter shim absorbs the contract drift.

### core-16.2.c — Structural narrowing of caller-pre-filtered impossibilities (active)

**Context:** TypeScript's flow analysis sometimes can't see that a value is non-null at the use site because the pre-filter happened in a different function or behind a runtime invariant the type system doesn't track. The narrowing branch (`if (foo === undefined) return;` etc.) exists for type narrowing but is structurally unreachable given the caller's pre-conditions.

**Decision:** `/* c8 ignore next -- core-16.2.c: <which caller-side guarantee> */` is the sanctioned form. Examples: optional-spread ternaries where `exactOptionalPropertyTypes: true` requires `field !== undefined ? { field } : {}` but every call site is already pre-filtered; map-lookup-after-set patterns where the entry is guaranteed present. Usage count from the audit: ~38 sites.

**Retirement condition:** when the type system can express the narrowing inline (e.g. via assertion functions or branded types) without the runtime check.

### core-16.2.d — Race conditions during hand-edited markdown / chokidar debounce (active)

**Context:** The markdown-store layer tolerates partial-write states from hand-edited files (an editor saving a half-typed frontmatter block) and chokidar's debounce window can yield stale event payloads. The defensive branches catch these states and fail-soft / re-read; they don't fire under deterministic test fixtures because the tests don't introduce filesystem races.

**Decision:** `/* c8 ignore next -- core-16.2.d: <which race / which buffer state> */` is the sanctioned form. Usage count from the audit: ~18 sites.

**Retirement condition:** when the markdown-store's coordinated-write protocol per `core-D12.7` lands and partial-state branches become structurally impossible, OR when a chaos-test harness exercises the race.

### core-16.2.e — TTY-bound paths (active)

**Context:** Certain pretty-print / interactive paths only run when stdout is a TTY (`process.stdout.isTTY === true`). vitest runs in a non-TTY subprocess; the TTY-bound code path is structurally unreachable in tests.

**Decision:** `/* c8 ignore start -- core-16.2.e: <which TTY-only behavior> */ ... /* c8 ignore stop */` is the sanctioned form. Usage count from the audit: ~5 sites.

**Retirement condition:** when a test harness can simulate TTY-mode reliably (vitest's `pty`-bound subprocess pool when it lands).

---

### core-16.3 — `@ts-expect-error` / `as any` / `as unknown as X` requires decision ref (active)

**Context:** TypeScript strict mode occasionally runs into legitimate limits — upstream type definitions wrong, recursive type constructions hitting the depth limit, narrowing a `unknown` after a runtime-validated `zod.parse`. The escape is warranted; the motivation must be visible to every future reader.

**Decision:** `@ts-expect-error` (preferred over `@ts-ignore` because it fails if the error goes away), `as any`, and `as unknown as X` are allowed but every use MUST include:

1. A `core-16.N(.<letter>)?` ref.
2. A short justification.

Shape:

```ts
// @ts-expect-error -- core-16.3.a: zod-internal _def shape; introspection bridge
```

`@ts-ignore` without the expect-error variant is **banned** (no ref can save it — it silently swallows future type errors). ESLint `@typescript-eslint/ban-ts-comment` enforces with `"ts-expect-error": "allow-with-description"` and `"ts-ignore": true` to ban.

### core-16.3.a — Zod-internal `_def` introspection bridge (active)

**Context:** `@core/schemas`'s loader and `@core/schema-form`'s walker introspect Zod's internal `_def` shape to drive registry walking, default-value extraction, and discriminator detection. Zod's public types intentionally hide `_def` from consumers; the introspection requires an `as unknown as <internal-shape>` bridge per call site. The shape is stable across Zod 3.x patch versions (verified empirically) but isn't a public contract.

**Decision:** `as unknown as <ZodInternalShape>` is the sanctioned form for Zod-internal introspection. Each call site cites `core-16.3.a` and names the specific `_def` field accessed. Usage count from the audit: ~3 sites.

**Retirement condition:** when Zod 4.x ships public introspection helpers (slated upstream) or when `@core/schemas` migrates to a runtime registry that doesn't require Zod-internal walking.

### core-16.3.b — gray-matter's loose-generic frontmatter on canonical write (active)

**Context:** `gray-matter`'s parse function returns `{ data: { [key: string]: any }, content: string }` — the frontmatter is typed as a loose record. The markdown-store layer's `composeMarkdown` write path needs to round-trip the frontmatter through gray-matter's stringify, but our typed frontmatter shapes are stricter than gray-matter's generic. The cast bridges the two.

**Decision:** `as unknown as <TypedFrontmatter>` is the sanctioned form on the canonical-write boundary in `@core/markdown-store`. Usage count from the audit: ~2 sites (one per direction).

**Retirement condition:** when `@core/markdown-store` switches off gray-matter to a typed YAML serializer (proposed in `core-D12` follow-ups).

---

### core-16.4 — `eslint-disable` requires decision ref (active)

**Context:** Same rationale as core-16.3 — lint rules occasionally collide with legitimate code shapes (e.g. airbnb's `no-param-reassign` fighting Redux-style immer reducers).

**Decision:** `eslint-disable`, `eslint-disable-next-line`, and `eslint-disable-line` are allowed but every use MUST include a `core-16.N(.<letter>)?` ref and a short justification. Rule-specific disables (`eslint-disable-next-line no-param-reassign`) are preferred over blanket `eslint-disable`.

Shape:

```ts
// eslint-disable-next-line no-await-in-loop -- core-16.4.a: sequential by design
```

### core-16.4.a — Sequential-by-design `await` loops (active)

**Context:** Some loops MUST run sequentially: per-task dispatch in the runner (each iteration's side effects feed the next), per-attempt frontmatter writes (ordering invariants), per-file format/lint passes against shared state. Parallelizing them via `Promise.all` would change semantics; the `no-await-in-loop` rule fires on the (correct) sequential shape.

**Decision:** `// eslint-disable-next-line no-await-in-loop -- core-16.4.a: <which sequential invariant>` is the sanctioned form. Each site cites the specific ordering invariant the loop preserves. Usage count from the audit: ~22 sites.

**Retirement condition:** when ESLint's `no-await-in-loop` learns to recognize sequential-by-design markers (none on the roadmap; this is structural).

### core-16.4.b — Typed-private dot-notation access (active)

**Context:** ESLint's `dot-notation` rule prefers `obj.foo` over `obj['foo']` for static keys. When `obj` is typed with a `[key: string]: T` index signature plus specific named members, TypeScript requires bracket notation for the index-signature keys but the lint rule wants dots. The disable is on the legitimate bracket notation.

**Decision:** `// eslint-disable-next-line dot-notation -- core-16.4.b: <which typed-private field>` is the sanctioned form. Usage count from the audit: ~9 sites.

**Retirement condition:** when ESLint's `dot-notation` rule recognizes index-signature-only keys (TypeScript-aware lint rules in `@typescript-eslint`'s `dot-notation` may already do this; per-site refactor opportunity).

### core-16.4.c — Canonical underscore-prefixed discriminators per `core-D18.10` (active)

**Context:** `core-D18.10` schema discipline names discriminator fields with a leading underscore (`_kind`, `_version`, `_schema`) to mark them as canonical-frame metadata distinct from domain fields. ESLint's `no-underscore-dangle` rule fires on the leading underscore.

**Decision:** `// eslint-disable-next-line no-underscore-dangle -- core-16.4.c: canonical schema discriminator per core-D18.10` is the sanctioned form. Usage count from the audit: ~5 sites.

**Retirement condition:** when the `no-underscore-dangle` rule is configured with an allow-list for `_kind`, `_version`, `_schema` and the per-site disable becomes redundant.

### core-16.4.d — Intentional forward references in mutually-recursive tree walkers (active)

**Context:** Tree-walker dispatch helpers (`@core/schema-form`'s `walkSchema` + per-kind sub-walkers; `@core/review-cli`'s `walkAndPrompt` + per-shape sub-prompters) are mutually recursive: the dispatch fn calls each sub-walker, and each sub-walker calls back into the dispatch fn for child nodes. ESLint's `@typescript-eslint/no-use-before-define` rule fires on the forward reference; reordering definitions would force one of the two functions to be defined inline (defeating the per-kind extraction) or push the dispatch fn to the bottom of the file (defeating top-down readability).

**Decision:** `// eslint-disable-next-line @typescript-eslint/no-use-before-define -- core-16.4.d: <which recursion target>` is the sanctioned form. Each site cites the specific recursion target (`walkSchema`, `walkAndPrompt`, etc.) and the structural reason the forward reference is correct.

**Retirement condition:** when the lint rule is configured to recognize tree-walker patterns explicitly (no upstream proposal; this is structural).

### core-16.4.e — Early-exit `continue` in scan / walk loops (active)

**Context:** Filesystem walk loops (`scripts/ci/check-task-spec.ts`, `scripts/ci/check-signal-kinds.ts`, `validate-exceptions.ts`'s walker) and scan loops over directive lines use `continue;` for early-exit guards (entry-not-a-directory, line-not-a-table-row, ref-already-seen, etc.). ESLint's `no-continue` rule fires on the legitimate guard; refactoring to nested `if` blocks deepens cyclomatic complexity and reduces readability.

**Decision:** `// eslint-disable-line no-continue -- core-16.4.e: <which guard condition>` (or `// eslint-disable-next-line no-continue -- core-16.4.e: ...`) is the sanctioned form. Each site cites the specific filter the `continue` enforces.

**Retirement condition:** when the project switches off `no-continue` blanket-on (proposed in `core/build-app` follow-ups) or when filter-then-iterate patterns replace the inline-guard idiom across the affected files.

### core-16.4.f — `prefer-destructuring` on a shadowed-binding mutation (active)

**Context:** A loop body or conditional that re-assigns a variable holding the result of a function call would, under `prefer-destructuring`, be re-written as `const { field } = obj;` followed by a separate `let result = field;` reassignment chain — splitting one statement into two and forcing readers to track the binding across lines. Sites where the binding is shadowed and mutated within the same block keep the pre-destructure form for readability.

**Decision:** `// eslint-disable-next-line prefer-destructuring -- core-16.4.f: <which shadowed binding + why destructure form would worsen readability>` is the sanctioned form. Per-site disables only — a project-wide `prefer-destructuring: off` would discard the rule's value at the many sites where destructuring DOES improve clarity.

**Retirement condition:** when ESLint's `prefer-destructuring` learns a `mutated-binding` exemption (none on the roadmap; this is structural).

---

### core-16.5 — `prettier-ignore` allowed only for ASCII-art-like structured data (active)

**Context:** Prettier is deterministic and covers 99% of style. The 1% that survives is things like hand-aligned tables of constants, ASCII diagrams in comments, or SQL DDL where column alignment carries meaning.

**Decision:** `// prettier-ignore` / `{/* prettier-ignore */}` / `<!-- prettier-ignore -->` allowed on a per-block basis. Every use cites a `core-16.5.<letter>` sub-slice via a preceding HTML comment of the form `<!-- core-16.5.<letter>: <reason> -->` (markdown) or a `-- core-16.5.<letter>: <reason>` suffix in the prettier-ignore comment itself (TypeScript). The validator's markdown parser keys on a `core-16.N` ref appearing within the prior 3 lines.

### core-16.5.a — Hand-aligned structured-data tables (active)

**Context:** Constant tables, lookup maps, and Markdown tables where column alignment aids reading at a glance. Prettier would re-flow the columns and break the visual alignment.

**Decision:** `core-16.5.a` covers hand-aligned data tables. Block should be short — a few lines, not a function body.

### core-16.5.b — ASCII diagrams in comments / docstrings (active)

**Context:** ASCII art rendering of state machines, event flows, or directory layouts. Prettier mangles the box-drawing characters and breaks the diagram.

**Decision:** `core-16.5.b` covers ASCII diagrams.

### core-16.5.c — Markdown with intentional alignment / paragraph breaks (active)

**Context:** Markdown prose where paragraph or list-item alignment carries visual meaning Prettier would re-flow away (e.g. parallel-structure bullets the reader scans column-wise).

**Decision:** `core-16.5.c` covers intentional markdown alignment.

---

### core-16.6 — Migration 00000000000001 uses bootstrap timestamp (active)

**Context:** `supabase/migrations/00000000000001_bootstrap.sql` was named with an explicit 14-zero-plus-one sort-prefix rather than a real timestamp so the bootstrap migration sorts first no matter what. Every subsequent migration uses a real UTC timestamp per `supabase migration new`.

**Decision:** The first migration (`00000000000001_bootstrap.sql`) is the one allowed exception to the real-timestamp-for-filename rule. All subsequent migrations MUST use `supabase migration new <name>` which generates a real timestamp.

**Enforcement:** Reviewer Pass 2 check + linting rule in CI that fails on new 0-prefix migrations.

---

### core-16.7 — Integration-only paths excluded from unit-test coverage (retired 2026-04-23 — merged coverage landed via task 3 / PR #2)

**Retirement note:** Task 3 landed merged unit + integration coverage (see `scripts/ci/merge-coverage.ts` + `scripts/ci/check-coverage.ts` and the `coverage-merge` CI job). The 100% threshold now enforces against the union of both test surfaces, so integration-only paths are no longer false-negatives against unit coverage. The carve-out entries (`packages/@core/db/src/client.ts`, `**/schema.ts`, `**/*.schema.ts`) are removed from `vitest.config.ts`'s `coverage.exclude`. `client.ts`'s error branch (thrown when `DATABASE_URL` is unset) is exercised by a new unit test at `packages/@core/db/src/__tests__/client.test.ts`; its happy path remains covered by the integration round-trip. Drizzle schema files are declarative `pgTable` calls and produce no executable branches — merged coverage surfaces them at 100% without any additional tests.

**Related signal:** [`data/businesses/core/signals/3-merge-unit-and-integration-coverage.md`](../signals/3-merge-unit-and-integration-coverage.md) — closed concurrently with this retirement.

**Historical context (preserved for archaeology):**

Coverage enforcement per `core-16.1` originally measured only `test:coverage`, which runs unit tests (`*.test.ts`) and excludes integration tests (`*.integration.test.ts`). Some files are only legitimately exercised by the integration suite — a DB client that needs a real Postgres connection, an HTTP handler that needs a running server, a Pub/Sub subscriber that needs the emulator. Including these in the unit-coverage denominator produced a false-negative threshold failure: the file is tested (by integration), just not by the surface vitest was measuring. This slice was the interim carve-out until merged coverage (the structural fix) could land. Every new entry on this list was treated as drift signal — the list never grew past the two entries it opened with.

---

## More exceptions will be added here

Every new exception goes through: signal → triage → decision slice here → escape-hatch comments referencing the slice. The slice count is a leading indicator of where the codebase's strict invariants are rubbing against reality — chronic growth in one class is a signal to revisit the invariant itself.
