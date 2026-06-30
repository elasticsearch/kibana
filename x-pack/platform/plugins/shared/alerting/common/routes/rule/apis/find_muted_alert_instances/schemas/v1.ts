/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { schema } from '@kbn/config-schema';
import {
  MAX_KQL_FILTER_LENGTH,
  MAX_RESULT_WINDOW,
  MAX_ALERTS_PER_PAGE,
} from '../../../../../max_alert_limit';
import { snoozedAlertInstanceSchemaV1 } from '../../../response';

export const findMutedAlertInstancesRequestBodySchema = schema.object(
  {
    per_page: schema.number({
      defaultValue: 10,
      min: 0,
      max: MAX_ALERTS_PER_PAGE,
    }),
    page: schema.number({
      defaultValue: 1,
      min: 1,
      max: MAX_RESULT_WINDOW,
    }),
    filter: schema.maybe(schema.string({ maxLength: MAX_KQL_FILTER_LENGTH })),
  },
  {
    validate: ({ page, per_page: perPage }) => {
      if (page * perPage > MAX_RESULT_WINDOW) {
        return `The provided page and per_page values cannot return more than ${MAX_RESULT_WINDOW} results.`;
      }
    },
  }
);

const findMutedAlertInstancesResponseDataSchema = schema.arrayOf(
  schema.object({
    id: schema.string(),
    muted_alert_instance_ids: schema.arrayOf(schema.string()),
    snoozed_alert_instances: schema.maybe(schema.arrayOf(snoozedAlertInstanceSchemaV1)),
  })
);

export const findMutedAlertInstancesResponseSchema = schema.object({
  page: schema.number(),
  per_page: schema.number(),
  total: schema.number(),
  data: findMutedAlertInstancesResponseDataSchema,
});
