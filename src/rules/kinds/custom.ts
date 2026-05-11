import type { CustomRule, Finding } from '../../schemas.js';
import type { VerifyContext } from '../../source/types.js';

export async function checkCustom(rule: CustomRule, ctx: VerifyContext): Promise<Finding[]> {
  const check = ctx.customChecks[rule.checkRef];
  if (check === undefined) {
    return [
      {
        ruleId: rule.id,
        severity: 'CRITICAL',
        category: rule.category,
        evidence: `(custom check "${rule.checkRef}" is not registered)`,
        message:
          `Custom rule "${rule.id}" references checkRef "${rule.checkRef}" which is not ` +
          `registered. Register it in your verify() call's customChecks map before this rule ` +
          `can run.`,
        source: { kind: 'rule', ruleId: rule.id },
      },
    ];
  }
  const result = await check(rule, ctx);
  return [...result];
}
