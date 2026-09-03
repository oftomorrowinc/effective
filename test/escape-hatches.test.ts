import { describe, expect, it } from 'vitest';
import { scanFileForEscapeHatches, scanFilesForEscapeHatches } from '../src/escape-hatches/scan.js';
import { validateEscapeHatches } from '../src/escape-hatches/validate.js';
import type { ChangedFile } from '../src/source/types.js';
import type { EscapeHatch, Exception, ExceptionRegistry } from '../src/schemas.js';

function file(path: string, content: string): ChangedFile {
  return { path, content, status: 'modified' };
}

function exception(over: Partial<Exception> = {}): Exception {
  return {
    id: 'sample',
    category: 'cli-fatal-exit',
    mechanism: 'c8-ignore',
    context: 'sample',
    retirementCondition: 'never',
    addedDate: '2026-05-11',
    status: 'active',
    // Scoped by default: an unbound exception is a skeleton key, and
    // the validator says so. Tests about OTHER behaviors shouldn't have
    // to absorb that finding — the ones that are about it opt out.
    appliesTo: ['src/**'],
    ...over,
  };
}

describe('scanFileForEscapeHatches', () => {
  it('finds a c8 ignore comment with exception id and justification', () => {
    const f = file(
      'src/cli.ts',
      `function main() {\n  /* c8 ignore start -- exception-id: cli-fatal-exit unreachable in unit tests */\n  process.exit(0);\n}\n`,
    );
    const hatches = scanFileForEscapeHatches(f);
    expect(hatches.length).toBe(1);
    expect(hatches[0]?.kind).toBe('c8-ignore');
    expect(hatches[0]?.exceptionId).toBe('cli-fatal-exit');
    expect(hatches[0]?.inlineJustification).toMatch(/unreachable/);
    expect(hatches[0]?.location.line).toBe(2);
  });

  it('finds @ts-expect-error with no ref (legacy hatch)', () => {
    const f = file('src/a.ts', `// @ts-expect-error legacy\nconst x: number = '1';\n`);
    const hatches = scanFileForEscapeHatches(f);
    expect(hatches.length).toBe(1);
    expect(hatches[0]?.kind).toBe('ts-expect-error');
    expect(hatches[0]?.exceptionId).toBeUndefined();
  });

  it('captures the list of disabled eslint rules', () => {
    const f = file(
      'src/a.ts',
      `// eslint-disable-next-line no-console, security/detect-object-injection -- exception-id: cli-fatal-exit logging`,
    );
    const hatches = scanFileForEscapeHatches(f);
    const hatch = hatches[0] as EscapeHatch & { rules?: string[] };
    expect(hatch.rules).toEqual(['no-console', 'security/detect-object-injection']);
    expect(hatch.exceptionId).toBe('cli-fatal-exit');
  });

  it('finds prettier-ignore', () => {
    const f = file('src/a.ts', `// prettier-ignore\nconst formatted = matrix;`);
    expect(scanFileForEscapeHatches(f)[0]?.kind).toBe('prettier-ignore');
  });

  it('skips deleted files', () => {
    expect(scanFileForEscapeHatches({ path: 'x', content: 'whatever', status: 'deleted' })).toEqual(
      [],
    );
  });

  it('handles block-comment c8 ignore', () => {
    const f = file('src/a.ts', `/* c8 ignore next */ const x = 1;`);
    expect(scanFileForEscapeHatches(f)[0]?.kind).toBe('c8-ignore');
  });

  it('scans many files at once', () => {
    const results = scanFilesForEscapeHatches([
      file('a.ts', `// @ts-expect-error x`),
      file('b.ts', `// eslint-disable-next-line foo -- exception-id: cli-fatal-exit y`),
    ]);
    expect(results.length).toBe(2);
  });

  it('skips non-TS/JS files so docs and fixtures are not flagged', () => {
    const md = file(
      'README.md',
      '```ts\n// @ts-expect-error example\nconst x: number = "1";\n```\n',
    );
    expect(scanFileForEscapeHatches(md)).toEqual([]);

    const txt = file('notes.txt', '/* c8 ignore next */ const x = 1;');
    expect(scanFileForEscapeHatches(txt)).toEqual([]);
  });
});

function hatch(over: Partial<EscapeHatch> = {}): EscapeHatch {
  return {
    location: { file: 'src/a.ts', line: 10 },
    kind: 'c8-ignore',
    ...over,
  };
}

