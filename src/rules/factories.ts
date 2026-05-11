export const rule = {
  forbidPattern(_pattern: RegExp | string, _options?: unknown): never {
    throw new Error('rule.forbidPattern is not yet implemented (phase 1 stub).');
  },
  requirePattern(_pattern: RegExp | string, _options?: unknown): never {
    throw new Error('rule.requirePattern is not yet implemented (phase 1 stub).');
  },
  custom(_definition: unknown): never {
    throw new Error('rule.custom is not yet implemented (phase 1 stub).');
  },
} as const;
