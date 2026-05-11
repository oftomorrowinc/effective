import { z } from 'zod';

const SEGMENT = /^[a-z][a-z0-9-]*$/;

function isKebabId(value: string): boolean {
  if (value.length === 0) return false;
  const segments = value.split('.');
  for (const segment of segments) {
    if (!SEGMENT.test(segment)) return false;
  }
  return true;
}

export const KebabId = z.string().refine(isKebabId, {
  message: 'IDs are lowercase, kebab-case, optionally dot-namespaced.',
});
