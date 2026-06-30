/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { schema } from '@kbn/config-schema';

const enabledSchema = schema.maybe(
  schema.object({
    enabled: schema.boolean(),
  })
);

const compatibleModuleTypeSchema = schema.maybe(
  schema.oneOf([
    schema.literal('observability'),
    schema.literal('security'),
    schema.literal('search'),
  ])
);

const vCPURangeSchema = schema.object({
  min: schema.number(),
  max: schema.number(),
  static: schema.maybe(schema.number()),
  maxThreads: schema.number(),
});

export const configSchema = schema.object({
  ad: enabledSchema,
  dfa: enabledSchema,
  nlp: schema.maybe(
    schema.object({
      enabled: schema.boolean(),
      modelDeployment: schema.maybe(
        schema.object({
          allowStaticAllocations: schema.boolean(),
          vCPURange: schema.object({
            low: vCPURangeSchema,
            medium: vCPURangeSchema,
            high: vCPURangeSchema,
          }),
        })
      ),
    })
  ),
  compatibleModuleType: compatibleModuleTypeSchema,
  experimental: schema.maybe(
    schema.object({
      ruleFormV2: enabledSchema,
      anomalyDetectionSkill: enabledSchema,
    })
  ),
});
