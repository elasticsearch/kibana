/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { estypes } from '@elastic/elasticsearch';
import { ExecutionType } from '@kbn/workflows';
import type {
  EsWorkflowStepExecution,
  WorkflowExecutionDto,
  WorkflowExecutionHistoryModel,
  WorkflowExecutionListDto,
} from '@kbn/workflows';
import type { ChildWorkflowExecutionItem } from '@kbn/workflows/types/v1';
import type { LogSearchResult } from '@kbn/workflows-execution-engine/server';
import type {
  ExecutionLogsParams,
  StepLogsParams,
} from '@kbn/workflows-execution-engine/server/workflow_event_logger/types';

import type { WorkflowExecutionQueryDeps } from './types';
import {
  WORKFLOWS_EXECUTIONS_INDEX,
  WORKFLOWS_INDEX,
  WORKFLOWS_STEP_EXECUTIONS_INDEX,
} from '../../common';
import { buildTimeRangeFilter } from '../api/lib/build_time_range_filter';
import {
  buildWorkflowExecutionsSearchQuery,
  buildWorkflowExecutionsSpaceFilter,
  emptyWorkflowExecutionsSearchResponse,
} from '../api/lib/build_workflow_executions_search_query';
import { isIndexNotFoundError } from '../api/lib/es_error_helpers';
import { getChildWorkflowExecutions } from '../api/lib/get_child_workflow_executions';
import { getWorkflowExecution } from '../api/lib/get_workflow_execution';
import {
  searchStepExecutions,
  type StepExecutionListResult,
} from '../api/lib/search_step_executions';
import { searchWorkflowExecutions } from '../api/lib/search_workflow_executions';
import type {
  GetStepExecutionParams,
  SearchStepExecutionsParams,
} from '../api/workflows_management_api';
import type {
  SearchExecutionsViewParams,
  SearchWorkflowExecutionsParams,
} from '../api/workflows_management_service';

const DEFAULT_PAGE_SIZE = 100;

/**
 * Extends EsWorkflowStepExecution with the legacy `endedAt` field
 * that may exist on older documents written before the rename to `finishedAt`.
 */
interface StepExecutionWithLegacyFields extends EsWorkflowStepExecution {
  endedAt?: string;
}

export class WorkflowExecutionQueryService {
  constructor(private readonly deps: WorkflowExecutionQueryDeps) {}

  async getWorkflowExecution(
    executionId: string,
    spaceId: string,
    options?: { includeInput?: boolean; includeOutput?: boolean }
  ): Promise<WorkflowExecutionDto | null> {
    return getWorkflowExecution({
      esClient: this.deps.esClient,
      logger: this.deps.logger,
      workflowExecutionIndex: WORKFLOWS_EXECUTIONS_INDEX,
      stepsExecutionIndex: WORKFLOWS_STEP_EXECUTIONS_INDEX,
      workflowExecutionId: executionId,
      spaceId,
      includeInput: options?.includeInput,
      includeOutput: options?.includeOutput,
    });
  }

  async getChildWorkflowExecutions(
    parentExecutionId: string,
    spaceId: string
  ): Promise<ChildWorkflowExecutionItem[]> {
    return getChildWorkflowExecutions({
      esClient: this.deps.esClient,
      workflowExecutionIndex: WORKFLOWS_EXECUTIONS_INDEX,
      stepsExecutionIndex: WORKFLOWS_STEP_EXECUTIONS_INDEX,
      parentExecutionId,
      spaceId,
    });
  }

