/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useEffect, useState, useMemo } from 'react';

import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';

import {
  EuiAccordion,
  EuiComboBox,
  EuiLink,
  EuiSwitch,
  EuiFieldText,
  EuiForm,
  EuiFormRow,
  EuiSelect,
  EuiSpacer,
  EuiCallOut,
  EuiTextArea,
} from '@elastic/eui';

import { KBN_FIELD_TYPES } from '@kbn/field-types';
import { CreateDataViewForm } from '@kbn/ml-data-view-utils/components/create_data_view_form_row';
import { DestinationIndexForm } from '@kbn/ml-creation-wizard-utils/components/destination_index_form';

import { retentionPolicyMaxAgeInvalidErrorMessage } from '../../../../common/validators/messages';
import {
  DEFAULT_TRANSFORM_FREQUENCY,
  DEFAULT_TRANSFORM_SETTINGS_MAX_PAGE_SEARCH_SIZE,
  DEFAULT_TRANSFORM_SETTINGS_MAX_PAGE_SEARCH_SIZE_LATEST,
} from '../../../../../../common/constants';
import type { TransformId } from '../../../../../../common/types/transform';
import { isValidIndexName } from '../../../../../../common/utils/es_utils';

import { getErrorMessage } from '../../../../../../common/utils/errors';

import { useAppDependencies, useToastNotifications } from '../../../../app_dependencies';
import { useToastNotificationText } from '../../../../components';
import {
  useDocumentationLinks,
  useGetDataViewTitles,
  useGetEsIndices,
  useGetEsIngestPipelines,
  useGetTransforms,
  useGetTransformsPreview,
} from '../../../../hooks';
import type { SearchItems } from '../../../../hooks/use_search_items';
import {
  getTransformConfigQuery,
  getPreviewTransformRequestBody,
  isTransformIdValid,
} from '../../../../common';
import type { EsIndexName } from './common';
import {
  isContinuousModeDelay,
  isRetentionPolicyMaxAge,
  isTransformWizardFrequency,
  integerRangeMinus1To100Validator,
  transformSettingsPageSearchSizeValidator,
} from '../../../../common/validators';
import type { StepDefineExposedState } from '../step_define/common';
import { TRANSFORM_FUNCTION } from '../../../../../../common/constants';

import type { StepDetailsExposedState } from './common';
import { getDefaultStepDetailsState } from './common';

interface StepDetailsFormProps {
  overrides?: StepDetailsExposedState;
  onChange(s: StepDetailsExposedState): void;
  searchItems: SearchItems;
  stepDefineState: StepDefineExposedState;
}

