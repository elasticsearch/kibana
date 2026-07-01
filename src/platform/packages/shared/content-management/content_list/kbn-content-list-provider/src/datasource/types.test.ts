/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  getIncludeExcludeFilter,
  getIncludeExcludeFlag,
  TAG_FILTER_ID,
  CREATED_BY_FILTER_ID,
} from './types';
import type { IncludeExcludeFilter, IncludeExcludeFlag } from './types';

describe('datasource type utilities', () => {
  describe('getIncludeExcludeFilter', () => {
    it('returns the filter when the value is an `IncludeExcludeFilter` object.', () => {
      const filter: IncludeExcludeFilter = { include: ['a'], exclude: ['b'] };
      expect(getIncludeExcludeFilter(filter)).toBe(filter);
    });

    it('returns the filter for an object with only `include`.', () => {
      const filter: IncludeExcludeFilter = { include: ['a'] };
      expect(getIncludeExcludeFilter(filter)).toBe(filter);
    });

    it('returns the filter for an object with only `includeAll` (match-all).', () => {
      const filter: IncludeExcludeFilter = { includeAll: ['a', 'b'] };
      expect(getIncludeExcludeFilter(filter)).toBe(filter);
    });

    it('returns `undefined` for a string value.', () => {
      expect(getIncludeExcludeFilter('search text')).toBeUndefined();
    });

    it('returns `undefined` for `undefined`.', () => {
      expect(getIncludeExcludeFilter(undefined)).toBeUndefined();
    });

    it('returns `undefined` for an `IncludeExcludeFlag`.', () => {
      const flag: IncludeExcludeFlag = { state: 'include' };
      expect(getIncludeExcludeFilter(flag)).toBeUndefined();
    });
  });

  describe('getIncludeExcludeFlag', () => {
    it('returns the flag when the value has a `state` field.', () => {
      const flag: IncludeExcludeFlag = { state: 'include' };
      expect(getIncludeExcludeFlag(flag)).toBe(flag);
    });

    it('returns the flag for `{ state: "exclude" }`.', () => {
      const flag: IncludeExcludeFlag = { state: 'exclude' };
      expect(getIncludeExcludeFlag(flag)).toBe(flag);
    });

    it('returns `undefined` for a string value.', () => {
      expect(getIncludeExcludeFlag('search text')).toBeUndefined();
    });

    it('returns `undefined` for `undefined`.', () => {
      expect(getIncludeExcludeFlag(undefined)).toBeUndefined();
    });

    it('returns `undefined` for an `IncludeExcludeFilter`.', () => {
      const filter: IncludeExcludeFilter = { include: ['a'] };
      expect(getIncludeExcludeFlag(filter)).toBeUndefined();
    });
  });

  describe('filter ID constants', () => {
    it('TAG_FILTER_ID is `tag`.', () => {
      expect(TAG_FILTER_ID).toBe('tag');
    });

    it('CREATED_BY_FILTER_ID is `createdBy`.', () => {
      expect(CREATED_BY_FILTER_ID).toBe('createdBy');
    });
  });
});
