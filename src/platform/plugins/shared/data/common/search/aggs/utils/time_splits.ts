/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import moment from 'moment-timezone';
import { isArray } from 'lodash';
import type { estypes } from '@elastic/elasticsearch';

import type { RangeFilter } from '@kbn/es-query';
import { AggGroupNames } from '../agg_groups';
import type { GenericBucket, AggConfigs, AggConfig } from '../../..';
import { getTime } from '../../..';
import type { IBucketAggConfig } from '../buckets';

/**
 * This function will transform an ES response containg a time split (using a filters aggregation before the metrics or date histogram aggregation),
 * merging together all branches for the different time ranges into a single response structure which can be tabified into a single table.
 *
 * If there is just a single time shift, there are no separate branches per time range - in this case only the date histogram keys are shifted by the
 * configured amount of time.
 *
 * To do this, the following steps are taken:
 * * Traverse the response tree, tracking the current agg config
 * * Once the node which would contain the time split object is found, merge all separate time range buckets into a single layer of buckets of the parent agg
 * * Recursively repeat this process for all nested sub-buckets
 *
 * Example input:
 * ```
 * "aggregations" : {
    "product" : {
      "buckets" : [
        {
          "key" : "Product A",
          "doc_count" : 512,
          "first_year" : {
            "doc_count" : 418,
            "overall_revenue" : {
              "value" : 2163634.0
            }
          },
          "time_offset_split" : {
            "buckets" : {
              "-1y" : {
                "doc_count" : 420,
                "year" : {
                  "buckets" : [
                    {
                      "key_as_string" : "2018",
                      "doc_count" : 81,
                      "revenue" : {
                        "value" : 505124.0
                      }
                    },
                    {
                      "key_as_string" : "2019",
                      "doc_count" : 65,
                      "revenue" : {
                        "value" : 363058.0
                      }
                    }
                  ]
                }
              },
              "regular" : {
                "doc_count" : 418,
                "year" : {
                  "buckets" : [
                    {
                      "key_as_string" : "2019",
                      "doc_count" : 65,
                      "revenue" : {
                        "value" : 363058.0
                      }
                    },
                    {
                      "key_as_string" : "2020",
                      "doc_count" : 84,
                      "revenue" : {
                        "value" : 392924.0
                      }
                    }
                  ]
                }
              }
            }
          }
        },
        {
          "key" : "Product B",
          "doc_count" : 248,
          "first_year" : {
            "doc_count" : 215,
            "overall_revenue" : {
              "value" : 1315547.0
            }
          },
          "time_offset_split" : {
            "buckets" : {
              "-1y" : {
                "doc_count" : 211,
                "year" : {
                  "buckets" : [
                    {
                      "key_as_string" : "2018",
                      "key" : 1618963200000,
                      "doc_count" : 28,
                      "revenue" : {
                        "value" : 156543.0
                      }
                    },
   // ...
 * ```
 *
 * Example output:
 * ```
 * "aggregations" : {
    "product" : {
      "buckets" : [
        {
          "key" : "Product A",
          "doc_count" : 512,
          "first_year" : {
            "doc_count" : 418,
            "overall_revenue" : {
              "value" : 2163634.0
            }
          },
          "year" : {
            "buckets" : [
              {
                "key_as_string" : "2019",
                "doc_count" : 81,
                "revenue_regular" : {
                  "value" : 505124.0
                },
                "revenue_-1y" : {
                  "value" : 302736.0
                }
             },
             {
               "key_as_string" : "2020",
               "doc_count" : 78,
               "revenue_regular" : {
                 "value" : 392924.0
               },
               "revenue_-1y" : {
                 "value" : 363058.0
               },
             }
   // ...
 * ```
 *
 *
 * @param aggConfigs The agg configs instance
 * @param aggCursor The root aggregations object from the response which will be mutated in place
 */
