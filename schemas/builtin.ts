import type { Exception, ExceptionRegistry } from './exception.js';

/**
 * Built-in exception categories — exception template entries shipped with
 * the package. Each is a CATEGORY-level entry, not a project-specific
 * instance. Projects compose these into their config's `exceptions`
 * field via the spread operator (`...seeds.builtInExceptions`).
 *
 * The categories cover the recurring exception shapes observed across
 * TypeScript projects. New categories are added through the same
 * contribution flow as new catalogue entries — observed pattern + at least
 * one citation + structural rationale.
 *
 * Provenance: derived from the Core of Tomorrow platform's exception
 * registry work (core-16). The Core of Tomorrow project had project-
 * specific INSTANCES filling each of these CATEGORIES; the categories
 * themselves are portable.
 *
 * Each entry below uses 'exception-' prefix on the ID so they're clearly
 * distinguishable from project-specific exception IDs.
 *
 * The `mechanism` field on each entry binds it to a specific suppression
 * comment shape. Citing a `mechanism: 'c8-ignore'` exception from an
 * `eslint-disable` comment fails validation with a clear "wrong-mechanism"
 * finding — catches the case where a suppression cites a plausible-
 * sounding but mechanism-mismatched exception. Entries with `mechanism:
 * null` operate at config level (file-pattern exclusions, naming
 * conventions) rather than at an inline-comment site.
 */

const cliFatalExit: Exception = {
  id: 'exception-cli-fatal-exit',
  category: 'cli-fatal-exit',
  mechanism: 'c8-ignore',
  context:
    "CLI entrypoints have an `if (process.argv[1] === fileURLToPath(import.meta.url))` (or similar `require.main === module`) dispatch branch that fires only when the file is invoked directly via tsx/node, never when imported as a module by tests. The branch typically calls a top-level orchestration function and translates its result into process.exit(N). Both halves are exercised by integration tests that shell out to the CLI; the unit-coverage gate doesn't see them.",
  retirementCondition:
    "Retire when an integration-coverage harness exercises every CLI's argv[1] dispatch and the branch lands inside the merged-coverage gate's denominator without false-positive timeouts.",
  addedDate: '2026-04-22',
  status: 'active',
};

const externalLibraryDriftDefense: Exception = {
  id: 'exception-external-library-drift-defense',
  category: 'external-library-drift-defense',
  mechanism: 'c8-ignore',
  context:
    'Wrappers around third-party SDKs include defensive branches against the SDK passing through values its TypeScript declarations claim are non-nullable (or vice versa). The branches exist to fail loudly under SDK drift; they are not callable from production code paths under correct SDK behavior. Common examples: MCP SDK callers always supplying an arguments object so the args === undefined arm fires only against SDK API drift; library functions whose ?? {} fallback exists in case the wrapper escapes the documented contract.',
  retirementCondition:
    'Retire individual sites when SDK contracts are hardened upstream (e.g. SDK declares argument non-optional) or when a typed adapter shim absorbs the contract drift.',
  addedDate: '2026-04-22',
  status: 'active',
};

const typeNarrowingOfImpossible: Exception = {
  id: 'exception-type-narrowing-of-impossible',
  category: 'type-narrowing-of-impossible',
  mechanism: 'c8-ignore',
  context:
    "TypeScript's flow analysis sometimes can't see that a value is non-null at the use site because the pre-filter happened in a different function or behind a runtime invariant the type system doesn't track. The narrowing branch (if (foo === undefined) return; etc.) exists for type narrowing but is structurally unreachable given the caller's pre-conditions. Common examples: optional-spread ternaries where exactOptionalPropertyTypes: true requires field !== undefined ? { field } : {} but every call site is already pre-filtered; map-lookup-after-set patterns where the entry is guaranteed present.",
  retirementCondition:
    'Retire when the type system can express the narrowing inline (e.g. via assertion functions or branded types) without the runtime check.',
  addedDate: '2026-04-22',
  status: 'active',
};

