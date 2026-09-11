/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import {
  AGGREGATION_PRECISION_THRESHOLD,
  ASSETS_SAMPLE_GRANULARITY,
  CLOUD_SECURITY_TASK_TYPE,
  CNVM,
  CSPM,
  KSPM,
  METERING_CONFIGS,
  BILLABLE_ASSETS_CONFIG,
  GCP_COMPUTE_MIN_RUNNING_DURATION_HOURS,
  GCP_COMPUTE_INSTANCE_SUB_TYPE,
  GCP_COMPUTE_DURATION_RUNTIME_FIELD,
} from './constants';
import type { ResourceSubtypeCounter, Tier, UsageRecord } from '../types';
import type {
  CloudSecurityMeteringCallbackInput,
  CloudSecuritySolutions,
  AssetCountAggregation,
  ResourceSubtypeAggregationBucket,
} from './types';

export const getUsageRecords = (
  assetCountAggregation: AssetCountAggregation,
  cloudSecuritySolution: CloudSecuritySolutions,
  taskId: string,
  tier: Tier,
  projectId: string,
  periodSeconds: number,
  logger: Logger
): UsageRecord => {
  let assetCount;
  let resourceSubtypeCounterMap;

  if (cloudSecuritySolution === CSPM || cloudSecuritySolution === KSPM) {
    const resourceSubtypeBuckets: ResourceSubtypeAggregationBucket[] =
      assetCountAggregation.resource_sub_type.buckets;

    const billableAssets = BILLABLE_ASSETS_CONFIG[cloudSecuritySolution].values;
    assetCount = resourceSubtypeBuckets
      .filter((bucket) => billableAssets.includes(bucket.key))
      .reduce((acc, bucket) => acc + bucket.unique_assets.value, 0);

    resourceSubtypeCounterMap = assetCountAggregation.resource_sub_type.buckets.reduce(
      (resourceMap, item) => {
        // By the usage spec, the resource subtype counter should be a string // https://github.com/elastic/usage-api/blob/main/api/user-v1-spec.yml
        resourceMap[item.key] = String(item.unique_assets.value);
        return resourceMap;
      },
      {} as ResourceSubtypeCounter
    );
  } else {
    assetCount = assetCountAggregation.unique_assets.value;
  }

  if (assetCount > AGGREGATION_PRECISION_THRESHOLD) {
    logger.warn(
      `The number of unique resources for {${cloudSecuritySolution}} is ${assetCount}, which is higher than the AGGREGATION_PRECISION_THRESHOLD of ${AGGREGATION_PRECISION_THRESHOLD}.`
    );
  }

  const minTimestamp = new Date(assetCountAggregation.min_timestamp.value_as_string).toISOString();

  const creationTimestamp = new Date();
  const minutes = creationTimestamp.getMinutes();
  if (minutes >= 30) {
    creationTimestamp.setMinutes(30, 0, 0);
  } else {
    creationTimestamp.setMinutes(0, 0, 0);
  }
  const roundedCreationTimestamp = creationTimestamp.toISOString();

  const usageRecord: UsageRecord = {
    id: `${CLOUD_SECURITY_TASK_TYPE}_${cloudSecuritySolution}_${projectId}_${roundedCreationTimestamp}`,
    usage_timestamp: minTimestamp,
    creation_timestamp: creationTimestamp.toISOString(),
    usage: {
      type: CLOUD_SECURITY_TASK_TYPE,
      sub_type: cloudSecuritySolution,
      quantity: assetCount,
      period_seconds: periodSeconds,
      ...(resourceSubtypeCounterMap && { metadata: resourceSubtypeCounterMap }),
    },
    source: {
      id: taskId,
      instance_group_id: projectId,
      metadata: { tier },
    },
  };

  return usageRecord;
};

export const getAggregationByCloudSecuritySolution = (
  cloudSecuritySolution: CloudSecuritySolutions
) => {
  if (cloudSecuritySolution === CSPM || cloudSecuritySolution === KSPM)
    return {
      resource_sub_type: {
        terms: {
          field: BILLABLE_ASSETS_CONFIG[cloudSecuritySolution].filter_attribute,
        },
        aggs: {
          unique_assets: {
            cardinality: {
              field: METERING_CONFIGS[cloudSecuritySolution].assets_identifier,
              precision_threshold: AGGREGATION_PRECISION_THRESHOLD,
            },
          },
        },
      },
      min_timestamp: {
        min: {
          field: '@timestamp',
        },
      },
    };

  return {
    unique_assets: {
      cardinality: {
        field: METERING_CONFIGS[cloudSecuritySolution].assets_identifier,
        precision_threshold: AGGREGATION_PRECISION_THRESHOLD,
      },
    },
    min_timestamp: {
      min: {
        field: '@timestamp',
      },
    },
  };
};

