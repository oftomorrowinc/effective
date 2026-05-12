import { describe, expect, it } from 'vitest';
import { checkPattern } from '../src/rules/kinds/pattern.js';
import { compilePatterns } from '../src/glob.js';
import type { PatternRule } from '../src/schemas.js';
import type { ChangedFile, VerifyContext } from '../src/source/types.js';

function rule(overrides: Partial<PatternRule> = {}): PatternRule {
  return {
    kind: 'pattern',
    id: 'p',
    category: 'custom',
    defaultSeverity: 'CRITICAL',
    description: 'test rule',
    pattern: /console\.log/g,
    forbidden: true,
    inGlob: '**/*',
    prompt: { summary: 'No console.log.', guidance: 'Use the logger.' },
    ...overrides,
  };
}

function ctx(files: ChangedFile[]): VerifyContext {
  return {
    changedFiles: files,
    editableMatcher: compilePatterns(['**/*']),
    protectedPaths: [],
    scope: {
      goal: '',
      editable: ['**/*'],
      role: 'free-form',
      expectations: {},
    },
    artifacts: {},
    toolchainResults: {},
    customChecks: {},
    exceptionRegistry: {},
  };
}

function file(
  path: string,
  content: string,
  status: ChangedFile['status'] = 'modified',
): ChangedFile {
  return { path, content, status };
}

describe('checkPattern — forbidden', () => {
  it('emits a finding per match with file:line:column', () => {
    const findings = checkPattern(
      rule(),
      ctx([file('app/api.ts', "const x = 1;\nconsole.log(x);\nconsole.log('again');")]),
    );
    expect(findings.length).toBe(2);
    expect(findings[0]?.location?.line).toBe(2);
    expect(findings[1]?.location?.line).toBe(3);
    expect(findings[0]?.severity).toBe('CRITICAL');
  });

  it('respects inGlob', () => {
    const findings = checkPattern(
      rule({ inGlob: 'src/**' }),
      ctx([
        file('src/handler.ts', 'console.log("nope")'),
        file('test/handler.test.ts', 'console.log("ok in test")'),
      ]),
    );
    expect(findings.length).toBe(1);
    expect(findings[0]?.location?.file).toBe('src/handler.ts');
  });

  it('respects notInGlob (carve-out)', () => {
    const findings = checkPattern(
      rule({ inGlob: 'src/**', notInGlob: 'src/**/__tests__/**' }),
      ctx([
        file('src/api.ts', 'console.log(1)'),
        file('src/api/__tests__/api.test.ts', 'console.log(2)'),
      ]),
    );
    expect(findings.length).toBe(1);
    expect(findings[0]?.location?.file).toBe('src/api.ts');
  });

  it('skips deleted files (no false positives from removed content)', () => {
    const findings = checkPattern(rule(), ctx([file('legacy.ts', 'console.log(1)', 'deleted')]));
    expect(findings.length).toBe(0);
  });

  it('handles string patterns (literal)', () => {
    // The TODO marker is in a line comment; rule opts into matching there.
    const findings = checkPattern(
      rule({ pattern: 'TODO(@nobody)', matchInComments: true }),
      ctx([file('a.ts', 'const x = 1; // TODO(@nobody): clean up')]),
    );
    expect(findings.length).toBe(1);
    expect(findings[0]?.message).toContain('TODO(@nobody)');
  });

  it('skips matches in comments by default (region-aware detection)', () => {
    const findings = checkPattern(
      rule({ pattern: /console\.log/ }),
      ctx([file('a.ts', '// console.log is forbidden\nconst x = 1;')]),
    );
    expect(findings).toEqual([]);
  });

  it('skips matches in string literals by default', () => {
    const findings = checkPattern(
      rule({ pattern: /TODO/ }),
      ctx([file('a.ts', 'const x = "TODO is a string here";')]),
    );
    expect(findings).toEqual([]);
  });

  it('matches in strings when matchInStrings is true', () => {
    // Token built via concatenation so the test FILE source doesn't
    // contain the contiguous shape (audit would otherwise flag the
    // fixture itself); runtime `f.content` is the concatenated full
    // string the rule under test scans.
    const token = 'AKIA' + '1234567890ABCDEF';
    const findings = checkPattern(
      rule({ pattern: /AKIA[A-Z0-9]+/, matchInStrings: true }),
      ctx([file('a.ts', `const k = "${token}";`)]),
    );
    expect(findings.length).toBe(1);
  });

  it('matches plain text in non-JS file extensions (no tokenizer)', () => {
    // .md / .json don't get region classification — pattern matches as
    // plain text regardless of where in the file it appears.
    const findings = checkPattern(
      rule({ pattern: /TODO/ }),
      ctx([file('a.md', 'This document has a TODO inside backticks: `TODO`')]),
    );
    expect(findings.length).toBe(2);
  });

  it('preserves regex flags and adds /g if missing', () => {
    const findings = checkPattern(
      rule({ pattern: /console\.log/i }),
      ctx([file('a.ts', 'CONSOLE.LOG(1)\nConsole.Log(2)')]),
    );
    expect(findings.length).toBe(2);
  });
});

describe('checkPattern — required', () => {
  it('emits a finding when the pattern is missing', () => {
    const findings = checkPattern(
      rule({ forbidden: false, pattern: /import .* from 'zod'/ }),
      ctx([file('schemas/foo.ts', 'export const Foo = {}')]),
    );
    expect(findings.length).toBe(1);
    expect(findings[0]?.evidence).toMatch(/no occurrences/);
  });

  it('emits no finding when the required pattern is present', () => {
    const findings = checkPattern(
      rule({ forbidden: false, pattern: /import .* from 'zod'/ }),
      ctx([file('schemas/foo.ts', "import { z } from 'zod';\nexport const Foo = z.object({});")]),
    );
    expect(findings.length).toBe(0);
  });

  it('only flags files inside inGlob', () => {
    const findings = checkPattern(
      rule({ forbidden: false, pattern: /import .* from 'zod'/, inGlob: 'schemas/**' }),
      ctx([file('schemas/a.ts', "import { z } from 'zod'"), file('src/util.ts', 'no zod here')]),
    );
    expect(findings.length).toBe(0);
  });
});
