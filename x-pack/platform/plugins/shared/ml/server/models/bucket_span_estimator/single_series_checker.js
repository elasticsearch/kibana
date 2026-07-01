/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * A class for performing a series of tests on an aggregation type and field to determine a suggested bucket span.
 * Each test is run for a bucket span, if one fails, the bucket span is increased and the tests run again.
 * Bucket spans: 5m, 10m, 30m, 1h, 3h
 */

import { mlLog } from '../../lib/log';
import { INTERVALS, LONG_INTERVALS } from './intervals';

const REF_DATA_INTERVAL = { name: '1h', ms: 3600000 };

export class SingleSeriesChecker {
  constructor(
    asCurrentUser,
    index,
    timeField,
    aggType,
    field,
    duration,
    query,
    thresholds,
    runtimeMappings,
    indicesOptions,
    projectRouting
  ) {
    this.index = index;
    this.timeField = timeField;
    this.aggType = aggType;
    this.field = field;
    this.duration = duration;
    this.query = query;
    this.thresholds = thresholds;
    this.refMetricData = {
      varValue: 0,
      varDiff: 0,
      created: false,
    };
    this.runtimeMappings = runtimeMappings;
    this.indicesOptions = indicesOptions;
    this.asCurrentUser = asCurrentUser;
    this.projectRouting = projectRouting;
    this.interval = null;
  }

  run() {
    return new Promise((resolve, reject) => {
      const start = () => {
        // run all tests, returns a suggested interval
        this.runTests()
          .then((interval) => {
            this.interval = interval;
            resolve(this.interval);
          })
          .catch((resp) => {
            reject(resp);
          });
      };

      // if a field has been selected, first create ref data used in metric check
      if (this.field === null) {
        start();
      } else {
        this.createRefMetricData(REF_DATA_INTERVAL.ms)
          .then(() => {
            start();
          })
          .catch((resp) => {
            mlLog.warn('SingleSeriesChecker: Could not load metric reference data');
            reject(resp);
          });
      }
    });
  }

  runTests() {
    return new Promise((resolve, reject) => {
      let count = 0;

      // create filtered copy of INTERVALS
      // not including any buckets spans lower that the min threshold
      // if the data has been detected as being polled, the min threshold
      // is set to that poll interval
      const intervals = [];
      for (let i = 0; i < INTERVALS.length; i++) {
        if (INTERVALS[i].ms >= this.thresholds.minimumBucketSpanMS) {
          intervals.push(INTERVALS[i]);
        }
      }

      // if none of the normal intervals fit
      // check the poll interval against longer bucket spans
      // if any of these match, call resolve and skip all other tests
      if (intervals.length === 0) {
        let interval = null;
        for (let i = 1; i < LONG_INTERVALS.length; i++) {
          const int1 = LONG_INTERVALS[i - 1];
          const int2 = LONG_INTERVALS[i];
          if (
            this.thresholds.minimumBucketSpanMS > int1.ms &&
            this.thresholds.minimumBucketSpanMS <= int2.ms
          ) {
            // value is between two intervals, choose the highest
            interval = int2;
            break;
          }
        }
        if (interval !== null) {
          resolve(interval);
          return;
        }
      }

      // recursive function called with the index of the INTERVALS array
      // each time one of the checks fails, the index is increased and
      // the tests are repeated.
      const runTest = (i) => {
        const interval = intervals[i];
        this.performSearch(interval.ms)
          .then((resp) => {
            const buckets = resp.aggregations.non_empty_buckets.buckets;
            const fullBuckets = this.getFullBuckets(buckets);
            if (fullBuckets.length) {
              let pass = true;

              // test that the more than 20% of the buckets contain data
              if (pass && this.testBucketPercentage(fullBuckets, buckets) === false) {
                pass = false;
              }

              // test that the full buckets contain at least 5 documents
              if (this.aggType === 'sum' || this.aggType === 'count') {
                if (pass && this.testSumCountBuckets(fullBuckets) === false) {
                  pass = false;
                }
              }

              // scale variation test
              // only run this test for bucket spans less than 1 hour
              if (this.refMetricData.created && this.field !== null && interval.ms < 3600000) {
                if (pass && this.testMetricData(fullBuckets) === false) {
                  pass = false;
                }
              }

              if (pass) {
                resolve(interval);
              } else {
                count++;
                if (count === intervals.length) {
                  resolve(interval);
                } else {
                  runTest(count);
                }
              }
            } else {
              mlLog.warn('SingleSeriesChecker: runTest stopped because fullBuckets is empty');
              reject('runTest stopped because fullBuckets is empty');
            }
          })
          .catch((resp) => {
            // do something better with this
            reject(resp);
          });
      };

      runTest(count);
    });
  }

