import type { Finding } from './schemas.js';

export interface KickBackInput {
  findings: readonly Finding[];
  previousPrompt: string;
  /** Optional captured output from the prior attempt, included if it helps the worker recall context. */
  output?: string;
}

interface RuleGroup {
  readonly ruleId: string;
  readonly category: string;
  readonly findings: Finding[];
}

const SEVERITY_ORDER: Record<Finding['severity'], number> = {
  CRITICAL: 0,
  HIGH: 1,
  MED: 2,
  LOW: 3,
};

function groupByRule(findings: readonly Finding[]): RuleGroup[] {
  const groups = new Map<string, RuleGroup>();
  for (const finding of findings) {
    const existing = groups.get(finding.ruleId);
    if (existing) {
      existing.findings.push(finding);
    } else {
      groups.set(finding.ruleId, {
        ruleId: finding.ruleId,
        category: finding.category,
        findings: [finding],
      });
    }
  }
  function worstSeverityRank(group: RuleGroup): number {
    let worst = SEVERITY_ORDER.LOW;
    for (const finding of group.findings) {
      const rank = SEVERITY_ORDER[finding.severity];
      if (rank < worst) worst = rank;
    }
    return worst;
  }
  return [...groups.values()].sort((a, b) => {
    const aTop = worstSeverityRank(a);
    const bTop = worstSeverityRank(b);
    if (aTop !== bTop) return aTop - bTop;
    return a.ruleId.localeCompare(b.ruleId);
  });
}

function formatLocation(finding: Finding): string {
  if (finding.location === undefined) return '';
  const { file, line, column } = finding.location;
  const linePart = line === undefined ? '' : `:${String(line)}`;
  const colPart = column === undefined ? '' : `:${String(column)}`;
  return `${file}${linePart}${colPart}`;
}

function formatFinding(finding: Finding): string {
  const loc = formatLocation(finding);
  const head = loc.length > 0 ? `${finding.severity} at ${loc}` : finding.severity;
  const escapedEvidence = finding.evidence.replaceAll('`', '\\`');
  return [`- **${head}** — ${finding.message}`, `  - Evidence: \`${escapedEvidence}\``].join('\n');
}

function formatGroup(group: RuleGroup): string {
  const header = `### \`${group.ruleId}\` (${group.category}) — ${String(group.findings.length)} finding(s)`;
  const body = group.findings.map((f) => formatFinding(f));
  return [header, ...body].join('\n');
}

export function kickBack(input: KickBackInput): string {
  const failing = input.findings.filter((f) => f.severity === 'CRITICAL');
  const groups = groupByRule(failing);

  const sections: string[] = [];
  sections.push('# Verification kicked back', '');

  if (groups.length === 0) {
    sections.push(
      'No CRITICAL findings, but `verify()` did not pass. Review the non-critical findings below ' +
        'and decide whether they need follow-up before re-submitting.',
      '',
    );
    const nonCriticalGroups = groupByRule(input.findings);
    for (const group of nonCriticalGroups) {
      sections.push(formatGroup(group), '');
    }
  } else {
    sections.push(
      `${String(groups.length)} rule(s) reported ${String(failing.length)} CRITICAL finding(s). ` +
        'Each must be resolved at the source — not by lowering thresholds, disabling rules, or adding suppressions ' +
        'without a tracked exception.',
      '',
      '## Failing rules',
    );
    for (const group of groups) {
      sections.push('', formatGroup(group));
    }
  }

  sections.push(
    '',
    '## What to do next',
    [
      '1. Fix the underlying issue for each finding above. Read the evidence carefully — the location and the snippet identify the exact site.',
      "2. Do **not** disable rules, weaken assertions, or skip tests to make findings disappear. If a true exception is needed, add it to the config's `exceptions` field with a justification and a retirement condition, then cite the exception id at the use site.",
      '3. Re-run `verify()`. If new findings appear, address them the same way. The verdict only flips to `pass` when zero CRITICAL findings remain.',
    ].join('\n'),
    '',
    '## Original task (still active)',
    '',
    input.previousPrompt,
  );

  return sections.join('\n');
}
