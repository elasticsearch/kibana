/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EntityMaintainerState } from '../../tasks/entity_maintainers/types';

// These extend `EntityMaintainerState` (the framework's JSON-serializable task-state
// type) so the maintainer can hand them to task-manager directly, without casting at
// the persistence boundary.
export interface PerRuleLastRunStats extends EntityMaintainerState {
  resolutionsCreated: number;
  skippedAmbiguousBuckets: number;
}

export interface PerRuleState extends EntityMaintainerState {
  lastProcessedTimestamp: string | null;
  lastRun: PerRuleLastRunStats | null;
}

// `rules` is an open map keyed by rule id rather than a fixed set: a rule with no
// entry backfills (null watermark → full scan) on its first run, so new rules can be
// added without a state migration, and watermarks for rules this version doesn't know
// (e.g. written by a newer node during a rolling upgrade) pass through untouched.
export interface AutomatedResolutionState extends EntityMaintainerState {
  rules: Record<string, PerRuleState>;
}

export interface EntityHit {
  entityId: string;
  namespace: string;
}

export interface MatchBucket {
  emailValue: string;
  unresolvedEntities: EntityHit[];
  existingTargetIds: string[];
}
