/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { estypes } from '@elastic/elasticsearch';
import { ExecutionType, TerminalExecutionStatuses } from '@kbn/workflows';
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

/** Max completed steps fetched per page when resolving predecessor `output.reasoning`. */
const PREDECESSOR_REASONING_MAX_HITS = 1000;

const SETTLED_STEP_STATUSES: readonly string[] = TerminalExecutionStatuses;

const PROCESSED_WAIT_FOR_INPUT_SHOULD: estypes.QueryDslQueryContainer[] = [
  { exists: { field: 'finishedAt' } },
  { exists: { field: 'hitl.respondedAt' } },
];

/**
 * Extends EsWorkflowStepExecution with the legacy `endedAt` field
 * that may exist on older documents written before the rename to `finishedAt`.
 */
interface StepExecutionWithLegacyFields extends EsWorkflowStepExecution {
  endedAt?: string;
}

/**
 * Filters applied to processed wait-for-input step executions. Multi-value
 * fields are OR'd within a field and AND'd across fields; `q` is a
 * case-insensitive prefix search over responder, workflow id, and step id.
 */
export interface ProcessedWaitForInputFilters {
  q?: string;
  channel?: string[];
  workflowId?: string[];
  respondedBy?: string[];
  sortOrder?: 'asc' | 'desc';
}

interface WaitForInputListOptions {
  page?: number;
  perPage?: number;
  includeReasoning?: boolean;
}

/**
 * Result of the cross-workflow `waitForInput` listings. `reasoningByStepId`
 * contains any `output.reasoning` object found on the step that immediately
 * preceded each wait step.
 *
 * `deletedWorkflowIds` lists the parent workflow ids in `results` that no
 * longer resolve to an alive workflow (soft-deleted, or hard-deleted and
 * thus absent). The pending listing filters these out entirely, so the set
 * is only ever populated by the processed/audit listing — which retains the
 * rows so the audit trail survives workflow deletion. Empty when the
 * alive-workflow lookup failed and deletion cannot be attributed reliably.
 */
export interface WaitForInputListResult {
  results: EsWorkflowStepExecution[];
  total: number;
  reasoningByStepId: Map<string, Record<string, unknown>>;
  deletedWorkflowIds: Set<string>;
}

/** Facet buckets for processed wait-for-input step executions. */
export interface ProcessedWaitForInputFacets {
  channel: Array<{ value: string; count: number }>;
  respondedBy: Array<{ value: string; count: number }>;
}

