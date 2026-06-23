/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { schema } from '@kbn/config-schema';
import { sumBy, values } from 'lodash';
import type { RouteRegisterParameters } from '..';
import { getRoutePaths, MAX_KUERY_LENGTH } from '../../../common';
import type { StorageExplorerSummaryAPIResponse } from '../../../common/storage_explorer';
import { IndexLifecyclePhaseSelectOption } from '../../../common/storage_explorer';
import { getClient } from '../compat';
import { getDailyDataGenerationSize } from './get_daily_data_generation.size';
import { getHostBreakdownSizeTimeseries } from './get_host_breakdown_size_timeseries';
import { getHostDetails } from './get_host_details';
import { getHostAndDistinctProbabilisticCount } from './get_host_distinct_probabilistic_count';
import { allIndices, getIndicesStats, getNodesStats, symbolsIndices } from './get_indices_stats';
import { getStorageDetailsGroupedByIndex } from './get_storage_details_grouped_by_index';
import { getStorageDetailsPerIndex } from './get_storage_details_per_index';

export function registerStorageExplorerRoute({
  router,
  services: { createProfilingEsClient },
}: RouteRegisterParameters) {
  const paths = getRoutePaths();
  router.get(
    {
      path: paths.StorageExplorerSummary,
      security: {
        authz: {
          requiredPrivileges: ['profiling'],
        },
      },
      validate: {
        query: schema.object({
          indexLifecyclePhase: schema.oneOf([
            schema.literal(IndexLifecyclePhaseSelectOption.All),
            schema.literal(IndexLifecyclePhaseSelectOption.Hot),
            schema.literal(IndexLifecyclePhaseSelectOption.Warm),
            schema.literal(IndexLifecyclePhaseSelectOption.Cold),
            schema.literal(IndexLifecyclePhaseSelectOption.Frozen),
          ]),
          timeFrom: schema.number(),
          timeTo: schema.number(),
          kuery: schema.string({ maxLength: MAX_KUERY_LENGTH }),
        }),
      },
    },
    async (context, request, response) => {
      const { timeFrom, timeTo, kuery, indexLifecyclePhase } = request.query;
      const client = await getClient(context);
      const profilingClient = createProfilingEsClient({ request, esClient: client });
      const profilingEsClient = profilingClient.getEsClient();

      const [
        totalIndicesStats,
        totalSymbolsIndicesStats,
        nodeStats,
        hostAndDistinctProbabilisticCount,
      ] = await Promise.all([
        getIndicesStats({
          client: profilingEsClient,
          indices: allIndices,
        }),
        getIndicesStats({
          client: profilingEsClient,
          indices: symbolsIndices,
        }),
        getNodesStats({ client: profilingEsClient }),
        getHostAndDistinctProbabilisticCount({
          client: profilingClient,
          timeFrom,
          timeTo,
          kuery,
          indexLifecyclePhase,
        }),
      ]);

      const { dailyDataGenerationBytes } = await getDailyDataGenerationSize({
        client: profilingClient,
        timeFrom,
        timeTo,
        allIndicesStats: totalIndicesStats.indices,
        kuery,
      });

      const { nodes: diskSpacePerNode } = nodeStats;
      const { totalNumberOfDistinctProbabilisticValues, totalNumberOfHosts } =
        hostAndDistinctProbabilisticCount;
      const totalProfilingSizeBytes = totalIndicesStats._all.total?.store?.size_in_bytes ?? 0;
      const totalSymbolsSizeBytes = totalSymbolsIndicesStats._all.total?.store?.size_in_bytes ?? 0;

      const totalDiskSpace = sumBy(
        values(diskSpacePerNode),
        (node) => node?.fs?.total?.total_in_bytes ?? 0
      );

      const summary: StorageExplorerSummaryAPIResponse = {
        totalProfilingSizeBytes,
        totalSymbolsSizeBytes,
        diskSpaceUsedPct: totalProfilingSizeBytes / totalDiskSpace,
        totalNumberOfDistinctProbabilisticValues,
        totalNumberOfHosts,
        dailyDataGenerationBytes,
      };

      return response.ok({
        body: summary,
      });
    }
  );

  router.get(
    {
      path: paths.StorageExplorerHostStorageDetails,
      security: {
        authz: {
          requiredPrivileges: ['profiling'],
        },
      },
      validate: {
        query: schema.object({
          indexLifecyclePhase: schema.oneOf([
            schema.literal(IndexLifecyclePhaseSelectOption.All),
            schema.literal(IndexLifecyclePhaseSelectOption.Hot),
            schema.literal(IndexLifecyclePhaseSelectOption.Warm),
            schema.literal(IndexLifecyclePhaseSelectOption.Cold),
            schema.literal(IndexLifecyclePhaseSelectOption.Frozen),
          ]),
          timeFrom: schema.number(),
          timeTo: schema.number(),
          kuery: schema.string({ maxLength: MAX_KUERY_LENGTH }),
        }),
      },
    },
    async (context, request, response) => {
      const client = await getClient(context);
      const profilingClient = createProfilingEsClient({ request, esClient: client });

      const { timeFrom, timeTo, kuery, indexLifecyclePhase } = request.query;
      const [hostDetailsTimeseries, hostDetails] = await Promise.all([
        getHostBreakdownSizeTimeseries({
          client: profilingClient,
          timeFrom,
          timeTo,
          kuery,
          indexLifecyclePhase,
        }),
        getHostDetails({
          client: profilingClient,
          timeFrom,
          timeTo,
          kuery,
          indexLifecyclePhase,
        }),
      ]);
      return response.ok({ body: { hostDetailsTimeseries, hostDetails } });
    }
  );

  router.get(
    {
      path: paths.StorageExplorerIndicesStorageDetails,
      security: {
        authz: {
          requiredPrivileges: ['profiling'],
        },
      },
      validate: {
        query: schema.object({
          indexLifecyclePhase: schema.oneOf([
            schema.literal(IndexLifecyclePhaseSelectOption.All),
            schema.literal(IndexLifecyclePhaseSelectOption.Hot),
            schema.literal(IndexLifecyclePhaseSelectOption.Warm),
            schema.literal(IndexLifecyclePhaseSelectOption.Cold),
            schema.literal(IndexLifecyclePhaseSelectOption.Frozen),
          ]),
        }),
      },
    },
    async (context, request, response) => {
      const client = await getClient(context);
      const profilingClient = createProfilingEsClient({ request, esClient: client });
      const profilingEsClient = profilingClient.getEsClient();
      const { indexLifecyclePhase } = request.query;

      const [storageDetailsGroupedByIndex, storageDetailsPerIndex] = await Promise.all([
        getStorageDetailsGroupedByIndex({
          client: profilingEsClient,
          indexLifecyclePhase,
        }),
        getStorageDetailsPerIndex({ client: profilingEsClient, indexLifecyclePhase }),
      ]);

      return response.ok({ body: { storageDetailsGroupedByIndex, storageDetailsPerIndex } });
    }
  );
}
