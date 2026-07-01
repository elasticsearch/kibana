/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';

import type { DataSource, DataSourceWithSecrets } from '../common';

/**
 * Server-side Elasticsearch client for data source management.
 * Pass a scoped cluster client (`asCurrentUser`, `asInternalUser`, etc.) to the request context.
 */

const path = '/_query/data_source';
export class DataSourcesClient {
  constructor(private readonly esClient: ElasticsearchClient) {}

  /**
   * Calls Elasticsearch `GET /_query/datasource`.
   */
  public async getAll(): Promise<DataSource[]> {
    return await this.esClient.transport.request({
      method: 'GET',
      path,
    });
  }

  /**
   * Calls Elasticsearch `GET /_query/datasource/{id}`.
   */
  public async get(id: string): Promise<DataSource> {
    const encoded = encodeURIComponent(id);
    return await this.esClient.transport.request({
      method: 'GET',
      path: `${path}/${encoded}`,
    });
  }

  /**
   * Calls Elasticsearch `PUT /_query/datasource/{id}` (create data source).
   */
  public async put(id: string, body: Omit<DataSourceWithSecrets, 'name'>): Promise<void> {
    const encoded = encodeURIComponent(id);
    return await this.esClient.transport.request({
      method: 'PUT',
      path: `${path}/${encoded}`,
      body,
    });
  }

  /**
   * Calls Elasticsearch `DELETE /_query/datasource/{id}`.
   */
  public async delete(id: string): Promise<void> {
    const encoded = encodeURIComponent(id);
    return await this.esClient.transport.request({
      method: 'DELETE',
      path: `${path}/${encoded}`,
    });
  }
}
