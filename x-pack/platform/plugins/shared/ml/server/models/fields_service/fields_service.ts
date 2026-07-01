/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import { duration } from 'moment';

import type { estypes } from '@elastic/elasticsearch';
import type { IScopedClusterClient } from '@kbn/core/server';
import type { AggCardinality } from '@kbn/ml-agg-utils';
import { isPopulatedObject } from '@kbn/ml-is-populated-object';
import type { RuntimeMappings } from '@kbn/ml-runtime-field-utils';
import { parseInterval } from '@kbn/ml-parse-interval';

import type {
  Datafeed,
  IndicesOptions,
} from '@kbn/ml-common-types/anomaly_detection_jobs/datafeed';
import { initCardinalityFieldsCache } from './fields_aggs_cache';
import { isValidAggregationField } from '../../../common/util/validation_utils';
import { getDatafeedAggregations, getIndicesOptions } from '../../../common/util/datafeed_utils';

/**
 * Service for carrying out queries to obtain data
 * specific to fields in Elasticsearch indices.
 */
export function fieldsServiceProvider({ asCurrentUser }: IScopedClusterClient) {
  const fieldsAggsCache = initCardinalityFieldsCache();

  /**
   * Caps the time range to the last 90 days if necessary
   */
  function getSafeTimeRange(earliestMs: number, latestMs: number): { start: number; end: number } {
    const capOffsetMs = duration(3, 'months').asMilliseconds();
    const capRangeStart = latestMs - capOffsetMs;

    return {
      start: Math.max(earliestMs, capRangeStart),
      end: latestMs,
    };
  }

  /**
   * Gets aggregatable fields.
   */
  async function getAggregatableFields(
    index: string | string[],
    fieldNames: string[],
    datafeedConfig?: Datafeed
  ): Promise<string[]> {
    const body = await asCurrentUser.fieldCaps(
      {
        index,
        fields: fieldNames,
      },
      { maxRetries: 0 }
    );
    const aggregatableFields: string[] = [];
    const datafeedAggregations = getDatafeedAggregations(datafeedConfig);

    fieldNames.forEach((fieldName) => {
      if (
        typeof datafeedConfig?.script_fields === 'object' &&
        Object.hasOwn(datafeedConfig.script_fields, fieldName)
      ) {
        aggregatableFields.push(fieldName);
      }
      if (
        typeof datafeedConfig?.runtime_mappings === 'object' &&
        Object.hasOwn(datafeedConfig.runtime_mappings, fieldName)
      ) {
        aggregatableFields.push(fieldName);
      }
      if (
        datafeedAggregations !== undefined &&
        isValidAggregationField(datafeedAggregations, fieldName)
      ) {
        aggregatableFields.push(fieldName);
      }
      const fieldInfo = body.fields[fieldName];
      const typeKeys = fieldInfo !== undefined ? Object.keys(fieldInfo) : [];
      if (typeKeys.length > 0) {
        const fieldType = typeKeys[0];
        const isFieldAggregatable = fieldInfo[fieldType].aggregatable;
        if (isFieldAggregatable === true) {
          aggregatableFields.push(fieldName);
        }
      }
    });
    return aggregatableFields;
  }

  // Obtains the cardinality of one or more fields.
  // Returns an Object whose keys are the names of the fields,
  // with values equal to the cardinality of the field.
  // Any of the supplied fieldNames which are not aggregatable will
  // be omitted from the returned Object.
  async function getCardinalityOfFields(
    index: string[] | string,
    fieldNames: string[],
    query: any,
    timeFieldName: string,
    earliestMs: number,
    latestMs: number,
    datafeedConfig?: Datafeed
  ): Promise<{ [key: string]: number }> {
    const aggregatableFields = await getAggregatableFields(index, fieldNames, datafeedConfig);

    // getAggregatableFields doesn't account for scripted or aggregated fields
    if (aggregatableFields.length === 0) {
      return {};
    }

    const { start, end } = getSafeTimeRange(earliestMs, latestMs);

    const cachedValues =
      fieldsAggsCache.getValues(
        index,
        timeFieldName,
        start,
        end,
        'overallCardinality',
        fieldNames
      ) ?? {};

    // No need to perform aggregation over the cached fields
    const fieldsToAgg = aggregatableFields.filter((field) => !Object.hasOwn(cachedValues, field));

    if (fieldsToAgg.length === 0) {
      return cachedValues;
    }

    // Build the criteria to use in the bool filter part of the request.
    // Add criteria for the time range and the datafeed config query.
    const mustCriteria = [
      {
        range: {
          [timeFieldName]: {
            gte: start,
            lte: end,
            format: 'epoch_millis',
          },
        },
      },
    ];

    if (query) {
      mustCriteria.push(query);
    }

    const runtimeMappings: any = Object.create(null);
    const aggs = fieldsToAgg.reduce(
      (obj, field) => {
        if (
          typeof datafeedConfig?.script_fields === 'object' &&
          Object.hasOwn(datafeedConfig.script_fields, field)
        ) {
          obj[field] = { cardinality: { script: datafeedConfig.script_fields[field].script } };
        } else if (
          typeof datafeedConfig?.runtime_mappings === 'object' &&
          Object.hasOwn(datafeedConfig.runtime_mappings, field)
        ) {
          obj[field] = { cardinality: { field } };
          runtimeMappings.runtime_mappings = datafeedConfig.runtime_mappings;
        } else {
          obj[field] = { cardinality: { field } };
        }
        return obj;
      },
      {} as {
        [field: string]: AggCardinality;
      }
    );

    const body = {
      query: {
        bool: {
          must: mustCriteria,
        },
      },
      size: 0,
      _source: {
        excludes: [],
      },
      aggs,
      ...runtimeMappings,
      ...(datafeedConfig?.project_routing
        ? { project_routing: datafeedConfig.project_routing }
        : {}),
    };

    const { aggregations } = await asCurrentUser.search(
      {
        index,
        body,
        ...getIndicesOptions(datafeedConfig),
      },
      { maxRetries: 0 }
    );

    if (!aggregations) {
      return {};
    }

    const aggResult = fieldsToAgg.reduce((obj, field) => {
      // @ts-expect-error incorrect search response type
      obj[field] = (aggregations[field] || { value: 0 }).value;
      return obj;
    }, {} as { [field: string]: number });

    fieldsAggsCache.updateValues(index, timeFieldName, start, end, {
      overallCardinality: aggResult,
    });

    return {
      ...cachedValues,
      ...aggResult,
    };
  }

  /**
   * Gets time boundaries of the index data based on the provided time field.
   */
  async function getTimeFieldRange(
    index: string[] | string,
    timeFieldName: string,
    query: any,
    runtimeMappings?: RuntimeMappings,
    indicesOptions?: IndicesOptions,
    allowFutureTime = false,
    projectRouting?: string
  ): Promise<{
    success: boolean;
    start: number;
    end: number;
  }> {
    const obj = { success: true, start: 0, end: 0 };

    const { aggregations } = await asCurrentUser.search<
      unknown,
      {
        earliest: estypes.AggregationsMinAggregate;
        latest: estypes.AggregationsMaxAggregate;
      }
    >(
      {
        index,
        size: 0,
        ...(query ? { query } : {}),
        aggs: {
          earliest: {
            min: {
              field: timeFieldName,
            },
          },
          latest: {
            max: {
              field: timeFieldName,
            },
          },
        },
        ...(isPopulatedObject(runtimeMappings) ? { runtime_mappings: runtimeMappings } : {}),
        ...(indicesOptions ?? {}),
        ...(projectRouting ? { project_routing: projectRouting } : {}),
      },
      { maxRetries: 0 }
    );

    if (aggregations && aggregations.earliest && aggregations.latest) {
      obj.start = aggregations.earliest.value ?? 0;
      obj.end = aggregations.latest.value ?? 0;
    }

    const nowEpoch = Date.now();
    if (allowFutureTime === false && obj.end > nowEpoch) {
      obj.end = nowEpoch;
    }
    return obj;
  }

  /**
   * Caps provided time boundaries based on the interval
   */
  function getSafeTimeRangeForInterval(
    interval: string,
    ...timeRange: number[]
  ): { start: number; end: number };
  function getSafeTimeRangeForInterval(
    interval: string,
    earliestMs: number,
    latestMs: number
  ): { start: number; end: number } {
    const maxNumberOfBuckets = 1000;
    const end = latestMs;

    const intervalDuration = parseInterval(interval);

    if (intervalDuration === null) {
      throw Boom.badRequest('Interval is invalid');
    }

    const start = Math.max(
      earliestMs,
      latestMs - maxNumberOfBuckets * intervalDuration.asMilliseconds()
    );

    return { start, end };
  }

  /**
   * Retrieves max cardinalities for provided fields from date interval buckets
   * using max bucket pipeline aggregation.
   *
   * @param index
   * @param fieldNames - fields to perform cardinality aggregation on
   * @param query
   * @param timeFieldName
   * @param earliestMs
   * @param latestMs
   * @param interval - a fixed interval for the date histogram aggregation
   */
  async function getMaxBucketCardinalities(
    index: string[] | string,
    fieldNames: string[],
    query: any,
    timeFieldName: string,
    earliestMs: number,
    latestMs: number,
    interval: string | undefined,
    datafeedConfig?: Datafeed
  ): Promise<{ [key: string]: number }> {
    if (!interval) {
      throw Boom.badRequest('Interval is required to retrieve max bucket cardinalities.');
    }

    const aggregatableFields = await getAggregatableFields(index, fieldNames, datafeedConfig);

    if (aggregatableFields.length === 0) {
      return {};
    }

    const { start, end } = getSafeTimeRangeForInterval(
      interval,
      ...Object.values(getSafeTimeRange(earliestMs, latestMs))
    );

    const cachedValues =
      fieldsAggsCache.getValues(
        index,
        timeFieldName,
        start,
        end,
        'maxBucketCardinality',
        fieldNames
      ) ?? {};

    // No need to perform aggregation over the cached fields
    const fieldsToAgg = aggregatableFields.filter((field) => !Object.hasOwn(cachedValues, field));

    if (fieldsToAgg.length === 0) {
      return cachedValues;
    }

    const mustCriteria = [
      {
        range: {
          [timeFieldName]: {
            gte: start,
            lte: end,
            format: 'epoch_millis',
          },
        },
      },
    ];

    if (query) {
      mustCriteria.push(query);
    }

    const dateHistogramAggKey = 'bucket_span_buckets';
    /**
     * Replace any non-word characters
     */
    const getSafeAggName = (field: string) => field.replace(/\W/g, '');
    const getMaxBucketAggKey = (field: string) => `max_bucket_${field}`;

    const fieldsCardinalityAggs = fieldsToAgg.reduce((obj, field) => {
      obj[getSafeAggName(field)] = { cardinality: { field } };
      return obj;
    }, {} as { [field: string]: { cardinality: { field: string } } });

    const maxBucketCardinalitiesAggs = Object.keys(fieldsCardinalityAggs).reduce((acc, field) => {
      acc[getMaxBucketAggKey(field)] = {
        max_bucket: {
          buckets_path: `${dateHistogramAggKey}>${field}`,
        },
      };
      return acc;
    }, {} as { [key: string]: { max_bucket: { buckets_path: string } } });

    const body = {
      query: {
        bool: {
          filter: mustCriteria,
        },
      },
      size: 0,
      aggs: {
        [dateHistogramAggKey]: {
          date_histogram: {
            field: timeFieldName,
            fixed_interval: interval,
          },
          aggs: fieldsCardinalityAggs,
        },
        ...maxBucketCardinalitiesAggs,
      },
    };

    const { aggregations } = await asCurrentUser.search(
      {
        index,
        ...body,
        ...getIndicesOptions(datafeedConfig),
        ...(datafeedConfig?.project_routing
          ? { project_routing: datafeedConfig.project_routing }
          : {}),
      },
      { maxRetries: 0 }
    );

    if (!aggregations) {
      return cachedValues;
    }

    const aggResult = fieldsToAgg.reduce((obj, field) => {
      // @ts-expect-error incorrect search response type
      obj[field] = (aggregations[getMaxBucketAggKey(field)] || { value: 0 }).value ?? 0;
      return obj;
    }, {} as { [field: string]: number });

    fieldsAggsCache.updateValues(index, timeFieldName, start, end, {
      maxBucketCardinality: aggResult,
    });

    return {
      ...cachedValues,
      ...aggResult,
    };
  }

  return {
    getCardinalityOfFields,
    getTimeFieldRange,
    getMaxBucketCardinalities,
  };
}
