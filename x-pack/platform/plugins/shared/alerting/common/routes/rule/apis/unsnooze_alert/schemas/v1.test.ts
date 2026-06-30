/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { unsnoozeAlertParamsSchema } from './v1';
import { MAX_ID_LENGTH, MAX_SNOOZED_INSTANCE_ID_LENGTH } from '../../../../../max_alert_limit';

describe('unsnoozeAlertParamsSchema', () => {
  test('accepts valid rule_id and alert_id', () => {
    expect(() =>
      unsnoozeAlertParamsSchema.validate({ rule_id: 'rule-1', alert_id: 'alert-1' })
    ).not.toThrow();
  });

  test(`rejects rule_id longer than ${MAX_ID_LENGTH} chars`, () => {
    expect(() =>
      unsnoozeAlertParamsSchema.validate({
        rule_id: 'a'.repeat(MAX_ID_LENGTH + 1),
        alert_id: 'alert-1',
      })
    ).toThrow();
  });

  test(`accepts rule_id exactly ${MAX_ID_LENGTH} chars`, () => {
    expect(() =>
      unsnoozeAlertParamsSchema.validate({
        rule_id: 'a'.repeat(MAX_ID_LENGTH),
        alert_id: 'alert-1',
      })
    ).not.toThrow();
  });

  test(`rejects alert_id longer than ${MAX_SNOOZED_INSTANCE_ID_LENGTH} chars`, () => {
    expect(() =>
      unsnoozeAlertParamsSchema.validate({
        rule_id: 'rule-1',
        alert_id: 'a'.repeat(MAX_SNOOZED_INSTANCE_ID_LENGTH + 1),
      })
    ).toThrow();
  });

  test(`accepts alert_id exactly ${MAX_SNOOZED_INSTANCE_ID_LENGTH} chars`, () => {
    expect(() =>
      unsnoozeAlertParamsSchema.validate({
        rule_id: 'rule-1',
        alert_id: 'a'.repeat(MAX_SNOOZED_INSTANCE_ID_LENGTH),
      })
    ).not.toThrow();
  });
});
