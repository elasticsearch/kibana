/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { entitiesRequestSchema, entityItemSchema } from './v1';

describe('graph entities schema', () => {
  it('accepts a page size up to 100', () => {
    expect(() =>
      entitiesRequestSchema.validate({
        page: { index: 0, size: 100 },
        query: {
          entityIds: ['entity-1'],
          start: 'now-1d',
          end: 'now',
        },
      })
    ).not.toThrow();
  });

  it('rejects a page size greater than 100', () => {
    expect(() =>
      entitiesRequestSchema.validate({
        page: { index: 0, size: 101 },
        query: {
          entityIds: ['entity-1'],
          start: 'now-1d',
          end: 'now',
        },
      })
    ).toThrow();
  });

  it('accepts up to 5000 entity IDs', () => {
    const entityIds = Array.from({ length: 5000 }, (_, index) => `entity-${index}`);

    expect(() =>
      entitiesRequestSchema.validate({
        page: { index: 0, size: 10 },
        query: {
          entityIds,
          start: 'now-1d',
          end: 'now',
        },
      })
    ).not.toThrow();
  });

  it('rejects more than 5000 entity IDs', () => {
    const entityIds = Array.from({ length: 5001 }, (_, index) => `entity-${index}`);

    expect(() =>
      entitiesRequestSchema.validate({
        page: { index: 0, size: 10 },
        query: {
          entityIds,
          start: 'now-1d',
          end: 'now',
        },
      })
    ).toThrow();
  });

  it('accepts up to 100 index patterns', () => {
    const indexPatterns = Array.from({ length: 100 }, (_, index) => `logs-${index}-*`);

    expect(() =>
      entitiesRequestSchema.validate({
        page: { index: 0, size: 10 },
        query: {
          entityIds: ['entity-1'],
          start: 'now-1d',
          end: 'now',
          indexPatterns,
        },
      })
    ).not.toThrow();
  });

  it('rejects more than 100 index patterns', () => {
    const indexPatterns = Array.from({ length: 101 }, (_, index) => `logs-${index}-*`);

    expect(() =>
      entitiesRequestSchema.validate({
        page: { index: 0, size: 10 },
        query: {
          entityIds: ['entity-1'],
          start: 'now-1d',
          end: 'now',
          indexPatterns,
        },
      })
    ).toThrow();
  });

  describe('entityItemSchema', () => {
    it('accepts up to 1000 ips and rejects more', () => {
      expect(() =>
        entityItemSchema.validate({
          id: 'entity-1',
          ips: Array.from({ length: 1000 }, (_, index) => `10.0.0.${index}`),
        })
      ).not.toThrow();

      expect(() =>
        entityItemSchema.validate({
          id: 'entity-1',
          ips: Array.from({ length: 1001 }, (_, index) => `10.0.0.${index}`),
        })
      ).toThrow();
    });

    it('accepts up to 250 country codes and rejects more', () => {
      expect(() =>
        entityItemSchema.validate({
          id: 'entity-1',
          countryCodes: Array.from({ length: 250 }, (_, index) => `c-${index}`),
        })
      ).not.toThrow();

      expect(() =>
        entityItemSchema.validate({
          id: 'entity-1',
          countryCodes: Array.from({ length: 251 }, (_, index) => `c-${index}`),
        })
      ).toThrow();
    });
  });
});