  async getWorkflowExecutions(
    params: SearchWorkflowExecutionsParams,
    spaceId: string
  ): Promise<WorkflowExecutionListDto> {
    const must: estypes.QueryDslQueryContainer[] = [
      ...(params.workflowId ? [{ term: { workflowId: params.workflowId } }] : []),
      buildWorkflowExecutionsSpaceFilter(spaceId),
    ];

    if (params.statuses) {
      must.push({ terms: { status: params.statuses } });
    }
    if (params.executionTypes && params.executionTypes?.length === 1) {
      const isTestRun = params.executionTypes[0] === ExecutionType.TEST;

      if (isTestRun) {
        must.push({ term: { isTestRun } });
      } else {
        must.push({
          bool: {
            should: [
              { term: { isTestRun: false } },
              { bool: { must_not: { exists: { field: 'isTestRun' } } } },
            ],
            minimum_should_match: 1,
          },
        });
      }
    }
    if (params.executedBy && params.executedBy.length > 0) {
      must.push({ terms: { executedBy: params.executedBy } });
    }

    if (params.concurrencyGroupKey !== undefined) {
      must.push({ term: { concurrencyGroupKey: params.concurrencyGroupKey } });
    }

    if (params.omitStepRuns) {
      must.push({ bool: { must_not: { exists: { field: 'stepId' } } } });
    }

    const startedAtRange = buildTimeRangeFilter(
      'startedAt',
      params.startedAfter,
      params.startedBefore
    );
    if (startedAtRange) {
      must.push(startedAtRange);
    }

    const finishedAtRange = buildTimeRangeFilter(
      'finishedAt',
      params.finishedAfter,
      params.finishedBefore
    );
    if (finishedAtRange) {
      must.push(finishedAtRange);
    }

    const page = params.page ?? 1;
    const size = params.size ?? DEFAULT_PAGE_SIZE;
    const from = (page - 1) * size;
    const sort = params.sortField
      ? [{ [params.sortField]: { order: params.sortOrder ?? 'desc' } }]
      : undefined;

    return searchWorkflowExecutions({
      esClient: this.deps.esClient,
      logger: this.deps.logger,
      workflowExecutionIndex: WORKFLOWS_EXECUTIONS_INDEX,
      query: { bool: { must } },
      size,
      from,
      page,
      sort,
      collapse: params.collapse ? { field: params.collapse } : undefined,
    });
  }

  async searchExecutionsView(
    params: SearchExecutionsViewParams,
    spaceId: string
  ): Promise<estypes.SearchResponse<unknown>> {
    try {
      return await this.deps.esClient.search({
        index: WORKFLOWS_EXECUTIONS_INDEX,
        query: buildWorkflowExecutionsSearchQuery(params.query, spaceId),
        sort: params.sort,
        from: params.from,
        size: params.size,
        track_total_hits: params.trackTotalHits ?? true,
      });
    } catch (error) {
      if (isIndexNotFoundError(error)) {
        return emptyWorkflowExecutionsSearchResponse();
      }
      this.deps.logger.error(`Failed to search workflow executions view: ${error}`);
      throw error;
    }
  }

  async getWorkflowExecutionHistory(
    executionId: string,
    spaceId: string
  ): Promise<WorkflowExecutionHistoryModel[]> {
    const response = await this.deps.esClient.search<StepExecutionWithLegacyFields>({
      index: WORKFLOWS_STEP_EXECUTIONS_INDEX,
      query: {
        bool: {
          must: [{ term: { executionId } }, { term: { spaceId } }],
        },
      },
      sort: [{ timestamp: { order: 'asc' } }],
    });

    return response.hits.hits.map((hit) => {
      if (!hit._source) {
        throw new Error('Missing _source in search result');
      }
      const source = hit._source;
      const startedAt = source.startedAt;
      const finishedAt = source.endedAt || source.finishedAt;

      let duration = 0;
      if (startedAt && finishedAt) {
        duration = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
      }

      return {
        ...source,
        finishedAt: finishedAt || '',
        duration,
      };
    });
  }

