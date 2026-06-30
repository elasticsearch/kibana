/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EsClient } from '@kbn/scout-security';
import type { apiTest } from '@kbn/scout-security';
import type { EntityStoreStatusResponseBody } from '../../../../server/routes/apis/status';
import { hashEuid } from '../../../../common/domain/euid';
import type { EntityType } from '../../../../common';

import {
  ENTITY_STORE_ROUTES,
  HISTORY_INDEX_PATTERN,
  LATEST_ALIAS,
  LATEST_INDEX,
  UPDATES_INDEX,
} from './constants';

type ApiWorkerFixtures = Parameters<Parameters<typeof apiTest>[2]>[0];
type ApiClientFixture = ApiWorkerFixtures['apiClient'];
type ApiClientResponse = Awaited<ReturnType<ApiClientFixture['get']>>; // ApiClientResponse is the same for all methods
/**
 * Normalizes values that may be stored as a single keyword or as keyword[] after
 * log extraction (e.g. `entity.relationships.*` bags).
 */
export const normalizeKeywordList = (value: unknown): string[] => {
  if (value == null) {
    return [];
  }
  return Array.isArray(value) ? value.map((v) => String(v)) : [String(value)];
};

/**
 * Deletes all Entity Store data indices: latest, updates, and history snapshots.
 * Call in afterAll / afterEach to prevent stale data from leaking between
 * sequential test-target runs that share the same ES cluster.
 */
export const clearEntityStoreIndices = async (esClient: EsClient) => {
  const resolved = await esClient.indices.resolveIndex({ name: HISTORY_INDEX_PATTERN });
  const historyIndices = resolved.indices.map((i) => i.name);

  const toDelete = [LATEST_INDEX, UPDATES_INDEX, ...historyIndices];
  await esClient.indices.delete({ index: toDelete, ignore_unavailable: true }, { ignore: [404] });
};

/**
 * API client shape required by forceUserExtraction.
 * Use this instead of importing Scout's ApiClient type.
 */
export interface ForceLogExtractionApiClient {
  post(
    url: string,
    options: {
      headers: Record<string, string>;
      responseType: 'json';
      body: unknown;
    }
  ): Promise<{ statusCode: number; body: unknown }>;
}

export const ingestDoc = async (esClient: EsClient, body: Record<string, unknown>) =>
  esClient.index({
    index: UPDATES_INDEX,
    refresh: 'wait_for',
    body,
  });

export const searchDocById = async (esClient: EsClient, id: string) => {
  await esClient.indices.refresh({ index: LATEST_ALIAS });
  return await esClient.search({
    index: LATEST_ALIAS,
    version: true,
    query: {
      bool: {
        filter: {
          term: { 'entity.id': id },
        },
      },
    },
    size: 2,
  });
};

interface SeedUserEntityOptions {
  entityId: string;
  namespace: string;
  email: string | string[];
  timestamp?: string;
}

/**
 * Seeds a user entity directly into the LATEST index with nested document
 * structure. Uses `pipeline: '_none'` to bypass the index's default ingest
 * pipeline (which may not exist in test environments).
 *
 * Uses esClient.index() instead of the CRUD API because the CRUD API nests
 * `entity` under `user.entity`, breaking automated resolution queries that
 * expect `entity.id` at the document root.
 */
export const seedUserEntity = async (
  esClient: EsClient,
  { entityId, namespace, email, timestamp }: SeedUserEntityOptions
) => {
  const ts = timestamp ?? new Date().toISOString();
  await esClient.index({
    index: LATEST_ALIAS,
    id: hashEuid(entityId),
    refresh: 'wait_for',
    pipeline: '_none',
    body: {
      entity: {
        id: entityId,
        name: entityId,
        EngineMetadata: { Type: 'user' },
        namespace,
        lifecycle: {
          first_seen: ts,
          last_seen: ts,
        },
      },
      user: {
        email,
        name: entityId,
      },
      '@timestamp': ts,
    },
  });
};

const RESOLVED_TO_PATH = 'entity.relationships.resolution.resolved_to';

/**
 * Polls the LATEST index until an entity's `resolved_to` field matches the
 * expected target, or until timeout. Returns the matching `_source`.
 */
