/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { MAX_ID_LENGTH } from '../../../../../constants';

const MAX_MUTE_UNMUTE_INSTANCES = 100;

export const bulkMuteUnmuteAlertsBodySchema = schema.object(
  {
    rules: schema.arrayOf(
      schema.object({
        rule_id: schema.string({ maxLength: MAX_ID_LENGTH }),
        alert_instance_ids: schema.arrayOf(schema.string({ maxLength: MAX_ID_LENGTH }), {
          maxSize: MAX_MUTE_UNMUTE_INSTANCES,
        }),
      }),
      { maxSize: MAX_MUTE_UNMUTE_INSTANCES }
    ),
  },
  { meta: { id: 'bulk_mute_unmute_alerts_request' } }
);
