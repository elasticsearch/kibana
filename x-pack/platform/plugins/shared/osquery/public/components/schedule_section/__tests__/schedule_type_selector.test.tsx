/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { ScheduleTypeSelector } from '../schedule_type_selector';
import { SCHEDULE_TYPE_LOCKED_HELP } from '../translations';
import { renderWithProviders } from './test_helpers';

describe('ScheduleTypeSelector', () => {
  describe('rendering', () => {
    it('renders interval as selected when value is "interval"', () => {
      renderWithProviders(<ScheduleTypeSelector value="interval" onChange={jest.fn()} />);

      const intervalRadio = screen.getByLabelText('Interval') as HTMLInputElement;
      const rruleRadio = screen.getByLabelText('Date & time') as HTMLInputElement;
      expect(intervalRadio.checked).toBe(true);
      expect(rruleRadio.checked).toBe(false);
    });

    it('renders rrule as selected when value is "rrule"', () => {
      renderWithProviders(<ScheduleTypeSelector value="rrule" onChange={jest.fn()} />);

      const intervalRadio = screen.getByLabelText('Interval') as HTMLInputElement;
      const rruleRadio = screen.getByLabelText('Date & time') as HTMLInputElement;
      expect(intervalRadio.checked).toBe(false);
      expect(rruleRadio.checked).toBe(true);
    });

    it('omits the locked help text when no lockedScheduleType is supplied', () => {
      renderWithProviders(<ScheduleTypeSelector value="interval" onChange={jest.fn()} />);

      expect(screen.queryByText(SCHEDULE_TYPE_LOCKED_HELP)).not.toBeInTheDocument();
    });
  });

  describe('change handling', () => {
    it('fires onChange when the user picks the other mode', () => {
      const onChange = jest.fn();
      renderWithProviders(<ScheduleTypeSelector value="interval" onChange={onChange} />);

      fireEvent.click(screen.getByTestId('osquery-schedule-type-rrule'));
      expect(onChange).toHaveBeenCalledWith('rrule');
    });

    it('does not fire onChange when the user re-clicks the current mode', () => {
      const onChange = jest.fn();
      renderWithProviders(<ScheduleTypeSelector value="interval" onChange={onChange} />);

      fireEvent.click(screen.getByTestId('osquery-schedule-type-interval'));
      expect(onChange).not.toHaveBeenCalled();
    });

    it('does not fire onChange when disabled', () => {
      const onChange = jest.fn();
      renderWithProviders(<ScheduleTypeSelector value="interval" onChange={onChange} disabled />);

      fireEvent.click(screen.getByTestId('osquery-schedule-type-rrule'));
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('locked mode (same-mode constraint)', () => {
    it('renders the lockedScheduleType as selected, regardless of value prop', () => {
      // Pass mismatched `value` to prove `lockedScheduleType` wins.
      renderWithProviders(
        <ScheduleTypeSelector value="interval" onChange={jest.fn()} lockedScheduleType="rrule" />
      );

      const intervalRadio = screen.getByLabelText('Interval') as HTMLInputElement;
      const rruleRadio = screen.getByLabelText('Date & time') as HTMLInputElement;
      expect(intervalRadio.checked).toBe(false);
      expect(rruleRadio.checked).toBe(true);
    });

    it('surfaces the locked help text', () => {
      renderWithProviders(
        <ScheduleTypeSelector value="interval" onChange={jest.fn()} lockedScheduleType="interval" />
      );

      expect(screen.getByText(SCHEDULE_TYPE_LOCKED_HELP)).toBeInTheDocument();
    });

    it('does not fire onChange when locked and the user clicks the other card', () => {
      const onChange = jest.fn();
      renderWithProviders(
        <ScheduleTypeSelector value="interval" onChange={onChange} lockedScheduleType="rrule" />
      );

      fireEvent.click(screen.getByTestId('osquery-schedule-type-interval'));
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('instance-scoped radio ids (cross-instance click leak guard)', () => {
    // Two ScheduleSection instances can coexist on screen — the pack form and
    // an open query flyout. With shared static radio ids, clicking a `<label
    // htmlFor>` would activate the first matching radio in document order,
    // making a click in the flyout flip the pack's schedule mode. In product
    // code the prefix is auto-generated per instance via `useGeneratedHtmlId`;
    // the tests pin distinct prefixes to mirror that behavior because EUI's
    // test-env stub returns a static id.
    it('routes clicks only to the instance whose label was clicked', () => {
      const firstOnChange = jest.fn();
      const secondOnChange = jest.fn();
      renderWithProviders(
        <>
          <ScheduleTypeSelector
            value="interval"
            onChange={firstOnChange}
            idPrefix="osquery-schedule-type-first"
          />
          <ScheduleTypeSelector
            value="interval"
            onChange={secondOnChange}
            idPrefix="osquery-schedule-type-second"
          />
        </>
      );

      const rruleLabels = screen.getAllByText('Date & time');
      expect(rruleLabels).toHaveLength(2);
      fireEvent.click(rruleLabels[1]);

      expect(secondOnChange).toHaveBeenCalledWith('rrule');
      expect(firstOnChange).not.toHaveBeenCalled();
    });
  });
});
