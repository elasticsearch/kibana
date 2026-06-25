/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';
import { EuiCallOut, EuiPanel, EuiSpacer, EuiTitle } from '@elastic/eui';
import { useIsExperimentalFeatureEnabled } from '../../common/experimental_features_context';
import type { ScheduleType } from '../../../common/schedule';
import { FrequencySelector } from './frequency_selector';
import { IntervalField } from './interval_field';
import { ScheduleTypeSelector } from './schedule_type_selector';
import { SplayTimeField } from './splay_time_field';
import { StartDateField } from './start_date_field';
import { StopAfterField } from './stop_after_field';
import {
  ADVANCED_PARTS_ADVISORY_BODY,
  ADVANCED_PARTS_ADVISORY_TITLE,
  SCHEDULE_SECTION_TITLE,
} from './translations';
import type { ScheduleFormData } from './types';

export interface ScheduleSectionProps {
  value: ScheduleFormData;
  onChange: (next: ScheduleFormData) => void;
  /**
   * When set, the type selector locks to this mode and the parent SHALL NOT be
   * able to switch — used by the QueryFlyout to enforce the same-mode
   * constraint. Per-query overrides may change schedule details, not the pack's
   * schedule mode.
   */
  lockedScheduleType?: ScheduleType;
  disabled?: boolean;
  /**
   * Optional title override. Defaults to "Schedule"; the QueryFlyout passes a
   * narrower label when embedded inside an override toggle.
   */
  title?: string | null;
  /**
   * Force validation errors to surface on touched-deferred fields (currently
   * the end-date field). Parent forms flip this on submit attempt.
   */
  showErrors?: boolean;
}

const weekdaysAreValid = (data: ScheduleFormData): boolean => {
  if (data.scheduleType !== 'rrule') return true;
  if (data.recurrence.frequency !== 'custom') return true;

  return data.recurrence.byweekday.length > 0;
};

export const ScheduleSection = ({
  value,
  onChange,
  lockedScheduleType,
  disabled,
  title = SCHEDULE_SECTION_TITLE,
  showErrors,
}: ScheduleSectionProps) => {
  const handleTypeChange = useCallback(
    (scheduleType: ScheduleType) => {
      onChange({ ...value, scheduleType });
    },
    [onChange, value]
  );

  const handleIntervalChange = useCallback(
    (interval: number) => {
      onChange({ ...value, interval });
    },
    [onChange, value]
  );

  const handleStartDateChange = useCallback(
    (startDate: Date) => {
      onChange({ ...value, startDate });
    },
    [onChange, value]
  );

  const handleStopAfterChange = useCallback(
    (stopAfter: { enabled: boolean; date: Date }) => {
      onChange({ ...value, stopAfter });
    },
    [onChange, value]
  );

  const handleRecurrenceChange = useCallback(
    (recurrence: ScheduleFormData['recurrence']) => {
      onChange({ ...value, recurrence });
    },
    [onChange, value]
  );

  const handleSplayChange = useCallback(
    (splay: ScheduleFormData['splay']) => {
      onChange({ ...value, splay });
    },
    [onChange, value]
  );

  const isRruleSchedulingEnabled = useIsExperimentalFeatureEnabled('rruleScheduling');

  // The entire section is inert when the flag is off. Gate after hooks to keep
  // hook order stable across renders.
  if (!isRruleSchedulingEnabled) {
    return null;
  }

  const isRecurrence = value.scheduleType === 'rrule';
  const hasUnknownParts =
    isRecurrence &&
    !!value.recurrence._unknown &&
    Object.keys(value.recurrence._unknown).length > 0;
  const weekdaysError = !weekdaysAreValid(value);

  return (
    <div data-test-subj="osquery-schedule-section">
      {title ? (
        <>
          <EuiTitle size="s">
            <h2>{title}</h2>
          </EuiTitle>
          <EuiSpacer size="m" />
        </>
      ) : null}

      <ScheduleTypeSelector
        value={value.scheduleType}
        onChange={handleTypeChange}
        lockedScheduleType={lockedScheduleType}
        disabled={disabled}
      />

      <EuiSpacer size="m" />

      {/* Interval mode renders a single bordered field; a bordered panel around
          it would double the border. The recurrence branch groups several
          sub-fields, so it keeps the panel border. */}
      <EuiPanel
        hasBorder={isRecurrence}
        hasShadow={false}
        paddingSize={isRecurrence ? 'm' : 'none'}
      >
        {isRecurrence ? (
          <>
            {hasUnknownParts ? (
              <>
                <EuiCallOut
                  announceOnMount
                  size="s"
                  color="primary"
                  iconType="info"
                  title={ADVANCED_PARTS_ADVISORY_TITLE}
                  data-test-subj="osquery-schedule-advanced-parts-advisory"
                >
                  <p>{ADVANCED_PARTS_ADVISORY_BODY}</p>
                </EuiCallOut>
                <EuiSpacer size="m" />
              </>
            ) : null}

            <StartDateField
              value={value.startDate}
              onChange={handleStartDateChange}
              disabled={disabled}
            />

            <EuiSpacer size="m" />

            <FrequencySelector
              value={value.recurrence}
              onChange={handleRecurrenceChange}
              disabled={disabled}
              weekdaysError={weekdaysError}
            />

            <StopAfterField
              enabled={value.stopAfter.enabled}
              value={value.stopAfter.date}
              startDate={value.startDate}
              onChange={handleStopAfterChange}
              disabled={disabled}
              showErrors={showErrors}
            />

            <SplayTimeField
              value={value.splay}
              onChange={handleSplayChange}
              frequency={value.recurrence.frequency}
              isRecurrence
              disabled={disabled}
            />
          </>
        ) : (
          <IntervalField
            value={value.interval}
            onChange={handleIntervalChange}
            disabled={disabled}
          />
        )}
      </EuiPanel>
    </div>
  );
};