describe('validateEscapeHatches', () => {
  const registry: ExceptionRegistry = {
    'cli-fatal-exit': exception({ id: 'cli-fatal-exit', status: 'active' }),
    'old-thing': exception({ id: 'old-thing', status: 'retired' }),
    'soft-deprecated': exception({ id: 'soft-deprecated', status: 'deprecated' }),
  };

  it('passes a hatch with an active, registered exception-id', () => {
    const findings = validateEscapeHatches({
      escapeHatches: [hatch({ exceptionId: 'cli-fatal-exit' })],
      registry,
    });
    expect(findings).toEqual([]);
  });

  it('CRITICALs a citation whose exception does not cover this path', () => {
    const findings = validateEscapeHatches({
      escapeHatches: [
        hatch({ exceptionId: 'scoped', location: { file: 'api/handler.ts', line: 3 } }),
      ],
      registry: { scoped: exception({ id: 'scoped', appliesTo: ['src/cli/**'] }) },
    });
    expect(findings.length).toBe(1);
    expect(findings[0]?.severity).toBe('CRITICAL');
    expect(findings[0]?.evidence).toMatch(/does not cover api\/handler\.ts/);
  });

  it('accepts a citation inside the exception’s declared paths', () => {
    const findings = validateEscapeHatches({
      escapeHatches: [
        hatch({ exceptionId: 'scoped', location: { file: 'src/cli/run.ts', line: 3 } }),
      ],
      registry: { scoped: exception({ id: 'scoped', appliesTo: ['src/cli/**'] }) },
    });
    expect(findings).toEqual([]);
  });

  it('CRITICALs a citation that silences a rule the exception does not cover', () => {
    // The skeleton-key case: a coverage carve-out waving through a
    // security suppression because the id happened to resolve.
    const findings = validateEscapeHatches({
      escapeHatches: [
        hatch({
          exceptionId: 'narrow',
          kind: 'eslint-disable',
          rules: ['security/detect-eval-with-expression'],
        }),
      ],
      registry: {
        narrow: exception({
          id: 'narrow',
          mechanism: 'eslint-disable',
          rules: ['no-continue'],
        }),
      },
    });
    expect(findings.length).toBe(1);
    expect(findings[0]?.severity).toBe('CRITICAL');
    expect(findings[0]?.evidence).toMatch(/detect-eval-with-expression/);
  });

  it('accepts a citation that silences only rules the exception covers', () => {
    const findings = validateEscapeHatches({
      escapeHatches: [
        hatch({ exceptionId: 'narrow', kind: 'eslint-disable', rules: ['no-continue'] }),
      ],
      registry: {
        narrow: exception({ id: 'narrow', mechanism: 'eslint-disable', rules: ['no-continue'] }),
      },
    });
    expect(findings).toEqual([]);
  });

  it('discloses a citation to an exception that binds neither path nor rule', () => {
    const findings = validateEscapeHatches({
      escapeHatches: [hatch({ exceptionId: 'skeleton' })],
      registry: {
        skeleton: exception({ id: 'skeleton', appliesTo: undefined, rules: undefined }),
      },
    });
    expect(findings.length).toBe(1);
    expect(findings[0]?.severity).toBe('MED');
    expect(findings[0]?.evidence).toMatch(/binds no path or rule/);
  });

  it('lets the unscoped-citation severity be raised once a registry is bound', () => {
    const findings = validateEscapeHatches({
      escapeHatches: [hatch({ exceptionId: 'skeleton' })],
      registry: { skeleton: exception({ id: 'skeleton', appliesTo: undefined }) },
      unscopedExceptionSeverity: 'CRITICAL',
    });
    expect(findings[0]?.severity).toBe('CRITICAL');
  });

  it('CRITICALs a hatch with no exception-id', () => {
    const findings = validateEscapeHatches({
      escapeHatches: [hatch({ exceptionId: undefined })],
      registry,
    });
    expect(findings.length).toBe(1);
    expect(findings[0]?.severity).toBe('CRITICAL');
    expect(findings[0]?.evidence).toMatch(/no `exception-id:` reference/);
  });

  it('CRITICALs a hatch whose exception-id is unknown', () => {
    const findings = validateEscapeHatches({
      escapeHatches: [hatch({ exceptionId: 'nope' })],
      registry,
    });
    expect(findings[0]?.severity).toBe('CRITICAL');
    expect(findings[0]?.evidence).toMatch(/not in/);
  });

  it('CRITICALs a hatch citing a retired exception-id', () => {
    const findings = validateEscapeHatches({
      escapeHatches: [hatch({ exceptionId: 'old-thing' })],
      registry,
    });
    expect(findings[0]?.severity).toBe('CRITICAL');
    expect(findings[0]?.evidence).toMatch(/retired/);
  });

  it('HIGHs a hatch citing a deprecated exception-id', () => {
    const findings = validateEscapeHatches({
      escapeHatches: [hatch({ exceptionId: 'soft-deprecated' })],
      registry,
    });
    expect(findings[0]?.severity).toBe('HIGH');
  });

  it('CRITICALs a hatch whose mechanism does not match the cited exception', () => {
    const findings = validateEscapeHatches({
      escapeHatches: [
        hatch({
          kind: 'eslint-disable',
          exceptionId: 'cli-fatal-exit', // registered as c8-ignore
        }),
      ],
      registry,
    });
    expect(findings.length).toBe(1);
    expect(findings[0]?.severity).toBe('CRITICAL');
    expect(findings[0]?.evidence).toMatch(/c8-ignore, not eslint-disable/);
  });

  it('accepts mechanism-agnostic exceptions (mechanism: null) on any hatch kind', () => {
    const findings = validateEscapeHatches({
      escapeHatches: [hatch({ kind: 'prettier-ignore', exceptionId: 'broad-rule' })],
      registry: {
        'broad-rule': exception({ id: 'broad-rule', mechanism: null }),
      },
    });
    expect(findings).toEqual([]);
  });

  it('respects severity overrides', () => {
    const findings = validateEscapeHatches({
      escapeHatches: [hatch({ exceptionId: undefined })],
      registry,
      missingRefSeverity: 'MED',
    });
    expect(findings[0]?.severity).toBe('MED');
  });

  it('emits findings with the configured ruleId and category', () => {
    const findings = validateEscapeHatches({
      escapeHatches: [hatch({ exceptionId: undefined })],
      registry,
      ruleId: 'my.custom-rule',
      category: 'governance',
    });
    expect(findings[0]?.ruleId).toBe('my.custom-rule');
    expect(findings[0]?.category).toBe('governance');
  });
});
