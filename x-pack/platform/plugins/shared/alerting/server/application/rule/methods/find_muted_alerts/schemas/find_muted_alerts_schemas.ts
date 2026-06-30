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
} from '../../../../../../common/max_alert_limit';

export const findMutedAlertsOptionsSchema = schema.object(
  {
    perPage: schema.maybe(schema.number({ min: 0, max: MAX_ALERTS_PER_PAGE })),
    page: schema.maybe(schema.number({ min: 1, max: MAX_RESULT_WINDOW })),
    filter: schema.maybe(
      schema.oneOf([
        schema.string({ maxLength: MAX_KQL_FILTER_LENGTH }),
        schema.recordOf(schema.string({ maxLength: MAX_KQL_FILTER_LENGTH }), schema.any()),
      ])
    ),
  },
  {
    validate: ({ page, perPage }) => {
      if (page != null && perPage != null && page * perPage > MAX_RESULT_WINDOW) {
        return `The provided page and perPage values cannot return more than ${MAX_RESULT_WINDOW} results.`;
      }
    },
  }
);

export const findMutedAlertsParamsSchema = schema.object({
  options: schema.maybe(findMutedAlertsOptionsSchema),
});
