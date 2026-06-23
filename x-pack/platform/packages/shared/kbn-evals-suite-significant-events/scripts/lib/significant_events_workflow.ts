/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import type { Feature } from '@kbn/streams-schema';
import {
  STREAMS_SIG_EVENTS_KI_EXTRACTION_INFERENCE_FEATURE_ID,
  STREAMS_SIG_EVENTS_KI_QUERY_GENERATION_INFERENCE_FEATURE_ID,
  STREAMS_SIG_EVENTS_DISCOVERY_INFERENCE_FEATURE_ID,
} from '@kbn/streams-schema';
import type { ConnectionConfig } from './get_connection_config';
import { kibanaRequest } from './kibana';
import {
  KI_FEATURE_EXTRACTION_POLL_INTERVAL_MS,
  KI_FEATURE_EXTRACTION_TIMEOUT_MS,
  DEFAULT_LOGS_INDEX,
  KNOWLEDGE_INDICATORS_DATA_STREAM,
} from './constants';
import {
  getSigeventsSnapshotKIFeaturesIndex,
  SIGEVENTS_FEATURES_INDEX_PATTERN,
} from '../../src/data_generators/sigevents_ki_features_index';

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
          feature_id: STREAMS_SIG_EVENTS_KI_EXTRACTION_INFERENCE_FEATURE_ID,
          endpoints: [{ id: connectorId }],
        },
        {
          feature_id: STREAMS_SIG_EVENTS_KI_QUERY_GENERATION_INFERENCE_FEATURE_ID,
          endpoints: [{ id: connectorId }],
        },
        {
          feature_id: STREAMS_SIG_EVENTS_DISCOVERY_INFERENCE_FEATURE_ID,
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
export async function triggerSigEventsKIFeatureExtraction(
  config: ConnectionConfig,
  log: ToolingLog,
  streamName: string = DEFAULT_LOGS_INDEX
): Promise<void> {
  log.info(`Triggering feature extraction on stream ${streamName}...`);

  const now = Date.now();
  const { status, data } = await kibanaRequest(
    config,
    'POST',
    `/internal/streams/${streamName}/onboarding/_execute`,
    {
      action: 'schedule',
      from: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
      to: new Date(now).toISOString(),
      steps: ['features_identification'],
    }
  );

  if (status >= 200 && status < 300) {
    log.info('Scheduled the onboarding workflow for feature extraction successfully');
    return;
  }

  throw new Error(`Failed to trigger KI feature extraction: ${status} ${JSON.stringify(data)}`);
}

export async function waitForSigEventsKIFeatureExtraction(
  config: ConnectionConfig,
  log: ToolingLog,
  streamName: string = DEFAULT_LOGS_INDEX,
  timeoutMs: number = KI_FEATURE_EXTRACTION_TIMEOUT_MS
): Promise<void> {
  log.info(`Polling onboarding status for feature extraction (timeout ${timeoutMs / 1000}s)...`);
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
        `Feature extraction failed: ${JSON.stringify((data as Record<string, unknown>)?.error)}`
      );
    }

    const elapsed = Math.round((Date.now() - start) / 1000);
    log.info(`  feature extraction status: ${taskStatus} (${elapsed}s elapsed)`);
    await new Promise((resolve) => setTimeout(resolve, KI_FEATURE_EXTRACTION_POLL_INTERVAL_MS));
  }

  throw new Error(
    `KI feature extraction did not complete within ${timeoutMs / 1000}s. ` +
      `Increase --extraction-timeout if the model/data volume needs longer.`
  );
}

export async function logSigEventsExtractedKIFeatures(
  config: ConnectionConfig,
  log: ToolingLog,
  streamName: string = DEFAULT_LOGS_INDEX
): Promise<void> {
  const kis = await fetchSigEventsExtractedKIs(config, log, streamName);
  log.info(`Extracted ${kis.length} KIs:`);
  for (const f of kis) {
    log.info(`  - ${f.title || f.description} (${f.type})`);
  }
}

async function fetchSigEventsExtractedKIs(
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

export async function persistSigEventsExtractedKIsForSnapshot(
  config: ConnectionConfig,
  esClient: Client,
  log: ToolingLog,
  snapshotName: string,
  streamName: string = DEFAULT_LOGS_INDEX
): Promise<{ index: string; count: number }> {
  const kis = await fetchSigEventsExtractedKIs(config, log, streamName);
  const index = getSigeventsSnapshotKIFeaturesIndex(snapshotName);

  await esClient.indices.delete({ index, ignore_unavailable: true });
  await esClient.indices.create({
    index,
    mappings: {
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
    },
  });

  if (kis.length > 0) {
    const operations = kis.flatMap((ki) => [{ index: { _index: index, _id: ki.id } }, ki]);

    await esClient.bulk({ refresh: true, operations });
  } else {
    try {
      await esClient.indices.refresh({ index });
    } catch (error) {
      throw new Error(
        `Failed to refresh features index "${index}" before snapshotting: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  log.info(`Persisted ${kis.length} KIs to "${index}" for snapshotting`);
  return { index, count: kis.length };
}

export async function cleanupSigEventsExtractedKIsData(
  esClient: Client,
  log: ToolingLog
): Promise<void> {
  log.info('Cleaning up ES data...');

  for (const target of [
    'logs*',
    KNOWLEDGE_INDICATORS_DATA_STREAM,
    SIGEVENTS_FEATURES_INDEX_PATTERN,
  ]) {
    try {
      await esClient.indices.deleteDataStream({ name: target });
    } catch {
      // do nothing if the index doesn't exist
    }

    try {
      await esClient.deleteByQuery({ index: target, refresh: true, query: { match_all: {} } });
    } catch {
      // do nothing if the index doesn't exist
    }
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
