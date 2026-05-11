import type { EscapeHatch, ExceptionRegistry, Finding, Severity } from '../schemas.js';

export interface ValidateInput {
  readonly escapeHatches: readonly EscapeHatch[];
  readonly registry: ExceptionRegistry;
  /** Severity to emit when a hatch is missing an exception-id reference. */
  readonly missingRefSeverity?: Severity;
  /** Severity to emit when the cited exception id has status `retired`. */
  readonly retiredRefSeverity?: Severity;
  /** Severity to emit when the cited exception id is not in the registry. */
  readonly unknownRefSeverity?: Severity;
  /** Severity to emit when the cited exception id is `deprecated`. */
  readonly deprecatedRefSeverity?: Severity;
  /**
   * Severity to emit when the cited exception's `mechanism` doesn't match
   * the hatch's actual mechanism (e.g. citing a `c8-ignore` exception
   * from an `eslint-disable` comment).
   */
  readonly wrongMechanismSeverity?: Severity;
  /** Rule id to put on each emitted finding. */
  readonly ruleId?: string;
  /** Category to put on each emitted finding. */
  readonly category?: string;
}

const RULE_ID_DEFAULT = 'exceptions.must-cite-justification';

function describeKind(hatch: EscapeHatch): string {
  switch (hatch.kind) {
    case 'c8-ignore': {
      return 'a `c8 ignore` comment';
    }
    case 'ts-expect-error': {
      return 'a `@ts-expect-error` comment';
    }
    case 'eslint-disable': {
      return 'an `eslint-disable` comment';
    }
    case 'prettier-ignore': {
      return 'a `prettier-ignore` comment';
    }
  }
}

function ruleId(input: ValidateInput): string {
  return input.ruleId ?? RULE_ID_DEFAULT;
}

function category(input: ValidateInput): string {
  return input.category ?? 'exceptions';
}

function asFinding(
  hatch: EscapeHatch,
  input: ValidateInput,
  severity: Severity,
  evidence: string,
  message: string,
): Finding {
  return {
    ruleId: ruleId(input),
    severity,
    category: category(input),
    location: hatch.location,
    evidence,
    message,
    source: { kind: 'rule', ruleId: ruleId(input) },
  };
}

export function validateEscapeHatches(input: ValidateInput): Finding[] {
  const missing = input.missingRefSeverity ?? 'CRITICAL';
  const unknown = input.unknownRefSeverity ?? 'CRITICAL';
  const retired = input.retiredRefSeverity ?? 'CRITICAL';
  const deprecated = input.deprecatedRefSeverity ?? 'HIGH';
  const findings: Finding[] = [];
  for (const hatch of input.escapeHatches) {
    if (hatch.exceptionId === undefined) {
      findings.push(
        asFinding(
          hatch,
          input,
          missing,
          `${describeKind(hatch)} with no \`exception-id:\` reference`,
          `${describeKind(hatch)} at ${hatch.location.file}:${String(hatch.location.line)} ` +
            'is missing an `exception-id:` reference. Add a tracked exception in `.effective/exceptions.ts` ' +
            'and cite its id in the comment, or fix the underlying issue so the suppression is no longer needed.',
        ),
      );
      continue;
    }
    const exception = input.registry[hatch.exceptionId];
    if (exception === undefined) {
      findings.push(
        asFinding(
          hatch,
          input,
          unknown,
          `exception-id "${hatch.exceptionId}" is not in .effective/exceptions.ts`,
          `${describeKind(hatch)} cites \`exception-id: ${hatch.exceptionId}\` but no such ` +
            'exception is registered. Register it (with category, context, retirement condition) or remove the ref.',
        ),
      );
      continue;
    }
    if (exception.status === 'retired') {
      findings.push(
        asFinding(
          hatch,
          input,
          retired,
          `exception-id "${hatch.exceptionId}" is marked retired`,
          `${describeKind(hatch)} cites \`exception-id: ${hatch.exceptionId}\` whose registry ` +
            'entry is `status: "retired"`. Remove this suppression — the condition that justified it no longer applies.',
        ),
      );
      continue;
    }
    if (exception.status === 'deprecated') {
      findings.push(
        asFinding(
          hatch,
          input,
          deprecated,
          `exception-id "${hatch.exceptionId}" is deprecated`,
          `${describeKind(hatch)} cites \`exception-id: ${hatch.exceptionId}\` which is ` +
            '`status: "deprecated"`. Migrate to the replacement exception or remove the suppression.',
        ),
      );
    }
    if (exception.mechanism !== null && exception.mechanism !== hatch.kind) {
      findings.push(
        asFinding(
          hatch,
          input,
          input.wrongMechanismSeverity ?? 'CRITICAL',
          `exception-id "${hatch.exceptionId}" applies to ${exception.mechanism}, not ${hatch.kind}`,
          `${describeKind(hatch)} cites \`exception-id: ${hatch.exceptionId}\`, but that ` +
            `exception is registered for \`${exception.mechanism}\` suppressions, not \`${hatch.kind}\`. ` +
            'Either change the suppression to the right mechanism or cite a different exception that covers this one.',
        ),
      );
    }
  }
  return findings;
}
