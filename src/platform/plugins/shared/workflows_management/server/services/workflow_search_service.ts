/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { estypes } from '@elastic/elasticsearch';
import type {
  EsWorkflowExecution,
  WorkflowAggsDto,
  WorkflowDetailDto,
  WorkflowExecutionHistoryModel,
  WorkflowListDto,
  WorkflowStatsDto,
} from '@kbn/workflows';
import { buildWorkflowFilters } from '@kbn/workflows/server';
import type { WorkflowListItemDto, WorkflowSortField } from '@kbn/workflows/types/v1';

import type { WorkflowSearchDeps } from './types';
import { WORKFLOWS_EXECUTIONS_INDEX } from '../../common';
import { isIndexNotFoundError } from '../api/lib/es_error_helpers';
import { paginateWithSearchAfter } from '../api/lib/paginate_with_search_after';
import { transformStorageDocumentToWorkflowDto } from '../api/lib/workflow_dto_transform';
import {
  buildConditionalTermsFilters,
  buildWorkflowTextSearchClause,
} from '../api/lib/workflow_query_filters';
import type { GetWorkflowAggsOptions, GetWorkflowsParams } from '../api/workflows_management_api';
import type { WorkflowProperties } from '../storage/workflow_storage';
import { workflowIndexName } from '../storage/workflow_storage';

const ES_SORT_FIELDS: Record<WorkflowSortField, string> = {
  name: 'name.keyword',
  enabled: 'enabled',
};

interface WorkflowAggBucket {
  key: string | number | boolean;
  key_as_string?: string;
  doc_count: number;
}

type WorkflowAggsResponse = Record<
  string,
  estypes.AggregationsMultiBucketAggregateBase<WorkflowAggBucket>
>;

export class WorkflowSearchService {
  constructor(private readonly deps: WorkflowSearchDeps) {}

  async getWorkflowsSubscribedToTrigger(
    triggerId: string,
    spaceId: string
  ): Promise<WorkflowDetailDto[]> {
    const { esClient, logger } = this.deps;

    const pageSize = 1000;
    const MAX_PAGES = 50;
    const keepAlive = '1m';
    const indexPattern = `${workflowIndexName}-*`;
    const sort: estypes.Sort = [{ updated_at: { order: 'desc' } }, '_shard_doc'];
    const { must, must_not } = buildWorkflowFilters({
      space: { id: spaceId, includeGlobal: true },
      deleted: 'not_deleted',
    });
    must.push({ term: { enabled: true } }, { term: { triggerTypes: triggerId } });
    const query = { bool: { must, must_not } };
    const _source = [
      'name',
      'description',
      'enabled',
      'yaml',
      'definition',
      'createdBy',
      'lastUpdatedBy',
      'valid',
      'created_at',
      'updated_at',
    ];

    const pitResponse = await esClient.openPointInTime({
      index: indexPattern,
      keep_alive: keepAlive,
      ignore_unavailable: true,
    });
    const pitId = pitResponse.id;

    try {
      const allHits: Array<{ _id: string; _source: WorkflowProperties }> = [];

      await paginateWithSearchAfter<WorkflowProperties>(
        {
          search: (searchAfter) =>
            esClient.search<WorkflowProperties>({
              pit: { id: pitId, keep_alive: keepAlive },
              size: pageSize,
              _source,
              query,
              sort,
              ...(searchAfter ? { search_after: searchAfter } : {}),
            }),
          pageSize,
          maxPages: MAX_PAGES,
          logger,
          operationName: `getWorkflowsSubscribedToTrigger(${triggerId}, ${spaceId})`,
          throwOnMissingSort: true,
        },
        async (hits) => {
          for (const hit of hits) {
            allHits.push({ _id: hit._id, _source: hit._source });
          }
        }
      );

      return allHits.map(({ _id, _source: source }) =>
        transformStorageDocumentToWorkflowDto(_id, source)
      );
    } finally {
      try {
        await esClient.closePointInTime({ id: pitId });
      } catch (closeErr) {
        logger.warn(`Failed to close PIT ${pitId}: ${closeErr}`);
      }
    }
  }

