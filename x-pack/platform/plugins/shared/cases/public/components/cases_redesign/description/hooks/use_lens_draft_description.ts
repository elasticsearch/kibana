/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MutableRefObject } from 'react';
import { useCallback, useEffect } from 'react';
import { useLensDraftComment } from '../../../markdown_editor/plugins/lens/use_lens_draft_comment';
import { DESCRIPTION_ID } from '../constants';
import { isCommentRef } from '../utils';
import type { DescriptionMarkdownRefObject } from '../types';

interface UseLensDraftDescriptionArgs {
  isEditable: boolean;
  setIsEditable: (value: boolean) => void;
  descriptionMarkdownRef: MutableRefObject<DescriptionMarkdownRefObject | null>;
}

export const useLensDraftDescription = ({
  isEditable,
  setIsEditable,
  descriptionMarkdownRef,
}: UseLensDraftDescriptionArgs) => {
  const {
    clearDraftComment: clearLensDraftComment,
    draftComment: lensDraftComment,
    hasIncomingLensState,
    openLensModal,
  } = useLensDraftComment();

  useEffect(() => {
    if (
      hasIncomingLensState &&
      lensDraftComment !== null &&
      lensDraftComment?.commentId === DESCRIPTION_ID &&
      !isEditable
    ) {
      setIsEditable(true);
    }
  }, [hasIncomingLensState, lensDraftComment, isEditable, setIsEditable]);

  useEffect(() => {
    if (
      isCommentRef(descriptionMarkdownRef.current) &&
      descriptionMarkdownRef.current.editor?.textarea &&
      lensDraftComment &&
      lensDraftComment.commentId === DESCRIPTION_ID
    ) {
      descriptionMarkdownRef.current.setComment(lensDraftComment.comment);
      if (hasIncomingLensState) {
        openLensModal({ editorRef: descriptionMarkdownRef.current.editor });
      } else {
        clearLensDraftComment();
      }
    }
  }, [
    clearLensDraftComment,
    lensDraftComment,
    hasIncomingLensState,
    openLensModal,
    descriptionMarkdownRef,
  ]);

  const handleOnChangeEditable = useCallback(() => {
    clearLensDraftComment();
    setIsEditable(false);
  }, [setIsEditable, clearLensDraftComment]);

  return { handleOnChangeEditable };
};
