/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FunctionComponent } from 'react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiForm,
  EuiFormRow,
  EuiSelect,
  EuiSpacer,
  EuiText,
  EuiTextArea,
  EuiTitle,
} from '@elastic/eui';
import { useController, useForm } from 'react-hook-form';

import type { DataSetWithName, DataSource } from '../../common';
import { DATA_SOURCE_TYPES_TO_HELP_TEXT } from '../../common';
import { getFlyoutSaveErrorMessage } from '../get_flyout_save_error_message';
import {
  buildDatasetSettingsFromFormValues,
  type CreateDatasetFormValues,
} from './create_dataset_flyout_form_state';
import { createDatasetFlyoutStrings } from './create_dataset_flyout_i18n';
import { CreateDatasetFlyoutSettings } from './create_dataset_flyout_settings';
import {
  dataSetToFlyoutFormValues,
  emptyDatasetFlyoutFormValues,
} from './dataset_flyout_initial_values';

export type { CreateDatasetFormValues } from './create_dataset_flyout_form_state';

export interface CreateDatasetFlyoutProps {
  /** When set, the flyout opens in edit mode for this data set. */
  initialDataSet?: DataSetWithName;
  /** Existing names to prevent duplicates (create mode only). */
  existingDataSetNames?: readonly string[];
  onClose: () => void;
  /**
   * Persist a data set (create or update). Resolve `null` on success, or an error message to show in the flyout.
   */
  onSave: (data: DataSetWithName, previousId?: string) => Promise<string | null>;
  /** Data sources used to populate the data source selector (typically `DataSourcesClient.get()`). */
  dataSources: DataSource[];
}

const trimRequired =
  (message: string) =>
  (value: string): true | string =>
    value?.trim() ? true : message;

