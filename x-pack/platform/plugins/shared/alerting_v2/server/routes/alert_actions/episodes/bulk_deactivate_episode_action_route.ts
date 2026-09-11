/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  ALERT_EPISODE_ACTION_TYPE,
  bulkDeactivateEpisodeActionBodySchema,
} from '@kbn/alerting-v2-schemas';
import { bulkDeactivateEpisodeActionOasExamples } from './bulk_deactivate_episode_action_oas_example';
import { createBulkEpisodeActionRouteForType } from './create_bulk_episode_action_route_for_type';

export const BulkDeactivateEpisodeActionRoute = createBulkEpisodeActionRouteForType({
  actionType: ALERT_EPISODE_ACTION_TYPE.DEACTIVATE,
  pathSuffix: '_bulk_deactivate',
  summary: 'Bulk deactivate alert episodes',
  bodySchema: bulkDeactivateEpisodeActionBodySchema,
  oasOperationObject: bulkDeactivateEpisodeActionOasExamples,
});
