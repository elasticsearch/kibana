/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  ALERT_EPISODE_ACTION_TYPE,
  createUnackEpisodeActionBodySchema,
} from '@kbn/alerting-v2-schemas';
import { createUnackEpisodeActionOasExamples } from './create_unack_episode_action_oas_example';
import { createEpisodeActionRouteForType } from './create_episode_action_route_for_type';

export const CreateUnackEpisodeActionRoute = createEpisodeActionRouteForType({
  actionType: ALERT_EPISODE_ACTION_TYPE.UNACK,
  pathSuffix: '_unack',
  summary: 'Unacknowledge an alert episode',
  bodySchema: createUnackEpisodeActionBodySchema,
  oasOperationObject: createUnackEpisodeActionOasExamples,
});
