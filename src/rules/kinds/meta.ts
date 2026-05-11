import type { Finding, MetaRule } from '../../schemas.js';
import type { VerifyContext } from '../../source/types.js';
import { unregisteredCheckFinding } from './_unregistered.js';

/**
 * Meta rule dispatch — calls the registered function from `ctx.customChecks`
 * by name. Meta rules differ from custom rules in semantic role (they
 * read the worker's report, not the diff), but the engine plumbing is
 * the same registry.
 *
 * Behavior when `ctx.agentReport` is undefined: the rule silently
 * returns no findings. Meta checks are opt-in to scopes that have a
 * report available; a verify() call without an agentReport doesn't
 * surface "you didn't pass a report" findings, because surfacing
 * those would be noise on every diff-only verify() invocation.
 *
 * Behavior when the named check function is not registered: same as
 * CustomRule — emit a CRITICAL finding pointing at the missing
 * registration. Meta rules in `presets.recommended` ship with stub
 * registrations in `presets/rules/stubs.ts` so the missing-
 * registration path doesn't fire for the shipped preset.
 */
export async function checkMeta(rule: MetaRule, ctx: VerifyContext): Promise<Finding[]> {
  if (ctx.agentReport === undefined) return [];
  const check = ctx.customChecks[rule.checkRef];
  if (check === undefined) {
    return [unregisteredCheckFinding(rule, 'Meta')];
  }
  const result = await check(rule, ctx);
  return [...result];
}
