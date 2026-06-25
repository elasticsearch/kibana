/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import moment from 'moment';
import { EuiDatePicker, EuiFormRow } from '@elastic/eui';
import { SLOT_MINUTES } from './slot_utils';
import { ToggleableRow } from './toggleable_row';
import {
  STOP_AFTER_BEFORE_START_ERROR,
  STOP_AFTER_DATE_LABEL,
  STOP_AFTER_DESCRIPTION,
  STOP_AFTER_LABEL,
} from './translations';

export interface StopAfterFieldProps {
  enabled: boolean;
  value: Date;
  startDate: Date;
  onChange: (next: { enabled: boolean; date: Date }) => void;
  disabled?: boolean;
  /**
   * When true, surface validation errors regardless of touched state. The
   * parent form flips this on submit so the error becomes visible even if the
   * user never blurred the field.
   */
  showErrors?: boolean;
}

export const StopAfterField = ({
  enabled,
  value,
  startDate,
  onChange,
  disabled,
  showErrors = false,
}: StopAfterFieldProps) => {
  // Defer error display until the field has been interacted with — otherwise
  // the user sees the before-start error the instant the toggle flips on,
  // before they've had a chance to pick a date.
  const [touched, setTouched] = useState(false);
  const previousEnabled = useRef(enabled);
  useEffect(() => {
    // Reset touched state when the user toggles the field off; turning it back
    // on should feel like a fresh start.
    if (previousEnabled.current && !enabled) {
      setTouched(false);
    }

    previousEnabled.current = enabled;
  }, [enabled]);

  const handleToggle = useCallback(
    (next: boolean) => {
      onChange({ enabled: next, date: value });
    },
    [onChange, value]
  );

  const handleDateChange = useCallback(
    (next: moment.Moment | null) => {
      if (!next) return;
      setTouched(true);
      onChange({ enabled, date: next.toDate() });
    },
    [enabled, onChange]
  );

  const handleBlur = useCallback(() => {
    setTouched(true);
  }, []);

  const handleChangeRaw = useCallback((event: React.FocusEvent<HTMLInputElement>) => {
    event.preventDefault();
  }, []);

  const selectedMoment = useMemo(() => moment(value), [value]);
  const minMoment = useMemo(() => moment(startDate), [startDate]);
  const isBeforeStart = enabled && value.getTime() <= startDate.getTime();
  const showError = isBeforeStart && (touched || showErrors);

  return (
    <ToggleableRow
      title={STOP_AFTER_LABEL}
      description={STOP_AFTER_DESCRIPTION}
      enabled={enabled}
      onToggle={handleToggle}
      disabled={disabled}
      dataTestSubj="osquery-schedule-stop-after-toggle"
    >
      {enabled ? (
        <EuiFormRow
          isInvalid={showError}
          error={showError ? STOP_AFTER_BEFORE_START_ERROR : undefined}
          fullWidth
        >
          <EuiDatePicker
            fullWidth
            aria-label={STOP_AFTER_DATE_LABEL}
            selected={selectedMoment}
            onChange={handleDateChange}
            onChangeRaw={handleChangeRaw}
            onBlur={handleBlur}
            showTimeSelect
            timeIntervals={SLOT_MINUTES}
            minDate={minMoment}
            disabled={disabled}
            data-test-subj="osquery-schedule-stop-after-date"
          />
        </EuiFormRow>
      ) : null}
    </ToggleableRow>
  );
};
