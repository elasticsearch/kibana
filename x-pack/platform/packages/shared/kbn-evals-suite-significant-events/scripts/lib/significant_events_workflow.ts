/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import type {
  MappingTypeMapping,
  QueryDslQueryContainer,
} from '@elastic/elasticsearch/lib/api/types';
import type { ToolingLog } from '@kbn/tooling-log';
import type { Discovery, Feature } from '@kbn/significant-events-schema';
import { KIsOnboardingStep } from '@kbn/significant-events-schema';
import {
  SIGNIFICANT_EVENTS_DISCOVERY_INFERENCE_FEATURE_ID,
  SIGNIFICANT_EVENTS_KI_EXTRACTION_INFERENCE_FEATURE_ID,
  SIGNIFICANT_EVENTS_KI_QUERY_GENERATION_INFERENCE_FEATURE_ID,
} from '@kbn/significant-events-schema';
import type { ConnectionConfig } from './get_connection_config';
import { kibanaRequest } from './kibana';
import { withTempSuperuser } from './user_utils';
import {
  KI_FEATURE_EXTRACTION_POLL_INTERVAL_MS,
  KI_FEATURE_EXTRACTION_TIMEOUT_MS,
  DISCOVERY_POLL_INTERVAL_MS,
  DISCOVERY_TIMEOUT_MS,
  DEFAULT_LOGS_INDEX,
} from './constants';
import {
  getSnapshotKIFeaturesIndex,
  getSnapshotDiscoveriesIndex,
  getSnapshotDetectionsIndex,
  getSnapshotKnowledgeIndicatorsIndex,
  KNOWLEDGE_INDICATORS_DATA_STREAM,
  FEATURES_TEMP_INDEX_PATTERN,
  DISCOVERIES_TEMP_INDEX_PATTERN,
  DETECTIONS_TEMP_INDEX_PATTERN,
  DISCOVERIES_DATA_STREAM,
  DETECTIONS_DATA_STREAM,
  EVENTS_DATA_STREAM,
  KNOWLEDGE_INDICATORS_TEMP_INDEX_PATTERN,
} from '../../src/data_generators/snapshot_indices';

const RAW_DATA_STREAM_SEARCH_LIMIT = 1000;

/**
 * Features snapshot mapping. `dynamic: false` with `properties`/`meta` as `enabled: false` keeps
 * the index lean and prevents mapping explosions from those free-form objects; `stream_name` is a
 * keyword for per-stream filtering. Not reused from `knowledgeIndicatorsMappings` because features
 * arrive flattened from the features API, not in the raw KI shape that mapping describes.
 */
const FEATURES_SNAPSHOT_MAPPING: MappingTypeMapping = {
  dynamic: false,
  properties: {
    id: { type: 'keyword' },
    stream_name: { type: 'keyword' },
    type: { type: 'keyword' },
    subtype: { type: 'keyword' },
    title: { type: 'keyword' },
    description: { type: 'text' },
    properties: { type: 'object', enabled: false },
    confidence: { type: 'float' },
    evidence: { type: 'keyword' },
    tags: { type: 'keyword' },
    meta: { type: 'object', enabled: false },
    expires_at: { type: 'date' },
  },
};

export async function enableSignificantEvents(
  config: ConnectionConfig,
  log: ToolingLog
): Promise<void> {
  log.info('Enabling significant events...');
  const { status, data } = await kibanaRequest(
    config,
    'POST',
    '/api/kibana/settings/observability:streamsEnableSignificantEvents',
    { value: true }
  );

  if (status >= 200 && status < 300) {
    log.info('Significant events enabled');
    return;
  }

  // If the setting is overridden in kibana.yml, skip and return
  const message = (data as Record<string, unknown>)?.message;
  if (status === 400 && typeof message === 'string' && message.includes('overridden')) {
    log.info('Significant events setting is overridden in kibana.yml — skipping');
    return;
  }

  throw new Error(`Failed to enable significant events: ${status} ${JSON.stringify(data)}`);
}