export const CreateDatasetFlyout: FunctionComponent<CreateDatasetFlyoutProps> = ({
  initialDataSet,
  existingDataSetNames = [],
  onClose,
  onSave,
  dataSources,
}) => {
  const isEditMode = initialDataSet !== undefined;
  const initialIdNormalized = initialDataSet?.name?.trim().toLowerCase() ?? '';
  const [saveError, setSaveError] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const flyoutTopRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (saveError) {
      flyoutTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [saveError]);

  const formDefaultValues = useMemo(
    (): CreateDatasetFormValues =>
      initialDataSet ? dataSetToFlyoutFormValues(initialDataSet) : emptyDatasetFlyoutFormValues(),
    [initialDataSet]
  );

  const {
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<CreateDatasetFormValues>({
    defaultValues: formDefaultValues,
  });

  useEffect(() => {
    if (!initialDataSet) {
      return;
    }
    reset(dataSetToFlyoutFormValues(initialDataSet));
  }, [initialDataSet, reset]);

  const { field: nameField } = useController({
    name: 'name',
    control,
    rules: {
      validate: (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) {
          return createDatasetFlyoutStrings.nameRequired();
        }

        const normalized = trimmed.toLowerCase();
        const isDuplicate = existingDataSetNames.some((n) => {
          const nNormalized = n.trim().toLowerCase();
          if (isEditMode && nNormalized === initialIdNormalized) {
            return false;
          }
          return nNormalized === normalized;
        });
        return isDuplicate ? createDatasetFlyoutStrings.nameAlreadyExists() : true;
      },
    },
  });

  const { field: descriptionField } = useController({
    name: 'description',
    control,
  });

  const { field: dataSourceIdField } = useController({
    name: 'data_source',
    control,
    rules: {
      validate: trimRequired(createDatasetFlyoutStrings.dataSourceRequired()),
    },
  });

  const { field: resourceField } = useController({
    name: 'resource',
    control,
    rules: {
      validate: trimRequired(createDatasetFlyoutStrings.resourceRequired()),
    },
  });

  const dataSourceOptions = useMemo(() => {
    const placeholder = {
      value: '',
      text: createDatasetFlyoutStrings.dataSourcePlaceholder(),
    };
    const fromSources = dataSources.map((ds) => ({
      value: ds.name,
      text: ds.name,
    }));
    return [placeholder, ...fromSources];
  }, [dataSources]);

  const resourceHelpText = useMemo(() => {
    const selected = dataSources.find((ds) => ds.name === dataSourceIdField.value);
    if (!selected) {
      return createDatasetFlyoutStrings.resourceHelp();
    }
    return (
      DATA_SOURCE_TYPES_TO_HELP_TEXT[selected.type] ?? createDatasetFlyoutStrings.resourceHelp()
    );
  }, [dataSourceIdField.value, dataSources]);

  const onSubmit = async (values: CreateDatasetFormValues) => {
    setSaveError(undefined);
    setIsSaving(true);
    try {
      const desc = values.description?.trim();
      const settings = buildDatasetSettingsFromFormValues(values.settings);
      const payload: DataSetWithName = {
        name: values.name.trim(),
        data_source: values.data_source.trim(),
        resource: values.resource.trim(),
        ...(desc ? { description: desc } : {}),
        ...(settings ? { settings } : {}),
      };
      const message = await onSave(payload, initialDataSet?.name);
      if (message) {
        setSaveError(message);
      }
    } catch (error) {
      setSaveError(getFlyoutSaveErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const flyoutTitle = isEditMode
    ? createDatasetFlyoutStrings.editTitleWithId(initialDataSet?.name ?? '')
    : createDatasetFlyoutStrings.createTitle();

  return (
    <EuiFlyout
      ownFocus
      onClose={onClose}
      aria-labelledby="createDatasetFlyoutTitle"
      size="m"
      data-test-subj={isEditMode ? 'editDatasetFlyout' : 'createDatasetFlyout'}
    >
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="m">
          <h2 id="createDatasetFlyoutTitle">{flyoutTitle}</h2>
        </EuiTitle>
        {!isEditMode && (
          <>
            <EuiSpacer size="s" />
            <EuiText size="s" color="subdued">
              <p>{createDatasetFlyoutStrings.createDescription()}</p>
            </EuiText>
          </>
        )}
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        <div ref={flyoutTopRef} />
        <EuiForm component="form" id="createDatasetForm" onSubmit={handleSubmit(onSubmit)}>
          {saveError ? (
            <>
              <EuiText color="danger" size="s" data-test-subj="createDatasetFlyoutSaveError">
                {saveError}
              </EuiText>
              <EuiSpacer size="m" />
            </>
          ) : null}
          <EuiFormRow
            label={createDatasetFlyoutStrings.dataSourceLabel()}
            fullWidth
            helpText={createDatasetFlyoutStrings.dataSourceHelp()}
            isInvalid={Boolean(errors.data_source)}
            error={errors.data_source?.message}
          >
            <EuiSelect
              options={dataSourceOptions}
              data-test-subj="createDatasetFlyoutDataSource"
              fullWidth
              aria-label={createDatasetFlyoutStrings.dataSourceLabel()}
              value={dataSourceIdField.value}
              onChange={(e) => dataSourceIdField.onChange(e.target.value)}
              name={dataSourceIdField.name}
              inputRef={dataSourceIdField.ref}
              disabled={dataSources.length === 0}
              isInvalid={Boolean(errors.data_source)}
            />
          </EuiFormRow>
          <EuiFormRow
            label={createDatasetFlyoutStrings.nameLabel()}
            helpText={createDatasetFlyoutStrings.nameHelp()}
            fullWidth
            isInvalid={Boolean(errors.name)}
            error={errors.name?.message}
          >
            <EuiFieldText
              data-test-subj="createDatasetFlyoutName"
              autoFocus={!isEditMode}
              fullWidth
              isInvalid={Boolean(errors.name)}
              value={nameField.value}
              onChange={(e) => nameField.onChange(e.target.value)}
              name={nameField.name}
              inputRef={nameField.ref}
            />
          </EuiFormRow>
          <EuiFormRow label={createDatasetFlyoutStrings.descriptionLabel()} fullWidth>
            <EuiTextArea
              data-test-subj="createDatasetFlyoutDescription"
              fullWidth
              rows={1}
              value={descriptionField.value}
              onChange={(e) => descriptionField.onChange(e.target.value)}
              name={descriptionField.name}
              inputRef={descriptionField.ref}
            />
          </EuiFormRow>
          {dataSourceIdField.value ? (
            <EuiFormRow
              label={createDatasetFlyoutStrings.resourceLabel()}
              helpText={resourceHelpText}
              fullWidth
              isInvalid={Boolean(errors.resource)}
              error={errors.resource?.message}
            >
              <EuiFieldText
                data-test-subj="createDatasetFlyoutResource"
                fullWidth
                autoComplete="off"
                isInvalid={Boolean(errors.resource)}
                value={resourceField.value}
                onChange={(e) => resourceField.onChange(e.target.value)}
                name={resourceField.name}
                inputRef={resourceField.ref}
              />
            </EuiFormRow>
          ) : null}
          {dataSourceIdField.value ? <CreateDatasetFlyoutSettings control={control} /> : null}
        </EuiForm>
      </EuiFlyoutBody>
      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty data-test-subj="createDatasetFlyoutCancel" onClick={onClose}>
              {createDatasetFlyoutStrings.cancelButton()}
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton
              fill
              type="submit"
              data-test-subj="createDatasetFlyoutSubmit"
              form="createDatasetForm"
              isLoading={isSaving}
              disabled={isSaving || dataSources.length === 0}
            >
              {isEditMode
                ? createDatasetFlyoutStrings.saveButton()
                : createDatasetFlyoutStrings.addButton()}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};