export const waitForResolution = async (
  esClient: EsClient,
  entityId: string,
  expectedTarget: string,
  timeoutMs = 30_000
): Promise<Record<string, unknown>> => {
  const start = Date.now();
  let lastSource: Record<string, unknown> | undefined;

  while (Date.now() - start < timeoutMs) {
    await esClient.indices.refresh({ index: LATEST_ALIAS });
    const response = await esClient.search({
      index: LATEST_ALIAS,
      query: { bool: { filter: [{ term: { 'entity.id': entityId } }] } },
      size: 1,
    });

    const source = response.hits.hits[0]?._source as Record<string, unknown> | undefined;
    lastSource = source;
    if (source) {
      // Check both nested path and flat dotted key (ES update stores as flat key)
      const resolvedTo = getNestedValue(source, RESOLVED_TO_PATH) ?? source[RESOLVED_TO_PATH];
      if (resolvedTo === expectedTarget) {
        return source;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  // eslint-disable-next-line no-console
  console.log(
    `[DEBUG] waitForResolution timeout for '${entityId}'. Last _source:`,
    JSON.stringify(lastSource, null, 2)
  );

  throw new Error(
    `Timed out waiting for entity '${entityId}' to resolve to '${expectedTarget}' after ${timeoutMs}ms`
  );
};

/**
 * Polls the LATEST index and asserts that an entity does NOT gain a
 * `resolved_to` value within the given timeout (shorter default for negative tests).
 */
export const assertNotResolved = async (
  esClient: EsClient,
  entityId: string,
  timeoutMs = 10_000
): Promise<void> => {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    await esClient.indices.refresh({ index: LATEST_ALIAS });
    const response = await esClient.search({
      index: LATEST_ALIAS,
      query: { bool: { filter: [{ term: { 'entity.id': entityId } }] } },
      size: 1,
    });

    const source = response.hits.hits[0]?._source as Record<string, unknown> | undefined;
    if (source) {
      // Check both nested path and flat dotted key (ES update stores as flat key)
      const resolvedTo = getNestedValue(source, RESOLVED_TO_PATH) ?? source[RESOLVED_TO_PATH];
      if (resolvedTo != null) {
        throw new Error(
          `Entity '${entityId}' unexpectedly resolved to '${resolvedTo}' — expected it to stay unresolved`
        );
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }
};

/**
 * Triggers a maintainer run by calling the async `run/{id}` endpoint.
 * The route calls `taskManager.runSoon()` — it does NOT wait for completion.
 *
 * Retries on 500 errors, which happen when the scheduler fires an automatic
 * run that overlaps with the manual trigger. Kibana wraps the actual
 * "currently running" error in a generic 500 body, so we retry on any 500.
 */
export const triggerMaintainerRun = async (
  apiClient: ForceLogExtractionApiClient,
  headers: Record<string, string>,
  maintainerId = 'automated-resolution',
  { maxRetries = 5, retryDelayMs = 2000, sync = false } = {}
) => {
  // Use `sync: true` in tests that need a settled watermark before proceeding.
  const runUrl = `${ENTITY_STORE_ROUTES.internal.ENTITY_MAINTAINERS_RUN(
    maintainerId
  )}?sync=${sync}`;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await apiClient.post(runUrl, {
      headers,
      responseType: 'json',
      body: {},
    });

    if (response.statusCode === 200) {
      return response;
    }

    const body = JSON.stringify(response.body);

    if (response.statusCode === 500 && attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      continue;
    }

    throw new Error(`Failed to trigger maintainer run '${maintainerId}': ${body}`);
  }
};

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (current != null && typeof current === 'object') {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export const forceLogExtraction = async (
  apiClient: ForceLogExtractionApiClient,
  headers: Record<string, string>,
  entityType: EntityType,
  fromDateISO: string,
  toDateISO: string
) =>
  await apiClient.post(ENTITY_STORE_ROUTES.internal.FORCE_LOG_EXTRACTION(entityType), {
    headers,
    responseType: 'json',
    body: { fromDateISO, toDateISO },
  });

export const installAllEntityTypes = (
  apiClient: ApiClientFixture,
  headers: Record<string, string>
) =>
  apiClient.post(ENTITY_STORE_ROUTES.public.INSTALL, {
    headers,
    responseType: 'json',
    body: {},
  });

export const uninstallAllEntityTypes = (
  apiClient: ApiClientFixture,
  headers: Record<string, string>
) =>
  apiClient.post(ENTITY_STORE_ROUTES.public.UNINSTALL, {
    headers,
    responseType: 'json',
    body: {},
  });

export const getStatus = (
  apiClient: ApiClientFixture,
  headers: Record<string, string>,
  { includeComponents = false } = {}
): Promise<Omit<ApiClientResponse, 'body'> & { body: EntityStoreStatusResponseBody }> =>
  apiClient.get(
    includeComponents
      ? `${ENTITY_STORE_ROUTES.public.STATUS}?include_components=true`
      : ENTITY_STORE_ROUTES.public.STATUS,
    {
      headers,
      responseType: 'json',
    }
  );

export const startEntityTypes = (
  apiClient: ApiClientFixture,
  headers: Record<string, string>,
  entityTypes: EntityType[]
) =>
  apiClient.put(ENTITY_STORE_ROUTES.public.START, {
    headers,
    responseType: 'json',
    body: { entityTypes },
  });

export const stopEntityTypes = (
  apiClient: ApiClientFixture,
  headers: Record<string, string>,
  entityTypes: EntityType[]
) =>
  apiClient.put(ENTITY_STORE_ROUTES.public.STOP, {
    headers,
    responseType: 'json',
    body: { entityTypes },
  });

export const startAllEntityTypes = (apiClient: ApiClientFixture, headers: Record<string, string>) =>
  apiClient.put(ENTITY_STORE_ROUTES.public.START, {
    headers,
    responseType: 'json',
    body: {},
  });

export const stopAllEntityTypes = (apiClient: ApiClientFixture, headers: Record<string, string>) =>
  apiClient.put(ENTITY_STORE_ROUTES.public.STOP, {
    headers,
    responseType: 'json',
    body: {},
  });
