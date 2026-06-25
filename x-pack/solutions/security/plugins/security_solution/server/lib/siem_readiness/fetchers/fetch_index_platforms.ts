/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';
import { toDataStreamName } from './utils';

interface TermsBucket {
  key: string;
  doc_count: number;
}

interface IndexBucket {
  key: string;
  doc_count: number;
  cloud_provider: { buckets: TermsBucket[] };
  cloud_account_id: { buckets: TermsBucket[] };
  host_os_family: { buckets: TermsBucket[] };
  event_module: { buckets: TermsBucket[] };
  observer_vendor: { buckets: TermsBucket[] };
}

interface PlatformAggregationResponse {
  by_index: { buckets: IndexBucket[] };
}

interface IndexPlatformRow {
  index: string;
  cloudProvider: string | null;
  cloudAccountId: string | null;
  hostOsFamily: string | null;
  eventModule: string | null;
  observerVendor: string | null;
}

/**
 * Classifies an index into a human-readable platform label using ECS field values.
 * Priority order (highest specificity first):
 *   1. cloud.provider + cloud.account.id → "AWS account 123456"
 *   2. cloud.provider only → "AWS" / "GCP" / "Azure" (uppercased)
 *   3. host.os.family == "windows" → "Windows Endpoints"
 *   4. host.os.family == "macos"   → "macOS Endpoints"
 *   5. host.os.family (other)      → "{family} Endpoints"
 *   6. event.module == "okta"      → "Okta (Identity)"
 *   7. event.module (other)        → module name as-is
 *   8. observer.vendor == "Palo Alto Networks" → "Palo Alto (Network)"
 *   9. observer.vendor (other)     → vendor name as-is
 *  10. dataset extracted from index name → generic fallback label
 */
const classifyPlatform = (row: IndexPlatformRow): string | undefined => {
  const { cloudProvider, cloudAccountId, hostOsFamily, eventModule, observerVendor } = row;

  if (cloudProvider && cloudAccountId) {
    return `${cloudProvider.toUpperCase()} account ${cloudAccountId}`;
  }
  if (cloudProvider) {
    return cloudProvider.toUpperCase();
  }
  if (hostOsFamily) return `${hostOsFamily} Endpoints`;
  if (eventModule) return eventModule;
  if (observerVendor) return observerVendor;

  // Last-resort: extract dataset portion from the index name
  // "logs-aws.cloudtrail-default" → "aws.cloudtrail"
  const dsName = toDataStreamName(row.index);
  const withoutPrefix = dsName.replace(/^(logs|metrics|traces)-/, '');
  const withoutSuffix = withoutPrefix.replace(/-[^-]+$/, '');
  return withoutSuffix || dsName;
};

const topKey = (bucket: TermsBucket[] | undefined): string | null => bucket?.[0]?.key ?? null;

/**
 * Queries Elasticsearch to discover the platform label for each active index/data stream,
 * based on ECS fields present in the documents (cloud.provider, host.os.family, etc.).
 *
 * Uses a standard terms aggregation on _index (consistent with fetchCategories) with
 * sub-aggregations for each platform-indicator ECS field. Each inner terms aggregation
 * uses size:1 to return the single most common value within the index bucket.
 *
 * Stores the platform under both the raw index name AND the extracted data stream name
 * so enrichFinding's two-step lookup resolves correctly in all cases.
 *
 * Gracefully returns an empty Map on failure so platform derivation falls back to rule metadata.
 */
export const fetchIndexPlatforms = async ({
  esClient,
  logger,
}: {
  esClient: ElasticsearchClient;
  logger: Logger;
}): Promise<Map<string, string>> => {
  const result = new Map<string, string>();

  try {
    const response = await esClient.search({
      index: ['logs-*', 'metrics-*'],
      size: 0,
      query: { range: { '@timestamp': { gte: 'now-7d' } } },
      aggs: {
        by_index: {
          terms: { field: '_index', size: 1000, order: { _count: 'desc' } },
          aggs: {
            cloud_provider: { terms: { field: 'cloud.provider', size: 1 } },
            cloud_account_id: { terms: { field: 'cloud.account.id', size: 1 } },
            host_os_family: { terms: { field: 'host.os.family', size: 1 } },
            event_module: { terms: { field: 'event.module', size: 1 } },
            observer_vendor: { terms: { field: 'observer.vendor', size: 1 } },
          },
        },
      },
    });

    const aggs = response.aggregations as PlatformAggregationResponse | undefined;

    for (const bucket of aggs?.by_index?.buckets ?? []) {
      const rawIndex = bucket.key;
      const dataStreamName = toDataStreamName(rawIndex);

      // First match per data stream wins — subsequent backing indices are skipped
      if (!result.has(dataStreamName)) {
        const platformRow: IndexPlatformRow = {
          index: rawIndex,
          cloudProvider: topKey(bucket.cloud_provider?.buckets),
          cloudAccountId: topKey(bucket.cloud_account_id?.buckets),
          hostOsFamily: topKey(bucket.host_os_family?.buckets),
          eventModule: topKey(bucket.event_module?.buckets),
          observerVendor: topKey(bucket.observer_vendor?.buckets),
        };

        const platform = classifyPlatform(platformRow);
        if (platform) {
          // Store under both keys so enrichFinding's two-step lookup resolves correctly
          result.set(rawIndex, platform); // backing index name lookup
          result.set(dataStreamName, platform); // data stream name lookup
        }
      }
    }
  } catch (error: unknown) {
    const e = error as { message?: string };
    logger.warn(
      `fetchIndexPlatforms: aggregation failed, platform will fall back to rule metadata — ${
        e.message ?? 'unknown error'
      }`
    );
  }

  return result;
};
