/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  EuiBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiTitle,
  EuiButtonEmpty,
  EuiSpacer,
  EuiSwitch,
  EuiLink,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import { DlmPhasesSelector } from '../../../../data_lifecycle';
import type { DlmPhasesSelectorProps, SerializedDlmPhases } from '../../../../data_lifecycle';
import { resolveLogisticsLifecycle } from '../../../../../../../common/lib';
import { buildDataRetentionFromSerializedDlmPhases } from '../../../../data_lifecycle/dlm_phases_selector/utils/build_data_retention';
import type { Forms } from '../../../shared_imports';
import {
  useForm,
  Form,
  getUseField,
  getFormRow,
  Field,
  JsonEditorField,
} from '../../../shared_imports';
import type { DataRetention } from '../../../../../../../common';
import { useApi, useComponentTemplatesContext } from '../../../component_templates_context';
import { useAppContext } from '../../../../../app_context';
import { useLicense } from '../../../../../../hooks/use_license';
import { logisticsFormSchema } from './step_logistics_schema';

const UseField = getUseField({ component: Field });
const FormRow = getFormRow({ titleTag: 'h3' });

const SUBSCRIPTION_FEATURES_URL = 'https://www.elastic.co/subscriptions/cloud';

interface Props {
  defaultValue: { [key: string]: any; lifecycle?: DataRetention; _meta?: Record<string, unknown> };
  onChange: (content: Forms.Content) => void;
  isEditing?: boolean;
}

const buildDlmDefaultValue = (
  lifecycle?: DataRetention
): DlmPhasesSelectorProps['defaultValue'] => {
  if (!lifecycle) {
    return undefined;
  }

  const deletePhase =
    lifecycle.enabled && !lifecycle.infiniteDataRetention && lifecycle.value !== undefined
      ? { enabled: true, value: String(lifecycle.value), unit: lifecycle.unit ?? 'd' }
      : undefined;

  const frozenPhase =
    lifecycle.frozen?.enabled && lifecycle.frozen.value !== undefined
      ? { enabled: true, value: String(lifecycle.frozen.value), unit: lifecycle.frozen.unit ?? 'd' }
      : undefined;

  if (!deletePhase && !frozenPhase) {
    return undefined;
  }

  return {
    ...(frozenPhase ? { frozen: frozenPhase } : {}),
    ...(deletePhase ? { delete: deletePhase } : {}),
  };
};

interface DlmPhasesSelectorFieldProps {
  defaultValue: DlmPhasesSelectorProps['defaultValue'];
  onChange: DlmPhasesSelectorProps['onChange'];
}

const useDlmRepositoryUrls = () => {
  const { getUrlForApp } = useComponentTemplatesContext();

  return {
    manageRepositoriesUrl: getUrlForApp('management', {
      path: 'data/snapshot_restore/repositories',
    }),
    createDefaultRepositoryUrl: getUrlForApp('management', {
      path: 'data/snapshot_restore/add_repository',
    }),
  };
};

const useDlmEnterpriseConfig = (): DlmPhasesSelectorProps['enterprise'] => {
  const {
    plugins: { cloud },
    core: { application },
  } = useAppContext();

  return {
    isCloudEnabled: Boolean(cloud?.isCloudEnabled),
    canManageLicense: Boolean(application?.capabilities?.management?.stack?.license_management),
    trialDaysLeft: cloud?.trialDaysLeft?.(),
    subscriptionFeaturesUrl: SUBSCRIPTION_FEATURES_URL,
  };
};

const StatefulDlmPhasesSelector = ({ defaultValue, onChange }: DlmPhasesSelectorFieldProps) => {
  const { isAtLeastEnterprise } = useLicense();
  const { useLoadSnapshotRepositories } = useApi();
  const { data: snapshotRepositories, resendRequest: refreshSnapshotRepositories } =
    useLoadSnapshotRepositories();
  const { manageRepositoriesUrl, createDefaultRepositoryUrl } = useDlmRepositoryUrls();
  const enterprise = useDlmEnterpriseConfig();

  return (
    <DlmPhasesSelector
      defaultValue={defaultValue}
      serverless={false}
      hasEnterpriseLicense={isAtLeastEnterprise()}
      hasDefaultSnapshotRepository={Boolean(snapshotRepositories?.hasDefaultRepository)}
      canCreateDefaultSnapshotRepository={Boolean(snapshotRepositories?.canCreateRepository)}
      defaultSnapshotRepository={snapshotRepositories?.defaultRepository}
      manageRepositoriesUrl={manageRepositoriesUrl}
      createDefaultRepositoryUrl={createDefaultRepositoryUrl}
      onRefreshDefaultSnapshotRepository={refreshSnapshotRepositories}
      enterprise={enterprise}
      onChange={onChange}
    />
  );
};