interface ProcessedWaitForInputFacetAggs {
  channel: estypes.AggregationsStringTermsAggregate;
  respondedBy: estypes.AggregationsStringTermsAggregate;
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
        query: buildWorkflowExecutionsSearchQuery(params.query, spaceId, {
          includeManagedExecutions: params.includeManagedExecutions,
        }),
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
   * Lists active `waitForInput` step executions for a space.
   *
   * Pending rows exclude settled steps and rows that have already been claimed
   * by a response audit stamp. Soft-deleted parent workflows are filtered out
   * at read time because step executions are retained unless the workflow is
   * hard-deleted.
   */
  async listWaitingForInputSteps(
    spaceId: string,
    { page = 1, perPage = 100, includeReasoning = false }: WaitForInputListOptions = {}
  ): Promise<WaitForInputListResult> {
    const from = Math.max(0, (page - 1) * perPage);
    let response: estypes.SearchResponse<EsWorkflowStepExecution>;
    try {
      response = await this.deps.esClient.search<EsWorkflowStepExecution>({
        index: WORKFLOWS_STEP_EXECUTIONS_INDEX,
        query: {
          bool: {
            must: [{ term: { spaceId } }, { term: { status: 'waiting_for_input' } }],
            // `hitl.respondedAt` marks a claimed response that Task Manager
            // may not have resumed yet; it belongs to the processed listing.
            must_not: [
              { exists: { field: 'finishedAt' } },
              { exists: { field: 'hitl.respondedAt' } },
            ],
          },
        },
        sort: [{ startedAt: { order: 'desc' } }],
        from,
        size: perPage,
        track_total_hits: true,
      });
    } catch (error) {
      if (isIndexNotFoundError(error)) {
        return {
          results: [],
          total: 0,
          reasoningByStepId: new Map(),
          deletedWorkflowIds: new Set(),
        };
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
      return {
        results: allResults,
        total,
        reasoningByStepId: new Map(),
        deletedWorkflowIds: new Set(),
      };
    }

    const distinctWorkflowIds = Array.from(
      new Set(
        allResults
          .map((r) => r.workflowId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      )
    );

    // Resolve workflow deletion and optional predecessor reasoning in parallel.
    const [aliveIds, reasoningByStepId] = await Promise.all([
      this.getAliveWorkflowIds(distinctWorkflowIds, spaceId),
      includeReasoning
        ? this.resolvePredecessorReasoning(allResults, spaceId)
        : Promise.resolve(new Map<string, Record<string, unknown>>()),
    ]);

    if (aliveIds === null) {
      // Lookup itself failed (already logged). Fall back to unfiltered
      // results so a transient ES error does not hide active steps.
      return {
        results: allResults,
        total,
        reasoningByStepId,
        deletedWorkflowIds: new Set(),
      };
    }

    const results = allResults.filter((r) => r.workflowId && aliveIds.has(r.workflowId));
    const dropped = allResults.length - results.length;
    // `total` is per-page best-effort: we only know how many of the items in
    // *this page* were orphaned. Across pages the reported total may be
    // slightly optimistic, but it is monotonically corrected as the user
    // pages through. A precise cardinality would require a second
    // aggregation per call, which isn't worth it for a transient state.
    return {
      results,
      total: Math.max(0, total - dropped),
      reasoningByStepId,
      // Pending drops orphans outright, so no surviving row is from a deleted parent.
      deletedWorkflowIds: new Set(),
    };
  }

  /**
   * Lists processed `waitForInput` step executions for a space.
   *
   * A row is processed once it has either terminated or received a response
   * audit stamp. Unlike the pending listing, deleted parent workflows are
   * retained and reported via `deletedWorkflowIds`.
   */
  async listProcessedWaitForInputSteps(
    spaceId: string,
    {
      page = 1,
      perPage = 25,
      includeReasoning = false,
      q,
      channel,
      workflowId,
      respondedBy,
      sortOrder = 'desc',
    }: WaitForInputListOptions & ProcessedWaitForInputFilters = {}
  ): Promise<WaitForInputListResult> {
    const from = Math.max(0, (page - 1) * perPage);
    const filterMust = buildHistoryFilterClauses({ channel, workflowId, respondedBy, q });
    let response: estypes.SearchResponse<EsWorkflowStepExecution>;
    try {
      response = await this.deps.esClient.search<EsWorkflowStepExecution>({
        index: WORKFLOWS_STEP_EXECUTIONS_INDEX,
        query: {
          bool: {
            must: [{ term: { spaceId } }, { term: { stepType: 'waitForInput' } }, ...filterMust],
            should: PROCESSED_WAIT_FOR_INPUT_SHOULD,
            minimum_should_match: 1,
          },
        },
        // Keep claimed-but-not-yet-resumed rows in the same relative position
        // after the engine later writes `finishedAt`.
        sort: [
          { 'hitl.respondedAt': { order: sortOrder, missing: '_last' } },
          { finishedAt: { order: sortOrder, missing: '_last' } },
        ],
        from,
        size: perPage,
        track_total_hits: true,
      });
    } catch (error) {
      if (isIndexNotFoundError(error)) {
        return {
          results: [],
          total: 0,
          reasoningByStepId: new Map(),
          deletedWorkflowIds: new Set(),
        };
      }
      this.deps.logger.error(`Failed to list processed wait-for-input step executions: ${error}`);
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
      return {
        results: allResults,
        total,
        reasoningByStepId: new Map(),
        deletedWorkflowIds: new Set(),
      };
    }

    const distinctWorkflowIds = Array.from(
      new Set(
        allResults
          .map((r) => r.workflowId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      )
    );

    // Resolve workflow deletion and optional predecessor reasoning in parallel.
    const [aliveIds, reasoningByStepId] = await Promise.all([
      this.getAliveWorkflowIds(distinctWorkflowIds, spaceId),
      includeReasoning
        ? this.resolvePredecessorReasoning(allResults, spaceId)
        : Promise.resolve(new Map<string, Record<string, unknown>>()),
    ]);

    if (aliveIds === null) {
      return {
        results: allResults,
        total,
        reasoningByStepId,
        deletedWorkflowIds: new Set(),
      };
    }

    // Processed rows are retained when their parent workflow is deleted; the
    // caller can decide how to display the deleted source.
    const deletedWorkflowIds = new Set(distinctWorkflowIds.filter((id) => !aliveIds.has(id)));
    return {
      results: allResults,
      total,
      reasoningByStepId,
      deletedWorkflowIds,
    };
  }

  /**
   * Returns facet buckets for processed `waitForInput` rows.
   *
   * Facets use the same baseline as `listProcessedWaitForInputSteps`, without
   * caller-supplied filters and without parent-workflow deletion filtering.
   */
  async listProcessedWaitForInputFacets(
    spaceId: string,
    { maxBuckets = 50 }: { maxBuckets?: number } = {}
  ): Promise<ProcessedWaitForInputFacets> {
    let response: estypes.SearchResponse<EsWorkflowStepExecution, ProcessedWaitForInputFacetAggs>;
    try {
      response = await this.deps.esClient.search<
        EsWorkflowStepExecution,
        ProcessedWaitForInputFacetAggs
      >({
        index: WORKFLOWS_STEP_EXECUTIONS_INDEX,
        // `size: 0` — we only want the aggs, not the matching docs.
        size: 0,
        query: {
          bool: {
            must: [{ term: { spaceId } }, { term: { stepType: 'waitForInput' } }],
            should: PROCESSED_WAIT_FOR_INPUT_SHOULD,
            minimum_should_match: 1,
          },
        },
        aggs: {
          channel: { terms: { field: 'hitl.channel', size: maxBuckets } },
          respondedBy: { terms: { field: 'hitl.respondedBy', size: maxBuckets } },
        },
        track_total_hits: false,
      });
    } catch (error) {
      if (isIndexNotFoundError(error)) {
        return { channel: [], respondedBy: [] };
      }
      this.deps.logger.error(`Failed to compute processed wait-for-input facets: ${error}`);
      throw error;
    }

    return {
      channel: bucketsToFacet(response.aggregations?.channel?.buckets),
      respondedBy: bucketsToFacet(response.aggregations?.respondedBy?.buckets),
    };
  }

  /**
   * Best-effort lookup of `output.reasoning` from the completed step that
   * finished immediately before each wait step started.
   */
  private async resolvePredecessorReasoning(
    steps: EsWorkflowStepExecution[],
    spaceId: string
  ): Promise<Map<string, Record<string, unknown>>> {
    const reasoningByStepId = new Map<string, Record<string, unknown>>();

    const runIds = Array.from(
      new Set(
        steps
          .map((step) => step.workflowRunId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      )
    );
    const waitStarts = steps
      .map((step) => step.startedAt)
      .filter(
        (startedAt): startedAt is string => typeof startedAt === 'string' && startedAt.length > 0
      );
    if (runIds.length === 0 || waitStarts.length === 0) {
      return reasoningByStepId;
    }
    const maxWaitStart = waitStarts.reduce((latest, current) =>
      current > latest ? current : latest
    );

    let response: estypes.SearchResponse<EsWorkflowStepExecution>;
    try {
      response = await this.deps.esClient.search<EsWorkflowStepExecution>({
        index: WORKFLOWS_STEP_EXECUTIONS_INDEX,
        query: {
          bool: {
            must: [
              { term: { spaceId } },
              { terms: { workflowRunId: runIds } },
              { term: { status: 'completed' } },
              { range: { finishedAt: { lte: maxWaitStart } } },
            ],
          },
        },
        // Most-recent-first within each run so the first candidate at or
        // before a wait step's start is its immediate predecessor.
        sort: [
          { workflowRunId: { order: 'asc' } },
          { finishedAt: { order: 'desc', missing: '_last' } },
        ],
        // Fetch only the reasoning sub-object, not the full (potentially
        // large) step `output` blob — most predecessors carry no reasoning.
        _source: { includes: ['workflowRunId', 'finishedAt', 'output.reasoning'] },
        size: PREDECESSOR_REASONING_MAX_HITS,
        track_total_hits: false,
      });
    } catch (error) {
      if (isIndexNotFoundError(error)) {
        return reasoningByStepId;
      }
      // Reasoning is optional context; do not fail the listing if lookup fails.
      this.deps.logger.warn(`Failed to resolve predecessor reasoning: ${error}`);
      return reasoningByStepId;
    }

    const hits = response?.hits?.hits ?? [];
    const completedByRun = new Map<string, Array<{ finishedAt?: string; output?: unknown }>>();
    for (const hit of hits) {
      const source = hit._source;
      if (source?.workflowRunId) {
        const forRun = completedByRun.get(source.workflowRunId) ?? [];
        forRun.push({ finishedAt: source.finishedAt, output: source.output });
        completedByRun.set(source.workflowRunId, forRun);
      }
    }

    for (const step of steps) {
      const { id, workflowRunId, startedAt } = step;
      const candidates =
        id && workflowRunId && startedAt ? completedByRun.get(workflowRunId) : undefined;
      if (candidates && id && startedAt) {
        // Candidates are finishedAt-desc within a run; the first that finished
        // at or before the wait step started is its immediate predecessor.
        const predecessor = candidates.find(
          (candidate) =>
            typeof candidate.finishedAt === 'string' && candidate.finishedAt <= startedAt
        );
        const reasoning = extractReasoning(predecessor?.output);
        if (reasoning) {
          reasoningByStepId.set(id, reasoning);
        }
      }
    }

    return reasoningByStepId;
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
        `Failed to validate parent workflows for wait-for-input listing; returning unfiltered results: ${error}`
      );
      return null;
    }
  }

  /** Returns the claimable `waitForInput` step currently blocking the run. */
  async getWaitingStepExecutionId(executionId: string, spaceId: string): Promise<string | null> {
    try {
      const response = await this.deps.esClient.search<EsWorkflowStepExecution>({
        index: WORKFLOWS_STEP_EXECUTIONS_INDEX,
        query: {
          bool: {
            must: [
              { term: { workflowRunId: executionId } },
              { term: { spaceId } },
              { term: { stepType: 'waitForInput' } },
              { term: { status: 'waiting_for_input' } },
            ],
            must_not: [
              { exists: { field: 'finishedAt' } },
              { exists: { field: 'hitl.respondedAt' } },
            ],
          },
        },
        _source: ['id'],
        sort: [{ startedAt: { order: 'desc' } }],
        size: 1,
        track_total_hits: false,
      });
      const hit = response.hits.hits[0];
      return hit?._source?.id ?? hit?._id ?? null;
    } catch (error) {
      if (isIndexNotFoundError(error)) {
        return null;
      }
      this.deps.logger.warn(
        `Failed to resolve the waiting step execution for ${executionId}: ${error}`
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

  /**
   * Claims a `waitForInput` step by writing HITL audit metadata before resume.
   *
   * Returns `true` when this caller won the claim, or `false` when the doc is
   * missing, belongs to another space, has already settled (terminal status
   * or `finishedAt` set), or was already claimed. Unexpected ES failures are
   * rethrown.
   */
  async markStepAsResponded(
    stepExecutionId: string,
    audit: { respondedBy: string; respondedAt: string; channel: string },
    spaceId: string
  ): Promise<boolean> {
    try {
      const response = await this.deps.esClient.update({
        index: WORKFLOWS_STEP_EXECUTIONS_INDEX,
        id: stepExecutionId,
        // `respondedAt` is the first-writer-wins guard. Retrying conflicts
        // lets simultaneous updates re-run the script against the winner's
        // write and return `noop` instead of leaking a version conflict.
        retry_on_conflict: 3,
        script: {
          source:
            'if (ctx._source.spaceId != params.spaceId) { ctx.op = "noop"; return; }' +
            'if (ctx._source.finishedAt != null) { ctx.op = "noop"; return; }' +
            'if (ctx._source.status != null && params.settledStatuses.contains(ctx._source.status)) { ctx.op = "noop"; return; }' +
            'if (ctx._source.hitl != null && ctx._source.hitl.respondedAt != null) { ctx.op = "noop"; return; }' +
            'if (ctx._source.hitl == null) { ctx._source.hitl = [:]; }' +
            'ctx._source.hitl.respondedBy = params.respondedBy;' +
            'ctx._source.hitl.respondedAt = params.respondedAt;' +
            'ctx._source.hitl.channel = params.channel;',
          lang: 'painless',
          params: {
            spaceId,
            respondedBy: audit.respondedBy,
            respondedAt: audit.respondedAt,
            channel: audit.channel,
            settledStatuses: SETTLED_STEP_STATUSES,
          },
        },
        refresh: 'wait_for',
      });
      return response.result !== 'noop';
    } catch (error) {
      if (
        error?.statusCode === 404 ||
        error?.meta?.body?.result === 'not_found' ||
        error?.body?.result === 'not_found'
      ) {
        // Treat concurrent deletion or termination as a lost claim.
        return false;
      }
      this.deps.logger.error(
        `Failed to mark step execution ${stepExecutionId} as responded: ${error}`
      );
      throw error;
    }
  }
}

/**
 * Builds additional `must` clauses for processed wait-for-input filters.
 */
function buildHistoryFilterClauses({
  channel,
  workflowId,
  respondedBy,
  q,
}: ProcessedWaitForInputFilters): estypes.QueryDslQueryContainer[] {
  const filterMust: estypes.QueryDslQueryContainer[] = [];
  if (channel && channel.length > 0) {
    filterMust.push({ terms: { 'hitl.channel': channel } });
  }
  if (workflowId && workflowId.length > 0) {
    filterMust.push({ terms: { workflowId } });
  }
  if (respondedBy && respondedBy.length > 0) {
    filterMust.push({ terms: { 'hitl.respondedBy': respondedBy } });
  }
  if (q && q.length > 0) {
    // Avoid leading-wildcard scans on keyword fields.
    filterMust.push({
      bool: {
        should: ['hitl.respondedBy', 'workflowId', 'stepId'].map((field) => ({
          prefix: {
            [field]: {
              value: q,
              case_insensitive: true,
            },
          },
        })),
        minimum_should_match: 1,
      },
    });
  }
  return filterMust;
}

/**
 * Pull a plain-object `reasoning` value out of a step output, when present.
 */
function extractReasoning(output: unknown): Record<string, unknown> | undefined {
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    return undefined;
  }
  const reasoning = (output as Record<string, unknown>).reasoning;
  if (!reasoning || typeof reasoning !== 'object' || Array.isArray(reasoning)) {
    return undefined;
  }
  return reasoning as Record<string, unknown>;
}

/** Convert ES `terms` agg buckets into `{ value, count }` entries. */
function bucketsToFacet(
  buckets: estypes.AggregationsStringTermsAggregate['buckets'] | undefined
): Array<{ value: string; count: number }> {
  if (!buckets || !Array.isArray(buckets)) {
    return [];
  }
  return buckets
    .map((bucket) => ({
      value: typeof bucket.key === 'string' ? bucket.key : String(bucket.key ?? ''),
      count: bucket.doc_count,
    }))
    .filter((entry) => entry.value.length > 0);
}
