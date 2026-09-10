/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { QueryDslQueryContainer, SortOrder } from '@elastic/elasticsearch/lib/api/types';
import type { Logger } from '@kbn/core/server';
import type { DataStreamsStart } from '@kbn/core-data-streams-server';
import type { ClientSearchRequest } from '@kbn/data-streams';
import { initializeDataStreamClient, type WorkflowLogEvent } from './data_stream';
import { retryTransientEsErrors } from '../../lib/retry_transient_es_errors';

export interface LogSearchResult {
  total: number;
  logs: WorkflowLogEvent[];
}

export interface SearchLogsParams {
  // pagination
  sortField?: string;
  sortOrder?: SortOrder;
  limit?: number;
  offset?: number;

  // space
  spaceId?: string;

  // fields
  level?: string;
  executionId?: string;
  stepExecutionId?: string;
  stepId?: string;
}

export class LogsRepository {
  constructor(
    private readonly coreDataStreams: DataStreamsStart,
    private readonly logger: Logger
  ) {}

  public async createLogs(
    logEvents: WorkflowLogEvent[],
    options: { throwOnFailure?: boolean } = {}
  ): Promise<void> {
    const dataStreamClient = await initializeDataStreamClient(this.coreDataStreams);

    const result = await retryTransientEsErrors(
      () => dataStreamClient.create({ documents: logEvents }),
      {
        logger: this.logger,
      }
    );
    if (options.throwOnFailure && result.errors) {
      const failed = result.items.flatMap((item) =>
        item.create?.error ? [item.create.error] : []
      );
      throw new Error(
        `Failed to index ${failed.length} workflow events: ${failed
          .map((error) => error.reason ?? error.type)
          .join('; ')}`
      );
    }
  }

  public async getRecentLogs(limit: number = 100): Promise<LogSearchResult> {
    return this.searchDataStream({
      query: { match_all: {} },
      size: limit,
    });
  }

  public async searchLogs(params: SearchLogsParams): Promise<LogSearchResult> {
    const { limit = 100, offset = 0, sortField = '@timestamp', sortOrder = 'desc' } = params;

    // Map API field names to Elasticsearch field names
    const fieldMapping: Record<string, string> = {
      timestamp: '@timestamp',
      '@timestamp': '@timestamp',
    };
    const mappedSortField = fieldMapping[sortField] || sortField;

    const mustQueries: QueryDslQueryContainer[] = [];

    if (typeof params.executionId === 'string') {
      mustQueries.push({
        term: { 'workflow.execution_id': params.executionId },
      });
    }

    if (typeof params.stepExecutionId === 'string') {
      mustQueries.push({
        term: { 'workflow.step_execution_id': params.stepExecutionId },
      });
    }

    if (typeof params.stepId === 'string') {
      mustQueries.push({
        term: { 'workflow.step_id': params.stepId },
      });
    }

    if (typeof params.level === 'string') {
      mustQueries.push({
        term: { level: params.level },
      });
    }

    if (typeof params.spaceId === 'string') {
      mustQueries.push({
        term: { spaceId: params.spaceId },
      });
    }

    return this.searchDataStream({
      size: limit,
      from: offset,
      query: {
        bool: {
          must: mustQueries,
        },
      },
      sort: [{ [mappedSortField]: sortOrder }],
    });
  }

  private async searchDataStream(query: ClientSearchRequest): Promise<LogSearchResult> {
    const dataStreamClient = await initializeDataStreamClient(this.coreDataStreams);

    const response = await retryTransientEsErrors(
      () =>
        dataStreamClient.search({
          sort: [{ '@timestamp': { order: 'desc' } }],
          size: 1000,
          ...query,
        }),
      { logger: this.logger }
    );

    return {
      total:
        typeof response.hits.total === 'number'
          ? response.hits.total
          : response.hits.total?.value || 0,
      logs: response.hits.hits.flatMap((hit) => (hit._source ? [hit._source] : [])),
    };
  }
}
