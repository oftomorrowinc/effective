import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

function readVersion(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const pkgPath = path.join(here, '..', 'package.json');
  const raw = readFileSync(pkgPath, 'utf8');
  const parsed = JSON.parse(raw) as { version: string };
  return parsed.version;
}

function help(): void {
  process.stdout.write(
    [
      'effective — a shared constitution for collaborative work',
      '',
      'Usage: effective <command> [options]',
      '',
      'Commands (planned):',
      '  init             Scaffold effective.config.ts and .effective/',
      '  verify           Run verification against the current diff',
      '  audit-escapes    Survey untracked escape hatches',
      '  rules            Browse the resolved constitution',
      '',
      'Commands are not yet implemented (phase 0 stub).',
      '',
    ].join('\n'),
  );
}

function unknown(name: string): never {
  process.stderr.write(`effective: subcommand "${name}" is not yet implemented (phase 0 stub).\n`);
  // eslint-disable-next-line n/no-process-exit, unicorn/no-process-exit
  process.exit(2);
}

function main(argv: readonly string[]): void {
  const subcommand = argv[2];
  if (subcommand === '--version' || subcommand === '-v') {
    process.stdout.write(`${readVersion()}\n`);
    return;
  }
  if (subcommand === '--help' || subcommand === '-h' || subcommand === undefined) {
    help();
    return;
  }
  unknown(subcommand);
}

main(process.argv);
