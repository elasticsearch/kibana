/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest, Logger, ElasticsearchClient } from '@kbn/core/server';
import type { InferenceServerStart } from '@kbn/inference-plugin/server';
import type { SearchInferenceEndpointsPluginStart } from '@kbn/search-inference-endpoints/server';
import {
  DIAMOND_SUMMARY_EMBEDDING_INFERENCE_ID,
  THREAT_INTEL_DIAMOND_INFERENCE_FEATURE_ID,
  THREAT_INTEL_ENRICH_INFERENCE_FEATURE_ID,
  THREAT_REPORTS_INDEX,
  THREAT_REPORTS_INDEX_PATTERN,
  type ReadinessResponse,
  type ReadinessStatus,
} from '../../../common/threat_intel';
import { HIDDEN_INDEX_SEARCH_OPTIONS } from '../lib/es_options';
import { buildSpaceFilterTerms } from '../lib/space_filter';
import { USABLE_REPORT_FILTER } from './find_threat_reports';

const REQUIRED_REPORT_SEMANTIC_FIELDS = ['title', 'body_text'] as const;

export interface ReadinessDeps {
  esClient: ElasticsearchClient;
  spaceId: string;
  logger: Logger;
  getBootstrapReady: () => Promise<void>;
  request: KibanaRequest;
  getInference: () => InferenceServerStart | undefined;
  getSearchInferenceEndpoints: () => SearchInferenceEndpointsPluginStart | undefined;
}

const maxAggToIso = (
  agg: { value?: number | null; value_as_string?: string } | undefined
): string | null => {
  if (agg?.value_as_string) return agg.value_as_string;
  if (typeof agg?.value === 'number') return new Date(agg.value).toISOString();
  return null;
};

const checkReportsIndexExists = async (esClient: ElasticsearchClient): Promise<boolean> => {
  try {
    return await esClient.indices.exists({
      index: THREAT_REPORTS_INDEX,
      expand_wildcards: ['open', 'hidden'],
    });
  } catch {
    return false;
  }
};

/**
 * Verifies report-content semantic_text embedding endpoints (cluster default).
 * Missing or unreachable endpoints yield `embedding_endpoint_unavailable`.
 */
const checkEmbeddingEndpoints = async (
  esClient: ElasticsearchClient,
  logger: Logger
): Promise<boolean> => {
  try {
    const mappings = await esClient.indices.getFieldMapping({
      index: THREAT_REPORTS_INDEX,
      fields: REQUIRED_REPORT_SEMANTIC_FIELDS.map((field) => `content.${field}`),
      include_defaults: true,
    });
    const fieldMappings = mappings[THREAT_REPORTS_INDEX]?.mappings;
    const endpointIds = new Set<string>();

    for (const field of REQUIRED_REPORT_SEMANTIC_FIELDS) {
      const fullName = `content.${field}`;
      const fieldMapping = fieldMappings?.[fullName];
      const mapping = fieldMapping?.mapping[field] ?? fieldMapping?.mapping[fullName];
      if (mapping?.type !== 'semantic_text' || !mapping.inference_id) {
        return false;
      }
      endpointIds.add(mapping.inference_id);
    }

    for (const endpointId of endpointIds) {
      await esClient.inference.get({ inference_id: endpointId });
    }
    return true;
  } catch (err) {
    logger.debug(`Readiness embedding endpoint check failed: ${(err as Error).message}`);
    return false;
  }
};

const checkDiamondEmbeddingEndpoint = async (esClient: ElasticsearchClient): Promise<boolean> => {
  try {
    await esClient.inference.get({ inference_id: DIAMOND_SUMMARY_EMBEDDING_INFERENCE_ID });
    return true;
  } catch {
    return false;
  }
};

const featureHasEndpoint = async ({
  searchInferenceEndpoints,
  featureId,
  request,
  logger,
}: {
  searchInferenceEndpoints: SearchInferenceEndpointsPluginStart | undefined;
  featureId: string;
  request: KibanaRequest;
  logger: Logger;
}): Promise<boolean> => {
  if (!searchInferenceEndpoints) return false;
  try {
    const { endpoints } = await searchInferenceEndpoints.endpoints.getForFeature(
      featureId,
      request
    );
    return endpoints.some((endpoint) => Boolean(endpoint.connectorId));
  } catch (err) {
    logger.debug(
      `Readiness feature='${featureId}' connector probe failed: ${(err as Error).message}`
    );
    return false;
  }
};

