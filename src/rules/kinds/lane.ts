import { compilePatterns } from '../../glob.js';
import type { Finding, LaneRule } from '../../schemas.js';
import type { ChangedFile, VerifyContext } from '../../source/types.js';

function buildAlwaysAllow(rule: LaneRule): (path: string) => boolean {
  if (rule.alwaysAllow === undefined || rule.alwaysAllow.length === 0) {
    return (): boolean => false;
  }
  const matcher = compilePatterns(rule.alwaysAllow);
  return (p): boolean => matcher(p);
}

function laneFinding(rule: LaneRule, file: ChangedFile, editableList: readonly string[]): Finding {
  const verb = file.status === 'deleted' ? 'Deleted' : 'Edited';
  return {
    ruleId: rule.id,
    severity: rule.defaultSeverity,
    category: rule.category,
    location: { file: file.path },
    evidence: `${verb} ${file.path} (status: ${file.status})`,
    message:
      `${verb} ${file.path} is outside the scope.editable lane ` +
      `(${editableList.length === 0 ? 'lane is empty — read-only scope' : editableList.join(', ')}). ` +
      rule.prompt.guidance,
    source: { kind: 'rule', ruleId: rule.id },
  };
}

export function checkLane(rule: LaneRule, ctx: VerifyContext): Finding[] {
  const alwaysAllow = buildAlwaysAllow(rule);
  const findings: Finding[] = [];
  for (const file of ctx.changedFiles) {
    if (alwaysAllow(file.path)) continue;
    if (ctx.editableMatcher(file.path)) continue;
    if (file.status === 'deleted' && !rule.flagDeletions) continue;
    findings.push(laneFinding(rule, file, ctx.scope.editable));
  }
  return findings;
}
