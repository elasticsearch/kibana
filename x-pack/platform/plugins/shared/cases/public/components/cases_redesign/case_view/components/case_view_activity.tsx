/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiFlexGroup, EuiFlexItem, EuiLoadingSpinner, EuiSpacer } from '@elastic/eui';
import React, { useCallback, useState } from 'react';
import { CaseStatuses } from '@kbn/cases-components';
import type { CaseUI } from '../../../../../common';
import { useCasesLocalStorage } from '../../../../common/use_cases_local_storage';
import { useGetCaseConfiguration } from '../../../../containers/configure/use_get_case_configuration';
import { useGetCaseUsers } from '../../../../containers/use_get_case_users';
import { useGetCaseConnectors } from '../../../../containers/use_get_case_connectors';
import { useGetCurrentUserProfile } from '../../../../containers/user_profiles/use_get_current_user_profile';
import { StatusActionButton } from '../../../status/button';
import { CaseViewAttachButton } from '../../../case_view/components/case_view_attach_button';
import { UserActions } from '../../user_actions';
import { useOnUpdateField } from '../../../case_view/use_on_update_field';
import { useCasesContext } from '../../../cases_context/use_cases_context';
import { useGetCaseUserActionsStats } from '../../../../containers/use_get_case_user_actions_stats';
import type {
  UserActivityParams,
  UserActivitySortOrder,
} from '../../../user_actions_activity_bar/types';
import { ActivityFilterBar } from './activity_filter_bar';
import { parseCaseUsers } from '../../../utils';
import { useStatusAction } from '../../../actions/status/use_status_action';
import { useRefreshCaseViewPage } from '../../../case_view/use_on_refresh_case_view_page';
import { LOCAL_STORAGE_KEYS } from '../../../../../common/constants';
import { Description } from '../../description';

export const CaseViewActivity = ({ caseData }: { caseData: CaseUI }) => {
  const [sortOrder, setSortOrder] = useCasesLocalStorage<UserActivitySortOrder>(
    LOCAL_STORAGE_KEYS.userActivitySortOrder,
    'asc'
  );

  const [userActivityQueryParams, setUserActivityQueryParams] = useState<UserActivityParams>({
    type: 'all',
    sortOrder,
    page: 1,
    perPage: 10,
  });

  const { permissions } = useCasesContext();

  const { data: caseConnectors, isLoading: isLoadingCaseConnectors } = useGetCaseConnectors(
    caseData.id
  );

  const { data: userActionsStats, isLoading: isLoadingUserActionsStats } =
    useGetCaseUserActionsStats(caseData.id);

  const { data: caseUsers, isLoading: isLoadingCaseUsers } = useGetCaseUsers(caseData.id);

  const { data: casesConfiguration } = useGetCaseConfiguration();

  const { userProfiles } = parseCaseUsers({
    caseUsers,
    createdBy: caseData.createdBy,
  });

  const { data: currentUserProfile } = useGetCurrentUserProfile();

  const { onUpdateField, isLoading, loadingKey } = useOnUpdateField({
    caseData,
  });
  const refreshCaseViewPage = useRefreshCaseViewPage();
  const statusAction = useStatusAction({
    isDisabled: false,
    onAction: () => {},
    onActionSuccess: refreshCaseViewPage,
    selectedStatus: caseData.status,
  });

  const changeStatus = useCallback(
    (status: CaseStatuses, closeReason?: string) => {
      if (status !== CaseStatuses.closed) {
        onUpdateField({
          key: 'status',
          value: status,
        });
      } else {
        statusAction.handleUpdateCaseStatus([caseData], status, closeReason);
      }
    },
    [caseData, onUpdateField, statusAction]
  );

  const handleUserActionsActivityChanged = useCallback(
    (params: UserActivityParams) => {
      setSortOrder(params.sortOrder);
      setUserActivityQueryParams((oldParams) => ({
        ...oldParams,
        page: 1,
        type: params.type,
        sortOrder: params.sortOrder,
      }));
    },
    [setSortOrder, setUserActivityQueryParams]
  );

  const showUserActions =
    !isLoadingUserActionsStats &&
    !isLoadingCaseConnectors &&
    !isLoadingCaseUsers &&
    caseConnectors &&
    caseUsers &&
    userActionsStats;

  const isLoadingDescription = isLoading && loadingKey === 'description';

  return (
    <>
      <EuiSpacer size="s" />
      <EuiFlexItem grow={6}>
        <ActivityFilterBar
          params={userActivityQueryParams}
          userActionsStats={userActionsStats}
          isLoading={isLoadingUserActionsStats}
          onUserActionsActivityChanged={handleUserActionsActivityChanged}
        />
        <Description
          isLoadingDescription={isLoadingDescription}
          caseData={caseData}
          onUpdateField={onUpdateField}
        />
      </EuiFlexItem>
      <EuiSpacer size="l" />
      {(isLoadingUserActionsStats || isLoadingCaseConnectors || isLoadingCaseUsers) && (
        <EuiLoadingSpinner data-test-subj="case-view-loading-content" size="l" />
      )}
      {showUserActions ? (
        <EuiFlexGroup direction="column" responsive={false} data-test-subj="case-view-activity">
          <EuiFlexItem>
            <UserActions
              userProfiles={userProfiles}
              currentUserProfile={currentUserProfile}
              caseConnectors={caseConnectors}
              data={caseData}
              casesConfiguration={casesConfiguration}
              onUpdateField={onUpdateField}
              statusActionButton={
                permissions.update ? (
                  <StatusActionButton
                    status={caseData.status}
                    totalAlerts={caseData.totalAlerts}
                    syncAlertsEnabled={caseData.settings.syncAlerts}
                    onStatusChanged={changeStatus}
                    isLoading={
                      (isLoading && loadingKey === 'status') || statusAction.isUpdatingStatus
                    }
                  />
                ) : null
              }
              attachActionButton={<CaseViewAttachButton caseData={caseData} />}
              userActivityQueryParams={userActivityQueryParams}
              userActionsStats={userActionsStats}
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      ) : null}
    </>
  );
};
CaseViewActivity.displayName = 'CaseViewActivity';
