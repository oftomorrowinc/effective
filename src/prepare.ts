import { resolveConstitution, resolveScope } from './resolve.js';
import type { ResolveOptions, ResolvedScope } from './resolve.js';
import { presets } from './presets/index.js';
import { selectApplicableRules } from './rules/selection.js';
import { renderChecklist } from './checklist.js';
import type { Constitution, Rule, Scope } from './schemas.js';

function withBuiltInPresets(options: ResolveOptions): ResolveOptions {
  return {
    ...options,
    presetRegistry: {
      recommended: presets.recommended,
      ...options.presetRegistry,
    },
  };
}

export interface PrepareInput {
  scope: Scope;
  config: Constitution;
  original: string;
  resolveOptions?: ResolveOptions;
  /**
   * How much rule content to project into the prompt.
   *
   * - `'full'` (default): role identity + editable paths + expectations
   *   + spec ref + every applicable rule's full prompt projection
   *   (summary, guidance, bad/good examples) + the per-rule checklist
   *   + verification footer. The canonical adoption shape — agents
   *   learn the catalogue up front. Runs 15–30 KB depending on the
   *   number of applicable rules.
   *
   * - `'concise'`: role identity + editable paths + expectations +
   *   spec ref + one-line summary of each applicable rule + brief
   *   verification footer. No guidance, no examples, no checklist.
   *   Designed for high-frequency dispatch in long-running agent
   *   runners where `verify` / `kickBack` is the authoritative
   *   safety net and is expected to teach catalogue rules rule-by-
   *   rule on retry. Typical size: ~3–5 KB even against the full
   *   recommended preset. Use full mode when an agent is new to a
   *   role or in retrospective dialog; use concise at dispatch when
   *   the verify-kickback loop will surface specifics on demand.
   */
  mode?: 'full' | 'concise';
}

/**
 * Bundle returned from `prepare()`. Carrying `scope` and `config`
 * alongside the rendered prompt lets callers feed `verify()` the same
 * inputs via spread, so the type system enforces "the scope I prepared
 * for is the scope I verify against." Without the bundle, callers had
 * to remember to pass identical scope/config to both calls — a real
 * caller-hygiene gap when prepare and verify happen in different
 * modules.
 *
 *   const prepared = prepare({ scope, config, original });
 *   // dispatch agent with prepared.prompt
 *   const result = await verify({ ...prepared, source });
 */
export interface PreparedAgent {
  /** The rendered prompt — what the caller hands to the agent. */
  prompt: string;
  /** The scope used to render the prompt. Spreadable into `verify()`. */
  scope: Scope;
  /** The constitution used. Spreadable into `verify()`. */
  config: Constitution;
  /** Which projection mode was rendered. */
  mode: 'full' | 'concise';
}

function formatRule(rule: Rule): string {
  const lines: string[] = [];
  lines.push(`### \`${rule.id}\` — ${rule.prompt.summary}`, '', rule.prompt.guidance);
  if (rule.prompt.examples) {
    if (rule.prompt.examples.bad !== undefined) {
      lines.push('', '**Avoid:**', '```', rule.prompt.examples.bad, '```');
    }
    if (rule.prompt.examples.good !== undefined) {
      lines.push('', '**Prefer:**', '```', rule.prompt.examples.good, '```');
    }
  }
  return lines.join('\n');
}

function formatExpectations(scope: ResolvedScope): string {
  const active: string[] = [];
  for (const [key, value] of Object.entries(scope.expectations)) {
    if (value === true) active.push(`- \`${key}\` must hold`);
    else if (value === false) active.push(`- \`${key}\` must NOT hold (explicit opt-out)`);
  }
  if (active.length === 0) return '_No role-specific expectations active for this scope._';
  return active.join('\n');
}

function formatEditable(scope: ResolvedScope): string {
  if (scope.editable.length === 0) return '_No files are editable (read-only scope)._';
  return scope.editable.map((p) => `- \`${p}\``).join('\n');
}

function renderRulesFull(rules: readonly Rule[]): string[] {
  if (rules.length === 0) {
    return ['_No rules apply to this scope. Continue with care; the constitution is empty._'];
  }
  const out: string[] = [
    `${String(rules.length)} rule(s) apply to this scope. Each one will be checked deterministically when you submit.`,
  ];
  for (const rule of rules) {
    out.push('', formatRule(rule));
  }
  return out;
}

function renderRulesConcise(rules: readonly Rule[]): string[] {
  if (rules.length === 0) {
    return ['_No rules apply to this scope._'];
  }
  const out: string[] = [
    `${String(rules.length)} rule(s) apply. Summary only — each rule's full guidance fires through \`verify\` + \`kickBack\` on retry.`,
    '',
  ];
  for (const rule of rules) {
    out.push(
      `- \`${rule.id}\` (${rule.defaultSeverity}, ${rule.category}) — ${rule.prompt.summary}`,
    );
  }
  return out;
}

const VERIFICATION_FOOTER_FULL =
  'After you submit, `verify()` runs every rule above against your diff plus the project toolchain (lint, typecheck, tests, coverage). ' +
  'Only `CRITICAL` findings fail the verdict; `HIGH`/`MED`/`LOW` are recorded as signal. ' +
  'You have the time to do this work right. Honest failure with a diagnostic message is preferable to a shallow success.';

const VERIFICATION_FOOTER_CONCISE =
  'After you submit, `verify()` runs the rules listed above. If any fire, `kickBack()` will return the full guidance for the specific rule(s) you tripped — you do not need to internalize every rule up front. Honest failure with a diagnostic message is preferable to a shallow success.';

export function prepare(input: PrepareInput): PreparedAgent {
  const mode: PreparedAgent['mode'] = input.mode ?? 'full';
  const resolved = resolveConstitution(
    input.config,
    withBuiltInPresets(input.resolveOptions ?? {}),
  );
  const scope = resolveScope(input.scope, resolved);
  const rules = selectApplicableRules(scope, resolved);

  const sections: string[] = [];

  sections.push(`# Task: ${scope.goal}`, '', input.original, '', `## Role: \`${scope.role}\``);
  if (scope.deliverable !== undefined) {
    sections.push('', `**Deliverable:** ${scope.deliverable}`);
  }

  sections.push(
    '',
    '## Editable files',
    formatEditable(scope),
    '',
    '## What "done" means for this scope',
    formatExpectations(scope),
  );

  if (scope.spec !== undefined) {
    sections.push(
      '',
      `## Spec reference: \`${scope.spec}\``,
      'Tests and assertions must conform to the named spec verbatim.',
    );
  }

  sections.push(
    '',
    '## Applicable rules',
    ...(mode === 'concise' ? renderRulesConcise(rules) : renderRulesFull(rules)),
  );

  if (mode === 'full') {
    sections.push(
      '',
      renderChecklist({
        scope,
        applicableRules: rules,
        allRules: [...resolved.rules.values()],
      }),
    );
  }

  sections.push(
    '',
    '## How verification will run',
    mode === 'concise' ? VERIFICATION_FOOTER_CONCISE : VERIFICATION_FOOTER_FULL,
  );

  return {
    prompt: sections.join('\n'),
    scope: input.scope,
    config: input.config,
    mode,
  };
}
