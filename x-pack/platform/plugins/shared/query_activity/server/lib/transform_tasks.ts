/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TasksTaskInfo } from '@elastic/elasticsearch/lib/api/types';
import type { RunningQuery, RunningQuerySummary, QueryType } from '../../common/types';

const SEARCH_ACTION_PREFIX = 'indices:data/read/search';
const ESQL_ACTION_PREFIX = 'indices:data/read/esql';
const EQL_ACTION_PREFIX = 'indices:data/read/eql';
const SQL_ACTION_PREFIX = 'indices:data/read/sql';
const MSEARCH_ACTION_PREFIX = 'indices:data/read/msearch';
const ASYNC_SEARCH_ACTION_PREFIX = 'indices:data/read/async_search';

export const QUERY_TASK_ACTIONS = [
  SEARCH_ACTION_PREFIX,
  ESQL_ACTION_PREFIX,
  `${ESQL_ACTION_PREFIX}[a]`,
  EQL_ACTION_PREFIX,
  `${EQL_ACTION_PREFIX}[a]`,
  SQL_ACTION_PREFIX,
  `${SQL_ACTION_PREFIX}[a]`,
  MSEARCH_ACTION_PREFIX,
  `${ASYNC_SEARCH_ACTION_PREFIX}/submit`,
] as const;

const QUERY_TASK_ACTION_SET: ReadonlySet<string> = new Set(QUERY_TASK_ACTIONS);

const INDICES_REGEX = /indices\[([^\]]*)\]/;
const SOURCE_REGEX = /source\[(\{.*\})\]/s;
const ASYNC_PREFIX_REGEX = /^async_search\{(.*)\}$/s;

/**
 * Maps an ES task action string to our QueryType.
 */
export function getQueryType(action: string): QueryType {
  if (action.startsWith(ESQL_ACTION_PREFIX)) {
    return 'ES|QL';
  }
  if (action.startsWith(EQL_ACTION_PREFIX)) {
    return 'EQL';
  }
  if (action.startsWith(SQL_ACTION_PREFIX)) {
    return 'SQL';
  }
  if (action.startsWith(MSEARCH_ACTION_PREFIX)) {
    return 'MSearch';
  }
  if (action.startsWith(ASYNC_SEARCH_ACTION_PREFIX)) {
    return 'Async search';
  }
  if (action.startsWith(SEARCH_ACTION_PREFIX)) {
    return 'DSL';
  }
  return 'Other';
}

/**
 * Extracts the Kibana application name from the X-Opaque-Id header.
 *
 * Format: `<requestId>;kibana:<type>:<name>:<id>[;child...]`
 * e.g. `fb299124;kibana:application:discover:new` → `discover`
 */
export function extractSource(xOpaqueId: string | undefined): string {
  if (!xOpaqueId) return '';

  const parts = xOpaqueId.split(';');
  for (const part of parts) {
    if (part.startsWith('kibana:')) {
      const segments = part.split(':');
      if (segments.length >= 3) {
        try {
          return decodeURIComponent(segments[2]);
        } catch {
          return segments[2];
        }
      }
    }
  }
  return '';
}

/**
 * Capitalises the first letter of a string.
 */
export function capitalise(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Parses a DSL search task description into indices count and query JSON.
 *
 * Description formats:
 * - `indices[idx1,idx2], types[], search_type[QUERY_THEN_FETCH], source[{"query":{...}}]`
 * - `async_search{indices[...], search_type[...], source[{...}], preference[...]}`
 */
export function parseDslDescription(description: string): { indices: number; query: string } {
  const asyncMatch = ASYNC_PREFIX_REGEX.exec(description);
  const normalized = asyncMatch ? asyncMatch[1] : description;

  const indicesMatch = INDICES_REGEX.exec(normalized);
  const indicesCount =
    indicesMatch && indicesMatch[1] ? indicesMatch[1].split(',').filter(Boolean).length : 0;

  const sourceMatch = SOURCE_REGEX.exec(normalized);
  const query = sourceMatch ? sourceMatch[1] : '';

  return { indices: indicesCount, query };
}

/**
 * Parses an ES|QL task description. For ES|QL, the description IS the query text.
 * Extracts indices count from the FROM clause if present.
 */
export function parseEsqlDescription(description: string): { indices: number; query: string } {
  const query = description;

  const fromMatch = /^\s*FROM\s+([^|]+)/i.exec(query);
  const indices = fromMatch ? fromMatch[1].split(',').filter((s) => s.trim().length > 0).length : 0;

  return { indices, query };
}

/**
 * Returns true when a root query task should be shown in Query Activity.
 */
export function isQueryTaskCandidate(task: TasksTaskInfo, thresholdNanos: number): boolean {
  if (task.parent_task_id !== undefined && task.parent_task_id !== null) {
    return false;
  }

  const action = task.action ?? '';
  if (!QUERY_TASK_ACTION_SET.has(action)) {
    return false;
  }

  if ((task.running_time_in_nanos ?? 0) < thresholdNanos) {
    return false;
  }

  return true;
}

const transformTaskSummary = (task: TasksTaskInfo): RunningQuerySummary | undefined => {
  if (task.start_time_in_millis == null) {
    return undefined;
  }

  const action = task.action ?? '';
  const headers = task.headers as Record<string, string> | undefined;
  const xOpaqueId = headers?.['X-Opaque-Id'];

  return {
    taskId: `${task.node}:${task.id}`,
    queryType: getQueryType(action),
    source: capitalise(extractSource(xOpaqueId)),
    startTime: task.start_time_in_millis,
    runningTimeMs: Math.round((task.running_time_in_nanos ?? 0) / 1_000_000),
    cancellable: task.cancellable ?? false,
    cancelled: task.cancelled ?? false,
  };
};

/**
 * Transforms lightweight Elasticsearch task metadata into query activity table rows.
 */
export function transformTaskSummaries(
  tasks: TasksTaskInfo[],
  thresholdNanos: number
): RunningQuerySummary[] {
  const results: RunningQuerySummary[] = [];

  for (const task of tasks) {
    if (!isQueryTaskCandidate(task, thresholdNanos)) {
      continue;
    }

    const summary = transformTaskSummary(task);
    if (summary) {
      results.push(summary);
    }
  }

  return results;
}

/**
 * Transforms a flat list of ES TasksTaskInfo into RunningQuery objects,
 * applying filtering and field extraction.
 */
export function transformTasks(tasks: TasksTaskInfo[], thresholdNanos: number): RunningQuery[] {
  const results: RunningQuery[] = [];

  for (const task of tasks) {
    if (!isQueryTaskCandidate(task, thresholdNanos)) {
      continue;
    }

    const summary = transformTaskSummary(task);
    if (!summary) {
      continue;
    }

    const { queryType } = summary;
    const description = task.description ?? '';
    const headers = task.headers as Record<string, string> | undefined;
    const xOpaqueId = headers?.['X-Opaque-Id'];
    const traceId = headers?.['trace.id'];

    let indices = 0;
    let query = '';

    if (queryType === 'ES|QL') {
      ({ indices, query } = parseEsqlDescription(description));
    } else if (queryType === 'EQL' || queryType === 'SQL') {
      indices = 0;
      query = description;
    } else {
      ({ indices, query } = parseDslDescription(description));
      if (!query && description) {
        query = description;
      }
    }

    results.push({
      ...summary,
      indices,
      query,
      traceId,
      xOpaqueId,
    });
  }

  return results;
}
