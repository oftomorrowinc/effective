import { builtInRoleDefaults } from '../schemas/scope.js';
import type {
  Constitution,
  Expectations,
  Rule,
  RuleCategory,
  RoleDefinition,
  Scope,
  ToolchainConfig,
} from './schemas.js';

const BUILT_IN_ROLES = new Set(Object.keys(builtInRoleDefaults));

export interface ProtectedPath {
  readonly path: string;
  readonly rationale: string;
}

export interface ResolvedConstitution {
  readonly rules: ReadonlyMap<string, Rule>;
  readonly byCategory: ReadonlyMap<RuleCategory, readonly Rule[]>;
  readonly customRoles: ReadonlyMap<string, RoleDefinition>;
  readonly toolchain: ToolchainConfig;
  readonly meta: { name?: string; version?: string; description?: string };
  /**
   * Protected paths merged across extends + this constitution's own list.
   * Order is preserved (extends first, then this constitution's additions).
   * Duplicate path strings are NOT deduplicated — the last rationale wins
   * if a downstream config wants to override an upstream rationale, which
   * is rare but valid.
   */
  readonly protectedPaths: readonly ProtectedPath[];
}

export interface ResolveOptions {
  /** Map from preset name → constitution. Required if `config.extends` is non-empty. */
  presetRegistry?: Readonly<Record<string, Constitution>>;
}

export interface ResolvedScope {
  readonly goal: string;
  readonly editable: readonly string[];
  readonly role: string;
  readonly expectations: Expectations;
  readonly spec?: string;
  readonly deliverable?: string;
  readonly relatedRules?: readonly string[];
}

function indexByCategory(rules: ReadonlyMap<string, Rule>): Map<RuleCategory, Rule[]> {
  const result = new Map<RuleCategory, Rule[]>();
  for (const rule of rules.values()) {
    const list = result.get(rule.category) ?? [];
    list.push(rule);
    result.set(rule.category, list);
  }
  return result;
}

/**
 * Compose a Constitution into a flat, queryable form.
 *
 * Resolution order:
 *   1. Recursively resolve every preset named in `extends`, in order (later wins)
 *   2. Apply this constitution's own rules, roles, toolchain, meta
 *   3. Apply per-rule severity overrides (must reference a known rule id)
 *   4. Apply rule disables (must reference a known rule id)
 *
 * Throws if any override or disable references an unknown rule id, if
 * `extends` mentions a preset that's not in the registry, if `extends`
 * forms a cycle, or if a single constitution's own `rules` array
 * declares the same id twice.
 */
export function resolveConstitution(
  config: Constitution,
  options: ResolveOptions = {},
): ResolvedConstitution {
  return resolveWithStack(config, options, []);
}

