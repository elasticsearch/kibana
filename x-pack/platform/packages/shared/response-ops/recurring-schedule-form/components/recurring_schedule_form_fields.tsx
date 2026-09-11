/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useMemo, useState } from 'react';
import type { Moment } from 'moment';
import moment from 'moment';
import { Frequency } from '@kbn/rrule';
import {
  FIELD_TYPES,
  useFormData,
  getUseField,
} from '@kbn/es-ui-shared-plugin/static/forms/hook_form_lib';
import { Field } from '@kbn/es-ui-shared-plugin/static/forms/components';
import type { EuiSelectOption } from '@elastic/eui';
import {
  EuiComboBox,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormAppend,
  EuiFormPrepend,
  EuiHorizontalRule,
  EuiSpacer,
  EuiSplitPanel,
} from '@elastic/eui';
import {
  DEFAULT_FREQUENCY_OPTIONS,
  DEFAULT_PRESETS,
  RecurrenceEnd,
  RECURRENCE_END_OPTIONS,
  RECURRENCE_END_NEVER,
} from '../constants';
import { CustomRecurringSchedule } from './custom_recurring_schedule';
import { recurringSummary } from '../utils/recurring_summary';
import { parseSchedule } from '../utils/parse_schedule';
import { getPresets } from '../utils/get_presets';
import { getWeekdayInfo } from '../utils/get_weekday_info';
import type { RecurringSchedule } from '../types';
import * as i18n from '../translations';
import { convertStringToMomentOptional, convertMomentToStringOptional } from '../converters/moment';

/**
 * Using EuiForm in `div` mode since this is meant to be integrated in a larger form
 */
const UseField = getUseField({ component: Field });

export interface RecurringScheduleFieldsProps {
  startDate?: string;
  endDate?: string;
  timezone?: string[];
  hideTimezone?: boolean;
  supportsEndOptions?: boolean;
  allowInfiniteRecurrence?: boolean;
  minFrequency?: Frequency;
  showTimeInSummary?: boolean;
  readOnly?: boolean;
  compressed?: boolean;
  initialRecurringSchedule?: RecurringSchedule;
  // Reporting still validates bymonthday as 1-31 via Task Manager.
  allowLastDayOfMonth?: boolean;
}

/**
 * Renders form fields for the recurring schedule
 */
