import type { Finding, ToolchainRule } from '../../schemas.js';
import type { ToolchainResult, VerifyContext } from '../../source/types.js';

const OUTPUT_TAIL_LINES = 20;
const OUTPUT_TAIL_LINE_MAX_CHARS = 500;

function resultKey(rule: ToolchainRule): string {
  return rule.tool === 'custom' && rule.name !== undefined ? rule.name : rule.tool;
}

/**
 * Truncate a single line to a sane length so a one-line JSON blob
 * (`eslint --format json`, `vitest --reporter json`, etc.) doesn't
 * dump tens of KB into a finding's message. The full output is
 * always available in the worktree if an adopter needs it.
 */
function truncateLine(line: string): string {
  if (line.length <= OUTPUT_TAIL_LINE_MAX_CHARS) return line;
  const omitted = line.length - OUTPUT_TAIL_LINE_MAX_CHARS;
  return `${line.slice(0, OUTPUT_TAIL_LINE_MAX_CHARS)}… (${String(omitted)} chars truncated)`;
}

/**
 * The last few lines of the failing command's output, so the finding's
 * message gives the adopter the actual error rather than just "exit
 * code 1." Prefers stderr (where compilers / test runners typically
 * write failures); falls back to stdout if stderr is empty (some tools
 * write everything to stdout). Trims to a fixed line count AND a
 * per-line character cap; the worktree still holds the full output if
 * the adopter needs more.
 */
function outputTail(result: ToolchainResult): string {
  const raw = result.stderr.trim().length > 0 ? result.stderr : result.stdout;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return '';
  const allLines = trimmed.split('\n').map((l) => truncateLine(l));
  if (allLines.length <= OUTPUT_TAIL_LINES) return allLines.join('\n');
  const omitted = allLines.length - OUTPUT_TAIL_LINES;
  return [
    `… (${String(omitted)} earlier line(s) omitted)`,
    ...allLines.slice(-OUTPUT_TAIL_LINES),
  ].join('\n');
}

function shouldFail(rule: ToolchainRule, result: ToolchainResult): boolean {
  switch (rule.failOn) {
    case 'non-zero-exit': {
      return result.exitCode !== 0;
    }
    case 'any-output': {
      return result.stdout.trim().length > 0 || result.stderr.trim().length > 0;
    }
    case 'count-non-zero': {
      return (result.count ?? 0) > 0;
    }
    case 'count-increased': {
      return (result.count ?? 0) > (result.baselineCount ?? 0);
    }
  }
}

function describeFailure(rule: ToolchainRule, result: ToolchainResult): string {
  switch (rule.failOn) {
    case 'non-zero-exit': {
      return `${resultKey(rule)} exited with code ${String(result.exitCode)}.`;
    }
    case 'any-output': {
      return `${resultKey(rule)} produced output.`;
    }
    case 'count-non-zero': {
      return `${resultKey(rule)} reported ${String(result.count ?? 0)} issue(s).`;
    }
    case 'count-increased': {
      return `${resultKey(rule)} issue count rose from ${String(result.baselineCount ?? 0)} to ${String(result.count ?? 0)}.`;
    }
  }
}

export function checkToolchain(rule: ToolchainRule, ctx: VerifyContext): Finding[] {
  const key = resultKey(rule);
  // Key derives from the rule's tool field (an enum) or rule.name (declared in
  // the rule definition). Both come from trusted project config.

  const result = ctx.toolchainResults[key];
  if (result === undefined) {
    return [
      {
        ruleId: rule.id,
        severity: rule.defaultSeverity,
        category: rule.category,
        evidence: `(no toolchain result supplied for "${key}")`,
        message: `Toolchain rule "${rule.id}" expected results for "${key}" but none were supplied. ${rule.prompt.guidance}`,
        source: { kind: 'rule', ruleId: rule.id },
      },
    ];
  }
  if (!shouldFail(rule, result)) {
    return result.findings ? [...result.findings] : [];
  }
  // Only include the raw-output tail when no parsed findings exist —
  // when the parser produced structured per-issue findings, the tail
  // is at best redundant and at worst (eslint --format json) drowns
  // the actual findings under a screen of unformatted JSON.
  const hasParsedFindings = (result.findings?.length ?? 0) > 0;
  const tail = hasParsedFindings ? '' : outputTail(result);
  const failureLine = describeFailure(rule, result);
  const message =
    tail.length === 0
      ? `${failureLine} ${rule.prompt.guidance}`
      : `${failureLine}\n${tail}\n\n${rule.prompt.guidance}`;
  const aggregateFinding: Finding = {
    ruleId: rule.id,
    severity: rule.defaultSeverity,
    category: rule.category,
    evidence: failureLine,
    message,
    source: { kind: 'toolchain', tool: rule.tool === 'custom' ? 'custom' : rule.tool },
  };
  return [aggregateFinding, ...(result.findings ?? [])];
}
