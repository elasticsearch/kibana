/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useState } from 'react';
import {
  EuiButton,
  EuiDescribedFormGroup,
  EuiFieldNumber,
  EuiFormRow,
  EuiLink,
  EuiLoadingSpinner,
  EuiSpacer,
  EuiSwitch,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import { useMutation, useQuery, useQueryClient } from '@kbn/react-query';
import { ConnectorSelector } from '@kbn/security-solution-connectors';
import { SecuritySolutionPageWrapper } from '../../../../common/components/page_wrapper';
import { HeaderPage } from '../../../../common/components/header_page';
import { SpyRoute } from '../../../../common/utils/route/spy_routes';
import { NotFoundPage } from '../../../../app/404';
import { SecurityPageName } from '../../../../app/types';
import { useKibana } from '../../../../common/lib/kibana';
import { useAIConnectors } from '../../../../common/hooks/use_ai_connectors';
import {
  fetchAlertValidationWorkflowSettings,
  MANAGED_ALERT_VALIDATION_WORKFLOW_FEATURE_FLAG,
  MANAGED_ALERT_VALIDATION_WORKFLOW_FEATURE_FLAG_DEFAULT,
  saveAlertValidationWorkflowSettings,
  type AlertValidationWorkflowSettingsWithConnector,
} from './api';
import { AlertValidationWorkflowRuleAttachmentSection } from './alert_validation_workflow_rule_attachment_section';
import * as translations from './translations';

const ALERT_VALIDATION_WORKFLOW_SETTINGS_QUERY_KEY = [
  'alertValidationWorkflow',
  'alertValidationWorkflowSettings',
] as const;

type AlertValidationWorkflowSettingsError = Error & { body?: { message?: string } };

const areSettingsEqual = (
  left: AlertValidationWorkflowSettingsWithConnector | undefined,
  right: AlertValidationWorkflowSettingsWithConnector | undefined
): boolean => {
  return (
    left?.workflowEnabled === right?.workflowEnabled &&
    left?.autoCloseEnabled === right?.autoCloseEnabled &&
    left?.autoCloseConfidenceScoreMinThreshold === right?.autoCloseConfidenceScoreMinThreshold &&
    left?.autoCloseConfidenceScoreMaxThreshold === right?.autoCloseConfidenceScoreMaxThreshold &&
    left?.connectorId === right?.connectorId &&
    left?.createConversation === right?.createConversation
  );
};

export const AlertValidationWorkflowPage: React.FC = () => {
  const {
    services: { application, http, notifications, featureFlags, settings },
  } = useKibana();
  const queryClient = useQueryClient();
  const isEnabled = featureFlags.getBooleanValue(
    MANAGED_ALERT_VALIDATION_WORKFLOW_FEATURE_FLAG,
    MANAGED_ALERT_VALIDATION_WORKFLOW_FEATURE_FLAG_DEFAULT
  );
  const canEditAdvancedSettings = application.capabilities.advancedSettings?.save;
  const { aiConnectors, isLoading: isLoadingConnectors } = useAIConnectors();
  const { data: savedSettingsResponse, isLoading } = useQuery({
    queryKey: ALERT_VALIDATION_WORKFLOW_SETTINGS_QUERY_KEY,
    enabled: isEnabled,
    queryFn: async () => {
      return fetchAlertValidationWorkflowSettings({ http });
    },
  });
  const savedSettings = savedSettingsResponse?.settings;
  const workflowHref = savedSettingsResponse?.workflowId
    ? application.getUrlForApp('workflows', { path: `/${savedSettingsResponse.workflowId}` })
    : undefined;
  const [pageSettings, setPageSettings] = useState<
    AlertValidationWorkflowSettingsWithConnector | undefined
  >();
  const isDirty = !areSettingsEqual(pageSettings, savedSettings);
  const isThresholdRangeInvalid =
    pageSettings !== undefined &&
    pageSettings.autoCloseConfidenceScoreMinThreshold >=
      pageSettings.autoCloseConfidenceScoreMaxThreshold;
  const thresholdRangeErrorMessage = i18n.translate(
    'xpack.securitySolution.alertValidationWorkflow.thresholdRangeErrorMessage',
    {
      defaultMessage: 'Minimum confidence score must be lower than maximum confidence score.',
    }
  );
  const saveSettingsMutation = useMutation({
    mutationFn: async (settingsToSave: AlertValidationWorkflowSettingsWithConnector) => {
      return saveAlertValidationWorkflowSettings({ http, settings: settingsToSave });
    },
    onSuccess: (response) => {
      setPageSettings(response.settings);
      queryClient.setQueryData(ALERT_VALIDATION_WORKFLOW_SETTINGS_QUERY_KEY, response);
      notifications.toasts.addSuccess(
        i18n.translate('xpack.securitySolution.alertValidationWorkflow.saveSuccessMessage', {
          defaultMessage: 'Alert analysis workflow settings saved',
        })
      );
    },
    onError: (error: AlertValidationWorkflowSettingsError) => {
      notifications.toasts.addDanger({
        title: i18n.translate('xpack.securitySolution.alertValidationWorkflow.saveErrorMessage', {
          defaultMessage: 'Failed to save alert analysis workflow settings',
        }),
        text: error?.body?.message ?? error?.message,
      });
    },
  });

  useEffect(() => {
    if (savedSettings) {
      setPageSettings(savedSettings);
    }
  }, [savedSettings]);

  if (!isEnabled) {
    return <NotFoundPage />;
  }

  return (
    <>
      <SecuritySolutionPageWrapper data-test-subj="alertValidationWorkflowPage">
        <HeaderPage
          title={translations.ALERT_VALIDATION_WORKFLOW_TITLE}
          badgeOptions={{
            beta: true,
            text: translations.TECHNICAL_PREVIEW_BADGE_LABEL,
            tooltip: translations.TECHNICAL_PREVIEW_BADGE_TOOLTIP,
            size: 's',
          }}
          subtitle={
            <FormattedMessage
              id="xpack.securitySolution.alertValidationWorkflow.description"
              defaultMessage="Configure when the managed Security alert analysis workflow automatically closes alerts classified as false positives. {workflowLink}"
              values={{
                workflowLink: workflowHref ? (
                  <EuiLink
                    data-test-subj="alertValidationWorkflowLink"
                    href={workflowHref}
                    target="_blank"
                  >
                    <FormattedMessage
                      id="xpack.securitySolution.alertValidationWorkflow.workflowLinkText"
                      defaultMessage="View workflow"
                    />
                  </EuiLink>
                ) : null,
              }}
            />
          }
        />
        {isLoading || !pageSettings ? (
          <EuiLoadingSpinner data-test-subj="alertValidationWorkflowSettingsLoading" />
        ) : (
          <>
            <EuiDescribedFormGroup
              fullWidth
              title={
                <h4>
                  <FormattedMessage
                    id="xpack.securitySolution.alertValidationWorkflow.workflowEnabledSectionTitle"
                    defaultMessage="Workflow enabled"
                  />
                </h4>
              }
              description={
                <p>
                  <FormattedMessage
                    id="xpack.securitySolution.alertValidationWorkflow.workflowEnabledSectionDescription"
                    defaultMessage="Enable or disable the managed alert analysis workflow."
                  />
                </p>
              }
            >
              <EuiFormRow fullWidth>
                <EuiSwitch
                  data-test-subj="alertValidationWorkflowEnabled"
                  showLabel={false}
                  aria-label={i18n.translate(
                    'xpack.securitySolution.alertValidationWorkflow.workflowEnabledAriaLabel',
                    { defaultMessage: 'Enable alert analysis workflow' }
                  )}
                  label={i18n.translate(
                    'xpack.securitySolution.alertValidationWorkflow.workflowEnabledHiddenLabel',
                    { defaultMessage: 'Enable alert analysis workflow' }
                  )}
                  checked={pageSettings.workflowEnabled ?? true}
                  disabled={!canEditAdvancedSettings}
                  onChange={(event) =>
                    setPageSettings({
                      ...pageSettings,
                      workflowEnabled: event.target.checked,
                    })
                  }
                />
              </EuiFormRow>
            </EuiDescribedFormGroup>
            <EuiDescribedFormGroup
              fullWidth
              title={
                <h4>
                  <FormattedMessage
                    id="xpack.securitySolution.alertValidationWorkflow.connectorSectionTitle"
                    defaultMessage="AI connector"
                  />
                </h4>
              }
              description={
                <p>
                  <FormattedMessage
                    id="xpack.securitySolution.alertValidationWorkflow.connectorSectionDescription"
                    defaultMessage="Select the AI connector used to classify alerts as false positives."
                  />
                </p>
              }
            >
              <EuiFormRow
                fullWidth
                label={i18n.translate(
                  'xpack.securitySolution.alertValidationWorkflow.connectorLabel',
                  { defaultMessage: 'Connector' }
                )}
              >
                <ConnectorSelector
                  data-test-subj="alertValidationWorkflowConnectorSelector"
                  connectors={aiConnectors}
                  selectedId={pageSettings.connectorId}
                  isLoading={isLoadingConnectors}
                  isDisabled={!canEditAdvancedSettings}
                  settings={settings}
                  onChange={(connectorId) =>
                    setPageSettings((prev) => (prev ? { ...prev, connectorId } : prev))
                  }
                />
              </EuiFormRow>
            </EuiDescribedFormGroup>
            <EuiDescribedFormGroup
              fullWidth
              title={
                <h4>
                  <FormattedMessage
                    id="xpack.securitySolution.alertValidationWorkflow.createConversationSectionTitle"
                    defaultMessage="Create conversation"
                  />
                </h4>
              }
              description={
                <p>
                  <FormattedMessage
                    id="xpack.securitySolution.alertValidationWorkflow.createConversationSectionDescription"
                    defaultMessage="When enabled, the AI agent creates a new conversation for each alert analysis. Disable to prevent large numbers of conversations from accumulating."
                  />
                </p>
              }
            >
              <EuiFormRow fullWidth>
                <EuiSwitch
                  data-test-subj="alertValidationWorkflowCreateConversation"
                  showLabel={false}
                  aria-label={i18n.translate(
                    'xpack.securitySolution.alertValidationWorkflow.createConversationAriaLabel',
                    { defaultMessage: 'Create conversation per alert analysis' }
                  )}
                  label={i18n.translate(
                    'xpack.securitySolution.alertValidationWorkflow.createConversationHiddenLabel',
                    { defaultMessage: 'Create conversation per alert analysis' }
                  )}
                  checked={pageSettings.createConversation ?? true}
                  disabled={!canEditAdvancedSettings}
                  onChange={(event) =>
                    setPageSettings({
                      ...pageSettings,
                      createConversation: event.target.checked,
                    })
                  }
                />
              </EuiFormRow>
            </EuiDescribedFormGroup>
            <EuiDescribedFormGroup
              fullWidth
              title={
                <h4>
                  <FormattedMessage
                    id="xpack.securitySolution.alertValidationWorkflow.autoCloseEnabledLabel"
                    defaultMessage="Auto-close alerts classified as false positives"
                  />
                </h4>
              }
              description={
                <p>
                  <FormattedMessage
                    id="xpack.securitySolution.alertValidationWorkflow.autoCloseEnabledDescription"
                    defaultMessage="Automatically closes alerts when the alert analysis workflow classifies them as false positives within the configured confidence range."
                  />
                </p>
              }
            >
              <EuiFormRow fullWidth>
                <EuiSwitch
                  data-test-subj="alertValidationWorkflowAutoCloseEnabled"
                  showLabel={false}
                  aria-label={i18n.translate(
                    'xpack.securitySolution.alertValidationWorkflow.autoCloseEnabledAriaLabel',
                    {
                      defaultMessage: 'Auto-close alerts classified as false positives',
                    }
                  )}
                  label={i18n.translate(
                    'xpack.securitySolution.alertValidationWorkflow.autoCloseEnabledHiddenLabel',
                    {
                      defaultMessage: 'Auto-close alerts classified as false positives',
                    }
                  )}
                  checked={pageSettings.autoCloseEnabled}
                  disabled={!canEditAdvancedSettings}
                  onChange={(event) =>
                    setPageSettings({
                      ...pageSettings,
                      autoCloseEnabled: event.target.checked,
                    })
                  }
                />
              </EuiFormRow>
            </EuiDescribedFormGroup>
            <EuiDescribedFormGroup
              fullWidth
              title={
                <h4>
                  <FormattedMessage
                    id="xpack.securitySolution.alertValidationWorkflow.minThresholdLabel"
                    defaultMessage="Auto-close minimum confidence score"
                  />
                </h4>
              }
              description={
                <p>
                  <FormattedMessage
                    id="xpack.securitySolution.alertValidationWorkflow.minThresholdHelpText"
                    defaultMessage="The lowest false positive confidence score that can automatically close an alert."
                  />
                </p>
              }
            >
              <EuiFormRow fullWidth isInvalid={isThresholdRangeInvalid}>
                <EuiFieldNumber
                  data-test-subj="alertValidationWorkflowMinThreshold"
                  min={0}
                  max={1}
                  step={0.01}
                  value={pageSettings.autoCloseConfidenceScoreMinThreshold}
                  disabled={!canEditAdvancedSettings}
                  isInvalid={isThresholdRangeInvalid}
                  aria-label={i18n.translate(
                    'xpack.securitySolution.alertValidationWorkflow.minThresholdAriaLabel',
                    {
                      defaultMessage: 'Auto-close minimum confidence score',
                    }
                  )}
                  onChange={(event) =>
                    setPageSettings({
                      ...pageSettings,
                      autoCloseConfidenceScoreMinThreshold: event.target.valueAsNumber,
                    })
                  }
                />
              </EuiFormRow>
            </EuiDescribedFormGroup>
            <EuiDescribedFormGroup
              fullWidth
              title={
                <h4>
                  <FormattedMessage
                    id="xpack.securitySolution.alertValidationWorkflow.maxThresholdLabel"
                    defaultMessage="Auto-close maximum confidence score"
                  />
                </h4>
              }
              description={
                <p>
                  <FormattedMessage
                    id="xpack.securitySolution.alertValidationWorkflow.maxThresholdHelpText"
                    defaultMessage="The highest false positive confidence score that can automatically close an alert."
                  />
                </p>
              }
            >
              <EuiFormRow
                fullWidth
                isInvalid={isThresholdRangeInvalid}
                error={isThresholdRangeInvalid ? thresholdRangeErrorMessage : undefined}
              >
                <EuiFieldNumber
                  data-test-subj="alertValidationWorkflowMaxThreshold"
                  min={0}
                  max={1}
                  step={0.01}
                  value={pageSettings.autoCloseConfidenceScoreMaxThreshold}
                  disabled={!canEditAdvancedSettings}
                  isInvalid={isThresholdRangeInvalid}
                  aria-label={i18n.translate(
                    'xpack.securitySolution.alertValidationWorkflow.maxThresholdAriaLabel',
                    {
                      defaultMessage: 'Auto-close maximum confidence score',
                    }
                  )}
                  onChange={(event) =>
                    setPageSettings({
                      ...pageSettings,
                      autoCloseConfidenceScoreMaxThreshold: event.target.valueAsNumber,
                    })
                  }
                />
              </EuiFormRow>
            </EuiDescribedFormGroup>
            <EuiButton
              data-test-subj="alertValidationWorkflowSaveButton"
              fill
              disabled={!canEditAdvancedSettings || !isDirty || isThresholdRangeInvalid}
              isLoading={saveSettingsMutation.isLoading}
              onClick={() => {
                if (pageSettings) {
                  saveSettingsMutation.mutate(pageSettings);
                }
              }}
            >
              <FormattedMessage
                id="xpack.securitySolution.alertValidationWorkflow.saveButtonLabel"
                defaultMessage="Save alert analysis workflow settings"
              />
            </EuiButton>
            <EuiSpacer size="l" />
            <AlertValidationWorkflowRuleAttachmentSection />
          </>
        )}
      </SecuritySolutionPageWrapper>
      <SpyRoute pageName={SecurityPageName.alertValidationWorkflow} />
    </>
  );
};
