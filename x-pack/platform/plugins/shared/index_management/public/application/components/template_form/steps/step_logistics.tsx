/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useCallback, useMemo, useState, Fragment } from 'react';
import {
  EuiBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiTitle,
  EuiButtonEmpty,
  EuiSpacer,
  EuiLink,
  EuiCode,
  EuiText,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import { SUBSCRIPTION_FEATURES_URL } from '@kbn/data-lifecycle-phases';

import { DlmPhasesSelector } from '../../data_lifecycle';
import type { DlmPhasesSelectorProps, SerializedDlmPhases } from '../../data_lifecycle';
import { resolveLogisticsLifecycle } from '../../../../../common/lib';
import { buildDataRetentionFromSerializedDlmPhases } from '../../data_lifecycle/dlm_phases_selector/utils/build_data_retention';
import type { Forms } from '../../../../shared_imports';
import {
  useForm,
  useFormData,
  Form,
  getUseField,
  getFormRow,
  Field,
  JsonEditorField,
  RadioGroupField,
  ToggleField,
} from '../../../../shared_imports';
import type { DataRetention } from '../../../../../common';
import { documentationService } from '../../../services/documentation';
import { useAppContext } from '../../../app_context';
import { useLicense } from '../../../../hooks/use_license';
import { useLoadSnapshotRepositories } from '../../../services/api';
import { schemas, nameConfig, nameConfigWithoutValidations } from '../template_form_schemas';
import {
  allowAutoCreateRadios,
  STANDARD_INDEX_MODE,
  TIME_SERIES_MODE,
  LOGSDB_INDEX_MODE,
  LOOKUP_INDEX_MODE,
} from '../../../../../common/constants';
import { indexModeLabels, indexModeDescriptions } from '../../../lib/index_mode_labels';

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
  const {
    core: { getUrlForApp },
  } = useAppContext();

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

// Create or Form components with partial props that are common to all instances
const UseField = getUseField({ component: Field });
const FormRow = getFormRow({ titleTag: 'h3' });

function getFieldsMeta(esDocsBase: string) {
  return {
    name: {
      title: i18n.translate('xpack.idxMgmt.templateForm.stepLogistics.nameTitle', {
        defaultMessage: 'Name',
      }),
      description: i18n.translate('xpack.idxMgmt.templateForm.stepLogistics.nameDescription', {
        defaultMessage: 'A unique identifier for this template.',
      }),
      testSubject: 'nameField',
    },
    indexPatterns: {
      title: i18n.translate('xpack.idxMgmt.templateForm.stepLogistics.indexPatternsTitle', {
        defaultMessage: 'Index patterns',
      }),
      description: i18n.translate(
        'xpack.idxMgmt.templateForm.stepLogistics.indexPatternsDescription',
        {
          defaultMessage: 'The index patterns to apply to the template.',
        }
      ),
      testSubject: 'indexPatternsField',
    },
    createDataStream: {
      title: i18n.translate('xpack.idxMgmt.templateForm.stepLogistics.dataStreamTitle', {
        defaultMessage: 'Data stream',
      }),
      description: (
        <FormattedMessage
          id="xpack.idxMgmt.templateForm.stepLogistics.dataStreamDescription"
          defaultMessage="The template creates data streams instead of indices. {docsLink}"
          values={{
            docsLink: (
              <EuiLink
                href={documentationService.getDataStreamsDocumentationLink()}
                target="_blank"
                external
              >
                {i18n.translate(
                  'xpack.idxMgmt.templateForm.stepLogistics.dataStreamDocumentionLink',
                  {
                    defaultMessage: 'Learn more.',
                  }
                )}
              </EuiLink>
            ),
          }}
        />
      ),
      testSubject: 'dataStreamField',
    },
    indexMode: {
      title: i18n.translate('xpack.idxMgmt.templateForm.stepLogistics.indexModeTitle', {
        defaultMessage: 'Index mode',
      }),
      description: i18n.translate('xpack.idxMgmt.templateForm.stepLogistics.indexModeDescription', {
        defaultMessage:
          'The index.mode setting is used to control settings applied in specific domains like ingestions of time series data or logs.',
      }),
      options: [
        {
          value: STANDARD_INDEX_MODE,
          inputDisplay: indexModeLabels[STANDARD_INDEX_MODE],
          'data-test-subj': 'index_mode_standard',
          dropdownDisplay: (
            <Fragment>
              <strong>{indexModeLabels[STANDARD_INDEX_MODE]}</strong>
              <EuiText size="s" color="subdued">
                <p>{indexModeDescriptions[STANDARD_INDEX_MODE]}</p>
              </EuiText>
            </Fragment>
          ),
        },
        {
          value: TIME_SERIES_MODE,
          inputDisplay: indexModeLabels[TIME_SERIES_MODE],
          'data-test-subj': 'index_mode_time_series',
          dropdownDisplay: (
            <Fragment>
              <strong>{indexModeLabels[TIME_SERIES_MODE]}</strong>
              <EuiText size="s" color="subdued">
                <p>{indexModeDescriptions[TIME_SERIES_MODE]}</p>
              </EuiText>
            </Fragment>
          ),
        },
        {
          value: LOGSDB_INDEX_MODE,
          inputDisplay: indexModeLabels[LOGSDB_INDEX_MODE],
          'data-test-subj': 'index_mode_logsdb',
          dropdownDisplay: (
            <Fragment>
              <strong>{indexModeLabels[LOGSDB_INDEX_MODE]}</strong>
              <EuiText size="s" color="subdued">
                <p>{indexModeDescriptions[LOGSDB_INDEX_MODE]}</p>
              </EuiText>
            </Fragment>
          ),
        },
        {
          value: LOOKUP_INDEX_MODE,
          inputDisplay: indexModeLabels[LOOKUP_INDEX_MODE],
          'data-test-subj': 'index_mode_logsdb',
          dropdownDisplay: (
            <Fragment>
              <strong>{indexModeLabels[LOOKUP_INDEX_MODE]}</strong>
              <EuiText size="s" color="subdued">
                <p>{indexModeDescriptions[LOOKUP_INDEX_MODE]}</p>
              </EuiText>
            </Fragment>
          ),
        },
      ],
      testSubject: 'indexModeField',
    },
    order: {
      title: i18n.translate('xpack.idxMgmt.templateForm.stepLogistics.orderTitle', {
        defaultMessage: 'Merge order',
      }),
      description: i18n.translate('xpack.idxMgmt.templateForm.stepLogistics.orderDescription', {
        defaultMessage: 'The merge order when multiple templates match an index.',
      }),
      testSubject: 'orderField',
    },
    priority: {
      title: i18n.translate('xpack.idxMgmt.templateForm.stepLogistics.priorityTitle', {
        defaultMessage: 'Priority',
      }),
      description: i18n.translate('xpack.idxMgmt.templateForm.stepLogistics.priorityDescription', {
        defaultMessage: 'Only the highest priority template will be applied.',
      }),
      testSubject: 'priorityField',
    },
    version: {
      title: i18n.translate('xpack.idxMgmt.templateForm.stepLogistics.versionTitle', {
        defaultMessage: 'Version',
      }),
      description: i18n.translate('xpack.idxMgmt.templateForm.stepLogistics.versionDescription', {
        defaultMessage: 'A number that identifies the template to external management systems.',
      }),
      testSubject: 'versionField',
    },
    allowAutoCreate: {
      title: i18n.translate('xpack.idxMgmt.templateForm.stepLogistics.allowAutoCreateTitle', {
        defaultMessage: 'Allow auto create',
      }),
      description: (
        <FormattedMessage
          id="xpack.idxMgmt.templateForm.stepLogistics.allowAutoCreateDescription"
          defaultMessage="This setting overwrites the value of the {settingName} cluster setting. If set to {true} in a template, then indices can be automatically created using that template."
          values={{
            settingName: <EuiCode>action.auto_create_index</EuiCode>,
            true: <EuiCode>true</EuiCode>,
          }}
        />
      ),
      testSubject: 'allowAutoCreateField',
    },
  };
}

interface LogisticsForm {
  [key: string]: any;
  lifecycle?: DataRetention;
}

interface LogisticsFormInternal extends LogisticsForm {
  addMeta: boolean;
  doCreateDataStream: boolean;
  setIndexMode: boolean;
}

interface Props {
  defaultValue: LogisticsForm;
  onChange: (content: Forms.Content) => void;
  isEditing?: boolean;
  isLegacy?: boolean;
}

function formDeserializer(formData: LogisticsForm): LogisticsFormInternal {
  return {
    ...formData,
    addMeta: Boolean(formData._meta && Object.keys(formData._meta).length),
    doCreateDataStream: Boolean(formData.dataStream),
    setIndexMode: Boolean(formData.indexMode),
  };
}

function getformSerializer(initialTemplateData: LogisticsForm = {}) {
  return (formData: LogisticsFormInternal): LogisticsForm => {
    const {
      addMeta,
      doCreateDataStream,
      setIndexMode,
      indexMode: indexModeValue,
      ...rest
    } = formData;
    const dataStream = doCreateDataStream ? initialTemplateData.dataStream ?? {} : undefined;
    const indexMode = setIndexMode ? indexModeValue : undefined;
    return { ...rest, dataStream, indexMode };
  };
}

export const StepLogistics: React.FunctionComponent<Props> = React.memo(
  ({ defaultValue, isEditing = false, onChange, isLegacy = false }) => {
    const { form } = useForm({
      schema: schemas.logistics,
      defaultValue,
      options: { stripEmptyFields: false },
      serializer: getformSerializer(defaultValue),
      deserializer: formDeserializer,
    });
    const {
      submit,
      isSubmitted,
      isSubmitting,
      isValid: isFormValid,
      getErrors: getFormErrors,
      getFormData,
      setFieldValue,
      updateFieldValues,
    } = form;

    const [{ addMeta, doCreateDataStream, indexPatterns: indexPatternsField, setIndexMode }] =
      useFormData<{
        addMeta: boolean;
        doCreateDataStream: boolean;
        indexPatterns: string[];
        indexMode: string;
        setIndexMode: boolean;
      }>({
        form,
        watch: ['addMeta', 'doCreateDataStream', 'indexPatterns', 'indexMode', 'setIndexMode'],
      });

    const {
      config: { isServerless: isDlmPhasesSelectorServerless },
    } = useAppContext();

    const [lifecycle, setLifecycle] = useState<DataRetention | undefined>(defaultValue.lifecycle);
    const [isDlmValid, setIsDlmValid] = useState(true);

    const dlmDefaultValue = useMemo(
      () => buildDlmDefaultValue(defaultValue.lifecycle),
      [defaultValue.lifecycle]
    );

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

    const isStepValid = isFormValid && (!doCreateDataStream || isDlmValid);

    const getData = useCallback(() => {
      const data = getFormData();
      return {
        ...data,
        lifecycle: doCreateDataStream
          ? resolveLogisticsLifecycle(lifecycle, { isDataStreamTemplate: true })
          : undefined,
      };
    }, [getFormData, lifecycle, doCreateDataStream]);

    useEffect(() => {
      if (!setIndexMode) {
        setFieldValue('indexMode', null);
      }
    }, [setIndexMode, setFieldValue]);

    useEffect(() => {
      if (
        indexPatternsField &&
        indexPatternsField.length === 1 &&
        indexPatternsField[0] === 'logs-*-*' &&
        // Only set index mode if index pattern was changed
        defaultValue.indexPatterns !== indexPatternsField
      ) {
        updateFieldValues({
          setIndexMode: true,
          indexMode: LOGSDB_INDEX_MODE,
        });
      }
    }, [defaultValue.indexPatterns, indexPatternsField, updateFieldValues]);

    /**
     * When the consumer call validate() on this step, we submit the form so it enters the "isSubmitted" state
     * and we can display the form errors on top of the forms if there are any.
     */
    const validate = useCallback(async () => {
      const formValidation = await submit();
      return formValidation.isValid && (!doCreateDataStream || isDlmValid);
    }, [submit, doCreateDataStream, isDlmValid]);

    useEffect(() => {
      onChange({
        isValid: isStepValid,
        getData,
        validate,
      });
    }, [onChange, isStepValid, validate, getData]);

    const {
      name,
      indexPatterns,
      createDataStream,
      indexMode,
      order,
      priority,
      version,
      allowAutoCreate,
    } = getFieldsMeta(documentationService.getEsDocsBase());

    return (
      <>
        {/* Header */}
        <EuiFlexGroup justifyContent="spaceBetween">
          <EuiFlexItem grow={false}>
            <EuiTitle>
              <h2 data-test-subj="stepTitle">
                <FormattedMessage
                  id="xpack.idxMgmt.templateForm.stepLogistics.stepTitle"
                  defaultMessage="Logistics"
                />
              </h2>
            </EuiTitle>
          </EuiFlexItem>

          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              size="s"
              flush="right"
              href={documentationService.getTemplatesDocumentationLink(isLegacy)}
              target="_blank"
              iconType="question"
            >
              <FormattedMessage
                id="xpack.idxMgmt.templateForm.stepLogistics.docsButtonLabel"
                defaultMessage="Index Templates docs"
              />
            </EuiButtonEmpty>
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="l" />

        <Form
          form={form}
          isInvalid={isSubmitted && !isSubmitting && !isFormValid}
          error={getFormErrors()}
          data-test-subj="stepLogistics"
        >
          {/* Name */}
          <FormRow title={name.title} description={name.description}>
            <UseField
              path="name"
              componentProps={{
                ['data-test-subj']: name.testSubject,
                euiFieldProps: { disabled: isEditing },
              }}
              config={isEditing ? nameConfigWithoutValidations : nameConfig}
            />
          </FormRow>

          {/* Index patterns */}
          <FormRow title={indexPatterns.title} description={indexPatterns.description}>
            <UseField
              path="indexPatterns"
              componentProps={{
                ['data-test-subj']: indexPatterns.testSubject,
              }}
            />
          </FormRow>

          {/* Create data stream */}
          {isLegacy !== true && (
            <FormRow title={createDataStream.title} description={createDataStream.description}>
              <UseField
                path="doCreateDataStream"
                componentProps={{ 'data-test-subj': createDataStream.testSubject }}
              />
            </FormRow>
          )}

          {/*
            Data lifecycle (data retention) is only available for templates that create a data
            stream, so we only render it when "Create data stream" is enabled.
          */}
          {doCreateDataStream && (
            <FormRow
              title={
                <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                  <EuiFlexItem grow={false}>
                    <FormattedMessage
                      id="xpack.idxMgmt.templateForm.stepLogistics.dataLifecycleTitle"
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
                            'xpack.idxMgmt.templateForm.stepLogistics.totalRetentionInfiniteAriaLabel',
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
                    id="xpack.idxMgmt.templateForm.stepLogistics.dataLifecycleDescriptionServerless"
                    defaultMessage="Add a delete phase to your data lifecycle to specify the length of time you wish to retain your data."
                  />
                ) : (
                  <FormattedMessage
                    id="xpack.idxMgmt.templateForm.stepLogistics.dataLifecycleDescriptionStateful"
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
                <StatefulDlmPhasesSelector
                  defaultValue={dlmDefaultValue}
                  onChange={handleDlmChange}
                />
              )}
            </FormRow>
          )}

          {/* Index mode */}
          <FormRow
            title={indexMode.title}
            description={
              <>
                {indexMode.description}
                <EuiSpacer size="m" />
                <UseField
                  path="setIndexMode"
                  component={ToggleField}
                  componentProps={{
                    'data-test-subj': 'toggleIndexMode',
                    euiFieldProps: {
                      label: i18n.translate(
                        'xpack.idxMgmt.templateForm.stepLogistics.toggleIndexModeLabel',
                        {
                          defaultMessage: 'Set index mode',
                        }
                      ),
                    },
                  }}
                />
              </>
            }
          >
            {setIndexMode && (
              <UseField
                path="indexMode"
                componentProps={{
                  euiFieldProps: {
                    'data-test-subj': indexMode.testSubject,
                    options: indexMode.options,
                  },
                }}
              />
            )}
          </FormRow>

          {/* Order */}
          {isLegacy && (
            <FormRow title={order.title} description={order.description}>
              <UseField
                path="order"
                componentProps={{
                  ['data-test-subj']: order.testSubject,
                }}
              />
            </FormRow>
          )}

          {/* Priority */}
          {isLegacy === false && (
            <FormRow title={priority.title} description={priority.description}>
              <UseField
                path="priority"
                componentProps={{
                  ['data-test-subj']: priority.testSubject,
                }}
              />
            </FormRow>
          )}

          {/* Version */}
          <FormRow title={version.title} description={version.description}>
            <UseField
              path="version"
              componentProps={{
                ['data-test-subj']: version.testSubject,
              }}
            />
          </FormRow>

          {/* Allow auto create */}
          {isLegacy === false && (
            <FormRow title={allowAutoCreate.title} description={allowAutoCreate.description}>
              <UseField
                path="allowAutoCreate"
                component={RadioGroupField}
                componentProps={{
                  'data-test-subj': allowAutoCreate.testSubject,
                  euiFieldProps: {
                    options: allowAutoCreateRadios,
                    name: 'allowAutoCreate radio group',
                  },
                }}
              />
            </FormRow>
          )}

          {/* _meta */}
          {isLegacy === false && (
            <FormRow
              title={i18n.translate('xpack.idxMgmt.templateForm.stepLogistics.metaFieldTitle', {
                defaultMessage: '_meta field',
              })}
              description={
                <>
                  <FormattedMessage
                    id="xpack.idxMgmt.templateForm.stepLogistics.metaFieldDescription"
                    defaultMessage="Use the _meta field to store any metadata you want."
                  />
                  <EuiSpacer size="m" />
                  <UseField path="addMeta" data-test-subj="metaToggle" />
                </>
              }
            >
              {addMeta && (
                <UseField
                  path="_meta"
                  component={JsonEditorField}
                  componentProps={{
                    codeEditorProps: {
                      height: '280px',
                      'aria-label': i18n.translate(
                        'xpack.idxMgmt.templateForm.stepLogistics.metaFieldEditorAriaLabel',
                        {
                          defaultMessage: '_meta field data editor',
                        }
                      ),
                      'data-test-subj': 'metaField',
                    },
                  }}
                />
              )}
            </FormRow>
          )}
        </Form>
      </>
    );
  }
);