export function mergeTimeShifts(
  aggConfigs: AggConfigs,
  aggCursor: Record<string, estypes.AggregationsAggregate>
) {
  const timeShifts = aggConfigs.getTimeShifts();
  const hasMultipleTimeShifts = Object.keys(timeShifts).length > 1;
  const requestAggs = aggConfigs.getRequestAggs();
  const bucketAggs = aggConfigs.aggs.filter(
    (agg) => agg.type.type === AggGroupNames.Buckets
  ) as IBucketAggConfig[];
  const mergeAggLevel = (
    target: GenericBucket,
    source: GenericBucket,
    shift: moment.Duration,
    aggIndex: number
  ) => {
    Object.entries(source).forEach(([key, val]) => {
      // copy over doc count into special key
      if (typeof val === 'number' && key === 'doc_count') {
        if (shift.asMilliseconds() === 0) {
          target.doc_count = val;
        } else {
          target[`doc_count_${shift.asMilliseconds()}`] = val;
        }
      } else if (typeof val !== 'object') {
        // other meta keys not of interest
        return;
      } else {
        // a sub-agg
        const agg = requestAggs.find((requestAgg) => key === requestAgg.getResponseId());
        if (agg && agg.type.type === AggGroupNames.Metrics) {
          const timeShift = agg.getTimeShift();
          if (
            (timeShift && timeShift.asMilliseconds() === shift.asMilliseconds()) ||
            (shift.asMilliseconds() === 0 && !timeShift)
          ) {
            // this is a metric from the current time shift, copy it over
            target[key] = source[key];
          }
        } else if (agg && agg === bucketAggs[aggIndex]) {
          const bucketAgg = agg as IBucketAggConfig;
          // expected next bucket sub agg
          const subAggregate = val as estypes.AggregationsAggregate;
          const buckets = ('buckets' in subAggregate ? subAggregate.buckets : undefined) as
            | GenericBucket[]
            | Record<string, GenericBucket>
            | undefined;
          if (!target[key]) {
            // sub aggregate only exists in shifted branch, not in base branch - create dummy aggregate
            // which will be filled with shifted data
            target[key] = {
              buckets: isArray(buckets) ? [] : {},
            };
          }
          const baseSubAggregate = target[key] as estypes.AggregationsAggregate;
          // only supported bucket formats in agg configs are array of buckets and record of buckets for filters
          const baseBuckets = (
            'buckets' in baseSubAggregate ? baseSubAggregate.buckets : undefined
          ) as GenericBucket[] | Record<string, GenericBucket> | undefined;
          // merge
          if (isArray(buckets) && isArray(baseBuckets)) {
            const baseBucketMap: Record<string, GenericBucket> = {};
            baseBuckets.forEach((bucket) => {
              baseBucketMap[String(bucket.key)] = bucket;
            });
            buckets.forEach((bucket) => {
              const bucketKey = bucketAgg.type.getShiftedKey(
                bucketAgg,
                bucket.key as string | number,
                shift
              );
              // if a bucket is missing in the map, create an empty one
              if (!baseBucketMap[bucketKey]) {
                baseBucketMap[String(bucketKey)] = {
                  key: bucketKey,
                } as GenericBucket;
              }
              mergeAggLevel(baseBucketMap[bucketKey], bucket, shift, aggIndex + 1);
            });
            (baseSubAggregate as estypes.AggregationsMultiBucketAggregateBase<any>).buckets =
              Object.values(baseBucketMap).sort((a, b) =>
                bucketAgg.type.orderBuckets(bucketAgg, a, b)
              );
          } else if (baseBuckets && buckets && !isArray(baseBuckets)) {
            Object.entries(buckets).forEach(([bucketKey, bucket]) => {
              // if a bucket is missing in the base response, create an empty one
              if (!baseBuckets[bucketKey]) {
                baseBuckets[bucketKey] = {} as GenericBucket;
              }
              mergeAggLevel(baseBuckets[bucketKey], bucket, shift, aggIndex + 1);
            });
          }
        }
      }
    });
  };
  const transformTimeShift = (
    cursor: Record<string, estypes.AggregationsAggregate>,
    aggIndex: number
  ): undefined => {
    const shouldSplit = aggConfigs.aggs[aggIndex].type.splitForTimeShift(
      aggConfigs.aggs[aggIndex],
      aggConfigs
    );
    if (shouldSplit) {
      // multiple time shifts caused a filters agg in the tree we have to merge
      if (hasMultipleTimeShifts && cursor.time_offset_split) {
        const timeShiftedBuckets = (
          cursor.time_offset_split as estypes.AggregationsFiltersAggregate
        ).buckets;
        const subTree = {};
        Object.entries(timeShifts).forEach(([key, shift]) => {
          mergeAggLevel(
            subTree as GenericBucket,
            // @ts-expect-error No index signature with a parameter of type 'string' was found on type 'AggregationsBuckets<AggregationsFiltersBucket>'
            timeShiftedBuckets[key] as GenericBucket,
            shift,
            aggIndex
          );
        });

        delete cursor.time_offset_split;
        Object.assign(cursor, subTree);
      } else {
        // otherwise we have to "merge" a single level to shift all keys
        const [[, shift]] = Object.entries(timeShifts);
        const subTree = {};
        mergeAggLevel(subTree, cursor, shift, aggIndex);
        Object.assign(cursor, subTree);
      }
      return;
    }
    // recurse deeper into the response object
    Object.keys(cursor).forEach((subAggId) => {
      const subAgg = cursor[subAggId];
      if (typeof subAgg !== 'object' || !('buckets' in subAgg)) {
        return;
      }
      if (isArray(subAgg.buckets)) {
        subAgg.buckets.forEach((bucket) => transformTimeShift(bucket, aggIndex + 1));
      } else {
        Object.values(subAgg.buckets).forEach((bucket: any) =>
          transformTimeShift(bucket, aggIndex + 1)
        );
      }
    });
  };
  transformTimeShift(aggCursor, 0);
}

