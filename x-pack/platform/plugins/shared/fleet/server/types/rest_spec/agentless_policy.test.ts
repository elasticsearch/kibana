/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  ALLOWED_AGENTLESS_POLICY_FILTER_FIELDS,
  ListAgentlessPoliciesRequestSchema,
} from './agentless_policy';

describe('ListAgentlessPoliciesRequestSchema', () => {
  const validateQuery = (query: Record<string, unknown>) =>
    ListAgentlessPoliciesRequestSchema.query.validate(query);

  it('accepts an empty query (paging defaults are applied by the service layer)', () => {
    expect(() => validateQuery({})).not.toThrow();
  });

  it('accepts explicit paging and sorting parameters', () => {
    const result = validateQuery({
      page: 2,
      perPage: 5,
      sortField: 'name',
      sortOrder: 'asc',
    });

    expect(result.page).toBe(2);
    expect(result.perPage).toBe(5);
    expect(result.sortField).toBe('name');
    expect(result.sortOrder).toBe('asc');
  });

  it('rejects an invalid sortOrder', () => {
    expect(() => validateQuery({ sortOrder: 'sideways' })).toThrow();
  });

  it.each(['name:foo', 'namespace:default', 'package.name:test_agentless'])(
    'accepts a kuery filtering on the allowed field %s',
    (kuery) => {
      expect(() => validateQuery({ kuery })).not.toThrow();
    }
  );

  it('accepts a kuery combining several allowed fields', () => {
    expect(() =>
      validateQuery({ kuery: 'name:foo and namespace:default and package.name:test_agentless' })
    ).not.toThrow();
  });

  it.each([
    'policy_ids:foo',
    'revision:1',
    'supports_agentless:true',
    'package.version:1.0.0',
    'enabled:true',
  ])('rejects a kuery filtering on the disallowed field %s', (kuery) => {
    expect(() => validateQuery({ kuery })).toThrow(/KQLSyntaxError/);
  });

  it('derives the allowed filter fields from the mapping', () => {
    expect(ALLOWED_AGENTLESS_POLICY_FILTER_FIELDS).toEqual(['name', 'namespace', 'package.name']);
  });

  it('returns a self-correcting 400 that enumerates the allowed fields', () => {
    let message = '';
    try {
      validateQuery({ kuery: 'supports_agentless:true' });
    } catch (error) {
      message = (error as Error).message;
    }

    for (const field of ALLOWED_AGENTLESS_POLICY_FILTER_FIELDS) {
      expect(message).toContain(field);
    }
    expect(message).toMatch(/Filtering is only allowed on the following fields/);
  });
});
