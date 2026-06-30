/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SnoozeAlertInstanceBody } from '../../../../../../application/rule/methods/snooze_alert_instance/types';
import type { SnoozeAlertRequestBodyV1 } from '../../../../../../../common/routes/rule/apis/snooze_alert';

export const transformRequestBodyToApplication = (
  body: SnoozeAlertRequestBodyV1
): SnoozeAlertInstanceBody => ({
  expiresAt: body.expires_at,
  conditions: body.conditions,
  // Default conditionOperator to 'any' only when conditions are present but the
  // operator was not explicitly supplied.
  conditionOperator: body.conditions ? body.condition_operator ?? 'any' : undefined,
});