  async getStepExecutions(params: GetStepExecutionParams, spaceId: string) {
    const searchResult = await searchStepExecutions({
      esClient: this.deps.esClient,
      logger: this.deps.logger,
      stepsExecutionIndex: WORKFLOWS_STEP_EXECUTIONS_INDEX,
      workflowExecutionId: params.executionId,
      additionalQuery: { term: { id: params.id } },
      spaceId,
    });
    return searchResult.results;
  }

  async searchStepExecutions(
    params: SearchStepExecutionsParams,
    spaceId: string
  ): Promise<StepExecutionListResult> {
    const sourceExcludes: string[] = [];
    if (!params.includeInput) sourceExcludes.push('input');
    if (!params.includeOutput) sourceExcludes.push('output');

    return searchStepExecutions({
      esClient: this.deps.esClient,
      logger: this.deps.logger,
      stepsExecutionIndex: WORKFLOWS_STEP_EXECUTIONS_INDEX,
      workflowId: params.workflowId,
      stepId: params.stepId,
      spaceId,
      sourceExcludes: sourceExcludes.length > 0 ? sourceExcludes : undefined,
      page: params.page,
      size: params.size,
      startedAfter: params.startedAfter,
      startedBefore: params.startedBefore,
    });
  }

  async getExecutionLogs(params: ExecutionLogsParams): Promise<LogSearchResult> {
    if (!this.deps.workflowEventLoggerService) {
      throw new Error('WorkflowEventLoggerService not initialized');
    }
    return this.deps.workflowEventLoggerService.getExecutionLogs(params);
  }

  async getStepLogs(params: StepLogsParams): Promise<LogSearchResult> {
    if (!this.deps.workflowEventLoggerService) {
      throw new Error('WorkflowEventLoggerService not initialized');
    }
    return this.deps.workflowEventLoggerService.getStepLogs(params);
  }

