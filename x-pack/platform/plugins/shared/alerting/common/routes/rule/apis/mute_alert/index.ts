/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export { muteAlertParamsSchema, muteAlertQuerySchema } from './schemas/latest';
export {
  muteAlertParamsSchema as muteAlertParamsSchemaV1,
  muteAlertQuerySchema as muteAlertQuerySchemaV1,
} from './schemas/v1';

export type { MuteAlertRequestParams } from './types/latest';
export type {
  MuteAlertRequestParams as MuteAlertRequestParamsV1,
  MuteAlertRequestQuery as MuteAlertRequestQueryV1,
} from './types/v1';
