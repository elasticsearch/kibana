/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import { useHighlightLinkedComment } from './use_highlight_linked_comment';
import { useCaseViewParams } from '../../../../common/navigation';

jest.mock('../../../../common/navigation');

const useCaseViewParamsMock = useCaseViewParams as jest.Mock;

describe('useHighlightLinkedComment', () => {
  const handleOutlineComment = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls handleOutlineComment when commentId is present', () => {
    useCaseViewParamsMock.mockReturnValue({ detailName: 'case-1', commentId: 'comment-1' });

    renderHook(() => useHighlightLinkedComment(handleOutlineComment));

    expect(handleOutlineComment).toHaveBeenCalledWith('comment-1');
  });

  it('does not call handleOutlineComment when commentId is absent', () => {
    useCaseViewParamsMock.mockReturnValue({ detailName: 'case-1' });

    renderHook(() => useHighlightLinkedComment(handleOutlineComment));

    expect(handleOutlineComment).not.toHaveBeenCalled();
  });

  it('only calls handleOutlineComment once on re-renders', () => {
    useCaseViewParamsMock.mockReturnValue({ detailName: 'case-1', commentId: 'comment-1' });

    const { rerender } = renderHook(() => useHighlightLinkedComment(handleOutlineComment));

    rerender();
    rerender();

    expect(handleOutlineComment).toHaveBeenCalledTimes(1);
  });
});
