/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  ALERT_EPISODE_ACTION_TYPE,
  createAckEpisodeActionBodySchema,
} from '@kbn/alerting-v2-schemas';
import { createAckEpisodeActionOasExamples } from './create_ack_episode_action_oas_example';
import { createEpisodeActionRouteForType } from './create_episode_action_route_for_type';

export const CreateAckEpisodeActionRoute = createEpisodeActionRouteForType({
  actionType: ALERT_EPISODE_ACTION_TYPE.ACK,
  pathSuffix: '_ack',
  summary: 'Acknowledge an alert episode',
  bodySchema: createAckEpisodeActionBodySchema,
  oasOperationObject: createAckEpisodeActionOasExamples,
});
