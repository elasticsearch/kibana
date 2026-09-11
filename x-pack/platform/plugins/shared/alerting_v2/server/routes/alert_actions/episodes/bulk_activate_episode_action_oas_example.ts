/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BulkResponse, BulkActivateEpisodeActionBody } from '@kbn/alerting-v2-schemas';
import { buildOasOperation, invalidResponseExample } from '../../oas_utils';
import type { AlertingOasOperationObject } from '../../oas_types';

export const BULK_ACTIVATE_EPISODE_ACTION_REQUEST: BulkActivateEpisodeActionBody = {
  items: [{ episode_id: 'episode-1', reason: 'manual reopen' }],
};

export const BULK_ACTIVATE_EPISODE_ACTION_RESPONSE: BulkResponse = {
  affected_count: 1,
  errors: [],
};

const INVALID_BULK_ACTIVATE_EPISODE_ACTION_RESPONSE = invalidResponseExample({
  summary: 'Items list is empty',
  message: 'items: At least one action must be provided',
  details: { errors: { items: ['At least one action must be provided'] } },
});

export const bulkActivateEpisodeActionOasExamples = (): AlertingOasOperationObject =>
  buildOasOperation({
    requestBody: {
      name: 'bulkActivateEpisodeActionRequest',
      summary: 'Reopen an alert episode with a reason',
      value: BULK_ACTIVATE_EPISODE_ACTION_REQUEST,
    },
    responses: {
      200: {
        name: 'bulkActivateEpisodeActionResponse',
        summary: 'All actions created',
        value: BULK_ACTIVATE_EPISODE_ACTION_RESPONSE,
      },
      400: INVALID_BULK_ACTIVATE_EPISODE_ACTION_RESPONSE,
    },
  });
