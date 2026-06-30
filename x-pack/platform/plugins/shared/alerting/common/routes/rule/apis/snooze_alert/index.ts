/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export {
  snoozeAlertParamsSchema,
  snoozeAlertQuerySchema,
  snoozeAlertBodySchema,
} from './schemas/latest';
export {
  snoozeAlertParamsSchema as snoozeAlertParamsSchemaV1,
  snoozeAlertQuerySchema as snoozeAlertQuerySchemaV1,
  snoozeAlertBodySchema as snoozeAlertBodySchemaV1,
} from './schemas/v1';

export type {
  SnoozeAlertRequestParams,
  SnoozeAlertRequestQuery,
  SnoozeAlertRequestBody,
} from './types/latest';
export type {
  SnoozeAlertRequestParams as SnoozeAlertRequestParamsV1,
  SnoozeAlertRequestQuery as SnoozeAlertRequestQueryV1,
  SnoozeAlertRequestBody as SnoozeAlertRequestBodyV1,
} from './types/v1';
