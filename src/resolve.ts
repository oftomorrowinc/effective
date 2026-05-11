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

export interface ResolvedConstitution {
  readonly rules: ReadonlyMap<string, Rule>;
  readonly byCategory: ReadonlyMap<RuleCategory, readonly Rule[]>;
  readonly customRoles: ReadonlyMap<string, RoleDefinition>;
  readonly toolchain: ToolchainConfig;
  readonly meta: { name?: string; version?: string; description?: string };
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
 * Throws if any override or disable references an unknown rule id, or if
 * `extends` mentions a preset that's not in the registry.
 */
export function resolveConstitution(
  config: Constitution,
  options: ResolveOptions = {},
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

  for (const presetName of config.extends ?? []) {
    // presets is a string-keyed registry supplied by the caller; key is a
    // preset name from the project's own constitution.
    // eslint-disable-next-line security/detect-object-injection
    const preset = presets[presetName];
    if (!preset) {
      throw new Error(
        `extends references unknown preset "${presetName}". ` +
          `Pass options.presetRegistry with this preset registered, or remove it from extends.`,
      );
    }
    const presetResolved = resolveConstitution(preset, options);
    for (const [id, rule] of presetResolved.rules) rules.set(id, rule);
    for (const [name, def] of presetResolved.customRoles) customRoles.set(name, def);
    toolchain = { ...toolchain, ...presetResolved.toolchain };
    metaParts.push(presetResolved.meta);
  }

  for (const rule of config.rules ?? []) {
    rules.set(rule.id, rule);
  }
  if (config.toolchain) toolchain = { ...toolchain, ...config.toolchain };
  if (config.meta) metaParts.push(config.meta);
  for (const [name, def] of Object.entries(config.roles ?? {})) {
    customRoles.set(name, def);
  }

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
