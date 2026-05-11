import type { Finding, SpecRule } from '../../schemas.js';
import type { ChangedFile, VerifyContext } from '../../source/types.js';

const TEST_NAME = /(?:it|test)\s*\(\s*(['"`])(?<name>[^'"`]+?)\1/g;

function extractSpecTestNames(spec: string): string[] {
  const names: string[] = [];
  const lines = spec.split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0) continue;
    const headerMatch = /^[-*]\s+(?:`)?(?<name>[^`]+?)(?:`)?\s*$/.exec(line);
    if (headerMatch?.groups?.name !== undefined) {
      names.push(headerMatch.groups.name.trim());
    }
  }
  return names;
}

function collectTestNamesFromFiles(files: readonly ChangedFile[]): Set<string> {
  const names = new Set<string>();
  for (const file of files) {
    if (file.status === 'deleted') continue;
    // Reset the shared regex's lastIndex per file so the global stateful match
    // doesn't leak between files.
    TEST_NAME.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TEST_NAME.exec(file.content)) !== null) {
      const name = match.groups?.name;
      if (name !== undefined) names.add(name);
    }
  }
  return names;
}

export function checkSpec(rule: SpecRule, ctx: VerifyContext): Finding[] {
  if (rule.check !== 'test-names-land-verbatim') {
    // Other check kinds (`assertions-not-narrowed`, `no-extra-tests-claiming-spec`)
    // require deeper static analysis of test bodies; deferred past phase 1.
    return [];
  }
  const spec = ctx.scope.spec;
  if (spec === undefined) {
    // Spec rules are scope-conditional: they only apply when a spec is
    // declared. Without scope.spec, the rule is a no-op rather than a
    // false-positive finding.
    return [];
  }
  // ctx.artifacts is a string-keyed Record; access by a key derived from the
  // resolved scope is intentional and the scope is project-controlled.

  const specArtifact = ctx.artifacts[spec];
  if (typeof specArtifact !== 'string') {
    return [
      {
        ruleId: rule.id,
        severity: rule.defaultSeverity,
        category: rule.category,
        evidence: `(no spec artifact registered for "${spec}")`,
        message: `Spec rule "${rule.id}" needs the spec body at artifacts["${spec}"]; supply it as a string. ${rule.prompt.guidance}`,
        source: { kind: 'rule', ruleId: rule.id },
      },
    ];
  }
  const expectedNames = extractSpecTestNames(specArtifact);
  const observedNames = collectTestNamesFromFiles(ctx.changedFiles);
  const missing = expectedNames.filter((name) => !observedNames.has(name));
  return missing.map((name) => ({
    ruleId: rule.id,
    severity: rule.defaultSeverity,
    category: rule.category,
    evidence: `Spec lists test "${name}" but no committed test file contains it.`,
    message: `Spec'd test name "${name}" did not land verbatim in any committed test file. ${rule.prompt.guidance}`,
    source: { kind: 'rule', ruleId: rule.id },
  }));
}
