import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseArgs } from './cli/args.js';
import { runVerifyCommand } from './cli/verify.js';
import { runInitCommand } from './cli/init.js';
import { runAuditCommand } from './cli/audit.js';
import { runRulesCommand } from './cli/rules.js';

interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

function readVersion(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const pkgPath = path.join(here, '..', 'package.json');
  const raw = readFileSync(pkgPath, 'utf8');
  const parsed = JSON.parse(raw) as { version: string };
  return parsed.version;
}

function helpText(): string {
  return [
    'effective — a shared constitution for collaborative work',
    '',
    'Usage: effective <command> [options]',
    '',
    'Commands:',
    '  init                       Scaffold effective.config.ts and .effective/',
    '  verify [--work <ref>] [--baseline <ref>] [--against <ref>] [--staged]',
    '                             Run verification against the current diff',
    '  audit-escapes [--all]      Survey escape hatches in source files',
    '  rules [<id> | --search <id>]',
    '                             Browse the resolved constitution',
    '',
    'Common options:',
    '  --config <path>            Path to effective.config.{ts,js,...} (default: search upward from cwd)',
    '  --reporter <pretty|json>   Output format for `verify` (default: pretty)',
    '  --force                    For `init`, overwrite existing files',
    '  -h, --help                 Show this help',
    '  -v, --version              Show package version',
    '',
  ].join('\n');
}

async function dispatch(argv: readonly string[], cwd: string): Promise<CommandResult> {
  const args = parseArgs(argv);
  if (args.flags.has('version') || args.subcommand === 'version') {
    return { stdout: `${readVersion()}\n`, stderr: '', exitCode: 0 };
  }
  if (args.subcommand === undefined || args.flags.has('help') || args.subcommand === 'help') {
    return { stdout: helpText(), stderr: '', exitCode: 0 };
  }
  switch (args.subcommand) {
    case 'init': {
      return await runInitCommand(args, cwd);
    }
    case 'verify': {
      return await runVerifyCommand(args, cwd);
    }
    case 'audit-escapes': {
      return await runAuditCommand(args, cwd);
    }
    case 'rules': {
      return await runRulesCommand(args, cwd);
    }
    default: {
      return {
        stdout: '',
        stderr: `effective: unknown command "${args.subcommand}". Run \`effective --help\` for usage.\n`,
        exitCode: 2,
      };
    }
  }
}

async function main(): Promise<void> {
  try {
    const result = await dispatch(process.argv.slice(2), process.cwd());
    if (result.stdout.length > 0) process.stdout.write(result.stdout);
    if (result.stderr.length > 0) process.stderr.write(result.stderr);
    // eslint-disable-next-line n/no-process-exit, unicorn/no-process-exit
    process.exit(result.exitCode);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`effective: ${message}\n`);
    // eslint-disable-next-line n/no-process-exit, unicorn/no-process-exit
    process.exit(2);
  }
}

await main();
