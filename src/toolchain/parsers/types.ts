import type { Finding } from '../../schemas.js';
import type { RunResult } from '../run.js';

export interface ParsedToolchainResult {
  readonly findings: readonly Finding[];
  readonly count: number;
}

export type Parser = (result: RunResult) => ParsedToolchainResult;
