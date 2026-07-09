/**
 * Pre-push gate with a tag-only fast path.
 *
 * Git feeds the hook one line per ref being pushed on stdin:
 * `<local-ref> <local-sha> <remote-ref> <remote-sha>`. A push that
 * consists ENTIRELY of tags (e.g. `git push origin v0.1.0-rc.8`)
 * names already-verified history — the commits behind a tag went
 * through the PR gate and CI before they could be tagged — so running
 * lint + tests + build + verify again is pure redundancy, and worse,
 * `verify --against origin/main` reports on branch state the tag push
 * doesn't change (see docs/RELEASING.md).
 *
 * Any push containing a branch ref, and any push where stdin is empty
 * or unreadable, runs the full gate — skipping is the exception, not
 * the default.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const GATE =
  'pnpm lint && pnpm typecheck && pnpm test && pnpm build && node dist/cli.mjs verify --against origin/main';

let stdin = '';
try {
  stdin = readFileSync(0, 'utf8');
} catch {
  // No readable stdin — treat as no refs, which runs the full gate.
}
const lines = stdin
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.length > 0);
const tagOnly =
  lines.length > 0 &&
  lines.every((line) => line.split(/\s+/)[2]?.startsWith('refs/tags/') === true);

if (tagOnly) {
  process.stdout.write(
    `[pre-push] tag-only push (${String(lines.length)} ref(s)) — skipping the gate; tags name already-verified history.\n`,
  );
} else {
  const result = spawnSync(GATE, { shell: true, stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
}
