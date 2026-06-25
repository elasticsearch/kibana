/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  CoreAuthenticationService,
  ElasticsearchClient,
  KibanaRequest,
} from '@kbn/core/server';
import type { RuleTypeSolution } from '@kbn/alerting-types';
import type {
  ObjectChange,
  GetHistoryResult,
  LogChangeHistoryOptions,
  GetChangeHistoryOptions,
} from '@kbn/change-history';
import type { RuleDomain } from '../../../application/rule/types';

/**
 * The rule state captured at each change event. Contains only user-controlled configuration
 * fields from {@link RuleDomain} — runtime fields (execution status, scheduling state, snooze,
 * monitoring) are excluded because they change autonomously and do not represent user intent.
 * `createdAt`/`updatedAt` are re-typed as `string` for serialization stability.
 */
export type RuleChangeHistorySnapshot = Omit<
  RuleDomain,
  | 'monitoring'
  | 'executionStatus'
  | 'lastRun'
  | 'nextRun'
  | 'running'
  | 'lastEnabledAt'
  | 'activeSnoozes'
  | 'isSnoozedUntil'
  | 'viewInAppRelativeUrl'
  | 'scheduledTaskId'
  | 'mutedInstanceIds'
  | 'createdAt'
  | 'updatedAt'
> & { createdAt: string; updatedAt: string };

export interface RuleChange extends Omit<ObjectChange, 'snapshot'> {
  module: RuleTypeSolution;
  /** Post-change rule state; persisted as `object.snapshot` by @kbn/change-history. */
  snapshot: RuleChangeHistorySnapshot;
}

export interface ChangeTrackingServiceInitializeParams {
  elasticsearchClient: ElasticsearchClient;
  authService: CoreAuthenticationService;
}

export interface IChangeTrackingService {
  asScoped(request: KibanaRequest): IScopedChangeTrackingService;
}

export interface IScopedChangeTrackingService {
  log(change: RuleChange, opts: ScopedLogChangeHistoryOptions): Promise<void>;
  logBulk(changes: RuleChange[], opts: ScopedLogChangeHistoryOptions): Promise<void>;
  getHistory(
    module: RuleTypeSolution,
    spaceId: string,
    ruleId: string,
    opts: GetChangeHistoryOptions
  ): Promise<GetHistoryResult>;
}

/**
 * Per-call options for a request-scoped change tracking client. The wrapper
 * resolves `username`, `userProfileId` from the bound request,
 * so callers must not provide them.
 */
export type ScopedLogChangeHistoryOptions = Omit<
  LogChangeHistoryOptions,
  'username' | 'userProfileId'
>;