export const getSearchQueryByCloudSecuritySolution = (
  cloudSecuritySolution: CloudSecuritySolutions
) => {
  const mustFilters = [];

  if (
    cloudSecuritySolution === CSPM ||
    cloudSecuritySolution === KSPM ||
    cloudSecuritySolution === CNVM
  ) {
    mustFilters.push({
      range: {
        '@timestamp': {
          gte: `now-${ASSETS_SAMPLE_GRANULARITY}`,
        },
      },
    });
  }

  if (cloudSecuritySolution === CSPM || cloudSecuritySolution === KSPM) {
    mustFilters.push({
      term: {
        'rule.benchmark.posture_type': cloudSecuritySolution,
      },
    });
  }

  return {
    bool: {
      must: mustFilters,
    },
  };
};

/**
 * Returns the runtime_mappings entry that computes GCP compute instance running duration in ms.
 *
 * resource.raw is stored with enabled:false so its sub-fields have no doc values and cannot be
 * accessed via doc[...] in a script query. Runtime field scripts are the only Painless context
 * where params['_source'] is available, so we define a transient long field here and range-filter
 * on it instead.
 *
 * Fields read from _source:
 *   resource.raw.resource.data.status            — "RUNNING" | "TERMINATED" | "STOPPING" | ...
 *   resource.raw.resource.data.lastStartTimestamp — ISO-8601 string with offset
 *   resource.raw.resource.data.lastStopTimestamp  — ISO-8601 string with offset (TERMINATED only)
 *
 * The whole body is wrapped in try/catch: a runtime-field script error aborts the entire search
 * request, and the callers of that search swallow errors (log-only), so a single malformed doc
 * would otherwise silently zero all CSPM usage reporting for the run. A doc that fails to parse
 * simply emits nothing and is not counted.
 *
 * Stopped instances are only counted during the sampling window in which they actually stopped
 * (lastStopTimestamp >= lookbackStartMs). Without this, an instance whose historical run was
 * >=24h would keep passing the filter on every subsequent day it still appears in scans —
 * re-billing a stopped instance indefinitely. It already had its billing day when it stopped.
 */
export const getGcpComputeDurationRuntimeMapping = (nowMillis: number) => ({
  [GCP_COMPUTE_DURATION_RUNTIME_FIELD]: {
    type: 'long',
    script: {
      lang: 'painless',
      source: `
        if (doc['resource.sub_type'].size() == 0) return;
        if (!doc['resource.sub_type'].value.equals(params['subType'])) return;

        try {
          def src = params['_source'];
          if (src == null) return;
          def resourceMap = (Map) src.get('resource');
          if (resourceMap == null) return;
          def raw = (Map) resourceMap.get('raw');
          if (raw == null) return;
          def rawResource = (Map) raw.get('resource');
          if (rawResource == null) return;
          def data = (Map) rawResource.get('data');
          if (data == null) return;

          def status = (String) data.get('status');
          def lastStartStr = (String) data.get('lastStartTimestamp');
          if (lastStartStr == null || lastStartStr.length() == 0) return;

          long lastStartMs = ZonedDateTime.parse(lastStartStr).toInstant().toEpochMilli();
          long duration;

          if ('RUNNING'.equals(status)) {
            duration = params['nowMillis'] - lastStartMs;
          } else {
            def lastStopStr = (String) data.get('lastStopTimestamp');
            if (lastStopStr == null || lastStopStr.length() == 0) return;
            long lastStopMs = ZonedDateTime.parse(lastStopStr).toInstant().toEpochMilli();
            // Only count a stopped instance during the window in which it actually
            // stopped. A stop event older than the look-back window was already billed
            // on its stop day — don't re-bill it on every later day it appears in scans.
            if (lastStopMs < params['lookbackStartMs']) return;
            duration = lastStopMs - lastStartMs;
          }

          emit(duration);
        } catch (Exception e) {
          // Malformed doc (unexpected shape, non-string field, unparseable timestamp):
          // skip it rather than aborting the whole search request.
          return;
        }
      `,
      params: {
        nowMillis,
        // Start of the metering sampling window — must stay aligned with the
        // now-${ASSETS_SAMPLE_GRANULARITY} range filter the query applies on @timestamp.
        lookbackStartMs: nowMillis - 24 * 60 * 60 * 1000,
        subType: GCP_COMPUTE_INSTANCE_SUB_TYPE,
      },
    },
  },
});

