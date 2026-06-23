/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { datafeedConfigSchema } from './datafeeds_schema';

const customRulesSchema = schema.maybe(
  schema.arrayOf(
    schema.object({
      actions: schema.arrayOf(
        schema.oneOf([
          schema.literal('skip_result'),
          schema.literal('skip_model_update'),
          schema.literal('force_time_shift'),
        ]),
        { maxSize: 10000 }
      ),
      conditions: schema.maybe(schema.arrayOf(schema.any(), { maxSize: 10000 })),
      scope: schema.maybe(schema.any()),
      params: schema.maybe(schema.any()),
    }),
    { maxSize: 10000, meta: { description: 'Custom rules' } }
  )
);

const AnalysisLimits = schema.object({
  categorization_examples_limit: schema.maybe(
    schema.number({ meta: { description: 'Limit of categorization examples' } })
  ),
  model_memory_limit: schema.string({ maxLength: 10000 }),
});

const detectorSchema = schema.object({
  identifier: schema.maybe(schema.string({ maxLength: 10000 })),
  function: schema.string({ maxLength: 10000 }),
  field_name: schema.maybe(schema.string({ maxLength: 10000 })),
  by_field_name: schema.maybe(schema.string({ maxLength: 10000 })),
  over_field_name: schema.maybe(schema.string({ maxLength: 10000 })),
  partition_field_name: schema.maybe(schema.string({ maxLength: 10000 })),
  detector_description: schema.maybe(schema.string({ maxLength: 10000 })),
  exclude_frequent: schema.maybe(
    schema.oneOf([
      schema.literal('all'),
      schema.literal('none'),
      schema.literal('by'),
      schema.literal('over'),
    ])
  ),
  use_null: schema.maybe(schema.boolean()),
  custom_rules: customRulesSchema,
  detector_index: schema.maybe(schema.number()),
});

const customUrlSchema = {
  url_name: schema.string({ maxLength: 10000 }),
  url_value: schema.string({ maxLength: 10000 }),
  time_range: schema.maybe(schema.any()),
};

const customSettingsSchema = schema.object(
  {
    created_by: schema.maybe(
      schema.string({ maxLength: 10000, meta: { description: 'Indicates the creator entity' } })
    ),
    custom_urls: schema.maybe(
      schema.arrayOf(schema.maybe(schema.object(customUrlSchema)), { maxSize: 10000 })
    ),
  },
  { unknowns: 'allow' } // Create / Update job API allows other fields to be added to custom_settings.
);

export const anomalyDetectionUpdateJobSchema = schema.object({
  description: schema.maybe(schema.string({ maxLength: 10000 })),
  detectors: schema.maybe(
    schema.arrayOf(
      schema.maybe(
        schema.object({
          /** Detector index */
          detector_index: schema.number(),
          /** Description */
          description: schema.maybe(schema.string({ maxLength: 10000 })),
          /** Custom rules */
          custom_rules: customRulesSchema,
        })
      ),
      { maxSize: 10000 }
    )
  ),
  custom_settings: schema.maybe(customSettingsSchema),
  analysis_limits: schema.maybe(AnalysisLimits),
  groups: schema.maybe(schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 })),
  model_snapshot_retention_days: schema.maybe(schema.number()),
  daily_model_snapshot_retention_after_days: schema.maybe(schema.number()),
});

export const analysisConfigSchema = schema.object({
  bucket_span: schema.string({ maxLength: 10000 }),
  summary_count_field_name: schema.maybe(schema.string({ maxLength: 10000 })),
  detectors: schema.arrayOf(detectorSchema, { maxSize: 10000 }),
  influencers: schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 }),
  categorization_field_name: schema.maybe(schema.string({ maxLength: 10000 })),
  categorization_analyzer: schema.maybe(schema.any()),
  categorization_filters: schema.maybe(
    schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 })
  ),
  latency: schema.maybe(schema.number()),
  multivariate_by_fields: schema.maybe(schema.boolean()),
  per_partition_categorization: schema.maybe(
    schema.object({
      enabled: schema.boolean(),
      stop_on_warn: schema.maybe(schema.boolean()),
    })
  ),
  model_prune_window: schema.maybe(schema.string({ maxLength: 10000 })),
});

