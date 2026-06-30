/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

// APM settings store comma-separated index-pattern expressions, so keep their bound
// aligned with Kibana's broader index-pattern (index_management) `maxLength` adoption.
export const APM_INDEX_PATTERN_MAX_LENGTH = 1000;

export const APM_INDEX_SETTING_KEYS = [
  'transaction',
  'span',
  'error',
  'metric',
  'onboarding',
  'sourcemap',
] as const;

export type ApmIndexSettingKey = (typeof APM_INDEX_SETTING_KEYS)[number];

export type ApmIndexValidationErrors = Partial<Record<ApmIndexSettingKey, string>>;
export type ApmIndexValidationValues = Partial<Record<ApmIndexSettingKey, string | undefined>>;

function getApmIndexMaxLengthError() {
  return i18n.translate('xpack.apmSourcesAccess.apmIndices.validation.maxLength', {
    defaultMessage: 'Must be {maxLength} characters or fewer',
    values: { maxLength: APM_INDEX_PATTERN_MAX_LENGTH },
  });
}

function validateApmIndexPattern(value: string) {
  if (value.length > APM_INDEX_PATTERN_MAX_LENGTH) {
    return getApmIndexMaxLengthError();
  }
}

const apmIndexValidators: Record<ApmIndexSettingKey, (value: string) => string | undefined> = {
  transaction: validateApmIndexPattern,
  span: validateApmIndexPattern,
  error: validateApmIndexPattern,
  metric: validateApmIndexPattern,
  onboarding: validateApmIndexPattern,
  sourcemap: validateApmIndexPattern,
};

export function validateApmIndexSetting(
  setting: ApmIndexSettingKey,
  value?: string
): string | undefined {
  if (!value) {
    return;
  }

  return apmIndexValidators[setting](value);
}

export function validateApmIndices(values: ApmIndexValidationValues): ApmIndexValidationErrors {
  return APM_INDEX_SETTING_KEYS.reduce<ApmIndexValidationErrors>((errors, setting) => {
    const validationError = validateApmIndexSetting(setting, values[setting]);

    if (validationError) {
      errors[setting] = validationError;
    }

    return errors;
  }, {});
}
