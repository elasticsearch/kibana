/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setAlertStatusInputSchema } from './set_alert_status_step_common';
import { MAX_ALERT_ID_LENGTH } from '../common/constants';

describe('setAlertStatusInputSchema', () => {
  it('should validate valid input for closing an alert', () => {
    const input = { alert_ids: 'alert-1', status: 'closed', close_reason: 'false_positive' };
    expect(setAlertStatusInputSchema.parse(input)).toEqual(input);
  });

  it('should validate valid input for closing multiple alerts', () => {
    const input = {
      alert_ids: ['alert-1', 'alert-2'],
      status: 'closed',
      close_reason: 'duplicate',
    };
    expect(setAlertStatusInputSchema.parse(input)).toEqual(input);
  });

  it('should validate valid input for closing an alert without reason', () => {
    const input = { alert_ids: 'alert-1', status: 'closed' };
    expect(setAlertStatusInputSchema.parse(input)).toEqual(input);
  });

  it('should validate valid input for acknowledging an alert', () => {
    const input = { alert_ids: 'alert-1', status: 'acknowledged' };
    expect(setAlertStatusInputSchema.parse(input)).toEqual(input);
  });

  it('should validate valid input for opening multiple alerts', () => {
    const input = { alert_ids: ['alert-1', 'alert-2'], status: 'open' };
    expect(setAlertStatusInputSchema.parse(input)).toEqual(input);
  });

  it('should strip close_reason if provided for non-closed status', () => {
    const input = { alert_ids: 'alert-1', status: 'open', close_reason: 'false_positive' };
    const parsed = setAlertStatusInputSchema.parse(input);
    expect(parsed).not.toHaveProperty('close_reason');
  });

  it('should fail for invalid status', () => {
    const input = { alert_ids: 'alert-1', status: 'invalid_status' };
    expect(() => setAlertStatusInputSchema.parse(input)).toThrow();
  });

  it('should fail if alert_ids is missing', () => {
    const input = { status: 'closed' };
    expect(() => setAlertStatusInputSchema.parse(input)).toThrow();
  });

  it('should fail if alert_ids is an empty string', () => {
    const input = { alert_ids: '', status: 'closed' };
    expect(() => setAlertStatusInputSchema.parse(input)).toThrow();
  });

  it('should fail if alert_ids is an empty array', () => {
    const input = { alert_ids: [], status: 'closed' };
    expect(() => setAlertStatusInputSchema.parse(input)).toThrow();
  });

  it('should fail if alert_ids array contains an empty string', () => {
    const input = { alert_ids: ['alert-1', ''], status: 'closed' };
    expect(() => setAlertStatusInputSchema.parse(input)).toThrow();
  });

  it('should fail if alert_ids string is too long', () => {
    const input = { alert_ids: 'a'.repeat(MAX_ALERT_ID_LENGTH + 1), status: 'closed' };
    expect(() => setAlertStatusInputSchema.parse(input)).toThrow();
  });

  it('should fail if alert_ids array contains a string that is too long', () => {
    const input = { alert_ids: ['alert-1', 'a'.repeat(MAX_ALERT_ID_LENGTH + 1)], status: 'closed' };
    expect(() => setAlertStatusInputSchema.parse(input)).toThrow();
  });
});
