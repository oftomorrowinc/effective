import { describe, expect, it } from 'vitest';
import { checkMeta } from '../src/rules/kinds/meta.js';
import { ctx } from './_helpers.js';
import type { MetaRule } from '../src/schemas.js';

const baseRule: MetaRule = {
  kind: 'meta',
  id: 'sample-meta',
  category: 'verification',
  defaultSeverity: 'CRITICAL',
  description: 'sample meta',
  checkRef: 'sampleMetaCheck',
  prompt: { summary: 's', guidance: 'g' },
};

describe('checkMeta', () => {
  it('silently skips when ctx.agentReport is undefined', async () => {
    const result = await checkMeta(baseRule, ctx());
    expect(result).toEqual([]);
  });

  it('emits a registration-error finding when the checkRef is missing AND agentReport is supplied', async () => {
    const result = await checkMeta(baseRule, ctx({ agentReport: 'some build log' }));
    expect(result.length).toBe(1);
    expect(result[0]?.severity).toBe('CRITICAL');
    expect(result[0]?.evidence).toMatch(/not registered/);
  });

  it('forwards findings from a registered check when agentReport is supplied', async () => {
    const result = await checkMeta(
      baseRule,
      ctx({
        agentReport: 'log content',
        customChecks: {
          sampleMetaCheck: (rule, c) => {
            expect(c.agentReport).toBe('log content');
            return [
              {
                ruleId: rule.id,
                severity: 'CRITICAL',
                category: rule.category,
                evidence: 'meta finding',
                message: 'reported',
                source: { kind: 'rule', ruleId: rule.id },
              },
            ];
          },
        },
      }),
    );
    expect(result.length).toBe(1);
    expect(result[0]?.evidence).toBe('meta finding');
  });

  it('does not invoke the registered check when agentReport is absent', async () => {
    let invoked = false;
    await checkMeta(
      baseRule,
      ctx({
        customChecks: {
          sampleMetaCheck: () => {
            invoked = true;
            return [];
          },
        },
      }),
    );
    expect(invoked).toBe(false);
  });
});