  async getWorkflows(
    params: GetWorkflowsParams,
    spaceId: string,
    options?: { includeExecutionHistory?: boolean; includeManagedExecutionHistory?: boolean }
  ): Promise<WorkflowListDto> {
    const {
      size = 100,
      page = 1,
      enabled,
      createdBy,
      tags,
      query,
      managedFilter,
      sortField,
      sortOrder = 'asc',
    } = params;
    const from = (page - 1) * size;

    const { must, must_not } = buildWorkflowFilters({
      space: { id: spaceId, includeGlobal: true },
      deleted: 'not_deleted',
      managed: managedFilter ?? 'unmanaged',
    });

    must.push(
      ...buildConditionalTermsFilters([
        { field: 'enabled', values: enabled },
        { field: 'createdBy', values: createdBy },
        { field: 'tags', values: tags },
      ])
    );

    if (query) {
      must.push(buildWorkflowTextSearchClause(query));
    }

    const esSort = sortField
      ? [
          { [ES_SORT_FIELDS[sortField]]: { order: sortOrder } },
          { updated_at: { order: 'desc' as const } },
        ]
      : [{ updated_at: { order: 'desc' as const } }];

    const searchResponse = await this.deps.workflowStorage.getClient().search({
      size,
      from,
      track_total_hits: true,
      query: {
        bool: { must, must_not },
      },
      sort: esSort,
    });

    const workflows = searchResponse.hits.hits
      .map<WorkflowListItemDto>((hit) => {
        if (!hit._source) {
          throw new Error('Missing _source in search result');
        }
        const workflow = transformStorageDocumentToWorkflowDto(hit._id, hit._source);
        return {
          ...workflow,
          description: workflow.description || '',
          definition: workflow.definition,
        };
      })
      .filter((workflow): workflow is NonNullable<typeof workflow> => workflow !== null);

    if (options?.includeExecutionHistory && workflows.length > 0) {
      const workflowIds = workflows
        .filter((workflow) => workflow.managed !== true || options.includeManagedExecutionHistory)
        .map((workflow) => workflow.id);
      const executionHistory = await this.getRecentExecutionsForWorkflows(workflowIds, spaceId);
      workflows.forEach((workflow) => {
        workflow.history = executionHistory[workflow.id] || [];
      });
    }

    return {
      page,
      size,
      total:
        typeof searchResponse.hits.total === 'number'
          ? searchResponse.hits.total
          : searchResponse.hits.total?.value || 0,
      results: workflows,
    };
  }

  async getWorkflowStats(
    spaceId: string,
    options?: { includeExecutionStats?: boolean; includeManagedExecutionStats?: boolean }
  ): Promise<WorkflowStatsDto> {
    const statsFilter = buildWorkflowFilters({
      space: { id: spaceId, includeGlobal: true },
      deleted: 'not_deleted',
      managed: 'unmanaged',
    });
    const statsResponse = await this.deps.workflowStorage.getClient().search({
      size: 0,
      track_total_hits: true,
      query: {
        bool: statsFilter,
      },
      aggs: {
        enabled_count: {
          filter: { term: { enabled: true } },
        },
        disabled_count: {
          filter: { term: { enabled: false } },
        },
      },
    });

    const aggs = statsResponse.aggregations;
    const workflowsStats: WorkflowStatsDto = {
      workflows: {
        enabled: aggs?.enabled_count.doc_count ?? 0,
        disabled: aggs?.disabled_count.doc_count ?? 0,
      },
    };

    if (options?.includeExecutionStats) {
      workflowsStats.executions = await this.getExecutionHistoryStats(spaceId, {
        includeManagedExecutions: options.includeManagedExecutionStats === true,
      });
    }

    return workflowsStats;
  }

  async getWorkflowAggs(
    fields: string[],
    spaceId: string,
    options?: GetWorkflowAggsOptions
  ): Promise<WorkflowAggsDto> {
    const aggs: Record<string, estypes.AggregationsAggregationContainer> = {};

    fields.forEach((field) => {
      aggs[field] = {
        terms: {
          field: field === 'name' ? 'name.keyword' : field,
          size: 100,
        },
      };
    });

    try {
      const aggsFilter = buildWorkflowFilters({
        space: { id: spaceId, includeGlobal: true },
        deleted: 'not_deleted',
        managed: options?.managedFilter ?? 'unmanaged',
      });
      const aggsResponse = await this.deps.workflowStorage.getClient().search({
        size: 0,
        track_total_hits: true,
        query: {
          bool: aggsFilter,
        },
        aggs,
      });

      const result: WorkflowAggsDto = {};
      const responseAggs = aggsResponse.aggregations ?? {};

      fields.forEach((field) => {
        const termsAggregation = (responseAggs as WorkflowAggsResponse)[field];
        if (termsAggregation && Array.isArray(termsAggregation.buckets)) {
          result[field] = termsAggregation.buckets.map((bucket) => {
            // Prefer `key_as_string` so non-string ES keys (booleans, numbers, dates)
            // round-trip back to the matching schema values used by the workflow filters.
            const key = bucket.key_as_string ?? String(bucket.key);
            return {
              label: key,
              key,
              doc_count: bucket.doc_count,
            };
          });
        }
      });

      return result;
    } catch (error) {
      if (isIndexNotFoundError(error)) {
        return {};
      }
      throw error;
    }
  }

