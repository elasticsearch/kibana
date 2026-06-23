/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';

const modelIdSchemaBasic = {
  modelId: schema.string({ maxLength: 10000, meta: { description: 'Model ID' } }),
};

export const modelIdSchema = schema.object({
  ...modelIdSchemaBasic,
});

export const modelAndDeploymentIdSchema = schema.object({
  ...modelIdSchemaBasic,
  deploymentId: schema.string({ maxLength: 10000, meta: { description: 'Deployment ID' } }),
});
export const createInferenceSchema = schema.object({
  taskType: schema.oneOf([schema.literal('sparse_embedding'), schema.literal('text_embedding')]),
  inferenceId: schema.string({ maxLength: 10000 }),
});

export const threadingParamsQuerySchema = schema.maybe(
  schema.object({
    number_of_allocations: schema.maybe(schema.number()),
    threads_per_allocation: schema.maybe(schema.number()),
    priority: schema.maybe(schema.oneOf([schema.literal('low'), schema.literal('normal')])),
    deployment_id: schema.maybe(schema.string({ maxLength: 10000 })),
  })
);

export const threadingParamsBodySchema = schema.nullable(
  schema.object({
    adaptive_allocations: schema.maybe(
      schema.object({
        enabled: schema.boolean(),
        min_number_of_allocations: schema.maybe(schema.number()),
        max_number_of_allocations: schema.maybe(schema.number()),
      })
    ),
  })
);

export const updateDeploymentParamsSchema = schema.object({
  number_of_allocations: schema.maybe(schema.number()),
  adaptive_allocations: schema.maybe(
    schema.object({
      enabled: schema.boolean(),
      min_number_of_allocations: schema.maybe(schema.number()),
      max_number_of_allocations: schema.maybe(schema.number()),
    })
  ),
});

export const optionalModelIdSchema = schema.object({
  /**
   * Model ID
   */
  modelId: schema.maybe(schema.string({ maxLength: 10000 })),
});

export const getInferenceQuerySchema = schema.object({
  size: schema.maybe(schema.string({ maxLength: 10000 })),
  include: schema.maybe(schema.string({ maxLength: 10000 })),
});

export const putTrainedModelQuerySchema = schema.object({
  defer_definition_decompression: schema.maybe(schema.boolean()),
});

export const inferTrainedModelQuery = schema.object({
  timeout: schema.maybe(schema.string({ maxLength: 10000 })),
});
export const inferTrainedModelBody = schema.object({
  docs: schema.any(),
  inference_config: schema.maybe(schema.any()),
});

export const pipelineSimulateBody = schema.object({
  pipeline: schema.any(),
  docs: schema.arrayOf(schema.any(), { maxSize: 10000 }),
});
export const pipelineDocs = schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 });

export const stopDeploymentSchema = schema.object({
  ...modelIdSchemaBasic,
  force: schema.maybe(schema.boolean({ meta: { description: 'Force stop' } })),
});

export const deleteTrainedModelQuerySchema = schema.object({
  with_pipelines: schema.maybe(schema.boolean({ defaultValue: false })),
  force: schema.maybe(schema.boolean({ defaultValue: false })),
});

export const createIngestPipelineSchema = schema.object({
  pipelineName: schema.string({ maxLength: 10000 }),
  pipeline: schema.maybe(
    schema.object({
      processors: schema.arrayOf(schema.any(), { maxSize: 10000 }),
      description: schema.maybe(schema.string({ maxLength: 10000 })),
    })
  ),
});

export const modelDownloadsQuery = schema.object({
  version: schema.maybe(schema.oneOf([schema.literal('1'), schema.literal('2')])),
});

export const curatedModelsParamsSchema = schema.object({
  modelName: schema.string({ maxLength: 10000 }),
});

export const curatedModelsQuerySchema = schema.object({ version: schema.maybe(schema.number()) });
