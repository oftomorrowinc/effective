import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { checkSchema } from '../src/rules/kinds/schema.js';
import { checkToolchain } from '../src/rules/kinds/toolchain.js';
import { checkCustom } from '../src/rules/kinds/custom.js';
import { checkSpec } from '../src/rules/kinds/spec.js';
import { compilePatterns } from '../src/glob.js';
import type { CustomRule, SchemaRule, SpecRule, ToolchainRule } from '../src/schemas.js';
import type { ChangedFile, ToolchainResult, VerifyContext } from '../src/source/types.js';

function ctx(overrides: Partial<VerifyContext> = {}): VerifyContext {
  return {
    changedFiles: [],
    editableMatcher: compilePatterns(['**/*']),
    protectedPaths: [],
    scope: {
      goal: 'sample',
      editable: ['**/*'],
      role: 'free-form',
      expectations: {},
    },
    artifacts: {},
    toolchainResults: {},
    customChecks: {},
    exceptionRegistry: {},
    ...overrides,
  };
}

describe('checkSchema', () => {
  const FrontmatterSchema = z.object({ id: z.string(), severity: z.string() });
  const baseRule: SchemaRule = {
    kind: 'schema',
    id: 'schema.frontmatter',
    category: 'data-discipline',
    defaultSeverity: 'CRITICAL',
    description: 'spec frontmatter',
    appliesTo: 'spec.frontmatter',
    schema: FrontmatterSchema,
    prompt: { summary: 'Frontmatter must validate.', guidance: 'Fill in id and severity.' },
  };

  it('passes when the artifact matches the schema', () => {
    expect(
      checkSchema(
        baseRule,
        ctx({ artifacts: { 'spec.frontmatter': { id: 'x', severity: 'CRITICAL' } } }),
      ),
    ).toEqual([]);
  });

  it('emits a finding per Zod issue when validation fails', () => {
    const findings = checkSchema(baseRule, ctx({ artifacts: { 'spec.frontmatter': { id: 'x' } } }));
    expect(findings.length).toBe(1);
    expect(findings[0]?.evidence).toMatch(/severity/);
  });

  it('flags missing artifact clearly', () => {
    const findings = checkSchema(baseRule, ctx());
    expect(findings.length).toBe(1);
    expect(findings[0]?.evidence).toMatch(/no artifact named/);
  });

  it('flags misconfigured schema (non-Zod value)', () => {
    const broken: SchemaRule = { ...baseRule, schema: { not: 'a zod schema' } };
    const findings = checkSchema(broken, ctx({ artifacts: { 'spec.frontmatter': { id: 'x' } } }));
    expect(findings[0]?.evidence).toMatch(/not a Zod schema/);
  });
});

function tcResult(over: Partial<ToolchainResult> = {}): ToolchainResult {
  return {
    tool: 'lint',
    exitCode: 0,
    stdout: '',
    stderr: '',
    ...over,
  };
}

