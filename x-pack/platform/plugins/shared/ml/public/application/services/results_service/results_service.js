/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { each, get } from 'lodash';

import { isPopulatedObject } from '@kbn/ml-is-populated-object';

import { aggregationTypeTransform } from '@kbn/ml-anomaly-utils';

/**
 * Service for carrying out Elasticsearch queries to obtain data for the Ml Results dashboards.
 */
export function resultsServiceProvider(mlApi) {
  return {
    // Obtains the maximum bucket anomaly scores by job ID and time.
    // Pass an empty array or ['*'] to search over all job IDs.
    // Returned response contains a results property, with a key for job
    // which has results for the specified time range.
    // TODO: Remove once all occurencies are refactored to use the new API
    getScoresByBucket(
      jobIds,
      earliestMs,
      latestMs,
      intervalMs,
      perPage = 10,
      fromPage = 1,
      swimLaneSeverity = [{ min: 0 }]
    ) {
      return new Promise((resolve, reject) => {
        const obj = {
          success: true,
          results: {},
        };

        // Build the criteria to use in the bool filter part of the request.
        // Adds criteria for the time range plus any specified job IDs.
        const boolCriteria = [
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

        const thresholdCriteria = swimLaneSeverity.map((t) => ({
          range: {
            anomaly_score: {
              gte: t.min,
              ...(t.max !== undefined && { lte: t.max }),
            },
          },
        }));

        boolCriteria.push({
          bool: {
            should: thresholdCriteria,
            minimum_should_match: 1,
          },
        });

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

        mlApi.results
          .anomalySearch(
            {
              size: 0,
              body: {
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
                  jobsCardinality: {
                    cardinality: {
                      field: 'job_id',
                    },
                  },
                  jobId: {
                    terms: {
                      field: 'job_id',
                      size: jobIds?.length ?? 1,
                      order: {
                        anomalyScore: 'desc',
                      },
                    },
                    aggs: {
                      anomalyScore: {
                        max: {
                          field: 'anomaly_score',
                        },
                      },
                      bucketTruncate: {
                        bucket_sort: {
                          from: (fromPage - 1) * perPage,
                          size: perPage === 0 ? 1 : perPage,
                        },
                      },
                      byTime: {
                        date_histogram: {
                          field: 'timestamp',
                          fixed_interval: `${intervalMs}ms`,
                          min_doc_count: 1,
                          extended_bounds: {
                            min: earliestMs,
                            max: latestMs,
                          },
                        },
                        aggs: {
                          anomalyScore: {
                            max: {
                              field: 'anomaly_score',
                            },
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
          .then((resp) => {
            const dataByJobId = get(resp, ['aggregations', 'jobId', 'buckets'], []);
            each(dataByJobId, (dataForJob) => {
              const jobId = dataForJob.key;

              const resultsForTime = {};

              const dataByTime = get(dataForJob, ['byTime', 'buckets'], []);
              each(dataByTime, (dataForTime) => {
                const value = get(dataForTime, ['anomalyScore', 'value']);
                if (value !== undefined) {
                  const time = dataForTime.key;
                  resultsForTime[time] = get(dataForTime, ['anomalyScore', 'value']);
                }
              });
              obj.results[jobId] = resultsForTime;
            });
            obj.cardinality = resp.aggregations?.jobsCardinality?.value ?? 0;

            resolve(obj);
          })
          .catch((resp) => {
            reject(resp);
          });
      });
    },

    // Obtains the overall bucket scores for the specified job ID(s).
    // Pass ['*'] to search over all job IDs.
    // Returned response contains a results property as an object of max score by time.
    getOverallBucketScores(jobIds, topN, earliestMs, latestMs, interval, overallScore) {
      return new Promise((resolve, reject) => {
        const obj = { success: true, results: {} };

        mlApi
          .overallBuckets({
            jobId: jobIds,
            topN: topN,
            bucketSpan: interval,
            start: earliestMs,
            end: latestMs,
            overallScore,
          })
          .then((resp) => {
            const dataByTime = get(resp, ['overall_buckets'], []);
            each(dataByTime, (dataForTime) => {
              const value = get(dataForTime, ['overall_score']);
              if (value !== undefined) {
                obj.results[dataForTime.timestamp] = value;
              }
            });

            resolve(obj);
          })
          .catch((resp) => {
            reject(resp);
          });
      });
    },

    // Queries Elasticsearch to obtain event rate data i.e. the count
    // of documents over time.
    // index can be a String, or String[], of index names to search.
    // Extra query object can be supplied, or pass null if no additional query.
    // Returned response contains a results property, which is an object
    // of document counts against time (epoch millis).
    getEventRateData(
      index,
      query,
      timeFieldName,
      earliestMs,
      latestMs,
      intervalMs,
      runtimeMappings,
      indicesOptions,
      projectRouting
    ) {
      return new Promise((resolve, reject) => {
        const obj = { success: true, results: {} };

        // Build the criteria to use in the bool filter part of the request.
        // Add criteria for the time range, entity fields,
        // plus any additional supplied query.
        const mustCriteria = [
          {
            range: {
              [timeFieldName]: {
                gte: earliestMs,
                lte: latestMs,
                format: 'epoch_millis',
              },
            },
          },
        ];

        if (query) {
          mustCriteria.push(query);
        }

        mlApi
          .esSearch({
            index,
            size: 0,
            body: {
              query: {
                bool: {
                  must: mustCriteria,
                },
              },
              _source: {
                excludes: [],
              },
              aggs: {
                eventRate: {
                  date_histogram: {
                    field: timeFieldName,
                    fixed_interval: `${intervalMs}ms`,
                    min_doc_count: 0,
                    extended_bounds: {
                      min: earliestMs,
                      max: latestMs,
                    },
                  },
                },
              },
              // Runtime fields only needed to support when query includes a runtime field
              // even though the default timeField can be a search time runtime field
              // because currently Kibana doesn't support that
              ...(isPopulatedObject(runtimeMappings) && query
                ? { runtime_mappings: runtimeMappings }
                : {}),
              ...(projectRouting ? { project_routing: projectRouting } : {}),
            },
            ...(indicesOptions ?? {}),
          })
          .then((resp) => {
            const dataByTimeBucket = get(resp, ['aggregations', 'eventRate', 'buckets'], []);
            each(dataByTimeBucket, (dataForTime) => {
              const time = dataForTime.key;
              obj.results[time] = dataForTime.doc_count;
            });
            obj.total = resp.hits.total.value;

            resolve(obj);
          })
          .catch((resp) => {
            reject(resp);
          });
      });
    },

    // Queries Elasticsearch to obtain the max record score over time for the specified job,
    // criteria, time range, and aggregation interval.
    // criteriaFields parameter must be an array, with each object in the array having 'fieldName'
    // 'fieldValue' properties.
    getRecordMaxScoreByTime(
      jobId,
      criteriaFields,
      earliestMs,
      latestMs,
      intervalMs,
      actualPlotFunctionIfMetric
    ) {
      return new Promise((resolve, reject) => {
        const obj = {
          success: true,
          results: {},
        };

        // Build the criteria to use in the bool filter part of the request.
        const mustCriteria = [
          {
            range: {
              timestamp: {
                gte: earliestMs,
                lte: latestMs,
                format: 'epoch_millis',
              },
            },
          },
          { term: { job_id: jobId } },
        ];

        each(criteriaFields, (criteria) => {
          mustCriteria.push({
            term: {
              [criteria.fieldName]: criteria.fieldValue,
            },
          });
        });
        if (actualPlotFunctionIfMetric !== undefined) {
          const mlFunctionToPlotIfMetric =
            actualPlotFunctionIfMetric !== undefined
              ? aggregationTypeTransform.toML(actualPlotFunctionIfMetric)
              : actualPlotFunctionIfMetric;

          mustCriteria.push({
            term: {
              function_description: mlFunctionToPlotIfMetric,
            },
          });
        }
        mlApi.results
          .anomalySearch(
            {
              size: 0,
              body: {
                query: {
                  bool: {
                    filter: [
                      {
                        query_string: {
                          query: 'result_type:record',
                          analyze_wildcard: true,
                        },
                      },
                      {
                        bool: {
                          must: mustCriteria,
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
                      min_doc_count: 1,
                    },
                    aggs: {
                      recordScore: {
                        max: {
                          field: 'record_score',
                        },
                      },
                    },
                  },
                },
              },
            },
            [jobId]
          )
          .then((resp) => {
            const aggregationsByTime = get(resp, ['aggregations', 'times', 'buckets'], []);
            each(aggregationsByTime, (dataForTime) => {
              const time = dataForTime.key;
              obj.results[time] = {
                score: get(dataForTime, ['recordScore', 'value']),
              };
            });

            resolve(obj);
          })
          .catch((resp) => {
            reject(resp);
          });
      });
    },
  };
}
