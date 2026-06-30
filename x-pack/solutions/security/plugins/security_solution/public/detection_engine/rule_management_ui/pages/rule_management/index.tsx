/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiButtonEmpty, EuiFlexGroup, EuiFlexItem, EuiSpacer, EuiToolTip } from '@elastic/eui';
import { MaintenanceWindowCallout } from '@kbn/alerts-ui-shared';
import { DEFAULT_APP_CATEGORIES } from '@kbn/core-application-common';
import { APP_UI_ID } from '../../../../../common/constants';
import { SecurityPageName } from '../../../../app/types';
import { SecuritySolutionLinkButton } from '../../../../common/components/links';
import { getDetectionEngineUrl } from '../../../../common/components/link_to/redirect_to_detection_engine';
import { SecuritySolutionPageWrapper } from '../../../../common/components/page_wrapper';
import { useBoolState } from '../../../../common/hooks/use_bool_state';
import { useKibana } from '../../../../common/lib/kibana';
import { SpyRoute } from '../../../../common/utils/route/spy_routes';
import { MissingDetectionsPrivilegesCallOut } from '../../../../detections/components/callouts/missing_detections_privileges_callout';
import { MlJobCompatibilityCallout } from '../../components/ml_job_compatibility_callout';
import { NeedAdminForUpdateRulesCallOut } from '../../../rule_management/components/callouts/need_admin_for_update_rules_callout';
import { AddElasticRulesButton } from '../../components/pre_packaged_rules/add_elastic_rules_button';
import { ValueListsFlyout } from '../../components/value_lists_management_flyout';
import { useUserData } from '../../../../detections/components/user_info';
import { useListsConfig } from '../../../../detections/containers/detection_engine/lists/use_lists_config';
import { redirectToDetections } from '../../../common/helpers';
import * as i18n from '../../../common/translations';
import { RulesTableContextProvider } from '../../components/rules_table/rules_table/rules_table_context';
import { GroupedRulesSections } from '../../components/grouped_rules_sections/grouped_rules_sections';
import { HeaderPage } from '../../../../common/components/header_page';
import { RuleUpdateCallouts } from '../../components/rule_update_callouts/rule_update_callouts';
import { useDeprecatedRulesTableCallout } from '../../../rule_management/components/rule_deprecation';
import { RuleImportModal } from '../../components/rule_import_modal/rule_import_modal';
import { useIsExperimentalFeatureEnabled } from '../../../../common/hooks/use_experimental_features';
import { CreateRuleMenu } from '../../components/create_rule_menu';
import { RuleSettingsModal } from '../../../rule_gaps/components/rule_settings_modal';
import {
  GapAutoFillSchedulerProvider,
  useGapAutoFillSchedulerContext,
} from '../../../rule_gaps/context/gap_auto_fill_scheduler_context';
import { useUserPrivileges } from '../../../../common/components/user_privileges';
import { useAgentBuilderAvailability } from '../../../../agent_builder/hooks/use_agent_builder_availability';
import { useEsqlAvailability } from '../../../../common/hooks/esql/use_esql_availability';
import { CpsMlRuleCallout } from '../../components/cps_ml_rule_callout/callout';

