/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { EuiSuperSelectOption } from '@elastic/eui';
import { EuiHealth } from '@elastic/eui';

export interface OsControlSelectOptionSpec<TValue extends string> {
  value: TValue;
  label: string;
  healthColor: 'danger' | 'warning' | 'success';
}

/** Gives every OS-row select the shared severity-dot treatment. */
export const buildOsControlSelectOptions = <TValue extends string>(
  specs: ReadonlyArray<OsControlSelectOptionSpec<TValue>>
): Array<EuiSuperSelectOption<TValue>> =>
  specs.map(({ value, label, healthColor }) => {
    const display = (
      <EuiHealth color={healthColor} textSize="inherit">
        {label}
      </EuiHealth>
    );

    return {
      value,
      inputDisplay: display,
      dropdownDisplay: display,
    };
  });
