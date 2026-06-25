/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { renderHook } from '@testing-library/react';
import type { EuiCommentProps } from '@elastic/eui';

import { useCommentsList } from './use_comments_list';

describe('useCommentsList', () => {
  const infiniteAction: EuiCommentProps = {
    username: 'user1',
    children: <div>{'Infinite action'}</div>,
  };

  const lastPageAction: EuiCommentProps = {
    username: 'user2',
    children: <div>{'Last page action'}</div>,
  };

  const defaultArgs = {
    builtInfiniteActions: [infiniteAction],
    builtLastPageActions: [lastPageAction],
    hasNextPage: false,
    remainingActionCount: 0,
    fetchNextPage: jest.fn(),
    isFetchingNextPage: false,
    shouldShowCommentEditor: false,
    currentUserProfile: undefined,
    commentEditor: <div>{'Editor'}</div>,
  };

  it('returns infinite + last page actions when no next page', () => {
    const { result } = renderHook(() => useCommentsList(defaultArgs));

    expect(result.current).toHaveLength(2);
  });

  it('inserts show-more entry between infinite and last page actions when hasNextPage', () => {
    const { result } = renderHook(() =>
      useCommentsList({ ...defaultArgs, hasNextPage: true, remainingActionCount: 5 })
    );

    expect(result.current).toHaveLength(3);
    expect(result.current[1]['data-test-subj']).toBe('cases-show-more-user-actions-wrapper');
  });

  it('appends add-comment entry when shouldShowCommentEditor is true', () => {
    const { result } = renderHook(() =>
      useCommentsList({ ...defaultArgs, shouldShowCommentEditor: true })
    );

    expect(result.current).toHaveLength(3);
    expect(result.current[2]['data-test-subj']).toBe('add-comment');
  });

  it('includes both show-more and add-comment when both conditions are met', () => {
    const { result } = renderHook(() =>
      useCommentsList({
        ...defaultArgs,
        hasNextPage: true,
        remainingActionCount: 3,
        shouldShowCommentEditor: true,
      })
    );

    expect(result.current).toHaveLength(4);
    expect(result.current[1]['data-test-subj']).toBe('cases-show-more-user-actions-wrapper');
    expect(result.current[3]['data-test-subj']).toBe('add-comment');
  });

  it('returns empty list when no actions and no editor', () => {
    const { result } = renderHook(() =>
      useCommentsList({
        ...defaultArgs,
        builtInfiniteActions: [],
        builtLastPageActions: [],
      })
    );

    expect(result.current).toHaveLength(0);
  });
});
