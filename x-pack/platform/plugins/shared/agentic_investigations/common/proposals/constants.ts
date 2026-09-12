/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { AGENTIC_INVESTIGATIONS_INTERNAL_URL } from '../constants';

/**
 * The `.kibana-` prefix is deliberate and permanent: `.kibana*` is already
 * granted to the `kibana_system` role, so this index needs no Elasticsearch-side
 * system index registration. `anonymization` ships
 * `.kibana-anonymization-profiles` on the same reasoning. Each entity this
 * plugin owns gets its own index rather than one discriminated by type.
 */
export const PROPOSALS_INDEX_NAME = '.kibana-investigation-proposals' as const;

export const PROPOSALS_INTERNAL_URL = `${AGENTIC_INVESTIGATIONS_INTERNAL_URL}/proposals` as const;
export const PROPOSAL_BY_ID_URL = `${PROPOSALS_INTERNAL_URL}/{id}` as const;
export const PROPOSAL_APPROVE_URL = `${PROPOSALS_INTERNAL_URL}/{id}/approve` as const;
export const PROPOSAL_DISMISS_URL = `${PROPOSALS_INTERNAL_URL}/{id}/dismiss` as const;
export const PROPOSAL_CHARTS_SUMMARY_URL = `${PROPOSALS_INTERNAL_URL}/charts-summary` as const;

/**
 * Stand-in category for a proposal that carries no action and therefore has no
 * category of its own. Substituted on the read path rather than at write time:
 * the category vocabulary belongs to the solution that authored the action, so
 * the stored document keeps `category` absent. Without this, action-less
 * proposals fall out of every `BY category` aggregation and are invisible to
 * both the charts and the header count that reads from them.
 */
export const PROPOSAL_UNCATEGORIZED = 'uncategorized' as const;

/**
 * Ceiling on `windowHours * 60 / bucketMinutes`.
 *
 * Elasticsearch caps any ES|QL result set at `esql.query.result_truncation_max_size`
 * (10 000 by default) regardless of the LIMIT the query asks for — a user-supplied
 * limit is capped to the max rather than honoured. The per-bucket queries emit one
 * row per (bucket, category) and sort by bucket ascending, so a truncated result
 * loses the *most recent* buckets silently. Capping bucket count here keeps the
 * row count under that ceiling for any realistic number of categories.
 */
export const MAX_CHARTS_SUMMARY_BUCKETS = 1000;

/**
 * UI capabilities. Capabilities are namespaced by feature id rather than by
 * sub-feature, so each entity scopes its own names.
 */
export const PROPOSALS_UI_CAPABILITY_SHOW = 'showProposals' as const;
export const PROPOSALS_UI_CAPABILITY_DECIDE = 'decideProposals' as const;

/** Channel recorded on the workflow resume, for audit. */
export const PROPOSALS_RESUME_CHANNEL = 'investigation_proposals_api' as const;
