/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import { getCorrelationRunsIndexName } from '../../../common/threat_intelligence/hub';
import type {
  CorrelationRun,
  CorrelationRunPartials,
  CorrelationRunResult,
  CorrelationRunStatus,
  CorrelationRunStage,
} from '../../../common/threat_intelligence/correlation_runs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RunDataClientDeps {
  readonly esClient: ElasticsearchClient;
  readonly logger: Logger;
  readonly spaceId: string;
}

export interface RunUpdate {
  readonly status?: CorrelationRunStatus;
  readonly stage?: CorrelationRunStage;
  readonly error?: string;
  readonly result?: CorrelationRunResult;
  readonly title?: string;
  /**
   * Single stage's partial result to merge into the `partials` object.
   * Each call adds its slice without clobbering prior stage slices.
   */
  readonly partials?: Partial<CorrelationRunPartials>;
  readonly updatedAt: string;
}

export interface RunListParams {
  readonly page?: number;
  readonly perPage?: number;
}

export interface RunListResult {
  readonly runs: CorrelationRun[];
  readonly total: number;
  readonly page: number;
  readonly perPage: number;
}

export interface RunDataClient {
  createRun(run: CorrelationRun): Promise<void>;
  updateRun(runId: string, updates: RunUpdate): Promise<void>;
  getRun(runId: string): Promise<CorrelationRun | null>;
  listRuns(params?: RunListParams): Promise<RunListResult>;
  countActiveRuns(): Promise<number>;
}

// ---------------------------------------------------------------------------
// ES doc ↔ API type transform (snake_case ↔ camelCase for top-level fields)
// ---------------------------------------------------------------------------

interface EsRunDoc {
  run_id: string;
  space_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  input_type: 'report_id' | 'raw_text';
  report_id?: string;
  input_summary?: string;
  title?: string;
  depth: CorrelationRun['depth'];
  status: CorrelationRunStatus;
  stage?: CorrelationRunStage;
  error?: string;
  result?: unknown;
  partials?: unknown;
}

const runToEsDoc = (run: CorrelationRun): EsRunDoc => ({
  run_id: run.runId,
  space_id: run.spaceId,
  created_by: run.createdBy,
  created_at: run.createdAt,
  updated_at: run.updatedAt,
  input_type: run.input_type,
  report_id: run.report_id,
  input_summary: run.input_summary,
  title: run.title,
  depth: run.depth,
  status: run.status,
  stage: run.stage,
  error: run.error,
  result: run.result,
  partials: run.partials,
});

const esDocToRun = (doc: EsRunDoc): CorrelationRun => ({
  runId: doc.run_id,
  spaceId: doc.space_id,
  createdBy: doc.created_by,
  createdAt: doc.created_at,
  updatedAt: doc.updated_at,
  input_type: doc.input_type,
  report_id: doc.report_id,
  input_summary: doc.input_summary,
  title: doc.title,
  depth: doc.depth,
  status: doc.status,
  stage: doc.stage,
  error: doc.error,
  result: doc.result as CorrelationRunResult | undefined,
  partials: doc.partials as CorrelationRunPartials | undefined,
});

// ---------------------------------------------------------------------------
// ES error helpers
// ---------------------------------------------------------------------------

