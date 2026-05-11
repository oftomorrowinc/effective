import { resolveConstitution, resolveScope } from './resolve.js';
import type { ResolveOptions, ResolvedScope } from './resolve.js';
import { presets } from './presets/index.js';
import { selectApplicableRules } from './rules/selection.js';
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

export function prepare(input: PrepareInput): string {
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

  sections.push('', '## Applicable rules');
  if (rules.length === 0) {
    sections.push('_No rules apply to this scope. Continue with care; the constitution is empty._');
  } else {
    sections.push(
      `${String(rules.length)} rule(s) apply to this scope. Each one will be checked deterministically when you submit.`,
    );
    for (const rule of rules) {
      sections.push('', formatRule(rule));
    }
  }

  sections.push(
    '',
    '## How verification will run',
    'After you submit, `verify()` runs every rule above against your diff plus the project toolchain (lint, typecheck, tests, coverage). ' +
      'Only `CRITICAL` findings fail the verdict; `HIGH`/`MED`/`LOW` are recorded as signal. ' +
      'You have the time to do this work right. Honest failure with a diagnostic message is preferable to a shallow success.',
  );

  return sections.join('\n');
}
