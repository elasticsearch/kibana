/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ContentListQueryModel } from './types';
import { EMPTY_MODEL } from './types';
import { toFindItemsFilters } from './to_active_filters';

describe('toFindItemsFilters', () => {
  it('returns an empty object for `EMPTY_MODEL`.', () => {
    expect(toFindItemsFilters(EMPTY_MODEL)).toEqual({});
  });

  it('maps `model.search` to `filters.search`.', () => {
    const model: ContentListQueryModel = {
      ...EMPTY_MODEL,
      search: 'dashboard',
    };
    expect(toFindItemsFilters(model)).toEqual({ search: 'dashboard' });
  });

  it('does not set `search` when it is empty.', () => {
    const result = toFindItemsFilters({ ...EMPTY_MODEL, search: '' });
    expect(result).not.toHaveProperty('search');
  });

  it('maps `flags.starred` to `starred: { state: "include" }`.', () => {
    const model: ContentListQueryModel = {
      ...EMPTY_MODEL,
      flags: { starred: true },
    };
    expect(toFindItemsFilters(model)).toEqual({ starred: { state: 'include' } });
  });

  it('maps all truthy flags generically.', () => {
    const model: ContentListQueryModel = {
      ...EMPTY_MODEL,
      flags: { starred: true, pinned: true },
    };
    const result = toFindItemsFilters(model);
    expect(result.starred).toEqual({ state: 'include' });
    expect(result.pinned).toEqual({ state: 'include' });
  });

  it('does not set a flag key when it is `false`.', () => {
    const model: ContentListQueryModel = {
      ...EMPTY_MODEL,
      flags: { starred: false },
    };
    const result = toFindItemsFilters(model);
    expect(result).not.toHaveProperty('starred');
  });

  it('maps field filters with include/exclude arrays.', () => {
    const model: ContentListQueryModel = {
      ...EMPTY_MODEL,
      filters: {
        tag: { include: ['tag-1', 'tag-2'], exclude: ['tag-3'] },
        createdBy: { include: ['u_jane'], exclude: [] },
      },
    };
    const result = toFindItemsFilters(model);
    expect(result.tag).toEqual({ include: ['tag-1', 'tag-2'], exclude: ['tag-3'] });
    expect(result.createdBy).toEqual({ include: ['u_jane'], exclude: [] });
  });

  it('passes through `includeAll` (match-all) buckets.', () => {
    const model: ContentListQueryModel = {
      ...EMPTY_MODEL,
      filters: {
        tag: { include: [], includeAll: ['tag-1', 'tag-2'], exclude: ['tag-3'] },
      },
    };
    expect(toFindItemsFilters(model).tag).toEqual({
      include: [],
      includeAll: ['tag-1', 'tag-2'],
      exclude: ['tag-3'],
    });
  });

  it('emits a field filter that only has match-all values.', () => {
    const model: ContentListQueryModel = {
      ...EMPTY_MODEL,
      filters: {
        tag: { include: [], includeAll: ['tag-1', 'tag-2'], exclude: [] },
      },
    };
    expect(toFindItemsFilters(model).tag).toEqual({
      include: [],
      includeAll: ['tag-1', 'tag-2'],
      exclude: [],
    });
  });

  it('does not add an `includeAll` key when the bucket is empty.', () => {
    const model: ContentListQueryModel = {
      ...EMPTY_MODEL,
      filters: {
        tag: { include: ['tag-1'], includeAll: [], exclude: [] },
      },
    };
    expect(toFindItemsFilters(model).tag).not.toHaveProperty('includeAll');
  });

  it('skips field filters with empty include and exclude arrays.', () => {
    const model: ContentListQueryModel = {
      ...EMPTY_MODEL,
      filters: {
        tag: { include: [], exclude: [] },
        createdBy: { include: ['u_jane'], exclude: [] },
      },
    };
    const result = toFindItemsFilters(model);
    expect(result).not.toHaveProperty('tag');
    expect(result.createdBy).toEqual({ include: ['u_jane'], exclude: [] });
  });

  it('combines search, flags, and field filters.', () => {
    const model: ContentListQueryModel = {
      ...EMPTY_MODEL,
      search: 'report',
      flags: { starred: true },
      filters: {
        tag: { include: ['tag-1'], exclude: [] },
      },
    };
    const result = toFindItemsFilters(model);
    expect(result).toEqual({
      search: 'report',
      starred: { state: 'include' },
      tag: { include: ['tag-1'], exclude: [] },
    });
  });
});
