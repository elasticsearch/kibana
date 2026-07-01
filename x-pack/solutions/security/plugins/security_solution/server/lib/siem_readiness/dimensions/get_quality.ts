/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';
import type {
  ActionableFinding,
  DataQualityResultDocument,
  QualityPayload,
} from '@kbn/siem-readiness';
import { isQualityIncompatible } from '@kbn/siem-readiness';

const DATA_QUALITY_RESULTS_INDEX = '.kibana-data-quality-dashboard-results-*';

const fetchDataQualityResults = async ({
  esClient,
  logger,
}: {
  esClient: ElasticsearchClient;
  logger: Logger;
}): Promise<DataQualityResultDocument[]> => {
  try {
    const response = await esClient.search<DataQualityResultDocument>({
      index: DATA_QUALITY_RESULTS_INDEX,
      size: 10000,
      sort: [{ checkedAt: { order: 'desc' } }],
      ignore_unavailable: true,
      allow_no_indices: true,
    });

    const seen = new Set<string>();
    const results: DataQualityResultDocument[] = [];

    for (const hit of response.hits.hits) {
      if (hit._source) {
        const { indexName } = hit._source;
        if (!seen.has(indexName)) {
          seen.add(indexName);
          results.push(hit._source);
        }
      }
    }

    return results;
  } catch (error: unknown) {
    const e = error as { message?: string };
    logger.warn(`Failed to fetch data quality results: ${e.message ?? 'unknown error'}`);
    return [];
  }
};

export const getQuality = async ({
  esClient,
  logger,
}: {
  esClient: ElasticsearchClient;
  logger: Logger;
}): Promise<QualityPayload> => {
  const qualityResults = await fetchDataQualityResults({ esClient, logger });

  const actionableFindings: ActionableFinding[] = qualityResults
    .filter((result) => isQualityIncompatible(result.incompatibleFieldCount))
    .map((result) => ({
      severity: 'WARNING' as const,
      message: `${result.indexName} has ${result.incompatibleFieldCount} incompatible ECS fields`,
      resource: result.indexName,
    }));

  const status =
    qualityResults.length === 0
      ? ('noData' as const)
      : actionableFindings.length > 0
      ? ('actionsRequired' as const)
      : ('healthy' as const);

  const summary = buildQualitySummary(status, qualityResults.length, actionableFindings.length);

  return { status, summary, items: qualityResults, actionableFindings, missingFieldsByRule: [] };
};

const buildQualitySummary = (
  status: string,
  checkedCount: number,
  incompatibleCount: number
): string => {
  if (status === 'noData')
    return 'No data quality check results found. Run a data quality check to see results.';
  if (incompatibleCount > 0) {
    return `${incompatibleCount} of ${checkedCount} checked indices have incompatible ECS field mappings.`;
  }
  return `All ${checkedCount} checked indices are ECS-compatible.`;
};
