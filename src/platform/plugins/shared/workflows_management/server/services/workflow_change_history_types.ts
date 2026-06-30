/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  ChangeHistoryDocument,
  GetChangeHistoryOptions,
  GetHistoryResult,
  LogChangeHistoryOptions,
  ObjectChange,
} from '@kbn/change-history';
import type {
  CoreAuthenticationService,
  ElasticsearchClient,
  KibanaRequest,
} from '@kbn/core/server';

export interface WorkflowChangeHistoryServiceInitializeParams {
  elasticsearchClient: ElasticsearchClient;
  authService: CoreAuthenticationService;
}

export interface IWorkflowChangeHistoryService {
  isInitialized(): boolean;
  initialize(params: WorkflowChangeHistoryServiceInitializeParams): Promise<void>;
  asScoped(request: KibanaRequest): IScopedWorkflowChangeHistoryService;
  asSystemUser(): IScopedWorkflowChangeHistoryService;
  getHistory(
    spaceId: string,
    workflowId: string,
    opts?: GetChangeHistoryOptions
  ): Promise<GetHistoryResult>;
}

/**
 * Per-call options for a request-scoped change history client. The wrapper
 * resolves `username` and `userProfileId` from the bound request.
 */
export type ScopedLogChangeHistoryOptions = Omit<
  LogChangeHistoryOptions,
  'username' | 'userProfileId' | 'data'
> & {
  data?: {
    event?: Partial<NonNullable<ChangeHistoryDocument['event']>>;
    tags?: ChangeHistoryDocument['tags'];
    metadata?: ChangeHistoryDocument['metadata'];
  };
};

export interface IScopedWorkflowChangeHistoryService {
  log(change: ObjectChange, opts: ScopedLogChangeHistoryOptions): Promise<void>;
  logBulk(changes: ObjectChange[], opts: ScopedLogChangeHistoryOptions): Promise<void>;
  getHistory(
    spaceId: string,
    workflowId: string,
    opts?: GetChangeHistoryOptions
  ): Promise<GetHistoryResult>;
}
