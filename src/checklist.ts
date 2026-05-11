import type { ResolvedScope } from './resolve.js';
import type { Rule, RuleCategory } from './schemas.js';

/**
 * Pre-Success Checklist renderer — surfaces the active rules as a
 * compact bullet list grouped by section, derived from the 30-item
 * checklist in the canonical constitution doc.
 *
 * Per the design discussion: the checklist is NOT a separate rule
 * kind. It's a projection of the rules that already apply to the
 * scope, organized by section. Items map to rules; sections map to
 * RuleCategory.
 *
 * The renderer is deterministic — no LLM is involved. The selection
 * has already happened (via role + editable filtering at the rule-
 * selection layer); this module only groups + formats.
 */

/**
 * Section headers, matching the constitution doc's section ordering.
 * Each header is paired with the RuleCategory values that map to it.
 */
interface ChecklistSection {
  readonly header: string;
  readonly categories: readonly RuleCategory[];
}

const SECTIONS: readonly ChecklistSection[] = [
  { header: 'Completion claims', categories: ['verification'] },
  { header: 'Test rigor', categories: ['tests', 'spec-discipline'] },
  { header: 'Data and identity discipline', categories: ['data-discipline'] },
  { header: 'Architectural invariants', categories: ['lane', 'architecture', 'scope'] },
  { header: 'Escape hatches and toolchain', categories: ['exceptions', 'toolchain'] },
  { header: 'Governance and honest reporting', categories: ['governance', 'custom'] },
];

interface SectionGroup {
  readonly header: string;
  readonly rules: Rule[];
}

function groupBySection(rules: readonly Rule[]): SectionGroup[] {
  const groups: SectionGroup[] = [];
  const claimed = new Set<string>();
  for (const section of SECTIONS) {
    const matched: Rule[] = [];
    for (const rule of rules) {
      if (claimed.has(rule.id)) continue;
      if (section.categories.includes(rule.category)) {
        matched.push(rule);
        claimed.add(rule.id);
      }
    }
    if (matched.length > 0) {
      groups.push({ header: section.header, rules: matched });
    }
  }
  // Catch-all bucket for any rule whose category didn't map to a section.
  const unclaimed = rules.filter((r) => !claimed.has(r.id));
  if (unclaimed.length > 0) {
    groups.push({ header: 'Other checks', rules: unclaimed });
  }
  return groups;
}

/**
 * Minimum item count below which the renderer surfaces the full
 * checklist with a note rather than risking silently dropping
 * something load-bearing. Calibrated to be defensive: under five
 * items usually means the role/editable filter was too narrow.
 */
const MIN_FILTERED_ITEMS = 5;

export interface ChecklistInput {
  readonly scope: ResolvedScope;
  readonly applicableRules: readonly Rule[];
  readonly allRules: readonly Rule[];
}

/**
 * Render the Pre-Success Checklist as a markdown section. Returns the
 * formatted string ready to drop into `prepare()` output. When the
 * filtered rule count falls below `MIN_FILTERED_ITEMS`, the renderer
 * falls back to the full rule set with a note explaining the
 * fallback — better verbose than silently load-bearing.
 */
export function renderChecklist(input: ChecklistInput): string {
  // When the scope explicitly pins via `relatedRules`, the user has
  // already made a deliberate choice about which rules apply. Don't
  // override that with the <5-item fallback — pinned scopes can be
  // legitimately narrow.
  const explicitlyPinned =
    input.scope.relatedRules !== undefined && input.scope.relatedRules.length > 0;
  const usingFallback = !explicitlyPinned && input.applicableRules.length < MIN_FILTERED_ITEMS;
  const rules = usingFallback ? input.allRules : input.applicableRules;
  if (rules.length === 0) {
    return [
      '## Pre-Success Checklist',
      '',
      '_No rules apply to this scope. The constitution is empty for this role._',
    ].join('\n');
  }
  const groups = groupBySection(rules);
  const lines: string[] = [
    '## Pre-Success Checklist',
    '',
    'Before marking `Result: Success`, verify each item below.',
  ];
  if (usingFallback) {
    lines.push(
      '',
      `_Filtering for role \`${input.scope.role}\` produced fewer than ${String(MIN_FILTERED_ITEMS)} items; showing the full ${String(input.allRules.length)}-rule set as a defensive fallback._`,
    );
  }
  for (const group of groups) {
    lines.push('', `### ${group.header}`);
    for (const r of group.rules) {
      lines.push(`- ${r.prompt.summary}`);
    }
  }
  return lines.join('\n');
}
