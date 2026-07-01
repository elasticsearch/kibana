/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import { EuiFieldText, EuiFormRow } from '@elastic/eui';
import { Controller, useFormContext } from 'react-hook-form';
import type { FormValues } from '../types';
import { DEFAULT_RULE_NAME } from '../constants';
import { useRuleFormMeta } from '../contexts';

const NAME_ROW_ID = 'ruleV2FormNameField';

export const NameField = () => {
  const { control } = useFormContext<FormValues>();
  const { layout } = useRuleFormMeta();

  return (
    <Controller
      name="metadata.name"
      control={control}
      rules={{
        validate: (value) => {
          if (!value || !value.trim()) {
            return i18n.translate('xpack.alertingV2.ruleForm.nameRequiredError', {
              defaultMessage: 'Name is required.',
            });
          }
          if (value.trim() === DEFAULT_RULE_NAME) {
            return i18n.translate('xpack.alertingV2.ruleForm.nameRequiredError', {
              defaultMessage: 'Name is required.',
            });
          }
          return true;
        },
      }}
      render={({ field: { ref, ...field }, fieldState: { error } }) => (
        <EuiFormRow
          id={NAME_ROW_ID}
          label={i18n.translate('xpack.alertingV2.ruleForm.nameLabel', {
            defaultMessage: 'Name',
          })}
          fullWidth
          isInvalid={!!error}
          error={error?.message}
        >
          <EuiFieldText
            {...field}
            autoFocus={layout === 'flyout'}
            value={field.value ?? ''}
            inputRef={ref}
            fullWidth
            isInvalid={!!error}
            compressed={layout === 'flyout'}
            placeholder={i18n.translate('xpack.alertingV2.ruleForm.namePlaceholder', {
              defaultMessage: 'Untitled rule',
            })}
            aria-label={i18n.translate('xpack.alertingV2.ruleForm.nameAriaLabel', {
              defaultMessage: 'Rule name',
            })}
            data-test-subj="ruleNameInput"
          />
        </EuiFormRow>
      )}
    />
  );
};
