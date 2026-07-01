/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import { EuiFormRow, EuiTextArea } from '@elastic/eui';
import { Controller, useFormContext } from 'react-hook-form';
import type { FormValues } from '../types';
import { useRuleFormMeta } from '../contexts';

const DESCRIPTION_ROW_ID = 'ruleV2FormDescriptionField';

export const DescriptionField = () => {
  const { control } = useFormContext<FormValues>();
  const { layout } = useRuleFormMeta();

  return (
    <Controller
      name="metadata.description"
      control={control}
      render={({ field: { ref, ...field }, fieldState: { error } }) => (
        <EuiFormRow
          id={DESCRIPTION_ROW_ID}
          label={i18n.translate('xpack.alertingV2.ruleForm.descriptionLabel', {
            defaultMessage: 'Description',
          })}
          fullWidth
          isInvalid={!!error}
          error={error?.message}
        >
          <EuiTextArea
            {...field}
            inputRef={ref}
            rows={2}
            fullWidth
            isInvalid={!!error}
            compressed={layout === 'flyout'}
            placeholder={i18n.translate('xpack.alertingV2.ruleForm.descriptionPlaceholder', {
              defaultMessage: 'Add an optional description for this rule...',
            })}
            data-test-subj="ruleDescriptionInput"
          />
        </EuiFormRow>
      )}
    />
  );
};
