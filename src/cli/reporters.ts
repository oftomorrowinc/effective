import type { Finding, VerifyResult } from '../schemas.js';

export type ReporterName = 'pretty' | 'json';

function severityBadge(severity: Finding['severity']): string {
  switch (severity) {
    case 'CRITICAL': {
      return '⛔ CRITICAL';
    }
    case 'HIGH': {
      return '🔥 HIGH';
    }
    case 'MED': {
      return '⚠️  MED';
    }
    case 'LOW': {
      return '·  LOW';
    }
  }
}

function verdictBadge(verdict: VerifyResult['verdict']): string {
  switch (verdict) {
    case 'pass': {
      return '✅ PASS';
    }
    case 'fail': {
      return '❌ FAIL';
    }
    case 'needs-review': {
      return '👀 NEEDS REVIEW';
    }
  }
}

function formatLocation(finding: Finding): string {
  const loc = finding.location;
  if (loc === undefined) return '(project-wide)';
  const parts: string[] = [loc.file];
  if (loc.line !== undefined) parts.push(`:${String(loc.line)}`);
  if (loc.column !== undefined) parts.push(`:${String(loc.column)}`);
  return parts.join('');
}

function prettyReport(result: VerifyResult): string {
  const out: string[] = [];
  out.push(`Verdict: ${verdictBadge(result.verdict)}`);
  if (result.summary) {
    const s = result.summary;
    out.push(
      `Findings: ${String(s.total)} total — ${String(s.critical)} CRITICAL, ${String(s.high)} HIGH, ${String(s.med)} MED, ${String(s.low)} LOW`,
    );
    const disabled = result.disabledRulesCount;
    const hatches = result.escapeHatchCount;
    if (disabled !== undefined || hatches !== undefined) {
      // No "skipped" component for verify — verify runs every applicable
      // rule (audit is where skip-because-context exists). Emit just the
      // pieces we have, in the same `Rules:` row used by audit so the
      // two surfaces stay legible side-by-side.
      const parts: string[] = [];
      if (disabled !== undefined) parts.push(`${String(disabled)} disabled`);
      if (hatches !== undefined) parts.push(`${String(hatches)} escape hatches`);
      out.push(`Rules:    ${parts.join(', ')}`);
    }
  }
  if (result.findings.length === 0) {
    out.push('No findings.');
    return out.join('\n');
  }
  out.push('');
  for (const finding of result.findings) {
    out.push(
      `${severityBadge(finding.severity)}  ${finding.ruleId}  @  ${formatLocation(finding)}`,
      `    ${finding.message}`,
    );
    if (finding.evidence.length > 0) {
      out.push(`    evidence: ${finding.evidence}`);
    }
  }
  return out.join('\n');
}

function jsonReport(result: VerifyResult): string {
  return JSON.stringify(result, null, 2);
}

export function renderResult(result: VerifyResult, reporter: ReporterName): string {
  switch (reporter) {
    case 'json': {
      return jsonReport(result);
    }
    case 'pretty': {
      return prettyReport(result);
    }
  }
}
