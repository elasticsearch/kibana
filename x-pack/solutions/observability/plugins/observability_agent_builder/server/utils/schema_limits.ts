/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Upper bounds for free-form string inputs used in attachment and tool schemas.
 *
 * Unbounded `z.string()` validation lets a caller submit arbitrarily large values,
 * which can exhaust memory/CPU (Denial of Service). These limits are safety guards
 * rather than business validation, so they are intentionally generous while still
 * rejecting pathological payloads (CodeQL rule `js/kibana/unbounded-string-in-schema`).
 */

/**
 * Short single-line strings: identifiers (IDs, trace/transaction ids), entity and field
 * names, environments, ML job ids/groups, Elasticsearch date math (e.g. "now-24h"),
 * attachment labels, and short free-text intents. Matches the Elasticsearch keyword
 * `ignore_above` default of 1024.
 */
export const MAX_SHORT_STRING_LENGTH = 1024;

/** Index names and index patterns, which may be comma-separated lists of patterns. */
export const MAX_INDEX_PATTERN_LENGTH = 4096;

/** KQL filter expressions, which may chain several clauses. */
export const MAX_KQL_FILTER_LENGTH = 4096;

/** Large free-text payloads such as AI-generated summaries and prefetched context blobs. */
export const MAX_TEXT_LENGTH = 500_000;