  /**
   * Cross-workflow fan-out: returns every step execution currently blocked on
   * `waitForInput` in the given space. Used by the Inbox plugin to surface
   * pending HITL items across all workflows a user has access to.
   *
   * Intentionally minimal — the Inbox registry owns higher-level concerns
   * like status filtering and paginated merge-sort across providers.
   *
   * NOTE: only `spaceId` and `status` are filtered here because those are the
   * only keyword-indexed fields on `.workflows-step-executions`. An earlier
   * draft also added `term: { stepType: 'waitForInput' }`, which silently
   * matched zero docs and made the Inbox UI appear empty even when workflows
   * were paused on `waitForInput`. The status filter is sufficient because
   * `waiting_for_input` is only ever produced by the `waitForInput` step type.
   *
   * Defence-in-depth `must_not` on `finishedAt`: if a race between the
   * workflow-level timeout monitor and the waitForInput step leaves a doc with
   * `status: waiting_for_input` AND `finishedAt` set (the step is actually
   * settled), we must not resurface it in the Inbox — responding to it is a
   * no-op because the execution doc is terminal. The underlying race is fixed
   * in `WaitForInputStepImpl`, but this keeps the Inbox honest even for
   * pre-existing zombie docs or any future regression.
   *
   * Orphan filtering: `.workflows-step-executions` is NOT transactionally
   * cleaned up when a workflow is soft-deleted (see `workflow_deletion.ts`
   * — only hard-deletes call `deleteByQuery`). Without a join the Inbox
   * would surface ghost actions for workflows the user has already removed
   * from `/app/workflows`. We do this as a list-time filter rather than a
   * delete-time cancel so soft-deletes stay reversible (step executions
   * resurface if the workflow is restored) and so pre-existing orphans get
   * cleaned up retroactively.
   */
  async listWaitingForInputSteps(
    spaceId: string,
    { page = 1, perPage = 100 }: { page?: number; perPage?: number } = {}
  ): Promise<{ results: EsWorkflowStepExecution[]; total: number }> {
    const from = Math.max(0, (page - 1) * perPage);
    let response: estypes.SearchResponse<EsWorkflowStepExecution>;
    try {
      response = await this.deps.esClient.search<EsWorkflowStepExecution>({
        index: WORKFLOWS_STEP_EXECUTIONS_INDEX,
        query: {
          bool: {
            must: [{ term: { spaceId } }, { term: { status: 'waiting_for_input' } }],
            must_not: [{ exists: { field: 'finishedAt' } }],
          },
        },
        sort: [{ startedAt: { order: 'desc' } }],
        from,
        size: perPage,
        track_total_hits: true,
      });
    } catch (error) {
      if (isIndexNotFoundError(error)) {
        return { results: [], total: 0 };
      }
      this.deps.logger.error(`Failed to list waiting-for-input step executions: ${error}`);
      throw error;
    }

    const total =
      typeof response.hits.total === 'number'
        ? response.hits.total
        : response.hits.total?.value ?? 0;

    const allResults = response.hits.hits
      .map((hit) => hit._source)
      .filter((src): src is EsWorkflowStepExecution => Boolean(src));

    if (allResults.length === 0) {
      return { results: allResults, total };
    }

    const distinctWorkflowIds = Array.from(
      new Set(
        allResults
          .map((r) => r.workflowId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      )
    );

    const aliveIds = await this.getAliveWorkflowIds(distinctWorkflowIds, spaceId);

    if (aliveIds === null) {
      // Lookup itself failed (already logged). Fall back to unfiltered
      // results so a transient ES error doesn't black-hole the Inbox.
      return { results: allResults, total };
    }

    const results = allResults.filter((r) => r.workflowId && aliveIds.has(r.workflowId));
    const dropped = allResults.length - results.length;
    // `total` is per-page best-effort: we only know how many of the items in
    // *this page* were orphaned. Across pages the reported total may be
    // slightly optimistic, but it is monotonically corrected as the user
    // pages through. A precise cardinality would require a second
    // aggregation per call, which isn't worth it for a transient state.
    return { results, total: Math.max(0, total - dropped) };
  }

  /**
   * Returns the subset of `ids` that point to alive workflows in `spaceId`
   * — i.e. exist in `.workflows-workflows` and are not soft-deleted
   * (`deleted_at` not set). Returns `null` if the lookup itself errored so
   * the caller can fall back to unfiltered behaviour.
   */
  private async getAliveWorkflowIds(ids: string[], spaceId: string): Promise<Set<string> | null> {
    if (ids.length === 0) {
      return new Set();
    }
    try {
      const response = await this.deps.esClient.search<unknown>({
        index: WORKFLOWS_INDEX,
        query: {
          bool: {
            must: [{ ids: { values: ids } }, { term: { spaceId } }],
            must_not: [{ exists: { field: 'deleted_at' } }],
          },
        },
        _source: false,
        size: ids.length,
        track_total_hits: false,
      });
      const alive = new Set<string>();
      for (const hit of response.hits.hits) {
        if (hit._id) alive.add(hit._id);
      }
      return alive;
    } catch (error) {
      if (isIndexNotFoundError(error)) {
        // Fresh install / test env: no workflows index yet means no alive
        // workflows, so every step execution is by definition an orphan.
        return new Set();
      }
      this.deps.logger.warn(
        `Failed to validate parent workflows for inbox listing; returning unfiltered results: ${error}`
      );
      return null;
    }
  }

  async getStepExecution(
    params: GetStepExecutionParams,
    spaceId: string
  ): Promise<EsWorkflowStepExecution | null> {
    const { executionId, id } = params;
    const response = await this.deps.esClient.search<EsWorkflowStepExecution>({
      index: WORKFLOWS_STEP_EXECUTIONS_INDEX,
      query: {
        bool: {
          must: [{ term: { workflowRunId: executionId } }, { term: { id } }, { term: { spaceId } }],
        },
      },
      size: 1,
      track_total_hits: false,
    });

    if (response.hits.hits.length === 0) {
      return null;
    }

    return response.hits.hits[0]._source ?? null;
  }
}
