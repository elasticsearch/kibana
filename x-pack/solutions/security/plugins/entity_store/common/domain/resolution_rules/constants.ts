/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Identifiers for the built-in (out-of-the-box) entity resolution rules.
 *
 * Each value is a stable key used in three places: the per-rule watermark state,
 * the enable/disable override saved object, and the `{id}` path parameter of the
 * resolution rules API.
 *
 * Adding a rule is safe and needs no state migration: there is simply no entry yet
 * for the new id, and the maintainer treats a missing entry as "never run", so the
 * rule scans the whole entity store (null watermark) on its first cycle and records
 * its state from then on.
 *
 * Renaming an existing value is possible but is a breaking change, not a free edit:
 * the rule's saved watermark and any disable override stay under the old id (so the
 * rule would re-scan from scratch and a disabled rule would silently re-enable), and
 * the old API path stops resolving. If you must rename one, migrate that persisted
 * state to the new id — so it's best to pick a good id up front.
 */
export const RESOLUTION_RULE_IDS = {
  EMAIL_EXACT_MATCH: 'email_exact_match',
} as const;

export type ResolutionRuleId = (typeof RESOLUTION_RULE_IDS)[keyof typeof RESOLUTION_RULE_IDS];
