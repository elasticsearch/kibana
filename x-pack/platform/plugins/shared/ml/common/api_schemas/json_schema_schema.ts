/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema, type TypeOf } from '@kbn/config-schema';

export const getJsonSchemaQuerySchema = schema.object({
  /**
   * ES API path
   */
  path: schema.oneOf([
    schema.literal('/_ml/anomaly_detectors/{job_id}'),
    schema.literal('/_ml/datafeeds/{datafeed_id}'),
  ]),
  /**
   * API Method
   */
  method: schema.string({ maxLength: 10000 }),
});

export type SupportedPath = TypeOf<typeof getJsonSchemaQuerySchema>['path'];
