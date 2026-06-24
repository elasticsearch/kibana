/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable complexity */

import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiSpacer,
  EuiScreenReaderOnly,
} from '@elastic/eui';
import { css } from '@emotion/react';
import React, { useCallback, useMemo, useState } from 'react';
import { isEqual } from 'lodash';
import { CaseStatuses } from '@kbn/cases-components';
import type { CaseSeverity, CaseUI } from '../../../../common';
import { useCasesLocalStorage } from '../../../common/use_cases_local_storage';
import { useGetCaseConfiguration } from '../../../containers/configure/use_get_case_configuration';
import { useGetCaseUsers } from '../../../containers/use_get_case_users';
import { useGetCaseConnectors } from '../../../containers/use_get_case_connectors';
import { useCasesFeatures } from '../../../common/use_cases_features';
import { useGetCurrentUserProfile } from '../../../containers/user_profiles/use_get_current_user_profile';
import { useGetSupportedActionConnectors } from '../../../containers/configure/use_get_supported_action_connectors';
import type { CaseUICustomField } from '../../../../common/ui/types';
import type { EditConnectorProps } from '../../edit_connector';
import { EditConnector } from '../../edit_connector';
import { StatusActionButton } from '../../status/button';
import { CaseViewAttachButton } from './case_view_attach_button';
import { EditTags } from './edit_tags';
import { UserActions } from '../../user_actions';
import { UserList } from './user_list';
import { useOnUpdateField } from '../use_on_update_field';
import { useCasesContext } from '../../cases_context/use_cases_context';
import * as i18n from '../translations';
import { SeveritySidebarSelector } from '../../severity/sidebar_selector';
import { useGetCaseUserActionsStats } from '../../../containers/use_get_case_user_actions_stats';
import { AssignUsers } from './assign_users';
import { UserActionsActivityBar } from '../../user_actions_activity_bar';
import type { Assignee } from '../../user_profiles/types';
import type {
  UserActivityParams,
  UserActivitySortOrder,
} from '../../user_actions_activity_bar/types';
import { CASE_VIEW_PAGE_TABS } from '../../../../common/types';
import { CaseViewTabs } from '../case_view_tabs';
import { Description } from '../../description';
import { EditCategory } from './edit_category';
import { parseCaseUsers } from '../../utils';
import { CustomFields } from './custom_fields';
import { useReplaceCustomField } from '../../../containers/use_replace_custom_field';
import { KibanaServices } from '../../../common/lib/kibana';
import { TemplateFields } from './template_fields';
import { GlobalCaseFields } from './global_case_fields';
import { useStatusAction } from '../../actions/status/use_status_action';
import { useRefreshCaseViewPage } from '../use_on_refresh_case_view_page';

const LOCALSTORAGE_SORT_ORDER_KEY = 'cases.userActivity.sortOrder';

