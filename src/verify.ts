import { resolveConstitution, resolveScope } from './resolve.js';
import type { ResolveOptions } from './resolve.js';
import { checkRule } from './rules/check.js';
import { loadInlineSource } from './source/inline.js';
import type { InlineSource } from './source/inline.js';
import { computeVerdict, summarizeFindings } from './verdict.js';
import type { Constitution, Finding, Scope, VerifyResult } from './schemas.js';

/**
 * Git-backed source. Reserved by the public API for phase 2; verify() throws
 * at runtime if it receives one in phase 1.
 */
export interface GitSource {
  readonly kind: 'git';
  readonly repo: string;
  readonly work: string;
  readonly baseline: string;
}

/**
 * Staged-changes source. Reserved for phase 2 (powers `effective verify --staged`).
 */
export interface StagedSource {
  readonly kind: 'staged';
  readonly repo: string;
}

export type VerifySource = InlineSource | GitSource | StagedSource;

export interface VerifyInput {
  scope: Scope;
  config: Constitution;
  source: VerifySource;
  resolveOptions?: ResolveOptions;
}

function dedupeBySignature(findings: readonly Finding[]): Finding[] {
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const finding of findings) {
    const loc = finding.location;
    const key = [
      finding.ruleId,
      finding.severity,
      loc?.file ?? '',
      loc?.line ?? '',
      loc?.column ?? '',
      finding.evidence,
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(finding);
  }
  return out;
}

export async function verify(input: VerifyInput): Promise<VerifyResult> {
  const resolved = resolveConstitution(input.config, input.resolveOptions ?? {});
  const scope = resolveScope(input.scope, resolved);

  if (input.source.kind !== 'inline') {
    throw new Error(
      `verify() received a source of kind "${input.source.kind}" but only "inline" is supported in phase 1.`,
    );
  }
  const ctx = loadInlineSource(input.source, scope);

  const findings: Finding[] = [];
  for (const rule of resolved.rules.values()) {
    const ruleFindings = await checkRule(rule, ctx);
    findings.push(...ruleFindings);
  }

  const deduped = dedupeBySignature(findings);
  return {
    verdict: computeVerdict(deduped),
    findings: deduped,
    summary: summarizeFindings(deduped),
  };
}
