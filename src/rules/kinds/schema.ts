import { z } from 'zod';
import type { Finding, SchemaRule } from '../../schemas.js';
import type { VerifyContext } from '../../source/types.js';

function isZodSchema(value: unknown): value is z.ZodTypeAny {
  return (
    typeof value === 'object' &&
    value !== null &&
    'safeParse' in value &&
    typeof value.safeParse === 'function'
  );
}

function formatIssue(issue: z.ZodIssue): string {
  const path = issue.path.length === 0 ? '(root)' : issue.path.join('.');
  return `${path}: ${issue.message}`;
}

export function checkSchema(rule: SchemaRule, ctx: VerifyContext): Finding[] {
  const artifact = ctx.artifacts[rule.appliesTo];
  if (artifact === undefined) {
    return [
      {
        ruleId: rule.id,
        severity: rule.defaultSeverity,
        category: rule.category,
        evidence: `(no artifact named "${rule.appliesTo}" was supplied)`,
        message: `Schema rule "${rule.id}" expected artifact "${rule.appliesTo}" but none was supplied to verify. ${rule.prompt.guidance}`,
        source: { kind: 'rule', ruleId: rule.id },
      },
    ];
  }
  if (!isZodSchema(rule.schema)) {
    return [
      {
        ruleId: rule.id,
        severity: rule.defaultSeverity,
        category: rule.category,
        evidence: '(rule.schema is not a Zod schema)',
        message: `Schema rule "${rule.id}" is misconfigured: rule.schema is not a Zod schema. ${rule.prompt.guidance}`,
        source: { kind: 'rule', ruleId: rule.id },
      },
    ];
  }
  const result = rule.schema.safeParse(artifact);
  if (result.success) return [];
  return result.error.issues.map((issue) => ({
    ruleId: rule.id,
    severity: rule.defaultSeverity,
    category: rule.category,
    evidence: formatIssue(issue),
    message: `Artifact "${rule.appliesTo}" failed schema validation: ${formatIssue(issue)}. ${rule.prompt.guidance}`,
    source: { kind: 'rule', ruleId: rule.id },
  }));
}
