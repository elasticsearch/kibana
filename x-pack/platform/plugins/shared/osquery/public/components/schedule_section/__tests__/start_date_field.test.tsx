/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { screen } from '@testing-library/react';
import { StartDateField } from '../start_date_field';
import { START_DATE_LABEL } from '../translations';
import { renderWithProviders } from './test_helpers';

describe('StartDateField', () => {
  it('renders an EuiDatePicker tagged with the schedule-start-date test subj', () => {
    const value = new Date('2026-05-26T10:00:00.000Z');
    renderWithProviders(<StartDateField value={value} onChange={jest.fn()} />);

    expect(screen.getByTestId('osquery-schedule-start-date')).toBeInTheDocument();
  });

  it('renders under the START_DATE_LABEL form row', () => {
    const value = new Date('2026-05-26T10:00:00.000Z');
    renderWithProviders(<StartDateField value={value} onChange={jest.fn()} />);

    // Verifies the field is wrapped in the labelled EuiFormRow rather than
    // floating loose in the layout (the label is the only a11y handle the
    // ScheduleSection composer relies on).
    expect(screen.getByText(START_DATE_LABEL)).toBeInTheDocument();
  });

  it('keeps the input editable at the DOM level so the picker popover can still open', () => {
    // The field blocks manual typing via `onChangeRaw` rather than a plain
    // `readOnly` attribute — a read-only input would also stop react-datepicker
    // from opening the calendar popover (the reported bug).
    const value = new Date('2026-12-26T10:00:00.000Z');
    renderWithProviders(<StartDateField value={value} onChange={jest.fn()} />);

    expect(screen.getByTestId('osquery-schedule-start-date-input')).not.toHaveAttribute('readonly');
  });

  it('disables the input when disabled', () => {
    const value = new Date('2026-12-26T10:00:00.000Z');
    renderWithProviders(<StartDateField value={value} onChange={jest.fn()} disabled />);

    expect(screen.getByTestId('osquery-schedule-start-date-input')).toBeDisabled();
  });
});
