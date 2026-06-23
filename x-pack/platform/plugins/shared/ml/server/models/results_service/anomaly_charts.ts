/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ErrorType } from 'eventsource-parser';
import { each, find, get, keyBy, map, reduce, sortBy } from 'lodash';
import { extent, max, min } from 'd3';

import type { estypes } from '@elastic/elasticsearch';

import type { IScopedClusterClient } from '@kbn/core/server';
import { i18n } from '@kbn/i18n';
import { isPopulatedObject } from '@kbn/ml-is-populated-object';
import { isDefined } from '@kbn/ml-is-defined';
import {
  aggregationTypeTransform,
  getEntityFieldList,
  isMultiBucketAnomaly,
  type InfluencersFilterQuery,
  type MlAnomalyRecordDoc,
  type MlEntityField,
  type MlRecordForInfluencer,
  _DOC_COUNT,
  DOC_COUNT,
  ES_AGGREGATION,
  ML_JOB_AGGREGATION,
} from '@kbn/ml-anomaly-utils';
import { isRuntimeMappings } from '@kbn/ml-runtime-field-utils';
import { parseInterval } from '@kbn/ml-parse-interval';
import type { SeverityThreshold } from '@kbn/ml-server-schemas/embeddables/anomaly_charts';
import type { CriteriaField } from '@kbn/ml-anomaly-utils/types';
import type {
  MetricData,
  ModelPlotOutput,
  RecordsForCriteria,
  ScheduledEventsByBucket,
  SeriesConfigWithMetadata,
  ChartRecord,
  ChartPoint,
  SeriesConfig,
  ExplorerChartsData,
} from '@kbn/ml-common-types/results';
import type { CombinedJob } from '@kbn/ml-common-types/anomaly_detection_jobs/combined_job';
import type { Datafeed } from '@kbn/ml-common-types/anomaly_detection_jobs/datafeed';
import { getSeverityThresholdMax } from '../../../common/util/severity_threshold';

import {
  isMappableJob,
  isModelPlotChartableForDetector,
  isModelPlotEnabled,
  isSourceDataChartableForDetector,
  ML_MEDIAN_PERCENTS,
  mlFunctionToESAggregation,
} from '../../../common/util/job_utils';
import { getDatafeedAggregations } from '../../../common/util/datafeed_utils';
import { findAggField } from '../../../common/util/validation_utils';
import type { ChartType } from '../../../common/constants/charts';
import { CHART_TYPE, SCHEDULE_EVENT_MARKER_ENTITY } from '../../../common/constants/charts';
import { getChartType } from '../../../common/util/chart_utils';

import type { MlClient } from '../../lib/ml_client';
import type { MlJob } from '../..';

export function chartLimits(data: ChartPoint[] = []) {
  const domain = extent(data, (d) => {
    let metricValue = d.value as number;
    if (metricValue === null && d.anomalyScore !== undefined && d.actual !== undefined) {
      // If an anomaly coincides with a gap in the data, use the anomaly actual value.
      metricValue = Array.isArray(d.actual) ? d.actual[0] : d.actual;
    }
    return metricValue;
  });
  const limits = { max: domain[1], min: domain[0] };

  if (limits.max === limits.min) {
    // @ts-ignore
    limits.max = max(data, (d) => {
      if (d.typical) {
        return Math.max(d.value as number, ...d.typical);
      } else {
        // If analysis with by and over field, and more than one cause,
        // there will be no actual and typical value.
        // TODO - produce a better visual for population analyses.
        return d.value;
      }
    });
    // @ts-ignore
    limits.min = min(data, (d) => {
      if (d.typical) {
        return Math.min(d.value as number, ...d.typical);
      } else {
        // If analysis with by and over field, and more than one cause,
        // there will be no actual and typical value.
        // TODO - produce a better visual for population analyses.
        return d.value;
      }
    });
  }

  // add padding of 5% of the difference between max and min
  // if we ended up with the same value for both of them
  if (limits.max === limits.min) {
    const padding = limits.max * 0.05;
    limits.max += padding;
    limits.min -= padding;
  }

  return limits;
}

const CHART_MAX_POINTS = 500;
const MAX_SCHEDULED_EVENTS = 10; // Max number of scheduled events displayed per bucket.
const SAMPLER_TOP_TERMS_SHARD_SIZE = 20000;
const ENTITY_AGGREGATION_SIZE = 10;
const AGGREGATION_MIN_DOC_COUNT = 1;
const CARDINALITY_PRECISION_THRESHOLD = 100;
const USE_OVERALL_CHART_LIMITS = false;
const ML_TIME_FIELD_NAME = 'timestamp';

export interface ChartRange {
  min: number;
  max: number;
}

export function getDefaultChartsData(): ExplorerChartsData {
  return {
    chartsPerRow: 1,
    errorMessages: undefined,
    seriesToPlot: [],
    // default values, will update on every re-render
    tooManyBuckets: false,
    timeFieldName: 'timestamp',
  };
}