/**
 * Inserts a filters aggregation into the aggregation tree which splits buckets to fetch data for all time ranges
 * configured in metric aggregations.
 *
 * The current agg config can implement `splitForTimeShift` to force insertion of the time split filters aggregation
 * before the dsl of the agg config (date histogram and metrics aggregations do this)
 *
 * Example aggregation tree without time split:
 * ```
 * "aggs": {
    "product": {
      "terms": {
        "field": "product",
        "size": 3,
        "order": { "overall_revenue": "desc" }
      },
      "aggs": {
        "overall_revenue": {
          "sum": {
            "field": "sales"
          }
        },
        "year": {
          "date_histogram": {
            "field": "timestamp",
            "interval": "year"
          },
          "aggs": {
            "revenue": {
              "sum": {
                  "field": "sales"
              }
            }
          }
   // ...
 * ```
 *
 * Same aggregation tree with inserted time split:
 * ```
 * "aggs": {
    "product": {
      "terms": {
        "field": "product",
        "size": 3,
        "order": { "first_year>overall_revenue": "desc" }
      },
      "aggs": {
        "first_year": {
          "filter": {
            "range": {
              "timestamp": {
                "gte": "2019",
                "lte": "2020"
              }
            }
          },
          "aggs": {
            "overall_revenue": {
              "sum": {
                "field": "sales"
              }
            }
          }
        },
        "time_offset_split": {
          "filters": {
            "filters": {
              "regular": {
                "range": {
                  "timestamp": {
                    "gte": "2019",
                    "lte": "2020"
                  }
                }
              },
              "-1y": {
                "range": {
                  "timestamp": {
                    "gte": "2018",
                    "lte": "2019"
                  }
                }
              }
            }
          },
          "aggs": {
            "year": {
              "date_histogram": {
                "field": "timestamp",
                "interval": "year"
              },
              "aggs": {
                "revenue": {
                  "sum": {
                      "field": "sales"
                  }
                }
              }
            }
          }
        }
      }
 * ```
 */
export function insertTimeShiftSplit(
  aggConfigs: AggConfigs,
  config: AggConfig,
  timeShifts: Record<string, moment.Duration>,
  dslLvlCursor: Record<string, any>,
  defaultTimeZone: string
) {
  if ('splitForTimeShift' in config.type && !config.type.splitForTimeShift(config, aggConfigs)) {
    return dslLvlCursor;
  }
  if (!aggConfigs.timeFields || aggConfigs.timeFields.length < 1) {
    throw new Error('Time shift can only be used with configured time field');
  }
  if (!aggConfigs.timeRange) {
    throw new Error('Time shift can only be used with configured time range');
  }
  const timeRange = aggConfigs.timeRange;
  const filters: Record<string, unknown> = {};
  const timeField = aggConfigs.timeFields[0];
  const timeFilter = getTime(aggConfigs.indexPattern, timeRange, {
    fieldName: timeField,
    forceNow: aggConfigs.forceNow,
  }) as RangeFilter;
  Object.entries(timeShifts).forEach(([key, shift]) => {
    if (timeFilter) {
      filters[key] = {
        range: {
          [timeField]: {
            format: 'strict_date_optional_time',
            gte: moment
              .tz(timeFilter.query.range[timeField].gte, defaultTimeZone)
              .subtract(shift)
              .toISOString(),
            lte: moment
              .tz(timeFilter.query.range[timeField].lte, defaultTimeZone)
              .subtract(shift)
              .toISOString(),
          },
        },
      };
    }
  });
  dslLvlCursor.time_offset_split = {
    filters: {
      filters,
    },
    aggs: {},
  };

  return dslLvlCursor.time_offset_split.aggs;
}
