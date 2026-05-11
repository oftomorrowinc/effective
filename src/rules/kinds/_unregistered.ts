import type { CustomRule, Finding, MetaRule } from '../../schemas.js';

/**
 * Shared shape for the "checkRef not registered" finding emitted by
 * both CustomRule and MetaRule dispatchers. The two kinds use the
 * same registry (`ctx.customChecks`) for their check functions, so
 * the missing-registration error path is identical.
 *
 * `kindLabel` is the human-readable rule kind name used in the
 * finding's message ("Custom rule" / "Meta rule").
 */
export function unregisteredCheckFinding(
  rule: CustomRule | MetaRule,
  kindLabel: 'Custom' | 'Meta',
): Finding {
  return {
    ruleId: rule.id,
    severity: 'CRITICAL',
    category: rule.category,
    evidence: `(${kindLabel.toLowerCase()} check "${rule.checkRef}" is not registered)`,
    message:
      `${kindLabel} rule "${rule.id}" references checkRef "${rule.checkRef}" which is not ` +
      `registered. Register it in your verify() call's customChecks map before this rule ` +
      `can run.`,
    source: { kind: 'rule', ruleId: rule.id },
  };
}
