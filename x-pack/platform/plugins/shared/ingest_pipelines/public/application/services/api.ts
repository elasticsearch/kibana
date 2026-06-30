/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpSetup, ResponseErrorBody } from '@kbn/core/public';
import type { PipelineTreeNode } from '@kbn/ingest-pipelines-shared';

import type { FieldCopyAction, GeoipDatabase, Pipeline } from '../../../common/types';
import { API_BASE_PATH } from '../../../common/constants';
import type {
  UseRequestConfig,
  SendRequestConfig,
  SendRequestResponse,
  Error as _Error,
} from '../../shared_imports';
import { sendRequest as _sendRequest, useRequest as _useRequest } from '../../shared_imports';
import type { UiMetricService } from './ui_metric';
import {
  UIM_PIPELINE_CREATE,
  UIM_PIPELINE_UPDATE,
  UIM_PIPELINE_DELETE,
  UIM_PIPELINE_DELETE_MANY,
  UIM_PIPELINE_SIMULATE,
} from '../constants';

export class ApiService {
  private client: HttpSetup | undefined;
  private uiMetricService: UiMetricService | undefined;

  private useRequest<R = any, E = _Error>(config: UseRequestConfig) {
    if (!this.client) {
      throw new Error('Api service has not be initialized.');
    }
    return _useRequest<R, E>(this.client, config);
  }

  private sendRequest<D = any, E = Error>(
    config: SendRequestConfig
  ): Promise<SendRequestResponse<D, E>> {
    if (!this.client) {
      throw new Error('Api service has not be initialized.');
    }
    return _sendRequest<D, E>(this.client, config);
  }

  private trackUiMetric(eventName: string) {
    if (!this.uiMetricService) {
      throw new Error('UI metric service has not be initialized.');
    }
    return this.uiMetricService.trackUiMetric(eventName);
  }

  public setup(httpClient: HttpSetup, uiMetricService: UiMetricService): void {
    this.client = httpClient;
    this.uiMetricService = uiMetricService;
  }

  public useLoadPipelines() {
    return this.useRequest<Pipeline[]>({
      path: API_BASE_PATH,
      method: 'get',
    });
  }

  public useLoadPipeline(name: string) {
    return this.useRequest<Pipeline>({
      path: `${API_BASE_PATH}/${encodeURIComponent(name)}`,
      method: 'get',
    });
  }

  public useLoadPipelineTree(name: string) {
    return this.useRequest<{ pipelineStructureTree: PipelineTreeNode }>({
      path: `${API_BASE_PATH}/structure_tree/${encodeURIComponent(name)}`,
      method: 'get',
    });
  }

  public async createPipeline(pipeline: Pipeline) {
    const { deprecated, isManaged, ...body } = pipeline;
    const result = await this.sendRequest({
      path: API_BASE_PATH,
      method: 'post',
      body: JSON.stringify(body),
    });

    this.trackUiMetric(UIM_PIPELINE_CREATE);

    return result;
  }

  public async updatePipeline(pipeline: Pipeline) {
    const { name, deprecated, isManaged, ...body } = pipeline;
    const result = await this.sendRequest({
      path: `${API_BASE_PATH}/${encodeURIComponent(name)}`,
      method: 'put',
      body: JSON.stringify(body),
    });

    this.trackUiMetric(UIM_PIPELINE_UPDATE);

    return result;
  }

  public async deletePipelines(names: string[]) {
    const result = this.sendRequest({
      path: `${API_BASE_PATH}/${names.map((name) => encodeURIComponent(name)).join(',')}`,
      method: 'delete',
    });

    this.trackUiMetric(names.length > 1 ? UIM_PIPELINE_DELETE_MANY : UIM_PIPELINE_DELETE);

    return result;
  }

  public async simulatePipeline(reqBody: {
    documents: object[];
    verbose?: boolean;
    pipeline: Pick<Pipeline, 'processors' | 'on_failure' | 'field_access_pattern'>;
  }) {
    const result = await this.sendRequest({
      path: `${API_BASE_PATH}/simulate`,
      method: 'post',
      body: JSON.stringify(reqBody),
    });

    this.trackUiMetric(UIM_PIPELINE_SIMULATE);

    return result;
  }

  public async loadDocument(index: string, id: string) {
    const result = await this.sendRequest({
      path: `${API_BASE_PATH}/documents/${encodeURIComponent(index)}/${encodeURIComponent(id)}`,
      method: 'get',
    });

    return result;
  }

  public async parseCsv(reqBody: { file: string; copyAction: FieldCopyAction }) {
    const result = await this.sendRequest({
      path: `${API_BASE_PATH}/parse_csv`,
      method: 'post',
      body: JSON.stringify(reqBody),
    });
    return result;
  }

  public useLoadDatabases() {
    return this.useRequest<GeoipDatabase[], ResponseErrorBody>({
      path: `${API_BASE_PATH}/databases`,
      method: 'get',
    });
  }

  public async createDatabase(database: {
    databaseType: string;
    maxmind?: string;
    databaseName: string;
  }) {
    return this.sendRequest({
      path: `${API_BASE_PATH}/databases`,
      method: 'post',
      body: JSON.stringify(database),
    });
  }

  public async deleteDatabase(id: string) {
    return this.sendRequest({
      path: `${API_BASE_PATH}/databases/${id}`,
      method: 'delete',
    });
  }

  public useLoadManageProcessorsPrivileges() {
    return this.useRequest<{ hasAllPrivileges: boolean }>({
      path: `${API_BASE_PATH}/privileges/manage_processors`,
      method: 'get',
    });
  }
}

export const apiService = new ApiService();
