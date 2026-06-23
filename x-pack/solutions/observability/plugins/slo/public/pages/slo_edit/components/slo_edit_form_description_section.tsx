/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiComboBoxOptionOption } from '@elastic/eui';
import {
  EuiComboBox,
  EuiFieldText,
  EuiFormRow,
  EuiPanel,
  EuiTextArea,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import React from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { DashboardsSelector } from '@kbn/dashboards-selector';
import { useKibana } from '../../../hooks/use_kibana';
import { useFetchSLOSuggestions } from '../hooks/use_fetch_suggestions';
import type { CreateSLOForm } from '../types';
import { OptionalText } from './common/optional_text';
import { MAX_WIDTH } from '../constants';

export function SloEditFormDescriptionSection() {
  const { control, getFieldState } = useFormContext<CreateSLOForm>();
  const sloNameId = useGeneratedHtmlId({ prefix: 'sloName' });
  const descriptionId = useGeneratedHtmlId({ prefix: 'sloDescription' });
  const tagsId = useGeneratedHtmlId({ prefix: 'tags' });

  const { suggestions } = useFetchSLOSuggestions();
  const { services } = useKibana();
  const { uiActions } = services;

  return (
    <EuiPanel
      hasBorder={false}
      hasShadow={false}
      paddingSize="none"
      style={{ maxWidth: MAX_WIDTH }}
      data-test-subj="sloEditFormDescriptionSection"
    >
      <EuiFormRow
        fullWidth
        isInvalid={getFieldState('name').invalid}
        error={getFieldState('name').error?.message}
        label={i18n.translate('xpack.slo.sloEdit.description.sloName', {
          defaultMessage: 'SLO Name',
        })}
      >
        <Controller
          name="name"
          control={control}
          rules={{
            required: i18n.translate('xpack.slo.sloEdit.description.sloNameRequired', {
              defaultMessage: 'SLO name cannot be empty.',
            }),
          }}
          render={({ field: { ref, ...field }, fieldState }) => (
            <EuiFieldText
              {...field}
              fullWidth
              isInvalid={fieldState.invalid}
              id={sloNameId}
              data-test-subj="sloFormNameInput"
              placeholder={i18n.translate('xpack.slo.sloEdit.description.sloNamePlaceholder', {
                defaultMessage: 'Name for the SLO',
              })}
            />
          )}
        />
      </EuiFormRow>

      <EuiFormRow
        fullWidth
        label={i18n.translate('xpack.slo.sloEdit.description.sloDescription', {
          defaultMessage: 'Description',
        })}
        labelAppend={<OptionalText />}
      >
        <Controller
          name="description"
          defaultValue=""
          control={control}
          rules={{ required: false }}
          render={({ field: { ref, ...field } }) => (
            <EuiTextArea
              {...field}
              fullWidth
              id={descriptionId}
              data-test-subj="sloFormDescriptionTextArea"
              placeholder={i18n.translate(
                'xpack.slo.sloEdit.description.sloDescriptionPlaceholder',
                {
                  defaultMessage: 'A short description of the SLO',
                }
              )}
            />
          )}
        />
      </EuiFormRow>

      <EuiFormRow
        fullWidth
        label={i18n.translate('xpack.slo.sloEdit.tags.label', {
          defaultMessage: 'Tags',
        })}
        labelAppend={<OptionalText />}
      >
        <Controller
          name="tags"
          control={control}
          defaultValue={[]}
          rules={{ required: false }}
          render={({ field: { ref, ...field }, fieldState }) => (
            <EuiComboBox
              {...field}
              id={tagsId}
              fullWidth
              aria-label={i18n.translate('xpack.slo.sloEdit.tags.placeholder', {
                defaultMessage: 'Add tags',
              })}
              placeholder={i18n.translate('xpack.slo.sloEdit.tags.placeholder', {
                defaultMessage: 'Add tags',
              })}
              isInvalid={fieldState.invalid}
              options={suggestions?.tags ?? []}
              selectedOptions={generateTagOptions(field.value)}
              onChange={(selected: EuiComboBoxOptionOption[]) => {
                if (selected.length) {
                  return field.onChange(selected.map((opts) => opts.value));
                }

                field.onChange([]);
              }}
              onCreateOption={(searchValue: string, options: EuiComboBoxOptionOption[] = []) => {
                const normalizedSearchValue = searchValue.trim().toLowerCase();

                if (!normalizedSearchValue) {
                  return;
                }
                const values = field.value ?? [];

                if (
                  values.findIndex((tag) => tag.trim().toLowerCase() === normalizedSearchValue) ===
                  -1
                ) {
                  field.onChange([...values, searchValue]);
                }
              }}
              isClearable
              data-test-subj="sloEditTagsSelector"
            />
          )}
        />
      </EuiFormRow>
      <EuiFormRow
        fullWidth
        label={i18n.translate('xpack.slo.sloEdit.dashboards.label', {
          defaultMessage: 'Linked dashboards',
        })}
        labelAppend={<OptionalText />}
      >
        <Controller
          name="artifacts.dashboards"
          control={control}
          defaultValue={undefined}
          render={({ field }) => (
            <DashboardsSelector
              uiActions={uiActions}
              dashboardsFormData={field.value ?? []}
              placeholder={DASHBOARDS_COMBOBOX_PLACEHOLDER}
              onChange={(selected) => field.onChange(selected.map((d) => ({ id: d.value })))}
            />
          )}
        />
      </EuiFormRow>
    </EuiPanel>
  );
}

function generateTagOptions(tags: string[] = []) {
  return tags.map((tag) => ({
    label: tag,
    value: tag,
    'data-test-subj': `${tag}Option`,
  }));
}

const DASHBOARDS_COMBOBOX_PLACEHOLDER = i18n.translate('xpack.slo.sloEdit.dashboards.placeholder', {
  defaultMessage: 'Add dashboards',
});
