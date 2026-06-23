/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TypeOf } from '@kbn/config-schema';
import { schema } from '@kbn/config-schema';

const criteriaFieldSchema = schema.object({
  fieldType: schema.maybe(schema.string({ maxLength: 10000 })),
  fieldName: schema.string({ maxLength: 10000 }),
  fieldValue: schema.any(),
});

const severityThresholdSchema = schema.object({
  min: schema.number(),
  max: schema.maybe(schema.number()),
});

export const anomaliesTableDataSchema = schema.object({
  jobIds: schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 }),
  criteriaFields: schema.arrayOf(criteriaFieldSchema, { maxSize: 10000 }),
  influencers: schema.arrayOf(
    schema.maybe(
      schema.object({ fieldName: schema.string({ maxLength: 10000 }), fieldValue: schema.any() })
    ),
    { maxSize: 10000 }
  ),
  aggregationInterval: schema.string({ maxLength: 10000 }),
  threshold: schema.arrayOf(severityThresholdSchema, { maxSize: 10000 }),
  earliestMs: schema.number(),
  latestMs: schema.number(),
  dateFormatTz: schema.string({ maxLength: 10000 }),
  maxRecords: schema.number(),
  maxExamples: schema.maybe(schema.number()),
  influencersFilterQuery: schema.maybe(schema.any()),
  functionDescription: schema.maybe(schema.nullable(schema.string({ maxLength: 10000 }))),
});

export const categoryDefinitionSchema = schema.object({
  jobId: schema.maybe(schema.string({ maxLength: 10000 })),
  categoryId: schema.string({ maxLength: 10000 }),
});

export const maxAnomalyScoreSchema = schema.object({
  jobIds: schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 }),
  earliestMs: schema.maybe(schema.number()),
  latestMs: schema.maybe(schema.number()),
});

export const categoryExamplesSchema = schema.object({
  jobId: schema.string({ maxLength: 10000 }),
  categoryIds: schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 }),
  maxExamples: schema.number(),
});

export const anomalySearchSchema = schema.object({
  jobIds: schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 }),
  query: schema.any(),
});

const fieldConfig = schema.maybe(
  schema.object({
    applyTimeRange: schema.maybe(schema.boolean()),
    anomalousOnly: schema.maybe(schema.boolean()),
    sort: schema.object({
      by: schema.string({ maxLength: 10000 }),
      order: schema.maybe(schema.string({ maxLength: 10000 })),
    }),
    value: schema.maybe(schema.string({ maxLength: 10000 })),
  })
);

export const partitionFieldValuesSchema = schema.object({
  jobId: schema.string({ maxLength: 10000 }),
  searchTerm: schema.maybe(schema.any()),
  criteriaFields: schema.arrayOf(criteriaFieldSchema, { maxSize: 10000 }),
  earliestMs: schema.number(),
  latestMs: schema.number(),
  fieldsConfig: schema.maybe(
    schema.object({
      partition_field: fieldConfig,
      over_field: fieldConfig,
      by_field: fieldConfig,
    })
  ),
});

export type FieldsConfig = TypeOf<typeof partitionFieldValuesSchema>['fieldsConfig'];
export type FieldConfig = TypeOf<typeof fieldConfig>;

export const getCategorizerStatsSchema = schema.object({
  partitionByValue: schema.maybe(
    schema.string({
      maxLength: 10000,
      meta: {
        description:
          'Optional value to fetch the categorizer stats where results are filtered by partition_by_value = value',
      },
    })
  ),
});

export const getCategorizerStoppedPartitionsSchema = schema.object({
  jobIds: schema.arrayOf(schema.string({ maxLength: 10000 }), {
    maxSize: 10000,
    meta: { description: 'List of jobIds to fetch the categorizer partitions for' },
  }),
  fieldToBucket: schema.maybe(
    schema.string({
      maxLength: 10000,
      meta: {
        description: `Field to aggregate results by: 'job_id' or 'partition_field_value'. If by job_id, will return list of jobIds with at least one partition that have stopped. If by partition_field_value, it will return a list of categorizer stopped partitions for each job_id`,
      },
    })
  ),
});

export const getDatafeedResultsChartDataSchema = schema.object({
  jobId: schema.string({
    maxLength: 10000,
    meta: { description: 'Job id to fetch the bucket results for' },
  }),
  start: schema.number(),
  end: schema.number(),
});

export const getAnomalyChartsSchema = schema.object({
  jobIds: schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 }),
  influencers: schema.arrayOf(schema.any(), { maxSize: 10000 }),
  threshold: schema.arrayOf(severityThresholdSchema, { maxSize: 10000 }),
  earliestMs: schema.number(),
  latestMs: schema.number(),
  maxResults: schema.number({
    defaultValue: 6,
    min: 1,
    max: 50,
    meta: { description: 'Maximum amount of series data' },
  }),
  influencersFilterQuery: schema.maybe(schema.any()),
  numberOfPoints: schema.number({
    meta: { description: 'Optimal number of data points per chart' },
  }),
  timeBounds: schema.object({
    min: schema.maybe(schema.number()),
    max: schema.maybe(schema.number()),
  }),
});

export const getAnomalyRecordsSchema = schema.object({
  jobIds: schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 }),
  threshold: schema.number({ defaultValue: 0, min: 0, max: 99 }),
  earliestMs: schema.number(),
  latestMs: schema.number(),
  criteriaFields: schema.arrayOf(schema.any(), { maxSize: 10000 }),
  interval: schema.string({ maxLength: 10000 }),
  functionDescription: schema.maybe(schema.nullable(schema.string({ maxLength: 10000 }))),
});

export const getTopInfluencersSchema = schema.object({
  jobIds: schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 }),
  earliestMs: schema.number(),
  latestMs: schema.number(),
  maxFieldValues: schema.maybe(schema.number()),
  perPage: schema.maybe(schema.number()),
  page: schema.maybe(schema.number()),
  influencers: schema.maybe(
    schema.arrayOf(
      schema.object({
        fieldName: schema.string({ maxLength: 10000 }),
        fieldValue: schema.string({ maxLength: 10000 }),
      }),
      {
        maxSize: 10000,
      }
    )
  ),
  influencersFilterQuery: schema.maybe(schema.any()),
});

export const getScoresByBucketSchema = schema.object({
  jobIds: schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 }),
  earliestMs: schema.number(),
  latestMs: schema.number(),
  intervalMs: schema.number(),
  perPage: schema.maybe(schema.number()),
  fromPage: schema.maybe(schema.number()),
  swimLaneSeverity: schema.maybe(
    schema.arrayOf(schema.object({ min: schema.number(), max: schema.maybe(schema.number()) }), {
      maxSize: 10000,
    })
  ),
});

export const getInfluencerValueMaxScoreByTimeSchema = schema.object({
  jobIds: schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 }),
  influencerFieldName: schema.string({ maxLength: 10000 }),
  influencerFieldValues: schema.maybe(
    schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 })
  ),
  earliestMs: schema.number(),
  latestMs: schema.number(),
  intervalMs: schema.number(),
  maxResults: schema.maybe(schema.number()),
  perPage: schema.maybe(schema.number()),
  fromPage: schema.maybe(schema.number()),
  influencersFilterQuery: schema.maybe(schema.any()),
  swimLaneSeverity: schema.maybe(
    schema.arrayOf(schema.object({ min: schema.number(), max: schema.maybe(schema.number()) }), {
      maxSize: 10000,
    })
  ),
});
