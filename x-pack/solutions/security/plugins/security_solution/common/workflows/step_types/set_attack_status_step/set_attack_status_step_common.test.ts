/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setAttackStatusInputSchema } from './set_attack_status_step_common';
import { MAX_ATTACK_ID_LENGTH } from '../common/constants';

describe('setAttackStatusInputSchema', () => {
  it('should validate valid input for closing an attack', () => {
    const input = { ids: 'attack-1', status: 'closed', reason: 'false_positive' };
    expect(setAttackStatusInputSchema.parse(input)).toEqual({
      ...input,
      update_related_alerts: false,
    });
  });

  it('should validate valid input for closing multiple attacks', () => {
    const input = {
      ids: ['attack-1', 'attack-2'],
      status: 'closed',
      reason: 'duplicate',
    };
    expect(setAttackStatusInputSchema.parse(input)).toEqual({
      ...input,
      update_related_alerts: false,
    });
  });

  it('should validate valid input for closing an attack without reason', () => {
    const input = { ids: 'attack-1', status: 'closed' };
    expect(setAttackStatusInputSchema.parse(input)).toEqual({
      ...input,
      update_related_alerts: false,
    });
  });

  it('should validate valid input for acknowledging an attack', () => {
    const input = { ids: 'attack-1', status: 'acknowledged' };
    expect(setAttackStatusInputSchema.parse(input)).toEqual({
      ...input,
      update_related_alerts: false,
    });
  });

  it('should validate valid input for opening multiple attacks', () => {
    const input = { ids: ['attack-1', 'attack-2'], status: 'open' };
    expect(setAttackStatusInputSchema.parse(input)).toEqual({
      ...input,
      update_related_alerts: false,
    });
  });

  it('should validate valid input with update_related_alerts flag', () => {
    const input = { ids: 'attack-1', status: 'closed', update_related_alerts: true };
    expect(setAttackStatusInputSchema.parse(input)).toEqual(input);
  });

  it('should strip reason if provided for non-closed status', () => {
    const input = { ids: 'attack-1', status: 'open', reason: 'false_positive' };
    const parsed = setAttackStatusInputSchema.parse(input);
    expect(parsed).not.toHaveProperty('reason');
  });

  it('should fail for invalid status', () => {
    const input = { ids: 'attack-1', status: 'invalid_status' };
    expect(() => setAttackStatusInputSchema.parse(input)).toThrow();
  });

  it('should fail if ids is missing', () => {
    const input = { status: 'closed' };
    expect(() => setAttackStatusInputSchema.parse(input)).toThrow();
  });

  it('should fail if ids is an empty string', () => {
    const input = { ids: '', status: 'closed' };
    expect(() => setAttackStatusInputSchema.parse(input)).toThrow();
  });

  it('should fail if ids is an empty array', () => {
    const input = { ids: [], status: 'closed' };
    expect(() => setAttackStatusInputSchema.parse(input)).toThrow();
  });

  it('should fail if ids array contains an empty string', () => {
    const input = { ids: ['attack-1', ''], status: 'closed' };
    expect(() => setAttackStatusInputSchema.parse(input)).toThrow();
  });

  it('should fail if ids string is too long', () => {
    const input = { ids: 'a'.repeat(MAX_ATTACK_ID_LENGTH + 1), status: 'closed' };
    expect(() => setAttackStatusInputSchema.parse(input)).toThrow();
  });

  it('should fail if ids array contains a string that is too long', () => {
    const input = {
      ids: ['attack-1', 'a'.repeat(MAX_ATTACK_ID_LENGTH + 1)],
      status: 'closed',
    };
    expect(() => setAttackStatusInputSchema.parse(input)).toThrow();
  });
});
