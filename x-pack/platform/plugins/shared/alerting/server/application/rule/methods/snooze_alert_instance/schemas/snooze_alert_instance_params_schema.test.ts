/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { snoozeAlertInstanceParamsSchema } from './snooze_alert_instance_params_schema';
import {
  MAX_ID_LENGTH,
  MAX_SNOOZED_INSTANCE_ID_LENGTH,
} from '../../../../../../common/max_alert_limit';

describe('snoozeAlertInstanceParamsSchema', () => {
  test('accepts valid alertId and alertInstanceId', () => {
    expect(() =>
      snoozeAlertInstanceParamsSchema.validate({ alertId: 'rule-1', alertInstanceId: 'alert-1' })
    ).not.toThrow();
  });

  test(`rejects alertId longer than ${MAX_ID_LENGTH} chars`, () => {
    expect(() =>
      snoozeAlertInstanceParamsSchema.validate({
        alertId: 'a'.repeat(MAX_ID_LENGTH + 1),
        alertInstanceId: 'alert-1',
      })
    ).toThrow();
  });

  test(`accepts alertId exactly ${MAX_ID_LENGTH} chars`, () => {
    expect(() =>
      snoozeAlertInstanceParamsSchema.validate({
        alertId: 'a'.repeat(MAX_ID_LENGTH),
        alertInstanceId: 'alert-1',
      })
    ).not.toThrow();
  });

  test(`rejects alertInstanceId longer than ${MAX_SNOOZED_INSTANCE_ID_LENGTH} chars`, () => {
    expect(() =>
      snoozeAlertInstanceParamsSchema.validate({
        alertId: 'rule-1',
        alertInstanceId: 'a'.repeat(MAX_SNOOZED_INSTANCE_ID_LENGTH + 1),
      })
    ).toThrow();
  });

  test(`accepts alertInstanceId exactly ${MAX_SNOOZED_INSTANCE_ID_LENGTH} chars`, () => {
    expect(() =>
      snoozeAlertInstanceParamsSchema.validate({
        alertId: 'rule-1',
        alertInstanceId: 'a'.repeat(MAX_SNOOZED_INSTANCE_ID_LENGTH),
      })
    ).not.toThrow();
  });
});
