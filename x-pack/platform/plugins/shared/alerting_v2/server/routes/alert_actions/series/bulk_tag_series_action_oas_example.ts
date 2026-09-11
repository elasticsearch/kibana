/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BulkResponse, BulkTagSeriesActionBody } from '@kbn/alerting-v2-schemas';
import { ALERTING_ERROR_CODES } from '../../../lib/errors/error_codes';
import { getAlertSeriesNotFoundMessage } from '../../../lib/errors/alert_error_messages';
import { buildOasOperation, invalidResponseExample } from '../../oas_utils';
import type { AlertingOasOperationObject } from '../../oas_types';

export const BULK_TAG_SERIES_ACTION_REQUEST: BulkTagSeriesActionBody = {
  items: [
    { group_hash: 'group-hash-1', tags: ['production'] },
    { group_hash: 'group-hash-2', tags: ['production'] },
  ],
};

export const BULK_TAG_SERIES_ACTION_RESPONSE: BulkResponse = {
  affected_count: 1,
  errors: [
    {
      id: 'group-hash-2',
      error: {
        code: ALERTING_ERROR_CODES.ALERT_GROUP_NOT_FOUND,
        message: getAlertSeriesNotFoundMessage('group-hash-2'),
      },
    },
  ],
};

const INVALID_BULK_TAG_SERIES_ACTION_RESPONSE = invalidResponseExample({
  summary: 'Items list is empty',
  message: 'items: At least one action must be provided',
  details: { errors: { items: ['At least one action must be provided'] } },
});

export const bulkTagSeriesActionOasExamples = (): AlertingOasOperationObject =>
  buildOasOperation({
    requestBody: {
      name: 'bulkTagSeriesActionRequest',
      summary: 'Tag two alert episode series with production',
      value: BULK_TAG_SERIES_ACTION_REQUEST,
    },
    responses: {
      200: {
        name: 'bulkTagSeriesActionResponse',
        summary: 'One action created, one series not found',
        value: BULK_TAG_SERIES_ACTION_RESPONSE,
      },
      400: INVALID_BULK_TAG_SERIES_ACTION_RESPONSE,
    },
  });
