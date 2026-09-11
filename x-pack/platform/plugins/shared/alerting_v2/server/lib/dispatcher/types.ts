/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AlertEventSeverity } from '@kbn/alerting-v2-schemas';
import type { AlertEpisodeStatus } from '../../resources/datastreams/alert_events';
import type { LoggerServiceContract } from '../services/logger_service/logger_service';
import type {
  DispatchOutcome,
  DispatchPlan,
  EpisodeScan,
  EpisodeTriage,
  PolicyCatalog,
  RuleCatalog,
  SuppressionIndex,
} from './state';
import type { DispatchFailureReason } from './steps/constants';

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
  rule_id: RuleId | null;
  source: string;
  space_id: string;
  group_hash: string;
  episode_id: string;
  episode_status: AlertEpisodeStatus;
  severity?: AlertEventSeverity;
  data?: AlertEpisodeData;
}

export interface AlertEpisodeSuppression {
  rule_id: RuleId | null;
  source: string | null;
  space_id: string | null;
  group_hash: string;
  episode_id: string | null;
  should_suppress: boolean;
  last_ack_action?: string | null;
  last_deactivate_action?: string | null;
  last_snooze_action?: string | null;
}

export interface DispatcherExecutionParams {
  eventWatermark?: Date;
  /** Current count of consecutive ticks in which the watermark did not advance. */
  stuckTicks?: number;
  signal?: AbortSignal;
  taskId: string;
}

export interface DispatcherExecutionResult {
  startedAt: Date;
  nextWatermark: Date;
  /** Updated stuck-tick counter (reset to 0 on advance, incremented otherwise). */
  nextStuckTicks: number;
  pipelineResult: DispatcherPipelineResult;
}

export interface DispatcherTaskState {
  eventWatermark?: string;
  stuckTicks?: number;
}

export interface DispatcherPipelineResult {
  readonly completed: boolean;
  readonly haltReason?: DispatcherHaltReason;
  readonly finalState: DispatcherPipelineState;
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
  /** How episodes are grouped into action group payloads. Defaulted at hydration (DEFAULT_GROUPING_MODE). */
  groupingMode: 'per_episode' | 'all' | 'per_field';
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

/**
 * A single failed attempt to dispatch one action group to one workflow
 * destination. Carries everything the execution-history step needs to emit a
 * `dispatch_failed` event: the parent policy, the failing group + workflow, the
 * affected episodes, and a machine-readable + human-readable cause.
 */
export interface DispatchFailure {
  policyId: ActionPolicyId;
  spaceId: string;
  actionGroupId: ActionGroupId;
  workflowId: string;
  episodes: AlertEpisode[];
  reason: DispatchFailureReason;
  message: string;
}

export interface DispatcherPipelineInput {
  readonly startedAt: Date;
  readonly eventWatermark: Date;
  /** Lower bound of the event-row scan window. Equal to `eventWatermark − OVERLAP_WINDOW_MINUTES`. Action rows are not window-capped. */
  readonly windowStart: Date;
  /** Upper bound of the event-row scan window. Equal to `min(windowStart + MAX_WINDOW_MINUTES, startedAt − SETTLE_BUFFER_SECONDS)`. Action rows are not window-capped. */
  readonly windowEnd: Date;
  readonly executionUuid: string;
  readonly signal: AbortSignal;
}

export interface DispatcherPipelineState {
  readonly input: DispatcherPipelineInput;
  /** Result of the windowed candidate scan (episodes + truncation flag). */
  readonly scan?: EpisodeScan;
  /** Count of episodes that received an `.alert-actions` record this tick. */
  readonly recordedEpisodes?: number;
  /** Suppression facts from `.alert-actions`, indexed for per-episode lookup. */
  readonly suppressions?: SuppressionIndex;
  /** Dispatchable vs suppressed verdict on the scanned episodes. */
  readonly triage?: EpisodeTriage;
  readonly rules?: RuleCatalog;
  readonly policies?: PolicyCatalog;
  readonly matched?: MatchedPair[];
  readonly groups?: ActionGroup[];
  /** Delivery decision: groups eligible to dispatch now vs groups held back. */
  readonly plan?: DispatchPlan;
  /** Dispatch results: workflow executions per group and failed attempts. */
  readonly outcome?: DispatchOutcome;
}

export type DispatcherHaltReason = 'no_episodes' | 'no_actions' | 'aborted';

export type DispatcherStepOutput =
  | { type: 'continue'; data?: Partial<Omit<DispatcherPipelineState, 'input'>> }
  | { type: 'halt'; reason: DispatcherHaltReason };

export interface DispatcherStep {
  readonly name: string;
  execute(
    state: Readonly<DispatcherPipelineState>,
    logger: LoggerServiceContract
  ): Promise<DispatcherStepOutput>;
}
