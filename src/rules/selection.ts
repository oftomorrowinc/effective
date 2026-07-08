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
 * Select the rules that apply to a scope. Used by `prepare()` to render
 * only role-relevant rules in the augmented prompt.
 *
 * NOTE: `verify()` does NOT use this selection — it evaluates every
 * resolved rule, filtering by role applicability only. In particular,
 * `scope.relatedRules` narrows what the PROMPT emphasizes, not what
 * verification enforces: a pinned scope is still verified against the
 * full rule set (the safe direction — verify checks more than the
 * prompt promised). Whether relatedRules should also scope verification
 * is an open design question; see docs/open-issues.md.
 *
 * If `scope.relatedRules` is set, that list overrides role-based
 * filtering here — explicit pinning wins for prompt rendering.
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
