/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import moment from 'moment';
import { useMemo } from 'react';
import { getCalculateAutoTimeExpression } from '@kbn/data-plugin/common';
import type { TimeState } from '@kbn/es-query';
import type { IKibanaSearchRequest, IKibanaSearchResponse } from '@kbn/search-types';
import type { Streams, PhaseName } from '@kbn/streams-schema';
import type { ISearchStart } from '@kbn/data-plugin/public';
import type { CoreStart } from '@kbn/core/public';
import { lastValueFrom } from 'rxjs';
import { useKibana } from '../../../../../hooks/use_kibana';
import { useStreamsAppFetch } from '../../../../../hooks/use_streams_app_fetch';
import type { CalculatedStats } from '../helpers/get_calculated_stats';
import { useIlmPhasesColorAndDescription } from './use_ilm_phases_color_and_description';
import { getFailureStoreIndexName } from '../helpers/failure_store_index_name';

const TIMESTAMP_FIELD = '@timestamp';
const DEFAULT_SAMPLER_PROBABILITY = 0.1;
const STATISTICAL_ERROR_THRESHOLD = 0.01;

export interface StreamAggregations {
  buckets: Array<{ key: number; doc_count: number }>;
  interval: string;
}

// Calculate sampling probability based on total docs to keep statistical error below threshold
const getSamplingProbability = (totalDocs?: number): number => {
  if (!totalDocs) {
    // If it turns out there aren't many docs, we just restart without sampling - it will be fast anyway
    // If it turns out there are lots of docs then we were right, yay!
    return DEFAULT_SAMPLER_PROBABILITY;
  }

  // Calculate required sample size for 1% statistical error (simplified formula)
  // For large populations, sample size ≈ 1 / (error^2) for 95% confidence
  const requiredSampleSize = 1 / STATISTICAL_ERROR_THRESHOLD ** 2;

  if (totalDocs <= requiredSampleSize) {
    return 1; // No sampling needed
  }

  return DEFAULT_SAMPLER_PROBABILITY;
};

// some units are not supported for the fixed_interval of the date histogram
// this function uses the calculateAutoTimeExpression function to determine
// if the interval should be a calendar_interval or a fixed_interval
const getIntervalAndType = (
  timeState: TimeState,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  core: { uiSettings: { get: (key: string) => any } }
): { interval: string; intervalType: string } | undefined => {
  const interval = getCalculateAutoTimeExpression((key) => core.uiSettings.get(key))(
    timeState.asAbsoluteTimeRange
  );

  if (!interval) {
    return undefined;
  }

  const calendarIntervalUnits = new Set(['w', 'M', 'q', 'y']);

  const intervalType = calendarIntervalUnits.has(interval.replace(/^\d+/, ''))
    ? 'calendar_interval'
    : 'fixed_interval';

  return { interval, intervalType };
};

export const useIngestionRate = ({
  calculatedStats,
  timeState,
  isLoading,
  aggregations,
  error,
}: {
  calculatedStats?: CalculatedStats;
  timeState: TimeState;
  isLoading: boolean;
  aggregations?: StreamAggregations;
  error: Error | undefined;
}) => {
  const ingestionRate = useMemo(() => {
    if (!aggregations) {
      return undefined;
    }

    const start = moment(timeState.start);
    const end = moment(timeState.end);

    if (!aggregations || !aggregations.buckets || aggregations.buckets.length === 0) {
      return { start, end, interval: aggregations.interval, buckets: [] };
    }

    const { buckets, interval } = aggregations;

    return {
      start,
      end,
      interval,
      buckets: buckets.map(({ key, doc_count: docCount }) => ({
        key,
        value: docCount * (calculatedStats?.bytesPerDoc || 1),
      })),
    };
  }, [aggregations, timeState.start, timeState.end, calculatedStats?.bytesPerDoc]);

  return {
    ingestionRate,
    isLoading,
    error,
  };
};

type PhaseNameWithoutDelete = Exclude<PhaseName, 'delete'>;

