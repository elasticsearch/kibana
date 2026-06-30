/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useState } from 'react';
import {
  EuiBetaBadge,
  EuiButton,
  EuiDescribedFormGroup,
  EuiFieldNumber,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiLink,
  EuiLoadingSpinner,
  EuiSpacer,
  EuiSplitPanel,
  EuiSwitch,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import { useMutation, useQuery, useQueryClient } from '@kbn/react-query';
import { useKibana } from '../../hooks/use_kibana';
import {
  fetchAlertValidationWorkflowSettings,
  MANAGED_ALERT_VALIDATION_WORKFLOW_FEATURE_FLAG,
  MANAGED_ALERT_VALIDATION_WORKFLOW_FEATURE_FLAG_DEFAULT,
  saveAlertValidationWorkflowSettings,
  type AlertValidationWorkflowSettings,
} from './api';
import { AlertValidationWorkflowRuleAttachmentSection } from './alert_validation_workflow_rule_attachment_section';

const ALERT_VALIDATION_WORKFLOW_SETTINGS_QUERY_KEY = [
  'genAiSettings',
  'alertValidationWorkflowSettings',
] as const;

const areSettingsEqual = (
  left: AlertValidationWorkflowSettings | undefined,
  right: AlertValidationWorkflowSettings | undefined
): boolean => {
  return (
    left?.autoCloseEnabled === right?.autoCloseEnabled &&
    left?.autoCloseConfidenceScoreMinThreshold === right?.autoCloseConfidenceScoreMinThreshold &&
    left?.autoCloseConfidenceScoreMaxThreshold === right?.autoCloseConfidenceScoreMaxThreshold
  );
};

export const AlertValidationWorkflowSection: React.FC = () => {
  const {
    services: { application, http, notifications, featureFlags },
  } = useKibana();
  const queryClient = useQueryClient();
  const isEnabled = featureFlags.getBooleanValue(
    MANAGED_ALERT_VALIDATION_WORKFLOW_FEATURE_FLAG,
    MANAGED_ALERT_VALIDATION_WORKFLOW_FEATURE_FLAG_DEFAULT
  );
  const canEditAdvancedSettings = application.capabilities.advancedSettings?.save;
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
  const [settings, setSettings] = useState<AlertValidationWorkflowSettings | undefined>();
  const isDirty = !areSettingsEqual(settings, savedSettings);
  const isThresholdRangeInvalid =
    settings !== undefined &&
    settings.autoCloseConfidenceScoreMinThreshold >= settings.autoCloseConfidenceScoreMaxThreshold;
  const thresholdRangeErrorMessage = i18n.translate(
    'xpack.genAiSettings.alertValidationWorkflow.thresholdRangeErrorMessage',
    {
      defaultMessage: 'Minimum confidence score must be lower than maximum confidence score.',
    }
  );
  const saveSettingsMutation = useMutation({
    mutationFn: async (settingsToSave: AlertValidationWorkflowSettings) => {
      return saveAlertValidationWorkflowSettings({ http, settings: settingsToSave });
    },
    onSuccess: (response) => {
      setSettings(response.settings);
      queryClient.setQueryData(ALERT_VALIDATION_WORKFLOW_SETTINGS_QUERY_KEY, response);
      notifications.toasts.addSuccess(
        i18n.translate('xpack.genAiSettings.alertValidationWorkflow.saveSuccessMessage', {
          defaultMessage: 'Alert validation workflow settings saved',
        })
      );
    },
    onError: (error) => {
      const fetchError = error as { body?: { message?: string }; message?: string } | null;
      notifications.toasts.addDanger({
        title: i18n.translate('xpack.genAiSettings.alertValidationWorkflow.saveErrorMessage', {
          defaultMessage: 'Failed to save alert validation workflow settings',
        }),
        text: fetchError?.body?.message ?? fetchError?.message,
      });
    },
  });

  useEffect(() => {
    if (savedSettings) {
      setSettings(savedSettings);
    }
  }, [savedSettings]);

  if (!isEnabled) {
    return null;
  }

  return (
    <>
      <EuiSpacer size="l" />
      <EuiSplitPanel.Outer hasBorder grow={false} data-test-subj="alertValidationWorkflowSection">
        <EuiSplitPanel.Inner color="subdued">
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiTitle size="s">
                <h3 data-test-subj="alertValidationWorkflowSectionTitle">
                  <FormattedMessage
                    id="xpack.genAiSettings.alertValidationWorkflow.title"
                    defaultMessage="Alert validation workflow"
                  />
                </h3>
              </EuiTitle>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiBetaBadge
                alignment="middle"
                data-test-subj="alertValidationWorkflowTechnicalPreviewBadge"
                label={i18n.translate(
                  'xpack.genAiSettings.alertValidationWorkflow.technicalPreviewBadgeLabel',
                  {
                    defaultMessage: 'Technical preview',
                  }
                )}
                size="s"
                tooltipContent={i18n.translate(
                  'xpack.genAiSettings.alertValidationWorkflow.technicalPreviewBadgeTooltip',
                  {
                    defaultMessage:
                      'This functionality is in technical preview. It may change or be removed in a future release.',
                  }
                )}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiSplitPanel.Inner>
        <EuiSplitPanel.Inner>
          <EuiText size="s">
            <p>
              <FormattedMessage
                id="xpack.genAiSettings.alertValidationWorkflow.description"
                defaultMessage="Configure when the managed Security alert validation workflow automatically closes alerts classified as false positives. {workflowLink}"
                values={{
                  workflowLink: workflowHref ? (
                    <EuiLink
                      data-test-subj="alertValidationWorkflowLink"
                      href={workflowHref}
                      target="_blank"
                    >
                      <FormattedMessage
                        id="xpack.genAiSettings.alertValidationWorkflow.workflowLinkText"
                        defaultMessage="View workflow"
                      />
                    </EuiLink>
                  ) : null,
                }}
              />
            </p>
          </EuiText>
          <EuiSpacer size="m" />
          {isLoading || !settings ? (
            <EuiLoadingSpinner data-test-subj="alertValidationWorkflowSettingsLoading" />
          ) : (
            <>
              <EuiDescribedFormGroup
                fullWidth
                title={
                  <h4>
                    <FormattedMessage
                      id="xpack.genAiSettings.alertValidationWorkflow.autoCloseEnabledLabel"
                      defaultMessage="Auto-close alerts validated as false positives"
                    />
                  </h4>
                }
                description={
                  <p>
                    <FormattedMessage
                      id="xpack.genAiSettings.alertValidationWorkflow.autoCloseEnabledDescription"
                      defaultMessage="Automatically closes alerts when the alert validation workflow classifies them as false positives within the configured confidence range."
                    />
                  </p>
                }
              >
                <EuiFormRow fullWidth>
                  <EuiSwitch
                    data-test-subj="alertValidationWorkflowAutoCloseEnabled"
                    showLabel={false}
                    aria-label={i18n.translate(
                      'xpack.genAiSettings.alertValidationWorkflow.autoCloseEnabledAriaLabel',
                      {
                        defaultMessage: 'Auto-close alerts validated as false positives',
                      }
                    )}
                    label={i18n.translate(
                      'xpack.genAiSettings.alertValidationWorkflow.autoCloseEnabledHiddenLabel',
                      {
                        defaultMessage: 'Auto-close alerts validated as false positives',
                      }
                    )}
                    checked={settings.autoCloseEnabled}
                    disabled={!canEditAdvancedSettings}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
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
                      id="xpack.genAiSettings.alertValidationWorkflow.minThresholdLabel"
                      defaultMessage="Auto-close minimum confidence score"
                    />
                  </h4>
                }
                description={
                  <p>
                    <FormattedMessage
                      id="xpack.genAiSettings.alertValidationWorkflow.minThresholdHelpText"
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
                    value={settings.autoCloseConfidenceScoreMinThreshold}
                    disabled={!canEditAdvancedSettings}
                    isInvalid={isThresholdRangeInvalid}
                    aria-label={i18n.translate(
                      'xpack.genAiSettings.alertValidationWorkflow.minThresholdAriaLabel',
                      {
                        defaultMessage: 'Auto-close minimum confidence score',
                      }
                    )}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
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
                      id="xpack.genAiSettings.alertValidationWorkflow.maxThresholdLabel"
                      defaultMessage="Auto-close maximum confidence score"
                    />
                  </h4>
                }
                description={
                  <p>
                    <FormattedMessage
                      id="xpack.genAiSettings.alertValidationWorkflow.maxThresholdHelpText"
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
                    value={settings.autoCloseConfidenceScoreMaxThreshold}
                    disabled={!canEditAdvancedSettings}
                    isInvalid={isThresholdRangeInvalid}
                    aria-label={i18n.translate(
                      'xpack.genAiSettings.alertValidationWorkflow.maxThresholdAriaLabel',
                      {
                        defaultMessage: 'Auto-close maximum confidence score',
                      }
                    )}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
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
                  if (settings) {
                    saveSettingsMutation.mutate(settings);
                  }
                }}
              >
                <FormattedMessage
                  id="xpack.genAiSettings.alertValidationWorkflow.saveButtonLabel"
                  defaultMessage="Save alert validation workflow settings"
                />
              </EuiButton>
              <EuiSpacer size="l" />
              <AlertValidationWorkflowRuleAttachmentSection />
            </>
          )}
        </EuiSplitPanel.Inner>
      </EuiSplitPanel.Outer>
    </>
  );
};
