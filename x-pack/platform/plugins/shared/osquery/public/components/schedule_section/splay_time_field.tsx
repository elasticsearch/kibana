/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import { css } from '@emotion/react';
import {
  EuiCallOut,
  EuiFieldNumber,
  EuiFormRow,
  EuiSelect,
  EuiSpacer,
  useEuiTheme,
} from '@elastic/eui';
import type { EuiSelectOption } from '@elastic/eui';
import { MAX_SPLAY_SECONDS } from '../../../common/schedule';
import {
  isSplayWithinMax,
  sumCompoundSeconds,
  type SplayUnit,
} from '../../../common/utils/splay_utils';
import { ToggleableRow } from './toggleable_row';
import {
  SPLAY_DESCRIPTION,
  SPLAY_LABEL,
  SPLAY_MAX_ERROR,
  SPLAY_QUERY_STORM_WARNING,
  SPLAY_UNIT_HOURS,
  SPLAY_UNIT_LABEL,
  SPLAY_UNIT_MINUTES,
  SPLAY_UNIT_SECONDS,
  SPLAY_VALUE_LABEL,
} from './translations';
import type { FrequencyMode, SplayFormStateUI } from './types';
import { CALENDAR_ANCHORED_FREQUENCIES } from './types';

export interface SplayTimeFieldProps {
  value: SplayFormStateUI;
  onChange: (next: SplayFormStateUI) => void;
  /**
   * Current frequency mode — used to drive the query-storm advisory when splay is off
   * and the recurrence is calendar-anchored.
   */
  frequency?: FrequencyMode;
  /** True when the parent form is in recurrence mode (advisory only applies there). */
  isRecurrence?: boolean;
  disabled?: boolean;
}

const UNIT_OPTIONS: EuiSelectOption[] = [
  { value: 'seconds', text: SPLAY_UNIT_SECONDS },
  { value: 'minutes', text: SPLAY_UNIT_MINUTES },
  { value: 'hours', text: SPLAY_UNIT_HOURS },
];

// Intentional override on the EUI select
const unitSelectAppendCss = (borderRadius: string | number) => css`
  && .euiFormControlLayout__append {
    padding: 0;
    align-items: stretch;
  }

  && .euiFormControlLayout__append,
  && .euiFormControlLayout__append .euiFormControlLayout,
  && .euiFormControlLayout__append .euiFormControlLayout__childrenWrapper,
  && .euiFormControlLayout__append .euiSelect {
    block-size: 100%;
  }

  && .euiFormControlLayout__append .euiSelect {
    border-start-start-radius: 0;
    border-end-start-radius: 0;
    border-start-end-radius: ${borderRadius};
    border-end-end-radius: ${borderRadius};
  }
`;

const isSplayUnit = (raw: string): raw is SplayUnit =>
  raw === 'seconds' || raw === 'minutes' || raw === 'hours';

export const SplayTimeField = ({
  value,
  onChange,
  frequency,
  isRecurrence,
  disabled,
}: SplayTimeFieldProps) => {
  const { euiTheme } = useEuiTheme();
  const appendCss = useMemo(
    () => unitSelectAppendCss(euiTheme.border.radius.medium ?? 0),
    [euiTheme.border.radius.medium]
  );

  const handleToggle = useCallback(
    (next: boolean) => {
      // Touching the toggle invalidates any preserved compound string from the
      // permissive parser: once the user takes control, the form re-emits
      // a single-unit value.
      onChange({ ...value, enabled: next, rawCompound: undefined });
    },
    [onChange, value]
  );

  const handleValueChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const raw = Number(event.target.value);
      const next = Number.isFinite(raw) ? Math.max(1, Math.trunc(raw)) : value.value;
      onChange({ ...value, value: next, rawCompound: undefined });
    },
    [onChange, value]
  );

  const handleUnitChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const raw = event.target.value;
      if (!isSplayUnit(raw)) return;
      onChange({ ...value, unit: raw, rawCompound: undefined });
    },
    [onChange, value]
  );

  const isInvalid = useMemo(() => {
    if (!value.enabled) return false;
    if (value.rawCompound) {
      return sumCompoundSeconds(value.rawCompound) > MAX_SPLAY_SECONDS;
    }

    return !isSplayWithinMax({ value: value.value, unit: value.unit });
  }, [value.enabled, value.rawCompound, value.unit, value.value]);

  const showQueryStormAdvisory =
    !!isRecurrence &&
    !value.enabled &&
    frequency !== undefined &&
    CALENDAR_ANCHORED_FREQUENCIES.has(frequency);

  return (
    <>
      <ToggleableRow
        title={SPLAY_LABEL}
        description={SPLAY_DESCRIPTION}
        enabled={value.enabled}
        onToggle={handleToggle}
        disabled={disabled}
        dataTestSubj="osquery-schedule-splay-toggle"
      >
        {value.enabled ? (
          <EuiFormRow
            isInvalid={isInvalid}
            error={isInvalid ? SPLAY_MAX_ERROR : undefined}
            css={appendCss}
            fullWidth
          >
            <EuiFieldNumber
              fullWidth
              min={1}
              max={MAX_SPLAY_SECONDS}
              step={1}
              value={value.value}
              onChange={handleValueChange}
              disabled={disabled}
              isInvalid={isInvalid}
              aria-label={SPLAY_VALUE_LABEL}
              append={
                <EuiSelect
                  options={UNIT_OPTIONS}
                  value={value.unit}
                  onChange={handleUnitChange}
                  disabled={disabled}
                  aria-label={SPLAY_UNIT_LABEL}
                  data-test-subj="osquery-schedule-splay-unit"
                />
              }
              data-test-subj="osquery-schedule-splay-value"
            />
          </EuiFormRow>
        ) : null}
      </ToggleableRow>
      {showQueryStormAdvisory ? (
        <>
          <EuiSpacer size="s" />
          <EuiCallOut
            announceOnMount
            size="s"
            color="warning"
            iconType="warning"
            title={SPLAY_QUERY_STORM_WARNING}
            data-test-subj="osquery-schedule-splay-query-storm-advisory"
          />
        </>
      ) : null}
    </>
  );
};
