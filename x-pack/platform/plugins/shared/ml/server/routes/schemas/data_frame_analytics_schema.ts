/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { CreateDataViewApiResponseSchema } from '@kbn/ml-data-view-utils/types/api_create_response_schema';

import { runtimeMappingsSchema } from './runtime_mappings_schema';

export const dataFrameAnalyticsJobConfigSchema = schema.object({
  description: schema.maybe(schema.string({ maxLength: 10000 })),
  _meta: schema.maybe(schema.object({}, { unknowns: 'allow' })),
  dest: schema.object({
    index: schema.string({ maxLength: 10000 }),
    results_field: schema.maybe(schema.string({ maxLength: 10000 })),
  }),
  source: schema.object({
    index: schema.oneOf([
      schema.string({ maxLength: 10000 }),
      schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 }),
    ]),
    query: schema.maybe(schema.any()),
    runtime_mappings: runtimeMappingsSchema,
    _source: schema.maybe(
      schema.object({
        /** Fields to include in results */
        includes: schema.maybe(
          schema.arrayOf(schema.maybe(schema.string({ maxLength: 10000 })), { maxSize: 10000 })
        ),
        /** Fields to exclude from results */
        excludes: schema.maybe(
          schema.arrayOf(schema.maybe(schema.string({ maxLength: 10000 })), { maxSize: 10000 })
        ),
      })
    ),
  }),
  allow_lazy_start: schema.maybe(schema.boolean()),
  analysis: schema.any(),
  analyzed_fields: schema.any(),
  model_memory_limit: schema.string({ maxLength: 10000 }),
  max_num_threads: schema.maybe(schema.number()),
});

export const dataFrameAnalyticsEvaluateSchema = schema.object({
  index: schema.string({ maxLength: 10000 }),
  query: schema.maybe(schema.any()),
  evaluation: schema.maybe(
    schema.object({
      regression: schema.maybe(schema.any()),
      classification: schema.maybe(schema.any()),
      outlier_detection: schema.maybe(schema.any()),
    })
  ),
});

export const dataFrameAnalyticsExplainSchema = schema.object({
  description: schema.maybe(schema.string({ maxLength: 10000 })),
  dest: schema.maybe(schema.any()),
  /** Source */
  source: schema.object({
    index: schema.oneOf([
      schema.string({ maxLength: 10000 }),
      schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 }),
    ]),
    query: schema.maybe(schema.any()),
    runtime_mappings: runtimeMappingsSchema,
  }),
  analysis: schema.any(),
  analyzed_fields: schema.maybe(schema.any()),
  model_memory_limit: schema.maybe(schema.string({ maxLength: 10000 })),
  max_num_threads: schema.maybe(schema.number()),
  _meta: schema.maybe(schema.object({}, { unknowns: 'allow' })),
});

export const dataFrameAnalyticsIdSchema = schema.object({
  analyticsId: schema.string({ maxLength: 10000, meta: { description: 'Analytics ID' } }),
});

export const dataFrameAnalyticsQuerySchema = schema.object({
  excludeGenerated: schema.maybe(schema.boolean()),
  size: schema.maybe(schema.number()),
});

export const deleteDataFrameAnalyticsJobSchema = schema.object({
  deleteDestIndex: schema.maybe(schema.boolean()),
  deleteDestDataView: schema.maybe(schema.boolean()),
  force: schema.maybe(schema.boolean()),
});

export const dataFrameAnalyticsJobUpdateSchema = schema.object({
  description: schema.maybe(schema.string({ maxLength: 10000 })),
  model_memory_limit: schema.maybe(schema.string({ maxLength: 10000 })),
  allow_lazy_start: schema.maybe(schema.boolean()),
  max_num_threads: schema.maybe(schema.number()),
  _meta: schema.maybe(schema.object({}, { unknowns: 'allow' })),
});

export const stopsDataFrameAnalyticsJobQuerySchema = schema.object({
  force: schema.maybe(schema.boolean()),
});

export const dataFrameAnalyticsJobsExistSchema = schema.object({
  analyticsIds: schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 }),
  allSpaces: schema.maybe(schema.boolean()),
});

export const dataFrameAnalyticsMapQuerySchema = schema.maybe(
  schema.object({
    treatAsRoot: schema.maybe(schema.any()),
    type: schema.maybe(schema.string({ maxLength: 10000 })),
  })
);

export const dataFrameAnalyticsNewJobCapsParamsSchema = schema.object({
  indexPattern: schema.string({ maxLength: 10000 }),
});

export const dataFrameAnalyticsNewJobCapsQuerySchema = schema.maybe(
  schema.object({ rollup: schema.maybe(schema.string({ maxLength: 10000 })) })
);

interface DataFrameAnalyticsJobsCreated {
  id: string;
}
interface CreatedError {
  id: string;
  error: any;
}

export interface PutDataFrameAnalyticsResponseSchema extends CreateDataViewApiResponseSchema {
  dataFrameAnalyticsJobsCreated: DataFrameAnalyticsJobsCreated[];
  dataFrameAnalyticsJobsErrors: CreatedError[];
}
