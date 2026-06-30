/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';
import { render } from '@testing-library/react';
import {
  deserializeGlobalMaxRetention,
  getLifecycleValue,
  formatDlmLifecycleSummary,
  countDlmDataPhases,
  resolveLifecycleForSummary,
} from './data_streams';

describe('Data stream helpers', () => {
  describe('getLifecycleValue', () => {
    it('Knows when it should be marked as disabled', () => {
      expect(
        getLifecycleValue({
          enabled: false,
        })
      ).toBe('Disabled');

      expect(getLifecycleValue()).toBe('Disabled');
    });

    it('knows when it should be marked as infinite', () => {
      expect(
        getLifecycleValue({
          enabled: true,
        })
      ).toBe('Keep data indefinitely');
    });

    it('renders infinity icon when infiniteAsIcon is true', () => {
      const { container } = render(<>{getLifecycleValue({ enabled: true }, true)}</>);
      expect(container.querySelector('[data-euiicon-type="infinity"]')).toBeInTheDocument();
    });

    it('knows when it has a defined data retention period', () => {
      expect(
        getLifecycleValue({
          enabled: true,
          data_retention: '2d',
        })
      ).toBe('2 days');
    });

    it('effective_retention should always have precedence over data_retention', () => {
      expect(
        getLifecycleValue({
          enabled: true,
          data_retention: '2d',
          effective_retention: '5d',
        })
      ).toBe('5 days');
    });
  });

  describe('formatDlmLifecycleSummary', () => {
    it('returns disabled when lifecycle is not enabled', () => {
      expect(formatDlmLifecycleSummary({ enabled: false })).toBe('Disabled');
    });

    describe('when includePhaseCount is false (Serverless / tiers disabled)', () => {
      it('formats infinite retention as infinity icon', () => {
        const { container: firstContainer } = render(
          <>{formatDlmLifecycleSummary({ enabled: true })}</>
        );
        expect(firstContainer.querySelector('[data-euiicon-type="infinity"]')).toBeInTheDocument();

        const { container: secondContainer } = render(
          <>{formatDlmLifecycleSummary({ enabled: true, data_retention: -1 })}</>
        );
        expect(secondContainer.querySelector('[data-euiicon-type="infinity"]')).toBeInTheDocument();
      });

      it('formats finite retention as duration only', () => {
        expect(formatDlmLifecycleSummary({ enabled: true, data_retention: '60d' })).toBe('60 days');
      });
    });

    describe('when includePhaseCount is true (tiers layout)', () => {
      it('formats infinite retention with hot phase only', () => {
        expect(formatDlmLifecycleSummary({ enabled: true }, { includePhaseCount: true })).toBe(
          '∞ · 1 data phase'
        );
        expect(
          formatDlmLifecycleSummary(
            { enabled: true, data_retention: -1 },
            { includePhaseCount: true }
          )
        ).toBe('∞ · 1 data phase');
      });

      it('formats infinite retention with hot and frozen phases', () => {
        expect(
          formatDlmLifecycleSummary(
            { enabled: true, frozen_after: '30d' },
            { includePhaseCount: true }
          )
        ).toBe('∞ · 2 data phases');
      });

      it('formats delete retention with hot and delete phases', () => {
        expect(
          formatDlmLifecycleSummary(
            { enabled: true, data_retention: '60d' },
            { includePhaseCount: true }
          )
        ).toBe('60 days · 2 data phases');
      });

      it('includes frozen phase in the count', () => {
        expect(
          formatDlmLifecycleSummary(
            {
              enabled: true,
              data_retention: '60d',
              frozen_after: '30d',
            },
            { includePhaseCount: true }
          )
        ).toBe('60 days · 3 data phases');
      });
    });
  });

  describe('resolveLifecycleForSummary', () => {
    it('defaults to hot-only for data stream templates without lifecycle', () => {
      expect(resolveLifecycleForSummary(undefined, { hasDataStream: true })).toEqual({
        enabled: true,
      });
    });

    it('returns lifecycle unchanged when already enabled', () => {
      const lifecycle = { enabled: true as const, data_retention: '60d' };
      expect(resolveLifecycleForSummary(lifecycle, { hasDataStream: true })).toEqual(lifecycle);
    });

    it('does not default when template is not a data stream', () => {
      expect(resolveLifecycleForSummary(undefined, { hasDataStream: false })).toBeUndefined();
    });
  });

  describe('countDlmDataPhases', () => {
    it('returns 0 when lifecycle is disabled', () => {
      expect(countDlmDataPhases({ enabled: false })).toBe(0);
    });

    it('counts hot, frozen, and delete phases', () => {
      expect(
        countDlmDataPhases({
          enabled: true,
          frozen_after: '30d',
          data_retention: '60d',
        })
      ).toBe(3);
    });

    it('counts delete phase from effective_retention when data_retention is not set', () => {
      expect(
        countDlmDataPhases({
          enabled: true,
          effective_retention: '60d',
        })
      ).toBe(2);
    });
  });

  describe('deserializeGlobalMaxRetention', () => {
    it('if globalMaxRetention is undefined', () => {
      expect(deserializeGlobalMaxRetention(undefined)).toEqual({});
    });

    it('split globalMaxRetention size and units', () => {
      expect(deserializeGlobalMaxRetention('1000h')).toEqual({
        size: '1000',
        unit: 'h',
        unitText: 'hours',
      });
    });

    it('support all of the units that are accepted by es', () => {
      expect(deserializeGlobalMaxRetention('1000ms')).toEqual({
        size: '1000',
        unit: 'ms',
        unitText: 'milliseconds',
      });
      expect(deserializeGlobalMaxRetention('1000micros')).toEqual({
        size: '1000',
        unit: 'micros',
        unitText: 'microseconds',
      });
      expect(deserializeGlobalMaxRetention('1000nanos')).toEqual({
        size: '1000',
        unit: 'nanos',
        unitText: 'nanoseconds',
      });
    });
  });
});
