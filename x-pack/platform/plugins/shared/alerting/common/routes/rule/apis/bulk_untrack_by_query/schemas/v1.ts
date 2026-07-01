/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import {
  MAX_BULK_UNTRACK_QUERIES,
  MAX_ARRAY_FIELDS,
  MAX_ID_LENGTH,
} from '../../../../../constants';

export const bulkUntrackByQueryBodySchema = schema.object(
  {
    query: schema.arrayOf(schema.any(), { maxSize: MAX_BULK_UNTRACK_QUERIES }),
    rule_type_ids: schema.arrayOf(schema.string({ maxLength: MAX_ID_LENGTH }), {
      maxSize: MAX_ARRAY_FIELDS,
    }),
  },
  { meta: { id: 'bulk_untrack_alerts_by_query_request' } }
);