const RulesPageContent = () => {
  const [isImportModalVisible, showImportModal, hideImportModal] = useBoolState();
  const [isValueListFlyoutVisible, showValueListFlyout, hideValueListFlyout] = useBoolState();
  const [isRuleSettingsModalOpen, openRuleSettingsModal, closeRuleSettingsModal] = useBoolState();
  const kibanaServices = useKibana().services;
  const { application } = kibanaServices;
  const { navigateToApp } = application;

  const [{ loading: userInfoLoading, isSignalIndexExists, isAuthenticated, hasEncryptionKey }] =
    useUserData();
  const { edit: canEditRules, read: canReadRules } = useUserPrivileges().rulesPrivileges.rules;
  const canEditRulesManagementSettings =
    useUserPrivileges().rulesPrivileges.rulesManagementSettings?.edit ?? false;
  const {
    loading: listsConfigLoading,
    canWriteIndex: canWriteListsIndex,
    needsConfiguration: needsListsConfiguration,
    needsIndex: needsListsIndex,
  } = useListsConfig();
  const loading = userInfoLoading || listsConfigLoading;
  const { canEditGapAutoFill } = useGapAutoFillSchedulerContext();
  const gapReasonDetectionEnabled = useIsExperimentalFeatureEnabled('gapReasonDetectionEnabled');
  const canSaveAdvancedSettings = application.capabilities.advancedSettings?.save === true;
  const canAccessRuleSettings =
    canEditRulesManagementSettings &&
    (canEditGapAutoFill || (gapReasonDetectionEnabled && canSaveAdvancedSettings));

  const aiRuleCreationEnabled = useIsExperimentalFeatureEnabled('aiRuleCreationEnabled');
  const { isAgentBuilderEnabled } = useAgentBuilderAvailability();
  const { isEsqlRuleTypeEnabled } = useEsqlAvailability();
  const isAiRuleCreationAvailable =
    aiRuleCreationEnabled && isAgentBuilderEnabled && isEsqlRuleTypeEnabled;
  const isAlertingV2Enabled = useIsExperimentalFeatureEnabled('alertingV2RuleCreationEnabled');
  const deprecatedRulesCallout = useDeprecatedRulesTableCallout();

  if (
    redirectToDetections(
      isSignalIndexExists,
      isAuthenticated,
      hasEncryptionKey,
      needsListsConfiguration
    )
  ) {
    navigateToApp(APP_UI_ID, {
      deepLinkId: SecurityPageName.alerts,
      path: getDetectionEngineUrl(),
    });
    return null;
  }
  const isImportValueListDisabled =
    needsListsIndex || !canWriteListsIndex || !canEditRules || loading;

  return (
    <>
      <NeedAdminForUpdateRulesCallOut />
      <MissingDetectionsPrivilegesCallOut />
      <CpsMlRuleCallout />
      <MlJobCompatibilityCallout />
      <ValueListsFlyout showFlyout={isValueListFlyoutVisible} onClose={hideValueListFlyout} />
      <RuleImportModal
        isImportModalVisible={isImportModalVisible}
        hideImportModal={hideImportModal}
      />

      <RulesTableContextProvider>
        <SecuritySolutionPageWrapper>
          <HeaderPage title={i18n.PAGE_TITLE}>
            <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false} wrap={true}>
              {canAccessRuleSettings && (
                <EuiButtonEmpty
                  data-test-subj="rules-settings-button"
                  iconType="gear"
                  onClick={openRuleSettingsModal}
                >
                  {i18n.RULE_SETTINGS_TITLE}
                </EuiButtonEmpty>
              )}
              <EuiFlexItem grow={false}>
                <AddElasticRulesButton isDisabled={!canReadRules || loading} />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiToolTip position="top" content={i18n.UPLOAD_VALUE_LISTS_TOOLTIP}>
                  <EuiButtonEmpty
                    data-test-subj="open-value-lists-modal-button"
                    iconType="download"
                    isDisabled={isImportValueListDisabled}
                    onClick={showValueListFlyout}
                    aria-label={`${i18n.IMPORT_VALUE_LISTS}: ${i18n.UPLOAD_VALUE_LISTS_TOOLTIP}`}
                  >
                    {i18n.IMPORT_VALUE_LISTS}
                  </EuiButtonEmpty>
                </EuiToolTip>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty
                  data-test-subj="rules-import-modal-button"
                  iconType="download"
                  isDisabled={!canEditRules || loading}
                  onClick={showImportModal}
                >
                  {i18n.IMPORT_RULE}
                </EuiButtonEmpty>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                {isAiRuleCreationAvailable ? (
                  <CreateRuleMenu loading={loading} isDisabled={!canEditRules || loading} />
                ) : (
                  <SecuritySolutionLinkButton
                    data-test-subj="create-new-rule"
                    fill
                    iconType="plusCircle"
                    isDisabled={!canEditRules || loading}
                    deepLinkId={SecurityPageName.rulesCreate}
                  >
                    {i18n.ADD_NEW_RULE}
                  </SecuritySolutionLinkButton>
                )}
              </EuiFlexItem>
            </EuiFlexGroup>
          </HeaderPage>
          {isRuleSettingsModalOpen && canAccessRuleSettings && (
            <RuleSettingsModal isOpen={isRuleSettingsModalOpen} onClose={closeRuleSettingsModal} />
          )}
          <RuleUpdateCallouts shouldShowUpdateRulesCallout={canEditRules} />
          <EuiSpacer size="s" />
          {deprecatedRulesCallout}
          <MaintenanceWindowCallout
            kibanaServices={kibanaServices}
            categories={[DEFAULT_APP_CATEGORIES.security.id]}
          />
          <GroupedRulesSections isAlertingV2Enabled={isAlertingV2Enabled} />
        </SecuritySolutionPageWrapper>
      </RulesTableContextProvider>

      <SpyRoute pageName={SecurityPageName.rules} />
    </>
  );
};

const RulesPageComponent = () => (
  <GapAutoFillSchedulerProvider>
    <RulesPageContent />
  </GapAutoFillSchedulerProvider>
);

export const RulesPage = React.memo(RulesPageComponent);
