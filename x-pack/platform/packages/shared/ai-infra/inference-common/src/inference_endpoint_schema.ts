/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema, type TypeOf } from '@kbn/config-schema';

/**
 * Request body shared by the internal `_add` (POST) and `_update` (PUT) inference endpoint routes.
 */
export const inferenceEndpointSchema = schema.object({
  config: schema.object({
    inferenceId: schema.string(),
    provider: schema.string(),
    taskType: schema.string(),
    providerConfig: schema.recordOf(schema.string(), schema.any()),
    taskTypeConfig: schema.maybe(schema.recordOf(schema.string(), schema.any())),
    headers: schema.maybe(schema.recordOf(schema.string(), schema.string())),
  }),
  secrets: schema.object({
    providerSecrets: schema.recordOf(schema.string(), schema.any()),
  }),
});

export type InferenceEndpointRequestBody = TypeOf<typeof inferenceEndpointSchema>;
