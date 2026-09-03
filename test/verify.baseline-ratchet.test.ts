import { describe, expect, it } from 'vitest';
import { writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { verify } from '../src/verify.js';
import { unionProtectedPaths, resolveBaselineConstitution } from '../src/config/baseline.js';
import { scope } from './_helpers.js';
import { git, useEphemeralRepo } from './_git-helpers.js';
import type { Constitution } from '../src/schemas.js';

/**
 * The constitution that judges a diff must be the one that existed
 * BEFORE it. These tests pin the attack the pre-publish review found:
 * one commit that empties `protected` used to pass with zero findings,
 * having deleted the rule that would have caught it.
 */

const PROTECTED_RULE = {
  kind: 'custom' as const,
  id: 'protected-paths-respected',
  category: 'governance' as const,
  defaultSeverity: 'CRITICAL' as const,
  description: 'Protected paths are not edited by workers.',
  checkRef: 'protectedPathsRespected',
  prompt: { summary: 'Do not edit protected files.', guidance: 'Surface a kick-back.' },
};

const PROTECTING: Constitution = {
  rules: [PROTECTED_RULE],
  protected: [{ path: 'package.json', rationale: 'Scripts are constitutional.' }],
};

const DISARMED: Constitution = { rules: [PROTECTED_RULE], protected: [] };

function configSource(config: Constitution): string {
  return `export default ${JSON.stringify(config, null, 2)};\n`;
}

async function seedRepo(repo: string, config: Constitution): Promise<string> {
  const configPath = path.join(repo, 'effective.config.js');
  await writeFile(configPath, configSource(config));
  await writeFile(path.join(repo, 'package.json'), '{"name":"x","version":"1.0.0"}\n');
  await git(repo, 'add -A');
  await git(repo, 'commit -m baseline');
  return configPath;
}

describe('baseline protection ratchet', () => {
  const repoRef = useEphemeralRepo();

  it('fires on a protected path even when the diff empties `protected`', async () => {
    const repo = repoRef.current;
    const configPath = await seedRepo(repo, PROTECTING);

    await git(repo, 'checkout -b attack');
    await writeFile(configPath, configSource(DISARMED));
    await writeFile(path.join(repo, 'package.json'), '{"name":"x","version":"9.9.9"}\n');
    await git(repo, 'add -A');
    await git(repo, 'commit -m "disarm and edit"');

    const result = await verify({
      scope: scope('code-writer'),
      config: DISARMED, // what the WORK side declares — no protections at all
      configPath,
      source: { kind: 'git', repo, work: 'attack', baseline: 'main' },
      skipInstall: true,
    });

    const protectedFindings = result.findings.filter(
      (f) => f.ruleId === 'protected-paths-respected',
    );
    // package.json is protected by the BASELINE config; the diff cannot
    // repeal that on the same commit that edits the file.
    expect(protectedFindings.some((f) => f.evidence.includes('package.json'))).toBe(true);
    // ...and editing the constitution is itself always a finding.
    expect(protectedFindings.some((f) => f.evidence.includes('effective.config.js'))).toBe(true);
    expect(result.verdict).toBe('fail');
  });

  it('lets a diff ADD protection immediately', async () => {
    const repo = repoRef.current;
    const configPath = await seedRepo(repo, DISARMED);
    const widened: Constitution = {
      rules: [PROTECTED_RULE],
      protected: [{ path: 'secrets.txt', rationale: 'New protection.' }],
    };

    await git(repo, 'checkout -b widen');
    await writeFile(path.join(repo, 'secrets.txt'), 'x\n');
    await git(repo, 'add -A');
    await git(repo, 'commit -m "touch newly protected file"');

    const result = await verify({
      scope: scope('code-writer'),
      config: widened,
      configPath,
      source: { kind: 'git', repo, work: 'widen', baseline: 'main' },
      skipInstall: true,
    });
    expect(
      result.findings.some(
        (f) => f.ruleId === 'protected-paths-respected' && f.evidence.includes('secrets.txt'),
      ),
    ).toBe(true);
  });

  it('fails closed when the baseline config exists but cannot be resolved', async () => {
    const repo = repoRef.current;
    const configPath = path.join(repo, 'effective.config.js');
    await writeFile(configPath, 'export default { this is not valid javascript\n');
    await writeFile(path.join(repo, 'package.json'), '{"name":"x"}\n');
    await git(repo, 'add -A');
    await git(repo, 'commit -m "broken baseline config"');

    await git(repo, 'checkout -b work');
    await writeFile(configPath, configSource(DISARMED));
    await git(repo, 'add -A');
    await git(repo, 'commit -m "replace with a permissive config"');

    const result = await verify({
      scope: scope('code-writer'),
      config: DISARMED,
      configPath,
      source: { kind: 'git', repo, work: 'work', baseline: 'main' },
      skipInstall: true,
    });
    // Refusing to fall back to the diff's own config IS the point: the
    // fallback is the bypass wearing a different hat.
    expect(
      result.findings.some((f) => f.ruleId === 'governance.baseline-constitution-unreadable'),
    ).toBe(true);
    expect(result.verdict).toBe('fail');
  });

  it('treats an absent baseline config as a first adoption, not a failure', async () => {
    const repo = repoRef.current;
    await writeFile(path.join(repo, 'package.json'), '{"name":"x"}\n');
    await git(repo, 'add -A');
    await git(repo, 'commit -m "no config yet"');

    await git(repo, 'checkout -b adopt');
    const configPath = path.join(repo, 'effective.config.js');
    await writeFile(configPath, configSource(PROTECTING));
    await git(repo, 'add -A');
    await git(repo, 'commit -m "adopt effective"');

    const result = await verify({
      scope: scope('code-writer'),
      config: PROTECTING,
      configPath,
      source: { kind: 'git', repo, work: 'adopt', baseline: 'main' },
      skipInstall: true,
    });
    expect(
      result.findings.some((f) => f.ruleId === 'governance.baseline-constitution-unreadable'),
    ).toBe(false);
  });

  it('reports absent when the config path lies outside the repo', async () => {
    const repo = repoRef.current;
    await writeFile(path.join(repo, 'package.json'), '{"name":"x"}\n');
    await git(repo, 'add -A');
    await git(repo, 'commit -m init');
    const outcome = await resolveBaselineConstitution({
      repo,
      baseline: 'main',
      configPath: '/somewhere/else/effective.config.ts',
      resolveOptions: {},
    });
    expect(outcome.kind).toBe('absent');
  });

  it('leaves no scratch directory behind', async () => {
    const repo = repoRef.current;
    const configPath = await seedRepo(repo, PROTECTING);
    await resolveBaselineConstitution({
      repo,
      baseline: 'main',
      configPath,
      resolveOptions: {},
    });
    await expect(
      rm(path.join(repo, '.effective', 'baseline'), { recursive: true }),
    ).rejects.toThrow();
  });
});

describe('unionProtectedPaths', () => {
  it('keeps entries from both sides', () => {
    const merged = unionProtectedPaths(
      [{ path: 'a', rationale: 'baseline' }],
      [{ path: 'b', rationale: 'work' }],
    );
    expect(merged.map((e) => e.path).sort()).toEqual(['a', 'b']);
  });

  it("prefers the baseline's rationale, which is the text a reviewer agreed to", () => {
    const merged = unionProtectedPaths(
      [{ path: 'a', rationale: 'baseline reason' }],
      [{ path: 'a', rationale: 'rewritten by the diff' }],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.rationale).toBe('baseline reason');
  });
});