export const StepDetailsForm: FC<StepDetailsFormProps> = React.memo(
  ({ overrides = {}, onChange, searchItems, stepDefineState }) => {
    const { application } = useAppDependencies();
    const { capabilities } = application;
    const toastNotifications = useToastNotifications();
    const getToastNotificationText = useToastNotificationText();
    const { esIndicesCreateIndex } = useDocumentationLinks();

    const defaults = {
      ...getDefaultStepDetailsState(stepDefineState.transformFunction),
      ...overrides,
    };

    const [transformId, setTransformId] = useState<TransformId>(defaults.transformId);
    const [transformDescription, setTransformDescription] = useState<string>(
      defaults.transformDescription
    );
    const [destinationIndex, setDestinationIndex] = useState<EsIndexName>(
      defaults.destinationIndex
    );
    const [destIndexSameAsId, setDestIndexSameAsId] = useState<boolean>(
      destinationIndex !== undefined && destinationIndex === transformId
    );
    const [destinationIngestPipeline, setDestinationIngestPipeline] = useState<string>(
      defaults.destinationIngestPipeline
    );

    const canCreateDataView = useMemo(
      () =>
        capabilities.savedObjectsManagement?.edit === true ||
        capabilities.indexPatterns?.save === true,
      [capabilities]
    );

    // Index pattern state
    const [createDataView, setCreateDataView] = useState(
      canCreateDataView === false ? false : defaults.createDataView
    );
    const [dataViewTimeField, setDataViewTimeField] = useState<string | undefined>();

    const previewRequest = useMemo(() => {
      const { searchQuery, previewRequest: partialPreviewRequest } = stepDefineState;
      const transformConfigQuery = getTransformConfigQuery(searchQuery);
      return getPreviewTransformRequestBody(
        searchItems.dataView,
        transformConfigQuery,
        partialPreviewRequest,
        stepDefineState.runtimeMappings
      );
    }, [searchItems.dataView, stepDefineState]);

    const { error: transformsPreviewError, data: transformPreview } =
      useGetTransformsPreview(previewRequest);

    const destIndexAvailableTimeFields = useMemo<string[]>(() => {
      if (!transformPreview) return [];
      const properties = transformPreview.generated_dest_index.mappings.properties;
      const timeFields: string[] = Object.keys(properties).filter(
        (col) => properties[col].type === 'date'
      );
      return timeFields;
    }, [transformPreview]);

    useEffect(
      function resetDataViewTimeField() {
        setDataViewTimeField(destIndexAvailableTimeFields[0]);
      },
      [destIndexAvailableTimeFields]
    );

    const onTimeFieldChanged = React.useCallback(
      (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value;
        // If the value is an empty string, it's not a valid selection
        if (value === '') {
          return;
        }
        // Find the time field based on the selected value
        // this is to account for undefined when user chooses not to use a date field
        const timeField = destIndexAvailableTimeFields.find((col) => col === value);

        setDataViewTimeField(timeField);
      },
      [setDataViewTimeField, destIndexAvailableTimeFields]
    );

    const {
      error: transformsError,
      data: { transformIds },
    } = useGetTransforms();

    useEffect(() => {
      if (transformsError !== null) {
        toastNotifications.addDanger({
          title: i18n.translate('xpack.transform.stepDetailsForm.errorGettingTransformList', {
            defaultMessage: 'An error occurred getting the existing transform IDs:',
          }),
          ...getToastNotificationText(getErrorMessage(transformsError)),
        });
      }
      // custom comparison
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transformsError]);

    useEffect(() => {
      if (transformsPreviewError !== null) {
        toastNotifications.addDanger({
          title: i18n.translate('xpack.transform.stepDetailsForm.errorGettingTransformPreview', {
            defaultMessage: 'An error occurred fetching the transform preview',
          }),
          ...getToastNotificationText(getErrorMessage(transformsPreviewError)),
        });
      }
      // custom comparison
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transformsPreviewError]);

    const { error: esIndicesError, data: esIndicesData } = useGetEsIndices();
    const indexNames = esIndicesData?.map((index) => index.name) ?? [];

    useEffect(() => {
      if (esIndicesError !== null) {
        toastNotifications.addDanger({
          title: i18n.translate('xpack.transform.stepDetailsForm.errorGettingIndexNames', {
            defaultMessage: 'An error occurred getting the existing index names:',
          }),
          ...getToastNotificationText(getErrorMessage(esIndicesError)),
        });
      }
      // custom comparison
      /* eslint-disable react-hooks/exhaustive-deps */
    }, [esIndicesError]);

    const { error: esIngestPipelinesError, data: esIngestPipelinesData } =
      useGetEsIngestPipelines();
    const ingestPipelineNames = esIngestPipelinesData?.map(({ name }) => name) ?? [];

    useEffect(() => {
      if (esIngestPipelinesError !== null) {
        toastNotifications.addDanger({
          title: i18n.translate('xpack.transform.stepDetailsForm.errorGettingIngestPipelines', {
            defaultMessage: 'An error occurred getting the existing ingest pipeline names:',
          }),
          ...getToastNotificationText(getErrorMessage(esIngestPipelinesError)),
        });
      }
      // custom comparison
      /* eslint-disable react-hooks/exhaustive-deps */
    }, [esIngestPipelinesError]);

    const { error: dataViewTitlesError, data: dataViewTitles } = useGetDataViewTitles();

    useEffect(() => {
      if (dataViewTitlesError !== null) {
        toastNotifications.addDanger({
          title: i18n.translate('xpack.transform.stepDetailsForm.errorGettingDataViewTitles', {
            defaultMessage: 'An error occurred getting the existing data view titles:',
          }),
          ...getToastNotificationText(getErrorMessage(dataViewTitlesError)),
        });
      }
    }, [dataViewTitlesError]);

    const sourceIndexDateFieldNames = searchItems.dataView.fields
      .filter((f) => f.type === KBN_FIELD_TYPES.DATE)
      .map((f) => f.name)
      .sort();

    // Continuous Mode
    const isContinuousModeAvailable = sourceIndexDateFieldNames.length > 0;
    const [isContinuousModeEnabled, setContinuousModeEnabled] = useState(
      defaults.isContinuousModeEnabled
    );
    const [continuousModeDateField, setContinuousModeDateField] = useState(
      isContinuousModeAvailable ? sourceIndexDateFieldNames[0] : ''
    );
    const [continuousModeDelay, setContinuousModeDelay] = useState(defaults.continuousModeDelay);
    const isContinuousModeDelayValid = isContinuousModeDelay(continuousModeDelay);

    // Retention Policy
    const isRetentionPolicyAvailable = destIndexAvailableTimeFields.length > 0;
    const [isRetentionPolicyEnabled, setRetentionPolicyEnabled] = useState(
      defaults.isRetentionPolicyEnabled
    );
    const [retentionPolicyDateField, setRetentionPolicyDateField] = useState(
      isRetentionPolicyAvailable ? defaults.retentionPolicyDateField : ''
    );
    const [retentionPolicyMaxAge, setRetentionPolicyMaxAge] = useState(
      defaults.retentionPolicyMaxAge
    );
    const retentionPolicyMaxAgeEmpty = retentionPolicyMaxAge === '';
    const isRetentionPolicyMaxAgeValid = isRetentionPolicyMaxAge(retentionPolicyMaxAge);

    useEffect(() => {
      // Reset retention policy settings when the user disables the whole option
      if (!isRetentionPolicyEnabled) {
        setRetentionPolicyDateField(
          isRetentionPolicyAvailable ? destIndexAvailableTimeFields[0] : ''
        );
        setRetentionPolicyMaxAge('');
      }

      // When retention policy is first enabled, pick a default option
      if (
        isRetentionPolicyAvailable &&
        isRetentionPolicyEnabled &&
        retentionPolicyDateField === ''
      ) {
        // If a time field '@timestamp' exists, prioritize that
        const prioritizeTimestamp = destIndexAvailableTimeFields.find((d) => d === '@timestamp');
        // else pick the first available option
        setRetentionPolicyDateField(prioritizeTimestamp ?? destIndexAvailableTimeFields[0]);
      }
    }, [isRetentionPolicyEnabled, isRetentionPolicyAvailable, destIndexAvailableTimeFields]);

    const transformIdExists = transformIds.some((id) => transformId === id);
    const transformIdEmpty = transformId === '';
    const transformIdValid = isTransformIdValid(transformId);

    const indexNameExists = indexNames.some((name) => destinationIndex === name);
    const indexNameEmpty = destinationIndex === '';
    const indexNameValid = isValidIndexName(destinationIndex);
    const dataViewTitleExists = dataViewTitles?.some((name) => destinationIndex === name) ?? false;

    const [transformFrequency, setTransformFrequency] = useState(defaults.transformFrequency);
    const isTransformFrequencyValid = isTransformWizardFrequency(transformFrequency);

    const [transformSettingsMaxPageSearchSize, setTransformSettingsMaxPageSearchSize] = useState<
      number | undefined
    >(defaults.transformSettingsMaxPageSearchSize);
    const [transformSettingsDocsPerSecond] = useState(defaults.transformSettingsDocsPerSecond);

    const transformSettingsMaxPageSearchSizeErrors = transformSettingsPageSearchSizeValidator(
      transformSettingsMaxPageSearchSize
    );
    const isTransformSettingsMaxPageSearchSizeValid =
      transformSettingsMaxPageSearchSizeErrors.length === 0;

    const [transformSettingsNumFailureRetries, setTransformSettingsNumFailureRetries] = useState<
      string | number | undefined
    >(defaults.transformSettingsNumFailureRetries);
    const [deferValidation, setDeferValidation] = useState(defaults.deferValidation);
    const isTransformSettingsNumFailureRetriesValid =
      transformSettingsNumFailureRetries === undefined ||
      transformSettingsNumFailureRetries === '-' ||
      integerRangeMinus1To100Validator(transformSettingsNumFailureRetries).length === 0;

    const valid =
      !transformIdEmpty &&
      transformIdValid &&
      !transformIdExists &&
      isTransformFrequencyValid &&
      isTransformSettingsMaxPageSearchSizeValid &&
      !indexNameEmpty &&
      indexNameValid &&
      (!dataViewTitleExists || !createDataView) &&
      (!isContinuousModeAvailable || (isContinuousModeAvailable && isContinuousModeDelayValid)) &&
      (!isRetentionPolicyAvailable ||
        !isRetentionPolicyEnabled ||
        (isRetentionPolicyAvailable &&
          isRetentionPolicyEnabled &&
          !retentionPolicyMaxAgeEmpty &&
          isRetentionPolicyMaxAgeValid));

    // expose state to wizard
    useEffect(() => {
      onChange({
        continuousModeDateField,
        continuousModeDelay,
        createDataView,
        deferValidation,
        isContinuousModeEnabled,
        isRetentionPolicyEnabled,
        retentionPolicyDateField,
        retentionPolicyMaxAge,
        transformId,
        transformDescription,
        transformFrequency,
        transformSettingsMaxPageSearchSize,
        transformSettingsDocsPerSecond,
        transformSettingsNumFailureRetries:
          transformSettingsNumFailureRetries === undefined ||
          transformSettingsNumFailureRetries === ''
            ? undefined
            : typeof transformSettingsNumFailureRetries === 'number'
            ? transformSettingsNumFailureRetries
            : parseInt(transformSettingsNumFailureRetries, 10),
        destinationIndex,
        destinationIngestPipeline,
        touched: true,
        valid,
        dataViewTimeField,
        _meta: defaults._meta,
      });
      // custom comparison
      /* eslint-disable react-hooks/exhaustive-deps */
    }, [
      continuousModeDateField,
      continuousModeDelay,
      createDataView,
      deferValidation,
      isContinuousModeEnabled,
      isRetentionPolicyEnabled,
      retentionPolicyDateField,
      retentionPolicyMaxAge,
      transformId,
      transformDescription,
      transformFrequency,
      transformSettingsMaxPageSearchSize,
      transformSettingsNumFailureRetries,
      destinationIndex,
      destinationIngestPipeline,
      valid,
      dataViewTimeField,
      /* eslint-enable react-hooks/exhaustive-deps */
    ]);

    useEffect(() => {
      if (destIndexSameAsId === true && !transformIdEmpty && transformIdValid) {
        setDestinationIndex(transformId);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [destIndexSameAsId, transformId]);

    return (
      <div data-test-subj="transformStepDetailsForm">
        <EuiForm>
          <EuiFormRow
            label={i18n.translate('xpack.transform.stepDetailsForm.transformIdLabel', {
              defaultMessage: 'Transform ID',
            })}
            isInvalid={(!transformIdEmpty && !transformIdValid) || transformIdExists}
            error={[
              ...(!transformIdEmpty && !transformIdValid
                ? [
                    i18n.translate('xpack.transform.stepDetailsForm.transformIdInvalidError', {
                      defaultMessage:
                        'Must contain lowercase alphanumeric characters (a-z and 0-9), hyphens, and underscores only and must start and end with alphanumeric characters.',
                    }),
                  ]
                : []),
              ...(transformIdExists
                ? [
                    i18n.translate('xpack.transform.stepDetailsForm.transformIdExistsError', {
                      defaultMessage: 'A transform with this ID already exists.',
                    }),
                  ]
                : []),
            ]}
          >
            <EuiFieldText
              value={transformId}
              onChange={(e) => setTransformId(e.target.value)}
              aria-label={i18n.translate(
                'xpack.transform.stepDetailsForm.transformIdInputAriaLabel',
                {
                  defaultMessage: 'Choose a unique transform ID.',
                }
              )}
              isInvalid={(!transformIdEmpty && !transformIdValid) || transformIdExists}
              data-test-subj="transformIdInput"
            />
          </EuiFormRow>
          <EuiFormRow
            label={i18n.translate('xpack.transform.stepDetailsForm.transformDescriptionLabel', {
              defaultMessage: 'Transform description',
            })}
          >
            <EuiTextArea
              placeholder={i18n.translate(
                'xpack.transform.stepDetailsForm.transformDescriptionPlaceholderText',
                { defaultMessage: 'Description (optional)' }
              )}
              value={transformDescription}
              onChange={(e) => setTransformDescription(e.target.value)}
              aria-label={i18n.translate(
                'xpack.transform.stepDetailsForm.transformDescriptionInputAriaLabel',
                {
                  defaultMessage: 'Choose an optional transform description.',
                }
              )}
              data-test-subj="transformDescriptionInput"
            />
          </EuiFormRow>

          <DestinationIndexForm
            createIndexLink={esIndicesCreateIndex}
            destinationIndex={destinationIndex}
            destinationIndexNameEmpty={indexNameEmpty}
            destinationIndexNameExists={indexNameExists}
            destinationIndexNameValid={indexNameValid}
            destIndexSameAsId={destIndexSameAsId}
            fullWidth={false}
            indexNameExistsMessage={i18n.translate(
              'xpack.transform.stepDetailsForm.destinationIndexHelpText',
              {
                defaultMessage:
                  'An index with this name already exists. Be aware that running this transform will modify this destination index.',
              }
            )}
            isJobCreated={transformIdExists}
            onDestinationIndexChange={setDestinationIndex}
            setDestIndexSameAsId={setDestIndexSameAsId}
            switchLabel={i18n.translate(
              'xpack.transform.stepDetailsForm.destinationIndexFormSwitchLabel',
              {
                defaultMessage: 'Use transform ID as destination index name',
              }
            )}
          />

          {ingestPipelineNames.length > 0 && (
            <EuiFormRow
              label={i18n.translate(
                'xpack.transform.stepDetailsForm.destinationIngestPipelineLabel',
                {
                  defaultMessage: 'Destination ingest pipeline',
                }
              )}
            >
              <EuiComboBox
                data-test-subj="transformDestinationPipelineSelect"
                aria-label={i18n.translate(
                  'xpack.transform.stepDetailsForm.destinationIngestPipelineAriaLabel',
                  {
                    defaultMessage: 'Select an ingest pipeline (optional)',
                  }
                )}
                placeholder={i18n.translate(
                  'xpack.transform.stepDetailsForm.destinationIngestPipelineComboBoxPlaceholder',
                  {
                    defaultMessage: 'Select an ingest pipeline (optional)',
                  }
                )}
                singleSelection={{ asPlainText: true }}
                options={ingestPipelineNames.map((label: string) => ({ label }))}
                selectedOptions={
                  destinationIngestPipeline !== '' ? [{ label: destinationIngestPipeline }] : []
                }
                onChange={(options) => setDestinationIngestPipeline(options[0]?.label ?? '')}
              />
            </EuiFormRow>
          )}

          {stepDefineState.transformFunction === TRANSFORM_FUNCTION.LATEST ? (
            <>
              <EuiSpacer size={'m'} />
              <EuiCallOut announceOnMount color="warning" iconType="warning" size="m">
                <p>
                  <FormattedMessage
                    id="xpack.transform.stepDetailsForm.destinationIndexWarning"
                    defaultMessage="Before you start the transform, use index templates or the {docsLink} to ensure the mappings for your destination index match the source index. Otherwise, the destination index is created with dynamic mappings. If the transform fails, check the messages tab on the Stack Management page for errors."
                    values={{
                      docsLink: (
                        <EuiLink href={esIndicesCreateIndex} target="_blank">
                          {i18n.translate('xpack.transform.stepDetailsForm.createIndexAPI', {
                            defaultMessage: 'Create index API',
                          })}
                        </EuiLink>
                      ),
                    }}
                  />
                </p>
              </EuiCallOut>
              <EuiSpacer size={'m'} />
            </>
          ) : null}

          <CreateDataViewForm
            canCreateDataView={canCreateDataView}
            createDataView={createDataView}
            dataViewTitleExists={dataViewTitleExists}
            setCreateDataView={setCreateDataView}
            dataViewAvailableTimeFields={destIndexAvailableTimeFields}
            dataViewTimeField={dataViewTimeField}
            onTimeFieldChanged={onTimeFieldChanged}
          />

          {/* Continuous mode */}
          <EuiFormRow
            helpText={
              isContinuousModeAvailable === false
                ? i18n.translate('xpack.transform.stepDetailsForm.continuousModeError', {
                    defaultMessage:
                      'Continuous mode is not available for indices without date fields.',
                  })
                : ''
            }
          >
            <EuiSwitch
              name="transformContinuousMode"
              label={i18n.translate('xpack.transform.stepCreateForm.continuousModeLabel', {
                defaultMessage: 'Continuous mode',
              })}
              checked={isContinuousModeEnabled === true}
              onChange={() => setContinuousModeEnabled(!isContinuousModeEnabled)}
              disabled={isContinuousModeAvailable === false}
              data-test-subj="transformContinuousModeSwitch"
            />
          </EuiFormRow>
          {isContinuousModeEnabled && (
            <>
              <EuiFormRow
                label={i18n.translate(
                  'xpack.transform.stepDetailsForm.continuousModeDateFieldLabel',
                  {
                    defaultMessage: 'Date field for continuous mode',
                  }
                )}
                helpText={i18n.translate(
                  'xpack.transform.stepDetailsForm.continuousModeDateFieldHelpText',
                  {
                    defaultMessage:
                      'Select the date field that can be used to identify new documents.',
                  }
                )}
              >
                <EuiSelect
                  options={sourceIndexDateFieldNames.map((text: string) => ({ text, value: text }))}
                  value={continuousModeDateField}
                  onChange={(e) => setContinuousModeDateField(e.target.value)}
                  data-test-subj="transformContinuousDateFieldSelect"
                />
              </EuiFormRow>
              <EuiFormRow
                label={i18n.translate('xpack.transform.stepDetailsForm.continuousModeDelayLabel', {
                  defaultMessage: 'Delay',
                })}
                isInvalid={!isContinuousModeDelayValid}
                error={
                  !isContinuousModeDelayValid && [
                    i18n.translate('xpack.transform.stepDetailsForm.continuousModeDelayError', {
                      defaultMessage: 'Invalid delay format',
                    }),
                  ]
                }
                helpText={i18n.translate(
                  'xpack.transform.stepDetailsForm.continuousModeDelayHelpText',
                  {
                    defaultMessage: 'Time delay between current time and latest input data time.',
                  }
                )}
              >
                <EuiFieldText
                  placeholder={i18n.translate(
                    'xpack.transform.stepDetailsForm.continuousModeDelayPlaceholderText',
                    {
                      defaultMessage: 'delay e.g. {exampleValue}',
                      values: { exampleValue: '60s' },
                    }
                  )}
                  value={continuousModeDelay}
                  onChange={(e) => setContinuousModeDelay(e.target.value)}
                  aria-label={i18n.translate(
                    'xpack.transform.stepDetailsForm.continuousModeAriaLabel',
                    {
                      defaultMessage: 'Choose a delay.',
                    }
                  )}
                  isInvalid={!isContinuousModeDelayValid}
                  data-test-subj="transformContinuousDelayInput"
                />
              </EuiFormRow>
            </>
          )}

          {/* Retention policy */}
          <EuiFormRow
            helpText={
              isRetentionPolicyAvailable === false
                ? i18n.translate('xpack.transform.stepDetailsForm.retentionPolicyError', {
                    defaultMessage:
                      'Retention policy settings are not available for indices without date fields.',
                  })
                : ''
            }
          >
            <EuiSwitch
              name="transformRetentionPolicy"
              label={i18n.translate('xpack.transform.stepCreateForm.retentionPolicyLabel', {
                defaultMessage: 'Retention policy',
              })}
              checked={isRetentionPolicyEnabled === true}
              onChange={() => setRetentionPolicyEnabled(!isRetentionPolicyEnabled)}
              disabled={isRetentionPolicyAvailable === false}
              data-test-subj="transformRetentionPolicySwitch"
            />
          </EuiFormRow>
          {isRetentionPolicyEnabled && isRetentionPolicyAvailable && (
            <>
              <EuiFormRow
                label={i18n.translate(
                  'xpack.transform.stepDetailsForm.retentionPolicyDateFieldLabel',
                  {
                    defaultMessage: 'Date field for retention policy',
                  }
                )}
                helpText={i18n.translate(
                  'xpack.transform.stepDetailsForm.retentionPolicyDateFieldHelpText',
                  {
                    defaultMessage:
                      'Select the date field that can be used to identify out of date documents in the destination index.',
                  }
                )}
              >
                <EuiSelect
                  options={destIndexAvailableTimeFields.map((text: string) => ({ text }))}
                  value={retentionPolicyDateField}
                  onChange={(e) => setRetentionPolicyDateField(e.target.value)}
                  data-test-subj="transformRetentionPolicyDateFieldSelect"
                />
              </EuiFormRow>
              <EuiFormRow
                label={i18n.translate(
                  'xpack.transform.stepDetailsForm.retentionPolicyMaxAgeLabel',
                  {
                    defaultMessage: 'Max age',
                  }
                )}
                isInvalid={!retentionPolicyMaxAgeEmpty && !isRetentionPolicyMaxAgeValid}
                error={
                  !retentionPolicyMaxAgeEmpty &&
                  !isRetentionPolicyMaxAgeValid && [retentionPolicyMaxAgeInvalidErrorMessage]
                }
                helpText={i18n.translate(
                  'xpack.transform.stepDetailsForm.retentionPolicyMaxAgeHelpText',
                  {
                    defaultMessage:
                      'Documents that are older than the configured value will be removed from the destination index.',
                  }
                )}
              >
                <EuiFieldText
                  placeholder={i18n.translate(
                    'xpack.transform.stepDetailsForm.retentionPolicyMaxAgePlaceholderText',
                    {
                      defaultMessage: 'max_age e.g. {exampleValue}',
                      values: { exampleValue: '7d' },
                    }
                  )}
                  value={retentionPolicyMaxAge}
                  onChange={(e) => setRetentionPolicyMaxAge(e.target.value)}
                  aria-label={i18n.translate(
                    'xpack.transform.stepDetailsForm.retentionPolicyMaxAgeAriaLabel',
                    {
                      defaultMessage: 'Choose a max age.',
                    }
                  )}
                  isInvalid={!retentionPolicyMaxAgeEmpty && !isRetentionPolicyMaxAgeValid}
                  data-test-subj="transformRetentionPolicyMaxAgeInput"
                />
              </EuiFormRow>
            </>
          )}

          <EuiSpacer size="l" />

          <EuiAccordion
            data-test-subj="transformWizardAccordionAdvancedSettings"
            id="transformWizardAccordionAdvancedSettings"
            buttonContent={i18n.translate(
              'xpack.transform.stepDetailsForm.advancedSettingsAccordionButtonContent',
              {
                defaultMessage: 'Advanced settings',
              }
            )}
            paddingSize="s"
          >
            <EuiFormRow
              label={i18n.translate('xpack.transform.stepDetailsForm.frequencyLabel', {
                defaultMessage: 'Frequency',
              })}
              isInvalid={!isTransformFrequencyValid}
              error={
                !isTransformFrequencyValid && [
                  i18n.translate('xpack.transform.stepDetailsForm.frequencyError', {
                    defaultMessage: 'Invalid frequency format',
                  }),
                ]
              }
              helpText={i18n.translate('xpack.transform.stepDetailsForm.frequencyHelpText', {
                defaultMessage:
                  'The interval to check for changes in source indices when the transform runs continuously.',
              })}
            >
              <EuiFieldText
                placeholder={i18n.translate(
                  'xpack.transform.stepDetailsForm.editFlyoutFormFrequencyPlaceholderText',
                  {
                    defaultMessage: 'Default: {defaultValue}',
                    values: { defaultValue: DEFAULT_TRANSFORM_FREQUENCY },
                  }
                )}
                value={transformFrequency}
                onChange={(e) => setTransformFrequency(e.target.value)}
                aria-label={i18n.translate('xpack.transform.stepDetailsForm.frequencyAriaLabel', {
                  defaultMessage: 'Choose a frequency.',
                })}
                isInvalid={!isTransformFrequencyValid}
                data-test-subj="transformFrequencyInput"
              />
            </EuiFormRow>

            <EuiFormRow
              label={i18n.translate('xpack.transform.stepDetailsForm.maxPageSearchSizeLabel', {
                defaultMessage: 'Maximum page search size',
              })}
              isInvalid={!isTransformSettingsMaxPageSearchSizeValid}
              error={transformSettingsMaxPageSearchSizeErrors}
              helpText={i18n.translate(
                'xpack.transform.stepDetailsForm.maxPageSearchSizeHelpText',
                {
                  defaultMessage:
                    'The initial page size to use for the composite aggregation for each checkpoint.',
                }
              )}
            >
              <EuiFieldText
                placeholder={i18n.translate(
                  'xpack.transform.stepDetailsForm.editFlyoutFormMaxPageSearchSizePlaceholderText',
                  {
                    defaultMessage: 'Default: {defaultValue}',
                    values: {
                      defaultValue:
                        stepDefineState.transformFunction === TRANSFORM_FUNCTION.LATEST
                          ? DEFAULT_TRANSFORM_SETTINGS_MAX_PAGE_SEARCH_SIZE_LATEST
                          : DEFAULT_TRANSFORM_SETTINGS_MAX_PAGE_SEARCH_SIZE,
                    },
                  }
                )}
                value={
                  transformSettingsMaxPageSearchSize
                    ? transformSettingsMaxPageSearchSize.toString()
                    : transformSettingsMaxPageSearchSize
                }
                onChange={(e) => {
                  if (e.target.value !== '') {
                    const parsed = parseInt(e.target.value, 10);
                    setTransformSettingsMaxPageSearchSize(isFinite(parsed) ? parsed : undefined);
                  } else {
                    setTransformSettingsMaxPageSearchSize(undefined);
                  }
                }}
                aria-label={i18n.translate(
                  'xpack.transform.stepDetailsForm.maxPageSearchSizeAriaLabel',
                  {
                    defaultMessage: 'Choose a maximum page search size.',
                  }
                )}
                isInvalid={!isTransformSettingsMaxPageSearchSizeValid}
                data-test-subj="transformMaxPageSearchSizeInput"
              />
            </EuiFormRow>
            <EuiFormRow
              data-test-subj="transformNumFailureRetriesFormRow"
              label={i18n.translate(
                'xpack.transform.stepDetailsForm.transformNumFailureRetriesLabel',
                {
                  defaultMessage: 'Number of failure retries',
                }
              )}
              isInvalid={!isTransformSettingsNumFailureRetriesValid}
              error={
                !isTransformSettingsNumFailureRetriesValid && [
                  i18n.translate('xpack.transform.stepDetailsForm.NumFailureRetriesError', {
                    defaultMessage:
                      'Number of retries needs to be between 0 and 100, or -1 for infinite retries.',
                  }),
                ]
              }
              helpText={i18n.translate(
                'xpack.transform.stepDetailsForm.transformNumRetriesHelpText',
                {
                  defaultMessage:
                    'The number of retries on a recoverable failure before the transform task is marked as failed. Set it to -1 for infinite retries.',
                }
              )}
            >
              <EuiFieldText
                value={
                  transformSettingsNumFailureRetries ||
                  (transformSettingsNumFailureRetries !== undefined &&
                    Number(transformSettingsNumFailureRetries) >= -1)
                    ? transformSettingsNumFailureRetries.toString()
                    : ''
                }
                onChange={(e) => {
                  if (e.target.value === '') {
                    setTransformSettingsNumFailureRetries(undefined);
                    return;
                  }
                  setTransformSettingsNumFailureRetries(
                    e.target.value === '-' ? '-' : parseInt(e.target.value, 10)
                  );
                }}
                aria-label={i18n.translate(
                  'xpack.transform.stepDetailsForm.numFailureRetriesAriaLabel',
                  {
                    defaultMessage: 'Choose a maximum number of retries.',
                  }
                )}
                isInvalid={!isTransformSettingsNumFailureRetriesValid}
                data-test-subj="transformNumFailureRetriesInput"
              />
            </EuiFormRow>
            <EuiFormRow
              helpText={i18n.translate('xpack.transform.stepDetailsForm.deferValidationHelpText', {
                defaultMessage:
                  'Skips validation of the source index and the destination pipeline when creating the transform. Use this option when the source index is very large and validation would time out.',
              })}
            >
              <EuiSwitch
                name="transformDeferValidation"
                label={i18n.translate('xpack.transform.stepDetailsForm.deferValidationLabel', {
                  defaultMessage: 'Skip validation',
                })}
                checked={deferValidation}
                onChange={() => setDeferValidation(!deferValidation)}
                data-test-subj="transformDeferValidationSwitch"
              />
            </EuiFormRow>
          </EuiAccordion>
        </EuiForm>
      </div>
    );
  }
);
