import { describe, expect, it } from 'vitest';
import { verify } from '../src/verify.js';
import { kickBack } from '../src/kickBack.js';
import { prepare } from '../src/prepare.js';
import { changed, laneRule, patternRule, scope, singleRuleConfig } from './_helpers.js';
import type { Constitution } from '../src/schemas.js';

describe('verify — end-to-end', () => {
  it("returns 'pass' when no rules flag the diff", async () => {
    const result = await verify({
      scope: scope('free-form'),
      config: singleRuleConfig('no-todo'),
      source: {
        kind: 'inline',
        changedFiles: [changed('src/a.ts', 'export const x = 1;')],
      },
    });
    expect(result.verdict).toBe('pass');
    expect(result.findings).toEqual([]);
    expect(result.summary?.total).toBe(0);
  });

  it("returns 'fail' on a CRITICAL pattern violation", async () => {
    const result = await verify({
      scope: scope('free-form'),
      config: singleRuleConfig('no-todo'),
      source: {
        kind: 'inline',
        changedFiles: [changed('src/a.ts', '// TODO: write this')],
      },
    });
    expect(result.verdict).toBe('fail');
    expect(result.findings.length).toBe(1);
    expect(result.findings[0]?.ruleId).toBe('no-todo');
    expect(result.summary?.critical).toBe(1);
  });

  it("returns 'pass' when a rule's severity is overridden below CRITICAL", async () => {
    const result = await verify({
      scope: scope('free-form'),
      config: {
        rules: [patternRule('no-todo')],
        override: { 'no-todo': { severity: 'MED', rationale: 'phased adoption' } },
      },
      source: {
        kind: 'inline',
        changedFiles: [changed('src/a.ts', '// TODO: x')],
      },
    });
    expect(result.verdict).toBe('pass');
    expect(result.findings.length).toBe(1);
    expect(result.findings[0]?.severity).toBe('MED');
    expect(result.summary?.med).toBe(1);
  });

  it('combines lane and pattern findings into a single verdict', async () => {
    const config: Constitution = { rules: [patternRule('no-todo'), laneRule()] };
    const result = await verify({
      scope: scope('code-writer', { editable: ['src/**'] }),
      config,
      source: {
        kind: 'inline',
        changedFiles: [
          changed('src/a.ts', '// TODO leftover'),
          changed('test/a.test.ts', 'it("x", () => {});', 'added'),
        ],
      },
    });
    expect(result.verdict).toBe('fail');
    const ruleIds = new Set(result.findings.map((f) => f.ruleId));
    expect(ruleIds).toContain('no-todo');
    expect(ruleIds).toContain('lane.editable-respected');
  });

  it('drops disabled rules from execution entirely', async () => {
    const result = await verify({
      scope: scope('free-form'),
      config: {
        rules: [patternRule('no-todo')],
        disable: { 'no-todo': 'not relevant in this repo' },
      },
      source: {
        kind: 'inline',
        changedFiles: [changed('src/a.ts', '// TODO yes')],
      },
    });
    expect(result.verdict).toBe('pass');
    expect(result.findings).toEqual([]);
  });

  it('surfaces git errors when refs do not exist', async () => {
    // verify() attempts to run `git diff` with the given refs; an invalid
    // ref should produce a clear failure rather than a silent pass.
    await expect(
      verify({
        scope: scope('free-form'),
        config: singleRuleConfig('no-todo'),
        source: { kind: 'git', repo: '.', work: 'nope-x', baseline: 'nope-y' },
      }),
    ).rejects.toThrowError(/git/);
  });

  it('dedupes identical findings emitted by multiple paths', async () => {
    const config: Constitution = {
      rules: [patternRule('no-todo-a'), patternRule('no-todo-b')],
    };
    const result = await verify({
      scope: scope('free-form'),
      config,
      source: {
        kind: 'inline',
        changedFiles: [changed('a.ts', '// TODO')],
      },
    });
    expect(result.findings.length).toBe(2);
  });
});

describe('full loop: prepare → verify → kickBack → next prompt', () => {
  it('preserves rule ids across all three projections', async () => {
    const config: Constitution = { rules: [patternRule('no-todo'), laneRule()] };
    const s = scope('code-writer', { goal: 'Implement rate limiter', editable: ['app/**'] });
    const prompt = prepare({
      scope: s,
      config,
      original: 'Build the rate limiter for /api/signals.',
    });
    expect(prompt).toContain('no-todo');
    expect(prompt).toContain('lane.editable-respected');

    const result = await verify({
      scope: s,
      config,
      source: {
        kind: 'inline',
        changedFiles: [
          changed('app/api/rate-limit.ts', '// TODO: implement', 'added'),
          changed('test/rate-limit.test.ts', 'it("x", () => {});', 'added'),
        ],
      },
    });
    expect(result.verdict).toBe('fail');
    const next = kickBack({ findings: result.findings, previousPrompt: prompt });
    expect(next).toContain('no-todo');
    expect(next).toContain('lane.editable-respected');
    expect(next).toContain('Build the rate limiter for /api/signals.');
  });
});