const raceConditionDefense: Exception = {
  id: 'exception-race-condition-defense',
  category: 'race-condition-defense',
  mechanism: 'c8-ignore',
  context:
    "Some layers tolerate partial-write states from hand-edited files (an editor saving a half-typed YAML/JSON block) and debounce windows in file watchers can yield stale event payloads. The defensive branches catch these states and fail-soft or re-read; they don't fire under deterministic test fixtures because the tests don't introduce filesystem races.",
  retirementCondition:
    'Retire when a coordinated-write protocol makes partial-state branches structurally impossible, or when a chaos-test harness exercises the race deterministically.',
  addedDate: '2026-04-22',
  status: 'active',
};

const ttyBound: Exception = {
  id: 'exception-tty-bound',
  category: 'tty-bound',
  mechanism: 'c8-ignore',
  context:
    'Pretty-print and interactive code paths that only run when stdout is a TTY (process.stdout.isTTY === true). Test runners typically run in a non-TTY subprocess; the TTY-bound code path is structurally unreachable in tests.',
  retirementCondition:
    'Retire when a test harness can simulate TTY mode reliably (vitest pty-bound subprocess pool when it lands; similar features in other runners).',
  addedDate: '2026-04-22',
  status: 'active',
};

const zodInternalIntrospection: Exception = {
  id: 'exception-zod-internal-introspection',
  category: 'zod-internal-introspection',
  mechanism: 'ts-expect-error',
  context:
    "Schema-walking infrastructure (registry loaders, form generators, type introspectors) sometimes needs to access Zod's internal _def shape. Zod's public types intentionally hide _def from consumers; the introspection requires an `as unknown as <internal-shape>` bridge per call site. The shape is stable across Zod 3.x patch versions (verified empirically) but isn't a public contract.",
  retirementCondition:
    "Retire when Zod 4.x ships public introspection helpers (proposed upstream) or when consuming code migrates to a runtime registry that doesn't require Zod-internal walking.",
  addedDate: '2026-04-22',
  status: 'active',
};

const looseGenericBridge: Exception = {
  id: 'exception-loose-generic-bridge',
  category: 'loose-generic-bridge',
  mechanism: 'ts-expect-error',
  context:
    "Some libraries return loose record shapes (e.g., gray-matter returns { data: { [key: string]: any }, content: string }). The codebase's typed shapes are stricter. The cast bridges the two on the canonical-write boundary.",
  retirementCondition:
    "Retire when the consuming code switches to a typed alternative that doesn't require the bridge.",
  addedDate: '2026-04-22',
  status: 'active',
};

const sequentialByDesignAwait: Exception = {
  id: 'exception-sequential-by-design-await',
  category: 'sequential-by-design-await',
  mechanism: 'eslint-disable',
  context:
    "Some loops MUST run sequentially: per-task dispatch where each iteration's side effects feed the next, per-attempt frontmatter writes with ordering invariants, per-file format/lint passes against shared state. Parallelizing them via Promise.all would change semantics; the no-await-in-loop rule fires on the (correct) sequential shape.",
  retirementCondition:
    "Retire only if ESLint's no-await-in-loop learns to recognize sequential-by-design markers. Currently no upstream proposal; this exception is structural.",
  addedDate: '2026-04-22',
  status: 'active',
};

const typedPrivateDotNotation: Exception = {
  id: 'exception-typed-private-dot-notation',
  category: 'typed-private-dot-notation',
  mechanism: 'eslint-disable',
  context:
    "ESLint's dot-notation rule prefers obj.foo over obj['foo'] for static keys. When obj is typed with a [key: string]: T index signature plus specific named members, TypeScript requires bracket notation for the index-signature keys but the lint rule wants dots. The disable is on the legitimate bracket notation.",
  retirementCondition:
    "Retire per-site when ESLint's dot-notation rule recognizes index-signature-only keys (TypeScript-aware variants in @typescript-eslint may already do this).",
  addedDate: '2026-04-22',
  status: 'active',
};

