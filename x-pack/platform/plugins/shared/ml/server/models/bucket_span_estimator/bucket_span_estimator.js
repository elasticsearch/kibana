/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { cloneDeep, each, remove, sortBy, get } from 'lodash';

import { mlLog } from '../../lib/log';

import { INTERVALS } from './intervals';
import { SingleSeriesChecker } from './single_series_checker';
import { PolledDataChecker } from './polled_data_checker';

export function estimateBucketSpanFactory(client) {
  const { asCurrentUser, asInternalUser } = client;
  // here!!!
  // check everywhere where runtimeMappings is used
  class BucketSpanEstimator {
    constructor(
      {
        index,
        timeField,
        aggTypes,
        fields,
        duration,
        query,
        splitField,
        runtimeMappings,
        indicesOptions,
        projectRouting,
      },
      splitFieldValues,
      maxBuckets
    ) {
      this.index = index;
      this.timeField = timeField;
      this.aggTypes = aggTypes;
      this.fields = fields;
      this.duration = duration;
      this.query = query;
      this.splitField = splitField;
      this.splitFieldValues = splitFieldValues;
      this.checkers = [];

      this.thresholds = {
        minimumBucketSpanMS: 0,
      };

      this.runtimeMappings =
        runtimeMappings !== undefined ? { runtime_mappings: runtimeMappings } : {};
      this.projectRouting = projectRouting !== undefined ? { project_routing: projectRouting } : {};

      // determine durations for bucket span estimation
      // taking into account the clusters' search.max_buckets settings
      // the polled_data_checker uses an aggregation interval of 1 minute
      // so that's the smallest interval we have to check for not to
      // exceed search.max_buckets.
      const ONE_MINUTE_MS = 60000;
      const ONE_HOUR_MS = 3600000;
      // only run the tests over the last 250 hours of data at max
      const HOUR_MULTIPLIER = Math.min(250, Math.floor((maxBuckets * ONE_MINUTE_MS) / ONE_HOUR_MS));
      const timePickerDurationLength = this.duration.end - this.duration.start;
      const multiplierDurationLength = ONE_HOUR_MS * HOUR_MULTIPLIER;

      if (timePickerDurationLength > multiplierDurationLength) {
        // move time range to the end of the data
        this.duration.start = this.duration.end - multiplierDurationLength;
      }

      this.query.bool.must.push({
        range: {
          [this.timeField]: {
            gte: this.duration.start,
            lte: this.duration.end,
            format: 'epoch_millis',
          },
        },
      });

      this.polledDataChecker = new PolledDataChecker(
        asCurrentUser,
        this.index,
        this.timeField,
        this.duration,
        this.query,
        this.runtimeMappings,
        indicesOptions,
        this.projectRouting
      );

      if (this.aggTypes.length === this.fields.length) {
        // loop over detectors
        for (let i = 0; i < this.aggTypes.length; i++) {
          if (this.splitField === undefined) {
            // either a single metric job or no data split
            this.checkers.push({
              check: new SingleSeriesChecker(
                asCurrentUser,
                this.index,
                this.timeField,
                this.aggTypes[i],
                this.fields[i],
                this.duration,
                this.query,
                this.thresholds,
                this.runtimeMappings,
                indicesOptions,
                this.projectRouting
              ),
              result: null,
            });
          } else {
            // loop over partition values
            for (let j = 0; j < this.splitFieldValues.length; j++) {
              const queryCopy = cloneDeep(this.query);
              // add a term to the query to filter on the partition value
              queryCopy.bool.must.push({
                term: {
                  [this.splitField]: this.splitFieldValues[j],
                },
              });
              this.checkers.push({
                check: new SingleSeriesChecker(
                  asCurrentUser,
                  this.index,
                  this.timeField,
                  this.aggTypes[i],
                  this.fields[i],
                  this.duration,
                  queryCopy,
                  this.thresholds,
                  this.runtimeMappings,
                  indicesOptions,
                  this.projectRouting
                ),
                result: null,
              });
            }
          }
        }
      }
    }

    run() {
      return new Promise((resolve, reject) => {
        if (this.checkers.length === 0) {
          mlLog.warn('BucketSpanEstimator: run has stopped because no checks were created');
          reject('BucketSpanEstimator: run has stopped because no checks were created');
        }

        this.polledDataChecker
          .run()
          .then((result) => {
            // if the data is polled, set a minimum threshold
            // of bucket span
            if (result.isPolled) {
              this.thresholds.minimumBucketSpanMS = result.minimumBucketSpan;
            }
            let checkCounter = this.checkers.length;
            const runComplete = () => {
              checkCounter--;

              if (checkCounter === 0) {
                const median = this.processResults();
                if (median !== null) {
                  resolve(median);
                } else {
                  // no results found
                  mlLog.warn(
                    'BucketSpanEstimator: run has stopped because no checks returned a valid interval'
                  );
                  reject(
                    'BucketSpanEstimator: run has stopped because no checks returned a valid interval'
                  );
                }
              }
            };

            each(this.checkers, (check) => {
              check.check
                .run()
                .then((interval) => {
                  check.result = interval;
                  runComplete();
                })
                .catch(() => {
                  // run failed. this may be due to a lack of data
                  // mark the result as null so it can be filtered out
                  // later by processResults()
                  check.result = null;
                  runComplete();
                });
            });
          })
          .catch((resp) => {
            reject(resp);
          });
      });
    }

    processResults() {
      const allResults = this.checkers.map((c) => c.result);

      let reducedResults = [];
      const numberOfSplitFields = this.splitFieldValues.length || 1;
      // find the median results per detector
      // if the data has been split, the may be ten results per detector,
      // so we need to find the median of those first.
      for (let i = 0; i < this.aggTypes.length; i++) {
        const pos = i * numberOfSplitFields;
        let resultsSubset = allResults.slice(pos, pos + numberOfSplitFields);
        // remove results of tests which have failed
        resultsSubset = remove(resultsSubset, (res) => res !== null);
        resultsSubset = sortBy(resultsSubset, (r) => r.ms);

        const tempMedian = this.findMedian(resultsSubset);
        if (tempMedian !== null) {
          reducedResults.push(tempMedian);
        }
      }

      reducedResults = sortBy(reducedResults, (r) => r.ms);

      return this.findMedian(reducedResults);
    }

    findMedian(results) {
      let median = null;

      if (results.length) {
        if (results.length % 2 === 0) {
          // even number of results
          const medIndex = results.length / 2 - 1;
          // find the two middle values
          const med1 = results[medIndex];
          const med2 = results[medIndex + 1];

          if (med1 === med2) {
            // if they're the same, use them
            median = med1;
          } else {
            let interval = null;
            // find the average ms value between the two middle intervals
            const avgMs = (med2.ms - med1.ms) / 2 + med1.ms;
            // loop over the allowed bucket spans to find closest one
            for (let i = 1; i < INTERVALS.length; i++) {
              if (avgMs < INTERVALS[i].ms) {
                // see if it's closer to this interval or the one before
                const int1 = INTERVALS[i - 1];
                const int2 = INTERVALS[i];
                const diff = int2.ms - int1.ms;
                const d = avgMs - int1.ms;
                interval = d / diff < 0.5 ? int1 : int2;
                break;
              }
            }
            median = interval;
          }
        } else {
          // odd number of results, take the middle one
          median = results[(results.length - 1) / 2];
        }
      }
      return median;
    }
  }

  const getFieldCardinality = function (index, field, runtimeMappings, indicesOptions) {
    return new Promise((resolve, reject) => {
      asCurrentUser
        .search(
          {
            index,
            size: 0,
            body: {
              aggs: {
                field_count: {
                  cardinality: {
                    field,
                  },
                },
              },
              ...(runtimeMappings !== undefined ? { runtime_mappings: runtimeMappings } : {}),
            },
            ...(indicesOptions ?? {}),
            ...(this.projectRouting !== undefined ? { project_routing: this.projectRouting } : {}),
          },
          { maxRetries: 0 }
        )
        .then((body) => {
          const value = get(body, ['aggregations', 'field_count', 'value'], 0);
          resolve(value);
        })
        .catch((resp) => {
          reject(resp);
        });
    });
  };

  const getRandomFieldValues = function (index, field, query, runtimeMappings, indicesOptions) {
    let fieldValues = [];
    return new Promise((resolve, reject) => {
      const NUM_PARTITIONS = 10;
      // use a partitioned search to load 10 random fields
      // load ten fields, to test that there are at least 10.
      getFieldCardinality(index, field, runtimeMappings, indicesOptions)
        .then((value) => {
          const numPartitions = Math.floor(value / NUM_PARTITIONS) || 1;
          asCurrentUser
            .search(
              {
                index,
                size: 0,
                body: {
                  query,
                  aggs: {
                    fields_bucket_counts: {
                      terms: {
                        field,
                        include: {
                          partition: 0,
                          num_partitions: numPartitions,
                        },
                      },
                    },
                  },
                  ...(runtimeMappings !== undefined ? { runtime_mappings: runtimeMappings } : {}),
                },
                ...(indicesOptions ?? {}),
                ...(this.projectRouting !== undefined
                  ? { project_routing: this.projectRouting }
                  : {}),
              },
              { maxRetries: 0 }
            )
            .then((body) => {
              // eslint-disable-next-line camelcase
              if (body.aggregations?.fields_bucket_counts?.buckets !== undefined) {
                const buckets = body.aggregations.fields_bucket_counts.buckets;
                fieldValues = buckets.map((b) => b.key);
              }
              resolve(fieldValues);
            })
            .catch((resp) => {
              reject(resp);
            });
        })
        .catch((resp) => {
          reject(resp);
        });
    });
  };

  return function (formConfig) {
    if (typeof formConfig !== 'object' || formConfig === null) {
      throw new Error('Invalid formConfig: formConfig needs to be an object.');
    }

    if (typeof formConfig.index !== 'string') {
      throw new Error('Invalid formConfig: formConfig.index needs to be a string.');
    }

    if (typeof formConfig.duration !== 'object') {
      throw new Error('Invalid formConfig: formConfig.duration needs to be an object.');
    }

    if (typeof formConfig.fields === 'undefined') {
      throw new Error('Invalid formConfig: Missing fields.');
    }

    if (typeof formConfig.query === 'undefined') {
      throw new Error('Invalid formConfig: Missing query.');
    }

    return new Promise((resolve, reject) => {
      // fetch the `search.max_buckets` cluster setting so we're able to
      // adjust aggregations to not exceed that limit.
      asInternalUser.cluster
        .getSettings({
          flat_settings: true,
          include_defaults: true,
          filter_path: '*.*max_buckets',
        })
        .then((body) => {
          if (typeof body !== 'object') {
            reject('Unable to retrieve cluster settings');
          }

          // search.max_buckets could exist in default, persistent or transient cluster settings
          const maxBucketsSetting = (body.defaults || body.persistent || body.transient || {})[
            'search.max_buckets'
          ];

          if (maxBucketsSetting === undefined) {
            reject('Unable to retrieve cluster setting search.max_buckets');
          }

          const maxBuckets = parseInt(maxBucketsSetting);

          const runEstimator = (splitFieldValues = []) => {
            const bucketSpanEstimator = new BucketSpanEstimator(
              formConfig,
              splitFieldValues,
              maxBuckets
            );

            bucketSpanEstimator
              .run()
              .then((resp) => {
                resolve(resp);
              })
              .catch((resp) => {
                reject(resp);
              });
          };

          // a partition has been selected, so we need to load some field values to use in the
          // bucket span tests.
          if (formConfig.splitField !== undefined) {
            getRandomFieldValues(
              formConfig.index,
              formConfig.splitField,
              formConfig.query,
              formConfig.runtimeMappings,
              formConfig.indicesOptions
            )
              .then((splitFieldValues) => {
                runEstimator(splitFieldValues);
              })
              .catch((resp) => {
                reject(resp);
              });
          } else {
            // no partition field selected or we're in the single metric config
            runEstimator();
          }
        })
        .catch((resp) => {
          reject(resp);
        });
    });
  };
}
