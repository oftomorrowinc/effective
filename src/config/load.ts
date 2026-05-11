import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createJiti } from 'jiti';
import { resolveConstitution } from '../resolve.js';
import { Constitution as ConstitutionSchema } from '../schemas.js';
import type { Constitution } from '../schemas.js';
import type { ResolvedConstitution } from '../resolve.js';

const CONFIG_NAMES = [
  'effective.config.ts',
  'effective.config.mts',
  'effective.config.cts',
  'effective.config.js',
  'effective.config.mjs',
  'effective.config.cjs',
];

export interface LoadedConfig {
  readonly configPath: string;
  readonly config: Constitution;
  readonly resolved: ResolvedConstitution;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Walk upward from `cwd` looking for a config file. Returns the absolute
 * path of the first match, or undefined if none is found before reaching
 * the filesystem root.
 */
export async function findConfigFile(cwd: string): Promise<string | undefined> {
  let dir = path.resolve(cwd);
  let parent = path.dirname(dir);
  // Walk up the tree until parent === dir (filesystem root).
  for (;;) {
    for (const name of CONFIG_NAMES) {
      const candidate = path.join(dir, name);
      if (await exists(candidate)) return candidate;
    }
    if (parent === dir) return undefined;
    dir = parent;
    parent = path.dirname(dir);
  }
}

interface ConfigModuleShape {
  default?: unknown;
  config?: unknown;
}

function pickConstitution(module: ConfigModuleShape): unknown {
  if (module.default !== undefined) return module.default;
  if (module.config !== undefined) return module.config;
  return module;
}

/**
 * Load a config file by absolute path and validate it. Throws if the file
 * does not parse as a Constitution. Uses jiti so .ts files load without a
 * separate build step.
 */
export async function loadConfigFromPath(configPath: string): Promise<LoadedConfig> {
  const jiti = createJiti(configPath, { interopDefault: true });
  const loaded: ConfigModuleShape = await jiti.import(configPath);
  const raw = pickConstitution(loaded);
  const parsed = ConstitutionSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid Constitution in ${configPath}:\n${issues}`);
  }
  return {
    configPath,
    config: parsed.data,
    resolved: resolveConstitution(parsed.data),
  };
}

/**
 * Find and load the project's effective.config.* file. Walks upward from
 * `cwd`; throws with a clear message if no config is found.
 */
export async function loadConfig(cwd: string = process.cwd()): Promise<LoadedConfig> {
  const configPath = await findConfigFile(cwd);
  if (configPath === undefined) {
    throw new Error(
      `No effective.config.{ts,mts,cts,js,mjs,cjs} found between ${cwd} and the filesystem root. ` +
        `Run \`npx effective init\` to create one.`,
    );
  }
  return loadConfigFromPath(configPath);
}