function resolveWithStack(
  config: Constitution,
  options: ResolveOptions,
  presetStack: readonly string[],
): ResolvedConstitution {
  const presets = options.presetRegistry ?? {};

  const rules = new Map<string, Rule>();
  const customRoles = new Map<string, RoleDefinition>();
  let toolchain: ToolchainConfig = {};
  const metaParts: {
    name?: string | undefined;
    version?: string | undefined;
    description?: string | undefined;
  }[] = [];
  // Use a Map so a downstream rationale overrides an upstream one for the
  // same path. Insertion order is preserved by Map, which makes the
  // resulting list stable.
  const protectedPathMap = new Map<string, ProtectedPath>();

  for (const presetName of config.extends ?? []) {
    // eslint-disable-next-line security/detect-object-injection -- exception-id: caller-validated-dynamic-key
    const preset = presets[presetName];
    if (!preset) {
      throw new Error(
        `extends references unknown preset "${presetName}". ` +
          `Pass options.presetRegistry with this preset registered, or remove it from extends.`,
      );
    }
    // A preset already on the resolution stack means extends is cyclic —
    // fail with the chain rather than letting the recursion blow the
    // call stack. (The same preset appearing twice via a diamond is
    // fine; only an ancestor re-entering is a cycle.)
    if (presetStack.includes(presetName)) {
      throw new Error(
        `extends cycle detected: ${[...presetStack, presetName].join(' → ')}. ` +
          `Presets must not extend each other cyclically.`,
      );
    }
    const presetResolved = resolveWithStack(preset, options, [...presetStack, presetName]);
    for (const [id, rule] of presetResolved.rules) rules.set(id, rule);
    for (const [name, def] of presetResolved.customRoles) customRoles.set(name, def);
    toolchain = { ...toolchain, ...presetResolved.toolchain };
    metaParts.push(presetResolved.meta);
    for (const entry of presetResolved.protectedPaths) protectedPathMap.set(entry.path, entry);
  }

  // Last-wins merging is deliberate ACROSS extends layers (a project
  // rule overrides a preset rule). Within a single constitution's own
  // rules array, a duplicate id is almost certainly an authoring error
  // — factory-generated ids (slugged from a truncated regex source) can
  // collide silently, dropping a rule. Fail loudly instead.
  const ownIds = new Set<string>();
  for (const rule of config.rules ?? []) {
    if (ownIds.has(rule.id)) {
      throw new Error(
        `duplicate rule id "${rule.id}" within one constitution's rules array. ` +
          `If both rules are intentional, give one an explicit distinct id ` +
          `(factory-generated ids derive from the pattern source and can collide).`,
      );
    }
    ownIds.add(rule.id);
    rules.set(rule.id, rule);
  }
  if (config.toolchain) toolchain = { ...toolchain, ...config.toolchain };
  if (config.meta) metaParts.push(config.meta);
  for (const [name, def] of Object.entries(config.roles ?? {})) {
    customRoles.set(name, def);
  }
  for (const entry of config.protected ?? []) protectedPathMap.set(entry.path, entry);

  for (const [id, override] of Object.entries(config.override ?? {})) {
    const rule = rules.get(id);
    if (!rule) {
      throw new Error(
        `override references unknown rule "${id}". ` +
          `Overrides must reference rule ids that exist after extends + this constitution's rules are merged.`,
      );
    }
    rules.set(id, { ...rule, defaultSeverity: override.severity });
  }

  for (const id of Object.keys(config.disable ?? {})) {
    if (!rules.has(id)) {
      throw new Error(
        `disable references unknown rule "${id}". ` +
          `Disables must reference rule ids that exist after extends + this constitution's rules are merged.`,
      );
    }
    rules.delete(id);
  }

  const meta: ResolvedConstitution['meta'] = {};
  for (const part of metaParts) {
    if (part.name !== undefined) meta.name = part.name;
    if (part.version !== undefined) meta.version = part.version;
    if (part.description !== undefined) meta.description = part.description;
  }

  return {
    rules,
    byCategory: indexByCategory(rules),
    customRoles,
    toolchain,
    meta,
    protectedPaths: [...protectedPathMap.values()],
  };
}

/**
 * Merge a Scope with role defaults and custom-role expectations.
 *
 * Built-in roles use `builtInRoleDefaults`; custom roles look up against the
 * resolved constitution's `customRoles` index. The scope's own `expectations`
 * win over role defaults on a key-by-key basis. If the scope's `editable`
 * list is empty, the role's `defaultEditable` (custom roles only) is used.
 *
 * Throws if the scope references a role that is neither a built-in nor a
 * known custom role.
 */
export function resolveScope(scope: Scope, resolved: ResolvedConstitution): ResolvedScope {
  let roleDefaults: Expectations;
  let defaultEditable: readonly string[] | undefined;

  if (BUILT_IN_ROLES.has(scope.role)) {
    roleDefaults = builtInRoleDefaults[scope.role as keyof typeof builtInRoleDefaults];
  } else {
    const custom = resolved.customRoles.get(scope.role);
    if (!custom) {
      throw new Error(
        `scope references unknown role "${scope.role}". ` +
          `Register a custom role via config.roles or use one of: ${[...BUILT_IN_ROLES].join(', ')}.`,
      );
    }
    roleDefaults = custom.expectations;
    defaultEditable = custom.defaultEditable;
  }

  const expectations: Expectations = { ...roleDefaults, ...scope.expectations };
  const editable: readonly string[] =
    scope.editable.length > 0 ? scope.editable : (defaultEditable ?? []);

  return {
    goal: scope.goal,
    editable,
    role: scope.role,
    expectations,
    ...(scope.spec === undefined ? {} : { spec: scope.spec }),
    ...(scope.deliverable === undefined ? {} : { deliverable: scope.deliverable }),
    ...(scope.relatedRules === undefined ? {} : { relatedRules: scope.relatedRules }),
  };
}
