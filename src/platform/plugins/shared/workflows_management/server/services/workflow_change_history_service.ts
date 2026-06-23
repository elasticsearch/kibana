/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { GetChangeHistoryOptions } from '@kbn/change-history';
import { ChangeHistoryClient } from '@kbn/change-history';
import type { KibanaRequest } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';

import {
  WORKFLOW_CHANGE_HISTORY_DATASET,
  WORKFLOW_CHANGE_HISTORY_MODULE,
  WORKFLOW_CHANGE_HISTORY_OBJECT_TYPE,
  WORKFLOW_CHANGE_HISTORY_SYSTEM_USER,
} from './workflow_change_history_constants';
import type {
  IScopedWorkflowChangeHistoryService,
  IWorkflowChangeHistoryService,
  WorkflowChangeHistoryServiceInitializeParams,
} from './workflow_change_history_types';

export class WorkflowChangeHistoryService implements IWorkflowChangeHistoryService {
  private readonly client: ChangeHistoryClient;
  private readonly logger: Logger;
  private authService?: WorkflowChangeHistoryServiceInitializeParams['authService'];

  constructor(logger: Logger, kibanaVersion: string) {
    this.logger = logger.get('change_history');
    this.client = new ChangeHistoryClient({
      module: WORKFLOW_CHANGE_HISTORY_MODULE,
      dataset: WORKFLOW_CHANGE_HISTORY_DATASET,
      logger: this.logger,
      kibanaVersion,
    });
  }

  isInitialized(): boolean {
    return this.client.isInitialized();
  }

  initialize({
    elasticsearchClient,
    authService,
  }: WorkflowChangeHistoryServiceInitializeParams): Promise<void> {
    this.logger.debug('Initializing workflow change history');
    this.authService = authService;

    return this.client.initialize(elasticsearchClient).catch((cause) => {
      const error = new Error(
        `Unable to initialize workflow change history for [${WORKFLOW_CHANGE_HISTORY_MODULE}, ${WORKFLOW_CHANGE_HISTORY_DATASET}]`,
        { cause }
      );
      this.logger.error(error);
    });
  }

  asScoped(request: KibanaRequest): IScopedWorkflowChangeHistoryService {
    if (!this.authService) {
      throw new Error(
        'WorkflowChangeHistoryService.asScoped called before initialize(); authentication service is not available.'
      );
    }

    const user = this.authService.getCurrentUser(request);
    return this.createScopedClient({
      username: user?.username ?? '',
      userProfileId: user?.profile_uid,
    });
  }

  asSystemUser(): IScopedWorkflowChangeHistoryService {
    return this.createScopedClient({ username: WORKFLOW_CHANGE_HISTORY_SYSTEM_USER });
  }

  private createScopedClient({
    username,
    userProfileId,
  }: {
    username: string;
    userProfileId?: string;
  }): IScopedWorkflowChangeHistoryService {
    return {
      log: async (change, opts) =>
        this.client.log(change, {
          ...opts,
          username,
          userProfileId,
        }),
      logBulk: async (changes, opts) =>
        this.client.logBulk(changes, {
          ...opts,
          username,
          userProfileId,
        }),
      getHistory: (spaceId, workflowId, opts) => this.getHistory(spaceId, workflowId, opts),
    };
  }

  getHistory(spaceId: string, workflowId: string, opts?: GetChangeHistoryOptions) {
    return this.client.getHistory(spaceId, WORKFLOW_CHANGE_HISTORY_OBJECT_TYPE, workflowId, opts);
  }
}
