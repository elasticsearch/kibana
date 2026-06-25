/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiFlexItem, EuiSkeletonText } from '@elastic/eui';
import React, { useMemo } from 'react';

import { AddComment } from '../../add_comment';
import { useCaseViewParams } from '../../../common/navigation';
import type { UserActionTreeProps } from '../../user_actions/types';
import { useUserActionsHandler } from '../../user_actions/use_user_actions_handler';
import { NEW_COMMENT_ID } from '../../user_actions/constants';
import { UserActionsList } from './user_actions_list';
import { useUserActionsPagination } from './hooks/use_user_actions_pagination';
import { useLastPageUserActions } from '../../user_actions/use_user_actions_last_page';
import { useLastPage } from '../../user_actions/use_last_page';
import { useUserPermissions } from '../../user_actions/use_user_permissions';
import { useBuildUserActions } from './hooks/use_build_user_actions';
import { useBuilderContext } from './hooks/use_builder_context';
import { useCommentsList } from './hooks/use_comments_list';

export const UserActions = React.memo((props: UserActionTreeProps) => {
  const {
    currentUserProfile,
    data: caseData,
    statusActionButton,
    attachActionButton,
    userActivityQueryParams,
    userActionsStats,
    caseConnectors,
    userProfiles,
    casesConfiguration,
  } = props;
  const { detailName: caseId } = useCaseViewParams();

  const { lastPage } = useLastPage({ userActivityQueryParams, userActionsStats });

  const {
    infiniteCaseUserActions,
    infiniteLatestAttachments,
    isLoadingInfiniteUserActions,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    remainingActionCount,
  } = useUserActionsPagination({
    userActivityQueryParams,
    caseId: caseData.id,
  });

  const { isLoadingLastPageUserActions, lastPageUserActions, lastPageAttachments } =
    useLastPageUserActions({
      userActivityQueryParams,
      caseId: caseData.id,
      lastPage,
    });

  const { getCanAddUserComments } = useUserPermissions();
  const shouldShowCommentEditor = getCanAddUserComments(userActivityQueryParams);

  const actionsHandler = useUserActionsHandler();

  const {
    commentRefs,
    handleManageMarkdownEditId,
    handleManageQuote,
    handleUpdate,
    loadingCommentIds,
    manageMarkdownEditIds,
    selectedOutlineCommentId,
    handleOutlineComment,
    handleDeleteComment,
  } = actionsHandler;

  const builderContext = useBuilderContext({
    caseData,
    casesConfiguration,
    caseConnectors,
    userProfiles,
    currentUserProfile,
    manageMarkdownEditIds,
    selectedOutlineCommentId,
    loadingCommentIds,
    handleOutlineComment,
    handleDeleteComment,
  });

  const builtInfiniteActions = useBuildUserActions({
    caseUserActions: infiniteCaseUserActions,
    attachments: infiniteLatestAttachments,
    ...builderContext,
  });

  const builtLastPageActions = useBuildUserActions({
    caseUserActions: lastPageUserActions,
    attachments: lastPageAttachments,
    ...builderContext,
  });

  const commentEditor = useMemo(
    () => (
      <AddComment
        id={NEW_COMMENT_ID}
        caseId={caseId}
        ref={(element) => (commentRefs.current[NEW_COMMENT_ID] = element)}
        onCommentPosted={handleUpdate}
        onCommentSaving={handleManageMarkdownEditId.bind(null, NEW_COMMENT_ID)}
        showLoading={false}
        statusActionButton={statusActionButton}
        attachActionButton={attachActionButton}
      />
    ),
    [
      caseId,
      handleUpdate,
      handleManageMarkdownEditId,
      statusActionButton,
      attachActionButton,
      commentRefs,
    ]
  );

  const allComments = useCommentsList({
    builtInfiniteActions,
    builtLastPageActions,
    hasNextPage,
    remainingActionCount,
    fetchNextPage,
    isFetchingNextPage,
    shouldShowCommentEditor,
    currentUserProfile,
    commentEditor,
  });

  return (
    <EuiSkeletonText
      lines={8}
      data-test-subj="user-actions-loading"
      isLoading={
        isLoadingLastPageUserActions ||
        loadingCommentIds.includes(NEW_COMMENT_ID) ||
        isLoadingInfiniteUserActions
      }
    >
      <EuiFlexItem>
        <UserActionsList
          comments={allComments}
          caseData={caseData}
          userProfiles={userProfiles}
          commentRefs={commentRefs}
          handleManageQuote={handleManageQuote}
          actionsHandler={actionsHandler}
        />
      </EuiFlexItem>
    </EuiSkeletonText>
  );
});

UserActions.displayName = 'UserActions';