export const CaseViewActivity = ({
  caseData,
  searchTerm,
}: {
  caseData: CaseUI;
  searchTerm?: string;
}) => {
  const [sortOrder, setSortOrder] = useCasesLocalStorage<UserActivitySortOrder>(
    LOCALSTORAGE_SORT_ORDER_KEY,
    'asc'
  );

  const [userActivityQueryParams, setUserActivityQueryParams] = useState<UserActivityParams>({
    type: 'all',
    sortOrder,
    page: 1,
    perPage: 10,
  });

  const { permissions } = useCasesContext();

  const { caseAssignmentAuthorized, pushToServiceAuthorized } = useCasesFeatures();

  const { data: caseConnectors, isLoading: isLoadingCaseConnectors } = useGetCaseConnectors(
    caseData.id
  );

  const { data: userActionsStats, isLoading: isLoadingUserActionsStats } =
    useGetCaseUserActionsStats(caseData.id);

  const { data: caseUsers, isLoading: isLoadingCaseUsers } = useGetCaseUsers(caseData.id);

  const { data: casesConfiguration } = useGetCaseConfiguration();

  const isTemplatesV2Enabled = KibanaServices.getConfig()?.templates?.enabled ?? false;

  const { userProfiles, reporterAsArray } = parseCaseUsers({
    caseUsers,
    createdBy: caseData.createdBy,
  });

  const assignees = useMemo(
    () => caseData.assignees.map((assignee) => assignee.uid),
    [caseData.assignees]
  );

  const { data: currentUserProfile, isFetching: isLoadingCurrentUserProfile } =
    useGetCurrentUserProfile();

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

  const { isLoading: isUpdatingCustomField, mutate: replaceCustomField } = useReplaceCustomField();

  const isLoadingAssigneeData =
    (isLoading && loadingKey === 'assignees') || isLoadingCaseUsers || isLoadingCurrentUserProfile;

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

  const onSubmitTags = useCallback(
    (newTags: string[]) => onUpdateField({ key: 'tags', value: newTags }),
    [onUpdateField]
  );

  const onSubmitCategory = useCallback(
    (newCategory: string | null) => onUpdateField({ key: 'category', value: newCategory }),
    [onUpdateField]
  );

  const onUpdateSeverity = useCallback(
    (newSeverity: CaseSeverity) => onUpdateField({ key: 'severity', value: newSeverity }),
    [onUpdateField]
  );

  const onUpdateAssignees = useCallback(
    (newAssignees: Assignee[]) => {
      const newAssigneeUids = newAssignees.map((assignee) => ({ uid: assignee.uid }));
      if (!isEqual(newAssigneeUids.sort(), assignees.sort())) {
        onUpdateField({ key: 'assignees', value: newAssigneeUids });
      }
    },
    [assignees, onUpdateField]
  );

  const { isLoading: isLoadingAllAvailableConnectors, data: supportedActionConnectors } =
    useGetSupportedActionConnectors();

  const onSubmitConnector = useCallback<EditConnectorProps['onSubmit']>(
    (connector) => {
      onUpdateField({
        key: 'connector',
        value: connector,
      });
    },
    [onUpdateField]
  );

  const onSubmitCustomField = useCallback(
    (customField: CaseUICustomField) => {
      replaceCustomField({
        caseId: caseData.id,
        customFieldId: customField.key,
        customFieldValue: customField.value,
        caseVersion: caseData.version,
        caseData,
      });
    },
    [replaceCustomField, caseData]
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

  const showConnectorSidebar =
    pushToServiceAuthorized && caseConnectors && supportedActionConnectors;

  const isLoadingDescription = isLoading && loadingKey === 'description';

  return (
    <>
      <EuiFlexItem
        grow={6}
        css={css`
          max-width: 75%;
        `}
      >
        <CaseViewTabs
          caseData={caseData}
          activeTab={CASE_VIEW_PAGE_TABS.ACTIVITY}
          searchTerm={searchTerm}
        />
        <EuiSpacer size="l" />
        <Description
          isLoadingDescription={isLoadingDescription}
          caseData={caseData}
          onUpdateField={onUpdateField}
        />
        <EuiSpacer size="l" />
        <EuiFlexItem grow={false}>
          <UserActionsActivityBar
            onUserActionsActivityChanged={handleUserActionsActivityChanged}
            params={userActivityQueryParams}
            userActionsStats={userActionsStats}
            isLoading={isLoadingUserActionsStats}
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
                // Permission gating lives inside `CaseViewAttachButton`.
                attachActionButton={<CaseViewAttachButton caseData={caseData} />}
                userActivityQueryParams={userActivityQueryParams}
                userActionsStats={userActionsStats}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        ) : null}
      </EuiFlexItem>
      <EuiFlexItem grow={2} data-test-subj="case-view-page-sidebar">
        <EuiScreenReaderOnly>
          <h2>{i18n.CASE_SETTINGS}</h2>
        </EuiScreenReaderOnly>
        <EuiFlexGroup direction="column" responsive={false} gutterSize="xl">
          {caseAssignmentAuthorized ? (
            <>
              <AssignUsers
                caseAssignees={caseData.assignees}
                currentUserProfile={currentUserProfile}
                onAssigneesChanged={onUpdateAssignees}
                isLoading={isLoadingAssigneeData}
                userProfiles={userProfiles ?? new Map()}
              />
            </>
          ) : null}
          <SeveritySidebarSelector
            isDisabled={!permissions.update}
            isLoading={isLoading && loadingKey === 'severity'}
            selectedSeverity={caseData.severity}
            onSeverityChange={onUpdateSeverity}
          />
          <UserList
            dataTestSubj="case-view-user-list-reporter"
            theCase={caseData}
            headline={i18n.REPORTER}
            users={reporterAsArray}
            userProfiles={userProfiles}
          />
          {caseUsers != null ? (
            <UserList
              dataTestSubj="case-view-user-list-participants"
              theCase={caseData}
              headline={i18n.PARTICIPANTS}
              loading={isLoadingCaseUsers}
              users={[...caseUsers.participants, ...caseUsers.assignees]}
              userProfiles={userProfiles}
            />
          ) : null}

          <EditTags
            tags={caseData.tags}
            onSubmit={onSubmitTags}
            isLoading={isLoading && loadingKey === 'tags'}
          />
          <EditCategory
            category={caseData.category}
            onSubmit={onSubmitCategory}
            isLoading={isLoading && loadingKey === 'category'}
          />
          {showConnectorSidebar ? (
            <EditConnector
              caseData={caseData}
              caseConnectors={caseConnectors}
              supportedActionConnectors={supportedActionConnectors}
              isLoading={
                isLoadingAllAvailableConnectors || (isLoading && loadingKey === 'connector')
              }
              onSubmit={onSubmitConnector}
              key={caseData.connector.id}
            />
          ) : null}
          <CustomFields
            isLoading={(isLoading && loadingKey === 'customFields') || isUpdatingCustomField}
            customFields={caseData.customFields}
            customFieldsConfiguration={casesConfiguration.customFields}
            onSubmit={onSubmitCustomField}
          />
          {isTemplatesV2Enabled && (
            <EuiFlexItem grow={false}>
              <TemplateFields caseData={caseData} onUpdateField={onUpdateField} />
              <GlobalCaseFields caseData={caseData} onUpdateField={onUpdateField} />
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      </EuiFlexItem>
    </>
  );
};
CaseViewActivity.displayName = 'CaseViewActivity';
