/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import moment from 'moment';
import {
  EuiButtonGroup,
  EuiButtonIcon,
  EuiDatePicker,
  EuiFieldNumber,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiSelect,
  EuiSpacer,
  EuiToolTip,
} from '@elastic/eui';
import type { CustomDurationState, CustomSnoozeMode, SnoozeUnit } from './types';
import { SNOOZE_UNIT_OPTIONS, CUSTOM_MODE_BUTTONS } from './constants';
import * as i18n from './translations';

export interface SnoozeDurationPickerProps {
  value: CustomDurationState;
  onChange: (update: Partial<CustomDurationState>) => void;
  isDurationInvalid?: boolean;
  isDateTimeInvalid?: boolean;
}

export const SnoozeDurationPicker = ({
  value: { mode, value: durationValue, unit: durationUnit, dateTime },
  onChange,
  isDurationInvalid = false,
  isDateTimeInvalid = false,
}: SnoozeDurationPickerProps) => {
  return (
    <>
      <EuiButtonGroup
        legend={i18n.CUSTOM_MODE_LEGEND}
        options={CUSTOM_MODE_BUTTONS}
        idSelected={mode}
        onChange={(id) => {
          onChange({ mode: id as CustomSnoozeMode });
        }}
        buttonSize="compressed"
        isFullWidth
        data-test-subj="buttonGroupModeOptions"
      />
      <EuiSpacer size="s" />
      {mode === 'duration' && (
        <EuiFormRow
          isInvalid={isDurationInvalid}
          error={isDurationInvalid ? i18n.INVALID_DURATION_ERROR : undefined}
          data-test-subj="durationInputs"
          fullWidth
        >
          <EuiFlexGroup gutterSize="s">
            <EuiFlexItem>
              <EuiFieldNumber
                min={1}
                step={1}
                value={durationValue}
                onChange={(e) => onChange({ value: Number(e.target.value) })}
                isInvalid={isDurationInvalid}
                aria-label={i18n.CUSTOM_VALUE_ARIA_LABEL}
                data-test-subj="durationValue"
                compressed
              />
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiSelect
                value={durationUnit}
                onChange={(e) => onChange({ unit: e.target.value as SnoozeUnit })}
                options={SNOOZE_UNIT_OPTIONS}
                aria-label={i18n.CUSTOM_UNIT_ARIA_LABEL}
                data-test-subj="durationUnit"
                compressed
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFormRow>
      )}
      {mode === 'datetime' && (
        <EuiFormRow
          isInvalid={isDateTimeInvalid}
          error={isDateTimeInvalid ? i18n.PAST_DATETIME_ERROR : undefined}
          data-test-subj="dateTimeInputs"
          fullWidth
        >
          <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
            <EuiFlexItem>
              <EuiDatePicker
                showTimeSelect
                selected={dateTime}
                onChange={(dt) => onChange({ dateTime: dt })}
                minDate={moment()}
                isInvalid={isDateTimeInvalid}
                data-test-subj="dateTimePicker"
                placeholder={i18n.SELECT_DATE_AND_TIME}
                fullWidth
                compressed
              />
            </EuiFlexItem>
            {dateTime !== null && (
              <EuiFlexItem grow={false}>
                <EuiToolTip content={i18n.CLEAR_DATETIME_ARIA_LABEL} disableScreenReaderOutput>
                  <EuiButtonIcon
                    iconType="cross"
                    onClick={() => onChange({ dateTime: null })}
                    aria-label={i18n.CLEAR_DATETIME_ARIA_LABEL}
                    data-test-subj="dateTimeClear"
                  />
                </EuiToolTip>
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </EuiFormRow>
      )}
    </>
  );
};
