import { describe, expect, it } from 'vitest';
import { resolveConstitution, resolveScope } from '../src/resolve.js';
import { patternRule, scope as makeScope } from './_helpers.js';
import type { Constitution, Scope } from '../src/schemas.js';

function scope(role: string, overrides: Partial<Scope> = {}): Scope {
  return makeScope(role, { editable: [], ...overrides });
}

describe('resolveConstitution — basic composition', () => {
  it('returns rules indexed by id and category', () => {
    const config: Constitution = {
      rules: [patternRule('a'), patternRule('b', { category: 'tests' })],
    };
    const resolved = resolveConstitution(config);
    expect(resolved.rules.size).toBe(2);
    expect(resolved.rules.get('a')?.id).toBe('a');
    expect(resolved.byCategory.get('custom')?.length).toBe(1);
    expect(resolved.byCategory.get('tests')?.length).toBe(1);
  });

  it('carries toolchain and meta through resolution', () => {
    const config: Constitution = {
      rules: [patternRule('a')],
      toolchain: { lint: 'pnpm lint' },
      meta: { name: 'demo', version: '1.0.0' },
    };
    const resolved = resolveConstitution(config);
    expect(resolved.toolchain.lint).toBe('pnpm lint');
    expect(resolved.meta).toEqual({ name: 'demo', version: '1.0.0' });
  });

  it('indexes custom roles from config.roles', () => {
    const config: Constitution = {
      rules: [patternRule('a')],
      roles: {
        'migration-writer': {
          defaultEditable: ['migrations/**'],
          expectations: { newMigrationExists: true } as never,
        },
      },
    };
    const resolved = resolveConstitution(config);
    expect(resolved.customRoles.get('migration-writer')?.defaultEditable).toEqual([
      'migrations/**',
    ]);
  });
});

describe('resolveConstitution — extends composition', () => {
  const preset: Constitution = {
    rules: [patternRule('preset-rule')],
    toolchain: { test: 'pnpm test' },
  };

  it('throws when extends references an unknown preset', () => {
    expect(() => resolveConstitution({ extends: ['missing'] })).toThrowError(
      /unknown preset "missing"/,
    );
  });

  it('merges rules from extended preset before own rules', () => {
    const resolved = resolveConstitution(
      { extends: ['demo-preset'], rules: [patternRule('own-rule')] },
      { presetRegistry: { 'demo-preset': preset } },
    );
    expect([...resolved.rules.keys()].sort()).toEqual(['own-rule', 'preset-rule']);
  });

  it('later config wins on same rule id (own > extends)', () => {
    const resolved = resolveConstitution(
      {
        extends: ['demo-preset'],
        rules: [patternRule('preset-rule', { defaultSeverity: 'LOW' })],
      },
      { presetRegistry: { 'demo-preset': preset } },
    );
    expect(resolved.rules.get('preset-rule')?.defaultSeverity).toBe('LOW');
  });

  it('merges toolchain config across extends and own', () => {
    const resolved = resolveConstitution(
      {
        extends: ['demo-preset'],
        rules: [patternRule('own-rule')],
        toolchain: { lint: 'pnpm lint' },
      },
      { presetRegistry: { 'demo-preset': preset } },
    );
    expect(resolved.toolchain).toEqual({ test: 'pnpm test', lint: 'pnpm lint' });
  });

  it('supports recursive extends (preset extending preset)', () => {
    const base: Constitution = { rules: [patternRule('base-rule')] };
    const middle: Constitution = { extends: ['base'], rules: [patternRule('middle-rule')] };
    const resolved = resolveConstitution(
      { extends: ['middle'], rules: [patternRule('own')] },
      { presetRegistry: { base, middle } },
    );
    expect([...resolved.rules.keys()].sort()).toEqual(['base-rule', 'middle-rule', 'own']);
  });
});

