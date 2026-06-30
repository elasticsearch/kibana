/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useCallback } from 'react';
import type { DataViewFieldMap } from '@kbn/data-views-plugin/common';
import { Controller, useWatch, useFormContext } from 'react-hook-form';
import { EuiSelect, EuiFormRow } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { FormValues } from '../types';
import { getTimeFieldOptions } from '../utils';
import { getBreachQuery } from '../utils/query_helpers';
import { useDataFields } from '../hooks/use_data_fields';
import { useRuleFormServices, useRuleFormMeta } from '../contexts';

const PREFERRED_TIME_FIELD = '@timestamp';

const REQUIRED_MESSAGE = i18n.translate('xpack.alertingV2.ruleForm.timeFieldRequired', {
  defaultMessage: 'A time field is required.',
});

const NO_TIME_FIELDS_OPTION = {
  text: i18n.translate('xpack.alertingV2.ruleForm.timeField.noTimeFields', {
    defaultMessage: 'No time fields available',
  }),
  value: '',
};

export const TimeFieldSelect = () => {
  const { http, dataViews } = useRuleFormServices();
  const { layout } = useRuleFormMeta();
  const { control, setValue, getValues } = useFormContext<FormValues>();
  const ruleQuery = useWatch({ name: 'query', control });
  const query = getBreachQuery(ruleQuery);

  const handleAutoSelect = useCallback(
    (fields: DataViewFieldMap) => {
      const options = getTimeFieldOptions(fields);

      // Auto-select a time field when options load
      const currentValue = getValues('timeField');
      const isCurrentValueValid = options.some((opt) => opt.value === currentValue);

      // Only auto-select if current value is empty or invalid
      if (!currentValue || !isCurrentValueValid) {
        const preferredField = options.find((opt) => opt.value === PREFERRED_TIME_FIELD);
        const selectedField = preferredField?.value || options[0]?.value || '';

        if (selectedField) {
          setValue('timeField', selectedField, { shouldValidate: true });
        } else {
          setValue('timeField', '', { shouldValidate: true });
        }
      }
    },
    [getValues, setValue]
  );

  const { data, isLoading } = useDataFields({
    query,
    http,
    dataViews,
    onSuccess: handleAutoSelect,
  });

  const timeFieldOptions = useMemo(() => {
    const options = getTimeFieldOptions(data ?? {});
    return options.length > 0 ? options : [NO_TIME_FIELDS_OPTION];
  }, [data]);

  return (
    <Controller
      name="timeField"
      control={control}
      rules={{
        required: REQUIRED_MESSAGE,
      }}
      render={({ field: { value, onChange, ref }, fieldState: { error } }) => {
        const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
          onChange(e.target.value);
        };

        return (
          <EuiFormRow
            label={i18n.translate('xpack.alertingV2.ruleForm.timeFieldLabel', {
              defaultMessage: 'Time Field',
            })}
            isInvalid={!!error}
            error={error?.message}
            fullWidth
          >
            {/* used eslint-disable-next-line to bypass EUI's isInvalid prop check since we're handling validation via 
            react-hook-form to keep the scroll to error and to not disply additional error messages */}
            {/* eslint-disable-next-line @elastic/eui/consistent-is-invalid-props */}
            <EuiSelect
              options={timeFieldOptions}
              value={value ?? ''}
              onChange={handleChange}
              aria-label={i18n.translate('xpack.alertingV2.ruleForm.timeFieldSelect.ariaLabel', {
                defaultMessage: 'Select time field for rule execution',
              })}
              inputRef={ref}
              isLoading={isLoading}
              fullWidth
              compressed={layout === 'flyout'}
            />
          </EuiFormRow>
        );
      }}
    />
  );
};
