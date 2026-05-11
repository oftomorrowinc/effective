import type { Finding, ToolchainRule } from '../../schemas.js';
import type { ToolchainResult, VerifyContext } from '../../source/types.js';

function resultKey(rule: ToolchainRule): string {
  return rule.tool === 'custom' && rule.name !== undefined ? rule.name : rule.tool;
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
  const aggregateFinding: Finding = {
    ruleId: rule.id,
    severity: rule.defaultSeverity,
    category: rule.category,
    evidence: describeFailure(rule, result),
    message: `${describeFailure(rule, result)} ${rule.prompt.guidance}`,
    source: { kind: 'toolchain', tool: rule.tool === 'custom' ? 'custom' : rule.tool },
  };
  return [aggregateFinding, ...(result.findings ?? [])];
}
