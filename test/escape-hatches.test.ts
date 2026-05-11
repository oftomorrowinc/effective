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
    context: 'sample',
    retirementCondition: 'never',
    addedDate: '2026-05-11',
    status: 'active',
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
