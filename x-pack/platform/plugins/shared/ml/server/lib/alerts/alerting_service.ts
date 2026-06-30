/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import { i18n } from '@kbn/i18n';
import rison from '@kbn/rison';
import type { Duration } from 'moment/moment';
import { capitalize, get, memoize, pick } from 'lodash';
import { fromKueryExpression, toElasticsearchQuery } from '@kbn/es-query';
import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import {
  FIELD_FORMAT_IDS,
  type IFieldFormat,
  type SerializedFieldFormat,
} from '@kbn/field-formats-plugin/common';
import { isDefined } from '@kbn/ml-is-defined';
import type { MlAnomaliesTableRecordExtended } from '@kbn/ml-anomaly-utils';
import {
  getEntityFieldName,
  getEntityFieldValue,
  type MlAnomalyRecordDoc,
  type MlAnomalyResultType,
  ML_ANOMALY_RESULT_TYPE,
  ML_JOB_AGGREGATION,
} from '@kbn/ml-anomaly-utils';
import type { AnomalyDateFunction } from '@kbn/ml-anomaly-utils/types';
import { getSpaceUrlPrefix, type SpaceId } from '@kbn/core-spaces-common';
import { ALERT_REASON, ALERT_URL } from '@kbn/rule-data-utils';
import type { MlJob } from '@elastic/elasticsearch/lib/api/types';
import { isPopulatedObject } from '@kbn/ml-is-populated-object';
import type {
  AlertExecutionResult,
  FormattedRecordAnomalyAlertDoc,
  InfluencerAnomalyAlertDoc,
  PreviewResponse,
  PreviewResultsKeys,
  RecordAnomalyAlertDoc,
  TopHitsResultsKeys,
  TopInfluencerAADDoc,
  TopRecordAADDoc,
} from '@kbn/ml-common-types/alerts';
import type { FieldFormatsRegistryProvider } from '@kbn/ml-common-types/kibana';
import { ANOMALY_RESULT_TYPE_SCORE_FIELDS } from '../../../common/constants/alerts';
import { formatTimeValue } from '../../../common/util/format_time_value';
import { getAnomalyDescription } from '../../../common/util/anomaly_description';
import { getMetricChangeDescription } from '../../../common/util/metric_change_description';
import type { MlClient } from '../ml_client';
import type {
  MlAnomalyDetectionAlertParams,
  MlAnomalyDetectionAlertPreviewRequest,
} from '../../routes/schemas/alerting_schema';
import type {
  AnomalyDetectionAlertContext,
  AnomalyDetectionAlertPayload,
} from './register_anomaly_detection_alert_type';
import { resolveMaxTimeInterval } from '../../../common/util/job_utils';
import { getTopNBuckets, resolveLookbackInterval } from '../../../common/util/alerts';
import type { DatafeedsService } from '../../models/job_service/datafeeds';
import { getTypicalAndActualValues } from '../../models/results_service/results_service';
import type { GetDataViewsService } from '../data_views_utils';
import { assertUserError } from './utils';

type AggResultsResponse = { key?: number } & {
  [key in PreviewResultsKeys]: {
    doc_count: number;
  } & {
    [hitsKey in TopHitsResultsKeys]: {
      hits: { hits: any[] };
    };
  };
};

interface AnomalyESQueryParams {
  resultType: MlAnomalyResultType;
  /** Appropriate score field for requested result type. */
  anomalyScoreField: string;
  anomalyScoreThreshold: number;
  jobIds: string[];
  topNBuckets: number;
  maxBucketInSeconds: number;
  lookBackTimeInterval: string;
  includeInterimResults: boolean;
  /** Source index from the datafeed. Required for retrieving field types for formatting results. */
  indexPattern: string;
  kqlQueryString?: string;
}

const TIME_RANGE_PADDING = 10;

/**
 * Parse KQL filter and convert to Elasticsearch Query DSL.
 */
function parseCustomKqlFilter(
  kqlQueryString: string | null | undefined
): QueryDslQueryContainer | undefined {
  if (!kqlQueryString) return undefined;

  try {
    const ast = fromKueryExpression(kqlQueryString);
    return toElasticsearchQuery(ast);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to parse custom KQL filter:', error);
    return undefined;
  }
}

/**
 * TODO Replace with URL generator when https://github.com/elastic/kibana/issues/59453 is resolved
 */
