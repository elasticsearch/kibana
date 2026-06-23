/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { decodeLegacyParams } from './legacy_decoder';

describe('legacy_decoder', () => {
  const validSortFields = new Set(['title', 'updatedAt', 'accessedAt']);

  it('returns null when no legacy params are present', () => {
    expect(decodeLegacyParams({ q: 'dashboard' }, validSortFields)).toBeNull();
  });

  it('decodes s as query text', () => {
    expect(decodeLegacyParams({ s: 'dashboard' }, validSortFields)).toEqual({
      state: { queryText: 'dashboard' },
      consumed: ['s'],
    });
  });

  it('preserves s over title precedence', () => {
    expect(decodeLegacyParams({ s: 'search', title: 'dashboard' }, validSortFields)).toEqual({
      state: { queryText: 'search' },
      consumed: ['s', 'title'],
    });
  });

  it('decodes filter as query text', () => {
    expect(decodeLegacyParams({ filter: 'graph' }, validSortFields)).toEqual({
      state: { queryText: 'graph' },
      consumed: ['filter'],
    });
  });

  it('preserves s and title over filter precedence', () => {
    expect(
      decodeLegacyParams({ s: 'search', title: 'dashboard', filter: 'graph' }, validSortFields)
    ).toEqual({
      state: { queryText: 'search' },
      consumed: ['s', 'title', 'filter'],
    });

    expect(decodeLegacyParams({ title: 'dashboard', filter: 'graph' }, validSortFields)).toEqual({
      state: { queryText: 'dashboard' },
      consumed: ['title', 'filter'],
    });
  });

  it('combines filter free text with createdBy and favorites', () => {
    expect(
      decodeLegacyParams(
        { filter: 'graph', created_by: 'jane@example.com', favorites: 'true' },
        validSortFields
      )?.state.queryText
    ).toBe('graph createdBy:"jane@example.com" is:starred');
  });

  it('decodes created_by values with EUI query escaping', () => {
    expect(
      decodeLegacyParams({ created_by: ['jane@example.com', 'Jane Doe'] }, validSortFields)?.state
        .queryText
    ).toBe('createdBy:"jane@example.com" createdBy:"Jane Doe"');
  });

  it('decodes favorites=true as is:starred', () => {
    expect(decodeLegacyParams({ favorites: 'true' }, validSortFields)).toEqual({
      state: { queryText: 'is:starred' },
      consumed: ['favorites'],
    });
  });

  it('combines free text, createdBy, favorites, and sort', () => {
    expect(
      decodeLegacyParams(
        {
          s: 'dashboard',
          created_by: 'jane@example.com',
          favorites: 'true',
          sort: 'updatedAt',
          sortdir: 'asc',
        },
        validSortFields
      )
    ).toEqual({
      state: {
        queryText: 'dashboard createdBy:"jane@example.com" is:starred',
        sort: { field: 'updatedAt', direction: 'asc' },
      },
      consumed: ['s', 'sort', 'sortdir', 'created_by', 'favorites'],
    });
  });

  it('maps legacy title sort to ContentList title when registered', () => {
    expect(decodeLegacyParams({ sort: 'title' }, validSortFields)?.state.sort).toEqual({
      field: 'title',
      direction: 'asc',
    });
  });

  it('maps legacy title sort to attributes.title when that is the registered field', () => {
    expect(
      decodeLegacyParams({ sort: 'title' }, new Set(['attributes.title']))?.state.sort
    ).toEqual({
      field: 'attributes.title',
      direction: 'asc',
    });
  });

  it('drops unknown legacy sort values and warns', () => {
    const onUnknown = jest.fn();

    expect(decodeLegacyParams({ sort: 'unknown' }, validSortFields, onUnknown)).toEqual({
      state: {},
      consumed: ['sort'],
    });
    expect(onUnknown).toHaveBeenCalledWith('sort', 'unknown');
  });

  it('uses TLV default sort directions when sortdir is absent', () => {
    expect(decodeLegacyParams({ sort: 'updatedAt' }, validSortFields)?.state.sort).toEqual({
      field: 'updatedAt',
      direction: 'desc',
    });
  });
});
