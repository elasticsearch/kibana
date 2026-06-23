/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { Logger } from '@kbn/core/server';
import {
  getFieldNameForTopNType,
  groupStackFrameMetadataByStackTrace,
  ProfilingESField,
  TopNType,
} from '@kbn/profiling-utils';
import { profilingShowErrorFrames } from '@kbn/observability-plugin/common';
import type { RouteRegisterParameters } from '.';
import { IDLE_SOCKET_TIMEOUT } from '.';
import { getRoutePaths, INDEX_EVENTS, MAX_KUERY_LENGTH } from '../../common';
import { computeBucketWidthFromTimeRangeAndBucketCount } from '../../common/histogram';
import type { TopNResponse } from '../../common/topn';
import { createTopNSamples, getTopNAggregationRequest } from '../../common/topn';
import type { ProfilingESClient } from '../utils/create_profiling_es_client';
import { handleRouteHandlerError } from '../utils/handle_route_error_handler';
import { withProfilingSpan } from '../utils/with_profiling_span';
import { getClient } from './compat';
import { findDownsampledIndex } from './downsampling';
import { createCommonFilter } from './query';
import { searchStackTraces } from './search_stacktraces';

export async function topNElasticSearchQuery({
  client,
  logger,
  timeFrom,
  timeTo,
  searchField,
  highCardinality,
  kuery,
  showErrorFrames,
  preFilterShardSize,
}: {
  client: ProfilingESClient;
  logger: Logger;
  timeFrom: number;
  timeTo: number;
  searchField: string;
  highCardinality: boolean;
  kuery: string;
  showErrorFrames: boolean;
  preFilterShardSize?: number;
}): Promise<TopNResponse> {
  const filter = createCommonFilter({ timeFrom, timeTo, kuery });
  const targetSampleSize = 20000; // minimum number of samples to get statistically sound results

  const bucketWidth = computeBucketWidthFromTimeRangeAndBucketCount(timeFrom, timeTo, 50);

  const eventsIndex = await findDownsampledIndex({
    logger,
    client,
    index: INDEX_EVENTS,
    filter,
    sampleSize: targetSampleSize,
  });

  const resEvents = await client.search('get_topn_histogram', {
    index: eventsIndex.name,
    size: 0,
    query: filter,
    aggs: getTopNAggregationRequest({
      searchField,
      highCardinality,
      fixedInterval: `${bucketWidth}s`,
    }),
    // Adrien and Dario found out this is a work-around for some bug in 8.1.
    // It reduces the query time by avoiding unneeded searches.
    // This is not supported in serverless, so we don't set it.
    pre_filter_shard_size: preFilterShardSize,
  });

  const { aggregations } = resEvents;

  if (!aggregations) {
    return {
      TotalCount: 0,
      TopN: [],
      Metadata: {},
      Labels: {},
    };
  }

  // Creating top N samples requires the time range and bucket width to
  // be in milliseconds, not seconds
  const topN = createTopNSamples(aggregations, timeFrom * 1000, timeTo * 1000, bucketWidth * 1000);

  for (let i = 0; i < topN.length; i++) {
    topN[i].Count = (topN[i].Count ?? 0) / eventsIndex.sampleRate;
  }

  const groupByBuckets = aggregations.group_by.buckets ?? [];

  const labels: Record<string, string> = {};

  for (const bucket of groupByBuckets) {
    if (bucket.sample?.top[0]) {
      labels[String(bucket.key)] = String(
        bucket.sample.top[0].metrics[ProfilingESField.HostName] ||
          bucket.sample.top[0].metrics[ProfilingESField.HostIP] ||
          ''
      );
    }
  }

  let totalSampledStackTraces = aggregations.total_count.value ?? 0;
  totalSampledStackTraces = Math.floor(totalSampledStackTraces / eventsIndex.sampleRate);

  if (searchField !== ProfilingESField.StacktraceID) {
    return {
      TotalCount: totalSampledStackTraces,
      TopN: topN,
      Metadata: {},
      Labels: labels,
    };
  }

  const { stackTraces, executables, stackFrames } = await withProfilingSpan(
    'search_stacktraces',
    async () => {
      const stackTraceIDs: Set<string> = new Set<string>();
      for (let i = 0; i < groupByBuckets.length; i++) {
        stackTraceIDs.add(String(groupByBuckets[i].key));
      }

      const stackTraceKuery = [...stackTraceIDs].join(' or ');
      const stackTraceFilter = createCommonFilter({
        timeFrom,
        timeTo,
        kuery: stackTraceKuery,
      });

      const totalSeconds = timeTo - timeFrom;

      return searchStackTraces({
        client,
        filter: stackTraceFilter,
        sampleSize: targetSampleSize,
        durationSeconds: totalSeconds,
        showErrorFrames,
      });
    }
  );

  const metadata = await withProfilingSpan('collect_stackframe_metadata', async () => {
    return groupStackFrameMetadataByStackTrace(stackTraces, stackFrames, executables);
  });

  return {
    TotalCount: totalSampledStackTraces,
    TopN: topN,
    Metadata: metadata,
    Labels: labels,
  };
}

