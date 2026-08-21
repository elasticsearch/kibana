/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  POLICY_CHANGE_PREPARATION_ERROR_CODE,
  POLICY_CHANGE_SCHEMA_MESSAGE,
  PolicyChangePreparationError,
  assessPolicyChangeParamsSchema,
  parseAssessPolicyChangeParams,
  policyChangeOperationSchema,
} from './policy_change_operation';

describe('policy change operation schema', () => {
  it('forwards raw set_field values including non-boolean JSON types', () => {
    for (const value of [0, null]) {
      expect(
        policyChangeOperationSchema.parse({
          op: 'set_field',
          path: 'linux.events.session_data',
          value,
        })
      ).toEqual({
        op: 'set_field',
        path: 'linux.events.session_data',
        value,
      });
    }
  });

  it('rejects unknown ops, extra keys, and unbounded identifiers', () => {
    expect(() =>
      policyChangeOperationSchema.parse({
        op: 'apply_change',
        path: 'windows.malware.mode',
        value: true,
      })
    ).toThrow();
    expect(() =>
      policyChangeOperationSchema.parse({
        op: 'set_field',
        path: 'windows.malware.mode',
        value: true,
        extra: true,
      })
    ).toThrow();
    expect(() =>
      assessPolicyChangeParamsSchema.parse({
        idOrName: '',
        changes: [{ op: 'set_field', path: 'windows.malware.mode', value: true }],
      })
    ).toThrow();
    expect(() =>
      assessPolicyChangeParamsSchema.parse({
        idOrName: 'p',
        changes: [],
      })
    ).toThrow();
    expect(() =>
      assessPolicyChangeParamsSchema.parse({
        idOrName: 'p',
        changes: Array.from({ length: 51 }, () => ({
          op: 'set_field',
          path: 'windows.malware.mode',
          value: true,
        })),
      })
    ).toThrow();
  });

  it('trims identifier and path input, rejects trimmed-empty values, and keeps no identifier maximum', () => {
    const setField = { op: 'set_field' as const, path: 'windows.malware.mode', value: 1 };
    expect(
      parseAssessPolicyChangeParams({
        idOrName: 'a'.repeat(257),
        changes: [setField],
      }).idOrName
    ).toHaveLength(257);
    expect(
      policyChangeOperationSchema.parse({
        op: 'set_field',
        path: `  ${'p'.repeat(256)}  `,
        value: true,
      })
    ).toEqual({
      op: 'set_field',
      path: 'p'.repeat(256),
      value: true,
    });
    expect(
      policyChangeOperationSchema.safeParse({
        op: 'set_field',
        path: '   ',
        value: true,
      }).success
    ).toBe(false);
    expect(
      policyChangeOperationSchema.safeParse({
        op: 'set_field',
        path: `  ${'p'.repeat(257)}  `,
        value: true,
      }).success
    ).toBe(false);
  });

  it('parses a bounded request and uses a stable invalid_input code', () => {
    try {
      parseAssessPolicyChangeParams({ idOrName: 'p' });
      throw new Error('expected parse to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(PolicyChangePreparationError);
      expect((error as PolicyChangePreparationError).code).toBe(
        POLICY_CHANGE_PREPARATION_ERROR_CODE.invalid_input
      );
      expect((error as PolicyChangePreparationError).message).toBe(POLICY_CHANGE_SCHEMA_MESSAGE);
    }
  });
});