const canonicalUnderscoreDiscriminator: Exception = {
  id: 'exception-canonical-underscore-discriminator',
  category: 'canonical-underscore-discriminator',
  mechanism: 'eslint-disable',
  context:
    "Schema discipline often uses leading-underscore field names (_kind, _version, _schema) to mark canonical-frame metadata distinct from domain fields. ESLint's no-underscore-dangle rule fires on the leading underscore. Project-specific allowlists at the rule level would also work, but the per-site disable is acceptable.",
  retirementCondition:
    "Retire when no-underscore-dangle is configured with an allow-list for the project's canonical discriminator names and the per-site disable becomes redundant.",
  addedDate: '2026-04-22',
  status: 'active',
};

const mutuallyRecursiveWalker: Exception = {
  id: 'exception-mutually-recursive-walker',
  category: 'mutually-recursive-walker',
  mechanism: 'eslint-disable',
  context:
    "Tree-walker dispatch helpers (walkSchema + per-kind sub-walkers; walkAndPrompt + per-shape sub-prompters) are mutually recursive: the dispatch function calls each sub-walker, and each sub-walker calls back into the dispatch function for child nodes. ESLint's no-use-before-define fires on the forward reference; reordering definitions would force one function to be inlined (defeating extraction) or push the dispatch fn to the bottom (defeating top-down readability).",
  retirementCondition:
    'Retire when the lint rule is configured to recognize tree-walker patterns explicitly (no upstream proposal; this is structural).',
  addedDate: '2026-04-22',
  status: 'active',
};

const earlyExitContinue: Exception = {
  id: 'exception-early-exit-continue',
  category: 'early-exit-continue',
  mechanism: 'eslint-disable',
  context:
    "Filesystem walk loops and scan loops over directive lines use `continue;` for early-exit guards (entry-not-a-directory, line-not-a-table-row, ref-already-seen). ESLint's no-continue rule fires on the legitimate guard; refactoring to nested if blocks deepens cyclomatic complexity and reduces readability.",
  retirementCondition:
    'Retire when the project switches off no-continue blanket-on, or when filter-then-iterate patterns replace the inline-guard idiom across the affected files.',
  addedDate: '2026-04-22',
  status: 'active',
};

const mutatedBindingNoDestructure: Exception = {
  id: 'exception-mutated-binding-no-destructure',
  category: 'mutated-binding-no-destructure',
  mechanism: 'eslint-disable',
  context:
    'A loop body or conditional that reassigns a variable holding the result of a function call would, under prefer-destructuring, be rewritten as `const { field } = obj;` followed by a separate `let result = field;` reassignment chain — splitting one statement into two and forcing readers to track the binding across lines. Sites where the binding is shadowed and mutated within the same block keep the pre-destructure form for readability.',
  retirementCondition:
    "Retire per-site when ESLint's prefer-destructuring learns a mutated-binding exemption (none on the roadmap; this is structural).",
  addedDate: '2026-04-22',
  status: 'active',
};

const migrationBootstrapTimestamp: Exception = {
  id: 'exception-migration-bootstrap-timestamp',
  category: 'migration-bootstrap-timestamp',
  mechanism: null,
  context:
    'The first migration in a schema history may use an explicit zero-padded sort-prefix (00000000000001_bootstrap.sql) rather than a real UTC timestamp so the bootstrap migration sorts first regardless of clock drift. Every subsequent migration uses a real UTC timestamp. The exception applies at the migration-filename convention level, not at any suppression-comment site, so `mechanism` is null.',
  retirementCondition:
    "Does not retire — by definition there is one bootstrap migration per schema history. The exception's scope is bounded.",
  addedDate: '2026-04-22',
  status: 'active',
};

const coverageExcludedPatterns: Exception = {
  id: 'exception-coverage-excluded-patterns',
  category: 'coverage-excluded-patterns',
  mechanism: null,
  context:
    'Several file classes produce no runtime behavior worth testing: test files and fixtures, emitted build output, pure type-declaration files (`*.d.ts`, `*.types.ts`), tool configuration (`*.config.{ts,js,...}`), and pure re-export barrels (`**/index.ts`). Including them in the coverage denominator artificially deflates the metric and incentivizes meaningless test-writing. The exclude is configured at the coverage-tool level (vitest, c8, istanbul) rather than at any individual code site; `mechanism` is null. Coverage exclusions are still subject to linting and type-checking — exclusion is from the coverage denominator only.',
  retirementCondition:
    "Does not retire — this is a permanent class of file-pattern exclusion. Specific patterns may rotate as the project's structure evolves, but the exception category itself stays active.",
  addedDate: '2026-04-22',
  status: 'active',
};

