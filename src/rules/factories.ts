import type {
  CustomRule,
  LaneRule,
  PatternRule,
  PromptProjection,
  Rule,
  RuleCategory,
  SchemaRule,
  Severity,
  SpecRule,
  ToolchainRule,
} from '../schemas.js';
import type { z } from 'zod';

type FactoryDefaults = Partial<
  Pick<
    Rule,
    | 'category'
    | 'defaultSeverity'
    | 'description'
    | 'catalogueEntry'
    | 'relatedPrinciple'
    | 'appliesToRoles'
    | 'diffOnly'
  >
>;

interface PatternOptions extends FactoryDefaults {
  id?: string;
  in?: string;
  notIn?: string;
  matchInStrings?: boolean;
  matchInComments?: boolean;
  prompt?: Partial<PromptProjection>;
}

type RequirePatternOptions = PatternOptions;

interface LaneOptions extends FactoryDefaults {
  id?: string;
  flagDeletions?: boolean;
  alwaysAllow?: readonly string[];
  prompt?: Partial<PromptProjection>;
}

interface SpecOptions extends FactoryDefaults {
  id?: string;
  check: SpecRule['check'];
  prompt?: Partial<PromptProjection>;
}

interface ToolchainOptions extends FactoryDefaults {
  id?: string;
  tool: ToolchainRule['tool'];
  failOn: ToolchainRule['failOn'];
  name?: string;
  prompt?: Partial<PromptProjection>;
}

interface CustomOptions extends FactoryDefaults {
  id: string;
  checkRef: string;
  prompt: PromptProjection;
}

interface SchemaOptions extends FactoryDefaults {
  id: string;
  appliesTo: string;
  schema: z.ZodTypeAny;
  prompt: PromptProjection;
}

function patternId(source: RegExp | string, prefix: string): string {
  const body = source instanceof RegExp ? source.source : source;
  const slug = body
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug.length > 0 ? `${prefix}.${slug}` : `${prefix}.unnamed`;
}

function buildPromptProjection(
  defaults: PromptProjection,
  partial: Partial<PromptProjection> | undefined,
): PromptProjection {
  return {
    summary: partial?.summary ?? defaults.summary,
    guidance: partial?.guidance ?? defaults.guidance,
    ...(partial?.examples === undefined ? {} : { examples: partial.examples }),
  };
}

function withDefaults<T extends Rule>(
  base: T,
  defaults: FactoryDefaults,
  category: RuleCategory,
  severity: Severity,
): T {
  return {
    ...base,
    category: defaults.category ?? category,
    defaultSeverity: defaults.defaultSeverity ?? severity,
    description: defaults.description ?? base.description,
    ...(defaults.catalogueEntry === undefined ? {} : { catalogueEntry: defaults.catalogueEntry }),
    ...(defaults.relatedPrinciple === undefined
      ? {}
      : { relatedPrinciple: defaults.relatedPrinciple }),
    ...(defaults.appliesToRoles === undefined ? {} : { appliesToRoles: defaults.appliesToRoles }),
    ...(defaults.diffOnly === undefined ? {} : { diffOnly: defaults.diffOnly }),
  };
}

function patternBase(
  pattern: RegExp | string,
  options: PatternOptions,
  forbidden: boolean,
  prefix: 'forbid' | 'require',
  defaultSeverity: Severity,
): PatternRule {
  const display = pattern instanceof RegExp ? `\`${pattern.source}\`` : `\`${pattern}\``;
  const summary = forbidden ? `Forbidden pattern ${display}` : `Required pattern ${display}`;
  const guidance = forbidden
    ? `Do not introduce matches for ${display} in ${options.in ?? '**/*'}.`
    : `Every file matching ${options.in ?? '**/*'} must contain a match for ${display}.`;
  const base: PatternRule = {
    kind: 'pattern',
    id: options.id ?? patternId(pattern, prefix),
    category: 'custom',
    defaultSeverity,
    description: summary,
    pattern,
    forbidden,
    inGlob: options.in ?? '**/*',
    ...(options.notIn === undefined ? {} : { notInGlob: options.notIn }),
    ...(options.matchInStrings === undefined ? {} : { matchInStrings: options.matchInStrings }),
    ...(options.matchInComments === undefined ? {} : { matchInComments: options.matchInComments }),
    prompt: buildPromptProjection({ summary, guidance }, options.prompt),
  };
  return withDefaults(base, options, 'custom', defaultSeverity);
}