/**
 * Returns a bool filter that passes non-gcp-compute-instance docs unchanged, and only passes
 * gcp-compute-instance docs whose runtime-computed running duration meets the minimum threshold.
 * Must be used alongside getGcpComputeDurationRuntimeMapping() in the same search request.
 */
export const getGcpComputeDurationFilter = () => {
  const minDurationMillis = GCP_COMPUTE_MIN_RUNNING_DURATION_HOURS * 60 * 60 * 1000;

  return {
    bool: {
      should: [
        {
          bool: {
            must_not: [{ term: { 'resource.sub_type': GCP_COMPUTE_INSTANCE_SUB_TYPE } }],
          },
        },
        {
          bool: {
            must: [
              { term: { 'resource.sub_type': GCP_COMPUTE_INSTANCE_SUB_TYPE } },
              {
                range: {
                  [GCP_COMPUTE_DURATION_RUNTIME_FIELD]: { gte: minDurationMillis },
                },
              },
            ],
          },
        },
      ],
      minimum_should_match: 1,
    },
  };
};

export const getAssetAggQueryByCloudSecuritySolution = (
  cloudSecuritySolution: CloudSecuritySolutions
) => {
  const query = getSearchQueryByCloudSecuritySolution(cloudSecuritySolution);
  const aggs = getAggregationByCloudSecuritySolution(cloudSecuritySolution);

  if (cloudSecuritySolution === CSPM) {
    const nowMillis = Date.now();
    return {
      index: METERING_CONFIGS[cloudSecuritySolution].index,
      runtime_mappings: getGcpComputeDurationRuntimeMapping(nowMillis),
      query: {
        bool: {
          must: [query, getGcpComputeDurationFilter()],
        },
      },
      size: 0,
      aggs,
    };
  }

  return {
    index: METERING_CONFIGS[cloudSecuritySolution].index,
    query,
    size: 0,
    aggs,
  };
};

export const getAssetAggByCloudSecuritySolution = async (
  esClient: ElasticsearchClient,
  cloudSecuritySolution: CloudSecuritySolutions
): Promise<AssetCountAggregation | undefined> => {
  const assetsAggQuery = getAssetAggQueryByCloudSecuritySolution(cloudSecuritySolution);

  // @ts-expect-error elasticsearch@9.0.0 The types are tripping because of the dynamic aggs
  const response = await esClient.search<unknown, AssetCountAggregation>(assetsAggQuery);

  if (!response.aggregations) return;

  return response.aggregations as AssetCountAggregation;
};

const indexHasDataInDateRange = async (
  esClient: ElasticsearchClient,
  cloudSecuritySolution: CloudSecuritySolutions
) => {
  const response = await esClient.search(
    {
      index: METERING_CONFIGS[cloudSecuritySolution].index,
      size: 1,
      _source: false,
      query: getSearchQueryByCloudSecuritySolution(cloudSecuritySolution),
    },
    { ignore: [404] }
  );

  return response.hits?.hits.length > 0;
};

export const getCloudSecurityUsageRecord = async ({
  esClient,
  projectId,
  taskId,
  cloudSecuritySolution,
  tier,
  logger,
}: CloudSecurityMeteringCallbackInput): Promise<UsageRecord[] | undefined> => {
  try {
    if (!(await indexHasDataInDateRange(esClient, cloudSecuritySolution))) return;

    // const periodSeconds = Math.floor((new Date().getTime() - searchFrom.getTime()) / 1000);
    const periodSeconds = 1800; // Workaround to prevent overbilling by charging for a constant time window. The issue should be resolved in https://github.com/elastic/security-team/issues/9424.

    const assetCountAggregation = await getAssetAggByCloudSecuritySolution(
      esClient,
      cloudSecuritySolution
    );

    if (!assetCountAggregation) return [];

    const usageRecords = await getUsageRecords(
      assetCountAggregation,
      cloudSecuritySolution,
      taskId,
      tier,
      projectId,
      periodSeconds,
      logger
    );

    return [usageRecords];
  } catch (err) {
    logger.error(`Failed to fetch ${cloudSecuritySolution} metering data ${err}`);
  }
};
