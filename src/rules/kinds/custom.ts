import type { CustomRule, Finding } from '../../schemas.js';
import type { VerifyContext } from '../../source/types.js';
import { unregisteredCheckFinding } from './_unregistered.js';

export async function checkCustom(rule: CustomRule, ctx: VerifyContext): Promise<Finding[]> {
  const check = ctx.customChecks[rule.checkRef];
  if (check === undefined) {
    return [unregisteredCheckFinding(rule, 'Custom')];
  }
  const result = await check(rule, ctx);
  return [...result];
}
