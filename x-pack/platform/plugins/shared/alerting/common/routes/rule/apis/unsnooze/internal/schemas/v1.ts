/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { MAX_ID_LENGTH, MAX_SNOOZE_SCHEDULE_IDS } from '../../../../../../constants';

export const unsnoozeParamsInternalSchema = schema.object({
  id: schema.string({ maxLength: MAX_ID_LENGTH }),
});

const scheduleIdsSchema = schema.maybe(
  schema.arrayOf(schema.string({ maxLength: MAX_ID_LENGTH }), { maxSize: MAX_SNOOZE_SCHEDULE_IDS })
);

export const unsnoozeBodyInternalSchema = schema.object({
  schedule_ids: scheduleIdsSchema,
});
