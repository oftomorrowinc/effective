import path from 'node:path';
import { loadConfig, loadConfigFromPath } from '../config/load.js';
import { audit } from '../audit.js';
import type { AuditResult, AuditSkipReason } from '../audit.js';
import type { Finding, Severity } from '../schemas.js';
import type { ParsedArgs } from './args.js';

export interface AuditCliResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly result: AuditResult;
}

function renderFinding(finding: Finding): string {
  const loc = finding.location;
  const where =
    loc === undefined
      ? '(project-wide)'
      : loc.line === undefined
        ? loc.file
        : `${loc.file}:${String(loc.line)}${loc.column === undefined ? '' : `:${String(loc.column)}`}`;
  const icon =
    finding.severity === 'CRITICAL'
      ? '⛔'
      : finding.severity === 'HIGH'
        ? '⚠️'
        : finding.severity === 'MED'
          ? 'ⓘ'
          : '·';
  const lines = [`${icon}  ${finding.severity}  ${finding.ruleId}  @  ${where}`];
  lines.push(`    ${finding.message}`);
  if (finding.evidence.length > 0) {
    lines.push(`    evidence: ${finding.evidence.slice(0, 200)}`);
  }
  return lines.join('\n');
}

const SEVERITY_ORDER: readonly Severity[] = ['CRITICAL', 'HIGH', 'MED', 'LOW'];

function groupBySeverity(findings: readonly Finding[]): Map<Severity, Finding[]> {
  const groups = new Map<Severity, Finding[]>();
  for (const sev of SEVERITY_ORDER) groups.set(sev, []);
  for (const f of findings) {
    const bucket = groups.get(f.severity);
    if (bucket !== undefined) bucket.push(f);
  }
  return groups;
}

function renderPretty(result: AuditResult): string {
  const { summary, findings, skipped, filesScanned } = result;
  const lines: string[] = [];
  lines.push(
    `Audit complete — scanned ${String(filesScanned.length)} source file(s).`,
    `Findings: ${String(summary.total)} total — ${String(summary.critical)} CRITICAL, ${String(summary.high)} HIGH, ${String(summary.med)} MED, ${String(summary.low)} LOW`,
  );
  if (findings.length === 0) {
    lines.push('No findings.');
  } else {
    const groups = groupBySeverity(findings);
    for (const sev of SEVERITY_ORDER) {
      const bucket = groups.get(sev) ?? [];
      if (bucket.length === 0) continue;
      lines.push('', `${sev} findings (${String(bucket.length)}):`);
      for (const f of bucket) lines.push(renderFinding(f));
    }
  }
  if (skipped.length > 0) {
    const grouped = new Map<AuditSkipReason['reason'], string[]>();
    for (const s of skipped) {
      const arr = grouped.get(s.reason) ?? [];
      arr.push(s.ruleId);
      grouped.set(s.reason, arr);
    }
    lines.push('', `Skipped rules (${String(skipped.length)}):`);
    for (const [reason, ids] of grouped) {
      lines.push(`  ${reason}: ${ids.join(', ')}`);
    }
    lines.push(
      '',
      '  diff-only: rules that compare additions/changes between refs. Run via `effective verify --against <ref>` instead.',
      '  lane-no-scope: lane rules need a scope.editable to check against — audit has no scope.',
      '  meta-no-report: meta rules read an agent self-report; absent in audit.',
      '  toolchain-not-included: pass `--include-toolchain` to run lint/typecheck/test/coverage rules.',
    );
  }
  lines.push(
    '',
    "Triage each finding: fix the code, register an exception in the config's `exceptions` field, override the rule's severity, or disable the rule with rationale. See docs/decisions.md.",
  );
  return lines.join('\n');
}

function renderJson(result: AuditResult): string {
  return JSON.stringify(result, undefined, 2);
}

export async function runAuditCommand(args: ParsedArgs, cwd: string): Promise<AuditCliResult> {
  const configFlag = args.options.config;
  const loaded =
    configFlag === undefined
      ? await loadConfig(cwd)
      : await loadConfigFromPath(path.resolve(cwd, configFlag));
  const result = await audit({
    config: loaded.config,
    repo: cwd,
    includeToolchain: args.flags.has('include-toolchain'),
    ...(args.options.rule === undefined ? {} : { onlyRuleId: args.options.rule }),
  });
  const reporter = args.flags.has('json') ? 'json' : 'pretty';
  const stdout = reporter === 'json' ? renderJson(result) : renderPretty(result);
  return { stdout: `${stdout}\n`, stderr: '', exitCode: 0, result };
}
