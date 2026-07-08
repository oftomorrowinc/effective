import type { Finding } from '../../schemas.js';
import type { RunResult } from '../run.js';

export interface ParsedToolchainResult {
  readonly findings: readonly Finding[];
  /**
   * Parsed issue count. ABSENT (not 0) when the output did not contain
   * the structure this parser understands — "could not measure" must
   * stay distinct from "measured zero", because count-based gates
   * treat 0 as clean. When absent, the toolchain rule falls back to
   * the command's exit code instead of silently passing.
   */
  readonly count?: number;
}

export type Parser = (result: RunResult) => ParsedToolchainResult;
