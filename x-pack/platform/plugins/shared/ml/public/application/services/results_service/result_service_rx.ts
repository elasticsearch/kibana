/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Queries Elasticsearch to obtain metric aggregation results.
// index can be a String, or String[], of index names to search.
// entityFields parameter must be an array, with each object in the array having 'fieldName'
// and 'fieldValue' properties.
// Extra query object can be supplied, or pass null if no additional query
// to that built from the supplied entity fields.
// Returned response contains a results property containing the requested aggregation.
import type { Observable } from 'rxjs';
import { map } from 'rxjs';
import { each, get } from 'lodash';
import { isPopulatedObject } from '@kbn/ml-is-populated-object';
import type { ErrorType } from '@kbn/ml-error-utils';
import { aggregationTypeTransform, ES_AGGREGATION } from '@kbn/ml-anomaly-utils';
import { isRuntimeMappings } from '@kbn/ml-runtime-field-utils';
import type { Dictionary } from '@kbn/ml-common-types/common';
import type { Datafeed } from '@kbn/ml-common-types/anomaly_detection_jobs/datafeed';
import type { JobId } from '@kbn/ml-common-types/anomaly_detection_jobs/job';
import type { CriteriaField } from '@kbn/ml-common-types/results';
import { ML_MEDIAN_PERCENTS } from '../../../../common/util/job_utils';
import { findAggField } from '../../../../common/util/validation_utils';
import { getDatafeedAggregations } from '../../../../common/util/datafeed_utils';
import type { MlApi } from '../ml_api_service';

export interface ResultResponse {
  success: boolean;
  error?: ErrorType;
}

export interface MetricData extends ResultResponse {
  results: Record<string, any>;
}

export interface FieldDefinition {
  /**
   * Field name.
   */
  name: string | number;
  /**
   * Field distinct values.
   */
  values: Array<{ value: any; maxRecordScore?: number }>;
}

type FieldTypes = 'partition_field' | 'over_field' | 'by_field';

export type PartitionFieldsDefinition = {
  [field in FieldTypes]: FieldDefinition;
};

export interface ModelPlotOutput extends ResultResponse {
  results: Record<string, any>;
}

export interface RecordsForCriteria extends ResultResponse {
  records: any[];
}

export interface ScheduledEventsByBucket extends ResultResponse {
  events: Record<string, any>;
}

