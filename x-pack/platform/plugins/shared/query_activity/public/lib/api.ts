/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpSetup } from '@kbn/core/public';
import { API_BASE_PATH } from '../../common/constants';
import type { RunningQuery, RunningQuerySummary } from '../../common/types';
import type { SendRequestConfig, SendRequestResponse, UseRequestConfig } from '../shared_imports';
import { sendRequest as _sendRequest, useRequest as _useRequest } from '../shared_imports';

export interface QueryDetailsError {
  attributes?: {
    code?: string;
  };
  message?: string;
}

export class QueryActivityApiService {
  constructor(private readonly client: HttpSetup) {}

  private useRequest<R = any, E = any>(config: UseRequestConfig) {
    return _useRequest<R, E>(this.client, config);
  }

  private sendRequest<D = any, E = any>(
    config: SendRequestConfig
  ): Promise<SendRequestResponse<D, E>> {
    return _sendRequest<D, E>(this.client, config);
  }

  public useLoadQueryActivity() {
    return this.useRequest<{ queries: RunningQuerySummary[] }>({
      path: `${API_BASE_PATH}/search`,
      method: 'get',
    });
  }

  public useLoadPrivileges() {
    return this.useRequest<{
      canCancelTasks: boolean;
      canViewTasks: boolean;
      missingClusterPrivileges: string[];
    }>({
      path: `${API_BASE_PATH}/privileges`,
      method: 'get',
    });
  }

  public cancelTask(taskId: string) {
    return this.sendRequest({
      path: `${API_BASE_PATH}/cancel`,
      method: 'post',
      body: { taskId },
    });
  }

  public fetchQueryActivity() {
    return this.sendRequest<{ queries: RunningQuerySummary[] }>({
      path: `${API_BASE_PATH}/search`,
      method: 'get',
    });
  }

  public fetchQueryDetails(taskId: string) {
    return this.sendRequest<{ query: RunningQuery }, QueryDetailsError>({
      path: `${API_BASE_PATH}/queries/${encodeURIComponent(taskId)}`,
      method: 'get',
    });
  }
}
