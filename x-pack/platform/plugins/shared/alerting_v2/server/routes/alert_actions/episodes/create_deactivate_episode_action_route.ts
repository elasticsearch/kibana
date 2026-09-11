/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  ALERT_EPISODE_ACTION_TYPE,
  createDeactivateEpisodeActionBodySchema,
} from '@kbn/alerting-v2-schemas';
import { createDeactivateEpisodeActionOasExamples } from './create_deactivate_episode_action_oas_example';
import { createEpisodeActionRouteForType } from './create_episode_action_route_for_type';

export const CreateDeactivateEpisodeActionRoute = createEpisodeActionRouteForType({
  actionType: ALERT_EPISODE_ACTION_TYPE.DEACTIVATE,
  pathSuffix: '_deactivate',
  summary: 'Deactivate an alert episode',
  bodySchema: createDeactivateEpisodeActionBodySchema,
  oasOperationObject: createDeactivateEpisodeActionOasExamples,
  notFoundDescription:
    'Indicates the alert episode was not found or is not the latest episode of its series.',
});
