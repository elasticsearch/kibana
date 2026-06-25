/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import { useUserActionsPagination } from './use_user_actions_pagination';
import { useInfiniteFindCaseUserActions } from '../../../../containers/use_infinite_find_case_user_actions';

jest.mock('../../../../containers/use_infinite_find_case_user_actions');

const useInfiniteFindCaseUserActionsMock = useInfiniteFindCaseUserActions as jest.Mock;

describe('useUserActionsPagination', () => {
  const defaultParams = {
    userActivityQueryParams: {
      type: 'all' as const,
      sortOrder: 'asc' as const,
      page: 1,
      perPage: 10,
    },
    caseId: 'case-1',
    lastPage: 2,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useInfiniteFindCaseUserActionsMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      hasNextPage: false,
      fetchNextPage: jest.fn(),
      isFetchingNextPage: false,
    });
  });

  it('returns empty arrays when loading', () => {
    const { result } = renderHook(() => useUserActionsPagination(defaultParams));

    expect(result.current.infiniteCaseUserActions).toEqual([]);
    expect(result.current.infiniteLatestAttachments).toEqual([]);
    expect(result.current.remainingActionCount).toBe(0);
  });

  it('does not return showBottomList or lastPage', () => {
    const { result } = renderHook(() => useUserActionsPagination(defaultParams));

    expect(result.current).not.toHaveProperty('showBottomList');
    expect(result.current).not.toHaveProperty('lastPage');
  });

  it('computes remainingActionCount from pages', () => {
    useInfiniteFindCaseUserActionsMock.mockReturnValue({
      data: {
        pages: [
          { userActions: [{ id: '1' }, { id: '2' }], latestAttachments: [], total: 10 },
          { userActions: [{ id: '3' }], latestAttachments: [], total: 10 },
        ],
      },
      isLoading: false,
      hasNextPage: true,
      fetchNextPage: jest.fn(),
      isFetchingNextPage: false,
    });

    const { result } = renderHook(() => useUserActionsPagination(defaultParams));

    expect(result.current.remainingActionCount).toBe(7);
  });

  it('flattens user actions from all pages', () => {
    useInfiniteFindCaseUserActionsMock.mockReturnValue({
      data: {
        pages: [
          { userActions: [{ id: '1' }], latestAttachments: [{ id: 'a1' }], total: 2 },
          { userActions: [{ id: '2' }], latestAttachments: [{ id: 'a2' }], total: 2 },
        ],
      },
      isLoading: false,
      hasNextPage: false,
      fetchNextPage: jest.fn(),
      isFetchingNextPage: false,
    });

    const { result } = renderHook(() => useUserActionsPagination(defaultParams));

    expect(result.current.infiniteCaseUserActions).toHaveLength(2);
    expect(result.current.infiniteLatestAttachments).toHaveLength(2);
  });
});