export const anomalyDetectionJobSchema = {
  analysis_config: analysisConfigSchema,
  analysis_limits: schema.maybe(AnalysisLimits),
  background_persist_interval: schema.maybe(schema.string({ maxLength: 10000 })),
  create_time: schema.maybe(schema.number()),
  custom_settings: schema.maybe(customSettingsSchema),
  allow_lazy_open: schema.maybe(schema.any()),
  data_counts: schema.maybe(schema.any()),
  data_description: schema.object({
    format: schema.maybe(schema.string({ maxLength: 10000 })),
    time_field: schema.string({ maxLength: 10000 }),
    time_format: schema.maybe(schema.string({ maxLength: 10000 })),
  }),
  description: schema.maybe(schema.string({ maxLength: 10000 })),
  established_model_memory: schema.maybe(schema.number()),
  finished_time: schema.maybe(schema.number()),
  job_id: schema.maybe(schema.string({ maxLength: 10000 })),
  job_type: schema.maybe(schema.string({ maxLength: 10000 })),
  job_version: schema.maybe(schema.string({ maxLength: 10000 })),
  groups: schema.maybe(
    schema.arrayOf(schema.maybe(schema.string({ maxLength: 10000 })), { maxSize: 10000 })
  ),
  model_plot_config: schema.maybe(schema.any()),
  model_plot: schema.maybe(schema.any()),
  model_size_stats: schema.maybe(schema.any()),
  model_snapshot_id: schema.maybe(schema.string({ maxLength: 10000 })),
  model_snapshot_min_version: schema.maybe(schema.string({ maxLength: 10000 })),
  model_snapshot_retention_days: schema.maybe(schema.number()),
  daily_model_snapshot_retention_after_days: schema.maybe(schema.number()),
  renormalization_window_days: schema.maybe(schema.number()),
  results_index_name: schema.maybe(schema.string({ maxLength: 10000 })),
  results_retention_days: schema.maybe(schema.number()),
  state: schema.maybe(schema.string({ maxLength: 10000 })),
  datafeed_config: schema.maybe(datafeedConfigSchema),
};

export const jobIdSchemaBasic = {
  jobId: schema.string({ maxLength: 10000, meta: { description: 'Job ID' } }),
};

export const jobIdSchema = schema.object({
  ...jobIdSchemaBasic,
});

export const deleteForecastSchema = schema.object({
  ...jobIdSchemaBasic,
  forecastId: schema.string({ maxLength: 10000 }),
});

export const getBucketsSchema = schema.object({
  anomaly_score: schema.maybe(schema.number()),
  desc: schema.maybe(schema.boolean()),
  end: schema.maybe(schema.string({ maxLength: 10000 })),
  exclude_interim: schema.maybe(schema.boolean()),
  expand: schema.maybe(schema.boolean()),
  page: schema.maybe(
    schema.object(
      {
        from: schema.number({ meta: { description: 'Page offset' } }),
        size: schema.number({ meta: { description: 'Size of the page' } }),
      },
      { meta: { description: 'Page definition' } }
    )
  ),
  sort: schema.maybe(schema.string({ maxLength: 10000 })),
  start: schema.maybe(schema.string({ maxLength: 10000 })),
});

export const getBucketParamsSchema = schema.object({
  jobId: schema.string({ maxLength: 10000 }),
  timestamp: schema.maybe(schema.string({ maxLength: 10000 })),
});

export const getOverallBucketsSchema = schema.object({
  topN: schema.number(),
  bucketSpan: schema.string({ maxLength: 10000 }),
  start: schema.number(),
  end: schema.number(),
  overall_score: schema.maybe(schema.number()),
});

export const getCategoriesSchema = schema.object({
  categoryId: schema.string({ maxLength: 10000, meta: { description: 'Category ID' } }),
  ...jobIdSchemaBasic,
});

export const getModelSnapshotsSchema = schema.object({
  snapshotId: schema.maybe(
    schema.string({ maxLength: 10000, meta: { description: 'Snapshot ID' } })
  ),
  ...jobIdSchemaBasic,
});

export const updateModelSnapshotsSchema = schema.object({
  snapshotId: schema.string({ maxLength: 10000, meta: { description: 'Snapshot ID' } }),
  ...jobIdSchemaBasic,
});

export const updateModelSnapshotBodySchema = schema.object({
  description: schema.maybe(schema.string({ maxLength: 10000 })),
  retain: schema.maybe(schema.boolean()),
});

export const forecastAnomalyDetector = schema.object({
  duration: schema.any(),
  expires_in: schema.maybe(schema.any()),
});

export const forceQuerySchema = schema.object({
  force: schema.maybe(schema.boolean()),
});

export const jobForCloningSchema = schema.object({
  retainCreatedBy: schema.maybe(
    schema.boolean({ meta: { description: 'Whether to retain the created_by custom setting.' } })
  ),
  ...jobIdSchemaBasic,
});

export const getAnomalyDetectorsResponse = () => {
  return schema.object({
    count: schema.number(),
    jobs: schema.arrayOf(schema.any(), { maxSize: 10000 }),
  });
};