function forbidPattern(pattern: RegExp | string, options: PatternOptions = {}): PatternRule {
  return patternBase(pattern, options, true, 'forbid', 'CRITICAL');
}

function requirePattern(
  pattern: RegExp | string,
  options: RequirePatternOptions = {},
): PatternRule {
  return patternBase(pattern, options, false, 'require', 'HIGH');
}

function lane(options: LaneOptions = {}): LaneRule {
  const id = options.id ?? 'lane.editable-respected';
  const summary = 'Diff stays inside the scope.editable lane.';
  const guidance =
    'Every changed file must match `scope.editable`. Files outside the lane — including deletions — fail this rule.';
  const base: LaneRule = {
    kind: 'lane',
    id,
    category: 'lane',
    defaultSeverity: 'CRITICAL',
    description: summary,
    flagDeletions: options.flagDeletions ?? true,
    ...(options.alwaysAllow === undefined ? {} : { alwaysAllow: [...options.alwaysAllow] }),
    prompt: buildPromptProjection({ summary, guidance }, options.prompt),
  };
  return withDefaults(base, options, 'lane', 'CRITICAL');
}

function spec(options: SpecOptions): SpecRule {
  const id = options.id ?? `spec.${options.check}`;
  const summary = `Spec discipline: ${options.check}.`;
  const guidance =
    options.check === 'test-names-land-verbatim'
      ? 'Tests named in `scope.spec` must appear in committed test files verbatim.'
      : options.check === 'assertions-not-narrowed'
        ? 'Assertions in committed tests must not be weaker than the spec specifies.'
        : 'Tests not declared in `scope.spec` must not claim to satisfy a spec.';
  const base: SpecRule = {
    kind: 'spec',
    id,
    category: 'spec-discipline',
    defaultSeverity: 'CRITICAL',
    description: summary,
    check: options.check,
    prompt: buildPromptProjection({ summary, guidance }, options.prompt),
  };
  return withDefaults(base, options, 'spec-discipline', 'CRITICAL');
}

function toolchain(options: ToolchainOptions): ToolchainRule {
  if (options.tool === 'custom' && options.name === undefined) {
    throw new Error(
      'toolchain rules with `tool: "custom"` require a `name` referencing config.toolchain.custom.',
    );
  }
  const id = options.id ?? `toolchain.${options.tool}${options.name ? `.${options.name}` : ''}`;
  const summary = `${options.tool} gate (${options.failOn}).`;
  const guidance = `The configured ${options.tool} command must satisfy the "${options.failOn}" condition.`;
  const base: ToolchainRule = {
    kind: 'toolchain',
    id,
    category: 'toolchain',
    defaultSeverity: 'CRITICAL',
    description: summary,
    tool: options.tool,
    ...(options.name === undefined ? {} : { name: options.name }),
    failOn: options.failOn,
    prompt: buildPromptProjection({ summary, guidance }, options.prompt),
  };
  return withDefaults(base, options, 'toolchain', 'CRITICAL');
}

function custom(options: CustomOptions): CustomRule {
  const base: CustomRule = {
    kind: 'custom',
    id: options.id,
    category: options.category ?? 'custom',
    defaultSeverity: options.defaultSeverity ?? 'HIGH',
    description: options.description ?? options.prompt.summary,
    checkRef: options.checkRef,
    prompt: options.prompt,
  };
  return withDefaults(
    base,
    options,
    options.category ?? 'custom',
    options.defaultSeverity ?? 'HIGH',
  );
}

function schema(options: SchemaOptions): SchemaRule {
  const base: SchemaRule = {
    kind: 'schema',
    id: options.id,
    category: options.category ?? 'data-discipline',
    defaultSeverity: options.defaultSeverity ?? 'CRITICAL',
    description: options.description ?? options.prompt.summary,
    appliesTo: options.appliesTo,
    schema: options.schema,
    prompt: options.prompt,
  };
  return withDefaults(
    base,
    options,
    options.category ?? 'data-discipline',
    options.defaultSeverity ?? 'CRITICAL',
  );
}

export const rule = {
  forbidPattern,
  requirePattern,
  lane,
  spec,
  toolchain,
  custom,
  schema,
} as const;
