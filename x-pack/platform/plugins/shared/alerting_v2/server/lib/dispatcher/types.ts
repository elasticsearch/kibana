/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AlertEventSeverity } from '../../resources/datastreams/alert_events';

export type RuleId = string;
export type ActionPolicyId = string;
export type ActionGroupId = string;
export type AlertEpisodeData = Record<string, unknown>;

export interface ActionPolicyDestination {
  type: 'workflow';
  id: string;
}

export interface AlertEpisode {
  last_event_timestamp: string;
  rule_id: RuleId;
  group_hash: string;
  episode_id: string;
  episode_status: 'inactive' | 'pending' | 'active' | 'recovering';
  severity?: AlertEventSeverity;
  data?: AlertEpisodeData;
}

export interface AlertEpisodeSuppression {
  rule_id: RuleId;
  group_hash: string;
  episode_id: string | null;
  should_suppress: boolean;
  last_ack_action?: string | null;
  last_deactivate_action?: string | null;
  last_snooze_action?: string | null;
}

export interface DispatcherExecutionParams {
  previousStartedAt?: Date;
  abortController?: AbortController;
}

export interface DispatcherExecutionResult {
  startedAt: Date;
}

export interface DispatcherTaskState {
  previousStartedAt?: string;
}

export interface Rule {
  id: RuleId;
  spaceId: string;
  name: string;
  tags: string[];
}

export interface ActionPolicy {
  id: ActionPolicyId;
  spaceId: string;
  name: string;
  enabled: boolean;
  /** KQL expression evaluated against the alert episode context.
   *  An empty matcher matches all episodes (catch-all). */
  matcher?: string; // e.g. 'data.severity == "critical" AND data.env != "dev"'
  /** data.* fields used to group episodes into a single action group */
  groupBy: string[];
  /** User-defined tags for organizing and filtering policies */
  tags: string[];
  /** How episodes are grouped into action group payloads */
  groupingMode?: 'per_episode' | 'all' | 'per_field';
  /** Throttle configuration controlling action frequency */
  throttle?: {
    strategy?: 'on_status_change' | 'per_status_interval' | 'time_interval' | 'every_time';
    interval?: string | null; // e.g. '1h', '30m', '5m'; null for intervalless strategies
  };
  snoozedUntil?: string | null;
  /** Target destinations to dispatch matched episodes to */
  destinations: ActionPolicyDestination[];
  /** Decrypted base64-encoded API key (id:key) for authenticated workflow dispatch */
  apiKey?: string;
}

export interface MatchedPair {
  episode: AlertEpisode;
  policy: ActionPolicy;
}

export interface ActionGroup {
  id: ActionGroupId;
  spaceId: string;
  policyId: ActionPolicyId;
  destinations: ActionPolicyDestination[];
  groupKey: Record<string, unknown>;
  episodes: AlertEpisode[];
  rules: Record<RuleId, ActionPolicyWorkflowPayloadRule>;
}

export type ActionPolicyWorkflowPayloadRule = Pick<Rule, 'name'>;

export interface ActionPolicyWorkflowPayload {
  id: ActionGroupId;
  policyId: ActionPolicyId;
  groupKey: Record<string, unknown>;
  episodes: AlertEpisode[];
  rules: Record<RuleId, ActionPolicyWorkflowPayloadRule>;
}

export interface LastNotifiedRecord {
  action_group_id: ActionGroupId;
  last_notified: string;
  episode_status?: string;
}

export interface LastNotifiedInfo {
  lastNotified: Date;
  episodeStatus?: string;
}

export interface DispatcherPipelineInput {
  readonly startedAt: Date;
  readonly previousStartedAt: Date;
  readonly executionUuid: string;
}

export interface DispatcherPipelineState {
  readonly input: DispatcherPipelineInput;
  readonly episodes?: AlertEpisode[];
  readonly suppressions?: AlertEpisodeSuppression[];
  readonly dispatchable?: AlertEpisode[];
  readonly suppressed?: Array<AlertEpisode & { reason: string }>;
  readonly rules?: Map<RuleId, Rule>;
  readonly policies?: Map<ActionPolicyId, ActionPolicy>;
  readonly matched?: MatchedPair[];
  readonly groups?: ActionGroup[];
  readonly dispatch?: ActionGroup[];
  readonly throttled?: ActionGroup[];
  readonly dispatchedExecutions?: Map<ActionGroupId, string[]>;
}

export type DispatcherHaltReason = 'no_episodes' | 'no_actions' | 'engine_disabled';

export type DispatcherStepOutput =
  | { type: 'continue'; data?: Partial<Omit<DispatcherPipelineState, 'input'>> }
  | { type: 'halt'; reason: DispatcherHaltReason };

export interface DispatcherStep {
  readonly name: string;
  execute(state: Readonly<DispatcherPipelineState>): Promise<DispatcherStepOutput>;
}