export const RecurringScheduleFormFields = memo(
  ({
    startDate,
    endDate,
    timezone,
    minFrequency = Frequency.YEARLY,
    hideTimezone = false,
    supportsEndOptions = true,
    allowInfiniteRecurrence = true,
    showTimeInSummary = false,
    readOnly = false,
    compressed = false,
    initialRecurringSchedule,
    allowLastDayOfMonth = false,
  }: RecurringScheduleFieldsProps) => {
    const [formData] = useFormData<{ recurringSchedule: RecurringSchedule }>({
      watch: [
        'recurringSchedule.frequency',
        'recurringSchedule.interval',
        'recurringSchedule.ends',
        'recurringSchedule.until',
        'recurringSchedule.count',
        'recurringSchedule.customFrequency',
        'recurringSchedule.byweekday',
        'recurringSchedule.bymonth',
      ],
    });

    const [today] = useState<Moment>(moment());

    const recurringSchedule = useMemo(
      () => ({
        ...initialRecurringSchedule,
        ...formData.recurringSchedule,
      }),
      [initialRecurringSchedule, formData.recurringSchedule]
    );

    const { options, presets } = useMemo(() => {
      let _options: Array<EuiSelectOption & { 'data-test-subj'?: string }> =
        DEFAULT_FREQUENCY_OPTIONS;
      let _presets: Record<number, Partial<RecurringSchedule>> = DEFAULT_PRESETS;
      if (startDate != null) {
        const date = moment(startDate);
        const { dayOfWeek, nthWeekdayOfMonth, isLastOfMonth } = getWeekdayInfo(date);
        _options = [
          {
            text: i18n.RECURRING_SCHEDULE_FORM_FREQUENCY_HOURLY,
            value: Frequency.HOURLY,
            'data-test-subj': 'recurringScheduleOptionHourly',
          },
          {
            text: i18n.RECURRING_SCHEDULE_FORM_FREQUENCY_DAILY,
            value: Frequency.DAILY,
            'data-test-subj': 'recurringScheduleOptionDaily',
          },
          {
            text: i18n.RECURRING_SCHEDULE_FORM_FREQUENCY_WEEKLY_ON(dayOfWeek),
            value: Frequency.WEEKLY,
            'data-test-subj': 'recurringScheduleOptionWeekly',
          },
          {
            text: i18n.RECURRING_SCHEDULE_FORM_FREQUENCY_NTH_WEEKDAY(dayOfWeek)[
              isLastOfMonth ? 0 : nthWeekdayOfMonth
            ],
            value: Frequency.MONTHLY,
            'data-test-subj': 'recurringScheduleOptionMonthly',
          },
          {
            text: i18n.RECURRING_SCHEDULE_FORM_FREQUENCY_YEARLY_ON(date),
            value: Frequency.YEARLY,
            'data-test-subj': 'recurringScheduleOptionYearly',
          },
          {
            text: i18n.RECURRING_SCHEDULE_FORM_FREQUENCY_CUSTOM,
            value: 'CUSTOM',
            'data-test-subj': 'recurringScheduleOptionCustom',
          },
        ];
        _presets = getPresets(date);
      }
      if (minFrequency != null) {
        _options = _options.filter(
          (frequency) => typeof frequency.value !== 'number' || frequency.value >= minFrequency
        );
      }
      return {
        options: _options,
        presets: _presets,
      };
    }, [minFrequency, startDate]);

    const parsedSchedule = useMemo(() => parseSchedule(recurringSchedule), [recurringSchedule]);

    return (
      <EuiSplitPanel.Outer hasShadow={false} hasBorder={true} data-test-subj="recurring-form">
        <EuiSplitPanel.Inner color="subdued">
          <UseField
            path="recurringSchedule.frequency"
            componentProps={{
              'data-test-subj': 'frequency-field',
              euiFieldProps: {
                compressed,
                'data-test-subj': 'recurringScheduleRepeatSelect',
                options,
                disabled: readOnly,
              },
            }}
          />
          {((parsedSchedule?.frequency === Frequency.DAILY && parsedSchedule?.byweekday) ||
            parsedSchedule?.frequency === 'CUSTOM') && (
            <CustomRecurringSchedule
              startDate={startDate}
              compressed={compressed}
              minFrequency={minFrequency}
              readOnly={readOnly}
              allowLastDayOfMonth={allowLastDayOfMonth}
            />
          )}

          {supportsEndOptions && (
            <>
              <UseField
                path="recurringSchedule.ends"
                componentProps={{
                  'data-test-subj': 'ends-field',
                  euiFieldProps: {
                    compressed,
                    legend: 'Recurrence ends',
                    options: allowInfiniteRecurrence
                      ? [RECURRENCE_END_NEVER, ...RECURRENCE_END_OPTIONS]
                      : RECURRENCE_END_OPTIONS,
                    isDisabled: readOnly,
                  },
                }}
              />
              {parsedSchedule?.ends === RecurrenceEnd.ON_DATE ? (
                <>
                  <EuiSpacer size="m" />
                  <EuiFlexGroup alignItems="flexEnd">
                    <EuiFlexItem grow={3}>
                      <UseField
                        path="recurringSchedule.until"
                        config={{
                          type: FIELD_TYPES.DATE_PICKER,
                          label: '',
                          defaultValue: Boolean(endDate)
                            ? moment(endDate).endOf('day').toISOString()
                            : '',
                          validations: [
                            {
                              // Using a custom validator since `emptyField()` won't error for undefined
                              // values
                              validator: ({ value }) => {
                                if (!value) {
                                  return {
                                    message: i18n.RECURRING_SCHEDULE_FORM_UNTIL_REQUIRED_MESSAGE,
                                  };
                                }
                              },
                            },
                          ],
                          serializer: convertMomentToStringOptional,
                          deserializer: convertStringToMomentOptional,
                        }}
                        componentProps={{
                          'data-test-subj': 'until-field',
                          compressed,
                          euiFieldProps: {
                            showTimeSelect: false,
                            minDate: today,
                            readOnly,
                            placeholder: i18n.RECURRING_SCHEDULE_FORM_UNTIL_PLACEHOLDER,
                          },
                        }}
                      />
                    </EuiFlexItem>
                    {timezone && !hideTimezone ? (
                      <EuiFlexItem grow={1}>
                        <EuiComboBox
                          data-test-subj="disabled-timezone-field"
                          id="disabled-timezone"
                          isDisabled
                          singleSelection={{ asPlainText: true }}
                          selectedOptions={[{ label: timezone[0] }]}
                          isClearable={false}
                          aria-label={i18n.RECURRING_SCHEDULE_FORM_TIMEZONE}
                          prepend={
                            <EuiFormPrepend
                              inputId="disabled-timezone"
                              label={i18n.RECURRING_SCHEDULE_FORM_TIMEZONE}
                            />
                          }
                          compressed={compressed}
                        />
                      </EuiFlexItem>
                    ) : null}
                  </EuiFlexGroup>
                </>
              ) : null}
              {parsedSchedule?.ends === RecurrenceEnd.AFTER_X ? (
                <UseField
                  path="recurringSchedule.count"
                  componentProps={{
                    'data-test-subj': 'count-field',
                    id: 'count',
                    euiFieldProps: {
                      compressed,
                      'data-test-subj': 'recurringScheduleAfterXOccurenceInput',
                      type: 'number',
                      min: 1,
                      prepend: (
                        <EuiFormPrepend
                          inputId="count"
                          label={i18n.RECURRING_SCHEDULE_FORM_COUNT_AFTER}
                        />
                      ),
                      append: (
                        <EuiFormAppend
                          inputId="count"
                          label={i18n.RECURRING_SCHEDULE_FORM_COUNT_OCCURRENCE}
                        />
                      ),
                      readOnly,
                    },
                  }}
                />
              ) : null}
            </>
          )}
        </EuiSplitPanel.Inner>
        <EuiHorizontalRule margin="none" />
        <EuiSplitPanel.Inner>
          {i18n.RECURRING_SCHEDULE_FORM_RECURRING_SUMMARY_PREFIX(
            recurringSummary({
              startDate: startDate ? moment(startDate) : undefined,
              recurringSchedule: parsedSchedule,
              presets,
              showTime: showTimeInSummary,
            })
          )}
        </EuiSplitPanel.Inner>
      </EuiSplitPanel.Outer>
    );
  }
);

RecurringScheduleFormFields.displayName = 'RecurringScheduleFormFields';
