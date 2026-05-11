import type { Rule } from '../schemas.js';
import type { ResolvedConstitution, ResolvedScope } from '../resolve.js';

/**
 * Whether a rule applies to a given role. A rule with no `appliesToRoles`
 * field applies to every role. A rule with an explicit list applies only
 * when that list contains the scope's role.
 */
export function ruleAppliesToRole(rule: Rule, role: string): boolean {
  if (rule.appliesToRoles === undefined) return true;
  return rule.appliesToRoles.includes(role);
}

/**
 * Select the rules that apply to a scope. Used by both `prepare()` (to
 * render only role-relevant rules in the augmented prompt) and `verify()`
 * (to skip rules whose checks don't apply for this role).
 *
 * If `scope.relatedRules` is set, that list overrides role-based
 * filtering — explicit pinning wins. The relatedRules path is the
 * intended escape hatch for "this scope needs these rules specifically
 * regardless of role applicability."
 */
export function selectApplicableRules(
  scope: ResolvedScope,
  resolved: ResolvedConstitution,
): Rule[] {
  if (scope.relatedRules !== undefined && scope.relatedRules.length > 0) {
    const explicit: Rule[] = [];
    for (const id of scope.relatedRules) {
      const rule = resolved.rules.get(id);
      if (rule) explicit.push(rule);
    }
    return explicit;
  }
  const out: Rule[] = [];
  for (const rule of resolved.rules.values()) {
    if (ruleAppliesToRole(rule, scope.role)) out.push(rule);
  }
  return out;
}