export async function configureModelSelectionSettings(
  config: ConnectionConfig,
  log: ToolingLog,
  connectorId: string
): Promise<void> {
  log.info(`Configuring model override via inference settings (connector: ${connectorId})...`);
  const { status, data } = await kibanaRequest(
    config,
    'PUT',
    '/internal/search_inference_endpoints/settings',
    {
      features: [
        {
          feature_id: SIGNIFICANT_EVENTS_KI_EXTRACTION_INFERENCE_FEATURE_ID,
          endpoints: [{ id: connectorId }],
        },
        {
          feature_id: SIGNIFICANT_EVENTS_KI_QUERY_GENERATION_INFERENCE_FEATURE_ID,
          endpoints: [{ id: connectorId }],
        },
        {
          feature_id: SIGNIFICANT_EVENTS_DISCOVERY_INFERENCE_FEATURE_ID,
          endpoints: [{ id: connectorId }],
        },
      ],
    }
  );

  if (status >= 200 && status < 300) {
    log.info('Model selection settings configured via inference settings');
    return;
  }

  throw new Error(`Failed to configure inference settings: ${status} ${JSON.stringify(data)}`);
}
export async function triggerKIExtraction(
  config: ConnectionConfig,
  log: ToolingLog,
  streamName: string = DEFAULT_LOGS_INDEX,
  steps: KIsOnboardingStep[] = [KIsOnboardingStep.FeaturesIdentification]
): Promise<void> {
  log.info(`Triggering KI onboarding (${steps.join(', ')}) on stream ${streamName}...`);

  const now = Date.now();
  const { status, data } = await kibanaRequest(
    config,
    'POST',
    `/internal/streams/${streamName}/onboarding/_execute`,
    {
      action: 'schedule',
      from: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
      to: new Date(now).toISOString(),
      steps,
    }
  );

  if (status >= 200 && status < 300) {
    log.info('Scheduled the onboarding workflow successfully');
    return;
  }

  throw new Error(`Failed to trigger KI onboarding: ${status} ${JSON.stringify(data)}`);
}

export async function waitForKIExtraction(
  config: ConnectionConfig,
  log: ToolingLog,
  streamName: string = DEFAULT_LOGS_INDEX,
  timeoutMs: number = KI_FEATURE_EXTRACTION_TIMEOUT_MS
): Promise<void> {
  log.info(`Polling onboarding status for KI extraction (timeout ${timeoutMs / 1000}s)...`);
  const start = Date.now();
  const deadline = start + timeoutMs;

  while (Date.now() < deadline) {
    const { data } = await kibanaRequest(
      config,
      'GET',
      `/internal/streams/${streamName}/onboarding/_status`
    );

    const taskStatus = (data as Record<string, unknown>)?.status;

    if (taskStatus === 'completed') {
      log.info('Feature extraction completed successfully');
      return;
    }

    if (taskStatus === 'failed') {
      throw new Error(
        `KI extraction failed: ${JSON.stringify((data as Record<string, unknown>)?.error)}`
      );
    }

    const elapsed = Math.round((Date.now() - start) / 1000);
    log.info(`  KI extraction status: ${taskStatus} (${elapsed}s elapsed)`);
    await new Promise((resolve) => setTimeout(resolve, KI_FEATURE_EXTRACTION_POLL_INTERVAL_MS));
  }

  throw new Error(
    `KI extraction did not complete within ${timeoutMs / 1000}s. ` +
      `Increase --extraction-timeout if the model/data volume needs longer.`
  );
}

export async function logExtractedKIFeatures(
  config: ConnectionConfig,
  log: ToolingLog,
  streamName: string = DEFAULT_LOGS_INDEX
): Promise<void> {
  const kis = await fetchKIFeatures(config, log, streamName);
  log.info(`Extracted ${kis.length} KIs:`);
  for (const f of kis) {
    log.info(`  - ${f.title || f.description} (${f.type})`);
  }
}

async function fetchKIFeatures(
  config: ConnectionConfig,
  log: ToolingLog,
  streamName: string
): Promise<Feature[]> {
  const { data } = await kibanaRequest(config, 'GET', `/internal/streams/${streamName}/features`);
  const features = (data as Record<string, unknown>)?.features;
  if (!Array.isArray(features)) {
    throw new Error(`Expected "features" array from Kibana, got: ${JSON.stringify(data)}`);
  }
  return features.filter(Boolean) as Feature[];
}

export async function persistKIFeaturesForSnapshot(
  config: ConnectionConfig,
  esClient: Client,
  log: ToolingLog,
  snapshotName: string,
  streamName: string = DEFAULT_LOGS_INDEX
): Promise<{ index: string; count: number }> {
  const features = await fetchKIFeatures(config, log, streamName);
  return persistDocsForSnapshot(
    esClient,
    log,
    getSnapshotKIFeaturesIndex(snapshotName),
    features as unknown as Array<Record<string, unknown>>,
    'id',
    'feature KI(s)',
    FEATURES_SNAPSHOT_MAPPING
  );
}

export async function persistDetectionsForSnapshot(
  config: ConnectionConfig,
  esClient: Client,
  log: ToolingLog,
  snapshotName: string
): Promise<{ index: string; count: number }> {
  const detectionDocs = await withTempSuperuser(esClient, log, config, (sysClient) =>
    readRawDataStreamDocs(sysClient, DETECTIONS_DATA_STREAM, { match_all: {} }, 'detection(s)')
  );

  return persistDocsForSnapshot(
    esClient,
    log,
    getSnapshotDetectionsIndex(snapshotName),
    detectionDocs,
    undefined,
    'detection(s)'
  );
}

