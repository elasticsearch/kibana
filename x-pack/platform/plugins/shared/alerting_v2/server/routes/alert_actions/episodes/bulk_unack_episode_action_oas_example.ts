/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BulkResponse, BulkUnackEpisodeActionBody } from '@kbn/alerting-v2-schemas';
import { buildOasOperation, invalidResponseExample } from '../../oas_utils';
import type { AlertingOasOperationObject } from '../../oas_types';

export const BULK_UNACK_EPISODE_ACTION_REQUEST: BulkUnackEpisodeActionBody = {
  items: [{ episode_id: 'episode-1' }, { episode_id: 'episode-2' }],
};

export const BULK_UNACK_EPISODE_ACTION_RESPONSE: BulkResponse = {
  affected_count: 2,
  errors: [],
};

const INVALID_BULK_UNACK_EPISODE_ACTION_RESPONSE = invalidResponseExample({
  summary: 'Items list is empty',
  message: 'items: At least one action must be provided',
  details: { errors: { items: ['At least one action must be provided'] } },
});

export const bulkUnackEpisodeActionOasExamples = (): AlertingOasOperationObject =>
  buildOasOperation({
    requestBody: {
      name: 'bulkUnackEpisodeActionRequest',
      summary: 'Unacknowledge two alert episodes',
      value: BULK_UNACK_EPISODE_ACTION_REQUEST,
    },
    responses: {
      200: {
        name: 'bulkUnackEpisodeActionResponse',
        summary: 'All actions created',
        value: BULK_UNACK_EPISODE_ACTION_RESPONSE,
      },
      400: INVALID_BULK_UNACK_EPISODE_ACTION_RESPONSE,
    },
  });
