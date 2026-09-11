/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  ALERT_EPISODE_ACTION_TYPE,
  createAssignEpisodeActionBodySchema,
} from '@kbn/alerting-v2-schemas';
import { createAssignEpisodeActionOasExamples } from './create_assign_episode_action_oas_example';
import { createEpisodeActionRouteForType } from './create_episode_action_route_for_type';

export const CreateAssignEpisodeActionRoute = createEpisodeActionRouteForType({
  actionType: ALERT_EPISODE_ACTION_TYPE.ASSIGN,
  pathSuffix: '_assign',
  summary: 'Assign an alert episode to a user',
  bodySchema: createAssignEpisodeActionBodySchema,
  oasOperationObject: createAssignEpisodeActionOasExamples,
});
