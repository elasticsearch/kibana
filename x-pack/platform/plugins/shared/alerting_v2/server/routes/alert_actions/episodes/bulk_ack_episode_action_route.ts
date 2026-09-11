/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  ALERT_EPISODE_ACTION_TYPE,
  bulkAckEpisodeActionBodySchema,
} from '@kbn/alerting-v2-schemas';
import { bulkAckEpisodeActionOasExamples } from './bulk_ack_episode_action_oas_example';
import { createBulkEpisodeActionRouteForType } from './create_bulk_episode_action_route_for_type';

export const BulkAckEpisodeActionRoute = createBulkEpisodeActionRouteForType({
  actionType: ALERT_EPISODE_ACTION_TYPE.ACK,
  pathSuffix: '_bulk_ack',
  summary: 'Bulk acknowledge alert episodes',
  bodySchema: bulkAckEpisodeActionBodySchema,
  oasOperationObject: bulkAckEpisodeActionOasExamples,
});
