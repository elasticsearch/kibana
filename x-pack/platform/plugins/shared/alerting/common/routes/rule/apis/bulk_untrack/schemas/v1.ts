/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import {
  MAX_BULK_UNTRACK_INDICES,
  MAX_BULK_UNTRACK_ALERT_UUIDS,
  MAX_INDEX_NAME_LENGTH,
} from '../../../../../constants';

export const bulkUntrackBodySchema = schema.object(
  {
    indices: schema.arrayOf(schema.string({ maxLength: MAX_INDEX_NAME_LENGTH }), {
      maxSize: MAX_BULK_UNTRACK_INDICES,
    }),
    alert_uuids: schema.arrayOf(schema.string({ maxLength: 36 }), {
      maxSize: MAX_BULK_UNTRACK_ALERT_UUIDS,
    }),
  },
  { meta: { id: 'bulk_untrack_alerts_request' } }
);
