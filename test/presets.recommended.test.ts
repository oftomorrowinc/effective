import { describe, expect, it } from 'vitest';
import { verify } from '../src/verify.js';
import { presets } from '../src/presets/index.js';
import { resolveConstitution } from '../src/resolve.js';
import { scope, changed } from './_helpers.js';
import type { Constitution } from '../src/schemas.js';

describe('presets.recommended — shape', () => {
  it('contains lane, exceptions, toolchain, and spec rules', () => {
    const ids = new Set(presets.recommended.rules?.map((r) => r.id) ?? []);
    expect(ids).toContain('lane.editable-respected');
    expect(ids).toContain('exceptions.must-cite-justification');
    expect(ids).toContain('toolchain.lint-clean');
    expect(ids).toContain('toolchain.typecheck-clean');
    expect(ids).toContain('toolchain.tests-pass');
    expect(ids).toContain('toolchain.coverage-non-decreasing');
    expect(ids).toContain('specd-test-names-land-verbatim');
  });

  it('contains the catalogue-driven architecture rules', () => {
    const ids = new Set(presets.recommended.rules?.map((r) => r.id) ?? []);
    expect(ids).toContain('no-parallel-systems-without-migration');
    expect(ids).toContain('retirement-task-declared-as-dependency');
    expect(ids).toContain('canonical-validation-not-bypassed');
    expect(ids).toContain('new-exports-have-non-test-callers');
    expect(ids).toContain('no-wrapper-over-first-class-primitive');
  });

  it('contains the catalogue-driven test-discipline rules', () => {
    const ids = new Set(presets.recommended.rules?.map((r) => r.id) ?? []);
    expect(ids).toContain('no-disabled-tests-without-exception');
    expect(ids).toContain('test-count-non-decreasing');
    expect(ids).toContain('mocks-only-at-external-boundaries');
    expect(ids).toContain('mocks-must-be-type-bound');
    expect(ids).toContain('task-has-durable-test-artifact');
    expect(ids).toContain('no-alternative-tests-claiming-spec');
    expect(ids).toContain('assertions-not-narrowed');
  });

  it('contains the catalogue-driven data-discipline rules', () => {
    const ids = new Set(presets.recommended.rules?.map((r) => r.id) ?? []);
    expect(ids).toContain('migration-has-exercising-test');
    expect(ids).toContain('integration-test-writes-scope-wrapped');
    expect(ids).toContain('test-harness-default-business-id-override');
    expect(ids).toContain('write-then-validate-makes-transaction-choice-explicit');
  });

  it('contains the catalogue-driven governance rules', () => {
    const ids = new Set(presets.recommended.rules?.map((r) => r.id) ?? []);
    expect(ids).toContain('context-artifact-size-monitored');
    expect(ids).toContain('constitution-version-hash-verified-at-boot');
    expect(ids).toContain('new-throws-checked-against-catcher-chain');
    expect(ids).toContain('files-scoped-rule-overrides-cite-decision');
  });

  it('every catalogue-driven rule cites a catalogueEntry + relatedPrinciple', () => {
    const rules = presets.recommended.rules ?? [];
    // Foundation rules (lane, exceptions, toolchain) don't necessarily cite a
    // catalogue entry — they're shipped infrastructure. Catalogue-driven rules
    // (everything else) must cite both fields.
    const FOUNDATION_IDS = new Set([
      'lane.editable-respected',
      'exceptions.must-cite-justification',
      'protected-paths-respected',
      'toolchain.lint-clean',
      'toolchain.typecheck-clean',
      'toolchain.tests-pass',
      'toolchain.coverage-non-decreasing',
      'no-stray-debug-output',
      'no-hardcoded-secrets',
    ]);
    for (const r of rules) {
      if (FOUNDATION_IDS.has(r.id)) continue;
      expect(r.catalogueEntry, `rule ${r.id} cites catalogueEntry`).toBeDefined();
      expect(r.relatedPrinciple, `rule ${r.id} cites relatedPrinciple`).toBeDefined();
    }
  });

  it('no rule prompt or message references the obsolete `.effective/exceptions.ts` path', () => {
    // Drift sentinel — `exceptions` lives inline on the Constitution since
    // the two-file model was retired (commit 00dafa1). Any user-facing
    // string still pointing at `.effective/exceptions.ts` is a stale
    // reference that would mislead adopters. This test fails on any rule
    // whose prompt projection mentions the old path.
    const STALE = '.effective/exceptions.ts';
    const offenders: string[] = [];
    for (const rule of presets.recommended.rules ?? []) {
      const surfaces = [
        rule.prompt.summary,
        rule.prompt.guidance,
        rule.prompt.examples?.bad ?? '',
        rule.prompt.examples?.good ?? '',
      ];
      for (const surface of surfaces) {
        if (surface.includes(STALE)) {
          offenders.push(rule.id);
          break;
        }
      }
    }
    expect(offenders, `rules still reference the obsolete path: ${offenders.join(', ')}`).toEqual(
      [],
    );
  });

  it('resolves cleanly via resolveConstitution with the built-in registry', () => {
    const resolved = resolveConstitution(
      { extends: ['recommended'] },
      { presetRegistry: { recommended: presets.recommended } },
    );
    expect(resolved.rules.has('lane.editable-respected')).toBe(true);
    expect(resolved.rules.has('no-parallel-systems-without-migration')).toBe(true);
  });
});

