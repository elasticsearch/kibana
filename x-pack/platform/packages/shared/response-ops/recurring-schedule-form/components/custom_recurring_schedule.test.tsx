/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PropsWithChildren } from 'react';
import React from 'react';
import { fireEvent, render, within, screen } from '@testing-library/react';
import { useForm, Form } from '@kbn/es-ui-shared-plugin/static/forms/hook_form_lib';
import { Frequency } from '@kbn/rrule';
import type { RecurringSchedule } from '../types';
import { getRecurringScheduleFormSchema } from '../schemas/recurring_schedule_form_schema';
import { CustomRecurringSchedule } from './custom_recurring_schedule';
import { RecurrenceEnd } from '../constants';

interface FormValue {
  recurringSchedule: RecurringSchedule;
}

const initialValue: FormValue = {
  recurringSchedule: {
    frequency: 'CUSTOM',
    ends: RecurrenceEnd.NEVER,
  },
};

const TestWrapper = ({ children, iv = initialValue }: PropsWithChildren<{ iv?: FormValue }>) => {
  const { form } = useForm<FormValue>({
    defaultValue: iv,
    options: { stripEmptyFields: false },
    schema: { recurringSchedule: getRecurringScheduleFormSchema() },
  });

  return <Form form={form}>{children}</Form>;
};

const startDate = new Date().toISOString();

describe('CustomRecurringSchedule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all form fields', async () => {
    render(
      <TestWrapper>
        <CustomRecurringSchedule startDate={startDate} />
      </TestWrapper>
    );

    expect(screen.getByTestId('interval-field')).toBeInTheDocument();
    expect(screen.getByTestId('custom-frequency-field')).toBeInTheDocument();
    expect(screen.getByTestId('byweekday-field')).toBeInTheDocument();
    expect(screen.queryByTestId('bymonth-field')).not.toBeInTheDocument();
  });

  it('renders byweekday field if custom frequency = weekly', async () => {
    render(
      <TestWrapper>
        <CustomRecurringSchedule startDate={startDate} />
      </TestWrapper>
    );

    fireEvent.change(
      within(screen.getByTestId('custom-frequency-field')).getByTestId(
        'customRecurringScheduleFrequencySelect'
      ),
      {
        target: { value: Frequency.WEEKLY },
      }
    );
    expect(await screen.findByTestId('byweekday-field')).toBeInTheDocument();
  });

  it('renders byweekday field if frequency = daily', async () => {
    const iv: FormValue = {
      recurringSchedule: {
        ...initialValue,
        frequency: Frequency.DAILY,
        ends: RecurrenceEnd.NEVER,
      },
    };
    render(
      <TestWrapper iv={iv}>
        <CustomRecurringSchedule startDate={startDate} />
      </TestWrapper>
    );

    expect(screen.getByTestId('byweekday-field')).toBeInTheDocument();
  });

  it('renders bymonth field if custom frequency = monthly', async () => {
    render(
      <TestWrapper>
        <CustomRecurringSchedule startDate={startDate} />
      </TestWrapper>
    );

    fireEvent.change(
      within(screen.getByTestId('custom-frequency-field')).getByTestId(
        'customRecurringScheduleFrequencySelect'
      ),
      {
        target: { value: Frequency.MONTHLY },
      }
    );
    expect(await screen.findByTestId('bymonth-field')).toBeInTheDocument();
  });

  it('does not offer a last day of the month option by default', async () => {
    render(
      <TestWrapper>
        <CustomRecurringSchedule startDate={startDate} />
      </TestWrapper>
    );

    fireEvent.change(
      within(screen.getByTestId('custom-frequency-field')).getByTestId(
        'customRecurringScheduleFrequencySelect'
      ),
      {
        target: { value: Frequency.MONTHLY },
      }
    );

    const bymonthField = await screen.findByTestId('bymonth-field');
    expect(within(bymonthField).queryByTestId('lastday')).not.toBeInTheDocument();
  });

  it('offers a last day of the month option when allowLastDayOfMonth is true', async () => {
    render(
      <TestWrapper>
        <CustomRecurringSchedule startDate={startDate} allowLastDayOfMonth />
      </TestWrapper>
    );

    fireEvent.change(
      within(screen.getByTestId('custom-frequency-field')).getByTestId(
        'customRecurringScheduleFrequencySelect'
      ),
      {
        target: { value: Frequency.MONTHLY },
      }
    );

    const bymonthField = await screen.findByTestId('bymonth-field');
    expect(within(bymonthField).getByTestId('lastday')).toHaveTextContent('On the last day');
  });

  it('should initialize the form when no initialValue provided', () => {
    render(
      <TestWrapper>
        <CustomRecurringSchedule startDate={startDate} />
      </TestWrapper>
    );

    const frequencyInput = within(screen.getByTestId('custom-frequency-field')).getByTestId(
      'customRecurringScheduleFrequencySelect'
    );
    const intervalInput = within(screen.getByTestId('interval-field')).getByTestId(
      'customRecurringScheduleIntervalInput'
    );

    expect(frequencyInput).toHaveValue('2');
    expect(intervalInput).toHaveValue(1);
  });

  it('should prefill the form when provided with initialValue', () => {
    const iv: FormValue = {
      recurringSchedule: {
        ...initialValue,
        frequency: 'CUSTOM',
        ends: RecurrenceEnd.NEVER,
        customFrequency: Frequency.WEEKLY,
        interval: 3,
        byweekday: { 1: false, 2: false, 3: true, 4: true, 5: false, 6: false, 7: false },
      },
    };
    render(
      <TestWrapper iv={iv}>
        <CustomRecurringSchedule startDate={startDate} />
      </TestWrapper>
    );

    const frequencyInput = within(screen.getByTestId('custom-frequency-field')).getByTestId(
      'customRecurringScheduleFrequencySelect'
    );
    const intervalInput = within(screen.getByTestId('interval-field')).getByTestId(
      'customRecurringScheduleIntervalInput'
    );
    const input3 = within(screen.getByTestId('byweekday-field'))
      .getByTestId('isoWeekdays3')
      .getAttribute('aria-pressed');
    const input4 = within(screen.getByTestId('byweekday-field'))
      .getByTestId('isoWeekdays4')
      .getAttribute('aria-pressed');
    expect(frequencyInput).toHaveValue('2');
    expect(intervalInput).toHaveValue(3);
    expect(input3).toBe('true');
    expect(input4).toBe('true');
  });
});
