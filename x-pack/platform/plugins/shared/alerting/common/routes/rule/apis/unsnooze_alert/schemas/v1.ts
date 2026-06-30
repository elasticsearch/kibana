/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { MAX_ID_LENGTH, MAX_SNOOZED_INSTANCE_ID_LENGTH } from '../../../../../max_alert_limit';

export const unsnoozeAlertParamsSchema = schema.object({
  rule_id: schema.string({
    maxLength: MAX_ID_LENGTH,
    meta: {
      description: 'The identifier for the rule.',
    },
  }),
  alert_id: schema.string({
    maxLength: MAX_SNOOZED_INSTANCE_ID_LENGTH,
    meta: {
      description: 'The identifier for the alert.',
    },
  }),
});
