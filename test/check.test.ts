import { describe, expect, it } from 'vitest';
import { checkRule } from '../src/rules/check.js';
import { compilePatterns } from '../src/glob.js';
import { ctx } from './_helpers.js';
import type { Rule } from '../src/schemas.js';
import type { ChangedFile } from '../src/source/types.js';

describe('checkRule — dispatch covers every kind', () => {
  it('routes pattern → checkPattern', async () => {
    const rule: Rule = {
      kind: 'pattern',
      id: 'p',
      category: 'custom',
      defaultSeverity: 'CRITICAL',
      description: 'd',
      pattern: 'NOPE',
      forbidden: true,
      inGlob: '**/*',
      prompt: { summary: 's', guidance: 'g' },
    };
    const file: ChangedFile = { path: 'a.ts', content: 'NOPE here', status: 'added' };
    const findings = await checkRule(rule, ctx({ changedFiles: [file] }));
    expect(findings.length).toBe(1);
  });

  it('routes lane → checkLane', async () => {
    const rule: Rule = {
      kind: 'lane',
      id: 'l',
      category: 'lane',
      defaultSeverity: 'CRITICAL',
      description: 'd',
      flagDeletions: true,
      prompt: { summary: 's', guidance: 'g' },
    };
    const file: ChangedFile = { path: 'outside.ts', content: '', status: 'added' };
    const findings = await checkRule(
      rule,
      ctx({
        changedFiles: [file],
        editableMatcher: compilePatterns(['app/**']),
        scope: { goal: '', editable: ['app/**'], role: 'code-writer', expectations: {} },
      }),
    );
    expect(findings.length).toBe(1);
  });

  it('routes toolchain → checkToolchain', async () => {
    const rule: Rule = {
      kind: 'toolchain',
      id: 't',
      category: 'toolchain',
      defaultSeverity: 'CRITICAL',
      description: 'd',
      tool: 'lint',
      failOn: 'non-zero-exit',
      prompt: { summary: 's', guidance: 'g' },
    };
    const findings = await checkRule(
      rule,
      ctx({
        toolchainResults: {
          lint: { tool: 'lint', exitCode: 1, stdout: '', stderr: '' },
        },
      }),
    );
    expect(findings.length).toBe(1);
  });

  it('routes custom → checkCustom (async)', async () => {
    const rule: Rule = {
      kind: 'custom',
      id: 'c',
      category: 'custom',
      defaultSeverity: 'HIGH',
      description: 'd',
      checkRef: 'myCheck',
      prompt: { summary: 's', guidance: 'g' },
    };
    const findings = await checkRule(
      rule,
      ctx({
        customChecks: {
          myCheck: () => [
            {
              ruleId: 'c',
              severity: 'HIGH',
              category: 'custom',
              evidence: 'e',
              message: 'm',
              source: { kind: 'rule', ruleId: 'c' },
            },
          ],
        },
      }),
    );
    expect(findings.length).toBe(1);
  });

  it('routes spec and schema with no false positives on empty inputs', async () => {
    const specRule: Rule = {
      kind: 'spec',
      id: 's',
      category: 'spec-discipline',
      defaultSeverity: 'CRITICAL',
      description: 'd',
      check: 'no-extra-tests-claiming-spec',
      prompt: { summary: 's', guidance: 'g' },
    };
    expect(await checkRule(specRule, ctx())).toEqual([]);

    const schemaRule: Rule = {
      kind: 'schema',
      id: 'sc',
      category: 'data-discipline',
      defaultSeverity: 'CRITICAL',
      description: 'd',
      appliesTo: 'missing',
      schema: undefined,
      prompt: { summary: 's', guidance: 'g' },
    };
    const schemaFindings = await checkRule(schemaRule, ctx());
    expect(schemaFindings.length).toBe(1);
  });
});
