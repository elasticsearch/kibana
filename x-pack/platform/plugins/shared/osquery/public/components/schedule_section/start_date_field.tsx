/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import moment from 'moment';
import { EuiDatePicker, EuiFormRow } from '@elastic/eui';
import { roundUpTo30Min, SLOT_MINUTES } from './slot_utils';
import { START_DATE_LABEL } from './translations';

export interface StartDateFieldProps {
  value: Date;
  onChange: (next: Date) => void;
  disabled?: boolean;
}

export const StartDateField = ({ value, onChange, disabled }: StartDateFieldProps) => {
  const handleChange = useCallback(
    (next: moment.Moment | null) => {
      if (!next) return;
      onChange(next.toDate());
    },
    [onChange]
  );

  const selectedMoment = useMemo(() => moment(value), [value]);

  // Block manual text entry while keeping the calendar/time popover fully
  // interactive.
  const handleChangeRaw = useCallback((event: React.FocusEvent<HTMLInputElement>) => {
    event.preventDefault();
  }, []);

  // Floor the calendar to today so past days are not selectable.
  const minDate = useMemo(() => moment().startOf('day'), []);

  const { minTime, maxTime } = useMemo(() => {
    const isToday = selectedMoment.isSame(moment(), 'day');
    const dayMin = isToday
      ? moment(roundUpTo30Min(new Date()))
      : selectedMoment.clone().startOf('day');

    return {
      minTime: dayMin,
      maxTime: selectedMoment.clone().endOf('day'),
    };
  }, [selectedMoment]);

  return (
    <EuiFormRow label={START_DATE_LABEL} fullWidth>
      <EuiDatePicker
        fullWidth
        selected={selectedMoment}
        onChange={handleChange}
        onChangeRaw={handleChangeRaw}
        showTimeSelect
        timeIntervals={SLOT_MINUTES}
        minDate={minDate}
        minTime={minTime}
        maxTime={maxTime}
        disabled={disabled}
        data-test-subj="osquery-schedule-start-date"
      />
    </EuiFormRow>
  );
};
