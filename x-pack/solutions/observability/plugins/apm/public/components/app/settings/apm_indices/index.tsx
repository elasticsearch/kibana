/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiForm,
  EuiFormRow,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import React, { useEffect, useState, useMemo } from 'react';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { type APMIndices, validateApmIndices } from '@kbn/apm-sources-access-plugin/public';
import { useApmPluginContext } from '../../../../context/apm_plugin/use_apm_plugin_context';
import { useFetcher } from '../../../../hooks/use_fetcher';
import type { ApmPluginStartDeps } from '../../../../plugin';

const APM_INDEX_LABELS: ReadonlyArray<{ configurationName: keyof APMIndices; label: string }> = [
  {
    configurationName: 'error',
    label: i18n.translate('xpack.apm.settings.apmIndices.errorIndicesLabel', {
      defaultMessage: 'Error Indices',
    }),
  },
  {
    configurationName: 'onboarding',
    label: i18n.translate('xpack.apm.settings.apmIndices.onboardingIndicesLabel', {
      defaultMessage: 'Onboarding Indices',
    }),
  },
  {
    configurationName: 'span',
    label: i18n.translate('xpack.apm.settings.apmIndices.spanIndicesLabel', {
      defaultMessage: 'Span Indices',
    }),
  },
  {
    configurationName: 'transaction',
    label: i18n.translate('xpack.apm.settings.apmIndices.transactionIndicesLabel', {
      defaultMessage: 'Transaction Indices',
    }),
  },
  {
    configurationName: 'metric',
    label: i18n.translate('xpack.apm.settings.apmIndices.metricsIndicesLabel', {
      defaultMessage: 'Metrics Indices',
    }),
  },
];

// avoid infinite loop by initializing the state outside the component
const INITIAL_STATE = { apmIndexSettings: [] };