export function queryTopNCommon({
  logger,
  router,
  services: { createProfilingEsClient },
  pathName,
  searchField,
  highCardinality,
  dependencies,
}: RouteRegisterParameters & {
  pathName: string;
  searchField: string;
  highCardinality: boolean;
}) {
  const isServerless = dependencies.esCapabilities.serverless;
  router.get(
    {
      path: pathName,
      security: {
        authz: {
          requiredPrivileges: ['profiling'],
        },
      },
      options: { timeout: { idleSocket: IDLE_SOCKET_TIMEOUT } },
      validate: {
        query: schema.object({
          timeFrom: schema.number(),
          timeTo: schema.number(),
          kuery: schema.string({ maxLength: MAX_KUERY_LENGTH }),
        }),
      },
    },
    async (context, request, response) => {
      const { timeFrom, timeTo, kuery } = request.query;
      const [client, core] = await Promise.all([getClient(context), context.core]);

      const showErrorFrames = await core.uiSettings.client.get<boolean>(profilingShowErrorFrames);

      try {
        return response.ok({
          body: await topNElasticSearchQuery({
            client: createProfilingEsClient({ request, esClient: client }),
            logger,
            timeFrom,
            timeTo,
            searchField,
            highCardinality,
            kuery,
            showErrorFrames,
            preFilterShardSize: isServerless ? undefined : 1,
          }),
        });
      } catch (error) {
        return handleRouteHandlerError({
          error,
          logger,
          response,
          message: 'Error while fetching TopN functions',
        });
      }
    }
  );
}

export function registerTraceEventsTopNContainersSearchRoute(parameters: RouteRegisterParameters) {
  const paths = getRoutePaths();
  return queryTopNCommon({
    ...parameters,
    pathName: paths.TopNContainers,
    searchField: getFieldNameForTopNType(TopNType.Containers),
    highCardinality: false,
  });
}

export function registerTraceEventsTopNDeploymentsSearchRoute(parameters: RouteRegisterParameters) {
  const paths = getRoutePaths();
  return queryTopNCommon({
    ...parameters,
    pathName: paths.TopNDeployments,
    searchField: getFieldNameForTopNType(TopNType.Deployments),
    highCardinality: false,
  });
}

export function registerTraceEventsTopNHostsSearchRoute(parameters: RouteRegisterParameters) {
  const paths = getRoutePaths();
  return queryTopNCommon({
    ...parameters,
    pathName: paths.TopNHosts,
    searchField: getFieldNameForTopNType(TopNType.Hosts),
    highCardinality: false,
  });
}

export function registerTraceEventsTopNStackTracesSearchRoute(parameters: RouteRegisterParameters) {
  const paths = getRoutePaths();
  return queryTopNCommon({
    ...parameters,
    pathName: paths.TopNTraces,
    searchField: getFieldNameForTopNType(TopNType.Traces),
    highCardinality: false,
  });
}

export function registerTraceEventsTopNThreadsSearchRoute(parameters: RouteRegisterParameters) {
  const paths = getRoutePaths();
  return queryTopNCommon({
    ...parameters,
    pathName: paths.TopNThreads,
    searchField: getFieldNameForTopNType(TopNType.Threads),
    highCardinality: true,
  });
}

export function registerTraceEventsTopNExecutablesSearchRoute(parameters: RouteRegisterParameters) {
  const paths = getRoutePaths();
  return queryTopNCommon({
    ...parameters,
    pathName: paths.TopNExecutables,
    searchField: getFieldNameForTopNType(TopNType.Executables),
    highCardinality: true,
  });
}
