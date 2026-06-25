/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import type { EuiCommentProps } from '@elastic/eui';

import type { CurrentUserProfile } from '../../../types';
import { UserToolTip } from '../../../user_profiles/user_tooltip';
import { Username } from '../../../user_profiles/username';
import { HoverableAvatar } from '../../../user_profiles/hoverable_avatar';
import { ShowMoreActivities } from '../show_more_activities';
import * as i18n from '../translations';

interface UseCommentsListArgs {
  builtInfiniteActions: EuiCommentProps[];
  builtLastPageActions: EuiCommentProps[];
  hasNextPage: boolean | undefined;
  remainingActionCount: number;
  fetchNextPage: (() => void) | undefined;
  isFetchingNextPage: boolean;
  shouldShowCommentEditor: boolean;
  currentUserProfile: CurrentUserProfile;
  commentEditor: React.ReactNode;
}

export const useCommentsList = ({
  builtInfiniteActions,
  builtLastPageActions,
  hasNextPage,
  remainingActionCount,
  fetchNextPage,
  isFetchingNextPage,
  shouldShowCommentEditor,
  currentUserProfile,
  commentEditor,
}: UseCommentsListArgs): EuiCommentProps[] => {
  const handleShowMore = useCallback(() => {
    if (fetchNextPage) {
      fetchNextPage();
    }
  }, [fetchNextPage]);

  return useMemo<EuiCommentProps[]>(() => {
    const items: EuiCommentProps[] = [...builtInfiniteActions];

    if (hasNextPage) {
      items.push({
        username: '',
        'data-test-subj': 'cases-show-more-user-actions-wrapper',
        timelineAvatar: 'list',
        timelineAvatarAriaLabel: i18n.SHOW_MORE_ACTIVITIES_ARIA,
        className: 'showMoreActivities',
        verticalAlign: 'center',
        children: (
          <ShowMoreActivities
            count={remainingActionCount}
            onClick={handleShowMore}
            isLoading={isFetchingNextPage}
          />
        ),
      });
    }

    items.push(...builtLastPageActions);

    if (shouldShowCommentEditor) {
      items.push({
        username: (
          <UserToolTip userInfo={currentUserProfile}>
            <Username userInfo={currentUserProfile} />
          </UserToolTip>
        ),
        'data-test-subj': 'add-comment',
        timelineAvatar: <HoverableAvatar userInfo={currentUserProfile} />,
        className: 'isEdit',
        children: commentEditor,
      });
    }

    return items;
  }, [
    builtInfiniteActions,
    hasNextPage,
    remainingActionCount,
    handleShowMore,
    isFetchingNextPage,
    builtLastPageActions,
    shouldShowCommentEditor,
    currentUserProfile,
    commentEditor,
  ]);
};
