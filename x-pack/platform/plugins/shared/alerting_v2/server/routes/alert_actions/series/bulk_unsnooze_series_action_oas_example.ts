/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BulkResponse, BulkUnsnoozeSeriesActionBody } from '@kbn/alerting-v2-schemas';
import { buildOasOperation, invalidResponseExample } from '../../oas_utils';
import type { AlertingOasOperationObject } from '../../oas_types';

export const BULK_UNSNOOZE_SERIES_ACTION_REQUEST: BulkUnsnoozeSeriesActionBody = {
  items: [{ group_hash: 'group-hash-1' }, { group_hash: 'group-hash-2' }],
};

export const BULK_UNSNOOZE_SERIES_ACTION_RESPONSE: BulkResponse = {
  affected_count: 2,
  errors: [],
};

const INVALID_BULK_UNSNOOZE_SERIES_ACTION_RESPONSE = invalidResponseExample({
  summary: 'Items list is empty',
  message: 'items: At least one action must be provided',
  details: { errors: { items: ['At least one action must be provided'] } },
});

export const bulkUnsnoozeSeriesActionOasExamples = (): AlertingOasOperationObject =>
  buildOasOperation({
    requestBody: {
      name: 'bulkUnsnoozeSeriesActionRequest',
      summary: 'Clear the snooze on two alert episode series',
      value: BULK_UNSNOOZE_SERIES_ACTION_REQUEST,
    },
    responses: {
      200: {
        name: 'bulkUnsnoozeSeriesActionResponse',
        summary: 'All actions created',
        value: BULK_UNSNOOZE_SERIES_ACTION_RESPONSE,
      },
      400: INVALID_BULK_UNSNOOZE_SERIES_ACTION_RESPONSE,
    },
  });
