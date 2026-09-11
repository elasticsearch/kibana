/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  ALERT_EPISODE_ACTION_TYPE,
  createActivateEpisodeActionBodySchema,
} from '@kbn/alerting-v2-schemas';
import { createActivateEpisodeActionOasExamples } from './create_activate_episode_action_oas_example';
import { createEpisodeActionRouteForType } from './create_episode_action_route_for_type';

export const CreateActivateEpisodeActionRoute = createEpisodeActionRouteForType({
  actionType: ALERT_EPISODE_ACTION_TYPE.ACTIVATE,
  pathSuffix: '_activate',
  summary: 'Activate an alert episode',
  bodySchema: createActivateEpisodeActionBodySchema,
  oasOperationObject: createActivateEpisodeActionOasExamples,
  notFoundDescription:
    'Indicates the alert episode was not found or is not the latest episode of its series.',
});
