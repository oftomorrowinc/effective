/**
 * Generates `CONSTITUTION.md` from the recommended preset.
 *
 * Run via `pnpm docs:constitution`. The drift-check test
 * (`test/constitution-drift.test.ts`) imports `renderConstitution`
 * and compares its output to the committed `CONSTITUTION.md`, so a
 * stale file blocks merge.
 *
 * Determinism is load-bearing here: the output must depend only on
 * the rule definitions, not on the current date / git SHA / runtime
 * env. Anything that wants freshness info should read `git log
 * CONSTITUTION.md`.
 */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { presets } from '../src/presets/index.js';
import type { Constitution, Rule } from '../src/schemas.js';

interface RuleGroup {
  title: string;
  intro: string;
  rules: readonly Rule[];
}

function classifyGroups(rules: readonly Rule[]): readonly RuleGroup[] {
  const toolchain: Rule[] = [];
  const meta: Rule[] = [];
  const foundation: Rule[] = [];
  const catalogue: Rule[] = [];

  for (const r of rules) {
    if (r.kind === 'toolchain') toolchain.push(r);
    else if (r.kind === 'meta') meta.push(r);
    else if (r.catalogueEntry === undefined) foundation.push(r);
    else catalogue.push(r);
  }

  const byId = (a: Rule, b: Rule): number => a.id.localeCompare(b.id);

  return [
    {
      title: 'Foundation rules',
      intro:
        "Foundation rules don't reference a catalogue entry. They defend against general hygiene, security, and governance failure modes that apply across projects, and typically link to a `relatedPrinciple` rather than a specific observed pattern.",
      rules: foundation.toSorted(byId),
    },
    {
      title: 'Catalogue-driven rules',
      intro:
        'Catalogue-driven rules each defend against an observed adversarial-by-optimization pattern. See `schemas/failures.ts` for the catalogue entries themselves with provenance and observed instances.',
      rules: catalogue.toSorted(byId),
    },
    {
      title: 'Toolchain wrappers',
      intro:
        "Toolchain rules wrap the project's existing lint, typecheck, test, and coverage tooling and translate exit codes / output into findings. The actual command and parser are configured in `effective.config.{ts,js}` under `toolchain`.",
      rules: toolchain.toSorted(byId),
    },
    {
      title: 'Meta rules',
      intro:
        "Meta rules cross-check a worker's self-report (the build log or PR description) against the actual diff state — verification claims, exit-bar assertions, retry-scope expansions. They run only when the caller passes an `agentReport` to `verify()`.",
      rules: meta.toSorted(byId),
    },
  ];
}

function renderRoles(roles: readonly string[] | undefined): string {
  if (roles === undefined || roles.length === 0) return 'all';
  return roles.map((r) => `\`${r}\``).join(', ');
}

function renderMetadata(rule: Rule): readonly string[] {
  const lines: string[] = [
    `- **Kind:** \`${rule.kind}\``,
    `- **Severity:** ${rule.defaultSeverity}`,
    `- **Category:** ${rule.category}`,
    `- **Applies to roles:** ${renderRoles(rule.appliesToRoles)}`,
  ];
  if (rule.catalogueEntry !== undefined) {
    lines.push(`- **Catalogue entry:** \`${rule.catalogueEntry}\``);
  }
  if (rule.relatedPrinciple !== undefined) {
    lines.push(`- **Related principle:** \`${rule.relatedPrinciple}\``);
  }
  if (rule.diffOnly === true) {
    lines.push(`- **Diff-only:** yes (skipped by \`audit\`)`);
  }
  return lines;
}

function renderExamples(rule: Rule): readonly string[] {
  const examples = rule.prompt.examples;
  if (examples === undefined) return [];
  const out: string[] = [];
  if (examples.bad !== undefined) {
    out.push('_Bad:_', '', '```ts', examples.bad, '```', '');
  }
  if (examples.good !== undefined) {
    out.push('_Good:_', '', '```ts', examples.good, '```', '');
  }
  return out;
}

function renderRule(rule: Rule): string {
  const lines: string[] = [
    `### ${rule.id}`,
    '',
    ...renderMetadata(rule),
    '',
    `**Summary.** ${rule.prompt.summary}`,
    '',
    rule.prompt.guidance,
    '',
    ...renderExamples(rule),
  ];
  return lines.join('\n');
}

function renderGroup(group: RuleGroup): string {
  if (group.rules.length === 0) {
    return `## ${group.title}\n\n${group.intro}\n\n_None._\n`;
  }
  const body = group.rules.map((r) => renderRule(r)).join('---\n\n');
  return `## ${group.title}\n\n${group.intro}\n\n${body}`;
}

/**
 * Render the full constitution markdown for the given preset.
 * Pure: no I/O, no date, no SHA — output depends only on inputs so
 * the drift test can be a literal string compare.
 */
export function renderConstitution(constitution: Constitution): string {
  const header = [
    '# Effective Constitution',
    '',
    "This document is the human-readable projection of the recommended preset's active rule set. It is generated from rule definitions in `src/presets/` — do not edit directly. Run `pnpm docs:constitution` to regenerate.",
    '',
    "Each section groups rules by purpose. Within each group, rules are sorted by id so the section anchors (`#<rule-id>`) are stable across regenerations. For freshness, see this file's git history.",
    '',
  ];

  const groups = classifyGroups(constitution.rules ?? []);
  const body = groups.map((g) => renderGroup(g)).join('\n');

  return `${header.join('\n')}\n${body}`;
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;

if (invokedDirectly) {
  const md = renderConstitution(presets.recommended);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const target = path.resolve(here, '..', 'CONSTITUTION.md');
  try {
    await writeFile(target, md, 'utf8');
    process.stdout.write(`Wrote ${target}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    /* c8 ignore next -- exception-id: cli-fatal-exit -- script entrypoint translates failure to exit code */
    // eslint-disable-next-line n/no-process-exit, unicorn/no-process-exit -- exception-id: cli-fatal-exit
    process.exit(1);
  }
}
