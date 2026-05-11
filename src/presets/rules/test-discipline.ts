import { rule } from '../../rules/factories.js';
import type { Rule } from '../../schemas.js';

/**
 * Test-discipline rules — the cluster of catalogue entries that target
 * how tests are written, named, mocked, and counted. Most of these
 * apply to the test-writer and code-writer roles; reviewer-only scopes
 * don't author tests so the rules silently skip via `appliesToRoles`.
 */

const TEST_AUTHORING_ROLES = ['test-writer', 'code-writer', 'free-form'];

const noDisabledTestsWithoutException: Rule = rule.forbidPattern(
  /\b(\.skip|\.todo|xit|xdescribe)\s*\(/,
  {
    id: 'no-disabled-tests-without-exception',
    in: '**/*.{test,spec}.{ts,tsx,js,jsx,mjs,cjs}',
    defaultSeverity: 'CRITICAL',
    category: 'tests',
    catalogueEntry: 'test-suite-drift',
    relatedPrinciple: 'mechanical-enforcement-over-instruction',
    appliesToRoles: TEST_AUTHORING_ROLES,
    prompt: {
      summary: 'No `.skip` / `.todo` / `xit` / `xdescribe` on tests without a tracked exception.',
      guidance:
        'A test that fails under a change must be fixed, not silenced. Disabling a test ships an invisible regression — CI stays green while the test that defended a behavior stops running. If a test genuinely cannot pass right now, register an exception in `.effective/exceptions.ts` with a retirement condition naming when the test should be re-enabled, and cite the exception id in the disable comment.',
      examples: {
        bad: "it.skip('handles concurrent writes', () => { ... });",
        good:
          '// Either fix the test, or:\n' +
          '// eslint-disable-next-line no-skip -- exception-id: our-flaky-test-fix-in-progress\n' +
          "it.skip('handles concurrent writes', () => { ... });",
      },
    },
  },
);

const testCountNonDecreasing: Rule = rule.custom({
  id: 'test-count-non-decreasing',
  category: 'tests',
  defaultSeverity: 'CRITICAL',
  checkRef: 'testCountNonDecreasing',
  catalogueEntry: 'test-suite-drift',
  relatedPrinciple: 'mechanical-enforcement-over-instruction',
  appliesToRoles: TEST_AUTHORING_ROLES,
  prompt: {
    summary: 'The total test count never decreases across a diff.',
    guidance:
      "Test count is a leading indicator of coverage. A diff that removes more tests than it adds is suspicious — either the deleted tests were redundant (in which case the diff should say so explicitly), or the diff is hiding behavior loss. The check reads the test count from the test runner's JSON reporter and fails on any decrease. Tracked deletions (with a retirement-condition reference) are accommodated; ad-hoc removals are not.",
  },
});

const mocksOnlyAtExternalBoundaries: Rule = rule.custom({
  id: 'mocks-only-at-external-boundaries',
  category: 'tests',
  defaultSeverity: 'HIGH',
  checkRef: 'mocksOnlyAtExternalBoundaries',
  catalogueEntry: 'mock-masked-reality',
  relatedPrinciple: 'mechanical-enforcement-over-instruction',
  appliesToRoles: TEST_AUTHORING_ROLES,
  prompt: {
    summary:
      'Mocks live at the DB / network / filesystem boundary, not inside the function under test.',
    guidance:
      'A test of `computeX()` does not mock `helperUsedByComputeX()` — it lets the real helper run. Mocks crossing the function under test exercise the mock, not reality, and produce green tests against fictions. Acceptable mock locations: DB clients, network calls, filesystem, time, randomness. Anywhere else, prefer integration-level tests over unit-level mocked tests.',
    examples: {
      bad: 'vi.mock("./helper"); // helper is used inside computeX()\nconst result = computeX();',
      good: 'vi.mock("pg"); // DB boundary\nconst result = computeX(); // real helperUsedByComputeX runs',
    },
  },
});

const mocksMustBeTypeBound: Rule = rule.forbidPattern(/\bvi\.fn\(\s*\)/, {
  id: 'mocks-must-be-type-bound',
  in: '**/*.{test,spec}.{ts,tsx}',
  defaultSeverity: 'HIGH',
  category: 'tests',
  catalogueEntry: 'mock-masked-reality',
  relatedPrinciple: 'mechanical-enforcement-over-instruction',
  appliesToRoles: TEST_AUTHORING_ROLES,
  prompt: {
    summary: "Mocks are TypeScript-bound to the real function's return type.",
    guidance:
      "Untyped mocks let the mock's return shape drift from the real function's. When the implementation changes, the mock keeps returning the old shape and the test keeps passing — the green is a fiction. Bind every mock via `vi.fn<typeof realFunction>()` so TypeScript fails compilation when the shapes diverge.",
    examples: {
      bad: 'const fetchUser = vi.fn(); // unbound — accepts any return',
      good: 'const fetchUser = vi.fn<typeof realFetchUser>();',
    },
  },
});

const taskHasDurableTestArtifact: Rule = rule.custom({
  id: 'task-has-durable-test-artifact',
  category: 'tests',
  defaultSeverity: 'HIGH',
  checkRef: 'taskHasDurableTestArtifact',
  catalogueEntry: 'task-without-verifiable-deliverable',
  relatedPrinciple: 'unverified-work-is-failed',
  appliesToRoles: TEST_AUTHORING_ROLES,
  prompt: {
    summary:
      'Every task ships at least one new or updated test that would regress if the claim it makes were wrong.',
    guidance:
      'A log entry claiming "the problem is resolved" without a code change or test that defends the resolution is not a durable deliverable. The task can be reverted (or the outcome silently regress) at any time. If the outcome was already produced by earlier work, the closing task\'s job is to add the regression-guard test — that\'s the deliverable. The check looks at the diff for at least one added/modified test file; if none, the task fails this rule.',
  },
});

const noAlternativeTestsClaimingSpec: Rule = rule.spec({
  id: 'no-alternative-tests-claiming-spec',
  check: 'no-extra-tests-claiming-spec',
  defaultSeverity: 'HIGH',
  category: 'spec-discipline',
  catalogueEntry: 'spec-as-illustration-drift',
  relatedPrinciple: 'mechanical-enforcement-over-instruction',
  appliesToRoles: TEST_AUTHORING_ROLES,
  prompt: {
    summary: 'Tests not declared in the spec do not pretend to satisfy a spec contract.',
    guidance:
      "When a task body declares a `## Test specification` with specific `it(\"...\")` names, the builder may write additional helper tests but must not substitute them for the spec'd ones. An alternative test that claims to \"cover the same behavior\" without using the spec'd name is spec drift — the spec's contract is the named test, not a paraphrase. Write the spec'd tests verbatim; if the spec is wrong, file an amendment and stop, don't shadow it.",
  },
});

const specdTestNamesLandVerbatim: Rule = rule.spec({
  id: 'specd-test-names-land-verbatim',
  check: 'test-names-land-verbatim',
  defaultSeverity: 'CRITICAL',
  category: 'spec-discipline',
  catalogueEntry: 'spec-drift-narrowed-assertions',
  relatedPrinciple: 'mechanical-enforcement-over-instruction',
  appliesToRoles: TEST_AUTHORING_ROLES,
  prompt: {
    summary: 'Tests named in the spec appear verbatim as committed `it(...)` / `test(...)` calls.',
    guidance:
      "When `scope.spec` references a spec document with a `## Test specification` section, every test name listed there must appear verbatim in a committed test file. Renamed, paraphrased, or substituted names don't count — the spec's contract is the exact name, not a near-match. Update the spec before the test if the wording needs to change; do not unilaterally rename in the test file.",
  },
});

const assertionsNotNarrowed: Rule = rule.spec({
  id: 'assertions-not-narrowed',
  check: 'assertions-not-narrowed',
  defaultSeverity: 'HIGH',
  category: 'spec-discipline',
  catalogueEntry: 'spec-drift-narrowed-assertions',
  relatedPrinciple: 'mechanical-enforcement-over-instruction',
  appliesToRoles: TEST_AUTHORING_ROLES,
  prompt: {
    summary: 'Assertions in committed tests are no weaker than the spec specifies.',
    guidance:
      "A spec that says `expect(result).toEqual(specificValue)` must not be implemented as `expect(result).toBeDefined()`. Softening assertions to make a test pass produces a test that no longer defends the behavior the spec was protecting. If the spec's assertion is genuinely wrong, amend the spec; if the implementation can't meet the spec, that's a failed implementation, not a reason to relax the test.",
  },
});

export const testDisciplineRules: readonly Rule[] = [
  noDisabledTestsWithoutException,
  testCountNonDecreasing,
  mocksOnlyAtExternalBoundaries,
  mocksMustBeTypeBound,
  taskHasDurableTestArtifact,
  noAlternativeTestsClaimingSpec,
  specdTestNamesLandVerbatim,
  assertionsNotNarrowed,
];
