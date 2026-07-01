/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { renderHook, act } from '@testing-library/react';
import type { ContentManagementTagsServices } from '@kbn/content-management-tags';
import type { FavoritesClientPublic } from '@kbn/content-management-favorites-public';
import { ContentListProvider } from '../context';
import type { FindItemsParams, FindItemsResult } from '../datasource';
import type { ContentListUserProfilesServices } from '../services';
import { ProfileCache, useProfileCache } from '../services';
import { EMPTY_MODEL } from './types';
import { buildSchema } from './parse_query_text';
import { useQueryModel } from './use_query_model';

const mockFindItems = jest.fn(
  async (_params: FindItemsParams): Promise<FindItemsResult> => ({
    items: [],
    total: 0,
  })
);

const mockTagsService: ContentManagementTagsServices = {
  getTagList: () => [
    { id: 'tag-1', name: 'Production', description: '', color: '#FF0000', managed: false },
    { id: 'tag-2', name: 'Archived', description: '', color: '#808080', managed: false },
  ],
};

const mockUsers = [
  {
    uid: 'u_jane',
    user: { username: 'jane', email: 'jane@example.com', full_name: 'Jane Example' },
    email: 'jane@example.com',
    fullName: 'Jane Example',
  },
  {
    uid: 'u_john',
    user: { username: 'john', email: 'john@example.com', full_name: 'John Example' },
    email: 'john@example.com',
    fullName: 'John Example',
  },
];

const mockUserProfilesService: ContentListUserProfilesServices = {
  bulkResolve: async (uids) => mockUsers.filter((u) => uids.includes(u.uid)),
};

const mockFavoritesService: FavoritesClientPublic = {
  getFavorites: async () => ({ favoriteIds: [], favoriteMetadata: {} as Record<string, never> }),
  addFavorite: async ({ id }: { id: string }) => ({ favoriteIds: [id] }),
  removeFavorite: async () => ({ favoriteIds: [] }),
  isAvailable: async () => true,
  getFavoriteType: () => 'mock',
  reportAddFavoriteClick: () => {},
  reportRemoveFavoriteClick: () => {},
};

/**
 * Build a fresh wrapper and `ProfileCache` per test to avoid cross-test
 * cache leakage (the internal `Map` survives `jest.clearAllMocks()`).
 */
const createWrapper = () => {
  const cache = new ProfileCache(mockUserProfilesService.bulkResolve);
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <ContentListProvider
      id="test-list"
      labels={{ entity: 'item', entityPlural: 'items' }}
      dataSource={{ findItems: mockFindItems }}
      services={{
        tags: mockTagsService,
        userProfiles: mockUserProfilesService,
        favorites: mockFavoritesService,
      }}
      profileCache={cache}
    >
      {children}
    </ContentListProvider>
  );
  return { wrapper: Wrapper, profileCache: cache };
};

/**
 * Helper hook that exposes both the derived model and the profile cache,
 * so tests can seed the cache before asserting on query derivation.
 */
const useQueryModelWithCache = (queryText: string) => {
  const cache = useProfileCache();
  const model = useQueryModel(queryText);
  return { model, profileCache: cache };
};

describe('useQueryModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the empty model for blank query text', () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useQueryModel('   '), { wrapper });

    expect(result.current).toEqual(EMPTY_MODEL);
  });

  it('derives search text, field filters, and flags from the query', async () => {
    const { wrapper } = createWrapper();
    const queryText =
      'dashboard createdBy:jane@example.com -tag:Archived tag:Production is:starred status:open is:custom';

    const { result } = renderHook(() => useQueryModelWithCache(queryText), { wrapper });

    await act(async () => {
      await result.current.profileCache?.ensureLoaded(mockUsers.map((u) => u.uid));
    });

    expect(result.current.model.search).toBe('dashboard status:open is:custom');
    expect(result.current.model.filters).toEqual({
      createdBy: { include: [], includeAll: ['u_jane'], exclude: [] },
      tag: { include: [], includeAll: ['tag-1'], exclude: ['tag-2'] },
    });
    expect(result.current.model.flags).toEqual({ starred: true });
    expect(result.current.model.referencedFields).toEqual(new Set(['tag', 'createdBy']));
  });

  it('uses fuzzy matching when an exact field match is unavailable', async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useQueryModelWithCache('createdBy:jane tag:prod'), {
      wrapper,
    });

    await act(async () => {
      await result.current.profileCache?.ensureLoaded(mockUsers.map((u) => u.uid));
    });

    expect(result.current.model.filters).toEqual({
      createdBy: { include: [], includeAll: ['u_jane'], exclude: [] },
      tag: { include: [], includeAll: ['tag-1'], exclude: [] },
    });
  });

  it('falls back to trimmed free text when query parsing fails', () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useQueryModel('status:open (unclosed'), { wrapper });

    expect(result.current).toEqual({
      ...EMPTY_MODEL,
      search: 'status:open (unclosed',
    });
  });
});

describe('buildSchema', () => {
  it('returns undefined when there are no field definitions', () => {
    expect(buildSchema([])).toBeUndefined();
  });

  it('creates a non-strict EUI schema for known fields', () => {
    expect(
      buildSchema([
        {
          fieldName: 'tag',
          resolveIdToDisplay: (value: string) => value,
          resolveDisplayToId: (value: string) => value,
        },
        {
          fieldName: 'createdBy',
          resolveIdToDisplay: (value: string) => value,
          resolveDisplayToId: (value: string) => value,
        },
      ])
    ).toEqual({
      strict: false,
      fields: {
        tag: { type: 'string' },
        createdBy: { type: 'string' },
      },
    });
  });
});
