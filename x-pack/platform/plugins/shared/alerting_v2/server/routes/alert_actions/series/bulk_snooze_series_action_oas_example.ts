/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BulkResponse, BulkSnoozeSeriesActionBody } from '@kbn/alerting-v2-schemas';
import { buildOasOperation, invalidResponseExample } from '../../oas_utils';
import type { AlertingOasOperationObject } from '../../oas_types';

export const BULK_SNOOZE_SERIES_ACTION_REQUEST: BulkSnoozeSeriesActionBody = {
  items: [
    { group_hash: 'group-hash-1', expiry: '2026-01-16T12:00:00.000Z' },
    { group_hash: 'group-hash-2' },
  ],
};

export const BULK_SNOOZE_SERIES_ACTION_RESPONSE: BulkResponse = {
  affected_count: 2,
  errors: [],
};

const INVALID_BULK_SNOOZE_SERIES_ACTION_RESPONSE = invalidResponseExample({
  summary: 'Items list is empty',
  message: 'items: At least one action must be provided',
  details: { errors: { items: ['At least one action must be provided'] } },
});

export const bulkSnoozeSeriesActionOasExamples = (): AlertingOasOperationObject =>
  buildOasOperation({
    requestBody: {
      name: 'bulkSnoozeSeriesActionRequest',
      summary: 'Snooze one series until a date and one indefinitely',
      value: BULK_SNOOZE_SERIES_ACTION_REQUEST,
    },
    responses: {
      200: {
        name: 'bulkSnoozeSeriesActionResponse',
        summary: 'All actions created',
        value: BULK_SNOOZE_SERIES_ACTION_RESPONSE,
      },
      400: INVALID_BULK_SNOOZE_SERIES_ACTION_RESPONSE,
    },
  });
