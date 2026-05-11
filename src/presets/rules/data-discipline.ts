import { rule } from '../../rules/factories.js';
import type { Rule } from '../../schemas.js';

/**
 * Data-discipline rules — migrations, scope-wrapped writes, transaction
 * boundaries. These apply primarily to code-writer scopes (and any
 * migration-writing custom role projects define).
 */

const DATA_ROLES = ['code-writer', 'free-form'];

const migrationHasExercisingTest: Rule = rule.custom({
  id: 'migration-has-exercising-test',
  category: 'data-discipline',
  defaultSeverity: 'CRITICAL',
  checkRef: 'migrationHasExercisingTest',
  catalogueEntry: 'defensive-no-op-migration',
  relatedPrinciple: 'mechanical-enforcement-over-instruction',
  appliesToRoles: DATA_ROLES,
  prompt: {
    summary:
      'Every new migration ships with a test that seeds dirty data, runs the migration, and asserts the post-migration state.',
    guidance:
      'A migration written against clean data produces defensive SQL that "wouldn\'t hurt anything" but never actually fires against the condition it was nominally defending against. The migration\'s file exists; nothing is exercised. The test must (a) seed pre-migration state matching what the migration handles, (b) run the migration, (c) assert post-migration state matches expectations. The check pairs every file in the migrations directory with a corresponding test exercising its logic against seeded dirty data; migrations whose tests seed zero rows are flagged as defensive no-ops.',
  },
});

const integrationTestWritesScopeWrapped: Rule = rule.custom({
  id: 'integration-test-writes-scope-wrapped',
  category: 'data-discipline',
  defaultSeverity: 'CRITICAL',
  checkRef: 'integrationTestWritesScopeWrapped',
  catalogueEntry: 'integration-test-writes-escape-to-production-scope',
  relatedPrinciple: 'mechanical-enforcement-over-instruction',
  appliesToRoles: DATA_ROLES,
  prompt: {
    summary: 'Integration tests that write to the database wrap writes in test-scope.',
    guidance:
      "An integration test that exercises a real write path without wrapping writes in test-business scoping leaks phantom entities into the real namespace, consumes real short_ids, and pollutes dashboards. The wrapping is `runWithBusinessId(TEST_BUSINESS_ID, ...)` (or the project's equivalent) around every write call. The check greps `*.integration.test.*` files for write-API calls and confirms each call's surrounding context contains the scope wrapper. Writes without scoping evidence fail this rule.",
    examples: {
      bad: "it('creates the entity', async () => { await createEntity({ ... }); });",
      good:
        "it('creates the entity', async () => {\n" +
        '  await runWithBusinessId(TEST_BUSINESS_ID, async () => {\n' +
        '    await createEntity({ ... });\n' +
        '  });\n' +
        '});',
    },
  },
});

const testHarnessDefaultBusinessIdOverride: Rule = rule.custom({
  id: 'test-harness-default-business-id-override',
  category: 'data-discipline',
  defaultSeverity: 'HIGH',
  checkRef: 'testHarnessDefaultBusinessIdOverride',
  catalogueEntry: 'integration-test-writes-escape-to-production-scope',
  relatedPrinciple: 'mechanical-enforcement-over-instruction',
  appliesToRoles: DATA_ROLES,
  prompt: {
    summary:
      'The test harness defaults to test-scope so unscoped writes fail safe rather than leaking.',
    guidance:
      "Wrapping is a per-test defense; the harness-default is the project-wide safety net. Setting `OVERRIDE_BUSINESS_ID = TEST_BUSINESS_ID` (or the project's equivalent) in the test harness setup flips the default so tests that forget to wrap explicitly land in test scope. The check verifies the harness config sets this default; absence of the default means a missed scope wrapper silently leaks instead of failing safe.",
  },
});

const writeThenValidateMakesTransactionChoiceExplicit: Rule = rule.custom({
  id: 'write-then-validate-makes-transaction-choice-explicit',
  category: 'data-discipline',
  defaultSeverity: 'HIGH',
  checkRef: 'writeThenValidateMakesTransactionChoiceExplicit',
  catalogueEntry: 'write-then-validate-without-transaction',
  relatedPrinciple: 'mechanical-enforcement-over-instruction',
  appliesToRoles: DATA_ROLES,
  prompt: {
    summary:
      'Write-then-validate sequences make the transaction choice explicit (wrap, validate-before-write, or log-and-signal).',
    guidance:
      'A write followed by a refetch + validation, without transaction wrapping, is a structural risk: concurrent readers see post-write-pre-validation state, and a validation failure leaves the write committed. Three legitimate resolutions exist, choose one explicitly: (1) **transaction-wrap** — both operations inside a single transaction so validation failure rolls back the write; (2) **validate-before-write** — refactor so validation runs against candidate state before any write; (3) **log-and-signal-without-rollback** — accept the inconsistent state, log it, emit a signal that triggers reconciliation. The check looks for `await db.insert/update(...)` followed by `await db.select(...)` + `if (!isValid(...))` in the same async function without an enclosing `db.transaction(...)`.',
  },
});

export const dataDisciplineRules: readonly Rule[] = [
  migrationHasExercisingTest,
  integrationTestWritesScopeWrapped,
  testHarnessDefaultBusinessIdOverride,
  writeThenValidateMakesTransactionChoiceExplicit,
];