export function resultsServiceRxProvider(mlApi: MlApi) {
  return {
    getMetricData(
      index: string,
      entityFields: any[],
      query: object | undefined,
      metricFunction: string | null, // ES aggregation name
      metricFieldName: string | undefined,
      summaryCountFieldName: string | undefined,
      timeFieldName: string,
      earliestMs: number,
      latestMs: number,
      intervalMs: number,
      datafeedConfig?: Datafeed
    ): Observable<MetricData> {
      const scriptFields = datafeedConfig?.script_fields;
      const aggFields = getDatafeedAggregations(datafeedConfig);
      const projectRouting = datafeedConfig?.project_routing;

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
        if (entity.fieldValue.length !== 0) {
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

      const body: any = {
        query: {
          bool: {
            must: mustCriteria,
          },
        },
        size: 0,
        _source: false,
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
        ...(projectRouting !== undefined ? { project_routing: projectRouting } : {}),
      };

      if (shouldCriteria.length > 0) {
        body.query.bool.should = shouldCriteria;
        body.query.bool.minimum_should_match = shouldCriteria.length / 2;
      }

      body.aggs.byTime.aggs = {};

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
          body.aggs.byTime.aggs = tempAggs;
        } else {
          body.aggs.byTime.aggs.metric = metricAgg;
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
            body.aggs.byTime.aggs = tempAggs;
          }
        }
      }
      return mlApi.esSearch$({ index, body }).pipe(
        map((resp: any) => {
          const obj: MetricData = { success: true, results: {} };
          const dataByTime = resp?.aggregations?.byTime?.buckets ?? [];
          dataByTime.forEach((dataForTime: any) => {
            if (metricFunction === 'count') {
              obj.results[dataForTime.key] = dataForTime.doc_count;
            } else {
              const value = dataForTime?.metric?.value;
              const values = dataForTime?.metric?.values;
              if (dataForTime.doc_count === 0) {
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
                obj.results[dataForTime.key] = null;
              }
            }
          });

          return obj;
        })
      );
    },

    getModelPlotOutput(
      jobId: string,
      detectorIndex: number,
      criteriaFields: CriteriaField[],
      earliestMs: number,
      latestMs: number,
      intervalMs: number,
      aggType?: { min: any; max: any }
    ): Observable<ModelPlotOutput> {
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

      return mlApi.results
        .anomalySearch$(
          {
            size: 0,
            query: {
              bool: {
                filter: [
                  {
                    query_string: {
                      query: 'result_type:model_plot',
                      analyze_wildcard: true,
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
          },
          [jobId]
        )
        .pipe(
          map((resp) => {
            const aggregationsByTime = get(resp, ['aggregations', 'times', 'buckets'], []);
            each(aggregationsByTime, (dataForTime: any) => {
              const time = dataForTime.key;
              const modelUpper: number | undefined = get(dataForTime, ['modelUpper', 'value']);
              const modelLower: number | undefined = get(dataForTime, ['modelLower', 'value']);
              const actual = get(dataForTime, ['actual', 'value']);

              obj.results[time] = {
                actual,
                modelUpper:
                  modelUpper === undefined || isFinite(modelUpper) === false ? null : modelUpper,
                modelLower:
                  modelLower === undefined || isFinite(modelLower) === false ? null : modelLower,
              };
            });

            return obj;
          })
        );
    },

    // Queries Elasticsearch to obtain the record level results matching the given criteria,
    // for the specified job(s), time range, and record score threshold.
    // criteriaFields parameter must be an array, with each object in the array having 'fieldName'
    // 'fieldValue' properties.
    // Pass an empty array or ['*'] to search over all job IDs.
    getRecordsForCriteria(
      jobIds: string[],
      criteriaFields: CriteriaField[],
      threshold: any,
      earliestMs: number | null,
      latestMs: number | null,
      maxResults: number | undefined,
      functionDescription?: string
    ): Observable<RecordsForCriteria> {
      const obj: RecordsForCriteria = { success: true, records: [] };

      // Build the criteria to use in the bool filter part of the request.
      // Add criteria for the time range, record score, plus any specified job IDs.
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

      return mlApi.results
        .anomalySearch$(
          {
            size: maxResults !== undefined ? maxResults : 100,
            query: {
              bool: {
                filter: [
                  {
                    query_string: {
                      query: 'result_type:record',
                      analyze_wildcard: false,
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
        )
        .pipe(
          map((resp) => {
            if (resp.hits.total.value > 0) {
              each(resp.hits.hits, (hit: any) => {
                obj.records.push(hit._source);
              });
            }
            return obj;
          })
        );
    },

    // Obtains a list of scheduled events by job ID and time.
    // Pass an empty array or ['*'] to search over all job IDs.
    // Returned response contains a events property, which will only
    // contains keys for jobs which have scheduled events for the specified time range.
    getScheduledEventsByBucket(
      jobIds: string[],
      earliestMs: number,
      latestMs: number,
      intervalMs: number,
      maxJobs: number,
      maxEvents: number
    ): Observable<ScheduledEventsByBucket> {
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

      return mlApi.results
        .anomalySearch$(
          {
            size: 0,
            query: {
              bool: {
                filter: [
                  {
                    query_string: {
                      query: 'result_type:bucket',
                      analyze_wildcard: false,
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
          },
          jobIds
        )
        .pipe(
          map((resp) => {
            const dataByJobId = get(resp, ['aggregations', 'jobs', 'buckets'], []);
            each(dataByJobId, (dataForJob: any) => {
              const jobId: string = dataForJob.key;
              const resultsForTime: Record<string, any> = {};
              const dataByTime = get(dataForJob, ['times', 'buckets'], []);
              each(dataByTime, (dataForTime: any) => {
                const time: string = dataForTime.key;
                const events: any[] = get(dataForTime, ['events', 'buckets']);
                resultsForTime[time] = events.map((e) => e.key);
              });
              obj.events[jobId] = resultsForTime;
            });

            return obj;
          })
        );
    },

    fetchPartitionFieldsValues(
      jobId: JobId,
      searchTerm: Dictionary<string>,
      criteriaFields: Array<{ fieldName: string; fieldValue: any }>,
      earliestMs: number,
      latestMs: number
    ) {
      return mlApi.results.fetchPartitionFieldsValues(
        jobId,
        searchTerm,
        criteriaFields,
        earliestMs,
        latestMs
      );
    },
  };
}
