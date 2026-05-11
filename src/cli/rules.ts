import path from 'node:path';
import { loadConfig, loadConfigFromPath } from '../config/load.js';
import type { ParsedArgs } from './args.js';
import type { Rule } from '../schemas.js';

export interface RulesCliResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

function formatRuleSummary(rule: Rule): string {
  return `  ${rule.defaultSeverity.padEnd(8)} ${rule.category.padEnd(18)} ${rule.id}`;
}

function formatRuleDetail(rule: Rule): string {
  const lines: string[] = [
    `${rule.id}  [${rule.kind}]`,
    `  category:        ${rule.category}`,
    `  default severity: ${rule.defaultSeverity}`,
    `  description:     ${rule.description}`,
    '',
    'PROMPT SUMMARY:',
    `  ${rule.prompt.summary}`,
    '',
    'PROMPT GUIDANCE:',
    rule.prompt.guidance.replaceAll(/^/gm, '  '),
  ];
  if (rule.prompt.examples?.bad !== undefined) {
    lines.push('', 'AVOID:', `  ${rule.prompt.examples.bad}`);
  }
  if (rule.prompt.examples?.good !== undefined) {
    lines.push('', 'PREFER:', `  ${rule.prompt.examples.good}`);
  }
  if (rule.catalogueEntry !== undefined) {
    lines.push('', `Catalogue entry:    ${rule.catalogueEntry}`);
  }
  if (rule.relatedPrinciple !== undefined) {
    lines.push(`Related principle:  ${rule.relatedPrinciple}`);
  }
  return lines.join('\n');
}

export async function runRulesCommand(args: ParsedArgs, cwd: string): Promise<RulesCliResult> {
  const configFlag = args.options.config;
  const loaded =
    configFlag === undefined
      ? await loadConfig(cwd)
      : await loadConfigFromPath(path.resolve(cwd, configFlag));
  const search = args.options.search ?? args.positional[0];

  if (search !== undefined) {
    const rule = loaded.resolved.rules.get(search);
    if (rule === undefined) {
      return {
        stdout: '',
        stderr: `No rule with id "${search}" in the resolved constitution.\n`,
        exitCode: 1,
      };
    }
    return { stdout: `${formatRuleDetail(rule)}\n`, stderr: '', exitCode: 0 };
  }

  const rules = [...loaded.resolved.rules.values()].sort((a, b) => a.id.localeCompare(b.id));
  if (rules.length === 0) {
    return {
      stdout: 'No rules in the resolved constitution.\n',
      stderr: '',
      exitCode: 0,
    };
  }
  const out: string[] = [`${String(rules.length)} rule(s) active in this constitution:`, ''];
  for (const rule of rules) out.push(formatRuleSummary(rule));
  return { stdout: `${out.join('\n')}\n`, stderr: '', exitCode: 0 };
}
