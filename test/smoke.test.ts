import { describe, expect, it } from 'vitest';
import {
  defineConfig,
  defineExceptions,
  kickBack,
  prepare,
  presets,
  rule,
  seeds,
  verify,
} from '../src/index.js';
import { Severity, Verdict } from '../src/schemas.js';

describe('public surface', () => {
  it('exports the three engine entry points as functions', () => {
    expect(typeof prepare).toBe('function');
    expect(typeof verify).toBe('function');
    expect(typeof kickBack).toBe('function');
  });

  it('exports defineConfig and defineExceptions', () => {
    expect(typeof defineConfig).toBe('function');
    expect(typeof defineExceptions).toBe('function');
  });

  it('exports the rule factory namespace', () => {
    expect(typeof rule.forbidPattern).toBe('function');
    expect(typeof rule.requirePattern).toBe('function');
    expect(typeof rule.custom).toBe('function');
  });

  it('exports the presets namespace', () => {
    expect(presets).toBeDefined();
    expect('recommended' in presets).toBe(true);
  });

  it('exports seed-data namespaces', () => {
    expect(seeds.builtInExceptions).toBeDefined();
    expect(seeds.seedCatalogue).toBeDefined();
    expect(seeds.seedPrinciples).toBeDefined();
  });
});

describe('severity vocabulary', () => {
  it('uses CRITICAL | HIGH | MED | LOW', () => {
    expect(Severity.options).toEqual(['CRITICAL', 'HIGH', 'MED', 'LOW']);
  });

  it('parses each level', () => {
    expect(Severity.parse('CRITICAL')).toBe('CRITICAL');
    expect(Severity.parse('HIGH')).toBe('HIGH');
    expect(Severity.parse('MED')).toBe('MED');
    expect(Severity.parse('LOW')).toBe('LOW');
  });

  it('rejects retired tier names', () => {
    expect(() => Severity.parse('BLOCK')).toThrow();
    expect(() => Severity.parse('NIT')).toThrow();
    expect(() => Severity.parse('WARN')).toThrow();
  });

  it('Verdict still exposes pass | fail | needs-review', () => {
    expect(Verdict.options).toEqual(['pass', 'fail', 'needs-review']);
  });
});

describe('phase-0 stubs: clear failure mode', () => {
  const stubScope = { goal: 'noop', editable: [], role: 'free-form' as const };
  const stubConfig = { rules: [] } as never;

  it('prepare() throws a phase-0 stub error', () => {
    expect(() => prepare({ scope: stubScope, config: stubConfig, original: 'x' })).toThrowError(
      /phase 1 stub/,
    );
  });

  it('verify() throws a phase-0 stub error', () => {
    expect(() =>
      verify({
        scope: stubScope,
        config: stubConfig,
        source: { kind: 'inline', changedFiles: [] },
      }),
    ).toThrowError(/phase 1 stub/);
  });

  it('kickBack() throws a phase-0 stub error', () => {
    expect(() => kickBack({ findings: [], previousPrompt: '' })).toThrowError(/phase 1 stub/);
  });

  it('rule.forbidPattern throws a phase-0 stub error', () => {
    expect(() => rule.forbidPattern(/x/)).toThrowError(/phase 1 stub/);
  });

  it('rule.requirePattern throws a phase-0 stub error', () => {
    expect(() => rule.requirePattern(/x/)).toThrowError(/phase 1 stub/);
  });

  it('rule.custom throws a phase-0 stub error', () => {
    expect(() => rule.custom({})).toThrowError(/phase 1 stub/);
  });
});

describe('defineConfig + defineExceptions: Zod parse passthrough', () => {
  it('defineConfig rejects an empty constitution', () => {
    expect(() => defineConfig({})).toThrow();
  });

  it('defineConfig accepts a minimal valid constitution', () => {
    const result = defineConfig({ extends: ['some-preset'] });
    expect(result.extends).toEqual(['some-preset']);
  });

  it('defineConfig rejects a constitution with neither rules nor extends', () => {
    expect(() => defineConfig({ disable: { foo: 'reason' } })).toThrowError(
      /Constitution must define rules or extend at least one preset/,
    );
  });

  it('defineConfig accepts a constitution with rules but no extends', () => {
    const result = defineConfig({
      rules: [
        {
          kind: 'pattern',
          id: 'no-todo',
          category: 'custom',
          defaultSeverity: 'MED',
          description: 'forbid bare TODO',
          pattern: /TODO/,
          forbidden: true,
          inGlob: '**/*',
          prompt: { summary: 'No TODO.', guidance: 'Do not commit bare TODO markers.' },
        },
      ],
    });
    expect(result.rules?.length).toBe(1);
  });

  it('defineExceptions accepts an empty registry', () => {
    const result = defineExceptions({});
    expect(result).toEqual({});
  });

  it('defineExceptions parses a valid exception entry', () => {
    const result = defineExceptions({
      'sample-exception': {
        id: 'sample-exception',
        category: 'cli-fatal-exit',
        context: 'Sample context to satisfy the schema.',
        retirementCondition: 'When the sample is no longer needed.',
        addedDate: '2026-05-11',
        status: 'active',
      },
    });
    expect(result['sample-exception']?.status).toBe('active');
  });
});

describe('seed data integrity', () => {
  it('built-in exceptions are non-empty and well-shaped', () => {
    const exceptions = Object.values(seeds.builtInExceptions);
    expect(exceptions.length).toBeGreaterThan(0);
    for (const ex of exceptions) {
      expect(typeof ex.id).toBe('string');
      expect(typeof ex.category).toBe('string');
      expect(typeof ex.context).toBe('string');
      expect(typeof ex.retirementCondition).toBe('string');
      expect(typeof ex.addedDate).toBe('string');
    }
  });

  it('seed catalogue entries have at least one observed instance', () => {
    const entries = Object.values(seeds.seedCatalogue);
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.observedInstances.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('seed principles have context and decision text', () => {
    const principles = Object.values(seeds.seedPrinciples);
    expect(principles.length).toBeGreaterThan(0);
    for (const p of principles) {
      expect(p.context.length).toBeGreaterThan(0);
      expect(p.decision.length).toBeGreaterThan(0);
    }
  });
});
