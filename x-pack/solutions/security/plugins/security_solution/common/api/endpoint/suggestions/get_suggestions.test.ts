/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EndpointSuggestionsSchema } from './get_suggestions';

describe('Endpoint suggestions api route schema', () => {
  it('should accept a valid body', () => {
    expect(() =>
      EndpointSuggestionsSchema.body.validate({
        field: 'host.name',
        query: 'foo',
      })
    ).not.toThrow();
  });

  it('should accept `field` of the max allowed length', () => {
    expect(() =>
      EndpointSuggestionsSchema.body.validate({
        field: 'a'.repeat(1024),
        query: 'foo',
      })
    ).not.toThrow();
  });

  it('should error if `field` is longer than 1024 characters', () => {
    expect(() =>
      EndpointSuggestionsSchema.body.validate({
        field: 'a'.repeat(1025),
        query: 'foo',
      })
    ).toThrow(/\[field]:/);
  });

  it('should accept `query` of the max allowed length', () => {
    expect(() =>
      EndpointSuggestionsSchema.body.validate({
        field: 'host.name',
        query: 'a'.repeat(2048),
      })
    ).not.toThrow();
  });

  it('should error if `query` is longer than 2048 characters', () => {
    expect(() =>
      EndpointSuggestionsSchema.body.validate({
        field: 'host.name',
        query: 'a'.repeat(2049),
      })
    ).toThrow(/\[query]:/);
  });
});