describe('checkToolchain', () => {
  const baseRule: ToolchainRule = {
    kind: 'toolchain',
    id: 'toolchain.lint',
    category: 'toolchain',
    defaultSeverity: 'CRITICAL',
    description: 'lint gate',
    tool: 'lint',
    failOn: 'non-zero-exit',
    prompt: { summary: 'Lint must pass.', guidance: 'Fix the underlying issue, do not disable.' },
  };

  it('passes when failOn=non-zero-exit and exitCode is 0', () => {
    expect(checkToolchain(baseRule, ctx({ toolchainResults: { lint: tcResult() } }))).toEqual([]);
  });

  it('fails when failOn=non-zero-exit and exitCode is non-zero', () => {
    const findings = checkToolchain(
      baseRule,
      ctx({ toolchainResults: { lint: tcResult({ exitCode: 1 }) } }),
    );
    expect(findings.length).toBe(1);
    expect(findings[0]?.evidence).toMatch(/exited with code 1/);
  });

  it('fails when failOn=any-output and stdout has content', () => {
    const rule: ToolchainRule = { ...baseRule, failOn: 'any-output' };
    const findings = checkToolchain(
      rule,
      ctx({ toolchainResults: { lint: tcResult({ stdout: 'warning\n' }) } }),
    );
    expect(findings.length).toBe(1);
  });

  it('fails when failOn=count-non-zero and count > 0', () => {
    const rule: ToolchainRule = { ...baseRule, failOn: 'count-non-zero' };
    const findings = checkToolchain(
      rule,
      ctx({ toolchainResults: { lint: tcResult({ count: 3 }) } }),
    );
    expect(findings[0]?.evidence).toMatch(/3 issue/);
  });

  it('fails when failOn=count-increased and count > baselineCount', () => {
    const rule: ToolchainRule = { ...baseRule, failOn: 'count-increased' };
    const findings = checkToolchain(
      rule,
      ctx({ toolchainResults: { lint: tcResult({ count: 5, baselineCount: 3 }) } }),
    );
    expect(findings[0]?.evidence).toMatch(/from 3 to 5/);
  });

  it('flags missing toolchain result', () => {
    expect(checkToolchain(baseRule, ctx())[0]?.evidence).toMatch(/no toolchain result/);
  });

  it('uses rule.name as result key for tool="custom"', () => {
    const rule: ToolchainRule = {
      kind: 'toolchain',
      id: 'toolchain.custom',
      category: 'toolchain',
      defaultSeverity: 'CRITICAL',
      description: 'my custom gate',
      tool: 'custom',
      name: 'my-tool',
      failOn: 'non-zero-exit',
      prompt: { summary: 'Run my-tool.', guidance: 'Fix issues from my-tool.' },
    };
    expect(
      checkToolchain(rule, ctx({ toolchainResults: { 'my-tool': tcResult({ exitCode: 1 }) } })),
    ).toHaveLength(1);
  });

  it('includes a stderr tail in the aggregate message when no parsed findings exist', () => {
    const findings = checkToolchain(
      baseRule,
      ctx({
        toolchainResults: {
          lint: tcResult({
            exitCode: 1,
            stderr: 'fatal: cannot find tsconfig\nerror TS5083: cannot read file',
          }),
        },
      }),
    );
    expect(findings.length).toBe(1);
    expect(findings[0]?.message).toContain('cannot find tsconfig');
    expect(findings[0]?.message).toContain('error TS5083');
  });

  it("omits the stderr tail when the parser produced findings (don't drown the per-issue output)", () => {
    // When a parser successfully extracts per-issue findings, the raw
    // tail is redundant — and for JSON-emitting tools (eslint --format
    // json), the "tail" is one giant unformatted line that floods the
    // terminal. Aggregate's message stays short.
    const findings = checkToolchain(
      { ...baseRule, failOn: 'count-non-zero' },
      ctx({
        toolchainResults: {
          lint: tcResult({
            exitCode: 1,
            count: 1,
            stdout: '[{"filePath":"a.ts","messages":[{"ruleId":"r","severity":2,"message":"m"}]}]',
            findings: [
              {
                ruleId: 'eslint:no-console',
                severity: 'HIGH',
                category: 'toolchain',
                evidence: 'console.log used',
                message: 'ESLint reports no-console',
                source: { kind: 'toolchain', tool: 'lint' },
              },
            ],
          }),
        },
      }),
    );
    // Aggregate finding (first) + the one parsed finding (second).
    expect(findings).toHaveLength(2);
    const aggregate = findings[0];
    expect(aggregate?.message).not.toContain('filePath');
    expect(aggregate?.message).not.toContain('messages');
  });

  it('truncates super-long lines in the stderr tail (single-line JSON blob protection)', () => {
    const giantLine = 'x'.repeat(2000);
    const findings = checkToolchain(
      baseRule,
      ctx({
        toolchainResults: {
          lint: tcResult({
            exitCode: 1,
            stderr: giantLine,
          }),
        },
      }),
    );
    expect(findings.length).toBe(1);
    expect(findings[0]?.message).toContain('chars truncated');
    // Final message should not contain the full 2000-x run.
    expect((findings[0]?.message ?? '').includes('x'.repeat(1000))).toBe(false);
  });

  it('forwards pre-parsed findings even on pass', () => {
    const rule: ToolchainRule = { ...baseRule, failOn: 'non-zero-exit' };
    const findings = checkToolchain(
      rule,
      ctx({
        toolchainResults: {
          lint: tcResult({
            exitCode: 0,
            findings: [
              {
                ruleId: 'no-console',
                severity: 'LOW',
                category: 'toolchain',
                evidence: 'console.log',
                message: 'console.log used',
                source: { kind: 'toolchain', tool: 'lint' },
              },
            ],
          }),
        },
      }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe('no-console');
  });
});

describe('checkCustom', () => {
  const baseRule: CustomRule = {
    kind: 'custom',
    id: 'no-default-exports',
    category: 'architecture',
    defaultSeverity: 'CRITICAL',
    description: 'use named exports',
    checkRef: 'noDefaultExports',
    prompt: { summary: 'Named exports only.', guidance: 'No default exports in services/**.' },
  };

  it('flags missing checkRef in customChecks registry', async () => {
    const findings = await checkCustom(baseRule, ctx());
    expect(findings[0]?.evidence).toMatch(/not registered/);
  });

  it('forwards findings from a registered check', async () => {
    const findings = await checkCustom(
      baseRule,
      ctx({
        customChecks: {
          noDefaultExports: () => [
            {
              ruleId: baseRule.id,
              severity: 'CRITICAL',
              category: baseRule.category,
              evidence: 'export default {} found',
              message: 'no defaults',
              source: { kind: 'rule', ruleId: baseRule.id },
            },
          ],
        },
      }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.evidence).toMatch(/export default/);
  });

  it('awaits async checkers', async () => {
    const findings = await checkCustom(
      baseRule,
      ctx({
        customChecks: {
          noDefaultExports: async () =>
            await Promise.resolve([
              {
                ruleId: baseRule.id,
                severity: 'HIGH',
                category: baseRule.category,
                evidence: 'async finding',
                message: 'm',
                source: { kind: 'rule', ruleId: baseRule.id },
              },
            ]),
        },
      }),
    );
    expect(findings[0]?.evidence).toBe('async finding');
  });
});

function specFile(path: string, content: string): ChangedFile {
  return { path, content, status: 'modified' };
}

describe('checkSpec — test-names-land-verbatim', () => {
  const baseRule: SpecRule = {
    kind: 'spec',
    id: 'spec.test-names-land-verbatim',
    category: 'spec-discipline',
    defaultSeverity: 'CRITICAL',
    description: 'test names land verbatim',
    check: 'test-names-land-verbatim',
    prompt: { summary: 'Spec test names land.', guidance: 'Use the spec name verbatim.' },
  };

  it('passes when every spec name appears in a committed test', () => {
    const findings = checkSpec(
      baseRule,
      ctx({
        scope: {
          goal: '',
          editable: ['**/*'],
          role: 'test-writer',
          expectations: {},
          spec: 'docs/spec.md',
        },
        artifacts: {
          'docs/spec.md': '## tests\n- enforces the rate limit\n- returns 429 when exceeded\n',
        },
        changedFiles: [
          specFile(
            'test/rate-limit.test.ts',
            "it('enforces the rate limit', () => {});\nit('returns 429 when exceeded', () => {});",
          ),
        ],
      }),
    );
    expect(findings).toEqual([]);
  });

  it('flags spec names missing from committed tests', () => {
    const findings = checkSpec(
      baseRule,
      ctx({
        scope: {
          goal: '',
          editable: ['**/*'],
          role: 'test-writer',
          expectations: {},
          spec: 'docs/spec.md',
        },
        artifacts: { 'docs/spec.md': '- enforces the rate limit\n- returns 429 when exceeded\n' },
        changedFiles: [
          specFile('test/rate-limit.test.ts', "it('enforces the rate limit', () => {});"),
        ],
      }),
    );
    expect(findings.length).toBe(1);
    expect(findings[0]?.evidence).toMatch(/returns 429 when exceeded/);
  });

  it('is a no-op when scope.spec is not set (scope-conditional)', () => {
    expect(checkSpec(baseRule, ctx())).toEqual([]);
  });

  it('flags missing spec artifact', () => {
    const findings = checkSpec(
      baseRule,
      ctx({
        scope: {
          goal: '',
          editable: ['**/*'],
          role: 'test-writer',
          expectations: {},
          spec: 'docs/spec.md',
        },
      }),
    );
    expect(findings[0]?.evidence).toMatch(/no spec artifact registered/);
  });

  it('is a no-op for the other check kinds in phase 1', () => {
    const findings = checkSpec(
      { ...baseRule, check: 'assertions-not-narrowed' },
      ctx({
        scope: {
          goal: '',
          editable: ['**/*'],
          role: 'test-writer',
          expectations: {},
          spec: 'docs/spec.md',
        },
        artifacts: { 'docs/spec.md': '- whatever' },
        changedFiles: [],
      }),
    );
    expect(findings).toEqual([]);
  });
});

describe('checkToolchain — unmeasured output never passes count gates', () => {
  const countRule: ToolchainRule = {
    kind: 'toolchain',
    id: 'toolchain.lint-clean',
    category: 'toolchain',
    defaultSeverity: 'CRITICAL',
    description: 'lint gate',
    tool: 'lint',
    failOn: 'count-non-zero',
    prompt: { summary: 'Lint must pass.', guidance: 'Fix the underlying issue, do not disable.' },
  };

  it('falls back to exit code when count is absent (unparseable output) and FAILS on non-zero exit', () => {
    // Pre-fix behavior: 37 real lint errors with an unsupported parser
    // hint produced count undefined → (count ?? 0) > 0 → false → PASS.
    const findings = checkToolchain(
      countRule,
      ctx({ toolchainResults: { lint: tcResult({ exitCode: 1, stdout: '37 problems' }) } }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('could not be parsed');
  });

  it('passes when count is absent but the tool exited 0', () => {
    const findings = checkToolchain(
      countRule,
      ctx({ toolchainResults: { lint: tcResult({ exitCode: 0 }) } }),
    );
    expect(findings).toEqual([]);
  });

  it('still passes on a measured zero (count: 0) even with non-zero exit', () => {
    const findings = checkToolchain(
      countRule,
      ctx({ toolchainResults: { lint: tcResult({ exitCode: 1, count: 0 }) } }),
    );
    expect(findings).toEqual([]);
  });

  it('count-increased also falls back to exit code when count is absent', () => {
    const increasedRule: ToolchainRule = { ...countRule, failOn: 'count-increased' };
    const findings = checkToolchain(
      increasedRule,
      ctx({ toolchainResults: { lint: tcResult({ exitCode: 2, baselineCount: 5 }) } }),
    );
    expect(findings).toHaveLength(1);
  });
});

describe('checkSpec — test names containing quotes', () => {
  const specRule: SpecRule = {
    kind: 'spec',
    id: 'specd-test-names-land-verbatim',
    category: 'spec-discipline',
    defaultSeverity: 'CRITICAL',
    description: 'spec names land verbatim',
    check: 'test-names-land-verbatim',
    prompt: { summary: 'Spec names land verbatim.', guidance: 'Use the exact spec name.' },
  };

  it("does not false-flag a spec'd name containing an apostrophe", () => {
    const specBody = "- `keeps the user's name`\n";
    const file: ChangedFile = {
      path: 'test/user.test.ts',
      status: 'added',
      content: `it("keeps the user's name", () => {});\n`,
    };
    const findings = checkSpec(
      specRule,
      ctx({
        changedFiles: [file],
        scope: {
          goal: 'sample',
          editable: ['**/*'],
          role: 'test-writer',
          expectations: {},
          spec: 'spec.md',
        },
        artifacts: { 'spec.md': specBody },
      }),
    );
    expect(findings).toEqual([]);
  });
});
