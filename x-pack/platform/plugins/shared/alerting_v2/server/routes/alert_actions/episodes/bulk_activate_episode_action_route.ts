/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  ALERT_EPISODE_ACTION_TYPE,
  bulkActivateEpisodeActionBodySchema,
} from '@kbn/alerting-v2-schemas';
import { bulkActivateEpisodeActionOasExamples } from './bulk_activate_episode_action_oas_example';
import { createBulkEpisodeActionRouteForType } from './create_bulk_episode_action_route_for_type';

export const BulkActivateEpisodeActionRoute = createBulkEpisodeActionRouteForType({
  actionType: ALERT_EPISODE_ACTION_TYPE.ACTIVATE,
  pathSuffix: '_bulk_activate',
  summary: 'Bulk activate alert episodes',
  bodySchema: bulkActivateEpisodeActionBodySchema,
  oasOperationObject: bulkActivateEpisodeActionOasExamples,
});
