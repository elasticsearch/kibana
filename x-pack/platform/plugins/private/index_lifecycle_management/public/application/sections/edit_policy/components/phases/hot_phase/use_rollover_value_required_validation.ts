/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useState, useEffect } from 'react';
import { get } from 'lodash';
import type { ValidationError } from '../../../../../../shared_imports';
import { useFormData, useFormContext } from '../../../../../../shared_imports';
import { ROLLOVER_TRIGGER_FIELD_PATHS, ROLLOVER_TRIGGER_FIELD_PATH } from '../../../constants';
import { ROLLOVER_VALUE_REQUIRED_VALIDATION_CODE } from '../../../form';

const rolloverFieldPaths = [
  ROLLOVER_TRIGGER_FIELD_PATH,
  ...Object.values(ROLLOVER_TRIGGER_FIELD_PATHS),
];

export const useRolloverValueRequiredValidation = (): boolean => {
  const [isValid, setIsValid] = useState(false);
  const [formData] = useFormData({ watch: rolloverFieldPaths });
  const { getFields } = useFormContext();

  useEffect(() => {
    const fields = getFields();
    const rolloverFieldErrors: ValidationError[] = Object.values(
      ROLLOVER_TRIGGER_FIELD_PATHS
    ).flatMap((rolloverFieldPath) => get(fields, rolloverFieldPath)?.errors ?? []);

    setIsValid(
      rolloverFieldErrors.some(
        (validation) => validation.code === ROLLOVER_VALUE_REQUIRED_VALIDATION_CODE
      )
    );
  }, [getFields, formData]);

  return isValid;
};
