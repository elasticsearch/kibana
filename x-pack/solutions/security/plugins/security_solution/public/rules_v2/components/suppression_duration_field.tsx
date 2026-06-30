/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { MAX_DURATION, validateMaxDuration } from '@kbn/alerting-v2-schemas';
import { i18n } from '@kbn/i18n';
import { EuiFormRow, EuiIconTip } from '@elastic/eui';
import { Controller, useFormContext } from 'react-hook-form';
import { DurationInput, useRuleFormMeta } from '@kbn/alerting-v2-rule-form';
import type { FormValues } from '@kbn/alerting-v2-rule-form';
import * as translations from '../translations';

const SUPPRESSION_DURATION_ROW_ID = 'ruleV2FormSuppressionDurationField';

export const SuppressionDurationField = () => {
  const { control } = useFormContext<FormValues>();
  const { layout } = useRuleFormMeta();

  return (
    <Controller
      control={control}
      name="grouping.duration"
      rules={{
        validate: (value) => {
          if (!value) return true;
          const error = validateMaxDuration(value, MAX_DURATION);
          if (error) {
            return i18n.translate('xpack.securitySolution.rulesV2.suppressionDuration.maxError', {
              defaultMessage: 'Suppression window cannot exceed {max}.',
              values: { max: MAX_DURATION },
            });
          }
          return true;
        },
      }}
      render={({ field, fieldState: { error } }) => (
        <EuiFormRow
          id={SUPPRESSION_DURATION_ROW_ID}
          label={translations.SUPPRESSION_DURATION_LABEL}
          helpText={
            <>
              {translations.SUPPRESSION_DURATION_HELP}
              &nbsp;
              <EuiIconTip
                position="right"
                type="question"
                content={i18n.translate(
                  'xpack.securitySolution.rulesV2.suppressionDuration.tooltip',
                  {
                    defaultMessage:
                      'Anchored to the first event in the episode. When the window elapses, subsequent matches create a new episode instead of extending the existing one.',
                  }
                )}
              />
            </>
          }
          isInvalid={!!error}
          fullWidth
        >
          <DurationInput
            ref={field.ref}
            value={field.value ?? '0m'}
            onChange={field.onChange}
            fallback="0m"
            errors={error?.message}
            numberLabel={i18n.translate(
              'xpack.securitySolution.rulesV2.suppressionDuration.numberLabel',
              { defaultMessage: 'Window' }
            )}
            unitAriaLabel={i18n.translate(
              'xpack.securitySolution.rulesV2.suppressionDuration.unitAriaLabel',
              { defaultMessage: 'Unit' }
            )}
            dataTestSubj="suppressionDuration"
            idPrefix="suppressionDuration"
            compressed={layout === 'flyout'}
          />
        </EuiFormRow>
      )}
    />
  );
};
