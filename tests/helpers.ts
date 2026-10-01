/*
  Shared test helpers.

  Kept separate so the generator tests and the feature tests can both reach for
  the same view of the specification.
*/

import { generatorsFor } from "@/lib/generators/registry";
import { SUBJECT_ORDER, getChapters } from "@/lib/specs";

/**
 * Generator keys available for a subject, for assertions that care about which
 * templates exist rather than what they produce.
 */
export function getGeneratorsForSpec(subject: string): string[] {
  return SUBJECT_ORDER.filter((s) => s === subject)
    .flatMap((s) => getChapters(s))
    .flatMap((c) => generatorsFor(c).map((g) => g.key));
}
