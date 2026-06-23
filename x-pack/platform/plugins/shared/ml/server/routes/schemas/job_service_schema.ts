/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { runtimeMappingsSchema } from './runtime_mappings_schema';
import { anomalyDetectionJobSchema } from './anomaly_detectors_schema';
import { datafeedConfigSchema, indicesOptionsSchema } from './datafeeds_schema';

export const categorizationFieldValidationSchema = {
  indexPatternTitle: schema.string({ maxLength: 10000 }),
  query: schema.any(),
  size: schema.number(),
  field: schema.string({ maxLength: 10000 }),
  timeField: schema.maybe(schema.string({ maxLength: 10000 })),
  start: schema.number(),
  end: schema.number(),
  analyzer: schema.any(),
  runtimeMappings: runtimeMappingsSchema,
  indicesOptions: indicesOptionsSchema,
};

export const basicChartSchema = {
  indexPatternTitle: schema.string({ maxLength: 10000 }),
  timeField: schema.string({ maxLength: 10000 }),
  start: schema.number(),
  end: schema.number(),
  intervalMs: schema.number(),
  query: schema.any(),
  aggFieldNamePairs: schema.arrayOf(schema.any(), { maxSize: 10000 }),
  splitFieldName: schema.nullable(schema.string({ maxLength: 10000 })),
  splitFieldValue: schema.nullable(schema.string({ maxLength: 10000 })),
  runtimeMappings: schema.maybe(runtimeMappingsSchema),
  indicesOptions: schema.maybe(indicesOptionsSchema),
};

export const populationChartSchema = {
  indexPatternTitle: schema.string({ maxLength: 10000 }),
  timeField: schema.string({ maxLength: 10000 }),
  start: schema.number(),
  end: schema.number(),
  intervalMs: schema.number(),
  query: schema.any(),
  aggFieldNamePairs: schema.arrayOf(schema.any(), { maxSize: 10000 }),
  splitFieldName: schema.nullable(schema.string({ maxLength: 10000 })),
  splitFieldValue: schema.maybe(schema.nullable(schema.string({ maxLength: 10000 }))),
  runtimeMappings: schema.maybe(runtimeMappingsSchema),
  indicesOptions: schema.maybe(indicesOptionsSchema),
};

export const forceStartDatafeedSchema = schema.object({
  datafeedIds: schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 }),
  start: schema.maybe(schema.number()),
  end: schema.maybe(schema.number()),
});

const jobIds = {
  jobIds: schema.arrayOf(schema.string({ maxLength: 10000 }), {
    maxSize: 10000,
    meta: { description: 'List of job IDs.' },
  }),
};

export const jobIdsSchema = schema.object({
  ...jobIds,
});

export const deleteJobsSchema = schema.object({
  ...jobIds,
  deleteUserAnnotations: schema.maybe(schema.boolean()),
  deleteAlertingRules: schema.maybe(schema.boolean()),
});

export const stopDatafeedsSchema = schema.object({
  datafeedIds: schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 }),
  closeJobs: schema.maybe(schema.boolean()),
});

export const optionalJobIdsSchema = schema.object({
  jobIds: schema.maybe(jobIds.jobIds),
});

export const lookBackProgressSchema = {
  jobId: schema.string({ maxLength: 10000 }),
  start: schema.number(),
  end: schema.number(),
};

export const topCategoriesSchema = {
  jobId: schema.string({ maxLength: 10000 }),
  count: schema.number(),
};

export const updateGroupsSchema = schema.object({
  jobs: schema.arrayOf(
    schema.object({
      jobId: schema.string({ maxLength: 10000 }),
      groups: schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 }),
    }),
    { maxSize: 10000 }
  ),
});

export const revertModelSnapshotSchema = schema.object({
  jobId: schema.string({ maxLength: 10000 }),
  snapshotId: schema.string({ maxLength: 10000 }),
  replay: schema.boolean(),
  end: schema.maybe(schema.number()),
  deleteInterveningResults: schema.maybe(schema.boolean()),
  calendarEvents: schema.maybe(
    schema.arrayOf(
      schema.object({
        start: schema.number(),
        end: schema.number(),
        description: schema.string({ maxLength: 10000 }),
      }),
      { maxSize: 10000 }
    )
  ),
});

export const datafeedPreviewSchema = schema.object(
  {
    job: schema.maybe(schema.object(anomalyDetectionJobSchema)),
    datafeed: schema.maybe(datafeedConfigSchema),
    datafeedId: schema.maybe(schema.string({ maxLength: 10000 })),
  },
  {
    validate: (v) => {
      const msg = 'supply either a datafeed_id for an existing job or a job and datafeed config';
      if (v.datafeedId !== undefined && (v.job !== undefined || v.datafeed !== undefined)) {
        // datafeed_id is supplied but job and datafeed configs are also supplied
        return msg;
      }

      if (v.datafeedId === undefined && (v.job === undefined || v.datafeed === undefined)) {
        // datafeed_id is not supplied but job or datafeed configs are missing
        return msg;
      }

      if (v.datafeedId === undefined && v.job === undefined && v.datafeed === undefined) {
        // everything is missing
        return msg;
      }
    },
  }
);

export const jobsExistSchema = schema.object({
  jobIds: schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 }),
  allSpaces: schema.maybe(schema.boolean()),
});

export const bulkCreateSchema = schema.oneOf([
  schema.arrayOf(
    schema.object({
      job: schema.object(anomalyDetectionJobSchema),
      datafeed: datafeedConfigSchema,
    }),
    { maxSize: 10000 }
  ),
  schema.object({
    job: schema.object(anomalyDetectionJobSchema),
    datafeed: datafeedConfigSchema,
  }),
]);
