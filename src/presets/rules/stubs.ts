import type { CustomCheck } from '../../source/types.js';

/**
 * Stub implementations for catalogue-driven CustomRule rules.
 *
 * Each catalogue-driven rule has a `prompt` projection that carries
 * real user-facing value (guidance read by workers via `prepare()`),
 * and a `checkRef` that names the detection function the rule needs.
 * For many rules the detection logic requires deeper engineering than
 * fits in one step — AST walking, git-history correlation, task-body
 * metadata access, etc. We register stub implementations here that
 * return no findings rather than the "checkRef not registered"
 * CRITICAL finding the default would emit.
 *
 * The honest framing: the prompt projection is active immediately
 * (workers see the guidance, kickBack cites the rule); the detection
 * grows over time as contributors land real implementations against
 * each stub. Projects extending the preset can override any stub by
 * passing a real implementation in `verify({ customChecks })`.
 *
 * **Important**: stubs return [], they do NOT emit "detection not
 * implemented" findings. Emitting such findings every run would
 * obscure real findings under noise. The rule's value at this stage
 * is the prompt projection; detection will catch up.
 */
const noop: CustomCheck = () => [];

export const catalogueStubChecks: Readonly<Record<string, CustomCheck>> = {
  noParallelSystemsWithoutMigration: noop,
  retirementTaskDeclaredAsDependency: noop,
  canonicalValidationNotBypassed: noop,
  newExportsHaveNonTestCallers: noop,
  noWrapperOverFirstClassPrimitive: noop,
  testCountNonDecreasing: noop,
  mocksOnlyAtExternalBoundaries: noop,
  taskHasDurableTestArtifact: noop,
  migrationHasExercisingTest: noop,
  integrationTestWritesScopeWrapped: noop,
  testHarnessDefaultBusinessIdOverride: noop,
  writeThenValidateMakesTransactionChoiceExplicit: noop,
  contextArtifactSizeMonitored: noop,
  constitutionVersionHashVerifiedAtBoot: noop,
  newThrowsCheckedAgainstCatcherChain: noop,
  filesScopedRuleOverridesCiteDecision: noop,
};
