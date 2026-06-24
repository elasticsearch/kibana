/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiThemeComputed } from '@elastic/eui';
import { COMMENT_ATTACHMENT_TYPE } from '../../../../common/constants/attachments';
import {
  AttachmentActionType,
  type UnifiedValueAttachmentViewProps,
} from '../../../client/attachment_framework/types';
import type { CommentAttachmentData } from '../../../../common/types/domain_zod/attachment/comment/v2';
import { basicCase } from '../../../containers/mock';
import { getCommentAttachmentType } from '.';

type CommentViewProps = UnifiedValueAttachmentViewProps<CommentAttachmentData>;

describe('getCommentAttachmentType', () => {
  // Minimal slice of EuiThemeComputed used by `createCommentActionCss`.
  const euiTheme = {
    size: { xl: '32px', base: '16px' },
    border: { thin: '1px solid #ccc' },
  } as unknown as EuiThemeComputed<{}>;

  const attachmentViewProps: CommentViewProps = {
    data: { content: 'hello world' },
    createdBy: { username: 'elastic', fullName: null, email: null, profileUid: undefined },
    version: '1',
    savedObjectId: 'comment-1',
    caseData: { title: basicCase.title, id: basicCase.id },
    rowContext: {
      appId: 'cases',
      manageMarkdownEditIds: [],
      selectedOutlineCommentId: '',
      loadingCommentIds: [],
      euiTheme,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  it('creates the attachment type correctly', () => {
    const commentType = getCommentAttachmentType();

    expect(commentType).toStrictEqual({
      id: COMMENT_ATTACHMENT_TYPE,
      icon: 'editorComment',
      displayName: 'Comments',
      getAttachmentViewObject: expect.any(Function),
      getAttachmentRemovalObject: expect.any(Function),
      schema: expect.any(Object),
    });
  });

  describe('getAttachmentViewObject', () => {
    it('renders the event correctly', () => {
      const commentType = getCommentAttachmentType();
      const { event } = commentType.getAttachmentViewObject(attachmentViewProps);

      expect(event).toBe('added a comment');
    });

    it('hides the default actions', () => {
      const commentType = getCommentAttachmentType();
      const { hideDefaultActions } = commentType.getAttachmentViewObject(attachmentViewProps);

      expect(hideDefaultActions).toBe(true);
    });

    it('sets a primary custom action', () => {
      const commentType = getCommentAttachmentType();
      const actions = commentType
        .getAttachmentViewObject(attachmentViewProps)
        .getActions?.(attachmentViewProps);

      expect(actions).toHaveLength(1);
      expect(actions?.[0]).toEqual({
        type: AttachmentActionType.CUSTOM,
        isPrimary: true,
        render: expect.any(Function),
      });
    });

    it('exposes a children component for the comment body', () => {
      const commentType = getCommentAttachmentType();
      const { children } = commentType.getAttachmentViewObject(attachmentViewProps);

      expect(children).toEqual(expect.any(Object));
    });

    it('returns a className when rowContext is present', () => {
      const commentType = getCommentAttachmentType();
      const { className } = commentType.getAttachmentViewObject(attachmentViewProps);

      expect(className).toContain('userAction__comment');
    });

    it('marks the className as outlined when the comment is selected', () => {
      const commentType = getCommentAttachmentType();
      const { className } = commentType.getAttachmentViewObject({
        ...attachmentViewProps,
        rowContext: {
          ...attachmentViewProps.rowContext,
          selectedOutlineCommentId: attachmentViewProps.savedObjectId,
        },
      });

      expect(className).toContain('outlined');
    });

    it('marks the className as isEdit when the comment is being edited', () => {
      const commentType = getCommentAttachmentType();
      const { className } = commentType.getAttachmentViewObject({
        ...attachmentViewProps,
        rowContext: {
          ...attachmentViewProps.rowContext,
          manageMarkdownEditIds: [attachmentViewProps.savedObjectId],
        },
      });

      expect(className).toContain('isEdit');
    });
  });

  describe('getAttachmentRemovalObject', () => {
    it('renders the removal event correctly', () => {
      const commentType = getCommentAttachmentType();
      const removal = commentType.getAttachmentRemovalObject?.(attachmentViewProps);

      expect(removal).toEqual({ event: 'Deleted comment' });
    });
  });
});
