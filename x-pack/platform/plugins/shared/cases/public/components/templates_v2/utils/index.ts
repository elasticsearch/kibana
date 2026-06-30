/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiStepStatus } from '@elastic/eui';
import { getTemplate } from '../api/api';
export { getYamlDefaultAsString } from '../../../../common/utils/template_fields';

export const stringToInteger = (value?: string | number): number | undefined => {
  const num = Number(value);

  if (isNaN(num)) {
    return;
  }

  return num;
};

export const stringToIntegerWithDefault = (
  value: string | number,
  defaultValue: number
): number => {
  const valueAsInteger = stringToInteger(value);

  return valueAsInteger && valueAsInteger > 0 ? valueAsInteger : defaultValue;
};

export const getStepStatus = (step: number, currentStep: number): EuiStepStatus => {
  if (step === currentStep) {
    return 'current';
  }
  if (step < currentStep) {
    return 'complete';
  }
  return 'incomplete';
};

export const checkTemplateExists = async (templateId: string): Promise<boolean> => {
  try {
    await getTemplate({ templateId });
    return true;
  } catch {
    return false;
  }
};
