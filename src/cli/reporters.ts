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

function prettyReport(result: VerifyResult, governance?: readonly Finding[]): string {
  const out: string[] = [];
  out.push(`Verdict: ${verdictBadge(result.verdict)}`);
  if (result.summary) {
    const s = result.summary;
    out.push(
      `Findings: ${String(s.total)} total — ${String(s.critical)} CRITICAL, ${String(s.high)} HIGH, ${String(s.med)} MED, ${String(s.low)} LOW`,
    );
    const disabled = result.disabledRulesCount;
    const hatches = result.escapeHatchCount;
    const skipped = result.skipped ?? [];
    if (disabled !== undefined || hatches !== undefined || skipped.length > 0) {
      // Same `Rules:` row audit uses, so the two surfaces stay legible
      // side-by-side. `skipped` is not decoration: a rule that did not
      // run must never be indistinguishable from a rule that passed.
      const parts: string[] = [];
      if (disabled !== undefined) parts.push(`${String(disabled)} disabled`);
      if (skipped.length > 0) parts.push(`${String(skipped.length)} skipped`);
      if (hatches !== undefined) parts.push(`${String(hatches)} escape hatches`);
      out.push(`Rules:    ${parts.join(', ')}`);
    }
    const unconfigured = skipped.filter(
      (entry) => entry.reason === 'toolchain-command-not-configured',
    );
    if (unconfigured.length > 0) {
      out.push(
        `          ${unconfigured.map((entry) => entry.ruleId).join(', ')} — no command configured for that tool; the gate is absent, not passing.`,
      );
    }
  }
  if (result.findings.length === 0) {
    out.push('No findings.');
  } else {
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
  }
  if (governance !== undefined && governance.length > 0) {
    out.push(
      '',
      `Governance changes (${String(governance.length)} protected-path finding(s) elevated by --governance-pr, not gating):`,
    );
    for (const finding of governance) {
      out.push(`ⓘ  ${finding.ruleId}  @  ${formatLocation(finding)}`, `    ${finding.message}`);
    }
  }
  return out.join('\n');
}

function jsonReport(result: VerifyResult, governance?: readonly Finding[]): string {
  const payload =
    governance !== undefined && governance.length > 0
      ? { ...result, governanceFindings: governance }
      : result;
  return JSON.stringify(payload, null, 2);
}

export function renderResult(
  result: VerifyResult,
  reporter: ReporterName,
  governance?: readonly Finding[],
): string {
  switch (reporter) {
    case 'json': {
      return jsonReport(result, governance);
    }
    case 'pretty': {
      return prettyReport(result, governance);
    }
  }
}
