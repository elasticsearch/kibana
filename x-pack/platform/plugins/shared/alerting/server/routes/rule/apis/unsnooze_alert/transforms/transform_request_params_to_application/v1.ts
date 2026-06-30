/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { UnsnoozeAlertParams } from '../../../../../../application/rule/methods/unsnooze_alert/types';
import type { RewriteRequestCase } from '../../../../../lib';

export const transformRequestParamsToApplication: RewriteRequestCase<UnsnoozeAlertParams> = ({
  rule_id: alertId,
  alert_id: alertInstanceId,
}) => ({
  alertId,
  alertInstanceId,
});
