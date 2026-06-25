/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { SplayTimeField } from '../splay_time_field';
import { SPLAY_MAX_ERROR, SPLAY_QUERY_STORM_WARNING } from '../translations';
import { createDefaultSplay } from '../types';
import type { SplayFormStateUI } from '../types';
import { renderWithProviders } from './test_helpers';

const baseSplay = (overrides: Partial<SplayFormStateUI> = {}): SplayFormStateUI => ({
  ...createDefaultSplay(),
  ...overrides,
});

describe('SplayTimeField', () => {
  describe('toggle visibility', () => {
    it('hides the value/unit inputs when splay is disabled', () => {
      renderWithProviders(
        <SplayTimeField value={baseSplay({ enabled: false })} onChange={jest.fn()} />
      );

      expect(screen.queryByTestId('osquery-schedule-splay-value')).not.toBeInTheDocument();
      expect(screen.queryByTestId('osquery-schedule-splay-unit')).not.toBeInTheDocument();
    });

    it('shows the value/unit inputs when splay is enabled', () => {
      renderWithProviders(
        <SplayTimeField value={baseSplay({ enabled: true })} onChange={jest.fn()} />
      );

      expect(screen.getByTestId('osquery-schedule-splay-value')).toBeInTheDocument();
      expect(screen.getByTestId('osquery-schedule-splay-unit')).toBeInTheDocument();
    });
  });

  describe('change handling', () => {
    it('clears `rawCompound` when the user toggles splay on', () => {
      const onChange = jest.fn();
      renderWithProviders(
        <SplayTimeField
          value={baseSplay({ enabled: false, rawCompound: '1h30m' })}
          onChange={onChange}
        />
      );

      fireEvent.click(screen.getByTestId('osquery-schedule-splay-toggle'));

      // Once the user touches the splay control, the form re-emits a
      // single-unit value and the preserved compound string is discarded.
      expect(onChange).toHaveBeenCalledWith({
        ...baseSplay({ enabled: true }),
        rawCompound: undefined,
      });
    });

    it('clears `rawCompound` when the user edits the numeric value', () => {
      const onChange = jest.fn();
      renderWithProviders(
        <SplayTimeField
          value={baseSplay({ enabled: true, rawCompound: '1h30m', value: 30 })}
          onChange={onChange}
        />
      );

      fireEvent.change(screen.getByTestId('osquery-schedule-splay-value'), {
        target: { value: '45' },
      });

      const next = onChange.mock.calls[0][0] as SplayFormStateUI;
      expect(next.value).toBe(45);
      expect(next.rawCompound).toBeUndefined();
    });

    it('clamps numeric values below 1 to 1', () => {
      const onChange = jest.fn();
      renderWithProviders(
        <SplayTimeField value={baseSplay({ enabled: true, value: 5 })} onChange={onChange} />
      );

      fireEvent.change(screen.getByTestId('osquery-schedule-splay-value'), {
        target: { value: '0' },
      });

      const next = onChange.mock.calls[0][0] as SplayFormStateUI;
      expect(next.value).toBe(1);
    });

    it('switches the unit and clears `rawCompound`', () => {
      const onChange = jest.fn();
      renderWithProviders(
        <SplayTimeField
          value={baseSplay({ enabled: true, value: 30, unit: 'seconds' })}
          onChange={onChange}
        />
      );

      fireEvent.change(screen.getByTestId('osquery-schedule-splay-unit'), {
        target: { value: 'minutes' },
      });

      const next = onChange.mock.calls[0][0] as SplayFormStateUI;
      expect(next.unit).toBe('minutes');
      expect(next.rawCompound).toBeUndefined();
    });
  });

  describe('validation', () => {
    it('does not show the max-splay error when splay is disabled (regardless of value)', () => {
      // 13h would exceed MAX_SPLAY_SECONDS (12h) but disabled means inert.
      renderWithProviders(
        <SplayTimeField
          value={baseSplay({ enabled: false, value: 13, unit: 'hours' })}
          onChange={jest.fn()}
        />
      );

      expect(screen.queryByText(SPLAY_MAX_ERROR)).not.toBeInTheDocument();
    });

    it('shows the max-splay error when value > MAX_SPLAY_SECONDS', () => {
      renderWithProviders(
        <SplayTimeField
          value={baseSplay({ enabled: true, value: 13, unit: 'hours' })}
          onChange={jest.fn()}
        />
      );

      expect(screen.getByText(SPLAY_MAX_ERROR)).toBeInTheDocument();
    });

    it('does not show the max-splay error when within the 12-hour cap', () => {
      renderWithProviders(
        <SplayTimeField
          value={baseSplay({ enabled: true, value: 12, unit: 'hours' })}
          onChange={jest.fn()}
        />
      );

      expect(screen.queryByText(SPLAY_MAX_ERROR)).not.toBeInTheDocument();
    });

    it('does not show the max-splay error for a within-cap compound rawCompound', () => {
      // A compound value preserved verbatim is still round-tripped to beats —
      // but only while within the 12h cap. `1h30m` is well under.
      renderWithProviders(
        <SplayTimeField
          value={baseSplay({
            enabled: true,
            value: 1,
            unit: 'hours',
            rawCompound: '1h30m',
          })}
          onChange={jest.fn()}
        />
      );

      expect(screen.queryByText(SPLAY_MAX_ERROR)).not.toBeInTheDocument();
    });

    it('shows the max-splay error for an over-cap compound rawCompound', () => {
      // The compound-splay cap bypass is closed: `13h0m` sums to > 12h and must
      // surface the error rather than short-circuit to valid.
      renderWithProviders(
        <SplayTimeField
          value={baseSplay({
            enabled: true,
            value: 13,
            unit: 'hours',
            rawCompound: '13h0m',
          })}
          onChange={jest.fn()}
        />
      );

      expect(screen.getByText(SPLAY_MAX_ERROR)).toBeInTheDocument();
    });
  });

  describe('query-storm advisory', () => {
    it('renders the advisory when splay is off and frequency is calendar-anchored (daily)', () => {
      renderWithProviders(
        <SplayTimeField
          value={baseSplay({ enabled: false })}
          onChange={jest.fn()}
          isRecurrence
          frequency="daily"
        />
      );

      expect(screen.getByText(SPLAY_QUERY_STORM_WARNING)).toBeInTheDocument();
    });

    it('renders the advisory for the custom (weekly) frequency', () => {
      renderWithProviders(
        <SplayTimeField
          value={baseSplay({ enabled: false })}
          onChange={jest.fn()}
          isRecurrence
          frequency="custom"
        />
      );

      expect(screen.getByText(SPLAY_QUERY_STORM_WARNING)).toBeInTheDocument();
    });

    it('does NOT render the advisory when splay is on (it is the mitigation)', () => {
      renderWithProviders(
        <SplayTimeField
          value={baseSplay({ enabled: true })}
          onChange={jest.fn()}
          isRecurrence
          frequency="daily"
        />
      );

      expect(screen.queryByText(SPLAY_QUERY_STORM_WARNING)).not.toBeInTheDocument();
    });

    it('does NOT render the advisory in non-recurrence mode', () => {
      renderWithProviders(
        <SplayTimeField
          value={baseSplay({ enabled: false })}
          onChange={jest.fn()}
          isRecurrence={false}
          frequency="daily"
        />
      );

      expect(screen.queryByText(SPLAY_QUERY_STORM_WARNING)).not.toBeInTheDocument();
    });

    it('does NOT render the advisory when frequency is undefined', () => {
      renderWithProviders(
        <SplayTimeField value={baseSplay({ enabled: false })} onChange={jest.fn()} isRecurrence />
      );

      expect(screen.queryByText(SPLAY_QUERY_STORM_WARNING)).not.toBeInTheDocument();
    });
  });
});
