/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { FrequencySelector } from '../frequency_selector';
import {
  AT_LEAST_ONE_DAY_ERROR,
  FREQUENCY_CUSTOM,
  FREQUENCY_DAILY,
  FREQUENCY_HOURLY,
  FREQUENCY_MINUTELY,
  FREQUENCY_MONTHLY,
  FREQUENCY_YEARLY,
} from '../translations';
import { createDefaultRecurrence } from '../types';
import type { RecurrenceFormState } from '../types';
import { renderWithProviders } from './test_helpers';

const baseRecurrence = (): RecurrenceFormState => createDefaultRecurrence();

describe('FrequencySelector', () => {
  describe('rendering — restricted frequency set (initial release)', () => {
    it('renders only the Daily and Custom options', () => {
      renderWithProviders(<FrequencySelector value={baseRecurrence()} onChange={jest.fn()} />);

      expect(screen.getByLabelText(FREQUENCY_DAILY)).toBeInTheDocument();
      expect(screen.getByLabelText(FREQUENCY_CUSTOM)).toBeInTheDocument();
    });

    it('does not render the Minutely, Hourly, Monthly, or Yearly options', () => {
      // These frequency tokens are intentionally commented out in
      // `frequency_selector.tsx` for the initial release. If this test starts
      // failing because the options are present, re-enable the matching
      // tokens in `./types` and update the spec.
      renderWithProviders(<FrequencySelector value={baseRecurrence()} onChange={jest.fn()} />);

      expect(screen.queryByLabelText(FREQUENCY_MINUTELY)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(FREQUENCY_HOURLY)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(FREQUENCY_MONTHLY)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(FREQUENCY_YEARLY)).not.toBeInTheDocument();
    });
  });

  describe('Daily mode', () => {
    it('marks Daily as selected when frequency is "daily"', () => {
      renderWithProviders(
        <FrequencySelector
          value={{ ...baseRecurrence(), frequency: 'daily' }}
          onChange={jest.fn()}
        />
      );

      const daily = screen.getByLabelText(FREQUENCY_DAILY) as HTMLInputElement;
      expect(daily.checked).toBe(true);
    });

    it('does not render the weekday checkboxes when in Daily mode', () => {
      renderWithProviders(
        <FrequencySelector
          value={{ ...baseRecurrence(), frequency: 'daily' }}
          onChange={jest.fn()}
        />
      );

      expect(screen.queryByTestId('osquery-frequency-selector-weekdays')).not.toBeInTheDocument();
    });
  });

  describe('Custom (weekly) mode', () => {
    it('renders the weekday checkbox group and INTERVAL input', () => {
      renderWithProviders(
        <FrequencySelector
          value={{ ...baseRecurrence(), frequency: 'custom' }}
          onChange={jest.fn()}
        />
      );

      expect(screen.getByTestId('osquery-frequency-selector-weekdays')).toBeInTheDocument();
      expect(screen.getByTestId('osquery-frequency-selector-every')).toBeInTheDocument();
    });

    it('reflects the selected weekdays in the checkbox state', () => {
      renderWithProviders(
        <FrequencySelector
          value={{
            ...baseRecurrence(),
            frequency: 'custom',
            byweekday: ['MO', 'WE'],
          }}
          onChange={jest.fn()}
        />
      );

      expect((screen.getByLabelText('Mon') as HTMLInputElement).checked).toBe(true);
      expect((screen.getByLabelText('Wed') as HTMLInputElement).checked).toBe(true);
      expect((screen.getByLabelText('Tue') as HTMLInputElement).checked).toBe(false);
    });

    it('shows the AT_LEAST_ONE_DAY_ERROR when weekdaysError is true', () => {
      renderWithProviders(
        <FrequencySelector
          value={{
            ...baseRecurrence(),
            frequency: 'custom',
            byweekday: [],
          }}
          onChange={jest.fn()}
          weekdaysError
        />
      );

      expect(screen.getByText(AT_LEAST_ONE_DAY_ERROR)).toBeInTheDocument();
    });
  });

  describe('change handling', () => {
    it('switches frequency and clears `_unknown` on the change', () => {
      const onChange = jest.fn();
      renderWithProviders(
        <FrequencySelector
          value={{
            ...baseRecurrence(),
            frequency: 'daily',
            _unknown: { BYHOUR: '9' },
          }}
          onChange={onChange}
        />
      );

      fireEvent.click(screen.getByLabelText(FREQUENCY_CUSTOM));

      expect(onChange).toHaveBeenCalledTimes(1);
      const next = onChange.mock.calls[0][0] as RecurrenceFormState;
      expect(next.frequency).toBe('custom');
      // A frequency change must clear `_unknown` so the new RRULE shape
      // isn't contaminated by parts that only made sense under the prior mode.
      expect(next._unknown).toBeUndefined();
    });

    it('does not fire onChange when the user re-selects the current frequency', () => {
      const onChange = jest.fn();
      renderWithProviders(
        <FrequencySelector
          value={{ ...baseRecurrence(), frequency: 'daily' }}
          onChange={onChange}
        />
      );

      fireEvent.click(screen.getByLabelText(FREQUENCY_DAILY));
      expect(onChange).not.toHaveBeenCalled();
    });

    it('appends a newly selected weekday in canonical order (MO..SU)', () => {
      const onChange = jest.fn();
      renderWithProviders(
        <FrequencySelector
          value={{
            ...baseRecurrence(),
            frequency: 'custom',
            byweekday: ['WE'],
          }}
          onChange={onChange}
        />
      );

      fireEvent.click(screen.getByLabelText('Mon'));
      const next = onChange.mock.calls[0][0] as RecurrenceFormState;
      // Canonical week order means Monday lands before Wednesday regardless of
      // the order the user clicked the boxes.
      expect(next.byweekday).toEqual(['MO', 'WE']);
    });

    it('removes a previously selected weekday on toggle off', () => {
      const onChange = jest.fn();
      renderWithProviders(
        <FrequencySelector
          value={{
            ...baseRecurrence(),
            frequency: 'custom',
            byweekday: ['MO', 'TU'],
          }}
          onChange={onChange}
        />
      );

      fireEvent.click(screen.getByLabelText('Mon'));
      const next = onChange.mock.calls[0][0] as RecurrenceFormState;
      expect(next.byweekday).toEqual(['TU']);
    });

    it('clamps the INTERVAL input below the minimum (1)', () => {
      const onChange = jest.fn();
      renderWithProviders(
        <FrequencySelector
          value={{ ...baseRecurrence(), frequency: 'custom' }}
          onChange={onChange}
        />
      );

      fireEvent.change(screen.getByTestId('osquery-frequency-selector-every'), {
        target: { value: '0' },
      });

      const next = onChange.mock.calls[0][0] as RecurrenceFormState;
      expect(next.interval).toBe(1);
    });

    it('clamps the INTERVAL input above the maximum (9999)', () => {
      const onChange = jest.fn();
      renderWithProviders(
        <FrequencySelector
          value={{ ...baseRecurrence(), frequency: 'custom' }}
          onChange={onChange}
        />
      );

      fireEvent.change(screen.getByTestId('osquery-frequency-selector-every'), {
        target: { value: '99999' },
      });

      const next = onChange.mock.calls[0][0] as RecurrenceFormState;
      expect(next.interval).toBe(9999);
    });
  });

  describe('instance-scoped radio ids (cross-instance click leak guard)', () => {
    // Two ScheduleSection instances can coexist on screen — the pack form and
    // an open query flyout. With shared static option ids, clicking a `<label
    // htmlFor>` would activate the first matching radio in document order,
    // making a click in the flyout flip the pack's frequency. In product code
    // each instance gets a unique prefix via `useGeneratedHtmlId`; the tests
    // pin distinct prefixes to mirror that because EUI's test-env stub
    // returns a static id.
    it('routes frequency-label clicks only to the instance whose label was clicked', () => {
      const firstOnChange = jest.fn();
      const secondOnChange = jest.fn();
      renderWithProviders(
        <>
          <FrequencySelector
            value={{ ...baseRecurrence(), frequency: 'daily' }}
            onChange={firstOnChange}
            idPrefix="freq-selector-first"
          />
          <FrequencySelector
            value={{ ...baseRecurrence(), frequency: 'daily' }}
            onChange={secondOnChange}
            idPrefix="freq-selector-second"
          />
        </>
      );

      const customLabels = screen.getAllByText(FREQUENCY_CUSTOM);
      expect(customLabels).toHaveLength(2);
      fireEvent.click(customLabels[1]);

      expect(secondOnChange).toHaveBeenCalledTimes(1);
      expect(firstOnChange).not.toHaveBeenCalled();
    });

    it('routes weekday-label clicks only to the instance whose label was clicked', () => {
      const firstOnChange = jest.fn();
      const secondOnChange = jest.fn();
      renderWithProviders(
        <>
          <FrequencySelector
            value={{ ...baseRecurrence(), frequency: 'custom' }}
            onChange={firstOnChange}
            idPrefix="freq-selector-first"
          />
          <FrequencySelector
            value={{ ...baseRecurrence(), frequency: 'custom' }}
            onChange={secondOnChange}
            idPrefix="freq-selector-second"
          />
        </>
      );

      const mondayLabels = screen.getAllByText('Mon');
      expect(mondayLabels).toHaveLength(2);
      fireEvent.click(mondayLabels[1]);

      expect(secondOnChange).toHaveBeenCalledTimes(1);
      expect(firstOnChange).not.toHaveBeenCalled();
    });
  });
});
