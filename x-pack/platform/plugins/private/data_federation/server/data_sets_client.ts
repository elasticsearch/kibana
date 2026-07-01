/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';

import type { DataSetWithName, Dataset } from '../common';

const path = '/_query/dataset';
/**
 * Server-side Elasticsearch client for data set management.
 * Pass a scoped cluster client to the request context.
 */
export class DataSetsClient {
  constructor(private readonly esClient: ElasticsearchClient) {}

  /**
   * Calls Elasticsearch `GET /_query/data_set`.
   */
  public async getAll(): Promise<DataSetWithName[]> {
    return await this.esClient.transport.request({
      method: 'GET',
      path,
    });
  }

  /**
   * Calls Elasticsearch `GET /_query/data_set/{id}`.
   */
  public async get(id: string): Promise<DataSetWithName> {
    const encoded = encodeURIComponent(id);
    return await this.esClient.transport.request({
      method: 'GET',
      path: `${path}/${encoded}`,
    });
  }

  /**
   * Calls Elasticsearch `PUT /_query/data_set/{id}` (create data set).
   */
  public async put(id: string, body: Dataset): Promise<void> {
    const encoded = encodeURIComponent(id);
    return await this.esClient.transport.request({
      method: 'PUT',
      path: `${path}/${encoded}`,
      body,
    });
  }

  /**
   * Calls Elasticsearch `DELETE /_query/data_set/{id}`.
   */
  public async delete(id: string): Promise<void> {
    const encoded = encodeURIComponent(id);
    return await this.esClient.transport.request({
      method: 'DELETE',
      path: `${path}/${encoded}`,
    });
  }
}