export async function persistKnowledgeIndicatorsForSnapshot(
  config: ConnectionConfig,
  esClient: Client,
  log: ToolingLog,
  snapshotName: string,
  streamName: string = DEFAULT_LOGS_INDEX
): Promise<{ index: string; count: number }> {
  const kiDocs = await withTempSuperuser(esClient, log, config, (sysClient) =>
    readRawDataStreamDocs(
      sysClient,
      KNOWLEDGE_INDICATORS_DATA_STREAM,
      { term: { 'stream.name': streamName } },
      'knowledge indicator(s)'
    )
  );

  return persistDocsForSnapshot(
    esClient,
    log,
    getSnapshotKnowledgeIndicatorsIndex(snapshotName),
    kiDocs,
    'id',
    'knowledge indicator(s)'
  );
}

export async function persistDiscoveriesForSnapshot(
  config: ConnectionConfig,
  esClient: Client,
  log: ToolingLog,
  snapshotName: string
): Promise<{ index: string; count: number }> {
  const discoveries = await fetchAllPaginated<Discovery>(
    config,
    '/internal/significant_events/discoveries',
    'discoveries'
  );
  return persistDocsForSnapshot(
    esClient,
    log,
    getSnapshotDiscoveriesIndex(snapshotName),
    discoveries as unknown as Array<Record<string, unknown>>,
    'discovery_id',
    'discovery(s)'
  );
}

export async function cleanupExtractedData(esClient: Client, log: ToolingLog): Promise<void> {
  log.info('Cleaning up ES data...');

  const dataStreamTargets = [
    'logs*',
    KNOWLEDGE_INDICATORS_DATA_STREAM,
    DISCOVERIES_DATA_STREAM,
    DETECTIONS_DATA_STREAM,
    EVENTS_DATA_STREAM,
  ];
  const indexTargets = [
    FEATURES_TEMP_INDEX_PATTERN,
    DISCOVERIES_TEMP_INDEX_PATTERN,
    DETECTIONS_TEMP_INDEX_PATTERN,
    KNOWLEDGE_INDICATORS_TEMP_INDEX_PATTERN,
  ];

  for (const name of dataStreamTargets) {
    await esClient.indices.deleteDataStream({ name }).catch(() => {});
  }
  for (const index of indexTargets) {
    await esClient.indices.delete({ index, ignore_unavailable: true }).catch(() => {});
  }
}

export async function disableStreams(config: ConnectionConfig, log: ToolingLog): Promise<void> {
  log.info('Disabling streams...');
  const { status } = await kibanaRequest(config, 'POST', '/api/streams/_disable');

  if (status < 200 || status >= 300) {
    log.warning(`Failed to disable streams (status ${status}), continuing...`);
  }
}

export async function enableLogsNativeStream(
  esClient: Client,
  log: ToolingLog,
  logsStream: string = DEFAULT_LOGS_INDEX
): Promise<void> {
  try {
    await esClient.transport.request({ method: 'POST', path: `_streams/${logsStream}/_enable` });
    log.info(`ES native "${logsStream}" stream enabled`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('already enabled') || message.includes('resource_already_exists')) {
      log.info(`ES native "${logsStream}" stream already enabled`);
      return;
    }
    throw err;
  }
}

export async function promoteQueries(config: ConnectionConfig): Promise<void> {
  const { status, data } = await kibanaRequest(
    config,
    'POST',
    '/internal/streams/queries/_promote'
  );
  if (status < 200 || status >= 300) {
    throw new Error(`Failed to promote queries: ${status} ${JSON.stringify(data)}`);
  }
}

export async function resetQueriesPromotion({ esClient }: { esClient: Client }): Promise<void> {
  await esClient.updateByQuery({
    index: KNOWLEDGE_INDICATORS_DATA_STREAM,
    conflicts: 'proceed',
    refresh: true,
    query: { term: { type: 'query' } },
    script: {
      lang: 'painless',
      source: `if (ctx._source.query != null) { ctx._source.query.rule_backed = false; }`,
    },
  });
}

export async function triggerDiscovery(config: ConnectionConfig, log: ToolingLog): Promise<void> {
  log.info('Triggering significant events discovery...');
  const { status, data } = await kibanaRequest(
    config,
    'POST',
    '/internal/streams/significant_events/discovery/_execute',
    { action: 'trigger' }
  );

  if (status >= 200 && status < 300) {
    log.info('Discovery workflow triggered');
    return;
  }

  throw new Error(`Failed to trigger discovery: ${status} ${JSON.stringify(data)}`);
}

