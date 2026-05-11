import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { findConfigFile, loadConfig, loadConfigFromPath } from '../src/config/load.js';

async function makeDir(): Promise<string> {
  return await mkdtemp(path.join(tmpdir(), 'effective-cfg-'));
}

describe('findConfigFile', () => {
  it('finds effective.config.ts in the cwd', async () => {
    const dir = await makeDir();
    try {
      const file = path.join(dir, 'effective.config.ts');
      await writeFile(file, `export default { rules: [] };`);
      expect(await findConfigFile(dir)).toBe(file);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('walks upward to find a parent config', async () => {
    const root = await makeDir();
    try {
      const nested = path.join(root, 'a', 'b', 'c');
      await mkdir(nested, { recursive: true });
      const file = path.join(root, 'effective.config.ts');
      await writeFile(file, `export default { rules: [] };`);
      expect(await findConfigFile(nested)).toBe(file);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns undefined when no config exists between cwd and root', async () => {
    const dir = await makeDir();
    try {
      expect(await findConfigFile(dir)).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('prefers .ts over .js when both exist', async () => {
    const dir = await makeDir();
    try {
      await writeFile(path.join(dir, 'effective.config.ts'), `export default { rules: [] };`);
      await writeFile(path.join(dir, 'effective.config.js'), `module.exports = { rules: [] };`);
      const found = await findConfigFile(dir);
      expect(found?.endsWith('effective.config.ts')).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('loadConfigFromPath', () => {
  it('loads a TypeScript config via jiti and resolves it', async () => {
    const dir = await makeDir();
    try {
      const file = path.join(dir, 'effective.config.ts');
      await writeFile(
        file,
        `
import { defineConfig, rule } from '${path.resolve('src/index.ts')}';
export default defineConfig({
  rules: [rule.forbidPattern(/TODO\\b/, { id: 'no-todo' })],
  meta: { name: 'from-disk' },
});
`,
      );
      const loaded = await loadConfigFromPath(file);
      expect(loaded.configPath).toBe(file);
      expect(loaded.config.meta?.name).toBe('from-disk');
      expect(loaded.resolved.rules.has('no-todo')).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('throws with a structured message on a malformed config', async () => {
    const dir = await makeDir();
    try {
      const file = path.join(dir, 'effective.config.ts');
      await writeFile(file, `export default { rules: 'not an array' };`);
      await expect(loadConfigFromPath(file)).rejects.toThrowError(/Invalid Constitution/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('loadConfig', () => {
  it('throws a helpful error when no config is found', async () => {
    const dir = await makeDir();
    try {
      await expect(loadConfig(dir)).rejects.toThrowError(/effective init/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