const getEsStatusCode = (e: unknown): number | undefined =>
  (e as { meta?: { statusCode?: number } })?.meta?.statusCode;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const createRunDataClient = ({
  esClient,
  logger,
  spaceId,
}: RunDataClientDeps): RunDataClient => {
  const indexName = getCorrelationRunsIndexName(spaceId);

  // -----------------------------------------------------------------------
  // createRun — index the initial pending run record
  // -----------------------------------------------------------------------
  const createRun = async (run: CorrelationRun): Promise<void> => {
    try {
      await esClient.index({
        index: indexName,
        id: run.runId,
        document: runToEsDoc(run),
        refresh: true,
      });
    } catch (e: unknown) {
      logger.error(`[CorrelationRuns] Failed to create run '${run.runId}': ${e}`);
      throw e;
    }
  };

  // -----------------------------------------------------------------------
  // updateRun — partial update of mutable fields.
  // When `partials` is supplied we use a painless script to merge individual
  // stage slices into the existing `partials` object so that concurrent stage
  // writes don't clobber each other.
  // -----------------------------------------------------------------------
  const updateRun = async (runId: string, updates: RunUpdate): Promise<void> => {
    try {
      if (updates.partials && Object.keys(updates.partials).length > 0) {
        // Build a script that initialises partials if absent, then sets each
        // provided stage key — leaving other stage keys untouched.
        const stageKeys = Object.keys(updates.partials) as Array<keyof CorrelationRunPartials>;
        const scriptLines: string[] = [
          'if (ctx._source.partials == null) { ctx._source.partials = new HashMap(); }',
        ];
        const params: Record<string, unknown> = { updated_at: updates.updatedAt };
        for (const k of stageKeys) {
          scriptLines.push(`ctx._source.partials.${k} = params.partial_${k};`);
          params[`partial_${k}`] = (updates.partials as Record<string, unknown>)[k];
        }
        // Apply any other scalar updates in the same script pass.
        scriptLines.push('ctx._source.updated_at = params.updated_at;');
        if (updates.status !== undefined) {
          scriptLines.push('ctx._source.status = params.status;');
          params.status = updates.status;
        }
        if (updates.stage !== undefined) {
          scriptLines.push('ctx._source.stage = params.stage;');
          params.stage = updates.stage;
        }
        if (updates.error !== undefined) {
          scriptLines.push('ctx._source.error = params.error;');
          params.error = updates.error;
        }
        if (updates.result !== undefined) {
          scriptLines.push('ctx._source.result = params.result;');
          params.result = updates.result;
        }
        if (updates.title !== undefined) {
          scriptLines.push('ctx._source.title = params.title;');
          params.title = updates.title;
        }

        await esClient.update({
          index: indexName,
          id: runId,
          script: { source: scriptLines.join(' '), lang: 'painless', params },
          retry_on_conflict: 3,
        });
      } else {
        const doc: Record<string, unknown> = { updated_at: updates.updatedAt };
        if (updates.status !== undefined) doc.status = updates.status;
        if (updates.stage !== undefined) doc.stage = updates.stage;
        if (updates.error !== undefined) doc.error = updates.error;
        if (updates.result !== undefined) doc.result = updates.result;
        if (updates.title !== undefined) doc.title = updates.title;

        await esClient.update({
          index: indexName,
          id: runId,
          doc,
          retry_on_conflict: 3,
        });
      }
    } catch (e: unknown) {
      // Best-effort: log but do not re-throw so the background pipeline continues.
      logger.warn(`[CorrelationRuns] Failed to update run '${runId}': ${e}`);
    }
  };

  // -----------------------------------------------------------------------
  // getRun — fetch a single run by ID
  // -----------------------------------------------------------------------
  const getRun = async (runId: string): Promise<CorrelationRun | null> => {
    try {
      const resp = await esClient.get<EsRunDoc>({ index: indexName, id: runId });
      if (!resp.found || !resp._source) return null;
      return esDocToRun(resp._source);
    } catch (e: unknown) {
      if (getEsStatusCode(e) === 404) return null;
      logger.error(`[CorrelationRuns] Failed to get run '${runId}': ${e}`);
      throw e;
    }
  };

  // -----------------------------------------------------------------------
  // listRuns — paginated recent runs for this space
  // -----------------------------------------------------------------------
  const listRuns = async ({
    page = 1,
    perPage = 20,
  }: RunListParams = {}): Promise<RunListResult> => {
    try {
      const resp = await esClient.search<EsRunDoc>({
        index: indexName,
        size: perPage,
        from: (page - 1) * perPage,
        sort: [{ created_at: { order: 'desc' } }],
        query: { match_all: {} },
        track_total_hits: true,
        ignore_unavailable: true,
      });

      const total =
        typeof resp.hits.total === 'number' ? resp.hits.total : resp.hits.total?.value ?? 0;

      const runs = resp.hits.hits
        .map((hit) => hit._source)
        .filter((doc): doc is EsRunDoc => doc != null)
        .map(esDocToRun);

      return { runs, total, page, perPage };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.warn(`[CorrelationRuns] listRuns failed: ${msg}`);
      return { runs: [], total: 0, page, perPage };
    }
  };

  // -----------------------------------------------------------------------
  // countActiveRuns — cheap count for the per-space concurrency cap
  // -----------------------------------------------------------------------
  const countActiveRuns = async (): Promise<number> => {
    try {
      const resp = await esClient.count({
        index: indexName,
        query: { terms: { status: ['pending', 'running'] } },
        ignore_unavailable: true,
      });
      return resp.count;
    } catch {
      return 0; // fail open — don't block the user on a count error
    }
  };

  return { createRun, updateRun, getRun, listRuns, countActiveRuns };
};
