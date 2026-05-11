import type { EscapeHatch } from '../schemas.js';
import type { ChangedFile } from '../source/types.js';

/**
 * Patterns we recognize as "escape hatches" — suppressions that the
 * `exceptions.must-cite-justification` rule wants to see a tracked exception
 * id on.
 */
const PATTERNS: readonly {
  kind: EscapeHatch['kind'];
  regex: RegExp;
}[] = [
  { kind: 'c8-ignore', regex: /\/\*\s*c8\s+ignore[^\n*]*\*\//g },
  { kind: 'c8-ignore', regex: /\/\/\s*c8\s+ignore[^\n]*/g },
  { kind: 'ts-expect-error', regex: /\/\/\s*@ts-expect-error[^\n]*/g },
  { kind: 'ts-expect-error', regex: /\/\*\s*@ts-expect-error[^*]*\*\//g },
  { kind: 'eslint-disable', regex: /\/\/\s*eslint-disable(?:-next-line|-line)?\s[^\n]*/g },
  { kind: 'eslint-disable', regex: /\/\*\s*eslint-disable(?:-next-line|-line)?\b[^*]*\*\//g },
  { kind: 'prettier-ignore', regex: /\/\/\s*prettier-ignore[^\n]*/g },
];

const EXCEPTION_ID = /exception-id\s*:\s*(?<id>[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*)/i;
const INLINE_JUSTIFICATION = /--\s*(?<text>.+?)$/;
const ESLINT_RULES =
  /eslint-disable(?:-next-line|-line)?\s+(?<rules>[A-Za-z0-9_./@-]+(?:\s*,\s*[A-Za-z0-9_./@-]+)*)/;

function lineFor(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (content.codePointAt(i) === '\n'.codePointAt(0)) line += 1;
  }
  return line;
}

function ruleList(commentText: string): string[] | undefined {
  const match = ESLINT_RULES.exec(commentText);
  const rules = match?.groups?.rules;
  if (rules === undefined) return undefined;
  return rules
    .split(',')
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
}

function singleScan(file: ChangedFile, kind: EscapeHatch['kind'], regex: RegExp): EscapeHatch[] {
  const found: EscapeHatch[] = [];
  regex.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(file.content)) !== null) {
    const text = match[0];
    const idMatch = EXCEPTION_ID.exec(text);
    const justMatch = INLINE_JUSTIFICATION.exec(text);
    const hatch: EscapeHatch = {
      location: { file: file.path, line: lineFor(file.content, match.index) },
      kind,
      ...(idMatch?.groups?.id === undefined ? {} : { exceptionId: idMatch.groups.id }),
      ...(justMatch?.groups?.text === undefined
        ? {}
        : { inlineJustification: justMatch.groups.text.trim() }),
    };
    if (kind === 'eslint-disable') {
      const rules = ruleList(text);
      if (rules !== undefined) {
        Object.assign(hatch, { rules });
      }
    }
    found.push(hatch);
    if (match.index === regex.lastIndex) regex.lastIndex += 1;
  }
  return found;
}

export function scanFileForEscapeHatches(file: ChangedFile): EscapeHatch[] {
  if (file.status === 'deleted') return [];
  const all: EscapeHatch[] = [];
  for (const { kind, regex } of PATTERNS) {
    all.push(...singleScan(file, kind, regex));
  }
  return all;
}

export function scanFilesForEscapeHatches(files: readonly ChangedFile[]): EscapeHatch[] {
  const out: EscapeHatch[] = [];
  for (const file of files) {
    out.push(...scanFileForEscapeHatches(file));
  }
  return out;
}