export async function waitForDiscovery(
  config: ConnectionConfig,
  log: ToolingLog,
  timeoutMs: number = DISCOVERY_TIMEOUT_MS
): Promise<void> {
  log.info(`Polling discovery workflow status (timeout ${timeoutMs / 1000}s)...`);
  const start = Date.now();
  const deadline = start + timeoutMs;

  while (Date.now() < deadline) {
    const { data } = await kibanaRequest(
      config,
      'GET',
      '/internal/streams/significant_events/discovery/_status'
    );

    // status: not_started | running | failed | completed
    const taskStatus = (data as Record<string, unknown>)?.status;

    if (taskStatus === 'completed') {
      log.info('Discovery workflow completed successfully');
      return;
    }

    if (taskStatus === 'failed') {
      throw new Error(
        `Discovery workflow failed: ${JSON.stringify((data as Record<string, unknown>)?.error)}`
      );
    }

    const elapsed = Math.round((Date.now() - start) / 1000);
    log.info(`  discovery status: ${taskStatus} (${elapsed}s elapsed)`);
    await new Promise((resolve) => setTimeout(resolve, DISCOVERY_POLL_INTERVAL_MS));
  }

  throw new Error(`Discovery workflow did not complete within ${timeoutMs / 1000}s`);
}

const PAGINATED_FETCH_PER_PAGE = 1000;

/**
 * Pages through a `GET` route returning a `PaginatedResponse<T>` (`{ hits, total }`)
 * and returns all hits. Used to read the latest discoveries/detections from their
 * read APIs, mirroring how features are fetched before snapshotting.
 */
async function fetchAllPaginated<T>(
  config: ConnectionConfig,
  path: string,
  label: string
): Promise<T[]> {
  const all: T[] = [];
  let page = 1;

  while (true) {
    const sep = path.includes('?') ? '&' : '?';
    const { status, data } = await kibanaRequest(
      config,
      'GET',
      `${path}${sep}page=${page}&perPage=${PAGINATED_FETCH_PER_PAGE}`
    );

    if (status < 200 || status >= 300) {
      throw new Error(`Failed to fetch ${label}: ${status} ${JSON.stringify(data)}`);
    }

    const hits = (data as { hits?: T[] })?.hits;
    if (!Array.isArray(hits)) {
      throw new Error(`Expected "hits" array fetching ${label}, got: ${JSON.stringify(data)}`);
    }

    all.push(...hits);

    if (hits.length < PAGINATED_FETCH_PER_PAGE) {
      break;
    }
    page += 1;
  }

  return all;
}

async function readRawDataStreamDocs(
  sysClient: Client,
  index: string,
  query: QueryDslQueryContainer,
  label: string
): Promise<Array<Record<string, unknown>>> {
  const result = await sysClient.search<Record<string, unknown>>({
    index,
    size: RAW_DATA_STREAM_SEARCH_LIMIT,
    track_total_hits: true,
    query,
  });

  const total =
    typeof result.hits.total === 'number' ? result.hits.total : result.hits.total?.value ?? 0;
  if (total > RAW_DATA_STREAM_SEARCH_LIMIT) {
    throw new Error(
      `${label}: ${total} docs exceed the capture limit of ${RAW_DATA_STREAM_SEARCH_LIMIT}; ` +
        `the snapshot would be truncated. Add pagination before re-capturing.`
    );
  }

  return result.hits.hits.map((hit) => hit._source).filter(Boolean) as Array<
    Record<string, unknown>
  >;
}

async function persistDocsForSnapshot(
  esClient: Client,
  log: ToolingLog,
  index: string,
  docs: Array<Record<string, unknown>>,
  idField: string | undefined,
  label: string,
  mappings: MappingTypeMapping = { dynamic: true }
): Promise<{ index: string; count: number }> {
  await esClient.indices.delete({ index, ignore_unavailable: true });
  await esClient.indices.create({ index, mappings });

  if (docs.length > 0) {
    const operations = docs.flatMap((doc) => [
      {
        index: { _index: index, ...(idField && doc[idField] ? { _id: String(doc[idField]) } : {}) },
      },
      doc,
    ]);
    const bulkResponse = await esClient.bulk({ refresh: true, operations });

    if (bulkResponse.errors) {
      const firstError = bulkResponse.items.find((item) => {
        const op = Object.values(item)[0];
        return op && 'error' in op && op.error;
      });
      throw new Error(`Bulk indexing into ${index} failed: ${JSON.stringify(firstError, null, 2)}`);
    }
  } else {
    await esClient.indices.refresh({ index });
  }

  log.info(`Persisted ${docs.length} ${label} to "${index}" for snapshotting`);
  return { index, count: docs.length };
}
