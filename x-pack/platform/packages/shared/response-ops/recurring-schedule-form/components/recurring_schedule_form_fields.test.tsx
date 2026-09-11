/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PropsWithChildren } from 'react';
import React from 'react';
import { render, within, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RecurringScheduleFieldsProps } from './recurring_schedule_form_fields';
import { RecurringScheduleFormFields } from './recurring_schedule_form_fields';
import type { RecurringSchedule } from '../types';
import { Form, useForm } from '@kbn/es-ui-shared-plugin/static/forms/hook_form_lib';
import { getRecurringScheduleFormSchema } from '../schemas/recurring_schedule_form_schema';
import { RecurrenceEnd } from '../constants';
import { Frequency } from '@kbn/rrule';

const baseProps: RecurringScheduleFieldsProps = {
  startDate: '2023-03-24',
};

interface FormValue {
  recurringSchedule: RecurringSchedule;
}

const initialValue: FormValue = {
  recurringSchedule: {
    frequency: Frequency.WEEKLY,
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

describe('RecurringScheduleForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all form fields', async () => {
    render(
      <TestWrapper>
        <RecurringScheduleFormFields {...baseProps} />
      </TestWrapper>
    );

    expect(screen.getByTestId('frequency-field')).toBeInTheDocument();
    expect(screen.queryByTestId('customRecurringScheduleIntervalInput')).not.toBeInTheDocument();
    expect(screen.getByTestId('ends-field')).toBeInTheDocument();
    expect(screen.queryByTestId('until-field')).not.toBeInTheDocument();
    expect(screen.queryByTestId('count-field')).not.toBeInTheDocument();
  });

  it('renders until field if ends = on_date', async () => {
    render(
      <TestWrapper>
        <RecurringScheduleFormFields {...baseProps} />
      </TestWrapper>
    );

    const btn = within(screen.getByTestId('ends-field')).getByTestId('recurrenceEndOptionOnDate');

    await userEvent.click(btn);
    expect(await screen.findByTestId('until-field')).toBeInTheDocument();
  });

  it('renders until field if ends = after_x', async () => {
    render(
      <TestWrapper>
        <RecurringScheduleFormFields {...baseProps} />
      </TestWrapper>
    );

    const btn = within(screen.getByTestId('ends-field')).getByTestId('recurrenceEndOptionAfterX');

    await userEvent.click(btn);
    expect(await screen.findByTestId('count-field')).toBeInTheDocument();
  });

  it('does not render custom schedule if frequency = daily', async () => {
    render(
      <TestWrapper
        iv={{ recurringSchedule: { frequency: Frequency.DAILY, ends: RecurrenceEnd.NEVER } }}
      >
        <RecurringScheduleFormFields {...baseProps} />
      </TestWrapper>
    );

    expect(
      screen.queryByTestId('customRecurringScheduleByWeekdayButtonGroup')
    ).not.toBeInTheDocument();
    expect(await screen.findByText('Repeats every day')).toBeInTheDocument();
  });

  it('renders schedule with frequency = daily and weekdays', async () => {
    const recurringSchedule: RecurringSchedule = {
      frequency: Frequency.DAILY as any,
      ends: RecurrenceEnd.NEVER,
      byweekday: { 1: true, 5: true },
      interval: 1,
    };
    render(
      <TestWrapper
        iv={{
          recurringSchedule,
        }}
      >
        <RecurringScheduleFormFields {...baseProps} initialRecurringSchedule={recurringSchedule} />
      </TestWrapper>
    );

    expect(
      await screen.findByTestId('customRecurringScheduleByWeekdayButtonGroup')
    ).toBeInTheDocument();
    expect(await screen.findByText('Repeats every Monday, Friday')).toBeInTheDocument();
  });

  it('renders custom schedule if frequency = custom', async () => {
    render(
      <TestWrapper iv={{ recurringSchedule: { frequency: 'CUSTOM', ends: RecurrenceEnd.NEVER } }}>
        <RecurringScheduleFormFields {...baseProps} />
      </TestWrapper>
    );

    expect(await screen.findByTestId('customRecurringScheduleIntervalInput')).toBeInTheDocument();
  });

  it('offers last day of the month when allowLastDayOfMonth is true', async () => {
    render(
      <TestWrapper iv={{ recurringSchedule: { frequency: 'CUSTOM', ends: RecurrenceEnd.NEVER } }}>
        <RecurringScheduleFormFields {...baseProps} allowLastDayOfMonth />
      </TestWrapper>
    );

    await userEvent.selectOptions(
      screen.getByTestId('customRecurringScheduleFrequencySelect'),
      String(Frequency.MONTHLY)
    );

    const bymonthField = await screen.findByTestId('bymonth-field');
    expect(within(bymonthField).getByTestId('lastday')).toHaveTextContent('On the last day');
  });

  it('renders hourly if frequency = hourly', async () => {
    render(
      <TestWrapper
        iv={{ recurringSchedule: { frequency: Frequency.HOURLY, ends: RecurrenceEnd.NEVER } }}
      >
        <RecurringScheduleFormFields {...baseProps} />
      </TestWrapper>
    );

    expect(await screen.findByText('Repeats every hour')).toBeInTheDocument();
  });
});