describe('appliesToRoles — role filtering', () => {
  it('skips role-restricted rules during verify() when the scope.role is excluded', async () => {
    // Test-discipline rules have appliesToRoles: ['test-writer','code-writer','free-form']
    // — a 'reviewer' scope should NOT trip them.
    const config: Constitution = {
      extends: ['recommended'],
      disable: {
        // Disable toolchain rules so we focus on the catalogue rules.
        'toolchain.lint-clean': 'inline source — no toolchain results',
        'toolchain.typecheck-clean': 'inline source — no toolchain results',
        'toolchain.tests-pass': 'inline source — no toolchain results',
        'toolchain.coverage-non-decreasing': 'inline source — no toolchain results',
      },
    };
    const reviewerScope = scope('reviewer', { editable: [] });
    const result = await verify({
      scope: reviewerScope,
      config,
      // A diff that WOULD trip test-discipline rules — a test file with .skip
      source: {
        kind: 'inline',
        changedFiles: [changed('test/a.test.ts', "it.skip('x', () => {});", 'modified')],
      },
    });
    // Reviewer doesn't write tests, so test-discipline rules don't apply.
    // The .skip pattern is in a test file but the rule isn't fired for this role.
    const noTodoFiring = result.findings.find(
      (f) => f.ruleId === 'no-disabled-tests-without-exception',
    );
    expect(noTodoFiring).toBeUndefined();
  });

  it('still fires role-restricted rules when scope.role matches', async () => {
    const config: Constitution = {
      extends: ['recommended'],
      disable: {
        'toolchain.lint-clean': 'inline source — no toolchain results',
        'toolchain.typecheck-clean': 'inline source — no toolchain results',
        'toolchain.tests-pass': 'inline source — no toolchain results',
        'toolchain.coverage-non-decreasing': 'inline source — no toolchain results',
        'lane.editable-respected': 'wide editable for this test',
      },
    };
    const result = await verify({
      scope: scope('test-writer', { editable: ['**/*'] }),
      config,
      source: {
        kind: 'inline',
        changedFiles: [changed('test/a.test.ts', "it.skip('x', () => {});", 'modified')],
      },
    });
    expect(result.findings.some((f) => f.ruleId === 'no-disabled-tests-without-exception')).toBe(
      true,
    );
  });
});

describe('verify() — extends: ["recommended"] auto-loads the built-in preset', () => {
  it('flags a file outside scope.editable using the preset lane rule', async () => {
    const config: Constitution = { extends: ['recommended'] };
    const result = await verify({
      scope: scope('code-writer', { editable: ['src/**'] }),
      config,
      source: {
        kind: 'inline',
        changedFiles: [changed('test/oops.ts', 'export const x = 1;', 'added')],
      },
    });
    expect(result.verdict).toBe('fail');
    expect(result.findings.some((f) => f.ruleId === 'lane.editable-respected')).toBe(true);
  });

  it('runs exceptions.must-cite-justification via the bundled customCheck', async () => {
    const config: Constitution = { extends: ['recommended'] };
    const result = await verify({
      scope: scope('free-form'),
      config,
      source: {
        kind: 'inline',
        changedFiles: [
          changed('src/a.ts', '// @ts-expect-error legacy code\nconst x: number = "1";', 'added'),
        ],
      },
    });
    expect(result.verdict).toBe('fail');
    const f = result.findings.find((x) => x.ruleId === 'exceptions.must-cite-justification');
    expect(f).toBeDefined();
    expect(f?.severity).toBe('CRITICAL');
  });

  it('passes when the same hatch cites a registered exception', async () => {
    // Disable the toolchain rules so the test focuses on the exception
    // cite-validation path; inline sources don't supply toolchain results.
    const config: Constitution = {
      extends: ['recommended'],
      disable: {
        'toolchain.lint-clean': 'inline source — no toolchain results',
        'toolchain.typecheck-clean': 'inline source — no toolchain results',
        'toolchain.tests-pass': 'inline source — no toolchain results',
        'toolchain.coverage-non-decreasing': 'inline source — no toolchain results',
      },
    };
    const result = await verify({
      scope: scope('free-form', { editable: ['src/**'] }),
      config,
      source: {
        kind: 'inline',
        changedFiles: [
          changed(
            'src/a.ts',
            "// @ts-expect-error -- exception-id: sample-allowed legacy\nconst x: number = '1';",
            'added',
          ),
        ],
      },
      exceptions: {
        'sample-allowed': {
          id: 'sample-allowed',
          category: 'external-library-drift-defense',
          mechanism: 'ts-expect-error',
          context: 'Sample for the test.',
          retirementCondition: 'When the legacy code is replaced.',
          addedDate: '2026-05-11',
          status: 'active',
        },
      },
    });
    expect(result.verdict).toBe('pass');
  });

  it('toolchain.lint-clean fails when no toolchain results are supplied (helpful error path)', async () => {
    const config: Constitution = { extends: ['recommended'] };
    const result = await verify({
      scope: scope('free-form'),
      config,
      source: { kind: 'inline', changedFiles: [] },
    });
    // toolchain rules report "no toolchain result supplied" finding when the
    // user hasn't run the tool — this is expected for inline sources.
    expect(result.verdict).toBe('fail');
    const ids = new Set(result.findings.map((f) => f.ruleId));
    expect(ids).toContain('toolchain.lint-clean');
  });
});
