/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { TransportRequestOptions } from '@elastic/elasticsearch';
import type {
  IndexName,
  QueryDslQueryContainer,
  UpdateByQueryResponse,
} from '@elastic/elasticsearch/lib/api/types';
import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import type { ESQLSearchResponse } from '@kbn/es-types';
import { waitForTaskToComplete } from './wait_for_task';
import type { WaitForTaskOptions } from './wait_for_task';

const BATCH_SIZE = 5 * 1024 * 1024; // 5MB
const RETRY_ON_CONFLICT = 3;

export interface UpdateByQueryWithScriptOptions {
  index: IndexName;
  query: QueryDslQueryContainer;
  script: string;
  params: Record<string, unknown>;
  signal?: AbortSignal;
  waitForTask?: Omit<WaitForTaskOptions, 'esClient' | 'taskId' | 'signal'>;
}

export const updateByQueryWithScript = async (
  esClient: ElasticsearchClient,
  options: UpdateByQueryWithScriptOptions
): Promise<{ updated: number; total: number }> => {
  const { index, query, script, params, signal, waitForTask } = options;
  const body = {
    index,
    query,
    refresh: true,
    // Uses conflicts: 'proceed' so Elasticsearch continues on version conflicts.
    // Conflicted documents are not updated.
    conflicts: 'proceed' as const,
    wait_for_completion: waitForTask === undefined,
    script: {
      source: script,
      lang: 'painless' as const,
      params,
    },
  };

  if (waitForTask !== undefined) {
    const { task } = await esClient.updateByQuery(body, { signal });
    if (task == null) {
      throw new Error('updateByQuery did not return a task id');
    }
    const response = await waitForTaskToComplete<UpdateByQueryResponse>({
      ...waitForTask,
      esClient,
      taskId: task,
      signal,
    });
    return { updated: response.updated ?? 0, total: response.total ?? 0 };
  }

  const response = await esClient.updateByQuery(body, { signal });
  return { updated: response.updated ?? 0, total: response.total ?? 0 };
};

export type IngestEntitiesTransformDocument = (
  doc: Record<string, unknown>
) => Record<string, unknown>;

interface IngestEntitiesParams {
  esClient: ElasticsearchClient;
  esqlResponse: ESQLSearchResponse;
  /** When provided, documents are upserted by this field as _id. When omitted, bulk create is used and Elasticsearch generates IDs. */
  esIdField?: string;
  targetIndex: string;
  logger: Logger;
  abortController?: AbortController;
  fieldsToIgnore?: string[];
  /** Optional transform applied to each document before indexing (e.g. add @timestamp, reshape for entity type). */
  transformDocument?: IngestEntitiesTransformDocument;
  /** Use `false` when downstream consumers tolerate the 1 s natural refresh window (e.g. CCS updates data stream). Use `true` when same-run visibility is required (e.g. LOOKUP JOIN on the latest index). */
  refresh: boolean | 'wait_for';
  /** Called once per document rejected by the ES bulk API. Use to increment an external dropped-docs counter. */
  onDropped?: () => void;
}

/**
 * Stores entity store documents from columnar ESQL response format using streaming bulk API.
 * It processes documents one at a time via a generator,
 * avoiding building the entire body array in memory.
 *
 * Uses helpers.bulk with a generator datasource:
 * - Processes one row at a time (minimal memory footprint)
 * - Automatic batching via flushBytes (default 5MB)
 * - No intermediate arrays or full document collections in memory
 *
 * When esIdField is provided: uses update with doc_as_upsert (upsert by _id).
 * When esIdField is omitted: uses create and Elasticsearch auto-generates _id.
 */
export async function ingestEntities({
  esClient,
  esqlResponse,
  esIdField,
  targetIndex,
  logger,
  abortController,
  fieldsToIgnore,
  transformDocument,
  refresh,
  onDropped,
}: IngestEntitiesParams) {
  const options: TransportRequestOptions = {};
  if (abortController?.signal) {
    options.signal = abortController.signal;
  }

  const { columns, values } = esqlResponse;
  if (values.length === 0) return;

  const useUpsertById = esIdField !== undefined;
  let identityFieldIndex = -1;
  if (useUpsertById) {
    identityFieldIndex = columns.findIndex((col) => col.name === esIdField);
    if (identityFieldIndex === -1) {
      throw new Error(`Identity field "${esIdField}" not found in ESQL response columns`);
    }
  }

  const ignoreSet = new Set(fieldsToIgnore ?? []);

  const columnNameSet = new Set(columns.map((col) => col.name));
  const isMultiFieldSubField = (name: string): boolean => {
    const lastDot = name.lastIndexOf('.');
    return lastDot !== -1 && columnNameSet.has(name.substring(0, lastDot));
  };

  const columnMeta = columns.map((col) => ({
    name: col.name,
    skip:
      (useUpsertById && col.name === esIdField) ||
      ignoreSet.has(col.name) ||
      isMultiFieldSubField(col.name),
    isIdField: useUpsertById && col.name === esIdField,
  }));

  // Generator function that yields documents one at a time from columnar format
  async function* documentGenerator() {
    for (const row of values) {
      const doc: Record<string, unknown> = {};
      for (let i = 0; i < row.length; i++) {
        const { name, skip } = columnMeta[i];
        if (!skip && row[i] !== null) doc[name] = row[i];
      }

      const finalDoc = transformDocument ? transformDocument(doc) : doc;
      if (useUpsertById) {
        yield { _id: row[identityFieldIndex] as string, ...finalDoc };
      } else {
        yield finalDoc;
      }
    }
  }

  await esClient.helpers.bulk(
    {
      datasource: documentGenerator(),
      index: targetIndex,
      refresh,
      flushBytes: BATCH_SIZE,
      concurrency: 1,
      retries: 2,
      onDocument: (doc) => {
        if (useUpsertById) {
          const { _id, ...document } = doc as { _id: string; [k: string]: unknown };
          return [
            {
              update: {
                _index: targetIndex,
                _id,
                retry_on_conflict: RETRY_ON_CONFLICT,
              },
            },
            { doc: document, doc_as_upsert: true },
          ];
        }
        return [{ create: {} }, doc];
      },
      onDrop: (dropped) => {
        const errorReason = dropped.error?.reason || 'unknown error';
        logger.error(`entity dropped from bulk operation (reason: ${errorReason})`);
        onDropped?.();
      },
    },
    options
  );
}
