/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Kibana alerting hard-limits active alerts to ~10k per connector; 1k keeps
// executor overhead low while covering typical cardinality bursts.
export const MAX_ALERTS_PER_EXECUTION = 1_000;
// Aligned with the default rule evaluation interval (1 min) with a 2x overlap
// to avoid missing events that arrive slightly out of order.
export const MATCH_LOOKBACK_MINUTES = 2;
// Upper bound on accumulated dedup IDs to prevent unbounded state growth.
// A doc spans at most MATCH_LOOKBACK_MINUTES windows (1-min interval), +1 for
// scheduling jitter / TM backpressure. Even if an evicted ID reappears,
// alertWithPersistence uses a deterministic _id so ES rejects the duplicate.
export const MAX_DEDUP_IDS = MAX_ALERTS_PER_EXECUTION * (MATCH_LOOKBACK_MINUTES + 1);
