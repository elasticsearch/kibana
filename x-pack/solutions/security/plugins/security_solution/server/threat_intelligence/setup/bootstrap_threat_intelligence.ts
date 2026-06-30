/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import {
  THREAT_INTEL_SOURCES_INDEX,
  DIAMOND_INFERENCE_ENDPOINT_ID,
} from '../../../common/threat_intelligence/hub';
import { installIndexTemplates } from './index_templates';
import { seedDefaultSources, type SeedDefaultSourcesResult } from './seed_default_sources';

export interface BootstrapThreatIntelligenceResult {
  seed: SeedDefaultSourcesResult;
}

const BOOTSTRAP_RETRY_ATTEMPTS = 8;
const BOOTSTRAP_RETRY_DELAY_MS = 2_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const withElasticsearchRetry = async <T>(
  operation: () => Promise<T>,
  log: Logger,
  label: string
): Promise<T> => {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= BOOTSTRAP_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt === BOOTSTRAP_RETRY_ATTEMPTS) {
        break;
      }
      log.warn(
        `${label} failed (attempt ${attempt}/${BOOTSTRAP_RETRY_ATTEMPTS}): ${lastError.message}; retrying`
      );
      await sleep(BOOTSTRAP_RETRY_DELAY_MS);
    }
  }

  throw lastError ?? new Error(`${label} failed`);
};

/**
 * Checks that the diamond extraction inference endpoint is present. Non-fatal:
 * ES validates inference_id at document-index time (not at template PUT or
 * rollover), so a missing endpoint only surfaces when `extract_diamond` first
 * tries to populate a `summary` field. Logging the gap at startup gives
 * operators time to install the endpoint before data flows.
 *
 * Investigation confirmed (2026-06-06): template PUT and data-stream rollover
 * succeed regardless of whether the endpoint exists. Hard-fail startup is
 * therefore unwarranted — loud logging is the right level here.
 */
const checkDiamondInferenceEndpoint = async (
  esClient: ElasticsearchClient,
  log: Logger
): Promise<void> => {
  try {
    await esClient.inference.get({ inference_id: DIAMOND_INFERENCE_ENDPOINT_ID });
    log.debug(`Diamond inference endpoint ${DIAMOND_INFERENCE_ENDPOINT_ID} verified present`);
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404) {
      log.error(
        `Diamond Model extraction requires the inference endpoint ` +
          `"${DIAMOND_INFERENCE_ENDPOINT_ID}" which is not installed. ` +
          `Run: PUT _inference/text_embedding/${DIAMOND_INFERENCE_ENDPOINT_ID} ` +
          `(or install via Kibana > Machine Learning > Trained Models). ` +
          `The plugin will start normally but extracted.diamond.*.summary ` +
          `fields will fail to index until the endpoint is present.`
      );
    } else {
      log.warn(
        `Could not verify diamond inference endpoint: ${(err as Error).message}. ` +
          `This may be a transient error; re-check on next restart.`
      );
    }
  }
};

/**
 * Installs plugin-owned index templates / indices, then seeds the default feed
 * catalog into `.kibana-threat-intel-sources`.
 *
 * Invoked from `setupThreatIntelligence` via `core.getStartServices()` once core
 * and Elasticsearch are available. Retries transient cluster errors instead of
 * leaving an empty catalog when `start()` races a cold Elasticsearch process.
 */
export const bootstrapThreatIntelligence = async ({
  esClient,
  logger,
}: {
  esClient: ElasticsearchClient;
  logger: Logger;
}): Promise<BootstrapThreatIntelligenceResult> => {
  const log = logger.get('bootstrap');

  log.info('Starting threat intelligence bootstrap (index templates + default sources)');

  await withElasticsearchRetry(
    () => installIndexTemplates({ esClient, logger }),
    log,
    'Threat intelligence index template installation'
  );

  // Non-blocking check — see `checkDiamondInferenceEndpoint` doc comment.
  await checkDiamondInferenceEndpoint(esClient, log);

  const seed = await withElasticsearchRetry(
    () => seedDefaultSources({ esClient, logger }),
    log,
    'Threat intelligence default source seeding'
  );

  log.info(
    `Threat intelligence bootstrap finished: ${seed.created} sources created, ` +
      `${seed.skipped} already present, ${seed.failed} failed (${seed.total} catalog entries)`
  );

  if (seed.failed > 0) {
    log.warn(
      `Threat intelligence default-source seeding had ${seed.failed} failure(s); ` +
        'check earlier warn logs for per-source errors'
    );
  }

  const catalogCount = await esClient.count(
    { index: THREAT_INTEL_SOURCES_INDEX },
    { ignore: [404] }
  );
  if (catalogCount.count === 0 && seed.created === 0) {
    log.error(
      'Threat intelligence bootstrap completed but `.kibana-threat-intel-sources` is still empty'
    );
  }

  return { seed };
};

/**
 * Idempotent guard used on setup and start. Re-runs bootstrap when the sources
 * catalog index is missing or empty (e.g. Elasticsearch data was wiped while
 * Kibana stayed up, or the first bootstrap attempt failed during a cold start).
 */
export const ensureThreatIntelligenceBootstrap = async ({
  esClient,
  logger,
}: {
  esClient: ElasticsearchClient;
  logger: Logger;
}): Promise<BootstrapThreatIntelligenceResult | undefined> => {
  const log = logger.get('bootstrap');

  const catalogCount = await esClient.count(
    { index: THREAT_INTEL_SOURCES_INDEX },
    { ignore: [404] }
  );

  if (catalogCount.count > 0) {
    log.debug(
      `Threat intelligence catalog already has ${catalogCount.count} sources; skipping bootstrap`
    );
    return undefined;
  }

  log.info(
    'Threat intelligence catalog is empty; running bootstrap (index templates + default sources)'
  );

  return bootstrapThreatIntelligence({ esClient, logger });
};