export function buildExplorerUrl(
  jobIds: string[],
  timeRange: { from: string; to: string; mode?: string },
  type: MlAnomalyResultType,
  spaceId: SpaceId,
  r?: AlertExecutionResult
): string {
  const isInfluencerResult = type === ML_ANOMALY_RESULT_TYPE.INFLUENCER;

  /**
   * Disabled until Anomaly Explorer page is fixed and properly
   * support single point time selection
   */
  const highlightSwimLaneSelection = false;

  const globalState = {
    ml: {
      jobIds,
    },
    time: {
      from: timeRange.from,
      to: timeRange.to,
      mode: timeRange.mode ?? 'absolute',
    },
  };

  const appState = {
    explorer: {
      mlExplorerFilter: {
        ...(r && isInfluencerResult
          ? {
              filterActive: true,
              filteredFields: [
                r.topInfluencers![0].influencer_field_name,
                r.topInfluencers![0].influencer_field_value,
              ],
              influencersFilterQuery: {
                bool: {
                  minimum_should_match: 1,
                  should: [
                    {
                      match_phrase: {
                        [r.topInfluencers![0].influencer_field_name]:
                          r.topInfluencers![0].influencer_field_value,
                      },
                    },
                  ],
                },
              },
              queryString: `${r.topInfluencers![0].influencer_field_name}:"${
                r.topInfluencers![0].influencer_field_value
              }"`,
            }
          : {}),
      },
      mlExplorerSwimlane: {
        ...(r && highlightSwimLaneSelection
          ? {
              selectedLanes: [
                isInfluencerResult ? r.topInfluencers![0].influencer_field_value : 'Overall',
              ],
              selectedTimes: r.timestampEpoch,
              selectedType: isInfluencerResult ? 'viewBy' : 'overall',
              ...(isInfluencerResult
                ? { viewByFieldName: r.topInfluencers![0].influencer_field_name }
                : {}),
              ...(isInfluencerResult ? {} : { showTopFieldValues: true }),
            }
          : {}),
      },
    },
  };

  const spacePathComponent = spaceId ? getSpaceUrlPrefix(spaceId) : '';

  return `${spacePathComponent}/app/ml/explorer/?_g=${encodeURIComponent(
    rison.encode(globalState)
  )}&_a=${encodeURIComponent(rison.encode(appState))}`;
}

export interface AnomalyDetectionAlertFieldFormatters {
  numberFormatter: IFieldFormat['convertToText'];
  dateFormatter?: IFieldFormat;
  fieldFormatters: Record<string, IFieldFormat['convertToText']>;
}

export interface AnomalyDetectionRuleState {
  contextFieldFormatters?: AnomalyDetectionAlertFieldFormatters;
}

const hasCurrentContextFieldFormatters = (
  formatters?: AnomalyDetectionAlertFieldFormatters
): formatters is AnomalyDetectionAlertFieldFormatters & { dateFormatter: IFieldFormat } => {
  // Rule state can rehydrate formatter caches created before `dateFormatter` was added.
  // Rebuild those stale caches so time-based alert values can be formatted consistently.
  return formatters?.dateFormatter !== undefined;
};

/**
 * Alerting related server-side methods
 * @param mlClient
 * @param datafeedsService
 */
