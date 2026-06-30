/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { requiresUserSuppliedInputs } from './run_workflow_panel_helpers';
import type { JsonModelSchemaType } from '@kbn/workflows/spec/schema/common/json_model_schema';

describe('requiresUserSuppliedInputs', () => {
  it('returns false when normalized is undefined', () => {
    expect(requiresUserSuppliedInputs(undefined)).toBe(false);
  });

  it('returns false when there are no properties', () => {
    const normalized: JsonModelSchemaType = { type: 'object', properties: {} };
    expect(requiresUserSuppliedInputs(normalized)).toBe(false);
  });

  it('returns false when required array is empty', () => {
    const normalized: JsonModelSchemaType = {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: [],
    };
    expect(requiresUserSuppliedInputs(normalized)).toBe(false);
  });

  it('returns false when all fields are optional (no required array)', () => {
    const normalized: JsonModelSchemaType = {
      type: 'object',
      properties: { name: { type: 'string' } },
    };
    expect(requiresUserSuppliedInputs(normalized)).toBe(false);
  });

  it('returns true when a required field has no default', () => {
    const normalized: JsonModelSchemaType = {
      type: 'object',
      properties: { ticketId: { type: 'string' } },
      required: ['ticketId'],
    };
    expect(requiresUserSuppliedInputs(normalized)).toBe(true);
  });

  it('returns true when the required field has a default value', () => {
    const normalized: JsonModelSchemaType = {
      type: 'object',
      properties: { ticketId: { type: 'string', default: 'AUTO' } },
      required: ['ticketId'],
    };
    expect(requiresUserSuppliedInputs(normalized)).toBe(true);
  });

  it('returns true when all required fields have defaults', () => {
    const normalized: JsonModelSchemaType = {
      type: 'object',
      properties: {
        ticketId: { type: 'string', default: 'AUTO' },
        severity: { type: 'string', default: 'low' },
      },
      required: ['ticketId', 'severity'],
    };
    expect(requiresUserSuppliedInputs(normalized)).toBe(true);
  });

  it('returns true when at least one required field lacks a default', () => {
    const normalized: JsonModelSchemaType = {
      type: 'object',
      properties: {
        ticketId: { type: 'string', default: 'AUTO' },
        reason: { type: 'string' },
      },
      required: ['ticketId', 'reason'],
    };
    expect(requiresUserSuppliedInputs(normalized)).toBe(true);
  });
});
