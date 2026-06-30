/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { graphRequestSchema } from './v1';

const baseQuery = {
  start: 'now-1d',
  end: 'now',
};

describe('graph request schema', () => {
  describe('originEventIds maxSize (1000)', () => {
    const buildOriginEventIds = (length: number) =>
      Array.from({ length }, (_, index) => ({ id: `event-${index}`, isAlert: false }));

    it('accepts up to 1000 originEventIds', () => {
      expect(() =>
        graphRequestSchema.validate({
          query: { ...baseQuery, originEventIds: buildOriginEventIds(1000) },
        })
      ).not.toThrow();
    });

    it('rejects more than 1000 originEventIds', () => {
      expect(() =>
        graphRequestSchema.validate({
          query: { ...baseQuery, originEventIds: buildOriginEventIds(1001) },
        })
      ).toThrow();
    });
  });

  describe('entityIds maxSize (5000)', () => {
    const buildEntityIds = (length: number) =>
      Array.from({ length }, (_, index) => ({ id: `entity-${index}`, isOrigin: false }));

    it('accepts up to 5000 entityIds', () => {
      expect(() =>
        graphRequestSchema.validate({
          query: { ...baseQuery, entityIds: buildEntityIds(5000) },
        })
      ).not.toThrow();
    });

    it('rejects more than 5000 entityIds', () => {
      expect(() =>
        graphRequestSchema.validate({
          query: { ...baseQuery, entityIds: buildEntityIds(5001) },
        })
      ).toThrow();
    });
  });

  describe('indexPatterns maxSize (100)', () => {
    const buildIndexPatterns = (length: number) =>
      Array.from({ length }, (_, index) => `logs-${index}-*`);

    it('accepts up to 100 indexPatterns', () => {
      expect(() =>
        graphRequestSchema.validate({
          query: { ...baseQuery, indexPatterns: buildIndexPatterns(100) },
        })
      ).not.toThrow();
    });

    it('rejects more than 100 indexPatterns', () => {
      expect(() =>
        graphRequestSchema.validate({
          query: { ...baseQuery, indexPatterns: buildIndexPatterns(101) },
        })
      ).toThrow();
    });
  });

  describe('esQuery bool clause maxSize (100)', () => {
    const buildClauses = (length: number) =>
      Array.from({ length }, (_, index) => ({
        match_phrase: { 'event.action': `action-${index}` },
      }));

    it('accepts up to 100 clauses per bool section', () => {
      expect(() =>
        graphRequestSchema.validate({
          query: { ...baseQuery, esQuery: { bool: { filter: buildClauses(100) } } },
        })
      ).not.toThrow();
    });

    it('rejects more than 100 clauses in a bool section', () => {
      expect(() =>
        graphRequestSchema.validate({
          query: { ...baseQuery, esQuery: { bool: { must: buildClauses(101) } } },
        })
      ).toThrow();
    });
  });

  describe('pinnedIds maxSize (1024)', () => {
    const buildPinnedIds = (length: number) => Array.from({ length }, (_, index) => `id-${index}`);

    it('accepts up to 1024 pinnedIds', () => {
      expect(() =>
        graphRequestSchema.validate({
          query: { ...baseQuery, pinnedIds: buildPinnedIds(1024) },
        })
      ).not.toThrow();
    });

    it('rejects more than 1024 pinnedIds', () => {
      expect(() =>
        graphRequestSchema.validate({
          query: { ...baseQuery, pinnedIds: buildPinnedIds(1025) },
        })
      ).toThrow();
    });
  });
});
