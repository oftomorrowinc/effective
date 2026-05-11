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
    expect(ids).toContain('spec.test-names-land-verbatim');
  });

  it('resolves cleanly via resolveConstitution with the built-in registry', () => {
    const resolved = resolveConstitution(
      { extends: ['recommended'] },
      { presetRegistry: { recommended: presets.recommended } },
    );
    expect(resolved.rules.has('lane.editable-respected')).toBe(true);
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