export const useIngestionRatePerTier = ({
  definition,
  calculatedStats,
  timeState,
  isFailureStore = false,
}: {
  definition: Streams.ingest.all.GetResponse;
  calculatedStats?: CalculatedStats;
  timeState: TimeState;
  isFailureStore?: boolean;
}) => {
  const {
    core,
    dependencies: {
      start: {
        data,
        streams: { streamsRepositoryClient },
      },
    },
  } = useKibana();

  const { ilmPhases } = useIlmPhasesColorAndDescription();

  const ingestionRateFetch = useStreamsAppFetch(
    async ({ signal }) => {
      const intervalData = getIntervalAndType(timeState, core);

      if (!timeState.start || !timeState.end || !intervalData) {
        return;
      }

      const start = moment(timeState.start);
      const end = moment(timeState.end);

      const { interval, intervalType } = intervalData;

      const indexName = isFailureStore
        ? getFailureStoreIndexName(definition.stream.name)
        : definition.stream.name;

      const {
        rawResponse: { aggregations },
      } = await lastValueFrom(
        data.search.search<
          IKibanaSearchRequest,
          IKibanaSearchResponse<{
            aggregations:
              | {
                  sampler: {
                    docs_count: {
                      buckets: Array<{
                        key: number;
                        doc_count: number;
                        indices: { buckets: Array<{ key: string; doc_count: number }> };
                      }>;
                    };
                  };
                }
              | undefined;
          }>
        >(
          {
            params: {
              index: indexName,
              track_total_hits: false,
              body: {
                size: 0,
                query: {
                  bool: {
                    filter: [
                      {
                        range: {
                          [TIMESTAMP_FIELD]: {
                            gte: timeState.start,
                            lte: timeState.end,
                            format: 'epoch_millis',
                          },
                        },
                      },
                    ],
                  },
                },
                aggs: {
                  sampler: {
                    random_sampler: {
                      probability: DEFAULT_SAMPLER_PROBABILITY,
                      seed: 42,
                    },
                    aggs: {
                      docs_count: {
                        date_histogram: {
                          field: TIMESTAMP_FIELD,
                          [intervalType]: interval,
                          min_doc_count: 0,
                          extended_bounds: { min: timeState.start, max: timeState.end },
                        },
                        aggs: {
                          indices: {
                            terms: { field: '_index' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          { abortSignal: signal }
        )
      );

      if (!aggregations || aggregations.sampler.docs_count.buckets.length === 0) {
        return { start, end, interval, buckets: {} };
      }

      // For failure store, use simplified ILM logic since we can't use streams API with failure store selector
      const ilmExplain = isFailureStore
        ? { indices: {} } // Simplified for failure store
        : await streamsRepositoryClient.fetch('GET /internal/streams/{name}/lifecycle/_explain', {
            params: { path: { name: definition.stream.name } },
            signal,
          });

      const fallbackTier = 'hot';
      const buckets = aggregations.sampler.docs_count.buckets.reduce(
        (acc, { key, doc_count: docCount, indices }) => {
          if (docCount === 0) {
            // there's no data for this bucket. push an empty data point
            // so we still graph the timestamp.
            (acc[fallbackTier] = acc[fallbackTier] ?? []).push({ key, value: 0 });
            return acc;
          }

          const countByTier = indices.buckets.reduce((tiers, index) => {
            const explain = ilmExplain.indices[index.key];
            // For failure store, use fallback tier since ILM explain won't exist
            const tier =
              explain?.managed && explain?.phase && explain.phase in ilmPhases
                ? (explain.phase as PhaseNameWithoutDelete)
                : fallbackTier;
            tiers[tier] = (tiers[tier] ?? 0) + index.doc_count;
            return tiers;
          }, {} as Record<PhaseNameWithoutDelete, number>);

          for (const entry of Object.entries(countByTier)) {
            const tier = entry[0] as PhaseNameWithoutDelete;
            (acc[tier] = acc[tier] ?? []).push({
              key,
              value: entry[1] * (calculatedStats?.bytesPerDoc || 1),
            });
          }

          return acc;
        },
        {} as Record<PhaseNameWithoutDelete, Array<{ key: number; value: number }>>
      );

      return { start, end, interval, buckets };
    },
    [
      definition,
      calculatedStats,
      timeState,
      core,
      data.search,
      streamsRepositoryClient,
      ilmPhases,
      isFailureStore,
    ]
  );

  return {
    ingestionRate: ingestionRateFetch.value,
    isLoading: ingestionRateFetch.loading,
    error: ingestionRateFetch.error,
  };
};

export const getAggregations = async ({
  definition,
  timeState,
  totalDocs,
  isFailureStore = false,
  core,
  search,
  signal,
}: {
  definition: Streams.ingest.all.GetResponse;
  timeState: TimeState;
  totalDocs?: number;
  isFailureStore?: boolean;
  core: CoreStart;
  search: ISearchStart;
  signal: AbortSignal;
}) => {
  const samplingProbability = getSamplingProbability(totalDocs);

  const intervalData = getIntervalAndType(timeState, core);
  if (!intervalData) {
    return;
  }

  const { interval, intervalType } = intervalData;

  const indexName = isFailureStore
    ? getFailureStoreIndexName(definition.stream.name)
    : definition.stream.name;

  const {
    rawResponse: { aggregations },
  } = await lastValueFrom(
    search.search<
      IKibanaSearchRequest,
      IKibanaSearchResponse<{
        aggregations:
          | { sampler: { docs_count: { buckets: Array<{ key: number; doc_count: number }> } } }
          | undefined;
      }>
    >(
      {
        params: {
          index: indexName,
          track_total_hits: false,
          body: {
            size: 0,
            query: {
              bool: {
                filter: [
                  {
                    range: {
                      [TIMESTAMP_FIELD]: {
                        gte: timeState.start,
                        lte: timeState.end,
                      },
                    },
                  },
                ],
              },
            },
            aggs: {
              sampler: {
                random_sampler: {
                  probability: samplingProbability,
                  seed: 42,
                },
                aggs: {
                  docs_count: {
                    date_histogram: {
                      field: TIMESTAMP_FIELD,
                      [intervalType]: interval,
                      min_doc_count: 0,
                      extended_bounds: { min: timeState.start, max: timeState.end },
                    },
                  },
                },
              },
            },
          },
        },
      },
      { abortSignal: signal }
    )
  );

  return {
    buckets: aggregations?.sampler.docs_count.buckets || [],
    interval,
  };
};
