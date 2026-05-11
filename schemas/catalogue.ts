import { z } from 'zod';
import { KebabId } from './_id.js';

/**
 * Catalogue — the registry of observed failure patterns.
 *
 * The catalogue is the long-term substance of the package. Every rule in
 * the constitution corresponds to a documented failure class in the catalogue
 * (via `rule.catalogueEntry`). New catalogue entries graduate to new rules
 * via PRs that include detection logic + fixture tests + citations.
 *
 * Catalogue entries are append-only in spirit. Entries can be marked
 * `deprecated` (pattern no longer occurring in practice) or `retired`
 * (formally removed), but the record of what the catalogue learned is
 * preserved.
 */

/**
 * Status of a catalogue entry. Same lifecycle as exceptions.
 */
export const CatalogueStatus = z.enum(['active', 'deprecated', 'retired']);
export type CatalogueStatus = z.infer<typeof CatalogueStatus>;

/**
 * Valence of a catalogue entry — most entries describe failures (something
 * to detect and block), but a small minority describe positive patterns
 * worth amplifying when observed. The valence informs how rules built
 * against this entry should treat detection:
 *
 *   - `failure`        — default; rule emits CRITICAL/HIGH/MED/LOW findings
 *   - `positive-signal` — rule records the positive observation, doesn't
 *                        contribute to verdict failure. The reviewer side
 *                        of the system surfaces these as reinforcement
 *                        rather than flagging.
 *
 * The schema fields below (`signature`, `whyItHappens`, `countermeasure`)
 * still apply to positive entries — `whyItHappens` documents what
 * enables the pattern, `countermeasure.structural` documents how to
 * preserve / encourage it. The prose conventions flex; the shape stays
 * uniform.
 */
export const CatalogueValence = z.enum(['failure', 'positive-signal']);
export type CatalogueValence = z.infer<typeof CatalogueValence>;

/**
 * Observed instance — a specific real-world occurrence of the failure pattern.
 *
 * Provides empirical credibility: every catalogue entry can be traced back to
 * actual incidents where the pattern was observed. Provenance ranges from
 * public sources (GitHub issues, blog posts, Reddit threads) to private
 * sources (anonymized internal task IDs), depending on what's shareable.
 */
export const ObservedInstance = z.object({
  /**
   * Where the failure was observed. URL preferred; internal task ID acceptable
   * if no public source exists. The catalogue distinguishes via `kind`.
   */
  source: z.string(),

  /** What kind of source this is. */
  kind: z.enum([
    'github-issue',
    'github-pr',
    'github-discussion',
    'reddit-thread',
    'hacker-news',
    'blog-post',
    'linkedin-post',
    'twitter-x',
    'mastodon',
    'paper',
    'internal-incident',
    'other',
  ]),

  /** Short description of how the failure manifested here. */
  summary: z.string().min(1),

  /** When it was observed. ISO date. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),

  /**
   * Optional credit field — who reported / observed / contributed this
   * instance. Could be a handle, real name, or organization. Used to credit
   * contributors in the catalogue's display.
   */
  reporter: z.string().optional(),
});
export type ObservedInstance = z.infer<typeof ObservedInstance>;

/**
 * Catalogue entry — a documented failure class with structural countermeasure.
 *
 * Required shape:
 *   - id: stable identifier (kebab-case, lowercase)
 *   - signature: how to recognize this failure in a diff or codebase
 *   - whyItHappens: the optimization pressure or structural condition that
 *     produces it (helps prevent re-derivation)
 *   - countermeasure: how the package prevents or detects it
 *     (typically a rule ID; structural changes can also be cited)
 *   - observedInstances: at least one real-world occurrence (provenance)
 */
export const CatalogueEntry = z.object({
  id: KebabId,

  /**
   * Short, scannable description of the failure pattern's signature.
   * Should answer "how would I recognize this in a diff?"
   */
  signature: z.string().min(1),

  /**
   * What optimization pressure or structural condition produces this failure.
   * Should answer "why does this happen?" so readers understand it isn't
   * malice or carelessness — it's the predictable response to optimization
   * pressure against a particular kind of constraint.
   */
  whyItHappens: z.string().min(1),

  /**
   * The structural countermeasure. Typically references one or more rule IDs
   * (e.g., 'no-disabled-tests-without-exception') plus any structural
   * recommendations beyond rules (e.g., "test-count baseline non-decreasing").
   */
  countermeasure: z.object({
    /** Rule IDs that detect this failure. */
    rules: z.array(z.string()),
    /** Free-form additional structural recommendations. */
    structural: z.string().optional(),
  }),

  /**
   * One or more observed instances. At least one required to make the entry
   * empirical rather than speculative.
   */
  observedInstances: z.array(ObservedInstance).min(1),

  /** When this entry was added to the catalogue. */
  addedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),

  status: CatalogueStatus.default('active'),

  /**
   * Whether this entry describes a failure to detect (default) or a
   * positive pattern worth amplifying. Almost all catalogue entries are
   * `failure`; a small minority are `positive-signal`.
   */
  valence: CatalogueValence.default('failure'),

  /** Optional retirement note when status is 'retired'. */
  retiredNote: z.string().optional(),

  /**
   * Optional cross-references to related catalogue entries. Helps readers
   * find adjacent patterns; doesn't change detection logic.
   */
  relatedEntries: z.array(z.string()).optional(),

  /**
   * Optional related principle ID. Catalogue entries often operationalize
   * a principle from the constitution's principle layer.
   */
  relatedPrinciple: z.string().optional(),
});
export type CatalogueEntry = z.infer<typeof CatalogueEntry>;

/**
 * The catalogue itself — a map of ID → CatalogueEntry.
 */
export const Catalogue = z.record(z.string(), CatalogueEntry);
export type Catalogue = z.infer<typeof Catalogue>;
