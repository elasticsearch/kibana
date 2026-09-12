/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiEmptyPrompt,
  EuiFlexItem,
  EuiIllustration,
  EuiSkeletonText,
  useEuiTheme,
} from '@elastic/eui';
import React, { useMemo } from 'react';

import { notFound } from '@elastic/eui-illustrations';
import { AddComment } from '../../add_comment';
import { useCaseViewParams } from '../../../common/navigation';
import type { UserActionTreeProps } from '../../user_actions/types';
import { useUserActionsHandler } from '../../user_actions/use_user_actions_handler';
import { NEW_COMMENT_ID } from '../../user_actions/constants';
import { hasActiveUserActivityFilter } from '../../user_actions_activity_bar/utils';
import { UserActionsList } from './user_actions_list';
import { useUserActionsPagination } from './hooks/use_user_actions_pagination';
import { useLastPageUserActions } from '../../user_actions/use_user_actions_last_page';
import { useLastPage } from '../../user_actions/use_last_page';
import { useUserPermissions } from '../../user_actions/use_user_permissions';
import { useBuildUserActions } from './hooks/use_build_user_actions';
import { useBuilderContext } from './hooks/use_builder_context';
import { useCommentsList } from './hooks/use_comments_list';
import { NO_SEARCH_RESULTS_BODY, NO_SEARCH_RESULTS_TITLE } from './translations';
import { useGetCaseConnectors } from '../../../containers/use_get_case_connectors';
import { useGetCaseUsers } from '../../../containers/use_get_case_users';
import { useGetCaseConfiguration } from '../../../containers/configure/use_get_case_configuration';
import { useGetCurrentUserProfile } from '../../../containers/user_profiles/use_get_current_user_profile';
import { parseCaseUsers } from '../../utils';

export type UserActionsProps = Omit<
  UserActionTreeProps,
  'currentUserProfile' | 'caseConnectors' | 'userProfiles' | 'casesConfiguration'
>;

export const UserActions = React.memo((props: UserActionsProps) => {
  const {
    data: caseData,
    statusActionButton,
    attachActionButton,
    userActivityQueryParams,
    userActionsStats,
  } = props;
  const { detailName: caseId } = useCaseViewParams();

  const { data: caseConnectors = {} } = useGetCaseConnectors(caseData.id);
  const { data: caseUsers } = useGetCaseUsers(caseData.id);
  const { data: casesConfiguration } = useGetCaseConfiguration();
  const { data: currentUserProfile } = useGetCurrentUserProfile();
  const { userProfiles } = useMemo(
    () => parseCaseUsers({ caseUsers, createdBy: caseData.createdBy }),
    [caseUsers, caseData.createdBy]
  );

  const { lastPage } = useLastPage({ userActivityQueryParams, userActionsStats });

  const {
    infiniteCaseUserActions,
    infiniteLatestAttachments,
    isLoadingInfiniteUserActions,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    remainingActionCount,
    total: totalFilteredUserActions,
  } = useUserActionsPagination({
    userActivityQueryParams,
    caseId: caseData.id,
  });

  const hasActiveFilter = hasActiveUserActivityFilter(userActivityQueryParams);
  const showNoResults =
    hasActiveFilter && !isLoadingInfiniteUserActions && totalFilteredUserActions === 0;

  const { euiTheme } = useEuiTheme();

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
        {showNoResults && (
          <EuiEmptyPrompt
            data-test-subj="user-actions-no-search-results"
            layout="horizontal"
            color="transparent"
            css={{ paddingBlockStart: euiTheme.size.xxl }}
            icon={
              <EuiIllustration
                type={notFound}
                alt=""
                fullWidth={false}
                style={{ maxInlineSize: 160 }}
              />
            }
            title={<h2>{NO_SEARCH_RESULTS_TITLE}</h2>}
            body={<p>{NO_SEARCH_RESULTS_BODY}</p>}
          />
        )}
        {/*
          Rendered regardless of `showNoResults`: when filtered out, the
          infinite/last-page action lists are empty, so this only contributes
          the "add comment" editor entry (when allowed), keeping it usable
          even when the current filters match no user actions.
        */}
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
