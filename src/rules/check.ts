import type { Finding, Rule } from '../schemas.js';
import type { VerifyContext } from '../source/types.js';
import { checkCustom } from './kinds/custom.js';
import { checkLane } from './kinds/lane.js';
import { checkPattern } from './kinds/pattern.js';
import { checkSchema } from './kinds/schema.js';
import { checkSpec } from './kinds/spec.js';
import { checkToolchain } from './kinds/toolchain.js';

/**
 * Dispatch a Rule to its kind-specific checker. Always returns a Promise so
 * callers can treat the engine uniformly; sync kinds resolve immediately.
 */
export async function checkRule(rule: Rule, ctx: VerifyContext): Promise<Finding[]> {
  switch (rule.kind) {
    case 'pattern': {
      return checkPattern(rule, ctx);
    }
    case 'lane': {
      return checkLane(rule, ctx);
    }
    case 'schema': {
      return checkSchema(rule, ctx);
    }
    case 'spec': {
      return checkSpec(rule, ctx);
    }
    case 'toolchain': {
      return checkToolchain(rule, ctx);
    }
    case 'custom': {
      return await checkCustom(rule, ctx);
    }
  }
}
