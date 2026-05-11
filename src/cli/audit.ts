import { promises as fs } from 'node:fs';
import path from 'node:path';
import { scanFileForEscapeHatches } from '../escape-hatches/scan.js';
import type { ParsedArgs } from './args.js';
import type { ChangedFile } from '../source/types.js';
import type { EscapeHatch } from '../schemas.js';

export interface AuditCliResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly hatches: readonly EscapeHatch[];
}

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']);
const SKIP_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.git',
  '.effective',
  '.next',
  '.turbo',
  '.cache',
]);

async function walk(dir: string, files: string[]): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.gitignore') {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      // Other dotfiles fall through; dot-directories we skip by default.
      if (entry.isDirectory()) continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      await walk(full, files);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;
    files.push(full);
  }
}

async function collectFiles(cwd: string): Promise<string[]> {
  const files: string[] = [];
  await walk(cwd, files);
  return files;
}

async function readAsChangedFile(absolutePath: string, cwd: string): Promise<ChangedFile> {
  const content = await fs.readFile(absolutePath, 'utf8');
  return {
    path: path.relative(cwd, absolutePath),
    content,
    status: 'modified',
  };
}

function formatHatch(hatch: EscapeHatch): string {
  const ref =
    hatch.exceptionId === undefined ? '(no exception-id)' : `exception-id: ${hatch.exceptionId}`;
  return `  ${hatch.location.file}:${String(hatch.location.line)}  [${hatch.kind}]  ${ref}`;
}

export async function runAuditCommand(args: ParsedArgs, cwd: string): Promise<AuditCliResult> {
  const onlyMissing = !args.flags.has('all');
  const files = await collectFiles(cwd);
  const hatches: EscapeHatch[] = [];
  for (const absolutePath of files) {
    const file = await readAsChangedFile(absolutePath, cwd);
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
        'tracked `exception-id:` registered in `.effective/exceptions.ts`.',
    );
  }
  return {
    stdout: `${out.join('\n')}\n`,
    stderr: '',
    exitCode: 0,
    hatches,
  };
}