export function anomalyChartsDataProvider(mlClient: MlClient, client: IScopedClusterClient) {
  let handleError: (errorMsg: string, jobId: string) => void = () => {};

  async function fetchMetricData(
    index: string,
    entityFields: MlEntityField[],
    query: object | undefined,
    metricFunction: string | null, // ES aggregation name
    metricFieldName: string | undefined,
    summaryCountFieldName: string | undefined,
    timeFieldName: string,
    earliestMs: number,
    latestMs: number,
    intervalMs: number,
    datafeedConfig?: Datafeed
  ): Promise<MetricData> {
    const scriptFields = datafeedConfig?.script_fields;
    const aggFields = getDatafeedAggregations(datafeedConfig);

    // Build the criteria to use in the bool filter part of the request.
    // Add criteria for the time range, entity fields,
    // plus any additional supplied query.
    const shouldCriteria: object[] = [];

    const mustCriteria: object[] = [
      {
        range: {
          [timeFieldName]: {
            gte: earliestMs,
            lte: latestMs,
            format: 'epoch_millis',
          },
        },
      },
      ...(query ? [query] : []),
    ];

    entityFields.forEach((entity) => {
      if (entity.fieldValue && entity.fieldValue.toString().length !== 0) {
        mustCriteria.push({
          term: {
            [entity.fieldName]: entity.fieldValue,
          },
        });
      } else {
        // Add special handling for blank entity field values, checking for either
        // an empty string or the field not existing.
        shouldCriteria.push({
          bool: {
            must: [
              {
                term: {
                  [entity.fieldName]: '',
                },
              },
            ],
          },
        });
        shouldCriteria.push({
          bool: {
            must_not: [
              {
                exists: { field: entity.fieldName },
              },
            ],
          },
        });
      }
    });

    const esSearchRequest: estypes.SearchRequest = {
      index,
      query: {
        bool: {
          must: mustCriteria,
        },
      },
      aggs: {
        byTime: {
          date_histogram: {
            field: timeFieldName,
            fixed_interval: `${intervalMs}ms`,
            min_doc_count: 0,
          },
        },
      },
      ...(isRuntimeMappings(datafeedConfig?.runtime_mappings)
        ? { runtime_mappings: datafeedConfig?.runtime_mappings }
        : {}),
      size: 0,
      _source: false,
    };

    if (shouldCriteria.length > 0) {
      esSearchRequest.query!.bool!.should = shouldCriteria;
      esSearchRequest.query!.bool!.minimum_should_match = shouldCriteria.length / 2;
    }

    esSearchRequest.aggs!.byTime.aggs = Object.create(null);

    if (metricFieldName !== undefined && metricFieldName !== '' && metricFunction) {
      const metricAgg: any = {
        [metricFunction]: {},
      };
      if (scriptFields !== undefined && scriptFields[metricFieldName] !== undefined) {
        metricAgg[metricFunction].script = scriptFields[metricFieldName].script;
      } else {
        metricAgg[metricFunction].field = metricFieldName;
      }

      if (metricFunction === 'percentiles') {
        metricAgg[metricFunction].percents = [ML_MEDIAN_PERCENTS];
      }

      // when the field is an aggregation field, because the field doesn't actually exist in the indices
      // we need to pass all the sub aggs from the original datafeed config
      // so that we can access the aggregated field
      if (isPopulatedObject(aggFields)) {
        // first item under aggregations can be any name, not necessarily 'buckets'
        const accessor = Object.keys(aggFields)[0];
        const tempAggs = { ...(aggFields[accessor].aggs ?? aggFields[accessor].aggregations) };
        const foundValue = findAggField(tempAggs, metricFieldName);

        if (foundValue !== undefined) {
          tempAggs.metric = foundValue;
          delete tempAggs[metricFieldName];
        }
        esSearchRequest.aggs!.byTime.aggs = tempAggs;
      } else {
        esSearchRequest.aggs!.byTime.aggs!.metric = metricAgg;
      }
    } else {
      // if metricFieldName is not defined, it's probably a variation of the non zero count function
      // refer to buildConfigFromDetector
      if (summaryCountFieldName !== undefined && metricFunction === ES_AGGREGATION.CARDINALITY) {
        // if so, check if summaryCountFieldName is an aggregation field
        if (typeof aggFields === 'object' && Object.keys(aggFields).length > 0) {
          // first item under aggregations can be any name, not necessarily 'buckets'
          const accessor = Object.keys(aggFields)[0];
          const tempAggs = { ...(aggFields[accessor].aggs ?? aggFields[accessor].aggregations) };
          const foundCardinalityField = findAggField(tempAggs, summaryCountFieldName);
          if (foundCardinalityField !== undefined) {
            tempAggs.metric = foundCardinalityField;
          }
          esSearchRequest.aggs!.byTime.aggs = tempAggs;
        }
      }
    }

    const resp = await client?.asCurrentUser.search(esSearchRequest, { maxRetries: 0 });

    const obj: MetricData = { success: true, results: {} };
    // @ts-ignore
    const dataByTime = resp?.aggregations?.byTime?.buckets ?? [];
    dataByTime.forEach((dataForTime: any) => {
      if (metricFunction === 'count') {
        obj.results[dataForTime.key] = dataForTime.doc_count;
      } else {
        const value = dataForTime?.metric?.value;
        const values = dataForTime?.metric?.values;
        if (dataForTime.doc_count === 0) {
          // @ts-ignore
          obj.results[dataForTime.key] = null;
        } else if (value !== undefined) {
          obj.results[dataForTime.key] = value;
        } else if (values !== undefined) {
          // Percentiles agg currently returns NaN rather than null when none of the docs in the
          // bucket contain the field used in the aggregation
          // (see elasticsearch issue https://github.com/elastic/elasticsearch/issues/29066).
          // Store as null, so values can be handled in the same manner downstream as other aggs
          // (min, mean, max) which return null.
          const medianValues = values[ML_MEDIAN_PERCENTS];
          obj.results[dataForTime.key] = !isNaN(medianValues) ? medianValues : null;
        } else {
          // @ts-ignore
          obj.results[dataForTime.key] = null;
        }
      }
    });

    return obj;
  }

  /**
   * TODO Make an API endpoint (also used by the SMV).
   * @param jobId
   * @param detectorIndex
   * @param criteriaFields
   * @param earliestMs
   * @param latestMs
   * @param intervalMs
   * @param aggType
   */
  async function getModelPlotOutput(
    jobId: string,
    detectorIndex: number,
    criteriaFields: CriteriaField[],
    earliestMs: number,
    latestMs: number,
    intervalMs: number,
    aggType?: { min: any; max: any }
  ): Promise<ModelPlotOutput> {
    const obj: ModelPlotOutput = {
      success: true,
      results: {},
    };

    // if an aggType object has been passed in, use it.
    // otherwise default to min and max aggs for the upper and lower bounds
    const modelAggs =
      aggType === undefined
        ? { max: 'max', min: 'min' }
        : {
            max: aggType.max,
            min: aggType.min,
          };

    // Build the criteria to use in the bool filter part of the request.
    // Add criteria for the job ID and time range.
    const mustCriteria: object[] = [
      {
        term: { job_id: jobId },
      },
      {
        range: {
          timestamp: {
            gte: earliestMs,
            lte: latestMs,
            format: 'epoch_millis',
          },
        },
      },
    ];

    // Add in term queries for each of the specified criteria.
    each(criteriaFields, (criteria) => {
      mustCriteria.push({
        term: {
          [criteria.fieldName]: criteria.fieldValue,
        },
      });
    });

    // Add criteria for the detector index. Results from jobs created before 6.1 will not
    // contain a detector_index field, so use a should criteria with a 'not exists' check.
    const shouldCriteria = [
      {
        term: { detector_index: detectorIndex },
      },
      {
        bool: {
          must_not: [
            {
              exists: { field: 'detector_index' },
            },
          ],
        },
      },
    ];

    const searchRequest: estypes.SearchRequest = {
      size: 0,
      query: {
        bool: {
          filter: [
            {
              term: {
                result_type: 'model_plot',
              },
            },
            {
              bool: {
                must: mustCriteria,
                should: shouldCriteria,
                minimum_should_match: 1,
              },
            },
          ],
        },
      },
      aggs: {
        times: {
          date_histogram: {
            field: 'timestamp',
            fixed_interval: `${intervalMs}ms`,
            min_doc_count: 0,
          },
          aggs: {
            actual: {
              avg: {
                field: 'actual',
              },
            },
            modelUpper: {
              [modelAggs.max]: {
                field: 'model_upper',
              },
            },
            modelLower: {
              [modelAggs.min]: {
                field: 'model_lower',
              },
            },
          },
        },
      },
    };

    const resp = await mlClient.anomalySearch(searchRequest, [jobId]);

    const aggregationsByTime = get(resp, ['aggregations', 'times', 'buckets'], []);
    each(aggregationsByTime, (dataForTime: any) => {
      const time = dataForTime.key;
      const modelUpper: number | undefined = get(dataForTime, ['modelUpper', 'value']);
      const modelLower: number | undefined = get(dataForTime, ['modelLower', 'value']);
      const actual = get(dataForTime, ['actual', 'value']);

      obj.results[time] = {
        actual,
        modelUpper: modelUpper === undefined || isFinite(modelUpper) === false ? null : modelUpper,
        modelLower: modelLower === undefined || isFinite(modelLower) === false ? null : modelLower,
      };
    });

    return obj;
  }

  function processRecordsForDisplay(
    combinedJobRecords: Record<string, MlJob>,
    anomalyRecords: MlRecordForInfluencer[]
  ): { records: ChartRecord[]; errors: Record<string, Set<string>> | undefined } {
    // Aggregate the anomaly data by detector, and entity (by/over/partition).
    if (anomalyRecords.length === 0) {
      return { records: [], errors: undefined };
    }
    // Aggregate by job, detector, and analysis fields (partition, by, over).
    const aggregatedData: Record<string, any> = Object.create(null);

    const jobsErrorMessage: Record<string, string> = Object.create(null);
    each(anomalyRecords, (record) => {
      // Check if we can plot a chart for this record, depending on whether the source data
      // is chartable, and if model plot is enabled for the job.

      const job = combinedJobRecords[record.job_id];

      // if we already know this job has datafeed aggregations we cannot support
      // no need to do more checks
      if (jobsErrorMessage[record.job_id] !== undefined) {
        return;
      }

      let isChartable =
        isSourceDataChartableForDetector(job as CombinedJob, record.detector_index) ||
        isMappableJob(job as CombinedJob, record.detector_index);

      if (isChartable === false) {
        if (isModelPlotChartableForDetector(job, record.detector_index)) {
          // Check if model plot is enabled for this job.
          // Need to check the entity fields for the record in case the model plot config has a terms list.
          const entityFields = getEntityFieldList(record);
          if (isModelPlotEnabled(job, record.detector_index, entityFields)) {
            isChartable = true;
          } else {
            isChartable = false;
            jobsErrorMessage[record.job_id] = i18n.translate(
              'xpack.ml.timeSeriesJob.sourceDataNotChartableWithDisabledModelPlotMessage',
              {
                defaultMessage:
                  'source data is not viewable for this detector and model plot is disabled',
              }
            );
          }
        } else {
          jobsErrorMessage[record.job_id] = i18n.translate(
            'xpack.ml.timeSeriesJob.sourceDataModelPlotNotChartableMessage',
            {
              defaultMessage: 'both source data and model plot are not chartable for this detector',
            }
          );
        }
      }

      if (isChartable === false) {
        return;
      }
      const jobId = record.job_id;
      if (aggregatedData[jobId] === undefined) {
        aggregatedData[jobId] = Object.create(null);
      }
      const detectorsForJob = aggregatedData[jobId];

      const detectorIndex = record.detector_index;
      if (detectorsForJob[detectorIndex] === undefined) {
        detectorsForJob[detectorIndex] = Object.create(null);
      }

      // TODO - work out how best to display results from detectors with just an over field.
      const firstFieldName =
        record.partition_field_name ?? record.by_field_name ?? record.over_field_name;
      const firstFieldValue =
        record.partition_field_value ?? record.by_field_value ?? record.over_field_value;

      if (fieldsSafe([firstFieldName, firstFieldValue]) === false) {
        return;
      }

      if (firstFieldName !== undefined && firstFieldValue !== undefined) {
        const groupsForDetector = detectorsForJob[detectorIndex];

        if (groupsForDetector[firstFieldName] === undefined) {
          groupsForDetector[firstFieldName] = Object.create(null);
        }
        const valuesForGroup: Record<string, any> = groupsForDetector[firstFieldName];
        if (valuesForGroup[firstFieldValue] === undefined) {
          valuesForGroup[firstFieldValue] = Object.create(null);
        }

        const dataForGroupValue = valuesForGroup[firstFieldValue];

        let isSecondSplit = false;
        if (record.partition_field_name !== undefined) {
          const splitFieldName = record.over_field_name ?? record.by_field_name;
          if (splitFieldName !== undefined) {
            isSecondSplit = true;
          }
        }

        if (isSecondSplit === false) {
          if (dataForGroupValue.maxScoreRecord === undefined) {
            dataForGroupValue.maxScore = record.record_score;
            dataForGroupValue.maxScoreRecord = record;
          } else {
            if (record.record_score > dataForGroupValue.maxScore) {
              dataForGroupValue.maxScore = record.record_score;
              dataForGroupValue.maxScoreRecord = record;
            }
          }
        } else {
          // Aggregate another level for the over or by field.
          const secondFieldName = record.over_field_name ?? record.by_field_name;
          const secondFieldValue = record.over_field_value ?? record.by_field_value;

          if (
            secondFieldName === undefined ||
            secondFieldValue === undefined ||
            fieldsSafe([secondFieldName, secondFieldValue]) === false
          ) {
            return;
          }

          if (dataForGroupValue[secondFieldName] === undefined) {
            dataForGroupValue[secondFieldName] = Object.create(null);
          }

          const splitsForGroup = dataForGroupValue[secondFieldName];
          if (splitsForGroup[secondFieldValue] === undefined) {
            splitsForGroup[secondFieldValue] = Object.create(null);
          }

          const dataForSplitValue = splitsForGroup[secondFieldValue];
          if (dataForSplitValue.maxScoreRecord === undefined) {
            dataForSplitValue.maxScore = record.record_score;
            dataForSplitValue.maxScoreRecord = record;
          } else {
            if (record.record_score > dataForSplitValue.maxScore) {
              dataForSplitValue.maxScore = record.record_score;
              dataForSplitValue.maxScoreRecord = record;
            }
          }
        }
      } else {
        // Detector with no partition or by field.
        const dataForDetector = detectorsForJob[detectorIndex];
        if (dataForDetector.maxScoreRecord === undefined) {
          dataForDetector.maxScore = record.record_score;
          dataForDetector.maxScoreRecord = record;
        } else {
          if (record.record_score > dataForDetector.maxScore) {
            dataForDetector.maxScore = record.record_score;
            dataForDetector.maxScoreRecord = record;
          }
        }
      }
    });

    // Group job id by error message instead of by job:
    const errorMessages: Record<string, Set<string>> = Object.create(null);
    Object.keys(jobsErrorMessage).forEach((jobId) => {
      const msg = jobsErrorMessage[jobId];
      if (errorMessages[msg] === undefined) {
        errorMessages[msg] = new Set([jobId]);
      } else {
        errorMessages[msg].add(jobId);
      }
    });
    let recordsForSeries: ChartRecord[] = [];
    // Convert to an array of the records with the highest record_score per unique series.
    each(aggregatedData, (detectorsForJob) => {
      each(detectorsForJob, (groupsForDetector) => {
        if (groupsForDetector.errorMessage !== undefined) {
          recordsForSeries.push(groupsForDetector.errorMessage);
        } else {
          if (groupsForDetector.maxScoreRecord !== undefined) {
            // Detector with no partition / by field.
            recordsForSeries.push(groupsForDetector.maxScoreRecord);
          } else {
            each(groupsForDetector, (valuesForGroup) => {
              each(valuesForGroup, (dataForGroupValue) => {
                if (dataForGroupValue.maxScoreRecord !== undefined) {
                  recordsForSeries.push(dataForGroupValue.maxScoreRecord);
                } else {
                  // Second level of aggregation for partition and by/over.
                  each(dataForGroupValue, (splitsForGroup) => {
                    each(splitsForGroup, (dataForSplitValue) => {
                      recordsForSeries.push(dataForSplitValue.maxScoreRecord);
                    });
                  });
                }
              });
            });
          }
        }
      });
    });
    recordsForSeries = sortBy(recordsForSeries, 'record_score').reverse();

    return { records: recordsForSeries, errors: errorMessages };
  }

  function fieldsSafe(fields: Array<string | number | undefined>) {
    return fields.every((field) => {
      if (typeof field === 'string') {
        return field !== '__proto__' && field !== 'prototype';
      }
      return true;
    });
  }

  function buildConfigFromDetector(job: MlJob, detectorIndex: number) {
    const analysisConfig = job.analysis_config;
    const detector = analysisConfig.detectors[detectorIndex];

    const config: SeriesConfig = {
      jobId: job.job_id,
      detectorIndex,
      metricFunction:
        detector.function === ML_JOB_AGGREGATION.LAT_LONG
          ? ML_JOB_AGGREGATION.LAT_LONG
          : mlFunctionToESAggregation(detector.function),
      timeField: job.data_description.time_field!,
      // @ts-expect-error bucket_span is of type estypes.Duration
      interval: job.analysis_config.bucket_span,
      datafeedConfig: job.datafeed_config!,
      summaryCountFieldName: job.analysis_config.summary_count_field_name,
      metricFieldName: undefined,
    };

    if (detector.field_name !== undefined) {
      config.metricFieldName = detector.field_name;
    }

    // Extra checks if the job config uses a summary count field.
    const summaryCountFieldName = analysisConfig.summary_count_field_name;
    if (
      config.metricFunction === ES_AGGREGATION.COUNT &&
      summaryCountFieldName !== undefined &&
      summaryCountFieldName !== DOC_COUNT &&
      summaryCountFieldName !== _DOC_COUNT
    ) {
      // Check for a detector looking at cardinality (distinct count) using an aggregation.
      // The cardinality field will be in:
      // aggregations/<agg_name>/aggregations/<summaryCountFieldName>/cardinality/field
      // or aggs/<agg_name>/aggs/<summaryCountFieldName>/cardinality/field
      let cardinalityField;
      const topAgg = get(job.datafeed_config, 'aggregations') || get(job.datafeed_config, 'aggs');
      if (topAgg !== undefined && Object.values(topAgg).length > 0) {
        cardinalityField =
          get(Object.values(topAgg)[0], [
            'aggregations',
            summaryCountFieldName,
            ES_AGGREGATION.CARDINALITY,
            'field',
          ]) ||
          get(Object.values(topAgg)[0], [
            'aggs',
            summaryCountFieldName,
            ES_AGGREGATION.CARDINALITY,
            'field',
          ]);
      }
      if (
        (detector.function === ML_JOB_AGGREGATION.NON_ZERO_COUNT ||
          detector.function === ML_JOB_AGGREGATION.LOW_NON_ZERO_COUNT ||
          detector.function === ML_JOB_AGGREGATION.HIGH_NON_ZERO_COUNT ||
          detector.function === ML_JOB_AGGREGATION.COUNT ||
          detector.function === ML_JOB_AGGREGATION.HIGH_COUNT ||
          detector.function === ML_JOB_AGGREGATION.LOW_COUNT) &&
        cardinalityField !== undefined
      ) {
        config.metricFunction = ES_AGGREGATION.CARDINALITY;
        config.metricFieldName = undefined;
      } else {
        // For count detectors using summary_count_field, plot sum(summary_count_field_name)
        config.metricFunction = ES_AGGREGATION.SUM;
        config.metricFieldName = summaryCountFieldName;
      }
    }

    return config;
  }

  function buildConfig(record: ChartRecord, job: MlJob): SeriesConfigWithMetadata {
    const detectorIndex = record.detector_index;
    const config: Omit<
      SeriesConfigWithMetadata,
      'bucketSpanSeconds' | 'detectorLabel' | 'fieldName' | 'entityFields' | 'infoTooltip'
    > = {
      ...buildConfigFromDetector(job, detectorIndex),
    };

    const fullSeriesConfig: SeriesConfigWithMetadata = {
      bucketSpanSeconds: 0,
      entityFields: [],
      fieldName: '',
      ...config,
    };
    // Add extra properties used by the explorer dashboard charts.
    fullSeriesConfig.functionDescription = record.function_description;

    const parsedBucketSpan = parseInterval(job.analysis_config.bucket_span!);
    if (parsedBucketSpan !== null) {
      fullSeriesConfig.bucketSpanSeconds = parsedBucketSpan.asSeconds();
    }

    fullSeriesConfig.detectorLabel = record.function;
    const jobDetectors = job.analysis_config.detectors;
    if (jobDetectors) {
      fullSeriesConfig.detectorLabel = jobDetectors[detectorIndex].detector_description;
    } else {
      if (record.field_name !== undefined) {
        fullSeriesConfig.detectorLabel += ` ${fullSeriesConfig.fieldName}`;
      }
    }

    if (record.field_name !== undefined) {
      fullSeriesConfig.fieldName = record.field_name;
      fullSeriesConfig.metricFieldName = record.field_name;
    }

    // Add the 'entity_fields' i.e. the partition, by, over fields which
    // define the metric series to be plotted.
    fullSeriesConfig.entityFields = getEntityFieldList(record);

    if (record.function === ML_JOB_AGGREGATION.METRIC) {
      fullSeriesConfig.metricFunction = mlFunctionToESAggregation(record.function_description);
    }

    // Build the tooltip data for the chart info icon, showing further details on what is being plotted.
    let functionLabel = `${fullSeriesConfig.metricFunction ?? config.metricFunction}`;
    if (
      fullSeriesConfig.metricFieldName !== undefined &&
      fullSeriesConfig.metricFieldName !== null
    ) {
      functionLabel += `(${fullSeriesConfig.metricFieldName})`;
    }

    fullSeriesConfig.infoTooltip = {
      jobId: record.job_id,
      aggregationInterval: fullSeriesConfig.interval,
      chartFunction: functionLabel,
      entityFields: fullSeriesConfig.entityFields.map((f) => ({
        fieldName: f.fieldName,
        fieldValue: f.fieldValue,
      })),
    };

    return fullSeriesConfig;
  }

  function findChartPointForTime(chartData: ChartPoint[], time: number) {
    return chartData.find((point) => point.date === time);
  }

  function calculateChartRange(
    seriesConfigs: SeriesConfigWithMetadata[],
    selectedEarliestMs: number,
    selectedLatestMs: number,
    recordsToPlot: ChartRecord[],
    timeFieldName: string,
    optimumNumPoints: number,
    timeBounds: { min?: number; max?: number }
  ) {
    let tooManyBuckets = false;
    // Calculate the time range for the charts.
    // Fit in as many points in the available container width plotted at the job bucket span.
    // Look for the chart with the shortest bucket span as this determines
    // the length of the time range that can be plotted.
    const midpointMs = Math.ceil((selectedEarliestMs + selectedLatestMs) / 2);
    const minBucketSpanMs = Math.min.apply(null, map(seriesConfigs, 'bucketSpanSeconds')) * 1000;
    const maxBucketSpanMs = Math.max.apply(null, map(seriesConfigs, 'bucketSpanSeconds')) * 1000;

    const pointsToPlotFullSelection = Math.ceil(
      (selectedLatestMs - selectedEarliestMs) / minBucketSpanMs
    );

    // Increase actual number of points if we can't plot the selected range
    // at optimal point spacing.
    const plotPoints = Math.max(optimumNumPoints, pointsToPlotFullSelection);
    const halfPoints = Math.ceil(plotPoints / 2);
    const boundsMin = timeBounds.min;
    const boundsMax = timeBounds.max;
    let chartRange: ChartRange = {
      min: boundsMin
        ? Math.max(midpointMs - halfPoints * minBucketSpanMs, boundsMin)
        : midpointMs - halfPoints * minBucketSpanMs,
      max: boundsMax
        ? Math.min(midpointMs + halfPoints * minBucketSpanMs, boundsMax)
        : midpointMs + halfPoints * minBucketSpanMs,
    };

    if (plotPoints > CHART_MAX_POINTS) {
      // For each series being plotted, display the record with the highest score if possible.
      const maxTimeSpan = minBucketSpanMs * CHART_MAX_POINTS;
      let minMs = recordsToPlot[0][timeFieldName];
      let maxMs = recordsToPlot[0][timeFieldName];

      each(recordsToPlot, (record) => {
        const diffMs = maxMs - minMs;
        if (diffMs < maxTimeSpan) {
          const recordTime = record[timeFieldName];
          if (recordTime < minMs) {
            if (maxMs - recordTime <= maxTimeSpan) {
              minMs = recordTime;
            }
          }

          if (recordTime > maxMs) {
            if (recordTime - minMs <= maxTimeSpan) {
              maxMs = recordTime;
            }
          }
        }
      });

      if (maxMs - minMs < maxTimeSpan) {
        // Expand out before and after the span with the highest scoring anomalies,
        // covering as much as the requested time span as possible.
        // Work out if the high scoring region is nearer the start or end of the selected time span.
        const diff = maxTimeSpan - (maxMs - minMs);
        if (minMs - 0.5 * diff <= selectedEarliestMs) {
          minMs = Math.max(selectedEarliestMs, minMs - 0.5 * diff);
          maxMs = minMs + maxTimeSpan;
        } else {
          maxMs = Math.min(selectedLatestMs, maxMs + 0.5 * diff);
          minMs = maxMs - maxTimeSpan;
        }
      }

      chartRange = { min: minMs, max: maxMs };
    }

    // Elasticsearch aggregation returns points at start of bucket,
    // so align the min to the length of the longest bucket,
    // and use the start of the latest selected bucket in the check
    // for too many selected buckets, respecting the max bounds set in the view.
    chartRange.min = Math.floor(chartRange.min / maxBucketSpanMs) * maxBucketSpanMs;
    if (boundsMin !== undefined && chartRange.min < boundsMin) {
      chartRange.min = chartRange.min + maxBucketSpanMs;
    }

    // When used as an embeddable, selectedEarliestMs is the start date on the time picker,
    // which may be earlier than the time of the first point plotted in the chart (as we plot
    // the first full bucket with a start date no earlier than the start).
    const selectedEarliestBucketCeil = boundsMin
      ? Math.ceil(Math.max(selectedEarliestMs, boundsMin) / maxBucketSpanMs) * maxBucketSpanMs
      : Math.ceil(selectedEarliestMs / maxBucketSpanMs) * maxBucketSpanMs;

    const selectedLatestBucketStart = boundsMax
      ? Math.floor(Math.min(selectedLatestMs, boundsMax) / maxBucketSpanMs) * maxBucketSpanMs
      : Math.floor(selectedLatestMs / maxBucketSpanMs) * maxBucketSpanMs;

    if (
      (chartRange.min > selectedEarliestBucketCeil || chartRange.max < selectedLatestBucketStart) &&
      chartRange.max - chartRange.min < selectedLatestBucketStart - selectedEarliestBucketCeil
    ) {
      tooManyBuckets = true;
    }

    return {
      chartRange,
      tooManyBuckets,
    };
  }

  function initErrorHandler(errorMessages: Record<string, Set<string>> | undefined) {
    handleError = (errorMsg: string, jobId: string) => {
      // Group the jobIds by the type of error message
      if (!errorMessages) {
        errorMessages = Object.create(null);
      }

      if (errorMessages![errorMsg]) {
        errorMessages![errorMsg].add(jobId);
      } else {
        errorMessages![errorMsg] = new Set([jobId]);
      }
    };
  }

  async function getAnomalyData(
    combinedJobRecords: Record<string, MlJob>,
    anomalyRecords: ChartRecord[],
    selectedEarliestMs: number,
    selectedLatestMs: number,
    numberOfPoints: number,
    timeBounds: { min?: number; max?: number },
    severity: SeverityThreshold[],
    maxSeries = 6
  ) {
    const data = getDefaultChartsData();

    const filteredRecords = anomalyRecords.filter((record) => {
      return severity.some((threshold) => {
        const thresholdMax = getSeverityThresholdMax(threshold);

        return (
          Number(record.record_score) >= threshold.min &&
          (thresholdMax === undefined || Number(record.record_score) <= thresholdMax)
        );
      });
    });
    const { records: allSeriesRecords, errors: errorMessages } = processRecordsForDisplay(
      combinedJobRecords,
      filteredRecords
    );

    initErrorHandler(errorMessages);

    if (!Array.isArray(allSeriesRecords)) return;

    const recordsToPlot = allSeriesRecords.slice(0, maxSeries);
    const hasGeoData = recordsToPlot.find(
      (record) => (record.function_description || record.function) === ML_JOB_AGGREGATION.LAT_LONG
    );

    const seriesConfigs = recordsToPlot
      .filter((record) => record.job_id !== undefined)
      .map((record) => buildConfig(record, combinedJobRecords[record.job_id]));

    const seriesConfigsNoGeoData = [];

    const mapData: SeriesConfigWithMetadata[] = [];

    if (hasGeoData !== undefined) {
      for (let i = 0; i < seriesConfigs.length; i++) {
        const config = seriesConfigs[i];
        let records;
        if (
          (config.detectorLabel !== undefined &&
            config.detectorLabel.includes(ML_JOB_AGGREGATION.LAT_LONG)) ||
          config?.metricFunction === ML_JOB_AGGREGATION.LAT_LONG
        ) {
          if (config.entityFields.length) {
            records = [
              recordsToPlot.find((record) => {
                const entityFieldName = config.entityFields[0].fieldName;
                const entityFieldValue = config.entityFields[0].fieldValue;
                return (record[entityFieldName] && record[entityFieldName][0]) === entityFieldValue;
              }),
            ];
          } else {
            records = recordsToPlot;
          }

          mapData.push({
            ...config,
            loading: false,
            mapData: records,
          });
        } else {
          seriesConfigsNoGeoData.push(config);
        }
      }
    }

    const { chartRange, tooManyBuckets } = calculateChartRange(
      seriesConfigs as SeriesConfigWithMetadata[],
      selectedEarliestMs,
      selectedLatestMs,
      recordsToPlot,
      'timestamp',
      numberOfPoints,
      timeBounds
    );

    data.tooManyBuckets = tooManyBuckets;

    // first load and wait for required data,
    // only after that trigger data processing and page render.
    // TODO - if query returns no results e.g. source data has been deleted,
    // display a message saying 'No data between earliest/latest'.
    const seriesPromises: Array<
      Promise<[MetricData, RecordsForCriteria, ScheduledEventsByBucket, any]>
    > = [];
    // Use seriesConfigs list without geo data config so indices match up after seriesPromises are resolved
    // and we map through the responses
    const seriesConfigsForPromises = hasGeoData ? seriesConfigsNoGeoData : seriesConfigs;
    seriesConfigsForPromises.forEach((seriesConfig) => {
      const job = combinedJobRecords[seriesConfig.jobId];
      seriesPromises.push(
        Promise.all([
          getMetricData(seriesConfig, chartRange, job),
          getRecordsForCriteriaChart(seriesConfig, chartRange),
          getScheduledEvents(seriesConfig, chartRange),
          getEventDistribution(seriesConfig, chartRange),
        ])
      );
    });

    const response = await Promise.all(seriesPromises);

    function processChartData(
      responses: [MetricData, RecordsForCriteria, ScheduledEventsByBucket, any],
      seriesIndex: number
    ) {
      const metricData = responses[0].results;
      const records = responses[1].records;
      const jobId = seriesConfigsForPromises[seriesIndex].jobId;
      const scheduledEvents = responses[2].events[jobId];
      const eventDistribution = responses[3];
      const chartType = getChartType(seriesConfigsForPromises[seriesIndex]);

      // Sort records in ascending time order matching up with chart data
      records.sort((recordA, recordB) => {
        return recordA[ML_TIME_FIELD_NAME] - recordB[ML_TIME_FIELD_NAME];
      });

      // Return dataset in format used by the chart.
      // i.e. array of Objects with keys date (timestamp), value,
      //    plus anomalyScore for points with anomaly markers.
      let chartData: ChartPoint[] = [];
      if (metricData !== undefined) {
        if (records.length > 0) {
          const filterField = records[0].by_field_value ?? records[0].over_field_value;
          if (eventDistribution && eventDistribution.length > 0) {
            chartData = eventDistribution.filter((d: { entity: any }) => d.entity !== filterField);
          }
          map(metricData, (value, time) => {
            // The filtering for rare/event_distribution charts needs to be handled
            // differently because of how the source data is structured.
            // For rare chart values we are only interested wether a value is either `0` or not,
            // `0` acts like a flag in the chart whether to display the dot/marker.
            // For single metric chart, we need to pass null values to display data gaps.
            // All other charts are distribution based and with
            // those a value of `null` acts as the flag to hide a data point.
            if (
              chartType === CHART_TYPE.SINGLE_METRIC ||
              (chartType === CHART_TYPE.EVENT_DISTRIBUTION && value > 0) ||
              (chartType !== CHART_TYPE.EVENT_DISTRIBUTION && value !== null)
            ) {
              chartData.push({
                date: +time,
                value,
                entity: filterField,
              });
            }
          });
        } else {
          chartData = map(metricData, (value, time) => ({
            date: +time,
            value,
          }));
        }
      }

      // Iterate through the anomaly records, adding anomalyScore properties
      // to the chartData entries for anomalous buckets.
      const chartDataForPointSearch = getChartDataForPointSearch(chartData, records[0], chartType);
      let shouldSortChartData = false;
      each(records, (record) => {
        // Look for a chart point with the same time as the record.
        // If none found, insert a point for anomalies due to a gap in the data.
        const recordTime = record[ML_TIME_FIELD_NAME];
        let chartPoint = findChartPointForTime(chartDataForPointSearch, recordTime);
        if (chartPoint === undefined) {
          chartPoint = { date: recordTime, value: null };
          chartData.push(chartPoint);
          shouldSortChartData = true;
        }
        if (chartPoint !== undefined) {
          chartPoint.anomalyScore = record.record_score;

          // If it is an empty chart point, set the value to the actual value
          // To properly display the anomaly marker on the chart
          if (chartPoint.value === null) {
            chartPoint.value = Array.isArray(record.actual) ? record.actual[0] : record.actual;
          }

          if (record.actual !== undefined) {
            chartPoint.actual = record.actual;
            chartPoint.typical = record.typical;
          } else {
            const causes = get(record, 'causes', []);
            if (causes.length > 0) {
              chartPoint.byFieldName = record.by_field_name;
              chartPoint.numberOfCauses = causes.length;
              if (causes.length === 1) {
                // If only a single cause, copy actual and typical values to the top level.
                const cause = record.causes[0];
                chartPoint.actual = cause.actual;
                chartPoint.typical = cause.typical;
              }
            }
          }

          if (
            record.anomaly_score_explanation !== undefined &&
            record.anomaly_score_explanation.multi_bucket_impact !== undefined
          ) {
            chartPoint.multiBucketImpact = record.anomaly_score_explanation.multi_bucket_impact;
          }

          chartPoint.isMultiBucketAnomaly = isMultiBucketAnomaly(record);
        }
      });

      // Chart data is sorted by default, but if we added points for anomalies,
      // we need to sort again to ensure the points are in the correct order.
      if (shouldSortChartData) {
        chartData.sort((a, b) => a.date - b.date);
      }

      // Add a scheduledEvents property to any points in the chart data set
      // which correspond to times of scheduled events for the job.
      if (scheduledEvents !== undefined) {
        each(scheduledEvents, (events, time) => {
          const chartPoint = findChartPointForTime(chartDataForPointSearch, Number(time));
          if (chartPoint !== undefined) {
            chartPoint.scheduledEvents = events;
          } else {
            // If there's no underlying metric data point for the scheduled event,
            // create a new chart point with a value of 0.
            // Except for Single Metric Charts, where we want to create a point at the bottom of the chart.
            // Which is not always `0`.
            const eventChartPoint: ChartPoint = {
              date: Number(time),
              value: chartType === CHART_TYPE.SINGLE_METRIC ? null : 0,
              entity: SCHEDULE_EVENT_MARKER_ENTITY,
              scheduledEvents: events,
            };
            chartData.push(eventChartPoint);
          }
        });
      }

      return chartData;
    }

    function getChartDataForPointSearch(
      chartData: ChartPoint[],
      record: MlAnomalyRecordDoc,
      chartType: ChartType
    ) {
      if (
        chartType === CHART_TYPE.EVENT_DISTRIBUTION ||
        chartType === CHART_TYPE.POPULATION_DISTRIBUTION
      ) {
        return chartData.filter((d) => {
          return d.entity === (record && (record.by_field_value ?? record.over_field_value));
        });
      }

      return chartData;
    }

    // calculate an overall min/max for all series
    const processedData = response.map(processChartData);
    const allDataPoints = reduce(
      processedData,
      (datapoints, series) => {
        each(series, (d) => datapoints.push(d));
        return datapoints;
      },
      [] as ChartPoint[]
    );
    const overallChartLimits = chartLimits(allDataPoints);

    const seriesToPlot = response
      // Don't show the charts if there was an issue retrieving metric or anomaly data
      .filter((r) => r[0]?.success === true && r[1]?.success === true)
      .map((d, i) => {
        return {
          ...seriesConfigsForPromises[i],
          loading: false,
          chartData: processedData[i],
          plotEarliest: chartRange.min,
          plotLatest: chartRange.max,
          selectedEarliest: selectedEarliestMs,
          selectedLatest: selectedLatestMs,
          // FIXME can we remove this?
          chartLimits: USE_OVERALL_CHART_LIMITS
            ? overallChartLimits
            : chartLimits(processedData[i]),
        };
      });

    if (mapData.length) {
      // push map data in if it's available
      // @ts-ignore
      seriesToPlot.push(...mapData);
    }

    data.seriesToPlot = seriesToPlot;

    data.errorMessages = errorMessages
      ? Object.entries(errorMessages!).reduce((acc, [errorMessage, jobs]) => {
          acc[errorMessage] = Array.from(jobs);
          return acc;
        }, {} as Record<string, string[]>)
      : undefined;

    return data;
  }

  async function getMetricData(
    config: SeriesConfigWithMetadata,
    range: ChartRange,
    job: MlJob
  ): Promise<MetricData> {
    const { jobId, detectorIndex, entityFields, bucketSpanSeconds } = config;

    // If the job uses aggregation or scripted fields, and if it's a config we don't support
    // use model plot data if model plot is enabled
    // else if source data can be plotted, use that, otherwise model plot will be available.
    // @ts-expect-error
    const useSourceData = isSourceDataChartableForDetector(job, detectorIndex);

    if (useSourceData) {
      const datafeedQuery = get(config, 'datafeedConfig.query');

      try {
        return await fetchMetricData(
          Array.isArray(config.datafeedConfig.indices)
            ? config.datafeedConfig.indices.join()
            : config.datafeedConfig.indices,
          entityFields,
          datafeedQuery,
          config.metricFunction,
          config.metricFieldName,
          config.summaryCountFieldName,
          config.timeField,
          range.min,
          range.max,
          bucketSpanSeconds * 1000,
          config.datafeedConfig
        );
      } catch (error) {
        handleError(
          i18n.translate('xpack.ml.timeSeriesJob.metricDataErrorMessage', {
            defaultMessage: 'an error occurred while retrieving metric data',
          }),
          job.job_id
        );
        return { success: false, results: {}, error: error as ErrorType };
      }
    } else {
      // Extract the partition, by, over fields on which to filter.
      const criteriaFields: CriteriaField[] = [];
      const detector = job.analysis_config.detectors[detectorIndex];
      if (detector.partition_field_name !== undefined) {
        const partitionEntity = find(entityFields, {
          fieldName: detector.partition_field_name,
        });
        if (partitionEntity !== undefined) {
          criteriaFields.push(
            { fieldName: 'partition_field_name', fieldValue: partitionEntity.fieldName },
            { fieldName: 'partition_field_value', fieldValue: partitionEntity.fieldValue }
          );
        }
      }

      if (detector.over_field_name !== undefined) {
        const overEntity = find(entityFields, { fieldName: detector.over_field_name });
        if (overEntity !== undefined) {
          criteriaFields.push(
            { fieldName: 'over_field_name', fieldValue: overEntity.fieldName },
            { fieldName: 'over_field_value', fieldValue: overEntity.fieldValue }
          );
        }
      }

      if (detector.by_field_name !== undefined) {
        const byEntity = find(entityFields, { fieldName: detector.by_field_name });
        if (byEntity !== undefined) {
          criteriaFields.push(
            { fieldName: 'by_field_name', fieldValue: byEntity.fieldName },
            { fieldName: 'by_field_value', fieldValue: byEntity.fieldValue }
          );
        }
      }

      const obj = {
        success: true,
        results: {} as Record<string, number>,
      };

      try {
        const resp = await getModelPlotOutput(
          jobId,
          detectorIndex,
          criteriaFields,
          range.min,
          range.max,
          bucketSpanSeconds * 1000
        );
        // Return data in format required by the explorer charts.
        const results = resp.results;
        Object.keys(results).forEach((time) => {
          obj.results[time] = results[time].actual;
        });

        return obj;
      } catch (error) {
        handleError(
          i18n.translate('xpack.ml.timeSeriesJob.modelPlotDataErrorMessage', {
            defaultMessage: 'an error occurred while retrieving model plot data',
          }),
          job.job_id
        );

        return { success: false, results: {}, error: error as ErrorType };
      }
    }
  }

  /**
   * TODO make an endpoint
   */
  async function getScheduledEventsByBucket(
    jobIds: string[],
    earliestMs: number,
    latestMs: number,
    intervalMs: number,
    maxJobs: number,
    maxEvents: number
  ): Promise<ScheduledEventsByBucket> {
    const obj: ScheduledEventsByBucket = {
      success: true,
      events: {},
    };

    // Build the criteria to use in the bool filter part of the request.
    // Adds criteria for the time range plus any specified job IDs.
    const boolCriteria: any[] = [
      {
        range: {
          timestamp: {
            gte: earliestMs,
            lte: latestMs,
            format: 'epoch_millis',
          },
        },
      },
      {
        exists: { field: 'scheduled_events' },
      },
    ];

    if (jobIds && jobIds.length > 0 && !(jobIds.length === 1 && jobIds[0] === '*')) {
      let jobIdFilterStr = '';
      each(jobIds, (jobId, i) => {
        jobIdFilterStr += `${i > 0 ? ' OR ' : ''}job_id:${jobId}`;
      });
      boolCriteria.push({
        query_string: {
          analyze_wildcard: false,
          query: jobIdFilterStr,
        },
      });
    }

    const searchRequest: estypes.SearchRequest = {
      size: 0,
      query: {
        bool: {
          filter: [
            {
              term: {
                result_type: 'bucket',
              },
            },
            {
              bool: {
                must: boolCriteria,
              },
            },
          ],
        },
      },
      aggs: {
        jobs: {
          terms: {
            field: 'job_id',
            min_doc_count: 1,
            size: maxJobs,
          },
          aggs: {
            times: {
              date_histogram: {
                field: 'timestamp',
                fixed_interval: `${intervalMs}ms`,
                min_doc_count: 1,
              },
              aggs: {
                events: {
                  terms: {
                    field: 'scheduled_events',
                    size: maxEvents,
                  },
                },
              },
            },
          },
        },
      },
    };

    const resp = await mlClient.anomalySearch(searchRequest, jobIds);

    const dataByJobId = get(resp, ['aggregations', 'jobs', 'buckets'], []);
    each(dataByJobId, (dataForJob: any) => {
      const jobId: string = dataForJob.key;
      const resultsForTime: Record<string, any> = Object.create(null);
      const dataByTime = get(dataForJob, ['times', 'buckets'], []);
      each(dataByTime, (dataForTime: any) => {
        const time: string = dataForTime.key;
        const events: any[] = get(dataForTime, ['events', 'buckets']);
        resultsForTime[time] = events.map((e) => e.key);
      });
      obj.events[jobId] = resultsForTime;
    });

    return obj;
  }

  async function getScheduledEvents(config: SeriesConfigWithMetadata, range: ChartRange) {
    try {
      return await getScheduledEventsByBucket(
        [config.jobId],
        range.min,
        range.max,
        config.bucketSpanSeconds * 1000,
        1,
        MAX_SCHEDULED_EVENTS
      );
    } catch (error) {
      handleError(
        i18n.translate('xpack.ml.timeSeriesJob.scheduledEventsByBucketErrorMessage', {
          defaultMessage: 'an error occurred while retrieving scheduled events',
        }),
        config.jobId
      );
      return { success: false, events: {}, error: error as ErrorType };
    }
  }

  async function getEventDistributionData(
    index: string,
    splitField: MlEntityField | undefined | null,
    filterField: MlEntityField | undefined | null,
    query: any,
    metricFunction: string | undefined | null, // ES aggregation name
    metricFieldName: string | undefined,
    timeFieldName: string,
    earliestMs: number,
    latestMs: number,
    intervalMs: number
  ): Promise<any> {
    if (splitField === undefined) {
      return [];
    }

    // Build the criteria to use in the bool filter part of the request.
    // Add criteria for the time range, entity fields,
    // plus any additional supplied query.
    const mustCriteria = [];

    mustCriteria.push({
      range: {
        [timeFieldName]: {
          gte: earliestMs,
          lte: latestMs,
          format: 'epoch_millis',
        },
      },
    });

    if (query) {
      mustCriteria.push(query);
    }

    if (!!filterField) {
      mustCriteria.push({
        term: {
          [filterField.fieldName]: filterField.fieldValue,
        },
      });
    }

    const body: estypes.SearchRequest = {
      index,
      track_total_hits: true,
      query: {
        // using function_score and random_score to get a random sample of documents.
        // otherwise all documents would have the same score and the sampler aggregation
        // would pick the first N documents instead of a random set.
        function_score: {
          query: {
            bool: {
              must: mustCriteria,
            },
          },
          functions: [
            {
              random_score: {
                // static seed to get same randomized results on every request
                seed: 10,
                field: '_seq_no',
              },
            },
          ],
        },
      },
      size: 0,
      aggs: {
        sample: {
          sampler: {
            shard_size: SAMPLER_TOP_TERMS_SHARD_SIZE,
          },
          aggs: {
            byTime: {
              date_histogram: {
                field: timeFieldName,
                fixed_interval: `${intervalMs}ms`,
                min_doc_count: AGGREGATION_MIN_DOC_COUNT,
              },
              aggs: {
                entities: {
                  terms: {
                    field: splitField?.fieldName,
                    size: ENTITY_AGGREGATION_SIZE,
                    min_doc_count: AGGREGATION_MIN_DOC_COUNT,
                  },
                },
              },
            },
          },
        },
      },
    };

    if (
      metricFieldName !== undefined &&
      metricFieldName !== '' &&
      typeof metricFunction === 'string'
    ) {
      // @ts-ignore
      body.aggs.sample.aggs.byTime.aggs.entities.aggs = Object.create(null);

      const metricAgg = {
        [metricFunction]: {
          field: metricFieldName,
        },
      };

      if (metricFunction === 'percentiles') {
        // @ts-ignore
        metricAgg[metricFunction].percents = [ML_MEDIAN_PERCENTS];
      }

      if (metricFunction === 'cardinality') {
        // @ts-ignore
        metricAgg[metricFunction].precision_threshold = CARDINALITY_PRECISION_THRESHOLD;
      }
      // @ts-ignore
      body.aggs.sample.aggs.byTime.aggs.entities.aggs.metric = metricAgg;
    }

    const resp = await client!.asCurrentUser.search(body, { maxRetries: 0 });

    // Because of the sampling, results of metricFunctions which use sum or count
    // can be significantly skewed. Taking into account totalHits we calculate a
    // a factor to normalize results for these metricFunctions.
    // @ts-ignore
    const totalHits = resp.hits.total.value;
    const successfulShards = get(resp, ['_shards', 'successful'], 0);

    let normalizeFactor = 1;
    if (totalHits > successfulShards * SAMPLER_TOP_TERMS_SHARD_SIZE) {
      normalizeFactor = totalHits / (successfulShards * SAMPLER_TOP_TERMS_SHARD_SIZE);
    }

    const dataByTime = get(resp, ['aggregations', 'sample', 'byTime', 'buckets'], []);
    // @ts-ignore
    const data = dataByTime.reduce((d, dataForTime) => {
      const date = +dataForTime.key;
      const entities = get(dataForTime, ['entities', 'buckets'], []);
      // @ts-ignore
      entities.forEach((entity) => {
        let value = metricFunction === 'count' ? entity.doc_count : entity.metric.value;

        if (
          metricFunction === 'count' ||
          metricFunction === 'cardinality' ||
          metricFunction === 'sum'
        ) {
          value = value * normalizeFactor;
        }

        d.push({
          date,
          entity: entity.key,
          value,
        });
      });
      return d;
    }, [] as any[]);

    return data;
  }

  async function getEventDistribution(config: SeriesConfigWithMetadata, range: ChartRange) {
    const chartType = getChartType(config);

    let splitField;
    let filterField = null;

    // Define splitField and filterField based on chartType
    if (chartType === CHART_TYPE.EVENT_DISTRIBUTION) {
      splitField = config.entityFields.find((f) => f.fieldType === 'by');
      filterField = config.entityFields.find((f) => f.fieldType === 'partition');
    } else if (chartType === CHART_TYPE.POPULATION_DISTRIBUTION) {
      splitField = config.entityFields.find((f) => f.fieldType === 'over');
      filterField = config.entityFields.find((f) => f.fieldType === 'partition');
    }

    const datafeedQuery = get(config, 'datafeedConfig.query', null);

    try {
      return await getEventDistributionData(
        Array.isArray(config.datafeedConfig.indices)
          ? config.datafeedConfig.indices.join()
          : config.datafeedConfig.indices,
        splitField,
        filterField,
        datafeedQuery,
        config.metricFunction,
        config.metricFieldName,
        config.timeField,
        range.min,
        range.max,
        config.bucketSpanSeconds * 1000
      );
    } catch (e) {
      handleError(
        i18n.translate('xpack.ml.timeSeriesJob.eventDistributionDataErrorMessage', {
          defaultMessage: 'an error occurred while retrieving data',
        }),
        config.jobId
      );
    }
  }

  async function getRecordsForCriteriaChart(config: SeriesConfigWithMetadata, range: ChartRange) {
    let criteria: MlEntityField[] = [];
    criteria.push({ fieldName: 'detector_index', fieldValue: config.detectorIndex });
    criteria = criteria.concat(config.entityFields);

    try {
      return await getRecordsForCriteria(
        [config.jobId],
        criteria,
        0,
        range.min,
        range.max,
        config.interval
      );
    } catch (error) {
      handleError(
        i18n.translate('xpack.ml.timeSeriesJob.recordsForCriteriaErrorMessage', {
          defaultMessage: 'an error occurred while retrieving anomaly records',
        }),
        config.jobId
      );
      return { success: false, records: [], error: error as ErrorType };
    }
  }

  /**
   * Fetches anomaly records aggregating on the chart interval.
   *
   * @param jobIds
   * @param criteriaFields
   * @param threshold
   * @param earliestMs
   * @param latestMs
   * @param interval
   * @param functionDescription
   */
  async function getRecordsForCriteria(
    jobIds: string[],
    criteriaFields: CriteriaField[],
    threshold: number,
    earliestMs: number | null,
    latestMs: number | null,
    interval: string,
    functionDescription?: string
  ): Promise<RecordsForCriteria> {
    const obj: RecordsForCriteria = { success: true, records: [] };

    // Build the criteria to use in the bool filter part of the request.
    // Add criteria for the time range, record score, plus any specified job IDs.
    const boolCriteria: estypes.QueryDslQueryContainer[] = [
      {
        range: {
          timestamp: {
            // @ts-ignore
            gte: earliestMs,
            // @ts-ignore
            lte: latestMs,
            format: 'epoch_millis',
          },
        },
      },
      {
        range: {
          record_score: {
            gte: threshold,
          },
        },
      },
    ];

    if (jobIds && jobIds.length > 0 && !(jobIds.length === 1 && jobIds[0] === '*')) {
      let jobIdFilterStr = '';
      each(jobIds, (jobId, i) => {
        if (i > 0) {
          jobIdFilterStr += ' OR ';
        }
        jobIdFilterStr += 'job_id:';
        jobIdFilterStr += jobId;
      });
      boolCriteria.push({
        query_string: {
          analyze_wildcard: false,
          query: jobIdFilterStr,
        },
      });
    }

    // Add in term queries for each of the specified criteria.
    each(criteriaFields, (criteria) => {
      boolCriteria.push({
        term: {
          [criteria.fieldName]: criteria.fieldValue,
        },
      });
    });

    if (functionDescription !== undefined) {
      const mlFunctionToPlotIfMetric =
        functionDescription !== undefined
          ? aggregationTypeTransform.toML(functionDescription)
          : functionDescription;

      boolCriteria.push({
        term: {
          function_description: mlFunctionToPlotIfMetric,
        },
      });
    }

    const searchRequest: estypes.SearchRequest = {
      size: 0,
      query: {
        bool: {
          filter: [
            {
              term: {
                result_type: 'record',
              },
            },
            {
              bool: {
                must: boolCriteria,
              },
            },
          ],
        },
      },
      aggs: {
        anomalies_over_time: {
          date_histogram: {
            field: 'timestamp',
            fixed_interval: interval,
            // Ignore empty buckets
            min_doc_count: 1,
          },
          aggs: {
            top_records: {
              top_hits: {
                size: 1,
                sort: [{ record_score: { order: 'desc' } }],
              },
            },
          },
        },
      },
    };

    const resp = await mlClient.anomalySearch(searchRequest, jobIds);

    const records = (
      (
        resp.aggregations!.anomalies_over_time as estypes.AggregationsMultiBucketAggregateBase<{
          top_records: estypes.AggregationsTopHitsAggregate;
        }>
      ).buckets as Array<{ top_records: estypes.AggregationsTopHitsAggregate }>
    )
      .map((b) => {
        return b.top_records.hits.hits[0]?._source;
      })
      .filter(isDefined);

    obj.records = records;

    return obj;
  }

  async function getRecordsForInfluencer(
    jobIds: string[],
    influencers: MlEntityField[],
    threshold: SeverityThreshold[],
    earliestMs: number,
    latestMs: number,
    maxResults: number,
    influencersFilterQuery?: InfluencersFilterQuery
  ): Promise<MlRecordForInfluencer[]> {
    // Build the criteria to use in the bool filter part of the request.
    // Add criteria for the time range, record score, plus any specified job IDs.
    const boolCriteria: estypes.QueryDslBoolQuery['must'] = [
      {
        range: {
          timestamp: {
            gte: earliestMs,
            lte: latestMs,
            format: 'epoch_millis',
          },
        },
      },
    ];

    // TODO optimize query
    if (jobIds && jobIds.length > 0 && !(jobIds.length === 1 && jobIds[0] === '*')) {
      let jobIdFilterStr = '';
      each(jobIds, (jobId, i) => {
        if (i > 0) {
          jobIdFilterStr += ' OR ';
        }
        jobIdFilterStr += 'job_id:';
        jobIdFilterStr += jobId;
      });
      boolCriteria.push({
        query_string: {
          analyze_wildcard: false,
          query: jobIdFilterStr,
        },
      });
    }

    if (influencersFilterQuery !== undefined) {
      boolCriteria.push(influencersFilterQuery);
    }

    // Add a nested query to filter for each of the specified influencers.
    if (influencers.length > 0) {
      boolCriteria.push({
        bool: {
          should: influencers.map((influencer) => {
            return {
              nested: {
                path: 'influencers',
                query: {
                  bool: {
                    must: [
                      {
                        match: {
                          'influencers.influencer_field_name': influencer.fieldName,
                        },
                      },
                      {
                        match: {
                          'influencers.influencer_field_values': influencer.fieldValue,
                        },
                      },
                    ],
                  },
                },
              },
            };
          }),
          minimum_should_match: 1,
        },
      });
    }

    const thresholdCriteria = threshold.map((t) => {
      const thresholdMax = getSeverityThresholdMax(t);

      return {
        range: {
          record_score: {
            gte: t.min,
            ...(thresholdMax !== undefined && { lte: thresholdMax }),
          },
        },
      };
    });

    boolCriteria.push({
      bool: {
        should: thresholdCriteria,
        minimum_should_match: 1,
      },
    });

    const response = await mlClient.anomalySearch<estypes.SearchResponse<MlRecordForInfluencer>>(
      {
        size: maxResults !== undefined ? maxResults : 100,
        query: {
          bool: {
            filter: [
              {
                term: {
                  result_type: 'record',
                },
              },
              {
                bool: {
                  must: boolCriteria,
                },
              },
            ],
          },
        },
        sort: [{ record_score: { order: 'desc' } }],
      },
      jobIds
    );

    // @ts-ignore
    return response.hits.hits
      .map((hit) => {
        return hit._source;
      })
      .filter(isDefined);
  }

  /**
   * Provides anomaly charts data
   */
  async function getAnomalyChartsData(options: {
    jobIds: string[];
    influencers: MlEntityField[];
    threshold: SeverityThreshold[];
    earliestMs: number;
    latestMs: number;
    maxResults: number;
    influencersFilterQuery?: InfluencersFilterQuery;
    numberOfPoints: number;
    timeBounds: { min?: number; max?: number };
  }) {
    const {
      jobIds,
      earliestMs,
      latestMs,
      maxResults,
      influencersFilterQuery,
      influencers,
      numberOfPoints,
      threshold,
      timeBounds,
    } = options;

    // First fetch records that satisfy influencers query criteria
    const recordsForInfluencers = await getRecordsForInfluencer(
      jobIds,
      influencers,
      threshold,
      earliestMs,
      latestMs,
      500,
      influencersFilterQuery
    );

    const selectedJobs = (await mlClient.getJobs({ job_id: jobIds })).jobs;

    const combinedJobRecords: Record<string, MlJob> = keyBy(selectedJobs, 'job_id');

    const chartData = await getAnomalyData(
      combinedJobRecords,
      recordsForInfluencers,
      earliestMs,
      latestMs,
      numberOfPoints,
      timeBounds,
      threshold,
      maxResults
    );

    return chartData;
  }

  return {
    getAnomalyChartsData,
    getRecordsForCriteria,
  };
}
