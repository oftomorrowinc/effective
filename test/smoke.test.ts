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

describe('phase-1 progress: orchestrators reachable', () => {
  const stubScope = { goal: 'noop', editable: [], role: 'free-form' as const };

  it('prepare() returns a non-empty augmented prompt', () => {
    const out = prepare({
      scope: stubScope,
      config: {
        rules: [
          {
            kind: 'pattern',
            id: 'demo',
            category: 'custom',
            defaultSeverity: 'CRITICAL',
            description: 'demo',
            pattern: /x/,
            forbidden: true,
            inGlob: '**/*',
            prompt: { summary: 'demo', guidance: 'demo guidance' },
          },
        ],
      } as never,
      original: 'x',
    });
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

  it('verify() resolves to a pass verdict on an empty diff with a non-empty constitution', async () => {
    const result = await verify({
      scope: stubScope,
      config: {
        rules: [
          {
            kind: 'pattern',
            id: 'p',
            category: 'custom',
            defaultSeverity: 'CRITICAL',
            description: 'd',
            pattern: /never/,
            forbidden: true,
            inGlob: '**/*',
            prompt: { summary: 's', guidance: 'g' },
          },
        ],
      } as never,
      source: { kind: 'inline', changedFiles: [] },
    });
    expect(result.verdict).toBe('pass');
    expect(result.findings).toEqual([]);
  });

  it('kickBack() returns a non-empty follow-up prompt', () => {
    const out = kickBack({ findings: [], previousPrompt: 'original task' });
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });
});

describe('rule factories: build well-formed rule objects', () => {
  it('rule.forbidPattern returns a PatternRule with forbidden=true', () => {
    const r = rule.forbidPattern(/console\.log/);
    expect(r.kind).toBe('pattern');
    expect(r.forbidden).toBe(true);
    expect(r.inGlob).toBe('**/*');
    expect(r.prompt.summary.length).toBeGreaterThan(0);
  });

  it('rule.requirePattern returns a PatternRule with forbidden=false', () => {
    const r = rule.requirePattern(/import .* from 'zod'/, { in: 'schemas/**' });
    expect(r.kind).toBe('pattern');
    expect(r.forbidden).toBe(false);
    expect(r.inGlob).toBe('schemas/**');
  });

  it('rule.lane returns a LaneRule with sane defaults', () => {
    const r = rule.lane();
    expect(r.kind).toBe('lane');
    expect(r.flagDeletions).toBe(true);
    expect(r.id).toBe('lane.editable-respected');
  });

  it('rule.toolchain rejects custom without name', () => {
    expect(() => rule.toolchain({ tool: 'custom', failOn: 'non-zero-exit' })).toThrowError(
      /tool: "custom".*name/,
    );
  });

  it('rule.toolchain accepts custom with name', () => {
    const r = rule.toolchain({ tool: 'custom', name: 'my-tool', failOn: 'any-output' });
    expect(r.kind).toBe('toolchain');
    expect(r.tool).toBe('custom');
    expect(r.name).toBe('my-tool');
  });

  it('rule.custom returns a CustomRule with the provided checkRef', () => {
    const r = rule.custom({
      id: 'no-default-exports-in-services',
      checkRef: 'noDefaultExportsInServices',
      prompt: { summary: 'Use named exports.', guidance: 'Avoid default exports in services/**.' },
    });
    expect(r.kind).toBe('custom');
    expect(r.checkRef).toBe('noDefaultExportsInServices');
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
        mechanism: 'c8-ignore',
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

  it('seed catalogue includes the 7 reviewer-pattern entries', () => {
    const ids = new Set(Object.keys(seeds.seedCatalogue));
    expect(ids).toContain('throw-swallowed-by-catch');
    expect(ids).toContain('primed-shell-verification');
    expect(ids).toContain('wrapper-over-first-class-primitive');
    expect(ids).toContain('write-then-validate-without-transaction');
    expect(ids).toContain('sketch-contradiction-self-correction');
    expect(ids).toContain('retry-scope-expansion-into-architectural-config');
    expect(ids).toContain('files-scoped-override-requires-cited-decision');
  });

  it('sketch-contradiction-self-correction is the only positive-signal entry', () => {
    const positives = Object.values(seeds.seedCatalogue).filter(
      (e) => e.valence === 'positive-signal',
    );
    expect(positives.length).toBe(1);
    expect(positives[0]?.id).toBe('sketch-contradiction-self-correction');
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
