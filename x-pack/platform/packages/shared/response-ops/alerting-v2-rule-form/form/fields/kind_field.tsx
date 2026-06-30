/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import type { FormValues } from '../types';
import { ModeSelect } from './mode_select';

interface KindFieldProps {
  disabled?: boolean;
}

export const KindField = ({ disabled = false }: KindFieldProps) => {
  const { control } = useFormContext<FormValues>();

  return (
    <Controller
      name="kind"
      control={control}
      render={({ field: { value, onChange } }) => (
        <ModeSelect
          value={value}
          onChange={onChange}
          disabled={disabled}
          compressed={true}
          data-test-subj="kindField"
        />
      )}
    />
  );
};
