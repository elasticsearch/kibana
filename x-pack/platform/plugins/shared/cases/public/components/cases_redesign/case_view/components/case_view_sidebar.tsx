/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiFlexGroup, EuiFlexItem, EuiScreenReaderOnly } from '@elastic/eui';
import React, { useCallback, useMemo } from 'react';
import { isEqual } from 'lodash';
import type { CaseSeverity, CaseUI } from '../../../../../common';
import { useGetCaseConfiguration } from '../../../../containers/configure/use_get_case_configuration';
import { useGetCaseUsers } from '../../../../containers/use_get_case_users';
import { useGetCaseConnectors } from '../../../../containers/use_get_case_connectors';
import { useCasesFeatures } from '../../../../common/use_cases_features';
import { useGetCurrentUserProfile } from '../../../../containers/user_profiles/use_get_current_user_profile';
import { useGetSupportedActionConnectors } from '../../../../containers/configure/use_get_supported_action_connectors';
import type { CaseUICustomField } from '../../../../../common/ui/types';
import type { EditConnectorProps } from '../../../edit_connector';
import { EditConnector } from '../../../edit_connector';
import { EditTags } from '../../../case_view/components/edit_tags';
import { UserList } from '../../../case_view/components/user_list';
import { useOnUpdateField } from '../../../case_view/use_on_update_field';
import { useCasesContext } from '../../../cases_context/use_cases_context';
import * as i18n from '../../../case_view/translations';
import { SeveritySidebarSelector } from '../../../severity/sidebar_selector';
import { AssignUsers } from '../../../case_view/components/assign_users';
import type { Assignee } from '../../../user_profiles/types';
import { EditCategory } from '../../../case_view/components/edit_category';
import { parseCaseUsers } from '../../../utils';
import { CustomFields } from '../../../case_view/components/custom_fields';
import { useReplaceCustomField } from '../../../../containers/use_replace_custom_field';
import { KibanaServices } from '../../../../common/lib/kibana';
import { TemplateFields } from '../../../case_view/components/template_fields';

export const CaseViewSidebar = ({ caseData }: { caseData: CaseUI }) => {
  const { permissions } = useCasesContext();
  const { caseAssignmentAuthorized, pushToServiceAuthorized } = useCasesFeatures();

  const { data: caseConnectors } = useGetCaseConnectors(caseData.id);
  const { data: caseUsers, isLoading: isLoadingCaseUsers } = useGetCaseUsers(caseData.id);
  const { data: casesConfiguration } = useGetCaseConfiguration();
  const { data: currentUserProfile, isFetching: isLoadingCurrentUserProfile } =
    useGetCurrentUserProfile();
  const { isLoading: isLoadingAllAvailableConnectors, data: supportedActionConnectors } =
    useGetSupportedActionConnectors();
  const { isLoading: isUpdatingCustomField, mutate: replaceCustomField } = useReplaceCustomField();

  const isTemplatesV2Enabled = KibanaServices.getConfig()?.templates?.enabled ?? false;

  const { userProfiles, reporterAsArray } = parseCaseUsers({
    caseUsers,
    createdBy: caseData.createdBy,
  });

  const assignees = useMemo(
    () => caseData.assignees.map((assignee) => assignee.uid),
    [caseData.assignees]
  );

  const { onUpdateField, isLoading, loadingKey } = useOnUpdateField({ caseData });

  const isLoadingAssigneeData =
    (isLoading && loadingKey === 'assignees') || isLoadingCaseUsers || isLoadingCurrentUserProfile;

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
      const newUids = newAssignees.map((assignee) => assignee.uid);
      if (!isEqual([...newUids].sort(), [...assignees].sort())) {
        onUpdateField({ key: 'assignees', value: newAssigneeUids });
      }
    },
    [assignees, onUpdateField]
  );

  const onSubmitConnector = useCallback<EditConnectorProps['onSubmit']>(
    (connector) => {
      onUpdateField({ key: 'connector', value: connector });
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

  const showConnectorSidebar =
    pushToServiceAuthorized && caseConnectors && supportedActionConnectors;

  return (
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
            isLoading={isLoadingAllAvailableConnectors || (isLoading && loadingKey === 'connector')}
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
          <TemplateFields caseData={caseData} onUpdateField={onUpdateField} />
        )}
      </EuiFlexGroup>
    </EuiFlexItem>
  );
};
CaseViewSidebar.displayName = 'CaseViewSidebar';
