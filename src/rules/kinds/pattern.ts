import { compilePatterns } from '../../glob.js';
import type { Finding, PatternRule } from '../../schemas.js';
import type { ChangedFile, VerifyContext } from '../../source/types.js';

function buildFileMatcher(rule: PatternRule): (path: string) => boolean {
  const includeMatcher = compilePatterns([rule.inGlob]);
  if (rule.notInGlob === undefined) {
    return (p): boolean => includeMatcher(p);
  }
  const excludeMatcher = compilePatterns([rule.notInGlob]);
  return (p): boolean => includeMatcher(p) && !excludeMatcher(p);
}

function toGlobalRegex(rule: PatternRule): RegExp {
  if (rule.pattern instanceof RegExp) {
    const flags = rule.pattern.flags.includes('g') ? rule.pattern.flags : `${rule.pattern.flags}g`;
    // eslint-disable-next-line security/detect-non-literal-regexp -- exception-id: caller-validated-dynamic-key
    return new RegExp(rule.pattern.source, flags);
  }
  const escaped = rule.pattern.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  // eslint-disable-next-line security/detect-non-literal-regexp -- exception-id: caller-validated-dynamic-key
  return new RegExp(escaped, 'g');
}

const NEWLINE_CODE_POINT = '\n'.codePointAt(0);

function locate(content: string, index: number): { line: number; column: number } {
  let line = 1;
  let lastNewline = -1;
  for (let i = 0; i < index; i += 1) {
    if (content.codePointAt(i) === NEWLINE_CODE_POINT) {
      line += 1;
      lastNewline = i;
    }
  }
  return { line, column: index - lastNewline };
}

function snippet(content: string, line: number): string {
  const lines = content.split('\n');
  const target = lines[line - 1];
  return target ?? '';
}

function patternDisplay(rule: PatternRule): string {
  return rule.pattern instanceof RegExp ? rule.pattern.source : rule.pattern;
}

function forbiddenFindings(rule: PatternRule, file: ChangedFile): Finding[] {
  const regex = toGlobalRegex(rule);
  const findings: Finding[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(file.content)) !== null) {
    const { line, column } = locate(file.content, match.index);
    findings.push({
      ruleId: rule.id,
      severity: rule.defaultSeverity,
      category: rule.category,
      location: { file: file.path, line, column },
      evidence: snippet(file.content, line).slice(0, 240),
      message: `Forbidden pattern \`${patternDisplay(rule)}\` matched at ${file.path}:${String(line)}. ${rule.prompt.guidance}`,
      source: { kind: 'rule', ruleId: rule.id },
    });
    if (match.index === regex.lastIndex) regex.lastIndex += 1;
  }
  return findings;
}

function requiredFindings(rule: PatternRule, file: ChangedFile): Finding[] {
  const regex = toGlobalRegex(rule);
  if (regex.test(file.content)) return [];
  return [
    {
      ruleId: rule.id,
      severity: rule.defaultSeverity,
      category: rule.category,
      location: { file: file.path },
      evidence: `(no occurrences of \`${patternDisplay(rule)}\` in file)`,
      message: `Required pattern \`${patternDisplay(rule)}\` is missing from ${file.path}. ${rule.prompt.guidance}`,
      source: { kind: 'rule', ruleId: rule.id },
    },
  ];
}

export function checkPattern(rule: PatternRule, ctx: VerifyContext): Finding[] {
  const fileMatches = buildFileMatcher(rule);
  const findings: Finding[] = [];
  for (const file of ctx.changedFiles) {
    if (file.status === 'deleted') continue;
    if (!fileMatches(file.path)) continue;
    if (rule.forbidden) {
      findings.push(...forbiddenFindings(rule, file));
    } else {
      findings.push(...requiredFindings(rule, file));
    }
  }
  return findings;
}
