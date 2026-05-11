export interface ParsedArgs {
  /** First non-flag token; e.g. `verify` in `effective verify --staged`. */
  readonly subcommand: string | undefined;
  /** Key/value flags (e.g. `--work feature` becomes `{ work: 'feature' }`). */
  readonly options: Readonly<Record<string, string>>;
  /** Bare flags (e.g. `--staged` becomes `staged: true`). */
  readonly flags: ReadonlySet<string>;
  /** Remaining non-flag tokens after the subcommand. */
  readonly positional: readonly string[];
}

interface MutableArgs {
  subcommand: string | undefined;
  options: Record<string, string>;
  flags: Set<string>;
  positional: string[];
}

function shortFlagName(short: string): string {
  switch (short) {
    case 'h': {
      return 'help';
    }
    case 'v': {
      return 'version';
    }
    case 'w': {
      return 'work';
    }
    case 'b': {
      return 'baseline';
    }
    case 's': {
      return 'staged';
    }
    case 'c': {
      return 'config';
    }
    case 'r': {
      return 'reporter';
    }
    default: {
      return short;
    }
  }
}

function consumeLong(token: string, argv: readonly string[], i: number, out: MutableArgs): number {
  const eq = token.indexOf('=');
  if (eq !== -1) {
    const key = token.slice(2, eq);
    const value = token.slice(eq + 1);
    out.options[key] = value;
    return i + 1;
  }
  const key = token.slice(2);
  const next = argv[i + 1];
  if (next === undefined || next.startsWith('-')) {
    out.flags.add(key);
    return i + 1;
  }
  out.options[key] = next;
  return i + 2;
}

function consumeShort(token: string, argv: readonly string[], i: number, out: MutableArgs): number {
  const letters = token.slice(1);
  // Treat `-vh` as multiple bare flags. If the last letter could take a value
  // and the next token is non-flag, attach it.
  const last = letters.at(-1);
  const preceding = letters.slice(0, -1);
  for (const ch of preceding) {
    out.flags.add(shortFlagName(ch));
  }
  if (last === undefined) return i + 1;
  const key = shortFlagName(last);
  const next = argv[i + 1];
  if (next === undefined || next.startsWith('-')) {
    out.flags.add(key);
    return i + 1;
  }
  // Heuristic: --help/--version/--staged never take values.
  if (key === 'help' || key === 'version' || key === 'staged') {
    out.flags.add(key);
    return i + 1;
  }
  out.options[key] = next;
  return i + 2;
}

/**
 * Parse argv (typically `process.argv.slice(2)`) into a structured form.
 *
 * Conventions:
 *   - First non-flag token is the subcommand.
 *   - `--key value` and `--key=value` both produce `options[key] = value`.
 *   - `--flag` with no value (or followed by another flag) becomes a bare flag.
 *   - Short forms collapse via shortFlagName(): `-h` → `help`, `-w` → `work`,
 *     `-s` → `staged`, etc.
 *   - Anything after `--` is appended to `positional` verbatim.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const out: MutableArgs = {
    subcommand: undefined,
    options: {},
    flags: new Set(),
    positional: [],
  };
  let i = 0;
  let seenDoubleDash = false;
  while (i < argv.length) {
    const token = argv[i];
    if (token === undefined) break;
    if (seenDoubleDash) {
      out.positional.push(token);
      i += 1;
      continue;
    }
    if (token === '--') {
      seenDoubleDash = true;
      i += 1;
      continue;
    }
    if (token.startsWith('--')) {
      i = consumeLong(token, argv, i, out);
      continue;
    }
    if (token.startsWith('-') && token.length > 1) {
      i = consumeShort(token, argv, i, out);
      continue;
    }
    if (out.subcommand === undefined) {
      out.subcommand = token;
    } else {
      out.positional.push(token);
    }
    i += 1;
  }
  return out;
}
