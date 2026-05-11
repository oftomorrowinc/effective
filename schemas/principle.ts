import { z } from 'zod';
import { KebabId } from './_id.js';

/**
 * Principle — a load-bearing belief that motivates rules.
 *
 * Principles are the philosophical layer above the rule layer. Each rule
 * typically operationalizes one or more principles. The principles
 * themselves aren't directly executable; they explain WHY the rules are
 * shaped the way they are.
 *
 * Workers reading the augmented prompt see principles as context for the
 * rules they're being held to. Contributors reading the catalogue see
 * principles as the framework within which new failure patterns get
 * evaluated and new rules get justified.
 *
 * Format follows the structure that surfaced in real-world constitutional
 * work: context (what motivates the principle), decision (what we're going
 * to do), consequences (what follows from the decision).
 */
export const PrincipleStatus = z.enum(['active', 'deprecated', 'retired']);
export type PrincipleStatus = z.infer<typeof PrincipleStatus>;

export const Principle = z.object({
  id: KebabId,

  /** Short human-readable name. Used in titles and references. */
  name: z.string().min(1),

  /**
   * What motivates this principle. Should explain the observable pressure
   * or failure mode the principle exists to address. Concrete is better
   * than abstract — a principle without a concrete motivation often turns
   * out to be a rule, not a principle.
   */
  context: z.string().min(1),

  /**
   * The decision the principle commits us to. The directive itself, stated
   * as something we'll do (or won't do) rather than something we believe.
   */
  decision: z.string().min(1),

  /**
   * What follows from the decision — operationally, structurally,
   * culturally. Helps readers see whether the principle has been fully
   * absorbed by the rest of the system, or whether there are still gaps.
   */
  consequences: z.string().min(1),

  /** Catalogue entries that this principle motivates. */
  relatedCatalogueEntries: z.array(z.string()).optional(),

  /** Other principles this one builds on or relates to. */
  relatedPrinciples: z.array(z.string()).optional(),

  status: PrincipleStatus.default('active'),

  retiredNote: z.string().optional(),
});
export type Principle = z.infer<typeof Principle>;

/**
 * The principles index — a map of ID → Principle.
 */
export const Principles = z.record(z.string(), Principle);
export type Principles = z.infer<typeof Principles>;