const loadUsableStats = async ({
  esClient,
  spaceId,
}: {
  esClient: ElasticsearchClient;
  spaceId: string;
}): Promise<{
  usableReportCount: number;
  lastIngestAt: string | null;
  lastEnrichAt: string | null;
}> => {
  const response = await esClient.search({
    index: THREAT_REPORTS_INDEX_PATTERN,
    ...HIDDEN_INDEX_SEARCH_OPTIONS,
    size: 0,
    track_total_hits: true,
    query: {
      bool: {
        filter: [buildSpaceFilterTerms(spaceId), USABLE_REPORT_FILTER],
      },
    },
    aggs: {
      last_ingest: { max: { field: 'lineage.ingested_at' } },
      last_enrich: { max: { field: 'lineage.extracted_at' } },
    },
  });

  const total = response.hits.total;
  const usableReportCount =
    typeof total === 'number' ? total : typeof total?.value === 'number' ? total.value : 0;

  return {
    usableReportCount,
    lastIngestAt: maxAggToIso(
      response.aggregations?.last_ingest as
        | { value?: number | null; value_as_string?: string }
        | undefined
    ),
    lastEnrichAt: maxAggToIso(
      response.aggregations?.last_enrich as
        | { value?: number | null; value_as_string?: string }
        | undefined
    ),
  };
};

/**
 * Reports whether the threat-intel supply pipeline is ready for hunt consumers.
 * Does not gate on bootstrap completion — it reports bootstrap status instead.
 */
export const getThreatIntelReadiness = async ({
  esClient,
  spaceId,
  logger,
  getBootstrapReady,
  request,
  getInference,
  getSearchInferenceEndpoints,
}: ReadinessDeps): Promise<ReadinessResponse> => {
  const reasonCodes: string[] = [];
  const optional: string[] = [];

  let bootstrapComplete = true;
  try {
    await getBootstrapReady();
  } catch {
    bootstrapComplete = false;
    reasonCodes.push('bootstrap_incomplete');
  }

  const reportsIndexExists = await checkReportsIndexExists(esClient);
  if (!reportsIndexExists) {
    reasonCodes.push('reports_index_missing');
  }

  if (!bootstrapComplete || !reportsIndexExists) {
    return {
      status: 'blocked',
      reasonCodes,
      usableReportCount: 0,
      lastIngestAt: null,
      lastEnrichAt: null,
      ...(optional.length > 0 ? { optional } : {}),
    };
  }

  const inference = getInference();
  const searchInferenceEndpoints = getSearchInferenceEndpoints();

  const embeddingOk = await checkEmbeddingEndpoints(esClient, logger);
  if (!embeddingOk) {
    reasonCodes.push('embedding_endpoint_unavailable');
  }

  const enrichOk =
    Boolean(inference) &&
    (await featureHasEndpoint({
      searchInferenceEndpoints,
      featureId: THREAT_INTEL_ENRICH_INFERENCE_FEATURE_ID,
      request,
      logger,
    }));
  if (!enrichOk) {
    // Missing inference or searchInferenceEndpoints plugins also land here.
    reasonCodes.push('no_enrich_connector');
  }

  const diamondEmbeddingOk = await checkDiamondEmbeddingEndpoint(esClient);
  const diamondConnectorOk =
    Boolean(inference) &&
    (await featureHasEndpoint({
      searchInferenceEndpoints,
      featureId: THREAT_INTEL_DIAMOND_INFERENCE_FEATURE_ID,
      request,
      logger,
    }));
  if (!diamondEmbeddingOk || !diamondConnectorOk) {
    optional.push('diamond_unavailable');
  }

  let usableReportCount = 0;
  let lastIngestAt: string | null = null;
  let lastEnrichAt: string | null = null;
  let statsAvailable = true;
  try {
    const stats = await loadUsableStats({ esClient, spaceId });
    usableReportCount = stats.usableReportCount;
    lastIngestAt = stats.lastIngestAt;
    lastEnrichAt = stats.lastEnrichAt;
  } catch (err) {
    statsAvailable = false;
    logger.warn(`Readiness usable-report stats failed: ${(err as Error).message}`);
  }

  if (!statsAvailable) {
    // A failed stats query is not the same as an empty catalog: reporting
    // `no_usable_reports` here would tell a consumer "nothing ingested yet" when
    // the truth is the count could not be read. Surface it distinctly instead.
    reasonCodes.push('usable_stats_unavailable');
  } else if (usableReportCount === 0) {
    reasonCodes.push('no_usable_reports');
  }

  const status: ReadinessStatus = reasonCodes.length > 0 ? 'degraded' : 'ready';

  return {
    status,
    reasonCodes,
    usableReportCount,
    lastIngestAt,
    lastEnrichAt,
    ...(optional.length > 0 ? { optional } : {}),
  };
};
