/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  ALERT_EPISODE_ACTION_TYPE,
  bulkAssignEpisodeActionBodySchema,
} from '@kbn/alerting-v2-schemas';
import { bulkAssignEpisodeActionOasExamples } from './bulk_assign_episode_action_oas_example';
import { createBulkEpisodeActionRouteForType } from './create_bulk_episode_action_route_for_type';

export const BulkAssignEpisodeActionRoute = createBulkEpisodeActionRouteForType({
  actionType: ALERT_EPISODE_ACTION_TYPE.ASSIGN,
  pathSuffix: '_bulk_assign',
  summary: 'Bulk assign alert episodes',
  bodySchema: bulkAssignEpisodeActionBodySchema,
  oasOperationObject: bulkAssignEpisodeActionOasExamples,
});
