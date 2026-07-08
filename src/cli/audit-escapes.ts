import { promises as fs } from 'node:fs';
import path from 'node:path';
import { scanFileForEscapeHatches } from '../escape-hatches/scan.js';
import { walkSourceFiles } from '../walk.js';
import { compilePatterns } from '../glob.js';
import { findConfigFile, loadConfigFromPath } from '../config/load.js';
import type { AuditConfig, EscapeHatch } from '../schemas.js';
import type { ParsedArgs } from './args.js';
import type { ChangedFile } from '../source/types.js';

export interface AuditEscapesCliResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly hatches: readonly EscapeHatch[];
}

/**
 * The escape-hatch scan follows the same `audit` config block as the
 * whole-repo audit (gitignore handling + exclude carve-outs), so the
 * two commands can never disagree about the file set. Running without
 * a config is still supported — the scan needs no constitution — and
 * uses the defaults (gitignore honored, no carve-outs). An explicit
 * `--config` that fails to load is an error; a discovered config that
 * fails to load is too (a broken constitution shouldn't silently
 * change what gets scanned).
 */
async function resolveAuditConfig(args: ParsedArgs, cwd: string): Promise<AuditConfig> {
  const explicit = args.options.config;
  const configPath =
    explicit === undefined ? await findConfigFile(cwd) : path.resolve(cwd, explicit);
  if (configPath === undefined) return {};
  const loaded = await loadConfigFromPath(configPath);
  return loaded.config.audit ?? {};
}

async function readAsChangedFile(absolutePath: string, cwd: string): Promise<ChangedFile> {
  const content = await fs.readFile(absolutePath, 'utf8');
  return {
    path: path.relative(cwd, absolutePath).replaceAll('\\', '/'),
    content,
    status: 'modified',
  };
}

function formatHatch(hatch: EscapeHatch): string {
  const ref =
    hatch.exceptionId === undefined ? '(no exception-id)' : `exception-id: ${hatch.exceptionId}`;
  return `  ${hatch.location.file}:${String(hatch.location.line)}  [${hatch.kind}]  ${ref}`;
}

export async function runAuditEscapesCommand(
  args: ParsedArgs,
  cwd: string,
): Promise<AuditEscapesCliResult> {
  const onlyMissing = !args.flags.has('all');
  const auditConfig = await resolveAuditConfig(args, cwd);
  const excludeGlobs = auditConfig.exclude ?? [];
  const excludeMatcher = excludeGlobs.length === 0 ? undefined : compilePatterns(excludeGlobs);
  const files = await walkSourceFiles(cwd, {
    respectGitignore: auditConfig.respectGitignore ?? true,
  });
  const hatches: EscapeHatch[] = [];
  for (const absolutePath of files) {
    const file = await readAsChangedFile(absolutePath, cwd);
    if (excludeMatcher?.(file.path) === true) continue;
    hatches.push(...scanFileForEscapeHatches(file));
  }
  const reportable = onlyMissing ? hatches.filter((h) => h.exceptionId === undefined) : hatches;
  const out: string[] = [];
  if (reportable.length === 0) {
    out.push(
      onlyMissing
        ? 'No escape hatches missing an exception-id. (Pass --all to list every hatch, justified or not.)'
        : 'No escape hatches found in source files.',
    );
  } else {
    out.push(
      onlyMissing
        ? `Found ${String(reportable.length)} escape hatch(es) without an \`exception-id:\` ref:`
        : `Found ${String(reportable.length)} escape hatch(es):`,
    );
    for (const hatch of reportable) out.push(formatHatch(hatch));
    out.push(
      '',
      'Each unjustified hatch should either be removed (fix the underlying issue) or cite a ' +
        "tracked `exception-id:` registered under the config's `exceptions` field.",
    );
  }
  return {
    stdout: `${out.join('\n')}\n`,
    stderr: '',
    exitCode: 0,
    hatches,
  };
}
