/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { get } from 'lodash';
import type { IScopedClusterClient } from '@kbn/core/server';
import { type AggFieldNamePair, EVENT_RATE_FIELD_ID } from '@kbn/ml-anomaly-utils';
import type { RuntimeMappings } from '@kbn/ml-runtime-field-utils';
import type { IndicesOptions } from '@kbn/ml-common-types/anomaly_detection_jobs/datafeed';
import { ML_MEDIAN_PERCENTS } from '../../../../common/util/job_utils';

type DtrIndex = number;
type TimeStamp = number;
type Value = number | undefined | null;
interface Result {
  time: TimeStamp;
  value: Value;
}

export interface ProcessedResults {
  success: boolean;
  results: Record<number, Result[]>;
  totalResults: number;
}

export function newJobLineChartProvider({ asCurrentUser }: IScopedClusterClient) {
  async function newJobLineChart(
    indexPatternTitle: string,
    timeField: string,
    start: number,
    end: number,
    intervalMs: number,
    query: object,
    aggFieldNamePairs: AggFieldNamePair[],
    splitFieldName: string | null,
    splitFieldValue: string | null,
    runtimeMappings: RuntimeMappings | undefined,
    indicesOptions: IndicesOptions | undefined,
    projectRouting: string | undefined
  ) {
    const json: object = getSearchJsonFromConfig(
      indexPatternTitle,
      timeField,
      start,
      end,
      intervalMs,
      query,
      aggFieldNamePairs,
      splitFieldName,
      splitFieldValue,
      runtimeMappings,
      indicesOptions,
      projectRouting
    );

    const body = await asCurrentUser.search(json, { maxRetries: 0 });
    return processSearchResults(
      body,
      aggFieldNamePairs.map((af) => af.field)
    );
  }

  return {
    newJobLineChart,
  };
}

function processSearchResults(resp: any, fields: string[]): ProcessedResults {
  const aggregationsByTime = get(resp, ['aggregations', 'times', 'buckets'], []);

  const tempResults: Record<DtrIndex, Result[]> = Object.create(null);
  fields.forEach((f, i) => (tempResults[i] = []));

  aggregationsByTime.forEach((dataForTime: any) => {
    const time: TimeStamp = +dataForTime.key;
    const docCount = +dataForTime.doc_count;

    fields.forEach((field, i) => {
      let value;
      if (field === EVENT_RATE_FIELD_ID) {
        value = docCount;
      } else if (typeof dataForTime[i].value !== 'undefined') {
        value = dataForTime[i].value;
      } else if (typeof dataForTime[i].values !== 'undefined') {
        value = dataForTime[i].values[ML_MEDIAN_PERCENTS];
      }

      tempResults[i].push({
        time,
        value,
      });
    });
  });

  return {
    success: true,
    results: tempResults,
    totalResults: resp.hits.total.value,
  };
}

function getSearchJsonFromConfig(
  indexPatternTitle: string,
  timeField: string,
  start: number,
  end: number,
  intervalMs: number,
  query: any,
  aggFieldNamePairs: AggFieldNamePair[],
  splitFieldName: string | null,
  splitFieldValue: string | null,
  runtimeMappings: RuntimeMappings | undefined,
  indicesOptions: IndicesOptions | undefined,
  projectRouting: string | undefined
): object {
  const json = {
    index: indexPatternTitle,
    size: 0,
    track_total_hits: true,
    body: {
      query: {},
      aggs: {
        times: {
          date_histogram: {
            field: timeField,
            fixed_interval: `${intervalMs}ms`,
            min_doc_count: 0,
            extended_bounds: {
              min: start,
              max: end,
            },
          },
          aggs: {},
        },
      },
      ...(runtimeMappings !== undefined ? { runtime_mappings: runtimeMappings } : {}),
      ...(projectRouting !== undefined ? { project_routing: projectRouting } : {}),
    },
    ...(indicesOptions ?? {}),
  };

  if (query.bool === undefined) {
    query.bool = {
      must: [],
    };
  } else if (query.bool.must === undefined) {
    query.bool.must = [];
  }

  query.bool.must.push({
    range: {
      [timeField]: {
        gte: start,
        lte: end,
        format: 'epoch_millis',
      },
    },
  });

  if (splitFieldName !== null && splitFieldValue !== null) {
    query.bool.must.push({
      term: {
        [splitFieldName]: splitFieldValue,
      },
    });
  }

  json.body.query = query;

  const aggs: Record<
    number,
    Record<string, { field: string; percents?: string[] }>
  > = Object.create(null);

  aggFieldNamePairs.forEach(({ agg, field }, i) => {
    if (field !== null && field !== EVENT_RATE_FIELD_ID) {
      aggs[i] = {
        [agg]: { field },
      };

      if (agg === 'percentiles') {
        aggs[i][agg].percents = [ML_MEDIAN_PERCENTS];
      }
    }
  });

  json.body.aggs.times.aggs = aggs;

  return json;
}