describe('resolveConstitution — override + disable', () => {
  it('applies severity override and keeps the rule', () => {
    const resolved = resolveConstitution({
      rules: [patternRule('a', { defaultSeverity: 'CRITICAL' })],
      override: { a: { severity: 'MED', rationale: 'phased adoption' } },
    });
    expect(resolved.rules.get('a')?.defaultSeverity).toBe('MED');
  });

  it('removes a rule entirely on disable', () => {
    const resolved = resolveConstitution({
      rules: [patternRule('a')],
      disable: { a: 'not relevant here' },
    });
    expect(resolved.rules.has('a')).toBe(false);
  });

  it('throws when override targets an unknown rule', () => {
    expect(() =>
      resolveConstitution({
        rules: [patternRule('a')],
        override: { 'does-not-exist': { severity: 'LOW', rationale: 'why' } },
      }),
    ).toThrowError(/unknown rule "does-not-exist"/);
  });

  it('throws when disable targets an unknown rule', () => {
    expect(() =>
      resolveConstitution({
        rules: [patternRule('a')],
        disable: { 'does-not-exist': 'why' },
      }),
    ).toThrowError(/unknown rule "does-not-exist"/);
  });

  it('lets override target a rule that came from extends', () => {
    const preset: Constitution = {
      rules: [patternRule('shared', { defaultSeverity: 'CRITICAL' })],
    };
    const resolved = resolveConstitution(
      {
        extends: ['p'],
        rules: [patternRule('own')],
        override: { shared: { severity: 'HIGH', rationale: 'will retire' } },
      },
      { presetRegistry: { p: preset } },
    );
    expect(resolved.rules.get('shared')?.defaultSeverity).toBe('HIGH');
  });
});

describe('resolveScope', () => {
  const emptyConstitution = resolveConstitution({
    rules: [patternRule('placeholder')],
  });

  it('applies code-writer built-in defaults', () => {
    const resolved = resolveScope(scope('code-writer'), emptyConstitution);
    expect(resolved.expectations.allTestsPass).toBe(true);
    expect(resolved.expectations.lintClean).toBe(true);
    expect(resolved.expectations.coverageNonDecreasing).toBe(true);
  });

  it('applies test-writer built-in defaults', () => {
    const resolved = resolveScope(scope('test-writer'), emptyConstitution);
    expect(resolved.expectations.newTestsFail).toBe(true);
    expect(resolved.expectations.existingTestsPass).toBe(true);
  });

  it('lets scope.expectations override role defaults per key', () => {
    const resolved = resolveScope(
      scope('code-writer', { expectations: { coverageNonDecreasing: false } }),
      emptyConstitution,
    );
    expect(resolved.expectations.coverageNonDecreasing).toBe(false);
    expect(resolved.expectations.allTestsPass).toBe(true); // other defaults preserved
  });

  it('uses a custom role from the resolved constitution', () => {
    const resolved = resolveConstitution({
      rules: [patternRule('placeholder')],
      roles: {
        'migration-writer': {
          defaultEditable: ['migrations/**'],
          expectations: { existingTestsPass: true },
        },
      },
    });
    const r = resolveScope(scope('migration-writer'), resolved);
    expect(r.editable).toEqual(['migrations/**']);
    expect(r.expectations.existingTestsPass).toBe(true);
  });

  it('throws on an unknown role', () => {
    expect(() => resolveScope(scope('nonexistent-role'), emptyConstitution)).toThrowError(
      /unknown role "nonexistent-role"/,
    );
  });

  it('uses scope.editable over custom role defaultEditable when both set', () => {
    const resolved = resolveConstitution({
      rules: [patternRule('placeholder')],
      roles: {
        custom: {
          defaultEditable: ['default/**'],
          expectations: {},
        },
      },
    });
    const r = resolveScope(scope('custom', { editable: ['explicit/**'] }), resolved);
    expect(r.editable).toEqual(['explicit/**']);
  });

  it('carries optional spec, deliverable, relatedRules through', () => {
    const r = resolveScope(
      scope('free-form', {
        spec: 'docs/spec.md',
        deliverable: 'rate limiter live',
        relatedRules: ['no-disabled-tests'],
      }),
      emptyConstitution,
    );
    expect(r.spec).toBe('docs/spec.md');
    expect(r.deliverable).toBe('rate limiter live');
    expect(r.relatedRules).toEqual(['no-disabled-tests']);
  });
});
