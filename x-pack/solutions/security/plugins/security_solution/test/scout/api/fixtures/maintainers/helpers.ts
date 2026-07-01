/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EsClient } from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/api';
import { hashEuid } from '@kbn/entity-store/common/domain/euid';

import {
  ENTITY_STORE_ROUTES,
  HISTORY_INDEX_PATTERN,
  LATEST_ALIAS,
  LATEST_INDEX,
  UPDATES_INDEX,
} from './constants';

/**
 * Polls GET /api/security/entity_store/status?include_components=true until the
 * top-level status is `running` AND every engine's component list shows all
 * resources `installed: true`, or throws on timeout.
 *
 * The plain `running` status flips before engines finish provisioning their
 * backing indices, aliases, templates, and pipelines. Waiting for component-level
 * readiness prevents `index_not_found_exception` races in tests that immediately
 * seed or refresh the latest alias after install.
 *
 * NOTE: `apiServices.entityAnalytics.waitForEntityStoreStatusV2()` checks only
 * the top-level status field, not per-component `installed` flags. This function
 * extends that check with component-level readiness and cannot be replaced by the
 * existing service without modifying the shared package.
 */
export const waitForEntityStoreRunning = async (
  apiClient: MaintainerApiClient,
  headers: Record<string, string>,
  timeoutMs = 60_000
): Promise<void> => {
  const start = Date.now();
  let lastStatus: string | undefined;
  let lastMissing: string[] = [];

  while (Date.now() - start < timeoutMs) {
    const response = await apiClient.get(
      `${ENTITY_STORE_ROUTES.public.STATUS}?include_components=true`,
      { headers, responseType: 'json' }
    );
    const body = response.body as
      | {
          status?: string;
          engines?: Array<{
            type?: string;
            status?: string;
            components?: Array<{ id?: string; installed?: boolean }>;
          }>;
        }
      | undefined;
    lastStatus = body?.status;

    if (lastStatus === 'running') {
      const engines = body?.engines ?? [];
      const missing: string[] = [];
      let allEnginesHaveComponents = engines.length > 0;
      for (const engine of engines) {
        const components = engine.components ?? [];
        if (components.length === 0) {
          allEnginesHaveComponents = false;
          missing.push(`${engine.type}/<no-components-yet>`);
        } else {
          for (const component of components) {
            if (component.installed !== true) {
              missing.push(`${engine.type}/${component.id}`);
            }
          }
        }
      }
      lastMissing = missing;
      if (allEnginesHaveComponents && missing.length === 0) {
        return;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for entity store status=running with all components installed ` +
      `(last status: ${lastStatus}, missing components: ${lastMissing.join(', ') || '<none>'})`
  );
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
 * API client shape required by triggerMaintainerRun.
 * Use this instead of importing Scout's ApiClient type.
 */
export interface MaintainerApiClient {
  get(
    url: string,
    options: {
      headers: Record<string, string>;
      responseType: 'json';
    }
  ): Promise<{ statusCode: number; body: unknown }>;
  post(
    url: string,
    options: {
      headers: Record<string, string>;
      responseType: 'json';
      body: unknown;
    }
  ): Promise<{ statusCode: number; body: unknown }>;
}

interface SeedUserEntityOptions {
  entityId: string;
  namespace: string;
  email: string | string[];
  /** entity.lifecycle.last_seen (the watermark field). Defaults to `timestamp` or now. */
  lastSeen?: string;
  /** entity.lifecycle.first_seen. Defaults to `lastSeen`. */
  firstSeen?: string;
  /** Back-compat alias used when lastSeen/firstSeen are not provided. */
  timestamp?: string;
  /**
   * Written to entity.source. Mirrors how extraction populates the field from
   * event.module / data_stream.dataset (e.g. 'entityanalytics_okta'). Maintainers
   * that filter by entity.source (like the supervises maintainer) will skip
   * entities whose source does not match.
   */
  entitySource?: string;
  /**
   * Optional relationship raw_identifier bag to seed under
   * `entity.relationships.<key>.raw_identifiers.{user.{email,id,name},host.name}`.
   *
   * - `userEmails` / `userIds` / `userNames` → user → user maintainers (supervises, …),
   *   resolved into `<key>.ids` as `user:<value>@<namespace>`.
   * - `hostNames` → user → host maintainers (administers, …), resolved into
   *   `<key>.ids` as a namespace-less `host:<name>`. Use this to seed a USER
   *   actor that points at a HOST target.
   */
  relationship?: {
    /** The relationship key, e.g. 'supervises' | 'administers'. */
    key: string;
    /** Raw user emails placed under raw_identifiers.user.email. */
    userEmails?: string[];
    /** Raw user ids placed under raw_identifiers.user.id. */
    userIds?: string[];
    /** Raw user names placed under raw_identifiers.user.name. */
    userNames?: string[];
    /** Raw host names placed under raw_identifiers.host.name (user → host targets). */
    hostNames?: string[];
  };
}

export const seedUserEntity = async (
  esClient: EsClient,
  {
    entityId,
    namespace,
    email,
    lastSeen,
    firstSeen,
    timestamp,
    entitySource,
    relationship,
  }: SeedUserEntityOptions
) => {
  const last = lastSeen ?? timestamp ?? new Date().toISOString();
  const first = firstSeen ?? last;

  const userBag: Record<string, string[]> = {};
  if (relationship?.userEmails?.length) {
    userBag.email = relationship.userEmails;
  }
  if (relationship?.userIds?.length) {
    userBag.id = relationship.userIds;
  }
  if (relationship?.userNames?.length) {
    userBag.name = relationship.userNames;
  }
  const rawIdentifiers: Record<string, unknown> = {};
  if (Object.keys(userBag).length > 0) {
    rawIdentifiers.user = userBag;
  }
  if (relationship?.hostNames?.length) {
    rawIdentifiers.host = { name: relationship.hostNames };
  }
  const relationships =
    relationship && Object.keys(rawIdentifiers).length > 0
      ? { [relationship.key]: { raw_identifiers: rawIdentifiers } }
      : undefined;

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
        ...(entitySource && { source: entitySource }),
        lifecycle: {
          first_seen: first,
          last_seen: last,
        },
        ...(relationships && { relationships }),
      },
      user: {
        email,
        name: entityId,
      },
      '@timestamp': last,
    },
  });
};

interface SeedHostEntityOptions {
  entityId: string;
  /** Host FQDN written to host.name (the entity's identity under the host EUID ranking). */
  hostName: string;
  /**
   * Optional relationship raw_identifier bag to seed under
   * `entity.relationships.<relationshipKey>.raw_identifiers.host.name`. A
   * raw_identifiers-based maintainer (administers, depends_on, supervises, …)
   * resolves these into `<relationshipKey>.ids` as `host:<name>`.
   */
  relationship?: {
    /** The relationship key, e.g. 'administers' | 'depends_on' | 'supervises'. */
    key: string;
    /** Raw host names placed under raw_identifiers.host.name. */
    hostNames: string[];
  };
  /** entity.lifecycle.last_seen (the watermark field). Defaults to now. */
  lastSeen?: string;
  /** entity.lifecycle.first_seen. Defaults to lastSeen (or now). */
  firstSeen?: string;
  /**
   * Written to entity.source. Mirrors how extraction populates the field from
   * event.module / data_stream.dataset (e.g. 'entityanalytics_ad'). Maintainers
   * that filter by entity.source (like the administers maintainer) will skip
   * entities whose source does not match.
   */
  entitySource?: string;
}

export const seedHostEntity = async (
  esClient: EsClient,
  { entityId, hostName, relationship, lastSeen, firstSeen, entitySource }: SeedHostEntityOptions
) => {
  const last = lastSeen ?? new Date().toISOString();
  const first = firstSeen ?? last;
  const relationships =
    relationship && relationship.hostNames.length > 0
      ? { [relationship.key]: { raw_identifiers: { host: { name: relationship.hostNames } } } }
      : undefined;

  await esClient.index({
    index: LATEST_ALIAS,
    id: hashEuid(entityId),
    refresh: 'wait_for',
    pipeline: '_none',
    body: {
      entity: {
        id: entityId,
        name: hostName,
        EngineMetadata: { Type: 'host' },
        ...(entitySource && { source: entitySource }),
        lifecycle: {
          first_seen: first,
          last_seen: last,
        },
        ...(relationships && { relationships }),
      },
      host: {
        name: hostName,
      },
      '@timestamp': last,
    },
  });
};

const relationshipIdsPath = (relationshipKey: string): string =>
  `entity.relationships.${relationshipKey}.ids`;

const normalizeKeywordList = (value: unknown): string[] => {
  if (value == null) {
    return [];
  }
  return Array.isArray(value) ? value.map((v) => String(v)) : [String(value)];
};

const getNestedValue = (obj: Record<string, unknown>, path: string): unknown =>
  path.split('.').reduce<unknown>((current, key) => {
    if (current != null && typeof current === 'object') {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);

/**
 * Polls until an entity's `<relationshipKey>.ids` contains the expected target
 * EUID, or throws on timeout. Tolerates per-iteration transient ES errors (e.g.
 * `already_closed_exception` during fresh-engine replica settling).
 * Callers use `triggerMaintainerRun(..., { sync: true })` so the task has
 * already settled — the poll window absorbs ES refresh lag only.
 */
export const waitForRelationshipIds = async (
  esClient: EsClient,
  relationshipKey: string,
  entityId: string,
  expectedTargetId: string,
  timeoutMs = 60_000
): Promise<Record<string, unknown>> => {
  const idsPath = relationshipIdsPath(relationshipKey);
  const start = Date.now();
  let lastError: unknown;

  while (Date.now() - start < timeoutMs) {
    try {
      await esClient.indices.refresh({ index: LATEST_ALIAS });
      const response = await esClient.search({
        index: LATEST_ALIAS,
        query: { bool: { filter: [{ term: { 'entity.id': entityId } }] } },
        size: 1,
      });
      const source = response.hits.hits[0]?._source as Record<string, unknown> | undefined;
      if (source) {
        const ids = normalizeKeywordList(getNestedValue(source, idsPath) ?? source[idsPath]);
        if (ids.includes(expectedTargetId)) {
          return source;
        }
      }
    } catch (e) {
      lastError = e;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const lastErrorMsg = lastError instanceof Error ? lastError.message : String(lastError ?? '');
  const errorSuffix = lastErrorMsg ? ` (last error: ${lastErrorMsg})` : '';
  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for '${idsPath}' on entity '${entityId}' to contain '${expectedTargetId}'${errorSuffix}`
  );
};

/**
 * Reads the current `<relationshipKey>.ids` array for an entity after a
 * synchronous maintainer run. Refreshes the alias first to ensure the latest
 * write is visible, then returns the IDs (empty array if absent).
 *
 * Use this for assertions that need the complete set of written IDs
 * (e.g. "exactly these two targets, and no phantom ones").
 */
export const getRelationshipIds = async (
  esClient: EsClient,
  relationshipKey: string,
  entityId: string
): Promise<string[]> => {
  await esClient.indices.refresh({ index: LATEST_ALIAS });
  const response = await esClient.search({
    index: LATEST_ALIAS,
    query: { bool: { filter: [{ term: { 'entity.id': entityId } }] } },
    size: 1,
  });
  const source = response.hits.hits[0]?._source as Record<string, unknown> | undefined;
  if (!source) return [];
  const idsPath = relationshipIdsPath(relationshipKey);
  return normalizeKeywordList(getNestedValue(source, idsPath) ?? source[idsPath]);
};

/**
 * Asserts that an entity's `<relationshipKey>.ids` does NOT contain the given
 * target. Callers use `triggerMaintainerRun(..., { sync: true })` so the task
 * has already settled — poll with a short window to absorb ES refresh lag.
 */
export const assertNoRelationshipId = async (
  esClient: EsClient,
  relationshipKey: string,
  entityId: string,
  unexpectedTargetId: string
): Promise<void> => {
  const idsPath = relationshipIdsPath(relationshipKey);
  await expect
    .poll(
      async () => {
        await esClient.indices.refresh({ index: LATEST_ALIAS });
        const response = await esClient.search({
          index: LATEST_ALIAS,
          query: { bool: { filter: [{ term: { 'entity.id': entityId } }] } },
          size: 1,
        });
        const source = response.hits.hits[0]?._source as Record<string, unknown> | undefined;
        return source
          ? normalizeKeywordList(getNestedValue(source, idsPath) ?? source[idsPath])
          : [];
      },
      { timeout: 10_000, intervals: [200] }
    )
    .not.toContain(unexpectedTargetId);
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
  apiClient: MaintainerApiClient,
  headers: Record<string, string>,
  maintainerId = 'automated-resolution',
  { maxRetries = 5, retryDelayMs = 1000, sync = false } = {}
) => {
  // Use `sync: true` in tests that need a settled watermark before proceeding.
  const runUrl = sync
    ? `${ENTITY_STORE_ROUTES.internal.ENTITY_MAINTAINERS_RUN(maintainerId)}?sync=true`
    : ENTITY_STORE_ROUTES.internal.ENTITY_MAINTAINERS_RUN(maintainerId);

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

    if (response.statusCode !== 500 || attempt >= maxRetries) {
      throw new Error(`Failed to trigger maintainer run '${maintainerId}': ${body}`);
    }

    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }
};
