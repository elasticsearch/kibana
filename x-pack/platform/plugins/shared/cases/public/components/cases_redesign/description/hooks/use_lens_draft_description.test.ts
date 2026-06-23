/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MutableRefObject } from 'react';
import { renderHook, act } from '@testing-library/react';

import { useLensDraftComment } from '../../../markdown_editor/plugins/lens/use_lens_draft_comment';
import type { DescriptionMarkdownRefObject } from '../types';
import { useLensDraftDescription } from './use_lens_draft_description';

jest.mock('../../../markdown_editor/plugins/lens/use_lens_draft_comment');

const useLensDraftCommentMock = useLensDraftComment as jest.Mock;
const clearDraftComment = jest.fn();
const openLensModal = jest.fn();

describe('useLensDraftDescription', () => {
  const setIsEditable = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useLensDraftCommentMock.mockReturnValue({
      clearDraftComment,
      openLensModal,
      draftComment: null,
      hasIncomingLensState: false,
    });
  });

  it('returns handleOnChangeEditable function', () => {
    const descriptionMarkdownRef = {
      current: null,
    } as MutableRefObject<DescriptionMarkdownRefObject | null>;

    const { result } = renderHook(() =>
      useLensDraftDescription({
        isEditable: false,
        setIsEditable,
        descriptionMarkdownRef,
      })
    );

    expect(result.current).toEqual({
      handleOnChangeEditable: expect.any(Function),
    });
  });

  it('sets isEditable to true when there is incoming lens state with description comment', () => {
    useLensDraftCommentMock.mockReturnValue({
      clearDraftComment,
      openLensModal,
      draftComment: { commentId: 'description', comment: 'lens content' },
      hasIncomingLensState: true,
    });

    const descriptionMarkdownRef = {
      current: null,
    } as MutableRefObject<DescriptionMarkdownRefObject | null>;

    renderHook(() =>
      useLensDraftDescription({
        isEditable: false,
        setIsEditable,
        descriptionMarkdownRef,
      })
    );

    expect(setIsEditable).toHaveBeenCalledWith(true);
  });

  it('does not set isEditable when already editable', () => {
    useLensDraftCommentMock.mockReturnValue({
      clearDraftComment,
      openLensModal,
      draftComment: { commentId: 'description', comment: 'lens content' },
      hasIncomingLensState: true,
    });

    const descriptionMarkdownRef = {
      current: null,
    } as MutableRefObject<DescriptionMarkdownRefObject | null>;

    renderHook(() =>
      useLensDraftDescription({
        isEditable: true,
        setIsEditable,
        descriptionMarkdownRef,
      })
    );

    expect(setIsEditable).not.toHaveBeenCalled();
  });

  it('does not set isEditable when comment ID does not match description', () => {
    useLensDraftCommentMock.mockReturnValue({
      clearDraftComment,
      openLensModal,
      draftComment: { commentId: 'other', comment: 'content' },
      hasIncomingLensState: true,
    });

    const descriptionMarkdownRef = {
      current: null,
    } as MutableRefObject<DescriptionMarkdownRefObject | null>;

    renderHook(() =>
      useLensDraftDescription({
        isEditable: false,
        setIsEditable,
        descriptionMarkdownRef,
      })
    );

    expect(setIsEditable).not.toHaveBeenCalled();
  });

  it('does not set isEditable when there is no incoming lens state', () => {
    useLensDraftCommentMock.mockReturnValue({
      clearDraftComment,
      openLensModal,
      draftComment: { commentId: 'description', comment: 'lens content' },
      hasIncomingLensState: false,
    });

    const descriptionMarkdownRef = {
      current: null,
    } as MutableRefObject<DescriptionMarkdownRefObject | null>;

    renderHook(() =>
      useLensDraftDescription({
        isEditable: false,
        setIsEditable,
        descriptionMarkdownRef,
      })
    );

    expect(setIsEditable).not.toHaveBeenCalled();
  });

  it('sets comment and opens lens modal when ref is valid and has incoming lens state', () => {
    const setComment = jest.fn();
    const editor = {
      textarea: document.createElement('textarea'),
      replaceNode: jest.fn(),
      toolbar: null,
    };
    const descriptionMarkdownRef = {
      current: { setComment, editor },
    } as unknown as MutableRefObject<DescriptionMarkdownRefObject | null>;

    useLensDraftCommentMock.mockReturnValue({
      clearDraftComment,
      openLensModal,
      draftComment: { commentId: 'description', comment: 'lens comment' },
      hasIncomingLensState: true,
    });

    renderHook(() =>
      useLensDraftDescription({
        isEditable: false,
        setIsEditable,
        descriptionMarkdownRef,
      })
    );

    expect(setComment).toHaveBeenCalledWith('lens comment');
    expect(openLensModal).toHaveBeenCalledWith({ editorRef: editor });
  });

  it('sets comment and clears draft when ref is valid and no incoming lens state', () => {
    const setComment = jest.fn();
    const editor = {
      textarea: document.createElement('textarea'),
      replaceNode: jest.fn(),
      toolbar: null,
    };
    const descriptionMarkdownRef = {
      current: { setComment, editor },
    } as unknown as MutableRefObject<DescriptionMarkdownRefObject | null>;

    useLensDraftCommentMock.mockReturnValue({
      clearDraftComment,
      openLensModal,
      draftComment: { commentId: 'description', comment: 'draft comment' },
      hasIncomingLensState: false,
    });

    renderHook(() =>
      useLensDraftDescription({
        isEditable: false,
        setIsEditable,
        descriptionMarkdownRef,
      })
    );

    expect(setComment).toHaveBeenCalledWith('draft comment');
    expect(clearDraftComment).toHaveBeenCalled();
    expect(openLensModal).not.toHaveBeenCalled();
  });

  it('handleOnChangeEditable clears draft and sets isEditable to false', () => {
    const descriptionMarkdownRef = {
      current: null,
    } as MutableRefObject<DescriptionMarkdownRefObject | null>;

    const { result } = renderHook(() =>
      useLensDraftDescription({
        isEditable: true,
        setIsEditable,
        descriptionMarkdownRef,
      })
    );

    act(() => {
      result.current.handleOnChangeEditable();
    });

    expect(clearDraftComment).toHaveBeenCalled();
    expect(setIsEditable).toHaveBeenCalledWith(false);
  });
});
