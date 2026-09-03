import type { ResolvedConstitution } from '../resolve.js';
import type { ToolchainRule } from '../schemas.js';

/**
 * Whether the project actually configured a command for this toolchain
 * rule's tool.
 *
 * A preset requires typecheck and coverage unconditionally, but `init`
 * only scaffolds the commands it detects. A project with neither script
 * therefore used to get a CRITICAL on a clean one-line diff — "expected
 * results for typecheck but none were supplied" — carrying guidance
 * ("Write the missing test.") that could not help, on the very first
 * run the docs invite a newcomer to make.
 *
 * Firing there is wrong. Staying silent would be worse: a real
 * misconfiguration would vanish. So an unconfigured tool SKIPS, and
 * both `verify` and `audit` report the skip by rule id and reason —
 * `toolchain-command-not-configured`. A gate that is absent must never
 * be indistinguishable from a gate that passed.
 *
 * A tool that IS configured but produced no result is a different case
 * and still fires; that path is untouched.
 */
export function toolchainCommandConfigured(
  rule: ToolchainRule,
  toolchain: ResolvedConstitution['toolchain'],
): boolean {
  if (rule.tool === 'custom') {
    return rule.name !== undefined && toolchain.custom?.[rule.name] !== undefined;
  }
  return toolchain[rule.tool] !== undefined;
}
