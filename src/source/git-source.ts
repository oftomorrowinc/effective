import { compilePatterns } from '../glob.js';
import { loadCommitMetadata, loadGitDiff, loadStagedDiff } from './git.js';
import { runCommand } from '../toolchain/run.js';
import { resolveParser } from '../toolchain/parsers/index.js';
import type { ToolName } from '../toolchain/parsers/index.js';
import type { Parser } from '../toolchain/parsers/index.js';
import type { ProtectedPath, ResolvedConstitution, ResolvedScope } from '../resolve.js';
import type {
  ChangedFile,
  CommitMetadata,
  CustomCheck,
  ToolchainResult,
  VerifyContext,
} from './types.js';
import type { ExceptionRegistry } from '../schemas.js';
import { prepareWorktree } from '../worktree.js';

const TOOL_NAMES: readonly ToolName[] = ['lint', 'typecheck', 'test', 'coverage'];

function configuredCommand(resolved: ResolvedConstitution, tool: ToolName): string | undefined {
  return resolved.toolchain[tool];
}

async function runConfiguredTool(
  tool: ToolName,
  command: string,
  cwd: string,
  parser?: Parser,
): Promise<ToolchainResult> {
  const result = await runCommand({ command, cwd });
  if (!parser) {
    return {
      tool,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }
  const parsed = parser(result);
  return {
    tool,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    findings: parsed.findings,
    count: parsed.count,
  };
}

async function collectToolchainResults(
  resolved: ResolvedConstitution,
  cwd: string,
): Promise<Record<string, ToolchainResult>> {
  const results: Record<string, ToolchainResult> = {};
  for (const tool of TOOL_NAMES) {
    const command = configuredCommand(resolved, tool);
    if (command === undefined) continue;
    const parser = resolveParser(tool, resolved.toolchain);
    results[tool] = await runConfiguredTool(tool, command, cwd, parser);
  }
  for (const [name, command] of Object.entries(resolved.toolchain.custom ?? {})) {
    // Custom tools have no built-in parser dispatch; downstream rules must
    // either use failOn-style policies or supply their own analysis.
    const initial = await runConfiguredTool('test', command, cwd);
    results[name] = { ...initial, tool: name };
  }
  return results;
}

export interface LoadGitSourceInput {
  readonly repo: string;
  readonly work: string;
  readonly baseline: string;
  readonly resolved: ResolvedConstitution;
  readonly scope: ResolvedScope;
  readonly customChecks: Readonly<Record<string, CustomCheck>>;
  readonly artifacts: Readonly<Record<string, unknown>>;
  readonly exceptions: ExceptionRegistry;
  /** Skip the post-checkout install step in `prepareWorktree`. */
  readonly skipInstall?: boolean;
}

export interface LoadedSource {
  readonly ctx: VerifyContext;
  readonly cleanup: () => Promise<void>;
}

export async function loadGitSource(input: LoadGitSourceInput): Promise<LoadedSource> {
  const changedFiles = await loadGitDiff({
    repo: input.repo,
    work: input.work,
    baseline: input.baseline,
  });

  const hasToolchain =
    input.resolved.toolchain.lint !== undefined ||
    input.resolved.toolchain.typecheck !== undefined ||
    input.resolved.toolchain.test !== undefined ||
    input.resolved.toolchain.coverage !== undefined ||
    Object.keys(input.resolved.toolchain.custom ?? {}).length > 0;

  const commitMetadata = await loadCommitMetadata(input.repo, input.work);

  if (!hasToolchain) {
    return {
      ctx: assembleContext(
        { ...input, protectedPaths: input.resolved.protectedPaths },
        changedFiles,
        {},
        input.repo,
        commitMetadata,
      ),
      cleanup: () => Promise.resolve(),
    };
  }

  const handle = await prepareWorktree({
    repo: input.repo,
    work: input.work,
    ...(input.skipInstall === true ? { skipInstall: true } : {}),
  });
  const toolchainResults = await collectToolchainResults(input.resolved, handle.path);
  return {
    ctx: assembleContext(
      { ...input, protectedPaths: input.resolved.protectedPaths },
      changedFiles,
      toolchainResults,
      input.repo,
      commitMetadata,
    ),
    cleanup: async (): Promise<void> => {
      await handle.cleanup();
    },
  };
}

function assembleContext(
  input: {
    scope: ResolvedScope;
    customChecks: Readonly<Record<string, CustomCheck>>;
    artifacts: Readonly<Record<string, unknown>>;
    exceptions: ExceptionRegistry;
    protectedPaths: readonly ProtectedPath[];
  },
  changedFiles: readonly ChangedFile[],
  toolchainResults: Readonly<Record<string, ToolchainResult>>,
  repo?: string,
  commitMetadata?: CommitMetadata,
): VerifyContext {
  return {
    changedFiles,
    editableMatcher: compilePatterns(input.scope.editable),
    protectedPaths: input.protectedPaths,
    scope: input.scope,
    artifacts: input.artifacts,
    toolchainResults,
    customChecks: input.customChecks,
    exceptionRegistry: input.exceptions,
    ...(repo === undefined ? {} : { repo }),
    ...(commitMetadata === undefined ? {} : { commitMetadata }),
  };
}

export interface LoadStagedSourceInput {
  readonly repo: string;
  readonly resolved: ResolvedConstitution;
  readonly scope: ResolvedScope;
  readonly customChecks: Readonly<Record<string, CustomCheck>>;
  readonly artifacts: Readonly<Record<string, unknown>>;
  readonly exceptions: ExceptionRegistry;
}

export async function loadStagedSource(input: LoadStagedSourceInput): Promise<LoadedSource> {
  const changedFiles = await loadStagedDiff({ repo: input.repo });
  const toolchainResults = await collectToolchainResults(input.resolved, input.repo);
  // Staged source = pre-commit. HEAD is the previous commit; there's no
  // commit yet for the staged changes. Read HEAD's metadata as useful
  // context (author, attempt would come from VerifyInput).
  const commitMetadata = await loadCommitMetadata(input.repo, 'HEAD');
  return {
    ctx: assembleContext(
      { ...input, protectedPaths: input.resolved.protectedPaths },
      changedFiles,
      toolchainResults,
      input.repo,
      commitMetadata,
    ),
    cleanup: () => Promise.resolve(),
  };
}
