/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { assignAlertInputSchema } from './assign_alert_step_common';
import { MAX_ALERT_ID_LENGTH, MAX_USER_ID_LENGTH } from '../common/constants';

describe('assignAlertInputSchema', () => {
  it('should validate valid input for assigning users with array', () => {
    const input = { alert_ids: 'alert-1', assignees_to_add: ['user1'], assignees_to_remove: [] };
    expect(assignAlertInputSchema.parse(input)).toEqual(input);
  });

  it('should validate valid input for unassigning users with array', () => {
    const input = {
      alert_ids: ['alert-1', 'alert-2'],
      assignees_to_add: [],
      assignees_to_remove: ['user2'],
    };
    expect(assignAlertInputSchema.parse(input)).toEqual(input);
  });

  it('should validate valid input for both assignees_to_add and assignees_to_remove', () => {
    const input = {
      alert_ids: 'alert-1',
      assignees_to_add: ['user1'],
      assignees_to_remove: ['user2'],
    };
    expect(assignAlertInputSchema.parse(input)).toEqual(input);
  });

  it('should fail if neither assignees_to_add nor assignees_to_remove is provided', () => {
    const input = { alert_ids: 'alert-1' };
    expect(() => assignAlertInputSchema.parse(input)).toThrow();
  });

  it('should fail if assignees_to_add is an empty array', () => {
    const input = { alert_ids: 'alert-1', assignees_to_add: [] };
    expect(() => assignAlertInputSchema.parse(input)).toThrow();
  });

  it('should fail if assignees_to_remove is an empty array', () => {
    const input = { alert_ids: 'alert-1', assignees_to_remove: [] };
    expect(() => assignAlertInputSchema.parse(input)).toThrow();
  });

  it('should fail if assignees_to_add is missing', () => {
    const input = { alert_ids: 'alert-1', assignees_to_remove: ['user1'] };
    expect(() => assignAlertInputSchema.parse(input)).toThrow();
  });

  it('should fail if assignees_to_remove is missing', () => {
    const input = { alert_ids: 'alert-1', assignees_to_add: ['user1'] };
    expect(() => assignAlertInputSchema.parse(input)).toThrow();
  });

  it('should fail if alert_ids is missing', () => {
    const input = { assignees_to_add: ['user1'], assignees_to_remove: [] };
    expect(() => assignAlertInputSchema.parse(input)).toThrow();
  });

  it('should fail if alert_ids is an empty string', () => {
    const input = { alert_ids: '', assignees_to_add: ['user1'], assignees_to_remove: [] };
    expect(() => assignAlertInputSchema.parse(input)).toThrow();
  });

  it('should fail if alert_ids is an empty array', () => {
    const input = { alert_ids: [], assignees_to_add: ['user1'], assignees_to_remove: [] };
    expect(() => assignAlertInputSchema.parse(input)).toThrow();
  });

  it('should fail if alert_ids array contains an empty string', () => {
    const input = {
      alert_ids: ['alert-1', ''],
      assignees_to_add: ['user1'],
      assignees_to_remove: [],
    };
    expect(() => assignAlertInputSchema.parse(input)).toThrow();
  });

  it('should fail if alert_ids string is too long', () => {
    const input = {
      alert_ids: 'a'.repeat(MAX_ALERT_ID_LENGTH + 1),
      assignees_to_add: ['user1'],
      assignees_to_remove: [],
    };
    expect(() => assignAlertInputSchema.parse(input)).toThrow();
  });

  it('should fail if alert_ids array contains a string that is too long', () => {
    const input = {
      alert_ids: ['alert-1', 'a'.repeat(MAX_ALERT_ID_LENGTH + 1)],
      assignees_to_add: ['user1'],
      assignees_to_remove: [],
    };
    expect(() => assignAlertInputSchema.parse(input)).toThrow();
  });

  it('should fail if assignees_to_add array contains an empty string', () => {
    const input = { alert_ids: 'alert-1', assignees_to_add: [''], assignees_to_remove: [] };
    expect(() => assignAlertInputSchema.parse(input)).toThrow();
  });

  it('should fail if assignees_to_remove array contains an empty string', () => {
    const input = { alert_ids: 'alert-1', assignees_to_add: [], assignees_to_remove: [''] };
    expect(() => assignAlertInputSchema.parse(input)).toThrow();
  });

  it('should fail if assignees_to_add array contains a string that is too long', () => {
    const input = {
      alert_ids: 'alert-1',
      assignees_to_add: ['a'.repeat(MAX_USER_ID_LENGTH + 1)],
      assignees_to_remove: [],
    };
    expect(() => assignAlertInputSchema.parse(input)).toThrow();
  });

  it('should fail if assignees_to_remove array contains a string that is too long', () => {
    const input = {
      alert_ids: 'alert-1',
      assignees_to_add: [],
      assignees_to_remove: ['a'.repeat(MAX_USER_ID_LENGTH + 1)],
    };
    expect(() => assignAlertInputSchema.parse(input)).toThrow();
  });
});
