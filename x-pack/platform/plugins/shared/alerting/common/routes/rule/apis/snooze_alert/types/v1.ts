/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TypeOf } from '@kbn/config-schema';
import type {
  snoozeAlertParamsSchemaV1,
  snoozeAlertQuerySchemaV1,
  snoozeAlertBodySchemaV1,
} from '..';

export type SnoozeAlertRequestParams = TypeOf<typeof snoozeAlertParamsSchemaV1>;
export type SnoozeAlertRequestQuery = TypeOf<typeof snoozeAlertQuerySchemaV1>;
export type SnoozeAlertRequestBody = TypeOf<typeof snoozeAlertBodySchemaV1>;
