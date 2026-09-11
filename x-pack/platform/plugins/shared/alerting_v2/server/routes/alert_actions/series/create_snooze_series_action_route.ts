/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  ALERT_EPISODE_ACTION_TYPE,
  createSnoozeSeriesActionBodySchema,
} from '@kbn/alerting-v2-schemas';
import { createSnoozeSeriesActionOasExamples } from './create_snooze_series_action_oas_example';
import { createSeriesActionRouteForType } from './create_series_action_route_for_type';

export const CreateSnoozeSeriesActionRoute = createSeriesActionRouteForType({
  actionType: ALERT_EPISODE_ACTION_TYPE.SNOOZE,
  pathSuffix: '_snooze',
  summary: 'Snooze an alert episode series',
  bodySchema: createSnoozeSeriesActionBodySchema,
  oasOperationObject: createSnoozeSeriesActionOasExamples,
});
