/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';
import { EuiFieldNumber, EuiFormRow } from '@elastic/eui';
import { INTERVAL_FIELD_LABEL, INTERVAL_FIELD_UNIT } from './translations';
import { clampInt } from './types';

/**
 * Minimum 1 second, maximum 604,800 seconds (7 days) — matches the existing
 * per-query IntervalField range in the pack-query flyout.
 */
export const MIN_INTERVAL_SECONDS = 1;
export const MAX_INTERVAL_SECONDS = 604800;

export interface IntervalFieldProps {
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}

export const IntervalField = ({ value, onChange, disabled }: IntervalFieldProps) => {
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const raw = Number(event.target.value);
      if (!Number.isFinite(raw)) return;

      onChange(
        clampInt(raw, MIN_INTERVAL_SECONDS, MAX_INTERVAL_SECONDS, MIN_INTERVAL_SECONDS, {
          truncate: true,
        })
      );
    },
    [onChange]
  );

  return (
    <EuiFormRow label={INTERVAL_FIELD_LABEL} fullWidth>
      <EuiFieldNumber
        fullWidth
        min={MIN_INTERVAL_SECONDS}
        max={MAX_INTERVAL_SECONDS}
        step={1}
        value={value}
        onChange={handleChange}
        disabled={disabled}
        append={INTERVAL_FIELD_UNIT}
        data-test-subj="osquery-schedule-interval"
      />
    </EuiFormRow>
  );
};
