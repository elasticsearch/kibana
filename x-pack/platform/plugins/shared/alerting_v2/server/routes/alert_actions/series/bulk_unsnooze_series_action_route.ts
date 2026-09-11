/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  ALERT_EPISODE_ACTION_TYPE,
  bulkUnsnoozeSeriesActionBodySchema,
} from '@kbn/alerting-v2-schemas';
import { bulkUnsnoozeSeriesActionOasExamples } from './bulk_unsnooze_series_action_oas_example';
import { createBulkSeriesActionRouteForType } from './create_bulk_series_action_route_for_type';

export const BulkUnsnoozeSeriesActionRoute = createBulkSeriesActionRouteForType({
  actionType: ALERT_EPISODE_ACTION_TYPE.UNSNOOZE,
  pathSuffix: '_bulk_unsnooze',
  summary: 'Bulk unsnooze alert episode series',
  bodySchema: bulkUnsnoozeSeriesActionBodySchema,
  oasOperationObject: bulkUnsnoozeSeriesActionOasExamples,
});
