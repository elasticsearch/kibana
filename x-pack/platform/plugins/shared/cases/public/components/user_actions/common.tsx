/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { EuiCommentProps } from '@elastic/eui';
import { EuiFlexItem } from '@elastic/eui';

import type { UserActionAction } from '../../../common/types/domain';
import { UserActionActions } from '../../../common/types/domain';
import { UserActionTimestamp } from './timestamp';
import type { UserActionBuilder, UserActionBuilderArgs } from './types';
import { UserActionMoveToReference } from './move_to_reference';
import { HoverableUserWithAvatarResolver } from '../user_profiles/hoverable_user_with_avatar_resolver';
import { getUserActionAriaLabel } from './user_actions_aria_labels';
import { UserActionContentToolbar } from './content_toolbar';

const showMoveToReference = (
  action: UserActionAction,
  commentId: string | null
): commentId is string => action === UserActionActions.update && commentId != null;

type BuilderArgs = Pick<
  UserActionBuilderArgs,
  'userAction' | 'handleOutlineComment' | 'userProfiles'
> & {
  label: EuiCommentProps['event'];
  icon: EuiCommentProps['timelineAvatar'];
  /**
   * Extra control appended after copy-link / move-to-reference (e.g. a document-flyout button).
   * Pass the raw node returned by `renderAttachmentAction` — it wraps BUTTON actions in their
   * own `EuiFlexItem`, so this slot must NOT add another wrapper.
   */
  documentAction?: React.ReactNode;
};

export const createCommonUpdateUserActionBuilder = ({
  userProfiles,
  userAction,
  label,
  icon,
  handleOutlineComment,
  documentAction,
}: BuilderArgs): ReturnType<UserActionBuilder> => {
  return {
    build: () => [
      {
        username: (
          <HoverableUserWithAvatarResolver
            user={userAction.createdBy}
            userProfiles={userProfiles}
          />
        ),
        event: label,
        'data-test-subj': `${userAction.type}-${userAction.action}-action-${userAction.id}`,
        timestamp: <UserActionTimestamp createdAt={userAction.createdAt} />,
        timelineAvatar: icon,
        timelineAvatarAriaLabel: getUserActionAriaLabel(userAction.type),
        actions: (
          <UserActionContentToolbar id={userAction.id}>
            {showMoveToReference(userAction.action, userAction.commentId) && (
              <EuiFlexItem grow={false}>
                <UserActionMoveToReference
                  id={userAction.commentId}
                  outlineComment={handleOutlineComment}
                />
              </EuiFlexItem>
            )}
            {documentAction}
          </UserActionContentToolbar>
        ),
      },
    ],
  };
};
