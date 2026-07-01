/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * A class for determining whether a data set is polled.
 * returns a flag identifying whether the data is polled
 * And a minimum bucket span
 */

import { get } from 'lodash';

export class PolledDataChecker {
  constructor(
    asCurrentUser,
    index,
    timeField,
    duration,
    query,
    runtimeMappings,
    indicesOptions,
    projectRouting
  ) {
    this.index = index;
    this.timeField = timeField;
    this.duration = duration;
    this.query = query;
    this.runtimeMappings = runtimeMappings;
    this.indicesOptions = indicesOptions;
    this.asCurrentUser = asCurrentUser;
    this.projectRouting = projectRouting;

    this.isPolled = false;
    this.minimumBucketSpan = 0;
  }

  run() {
    return new Promise((resolve, reject) => {
      const interval = { name: '1m', ms: 60000 };
      this.performSearch(interval.ms)
        .then((resp) => {
          const fullBuckets = get(resp, 'aggregations.non_empty_buckets.buckets', []);
          const result = this.isPolledData(fullBuckets, interval);
          if (result.pass) {
            // data is polled, return a flag and the minimumBucketSpan which should be
            // used as a minimum bucket span for all subsequent tests.
            this.isPolled = true;
            this.minimumBucketSpan = result.meanTimeDiff;
          }
          resolve({
            isPolled: this.isPolled,
            minimumBucketSpan: this.minimumBucketSpan,
          });
        })
        .catch((resp) => {
          reject(resp);
        });
    });
  }

  createSearch(intervalMs) {
    const search = {
      query: this.query,
      aggs: {
        non_empty_buckets: {
          date_histogram: {
            min_doc_count: 1,
            field: this.timeField,
            fixed_interval: `${intervalMs}ms`,
          },
        },
      },
      ...this.runtimeMappings,
      ...this.projectRouting,
    };

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

  // test that the coefficient of variation of time difference between non-empty buckets is small
  isPolledData(fullBuckets, intervalMs) {
    let pass = false;

    const timeDiffs = [];
    let sumOfTimeDiffs = 0;
    for (let i = 1; i < fullBuckets.length; i++) {
      const diff = fullBuckets[i].key - fullBuckets[i - 1].key;
      sumOfTimeDiffs += diff;
      timeDiffs.push(diff);
    }

    const meanTimeDiff = sumOfTimeDiffs / (fullBuckets.length - 1);

    let sumSquareTimeDiffResiduals = 0;
    for (let i = 0; i < fullBuckets.length - 1; i++) {
      sumSquareTimeDiffResiduals += Math.pow(timeDiffs[i] - meanTimeDiff, 2);
    }

    const vari = sumSquareTimeDiffResiduals / (fullBuckets.length - 1);

    const cov = Math.sqrt(vari) / meanTimeDiff;

    if (cov < 0.1 && intervalMs < meanTimeDiff) {
      pass = false;
    } else {
      pass = true;
    }
    return {
      pass,
      meanTimeDiff,
    };
  }
}