export function ApmIndices() {
  const { core } = useApmPluginContext();
  const { services } = useKibana<ApmPluginStartDeps>();

  const { notifications, application } = core;

  const canSave =
    application.capabilities.apm['settings:save'] &&
    application.capabilities.savedObjectsManagement.edit;

  const [apmIndices, setApmIndices] = useState<Partial<Record<keyof APMIndices, string>>>({});
  const [isSaving, setIsSaving] = useState(false);

  const { data = INITIAL_STATE, refetch } = useFetcher(
    (_, signal) => services.apmSourcesAccess.getApmIndexSettings({ signal }),
    [services.apmSourcesAccess]
  );

  const { data: space } = useFetcher(() => {
    return services.spaces?.getActiveSpace();
  }, [services.spaces]);

  useEffect(() => {
    setApmIndices(
      data.apmIndexSettings.reduce(
        (acc, { configurationName, savedValue }) => ({
          ...acc,
          [configurationName]: savedValue,
        }),
        {} as APMIndices
      )
    );
  }, [data]);

  const validationErrors = useMemo(() => validateApmIndices(apmIndices), [apmIndices]);
  const hasInvalidChanges = Object.keys(validationErrors).length > 0;

  const handleApplyChangesEvent = async (
    event: React.FormEvent<HTMLFormElement> | React.MouseEvent<HTMLButtonElement>
  ) => {
    event.preventDefault();
    if (hasInvalidChanges) {
      return;
    }
    setIsSaving(true);
    try {
      await services.apmSourcesAccess.saveApmIndices({ body: apmIndices });
      notifications.toasts.addSuccess({
        title: i18n.translate('xpack.apm.settings.apmIndices.applyChanges.succeeded.title', {
          defaultMessage: 'Indices applied',
        }),
        text: i18n.translate('xpack.apm.settings.apmIndices.applyChanges.succeeded.text', {
          defaultMessage:
            'The indices changes were successfully applied. These changes are reflected immediately in the APM UI',
        }),
      });
      // Defer reload once the UI has finished rendering
      setTimeout(() => window.location.reload());
    } catch (error: any) {
      notifications.toasts.addDanger({
        title: i18n.translate('xpack.apm.settings.apmIndices.applyChanges.failed.title', {
          defaultMessage: 'Indices could not be applied.',
        }),
        text: i18n.translate('xpack.apm.settings.apmIndices.applyChanges.failed.text', {
          defaultMessage: 'Something went wrong when applying indices. Error: {errorMessage}',
          values: { errorMessage: error.body?.message || error.message },
        }),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangeIndexConfigurationEvent = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value } = event.target;
    setApmIndices({
      ...apmIndices,
      [name]: value,
    });
  };

  return (
    <>
      <EuiTitle size="s">
        <h2>
          {i18n.translate('xpack.apm.settings.apmIndices.title', {
            defaultMessage: 'Indices',
          })}
        </h2>
      </EuiTitle>

      <EuiSpacer size="m" />

      <EuiText color="subdued">
        {i18n.translate('xpack.apm.settings.apmIndices.description', {
          defaultMessage: `The APM UI uses data views to query your APM indices. If you've customized the index names that APM Server writes events to, you may need to update these patterns for the APM UI to work. Settings here take precedence over those set in kibana.yml.`,
        })}
      </EuiText>

      <EuiSpacer size="m" />

      {space?.name && (
        <>
          <EuiFlexGroup alignItems="center">
            <EuiFlexItem grow={false}>
              <EuiCallOut
                announceOnMount
                color="primary"
                iconType="spacesApp"
                title={
                  <FormattedMessage
                    id="xpack.apm.settings.apmIndices.spaceDescription"
                    defaultMessage="The index settings apply to the {spaceName} space."
                    values={{
                      spaceName: <strong>{space?.name}</strong>,
                    }}
                  />
                }
              />
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size="m" />
        </>
      )}

      <EuiFlexGroup alignItems="center">
        <EuiFlexItem grow={false}>
          <EuiForm>
            {APM_INDEX_LABELS.map(({ configurationName, label }) => {
              const matchedConfiguration = data.apmIndexSettings?.find(
                ({ configurationName: configName }) => configName === configurationName
              );
              const defaultValue = matchedConfiguration ? matchedConfiguration.defaultValue : '';
              const savedUiIndexValue = apmIndices[configurationName];
              const validationError = validationErrors[configurationName];
              return (
                <EuiFormRow
                  key={configurationName}
                  error={validationError}
                  label={label}
                  helpText={i18n.translate('xpack.apm.settings.apmIndices.helpText', {
                    defaultMessage: 'Overrides {configurationName}: {defaultValue}',
                    values: {
                      configurationName: `xpack.apm.indices.${configurationName}`,
                      defaultValue,
                    },
                  })}
                  fullWidth
                  isInvalid={Boolean(validationError)}
                >
                  <EuiFieldText
                    data-test-subj="apmApmIndicesFieldText"
                    disabled={!canSave}
                    fullWidth
                    isInvalid={Boolean(validationError)}
                    name={configurationName}
                    placeholder={defaultValue}
                    value={savedUiIndexValue ?? ''}
                    onChange={handleChangeIndexConfigurationEvent}
                  />
                </EuiFormRow>
              );
            })}
            <EuiSpacer />
            <EuiFlexGroup justifyContent="flexEnd">
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty data-test-subj="apmApmIndicesCancelButton" onClick={refetch}>
                  {i18n.translate('xpack.apm.settings.apmIndices.cancelButton', {
                    defaultMessage: 'Cancel',
                  })}
                </EuiButtonEmpty>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiToolTip
                  content={
                    !canSave &&
                    i18n.translate('xpack.apm.settings.apmIndices.noPermissionTooltipLabel', {
                      defaultMessage:
                        "Your user role doesn't have permissions to change APM indices",
                    })
                  }
                >
                  <EuiButton
                    data-test-subj="apmApmIndicesApplyChangesButton"
                    fill
                    onClick={handleApplyChangesEvent}
                    isLoading={isSaving}
                    isDisabled={!canSave || hasInvalidChanges}
                  >
                    {i18n.translate('xpack.apm.settings.apmIndices.applyButton', {
                      defaultMessage: 'Apply changes',
                    })}
                  </EuiButton>
                </EuiToolTip>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiForm>
        </EuiFlexItem>
      </EuiFlexGroup>
    </>
  );
}