  private async getExecutionHistoryStats(
    spaceId: string,
    options?: { includeManagedExecutions?: boolean }
  ) {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const response = await this.deps.esClient.search({
        index: WORKFLOWS_EXECUTIONS_INDEX,
        size: 0,
        query: {
          bool: {
            must: [
              { range: { createdAt: { gte: thirtyDaysAgo.toISOString() } } },
              { term: { spaceId } },
            ],
            ...(options?.includeManagedExecutions
              ? {}
              : { must_not: [{ term: { managed: true } }] }),
          },
        },
        aggs: {
          daily_stats: {
            date_histogram: {
              field: 'createdAt',
              calendar_interval: 'day',
              format: 'yyyy-MM-dd',
            },
            aggs: {
              completed: { filter: { term: { status: 'completed' } } },
              failed: { filter: { term: { status: 'failed' } } },
              cancelled: { filter: { term: { status: 'cancelled' } } },
            },
          },
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const buckets = (response.aggregations as any)?.daily_stats?.buckets || [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return buckets.map((bucket: any) => ({
        date: bucket.key_as_string,
        timestamp: bucket.key,
        completed: bucket.completed.doc_count,
        failed: bucket.failed.doc_count,
        cancelled: bucket.cancelled.doc_count,
      }));
    } catch (error) {
      if (!isIndexNotFoundError(error)) {
        this.deps.logger.error('Failed to get execution history stats', error);
      } else {
        this.deps.logger.warn(
          `Executions index not found when fetching execution history stats: ${error.message}`
        );
      }
      return [];
    }
  }

  private async getRecentExecutionsForWorkflows(
    workflowIds: string[],
    spaceId: string
  ): Promise<Record<string, WorkflowExecutionHistoryModel[]>> {
    if (workflowIds.length === 0) {
      return {};
    }

    try {
      const response = await this.deps.esClient.search<EsWorkflowExecution>({
        index: WORKFLOWS_EXECUTIONS_INDEX,
        size: 0,
        query: {
          bool: {
            must: [
              { terms: { workflowId: workflowIds } },
              {
                bool: {
                  should: [
                    { term: { spaceId } },
                    { bool: { must_not: { exists: { field: 'spaceId' } } } },
                  ],
                  minimum_should_match: 1,
                },
              },
            ],
          },
        },
        aggs: {
          workflows: {
            terms: {
              field: 'workflowId',
              size: workflowIds.length,
            },
            aggs: {
              recent_executions: {
                top_hits: {
                  size: 1,
                  sort: [{ finishedAt: { order: 'desc' } }],
                },
              },
            },
          },
        },
      });

      const result: Record<string, WorkflowExecutionHistoryModel[]> = {};

      if (response.aggregations?.workflows && 'buckets' in response.aggregations.workflows) {
        const buckets = response.aggregations.workflows.buckets as Array<{
          key: string;
          recent_executions: {
            hits: {
              hits: Array<{ _source: EsWorkflowExecution }>;
            };
          };
        }>;

        buckets.forEach((bucket) => {
          const workflowId = bucket.key;
          const hits = bucket.recent_executions.hits.hits;

          if (hits.length > 0) {
            const execution = hits[0]._source;
            result[workflowId] = [
              {
                id: execution.id,
                workflowId: execution.workflowId,
                workflowName: execution.workflowDefinition?.name || 'Unknown Workflow',
                status: execution.status,
                startedAt: execution.startedAt,
                finishedAt: execution.finishedAt || execution.startedAt,
                duration:
                  execution.finishedAt && execution.startedAt
                    ? new Date(execution.finishedAt).getTime() -
                      new Date(execution.startedAt).getTime()
                    : null,
              },
            ];
          }
        });
      }

      return result;
    } catch (error) {
      if (!isIndexNotFoundError(error)) {
        this.deps.logger.error(`Failed to fetch recent executions for workflows: ${error}`);
      }
      return {};
    }
  }
}