const ServerlessDlmPhasesSelector = ({ defaultValue, onChange }: DlmPhasesSelectorFieldProps) => {
  return <DlmPhasesSelector defaultValue={defaultValue} serverless onChange={onChange} />;
};

export const StepLogistics: React.FunctionComponent<Props> = React.memo(
  ({ defaultValue, isEditing, onChange }) => {
    const { form } = useForm({
      schema: logisticsFormSchema,
      defaultValue,
      options: { stripEmptyFields: false },
    });

    const { isValid: isFormValid, submit, getFormData, subscribe } = form;

    const { documentation } = useComponentTemplatesContext();
    const {
      config: { isServerless: isDlmPhasesSelectorServerless },
    } = useAppContext();

    const dlmDefaultValue = useMemo(
      () => buildDlmDefaultValue(defaultValue.lifecycle),
      [defaultValue.lifecycle]
    );

    const [lifecycle, setLifecycle] = useState<DataRetention | undefined>(defaultValue.lifecycle);
    const [isDlmValid, setIsDlmValid] = useState(true);

    const handleDlmChange = useCallback(
      (_value: unknown, serialized: SerializedDlmPhases, nextIsValid: boolean) => {
        setLifecycle(buildDataRetentionFromSerializedDlmPhases(serialized));
        setIsDlmValid(nextIsValid);
      },
      []
    );

    const totalRetentionValue = useMemo(() => {
      if (lifecycle?.enabled && lifecycle.value !== undefined) {
        return `${lifecycle.value}${lifecycle.unit ?? 'd'}`;
      }
      return undefined;
    }, [lifecycle]);

    const [isMetaVisible, setIsMetaVisible] = useState<boolean>(
      Boolean(defaultValue._meta && Object.keys(defaultValue._meta).length)
    );

    const isStepValid = isFormValid && isDlmValid;

    const validate = useCallback(async () => {
      const formValidation = await submit();
      return formValidation.isValid && isDlmValid;
    }, [submit, isDlmValid]);

    const buildData = useCallback(
      (formData: ReturnType<typeof getFormData>) => ({
        ...formData,
        lifecycle: resolveLogisticsLifecycle(lifecycle, { isDataStreamTemplate: true }),
      }),
      [lifecycle]
    );

    useEffect(() => {
      onChange({
        isValid: isStepValid,
        validate,
        getData: () => buildData(getFormData()),
      });
    }, [isStepValid, getFormData, validate, onChange, buildData]);

    useEffect(() => {
      const subscription = subscribe(({ data, isValid }) => {
        onChange({
          isValid: isValid && isDlmValid,
          validate,
          getData: () => buildData(data.format()),
        });
      });
      return subscription.unsubscribe;
    }, [subscribe, validate, onChange, buildData, isDlmValid]);

    return (
      <Form form={form} data-test-subj="stepLogistics">
        <EuiFlexGroup justifyContent="spaceBetween">
          <EuiFlexItem grow={false}>
            <EuiTitle>
              <h2>
                <FormattedMessage
                  id="xpack.idxMgmt.componentTemplateForm.stepLogistics.stepTitle"
                  defaultMessage="Logistics"
                />
              </h2>
            </EuiTitle>
          </EuiFlexItem>

          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              size="s"
              flush="right"
              href={documentation.componentTemplates}
              target="_blank"
              iconType="question"
              data-test-subj="documentationLink"
            >
              <FormattedMessage
                id="xpack.idxMgmt.componentTemplateForm.stepLogistics.docsButtonLabel"
                defaultMessage="Component Templates docs"
              />
            </EuiButtonEmpty>
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="l" />

        {/* Name field */}
        <FormRow
          title={
            <FormattedMessage
              id="xpack.idxMgmt.componentTemplateForm.stepLogistics.nameTitle"
              defaultMessage="Name"
            />
          }
          description={
            <FormattedMessage
              id="xpack.idxMgmt.componentTemplateForm.stepLogistics.nameDescription"
              defaultMessage="Unique name for this component template."
            />
          }
        >
          <UseField
            path="name"
            componentProps={{
              ['data-test-subj']: 'nameField',
              euiFieldProps: { disabled: isEditing },
            }}
          />
        </FormRow>

        {/* Data lifecycle field */}
        <FormRow
          title={
            <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
              <EuiFlexItem grow={false}>
                <FormattedMessage
                  id="xpack.idxMgmt.componentTemplateForm.stepLogistics.dataLifecycleTitle"
                  defaultMessage="Data lifecycle"
                />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiBadge color="hollow" data-test-subj="totalRetentionBadge">
                  {totalRetentionValue ?? (
                    <EuiIcon
                      type="infinity"
                      size="s"
                      aria-label={i18n.translate(
                        'xpack.idxMgmt.componentTemplateForm.stepLogistics.totalRetentionInfiniteAriaLabel',
                        { defaultMessage: 'Data is kept indefinitely' }
                      )}
                    />
                  )}
                </EuiBadge>
              </EuiFlexItem>
            </EuiFlexGroup>
          }
          description={
            isDlmPhasesSelectorServerless ? (
              <FormattedMessage
                id="xpack.idxMgmt.componentTemplateForm.stepLogistics.dataLifecycleDescriptionServerless"
                defaultMessage="Add a delete phase to your data lifecycle to specify the length of time you wish to retain your data."
              />
            ) : (
              <FormattedMessage
                id="xpack.idxMgmt.componentTemplateForm.stepLogistics.dataLifecycleDescriptionStateful"
                defaultMessage="The data lifecycle defines how your stream's data is managed as it ages, dictating storage and retention. Use these settings to automate and optimize storage costs and query performance over time."
              />
            )
          }
          fieldFlexItemProps={{
            'data-test-subj': 'dataLifecyclePhasesSelector',
          }}
        >
          {isDlmPhasesSelectorServerless ? (
            <ServerlessDlmPhasesSelector
              defaultValue={dlmDefaultValue}
              onChange={handleDlmChange}
            />
          ) : (
            <StatefulDlmPhasesSelector defaultValue={dlmDefaultValue} onChange={handleDlmChange} />
          )}
        </FormRow>

        {/* version field */}
        <FormRow
          title={
            <FormattedMessage
              id="xpack.idxMgmt.componentTemplateForm.stepLogistics.versionTitle"
              defaultMessage="Version"
            />
          }
          description={
            <FormattedMessage
              id="xpack.idxMgmt.componentTemplateForm.stepLogistics.versionDescription"
              defaultMessage="Number used by external management systems to identify the component template."
            />
          }
        >
          <UseField
            path="version"
            componentProps={{
              ['data-test-subj']: 'versionField',
            }}
          />
        </FormRow>

        {/* _meta field */}
        <FormRow
          title={
            <FormattedMessage
              id="xpack.idxMgmt.componentTemplateForm.stepLogistics.metaTitle"
              defaultMessage="Metadata"
            />
          }
          description={
            <>
              <FormattedMessage
                id="xpack.idxMgmt.componentTemplateForm.stepLogistics.metaDescription"
                defaultMessage="Arbitrary information about the template, stored in the cluster state. {learnMoreLink}"
                values={{
                  learnMoreLink: (
                    <EuiLink
                      href={documentation.componentTemplatesMetadata}
                      target="_blank"
                      external
                    >
                      {i18n.translate(
                        'xpack.idxMgmt.componentTemplateForm.stepLogistics.metaDocumentionLink',
                        {
                          defaultMessage: 'Learn more.',
                        }
                      )}
                    </EuiLink>
                  ),
                }}
              />

              <EuiSpacer size="m" />

              <EuiSwitch
                label={
                  <FormattedMessage
                    id="xpack.idxMgmt.componentTemplateForm.stepLogistics.metadataDescription"
                    defaultMessage="Add metadata"
                  />
                }
                checked={isMetaVisible}
                onChange={(e) => setIsMetaVisible(e.target.checked)}
                data-test-subj="metaToggle"
              />
            </>
          }
        >
          {isMetaVisible && (
            <UseField
              path="_meta"
              component={JsonEditorField}
              componentProps={{
                codeEditorProps: {
                  ['data-test-subj']: 'metaEditor',
                  height: '200px',
                  'aria-label': i18n.translate(
                    'xpack.idxMgmt.componentTemplateForm.stepLogistics.metaAriaLabel',
                    {
                      defaultMessage: '_meta field data editor',
                    }
                  ),
                },
              }}
            />
          )}
        </FormRow>
      </Form>
    );
  }
);
