import { describe, expect, it } from 'vitest';
import { verify } from '../src/verify.js';
import type { InlineSource } from '../src/source/inline.js';
import { changed, scope } from './_helpers.js';

function inlineSrc(path: string, content: string): InlineSource {
  return { kind: 'inline', changedFiles: [changed(path, content)] };
}

const debugSrc = (content: string): InlineSource => inlineSrc('src/app.ts', content);
const secretSrc = (content: string): InlineSource => inlineSrc('src/config.ts', content);

describe('no-stray-debug-output (foundation)', () => {
  const src = debugSrc;

  it('flags console.log', async () => {
    const result = await verify({
      scope: scope('code-writer'),
      config: { extends: ['recommended'] },
      source: src('export function go() { console.log("hi"); }'),
    });
    expect(result.findings.some((f) => f.ruleId === 'no-stray-debug-output')).toBe(true);
  });

  it('flags every console.* shape (warn, error, debug, info, trace)', async () => {
    for (const method of ['warn', 'error', 'debug', 'info', 'trace'] as const) {
      const result = await verify({
        scope: scope('code-writer'),
        config: { extends: ['recommended'] },
        source: src(`export function go() { console.${method}("x"); }`),
      });
      expect(
        result.findings.some((f) => f.ruleId === 'no-stray-debug-output'),
        `should flag console.${method}`,
      ).toBe(true);
    }
  });

  it('flags a bare `debugger` statement', async () => {
    const result = await verify({
      scope: scope('code-writer'),
      config: { extends: ['recommended'] },
      source: src('export function go() { debugger; }'),
    });
    expect(result.findings.some((f) => f.ruleId === 'no-stray-debug-output')).toBe(true);
  });

  it('flags `// DEBUG` markers', async () => {
    const result = await verify({
      scope: scope('code-writer'),
      config: { extends: ['recommended'] },
      source: src('// DEBUG remove before commit\nexport const x = 1;\n'),
    });
    expect(result.findings.some((f) => f.ruleId === 'no-stray-debug-output')).toBe(true);
  });

  it('is silent on clean code', async () => {
    const result = await verify({
      scope: scope('code-writer'),
      config: { extends: ['recommended'] },
      source: src('export const x = 1;\n'),
    });
    expect(result.findings.some((f) => f.ruleId === 'no-stray-debug-output')).toBe(false);
  });

  it('does not scan test files', async () => {
    const result = await verify({
      scope: scope('code-writer'),
      config: { extends: ['recommended'] },
      source: {
        kind: 'inline',
        changedFiles: [changed('src/app.test.ts', 'console.log("debug a failing test");')],
      },
    });
    expect(result.findings.some((f) => f.ruleId === 'no-stray-debug-output')).toBe(false);
  });

  it('does not apply for the reviewer role', async () => {
    const result = await verify({
      scope: scope('reviewer'),
      config: { extends: ['recommended'] },
      source: src('console.log("x");'),
    });
    expect(result.findings.some((f) => f.ruleId === 'no-stray-debug-output')).toBe(false);
  });
});

describe('no-hardcoded-secrets (foundation)', () => {
  const src = secretSrc;

  // Build token-shaped fixtures at runtime via concatenation so the test
  // file itself does not contain a contiguous real-shaped token (which
  // would trip secretlint's own pre-commit hook).
  const cases: { name: string; token: string }[] = [
    { name: 'AWS access key', token: 'AKIA' + 'IOSFODNN7EXAMPLE' },
    {
      name: 'GitHub PAT (ghp_)',
      token: 'ghp' + '_1234567890abcdefghijklmnopqrstuvwxyz12',
    },
    {
      name: 'GitHub OAuth (gho_)',
      token: 'gho' + '_1234567890abcdefghijklmnopqrstuvwxyz12',
    },
    {
      name: 'JWT',
      token:
        'eyJhbGciOiJIUzI1NiJ9' + '.eyJzdWIiOiIxMjMifQ.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
    },
    {
      name: 'Slack token (xoxb-)',
      token: 'xoxb' + '-1234567890-1234567890123-AbCdEfGhIjKlMnOpQrStUvWx',
    },
    {
      name: 'Stripe secret key',
      token: 'sk_live' + '_1234567890abcdefghijklmnopqr',
    },
    {
      name: 'Stripe publishable key',
      token: 'pk_test' + '_1234567890abcdefghijklmnopqr',
    },
    {
      name: 'Google API key',
      token: 'AIza' + 'SyA-1234567890abcdefghijklmnopqrstuv',
    },
    {
      name: 'Anthropic API key',
      token: 'sk-ant' + '-api03-1234567890abcdefghijklmnopqrstuvwxyz1234567890',
    },
  ];

  for (const c of cases) {
    it(`flags ${c.name}`, async () => {
      const result = await verify({
        scope: scope('code-writer'),
        config: { extends: ['recommended'] },
        source: src(`const k = "${c.token}";`),
      });
      expect(
        result.findings.some((f) => f.ruleId === 'no-hardcoded-secrets'),
        `expected ${c.name} to flag`,
      ).toBe(true);
    });
  }

  it('does not flag obvious placeholders', async () => {
    const result = await verify({
      scope: scope('code-writer'),
      config: { extends: ['recommended'] },
      source: src(
        'const apiKey = process.env.ANTHROPIC_API_KEY;\nconst test = "test-token-placeholder";',
      ),
    });
    expect(result.findings.some((f) => f.ruleId === 'no-hardcoded-secrets')).toBe(false);
  });

  it('also flags real-shaped tokens in test files', async () => {
    const token = 'AKIA' + 'IOSFODNN7EXAMPLE';
    const result = await verify({
      scope: scope('code-writer'),
      config: { extends: ['recommended'] },
      source: {
        kind: 'inline',
        changedFiles: [changed('src/api.test.ts', `const k = "${token}"; // accidental real key`)],
      },
    });
    expect(result.findings.some((f) => f.ruleId === 'no-hardcoded-secrets')).toBe(true);
  });

  it('fails the verdict at CRITICAL', async () => {
    const token = 'AKIA' + 'IOSFODNN7EXAMPLE';
    const result = await verify({
      scope: scope('code-writer'),
      config: { extends: ['recommended'] },
      source: src(`const k = "${token}";`),
    });
    expect(result.verdict).toBe('fail');
  });
});
