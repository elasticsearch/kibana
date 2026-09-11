/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  ALERT_EPISODE_ACTION_TYPE,
  bulkSnoozeSeriesActionBodySchema,
} from '@kbn/alerting-v2-schemas';
import { bulkSnoozeSeriesActionOasExamples } from './bulk_snooze_series_action_oas_example';
import { createBulkSeriesActionRouteForType } from './create_bulk_series_action_route_for_type';

export const BulkSnoozeSeriesActionRoute = createBulkSeriesActionRouteForType({
  actionType: ALERT_EPISODE_ACTION_TYPE.SNOOZE,
  pathSuffix: '_bulk_snooze',
  summary: 'Bulk snooze alert episode series',
  bodySchema: bulkSnoozeSeriesActionBodySchema,
  oasOperationObject: bulkSnoozeSeriesActionOasExamples,
});
