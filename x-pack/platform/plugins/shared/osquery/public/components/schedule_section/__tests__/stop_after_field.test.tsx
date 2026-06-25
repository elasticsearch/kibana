/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { StopAfterField } from '../stop_after_field';
import { STOP_AFTER_BEFORE_START_ERROR } from '../translations';
import { renderWithProviders } from './test_helpers';

const startDate = new Date('2026-05-26T10:00:00.000Z');
const afterStart = new Date('2026-05-27T10:00:00.000Z');
const beforeStart = new Date('2026-05-25T10:00:00.000Z');

describe('StopAfterField', () => {
  describe('disabled / toggle state', () => {
    it('does not render the date picker body when `enabled` is false', () => {
      renderWithProviders(
        <StopAfterField
          enabled={false}
          value={afterStart}
          startDate={startDate}
          onChange={jest.fn()}
        />
      );

      expect(screen.queryByTestId('osquery-schedule-stop-after-date')).not.toBeInTheDocument();
    });

    it('renders the date picker body when `enabled` is true', () => {
      renderWithProviders(
        <StopAfterField enabled value={afterStart} startDate={startDate} onChange={jest.fn()} />
      );

      expect(screen.getByTestId('osquery-schedule-stop-after-date')).toBeInTheDocument();
    });

    it('keeps the input editable at the DOM level so the picker popover can still open', () => {
      renderWithProviders(
        <StopAfterField enabled value={afterStart} startDate={startDate} onChange={jest.fn()} />
      );

      expect(screen.getByTestId('osquery-schedule-stop-after-date-input')).not.toHaveAttribute(
        'readonly'
      );
    });

    it('fires onChange({ enabled: true, date }) when the toggle is flipped on', () => {
      const onChange = jest.fn();
      renderWithProviders(
        <StopAfterField
          enabled={false}
          value={afterStart}
          startDate={startDate}
          onChange={onChange}
        />
      );

      fireEvent.click(screen.getByTestId('osquery-schedule-stop-after-toggle'));

      expect(onChange).toHaveBeenCalledWith({ enabled: true, date: afterStart });
    });
  });

  describe('validation', () => {
    it('does NOT surface the before-start error when enabled is false', () => {
      renderWithProviders(
        <StopAfterField
          enabled={false}
          value={beforeStart}
          startDate={startDate}
          onChange={jest.fn()}
        />
      );

      expect(screen.queryByText(STOP_AFTER_BEFORE_START_ERROR)).not.toBeInTheDocument();
    });

    it('does NOT surface the before-start error on first render even when invalid', () => {
      // Validation is deferred until the field is touched (blurred or
      // interacted with) — otherwise the user sees an error before they have
      // had a chance to pick a date.
      renderWithProviders(
        <StopAfterField enabled value={beforeStart} startDate={startDate} onChange={jest.fn()} />
      );

      expect(screen.queryByText(STOP_AFTER_BEFORE_START_ERROR)).not.toBeInTheDocument();
    });

    it('surfaces the before-start error after the field is blurred', () => {
      renderWithProviders(
        <StopAfterField enabled value={beforeStart} startDate={startDate} onChange={jest.fn()} />
      );

      fireEvent.blur(screen.getByTestId('osquery-schedule-stop-after-date-input'));

      expect(screen.getByText(STOP_AFTER_BEFORE_START_ERROR)).toBeInTheDocument();
    });

    it('surfaces the before-start error when showErrors is true (submit attempt)', () => {
      renderWithProviders(
        <StopAfterField
          enabled
          value={beforeStart}
          startDate={startDate}
          onChange={jest.fn()}
          showErrors
        />
      );

      expect(screen.getByText(STOP_AFTER_BEFORE_START_ERROR)).toBeInTheDocument();
    });

    it('surfaces the before-start error when date equals startDate exactly after blur', () => {
      renderWithProviders(
        <StopAfterField enabled value={startDate} startDate={startDate} onChange={jest.fn()} />
      );

      fireEvent.blur(screen.getByTestId('osquery-schedule-stop-after-date-input'));

      // `isBeforeStart` uses `<= startDate.getTime()`, so the boundary is
      // invalid (rrule UNTIL must be strictly after DTSTART to ever fire).
      expect(screen.getByText(STOP_AFTER_BEFORE_START_ERROR)).toBeInTheDocument();
    });

    it('passes validation when enabled and date > startDate', () => {
      renderWithProviders(
        <StopAfterField enabled value={afterStart} startDate={startDate} onChange={jest.fn()} />
      );

      expect(screen.queryByText(STOP_AFTER_BEFORE_START_ERROR)).not.toBeInTheDocument();
    });
  });
});
