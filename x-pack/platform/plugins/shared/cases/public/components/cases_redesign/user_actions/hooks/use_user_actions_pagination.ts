/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';

import { useInfiniteFindCaseUserActions } from '../../../../containers/use_infinite_find_case_user_actions';
import type { AttachmentUIV2, UserActionUI } from '../../../../containers/types';
import type { UserActivityParams } from '../../../user_actions_activity_bar/types';

interface UserActionsPagination {
  userActivityQueryParams: UserActivityParams;
  caseId: string;
}

export const useUserActionsPagination = ({
  userActivityQueryParams,
  caseId,
}: UserActionsPagination) => {
  const {
    data: caseInfiniteUserActionsData,
    isLoading: isLoadingInfiniteUserActions,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteFindCaseUserActions(caseId, userActivityQueryParams, true);

  const infiniteCaseUserActions = useMemo<{
    userActions: UserActionUI[];
    latestAttachments: AttachmentUIV2[];
  }>(() => {
    if (!caseInfiniteUserActionsData?.pages?.length || isLoadingInfiniteUserActions) {
      return { userActions: [], latestAttachments: [] };
    }

    const userActionsData: UserActionUI[] = [];
    const latestAttachments: AttachmentUIV2[] = [];

    caseInfiniteUserActionsData.pages.forEach((page) => userActionsData.push(...page.userActions));
    caseInfiniteUserActionsData.pages.forEach((page) =>
      latestAttachments.push(...page.latestAttachments)
    );

    return { userActions: userActionsData, latestAttachments };
  }, [caseInfiniteUserActionsData, isLoadingInfiniteUserActions]);

  const remainingActionCount = useMemo(() => {
    if (!caseInfiniteUserActionsData?.pages?.length) {
      return 0;
    }

    const lastPageData =
      caseInfiniteUserActionsData.pages[caseInfiniteUserActionsData.pages.length - 1];
    const loadedCount = caseInfiniteUserActionsData.pages.reduce(
      (sum, page) => sum + page.userActions.length,
      0
    );

    return Math.max(lastPageData.total - loadedCount, 0);
  }, [caseInfiniteUserActionsData]);

  return {
    isLoadingInfiniteUserActions,
    infiniteCaseUserActions: infiniteCaseUserActions.userActions,
    infiniteLatestAttachments: infiniteCaseUserActions.latestAttachments,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    remainingActionCount,
  };
};