const prettierAlignedDataTables: Exception = {
  id: 'exception-prettier-aligned-data-tables',
  category: 'prettier-aligned-data-tables',
  mechanism: 'prettier-ignore',
  context:
    'Constant tables, lookup maps, and Markdown tables where column alignment aids reading at a glance. Prettier would re-flow the columns and break the visual alignment. Use sparingly — blocks should be short (a few lines, not a function body).',
  retirementCondition:
    'Retire per-site when prettier learns column-aware reflow for table-shaped data, or when the data moves to a real serialized format (JSON, YAML) rendered with a different tool.',
  addedDate: '2026-05-11',
  status: 'active',
};

const prettierAsciiDiagrams: Exception = {
  id: 'exception-prettier-ascii-diagrams',
  category: 'prettier-ascii-diagrams',
  mechanism: 'prettier-ignore',
  context:
    'ASCII-art rendering of state machines, event flows, or directory layouts inside comments or docstrings. Prettier mangles box-drawing characters and breaks the diagram.',
  retirementCondition:
    'Retire per-site if the diagram moves to a dedicated diagramming format (Mermaid, PlantUML) rendered with a different tool.',
  addedDate: '2026-05-11',
  status: 'active',
};

const prettierMarkdownAlignment: Exception = {
  id: 'exception-prettier-markdown-alignment',
  category: 'prettier-markdown-alignment',
  mechanism: 'prettier-ignore',
  context:
    'Markdown prose where paragraph or list-item alignment carries visual meaning prettier would re-flow away (e.g. parallel-structure bullets the reader scans column-wise, intentional double-spacing between sections).',
  retirementCondition:
    'Retire per-site when the alignment migrates to explicit structure (HTML, tables) that prettier preserves.',
  addedDate: '2026-05-11',
  status: 'active',
};

/**
 * The full set of built-in exception templates. Projects spread this into
 * their own exception registry as a starting point.
 *
 * Example usage in a project's `effective.config.{ts,js}`:
 *
 *   import { defineExceptions, seeds } from 'effective';
 *
 *   export default defineExceptions({
 *     ...seeds.builtInExceptions,
 *
 *     'our-postgres-driver-quirk': {
 *       id: 'our-postgres-driver-quirk',
 *       category: 'external-library-drift-defense',
 *       mechanism: 'c8-ignore',
 *       context: '...',
 *       retirementCondition: '...',
 *       addedDate: '2026-05-15',
 *       status: 'active',
 *     },
 *   });
 */
export const builtInExceptions: ExceptionRegistry = {
  [cliFatalExit.id]: cliFatalExit,
  [externalLibraryDriftDefense.id]: externalLibraryDriftDefense,
  [typeNarrowingOfImpossible.id]: typeNarrowingOfImpossible,
  [raceConditionDefense.id]: raceConditionDefense,
  [ttyBound.id]: ttyBound,
  [zodInternalIntrospection.id]: zodInternalIntrospection,
  [looseGenericBridge.id]: looseGenericBridge,
  [sequentialByDesignAwait.id]: sequentialByDesignAwait,
  [typedPrivateDotNotation.id]: typedPrivateDotNotation,
  [canonicalUnderscoreDiscriminator.id]: canonicalUnderscoreDiscriminator,
  [mutuallyRecursiveWalker.id]: mutuallyRecursiveWalker,
  [earlyExitContinue.id]: earlyExitContinue,
  [mutatedBindingNoDestructure.id]: mutatedBindingNoDestructure,
  [migrationBootstrapTimestamp.id]: migrationBootstrapTimestamp,
  [coverageExcludedPatterns.id]: coverageExcludedPatterns,
  [prettierAlignedDataTables.id]: prettierAlignedDataTables,
  [prettierAsciiDiagrams.id]: prettierAsciiDiagrams,
  [prettierMarkdownAlignment.id]: prettierMarkdownAlignment,
};
