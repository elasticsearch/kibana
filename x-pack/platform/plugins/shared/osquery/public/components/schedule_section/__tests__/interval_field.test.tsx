/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { IntervalField, MAX_INTERVAL_SECONDS, MIN_INTERVAL_SECONDS } from '../interval_field';
import { renderWithProviders } from './test_helpers';

describe('IntervalField', () => {
  describe('rendering', () => {
    it('renders the current value with the seconds unit append', () => {
      renderWithProviders(<IntervalField value={3600} onChange={jest.fn()} />);

      const input = screen.getByTestId('osquery-schedule-interval') as HTMLInputElement;
      expect(input.value).toBe('3600');
    });

    it('respects the `disabled` prop', () => {
      renderWithProviders(<IntervalField value={60} onChange={jest.fn()} disabled />);

      const input = screen.getByTestId('osquery-schedule-interval') as HTMLInputElement;
      expect(input).toBeDisabled();
    });
  });

  describe('change handling', () => {
    it('propagates a clean integer change', () => {
      const onChange = jest.fn();
      renderWithProviders(<IntervalField value={60} onChange={onChange} />);

      fireEvent.change(screen.getByTestId('osquery-schedule-interval'), {
        target: { value: '120' },
      });

      expect(onChange).toHaveBeenCalledWith(120);
    });

    it('clamps values below MIN to the minimum', () => {
      const onChange = jest.fn();
      renderWithProviders(<IntervalField value={60} onChange={onChange} />);

      fireEvent.change(screen.getByTestId('osquery-schedule-interval'), {
        target: { value: '0' },
      });

      expect(onChange).toHaveBeenCalledWith(MIN_INTERVAL_SECONDS);
    });

    it('clamps values above MAX to the maximum', () => {
      const onChange = jest.fn();
      renderWithProviders(<IntervalField value={60} onChange={onChange} />);

      fireEvent.change(screen.getByTestId('osquery-schedule-interval'), {
        target: { value: `${MAX_INTERVAL_SECONDS + 1000}` },
      });

      expect(onChange).toHaveBeenCalledWith(MAX_INTERVAL_SECONDS);
    });

    it('truncates fractional input to an integer', () => {
      const onChange = jest.fn();
      renderWithProviders(<IntervalField value={60} onChange={onChange} />);

      fireEvent.change(screen.getByTestId('osquery-schedule-interval'), {
        target: { value: '120.7' },
      });

      expect(onChange).toHaveBeenCalledWith(120);
    });

    it('clamps empty / unparseable input to the minimum (HTML number input filters non-digits)', () => {
      const onChange = jest.fn();
      renderWithProviders(<IntervalField value={60} onChange={onChange} />);

      // EuiFieldNumber backs a `<input type=number>`; non-numeric chars never
      // reach the change handler. Setting `value: ''` is the realistic shape
      // and we expect the handler to clamp to MIN_INTERVAL_SECONDS.
      fireEvent.change(screen.getByTestId('osquery-schedule-interval'), {
        target: { value: '' },
      });

      expect(onChange).toHaveBeenCalledWith(MIN_INTERVAL_SECONDS);
    });
  });
});
