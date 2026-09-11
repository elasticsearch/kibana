/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AlertEpisodeStatus } from './alert_action_schema';
import type { AlertEventSeverity } from './severity';

export interface MatcherContextRule {
  id: string;
  name: string;
  tags: string[];
}

export interface MatcherContext {
  last_event_timestamp: string;
  group_hash: string;
  episode_id: string;
  episode_status: AlertEpisodeStatus;
  severity?: AlertEventSeverity;
  rule?: MatcherContextRule;
  data?: Record<string, unknown>;
}

export interface MatcherContextFieldDescriptor {
  path: string;
  type: 'string' | 'boolean' | 'string[]' | 'object';
  /** Agent/UI-facing description of the matcher context field. */
  description: string;
}

/**
 * Canonical list of KQL matcher context fields. Source of truth for autocomplete
 * and for Agent Builder skill docs (`generateMatcherContextDoc`).
 */
export const MATCHER_CONTEXT_FIELDS: MatcherContextFieldDescriptor[] = [
  { path: 'episode_id', type: 'string', description: 'The episode UUID' },
  {
    path: 'episode_status',
    type: 'string',
    description: 'Episode lifecycle status',
  },
  { path: 'group_hash', type: 'string', description: 'Hash of the grouping fields' },
  {
    path: 'last_event_timestamp',
    type: 'string',
    description: 'Timestamp of the most recent event',
  },
  { path: 'severity', type: 'string', description: 'Episode severity when present' },
  { path: 'rule.id', type: 'string', description: "The rule's saved object ID" },
  { path: 'rule.name', type: 'string', description: "The rule's display name" },
  { path: 'rule.tags', type: 'string[]', description: "The rule's tags array" },
  {
    path: 'data',
    type: 'object',
    description:
      'Rule-specific ES|QL output columns (query as `data.*`, e.g. `data.host.name`, `data.error_count`)',
  },
];