export function alertingServiceProvider(
  mlClient: MlClient,
  datafeedsService: DatafeedsService,
  getFieldsFormatRegistry: FieldFormatsRegistryProvider,
  getDataViewsService: GetDataViewsService
) {
  let jobs: MlJob[] = [];

  let contextFieldFormatters: AnomalyDetectionAlertFieldFormatters | undefined;

  /**
   * Provides formatters based on the data view of the datafeed index pattern
   * and set of default formatters for fallback.
   */
  const getFormatters = memoize(async (indexPattern: string) => {
    const fieldFormatsRegistry = await getFieldsFormatRegistry();
    const numberFormatter = fieldFormatsRegistry.deserialize({ id: FIELD_FORMAT_IDS.NUMBER });
    const dateFormatter = fieldFormatsRegistry.deserialize({ id: FIELD_FORMAT_IDS.DATE });
    const fieldFormatMap = await getFieldsFormatMap(indexPattern);

    const fieldFormatters = fieldFormatMap
      ? Object.entries(fieldFormatMap).reduce((acc, [fieldName, config]) => {
          const formatter = fieldFormatsRegistry.deserialize(config);
          acc[fieldName] = (v: unknown) => formatter.convertToText(v);
          return acc;
        }, {} as Record<string, IFieldFormat['convertToText']>)
      : {};

    // store formatters to pass to the executor state update
    contextFieldFormatters = {
      numberFormatter: (v: unknown) => numberFormatter.convertToText(v),
      dateFormatter,
      fieldFormatters,
    };

    return contextFieldFormatters;
  });

  /**
   * Attempts to find a data view based on the index pattern
   */
  const getFieldsFormatMap = memoize(
    async (indexPattern: string): Promise<Record<string, SerializedFieldFormat> | undefined> => {
      try {
        const dataViewsService = await getDataViewsService();

        const dataViews = await dataViewsService.findLazy(indexPattern);
        const dataView = dataViews.find((dView) => dView.getIndexPattern() === indexPattern);

        if (!dataView) return;

        return dataView.fieldFormatMap;
      } catch (e) {
        return;
      }
    }
  );

  const getAggResultsLabel = (resultType: MlAnomalyResultType) => {
    return {
      aggGroupLabel: `${resultType}_results` as PreviewResultsKeys,
      topHitsLabel: `top_${resultType}_hits` as TopHitsResultsKeys,
    };
  };

  /**
   * Builds an agg query based on the requested result type.
   * @param resultType
   * @param severity
   */
  const getResultTypeAggRequest = (
    resultType: MlAnomalyResultType,
    severity: number,
    useInitialScore?: boolean
  ) => {
    const influencerScoreField = getScoreFields(ML_ANOMALY_RESULT_TYPE.INFLUENCER, useInitialScore);
    const recordScoreField = getScoreFields(ML_ANOMALY_RESULT_TYPE.RECORD, useInitialScore);
    const bucketScoreField = getScoreFields(ML_ANOMALY_RESULT_TYPE.BUCKET, useInitialScore);

    return {
      influencer_results: {
        filter: {
          range: {
            [influencerScoreField]: {
              gte: resultType === ML_ANOMALY_RESULT_TYPE.INFLUENCER ? severity : 0,
            },
          },
        },
        aggs: {
          top_influencer_hits: {
            top_hits: {
              sort: [
                {
                  [influencerScoreField]: {
                    order: 'desc',
                  },
                },
              ],
              _source: {
                includes: [
                  'result_type',
                  'timestamp',
                  'influencer_field_name',
                  'influencer_field_value',
                  'influencer_score',
                  'initial_influencer_score',
                  'is_interim',
                  'job_id',
                  'bucket_span',
                ],
              },
              size: 3,
            },
          },
        },
      },
      record_results: {
        filter: {
          range: {
            [recordScoreField]: {
              gte: resultType === ML_ANOMALY_RESULT_TYPE.RECORD ? severity : 0,
            },
          },
        },
        aggs: {
          top_record_hits: {
            top_hits: {
              sort: [
                {
                  [recordScoreField]: {
                    order: 'desc',
                  },
                },
              ],
              _source: {
                includes: [
                  'result_type',
                  'timestamp',
                  'record_score',
                  'initial_record_score',
                  'is_interim',
                  'function',
                  'function_description',
                  'field_name',
                  'by_field_name',
                  'by_field_value',
                  'over_field_name',
                  'over_field_value',
                  'partition_field_name',
                  'partition_field_value',
                  'job_id',
                  'detector_index',
                  'bucket_span',
                  'typical',
                  'actual',
                  'causes',
                ],
              },
              size: 3,
            },
          },
        },
      },
      ...(resultType === ML_ANOMALY_RESULT_TYPE.BUCKET
        ? {
            bucket_results: {
              filter: {
                range: {
                  [bucketScoreField]: {
                    gt: severity,
                  },
                },
              },
              aggs: {
                top_bucket_hits: {
                  top_hits: {
                    sort: [
                      {
                        [bucketScoreField]: {
                          order: 'desc',
                        },
                      },
                    ],
                    _source: {
                      includes: [
                        'job_id',
                        'result_type',
                        'timestamp',
                        'anomaly_score',
                        'initial_anomaly_score',
                        'is_interim',
                        'bucket_span',
                      ],
                    },
                    size: 1,
                  },
                },
              },
            },
          }
        : {}),
    };
  };

  /**
   * Provides a key for alert instance.
   */
  const getAlertInstanceKey = (source: MlAnomalyRecordDoc): string => {
    return source.job_id;
  };

  const getScoreFields = (resultType: MlAnomalyResultType, useInitialScore?: boolean) => {
    return `${useInitialScore ? 'initial_' : ''}${ANOMALY_RESULT_TYPE_SCORE_FIELDS[resultType]}`;
  };

  const getRecordKey = (source: MlAnomalyRecordDoc): string => {
    let alertInstanceKey = `${source.job_id}_${source.timestamp}`;

    const fieldName = getEntityFieldName(source);
    const fieldValue = getEntityFieldValue(source);
    const entity =
      fieldName !== undefined && fieldValue !== undefined ? `_${fieldName}_${fieldValue}` : '';
    alertInstanceKey += `_${source.detector_index}_${source.function}${entity}`;

    return alertInstanceKey;
  };

  const isTimeFunction = (functionName: string): functionName is AnomalyDateFunction => {
    return (
      functionName === ML_JOB_AGGREGATION.TIME_OF_DAY ||
      functionName === ML_JOB_AGGREGATION.TIME_OF_WEEK
    );
  };

  const formatAlertTimeValue = (
    value: number,
    source: MlAnomalyRecordDoc,
    formatters: AnomalyDetectionAlertFieldFormatters
  ) => {
    if (isTimeFunction(source.function) && formatters.dateFormatter) {
      const timezone = 'UTC';
      // `formatted` is the compact UI label from `formatTimeValue()`. Alerts need the
      // fully qualified UTC date/time, so build the notification string from the
      // resolved moment instead of reusing the shorter display text.
      const { moment: resolvedMoment } = formatTimeValue(value, source.function, source, timezone);
      const formattedDayOfWeek = resolvedMoment.format('ddd');
      const formattedDate = formatters.dateFormatter.convertToText(resolvedMoment.valueOf(), {
        timezone,
      });
      return `${formattedDayOfWeek} ${formattedDate} UTC`;
    }

    const fieldFormatter =
      source.field_name !== undefined ? formatters.fieldFormatters[source.field_name] : undefined;
    const formatter = fieldFormatter ?? formatters.numberFormatter;

    return formatter(value);
  };

  const getAlertMessage = (
    resultType: MlAnomalyResultType,
    source: Record<string, unknown>
  ): string => {
    let message = i18n.translate('xpack.ml.alertTypes.anomalyDetectionAlertingRule.alertMessage', {
      defaultMessage:
        'Alerts are raised based on real-time scores. Remember that scores may be adjusted over time as data continues to be analyzed.',
    });

    if (resultType === ML_ANOMALY_RESULT_TYPE.RECORD) {
      const recordSource = source as MlAnomalyRecordDoc;

      const detectorsByJob = jobs.reduce((acc, job) => {
        acc[job.job_id] = job.analysis_config.detectors.reduce((innterAcc, detector) => {
          innterAcc[detector.detector_index!] = detector.detector_description;
          return innterAcc;
        }, {} as Record<number, string | undefined>);
        return acc;
      }, {} as Record<string, Record<number, string | undefined>>);

      const detectorDescription = get(detectorsByJob, [
        recordSource.job_id,
        recordSource.detector_index,
      ]);

      const record = {
        source: recordSource,
        detector: detectorDescription ?? recordSource.function_description,
        severity: recordSource.record_score,
      } as MlAnomaliesTableRecordExtended;
      const entityName = getEntityFieldName(recordSource);
      if (entityName !== undefined) {
        record.entityName = entityName;
        record.entityValue = getEntityFieldValue(recordSource);
      }

      const { anomalyDescription, mvDescription } = getAnomalyDescription(record, {
        breakAutoLinkifyFieldName: true,
      });

      const anomalyDescriptionSummary = `${anomalyDescription}${
        mvDescription ? ` (${mvDescription})` : ''
      }`;

      let actual = recordSource.actual;
      let typical = recordSource.typical;
      if (
        (!isDefined(actual) || !isDefined(typical)) &&
        Array.isArray(recordSource.causes) &&
        recordSource.causes.length === 1
      ) {
        actual = recordSource.causes[0].actual;
        typical = recordSource.causes[0].typical;
      }

      let metricChangeDescription = '';
      if (isDefined(actual) && isDefined(typical)) {
        metricChangeDescription = capitalize(getMetricChangeDescription(actual, typical).message);
      }

      message = `${anomalyDescriptionSummary}. ${
        metricChangeDescription ? `${metricChangeDescription}.` : ''
      }`;
    }

    return message;
  };

  /**
   * Returns a callback for formatting elasticsearch aggregation response
   * to the alert-as-data document.
   * @param resultType
   */
  const getResultsToPayloadFormatter = (
    resultType: MlAnomalyResultType,
    useInitialScore: boolean = false
  ) => {
    const resultsLabel = getAggResultsLabel(resultType);

    return (
      v: AggResultsResponse
    ): Omit<AnomalyDetectionAlertPayload, typeof ALERT_URL> | undefined => {
      const aggTypeResults = v[resultsLabel.aggGroupLabel];
      if (aggTypeResults.doc_count === 0) {
        return;
      }
      const requestedAnomalies = aggTypeResults[resultsLabel.topHitsLabel].hits.hits;
      const topAnomaly = requestedAnomalies[0];
      const timestamp = topAnomaly._source.timestamp;

      const message = getAlertMessage(resultType, topAnomaly._source);

      return {
        [ALERT_REASON]: message,
        job_id: [...new Set(requestedAnomalies.map((h) => h._source.job_id))][0],
        is_interim: requestedAnomalies.some((h) => h._source.is_interim),
        anomaly_timestamp: timestamp,
        anomaly_score: [topAnomaly._source[getScoreFields(resultType, useInitialScore)]],
        top_records: v.record_results.top_record_hits.hits.hits.map((h) => {
          const { actual, typical } = getTypicalAndActualValues(h._source);
          return pick<RecordAnomalyAlertDoc>(
            {
              ...h._source,
              typical,
              actual,
            },
            [
              'job_id',
              'record_score',
              'initial_record_score',
              'detector_index',
              'is_interim',
              'timestamp',
              'partition_field_name',
              'partition_field_value',
              'function',
              'actual',
              'typical',
            ]
          ) as TopRecordAADDoc;
        }) as TopRecordAADDoc[],
        top_influencers: v.influencer_results.top_influencer_hits.hits.hits.map((influencerDoc) => {
          return pick<InfluencerAnomalyAlertDoc>(
            {
              ...influencerDoc._source,
            },
            [
              'job_id',
              'influencer_field_name',
              'influencer_field_value',
              'influencer_score',
              'initial_influencer_score',
              'is_interim',
              'timestamp',
            ]
          ) as TopInfluencerAADDoc;
        }) as TopInfluencerAADDoc[],
      };
    };
  };

  /**
   * Returns a callback for formatting elasticsearch aggregation response
   * to the alert context.
   * @param resultType
   */
  const getResultsToContextFormatter = (
    resultType: MlAnomalyResultType,
    useInitialScore: boolean = false,
    formatters: AnomalyDetectionAlertFieldFormatters
  ) => {
    const resultsLabel = getAggResultsLabel(resultType);
    return (v: AggResultsResponse): AlertExecutionResult | undefined => {
      const aggTypeResults = v[resultsLabel.aggGroupLabel];
      if (aggTypeResults.doc_count === 0) {
        return;
      }
      const requestedAnomalies = aggTypeResults[resultsLabel.topHitsLabel].hits.hits;
      const topAnomaly = requestedAnomalies[0];
      const alertInstanceKey = getAlertInstanceKey(topAnomaly._source);
      const timestamp = topAnomaly._source.timestamp;
      const bucketSpanInSeconds = topAnomaly._source.bucket_span;
      const message = getAlertMessage(resultType, topAnomaly._source);

      return {
        count: aggTypeResults.doc_count,
        key: v.key,
        message,
        alertInstanceKey,
        jobIds: [...new Set(requestedAnomalies.map((h) => h._source.job_id))],
        isInterim: requestedAnomalies.some((h) => h._source.is_interim),
        timestamp,
        timestampIso8601: new Date(timestamp).toISOString(),
        timestampEpoch: timestamp / 1000,
        score: Math.floor(topAnomaly._source[getScoreFields(resultType, useInitialScore)]),
        bucketRange: {
          start: new Date(
            timestamp - bucketSpanInSeconds * 1000 * TIME_RANGE_PADDING
          ).toISOString(),
          end: new Date(timestamp + bucketSpanInSeconds * 1000 * TIME_RANGE_PADDING).toISOString(),
        },
        topRecords: v.record_results.top_record_hits.hits.hits.map((h) => {
          const { actual, typical } = getTypicalAndActualValues(h._source);

          return {
            ...h._source,
            typical: typical?.map((t) => formatAlertTimeValue(t, h._source, formatters)),
            actual: actual?.map((a) => formatAlertTimeValue(a, h._source, formatters)),
            score: Math.floor(
              h._source[getScoreFields(ML_ANOMALY_RESULT_TYPE.RECORD, useInitialScore)]
            ),
            unique_key: getRecordKey(h._source),
          };
        }) as FormattedRecordAnomalyAlertDoc[],
        topInfluencers: v.influencer_results.top_influencer_hits.hits.hits.map((h) => {
          return {
            ...h._source,
            score: Math.floor(
              h._source[getScoreFields(ML_ANOMALY_RESULT_TYPE.INFLUENCER, useInitialScore)]
            ),
            unique_key: `${h._source.timestamp}_${h._source.influencer_field_name}_${h._source.influencer_field_value}`,
          };
        }) as InfluencerAnomalyAlertDoc[],
      };
    };
  };

  /**
   * Builds a request body
   * @param params - Alert params
   * @param previewTimeInterval - Relative time interval to test the alert condition
   * @param checkIntervalGap - Interval between alert executions
   */
  const fetchPreviewResults = async (
    params: MlAnomalyDetectionAlertParams,
    previewTimeInterval?: string,
    checkIntervalGap?: Duration
  ): Promise<AlertExecutionResult[] | undefined> => {
    const jobAndGroupIds = [
      ...(params.jobSelection.jobIds ?? []),
      ...(params.jobSelection.groupIds ?? []),
    ];

    // Extract jobs from group ids and make sure provided jobs assigned to a current space
    const jobsResponse = (await mlClient.getJobs({ job_id: jobAndGroupIds.join(',') })).jobs;

    jobs = jobsResponse;

    if (jobsResponse.length === 0) {
      // Probably assigned groups don't contain any jobs anymore.
      throw new Error("Couldn't find the job with provided id");
    }

    const maxBucket = resolveMaxTimeInterval(
      jobsResponse.map((v) => v.analysis_config.bucket_span!)
    );

    if (maxBucket === undefined) {
      // Technically it's not possible, just in case.
      throw new Error('Unable to resolve a valid bucket length');
    }

    /**
     * The check interval might be bigger than the 2x bucket span.
     * We need to check the biggest time range to make sure anomalies are not missed.
     */
    const lookBackTimeInterval = `${Math.max(
      // Double the max bucket span
      Math.round(maxBucket * 2),
      checkIntervalGap ? Math.round(checkIntervalGap.asSeconds()) : 0
    )}s`;

    const jobIds = jobsResponse.map((v) => v.job_id);

    const datafeeds = await datafeedsService.getDatafeedByJobId(jobIds);

    const parsedCustomFilter = parseCustomKqlFilter(params.kqlQueryString);

    const requestBody = {
      size: 0,
      query: {
        bool: {
          filter: [
            {
              terms: { job_id: jobIds },
            },
            {
              range: {
                timestamp: {
                  gte: `now-${previewTimeInterval ?? lookBackTimeInterval}`,
                  // Restricts data points to the current moment for preview
                  ...(previewTimeInterval ? { lte: 'now' } : {}),
                },
              },
            },
            {
              terms: {
                result_type: Object.values(ML_ANOMALY_RESULT_TYPE) as string[],
              },
            },
            ...(!params.includeInterim
              ? [
                  {
                    term: { is_interim: false },
                  },
                ]
              : []),
            ...(parsedCustomFilter ? [parsedCustomFilter] : []),
          ],
        },
      },
      aggs: previewTimeInterval
        ? {
            alerts_over_time: {
              date_histogram: {
                field: 'timestamp',
                fixed_interval: `${maxBucket}s`,
                // Ignore empty buckets
                min_doc_count: 1,
              },
              aggs: getResultTypeAggRequest(params.resultType, params.severity, true),
            },
          }
        : getResultTypeAggRequest(params.resultType, params.severity),
    };

    const body = await mlClient.anomalySearch(
      {
        // @ts-expect-error
        body: requestBody,
      },
      jobIds
    );

    const result = body.aggregations;

    const resultsLabel = getAggResultsLabel(params.resultType);

    const fieldsFormatters = hasCurrentContextFieldFormatters(contextFieldFormatters)
      ? contextFieldFormatters
      : await getFormatters(datafeeds![0]!.indices[0]);

    const formatter = getResultsToContextFormatter(
      params.resultType,
      !!previewTimeInterval,
      fieldsFormatters
    );

    return (
      previewTimeInterval
        ? (
            result as {
              alerts_over_time: {
                buckets: Array<
                  {
                    doc_count: number;
                    key: number;
                    key_as_string: string;
                  } & AggResultsResponse
                >;
              };
            }
          ).alerts_over_time.buckets
            // Filter out empty buckets
            .filter((v) => v.doc_count > 0 && v[resultsLabel.aggGroupLabel].doc_count > 0)
            // Map response
            .map(formatter)
        : [formatter(result as unknown as AggResultsResponse)]
    ).filter(isDefined);
  };

  /**
   * Gets ES query params for fetching anomalies.
   *
   * @param params {MlAnomalyDetectionAlertParams}
   * @return Params required for performing ES query for anomalies.
   */
  const getQueryParams = async (
    params: MlAnomalyDetectionAlertParams
  ): Promise<AnomalyESQueryParams | never> => {
    const jobAndGroupIds = [
      ...(params.jobSelection.jobIds ?? []),
      ...(params.jobSelection.groupIds ?? []),
    ];

    // Extract jobs from group ids and make sure provided jobs assigned to a current space
    const jobsResponse = (await mlClient.getJobs({ job_id: jobAndGroupIds.join(',') })).jobs;

    // Cache jobs response
    jobs = jobsResponse;

    if (jobsResponse.length === 0) {
      // Probably assigned groups don't contain any jobs anymore.
      throw Boom.notFound('Unable to find jobs for provided job ids');
    }

    const jobIds = jobsResponse.map((v) => v.job_id);

    const datafeeds = await datafeedsService.getDatafeedByJobId(jobIds);

    if (datafeeds && datafeeds.length === 0) {
      throw Boom.notFound('Unable to find datafeed for provided job ids');
    }

    const maxBucketInSeconds = resolveMaxTimeInterval(
      jobsResponse.map((v) => v.analysis_config.bucket_span!)
    );

    if (maxBucketInSeconds === undefined) {
      // Technically it's not possible, just in case.
      throw Boom.badRequest('Unable to resolve a valid bucket length');
    }

    const lookBackTimeInterval: string =
      params.lookbackInterval || resolveLookbackInterval(jobsResponse, datafeeds ?? []);

    const topNBuckets: number = params.topNBuckets ?? getTopNBuckets(jobsResponse[0]);

    return {
      jobIds,
      topNBuckets,
      maxBucketInSeconds,
      lookBackTimeInterval,
      anomalyScoreField: ANOMALY_RESULT_TYPE_SCORE_FIELDS[params.resultType],
      includeInterimResults: params.includeInterim,
      resultType: params.resultType,
      indexPattern: datafeeds![0]!.indices[0],
      anomalyScoreThreshold: params.severity,
      kqlQueryString: params.kqlQueryString ?? undefined,
    };
  };

  /**
   * Fetches the most recent anomaly according the top N buckets within the lookback interval
   * that satisfies a rule criteria.
   *
   * @param params - Alert params
   */
  const fetchResult = async (
    params: AnomalyESQueryParams
  ): Promise<AggResultsResponse | undefined> => {
    const {
      resultType,
      jobIds,
      maxBucketInSeconds,
      topNBuckets,
      lookBackTimeInterval,
      anomalyScoreField,
      includeInterimResults,
      anomalyScoreThreshold,
      kqlQueryString,
    } = params;

    const parsedCustomFilter = parseCustomKqlFilter(kqlQueryString);

    const requestBody = {
      size: 0,
      query: {
        bool: {
          filter: [
            {
              terms: { job_id: jobIds },
            },
            {
              terms: {
                result_type: Object.values(ML_ANOMALY_RESULT_TYPE) as string[],
              },
            },
            {
              range: {
                timestamp: {
                  gte: `now-${lookBackTimeInterval}`,
                  lte: 'now',
                },
              },
            },
            ...(!includeInterimResults
              ? [
                  {
                    term: { is_interim: false },
                  },
                ]
              : []),
            ...(parsedCustomFilter ? [parsedCustomFilter] : []),
          ],
        },
      },
      aggs: {
        alerts_over_time: {
          date_histogram: {
            field: 'timestamp',
            fixed_interval: `${maxBucketInSeconds}s`,
            order: {
              _key: 'desc' as const,
            },
          },
          aggs: {
            max_score: {
              max: {
                field: anomalyScoreField,
              },
            },
            ...getResultTypeAggRequest(resultType, anomalyScoreThreshold),
            truncate: {
              bucket_sort: {
                size: topNBuckets,
              },
            },
          },
        },
      },
    };

    const body = await mlClient.anomalySearch(
      {
        // @ts-expect-error
        body: requestBody,
      },
      jobIds
    );

    const result = body.aggregations as {
      alerts_over_time: {
        buckets: Array<
          {
            doc_count: number;
            key: number;
            key_as_string: string;
            max_score: {
              value: number;
            };
          } & AggResultsResponse
        >;
      };
    };

    if (result.alerts_over_time.buckets.length === 0) {
      return;
    }

    // Find the most anomalous result from the top N buckets
    const topResult = result.alerts_over_time.buckets.reduce((prev, current) =>
      prev.max_score.value > current.max_score.value ? prev : current
    );

    return topResult;
  };

  const getFormatted = async (
    indexPattern: string,
    resultType: MlAnomalyDetectionAlertParams['resultType'],
    spaceId: SpaceId,
    value: AggResultsResponse
  ): Promise<
    | { payload: AnomalyDetectionAlertPayload; context: AnomalyDetectionAlertContext; name: string }
    | undefined
  > => {
    const formatters = hasCurrentContextFieldFormatters(contextFieldFormatters)
      ? contextFieldFormatters
      : await getFormatters(indexPattern);

    const context = getResultsToContextFormatter(resultType, false, formatters)(value);
    const payload = getResultsToPayloadFormatter(resultType, false)(value);

    if (!context || !payload) return;

    const anomalyExplorerUrl = buildExplorerUrl(
      context.jobIds,
      { from: context.bucketRange.start, to: context.bucketRange.end },
      resultType,
      spaceId,
      context
    );

    return {
      payload: {
        ...payload,
        [ALERT_URL]: anomalyExplorerUrl,
      },
      context: {
        ...context,
        anomalyExplorerUrl,
      },
      name: context.alertInstanceKey,
    };
  };

  return {
    /**
     * Return the result of an alert condition execution.
     *
     * @param params - Alert params
     * @param spaceId
     */
    execute: async (
      params: MlAnomalyDetectionAlertParams,
      spaceId: SpaceId,
      state?: AnomalyDetectionRuleState
    ): Promise<
      | {
          payload: AnomalyDetectionAlertPayload;
          context: AnomalyDetectionAlertContext;
          name: string;
          isHealthy: boolean;
          stateUpdate: AnomalyDetectionRuleState;
        }
      | undefined
    > => {
      const queryParams = await getQueryParams(params).catch(assertUserError);

      const result = await fetchResult(queryParams);

      if (state && isPopulatedObject(state?.contextFieldFormatters)) {
        contextFieldFormatters = state.contextFieldFormatters;
      }

      const formattedResult = result
        ? await getFormatted(queryParams.indexPattern, queryParams.resultType, spaceId, result)
        : undefined;

      const stateUpdate: AnomalyDetectionRuleState = {
        contextFieldFormatters,
      };

      if (!formattedResult) {
        // If no anomalies found, report as recovered.

        const url = buildExplorerUrl(
          queryParams.jobIds,
          {
            from: `now-${queryParams.lookBackTimeInterval}`,
            to: 'now',
            mode: 'relative',
          },
          queryParams.resultType,
          spaceId
        );

        const contextMessage = i18n.translate(
          'xpack.ml.alertTypes.anomalyDetectionAlertingRule.recoveredMessage',
          {
            defaultMessage:
              'No anomalies have been found in the past {lookbackInterval} that exceed the severity threshold of {severity}.',
            values: {
              severity: queryParams.anomalyScoreThreshold,
              lookbackInterval: queryParams.lookBackTimeInterval,
            },
          }
        );

        const payloadMessage = i18n.translate(
          'xpack.ml.alertTypes.anomalyDetectionAlertingRule.recoveredReason',
          {
            defaultMessage:
              'No anomalies have been found in the consecutive bucket after the alert was triggered.',
          }
        );

        return {
          name: '',
          isHealthy: true,
          payload: {
            [ALERT_URL]: url,
            [ALERT_REASON]: payloadMessage,
            job_id: queryParams.jobIds[0],
          },
          context: {
            anomalyExplorerUrl: url,
            jobIds: queryParams.jobIds,
            message: contextMessage,
          } as AnomalyDetectionAlertContext,
          stateUpdate,
        };
      }

      return {
        context: formattedResult.context,
        payload: formattedResult.payload,
        name: formattedResult.name,
        isHealthy: false,
        stateUpdate,
      };
    },
    /**
     * Checks how often the alert condition will fire an alert instance
     * based on the provided relative time window.
     *
     * @param previewParams
     */
    preview: async ({
      alertParams,
      timeRange,
      sampleSize,
    }: MlAnomalyDetectionAlertPreviewRequest): Promise<PreviewResponse> => {
      const previewResults = await fetchPreviewResults(alertParams, timeRange);

      if (!previewResults) {
        throw Boom.notFound(`No results found`);
      }

      return {
        // sum of all alert responses within the time range
        count: previewResults.length,
        results: previewResults.slice(0, sampleSize),
      };
    },
  };
}

export type MlAlertingService = ReturnType<typeof alertingServiceProvider>;