  createSearch(intervalMs) {
    const search = {
      query: this.query,
      aggs: {
        non_empty_buckets: {
          date_histogram: {
            field: this.timeField,
            fixed_interval: `${intervalMs}ms`,
          },
        },
      },
      ...this.runtimeMappings,
      ...this.projectRouting,
    };

    if (this.field !== null) {
      search.aggs.non_empty_buckets.aggs = {
        fieldValue: {
          [this.aggType]: {
            field: this.field,
          },
        },
      };
    }
    return search;
  }

  async performSearch(intervalMs) {
    const searchBody = this.createSearch(intervalMs);

    const body = await this.asCurrentUser.search(
      {
        index: this.index,
        size: 0,
        body: searchBody,
        ...(this.indicesOptions ?? {}),
      },
      { maxRetries: 0 }
    );
    return body;
  }

  getFullBuckets(buckets) {
    const fullBuckets = [];
    for (let i = 0; i < buckets.length; i++) {
      if (buckets[i].doc_count > 0) {
        fullBuckets.push(buckets[i]);
      }
    }
    return fullBuckets;
  }

  // test that the more than 20% of the buckets contain data
  testBucketPercentage(fullBuckets, buckets) {
    const pcnt = fullBuckets.length / buckets.length;
    return pcnt > 0.2;
  }

  // test that the full buckets contain at least 5 documents
  testSumCountBuckets(fullBuckets) {
    let totalCount = 0;
    for (let i = 0; i < fullBuckets.length; i++) {
      totalCount += fullBuckets[i].doc_count;
    }
    const mean = totalCount / fullBuckets.length;
    return mean >= 5;
  }

  // create the metric data used for the metric test and the metric test 1hr reference data
  createMetricData(fullBuckets) {
    const valueDiffs = [];
    let sumOfValues = fullBuckets[0].fieldValue.value;
    let sumOfValueDiffs = 0;
    for (let i = 1; i < fullBuckets.length; i++) {
      const value = fullBuckets[i].fieldValue.value;
      const diff = value - fullBuckets[i - 1].fieldValue.value;
      sumOfValueDiffs += diff;
      valueDiffs.push(diff);
      sumOfValues += value;
    }

    const meanValue = sumOfValues / fullBuckets.length;
    const meanValueDiff = sumOfValueDiffs / (fullBuckets.length - 1);

    let sumOfSquareValueResiduals = 0;
    let sumOfSquareValueDiffResiduals = 0;
    for (let i = 0; i < fullBuckets.length - 1; i++) {
      sumOfSquareValueResiduals += Math.pow(fullBuckets[i].fieldValue.value - meanValue, 2);
      sumOfSquareValueDiffResiduals += Math.pow(valueDiffs[i] - meanValueDiff, 2);
    }
    sumOfSquareValueResiduals += Math.pow(
      fullBuckets[fullBuckets.length - 1].fieldValue.value - meanValue,
      2
    );

    const varValue = sumOfSquareValueResiduals / fullBuckets.length;
    const varDiff = sumOfSquareValueDiffResiduals / (fullBuckets.length - 1);

    return {
      varValue,
      varDiff,
    };
  }

  // create reference data for the scale variation test
  createRefMetricData(intervalMs) {
    return new Promise((resolve, reject) => {
      if (this.field === null) {
        resolve();
        return;
      }

      this.performSearch(intervalMs) // 1h
        .then((resp) => {
          const buckets = resp.aggregations.non_empty_buckets.buckets;
          const fullBuckets = this.getFullBuckets(buckets);
          if (fullBuckets.length) {
            this.refMetricData = this.createMetricData(fullBuckets);
            this.refMetricData.created = true;
          }

          resolve();
        })
        .catch((resp) => {
          reject(resp);
        });
    });
  }

  // scale variation test
  testMetricData(fullBuckets) {
    const metricData = this.createMetricData(fullBuckets);
    const stat =
      metricData.varDiff /
      metricData.varValue /
      (this.refMetricData.varDiff / this.refMetricData.varValue);
    return stat <= 5;
  }
}
