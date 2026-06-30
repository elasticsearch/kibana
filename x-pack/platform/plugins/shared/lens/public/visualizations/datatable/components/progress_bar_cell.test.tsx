/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MeterFillStyle, MeterSize } from '@elastic/charts';
import { LENS_DATAGRID_DENSITY } from '@kbn/lens-common';
import type { CellDecorationFillConfig } from '@kbn/lens-common';
import {
  ProgressBarCell,
  getMeterFill,
  getProgressBarLabelWidthCh,
  getProgressBarSize,
  toMeterColorStops,
} from './progress_bar_cell';

jest.mock('@elastic/charts', () => {
  const actual = jest.requireActual('@elastic/charts');
  const mockMeter = jest.fn((_props: Record<string, unknown>) => null);
  return {
    ...actual,
    Meter: (props: Record<string, unknown>) => {
      mockMeter(props);
      return <div data-test-subj="mockMeter" />;
    },
    __mockMeter: mockMeter,
  };
});

const meterMock = (jest.requireMock('@elastic/charts') as { __mockMeter: jest.Mock }).__mockMeter;

describe('progress bar cell helpers', () => {
  describe('getProgressBarSize', () => {
    it('maps density to a Meter thickness, defaulting to the normal (large) pill', () => {
      expect(getProgressBarSize(LENS_DATAGRID_DENSITY.COMPACT)).toBe(MeterSize.Medium);
      expect(getProgressBarSize(LENS_DATAGRID_DENSITY.NORMAL)).toBe(MeterSize.Large);
      expect(getProgressBarSize(LENS_DATAGRID_DENSITY.EXPANDED)).toBe(MeterSize.Large);
      expect(getProgressBarSize(undefined)).toBe(MeterSize.Large);
    });
  });

  describe('toMeterColorStops', () => {
    it('zips parallel color/stop arrays into domain-valued stops', () => {
      expect(toMeterColorStops(['#a', '#b', '#c'], [0, 50, 100])).toEqual([
        { color: '#a', stop: 0 },
        { color: '#b', stop: 50 },
        { color: '#c', stop: 100 },
      ]);
    });

    it('returns no stops when either array is empty', () => {
      expect(toMeterColorStops([], [0, 1])).toEqual([]);
      expect(toMeterColorStops(['#a'], [])).toEqual([]);
      expect(toMeterColorStops(undefined, undefined)).toEqual([]);
    });
  });

  describe('getMeterFill', () => {
    it('builds a single fill from the configured color', () => {
      const config: CellDecorationFillConfig = { fillMode: 'single', color: '#123456' };
      expect(getMeterFill(config, [], '#fallback')).toEqual({
        type: MeterFillStyle.Single,
        color: '#123456',
      });
    });

    it('falls back to the fallback color when single has no color', () => {
      const config: CellDecorationFillConfig = { fillMode: 'single' };
      expect(getMeterFill(config, [], '#fallback')).toEqual({
        type: MeterFillStyle.Single,
        color: '#fallback',
      });
    });

    it('builds a solid palette fill with the provided stops', () => {
      const config: CellDecorationFillConfig = { fillMode: 'solid' };
      const stops = [{ color: '#a', stop: 0 }];
      expect(getMeterFill(config, stops, '#fallback')).toEqual({
        type: 'palette',
        style: MeterFillStyle.Solid,
        colorStops: stops,
        fallbackColor: '#fallback',
      });
    });

    it('builds a gradient palette fill', () => {
      const config: CellDecorationFillConfig = { fillMode: 'gradient' };
      const fill = getMeterFill(config, [], '#fallback');
      expect(fill).toMatchObject({ type: 'palette', style: MeterFillStyle.Gradient });
    });
  });

  describe('getProgressBarLabelWidthCh', () => {
    const formatter = { convertToText: (v: unknown) => String(v) };

    it('reserves width for the widest formatted bound (negative min wider than max)', () => {
      // "-30" is 3 chars, "27" is 2 chars -> gutter must fit the wider one.
      expect(getProgressBarLabelWidthCh(formatter, -30, 27)).toBe(3);
    });

    it('uses the formatter so suffixed/padded values are measured (e.g. percent)', () => {
      const percent = { convertToText: (v: unknown) => `${v}%` };
      // "100%" is 4 chars.
      expect(getProgressBarLabelWidthCh(percent, 0, 100)).toBe(4);
    });

    it('never drops below the minimum gutter width', () => {
      expect(getProgressBarLabelWidthCh(formatter, 0, 5)).toBe(3);
    });

    it('ignores non-finite bounds when measuring', () => {
      expect(getProgressBarLabelWidthCh(formatter, Number.NEGATIVE_INFINITY, 12345)).toBe(5);
    });

    it('falls back to String() when no formatter is provided', () => {
      expect(getProgressBarLabelWidthCh(undefined, 0, 123456)).toBe(6);
    });
  });

  describe('ProgressBarCell label', () => {
    const baseProps = {
      value: 42,
      label: '42',
      domain: [0, 100] as [number, number],
      fill: { type: MeterFillStyle.Single, color: '#123' } as ReturnType<typeof getMeterFill>,
      size: MeterSize.Medium,
      alignment: 'right' as const,
    };

    it('renders a static label when not clickable', () => {
      render(<ProgressBarCell {...baseProps} />);
      const label = screen.getByTestId('lnsTableProgressBarLabel');
      expect(label.tagName.toLowerCase()).toBe('span');
    });

    it('renders a clickable filter label when onLabelClick is provided', async () => {
      const onLabelClick = jest.fn();
      render(<ProgressBarCell {...baseProps} onLabelClick={onLabelClick} />);
      const label = screen.getByTestId('lnsTableProgressBarLabel');
      await userEvent.click(label);
      expect(onLabelClick).toHaveBeenCalledTimes(1);
    });

    it('reserves a tabular-nums gutter so bars share a start edge', () => {
      render(<ProgressBarCell {...baseProps} alignment="left" labelWidthCh={5} />);
      const label = screen.getByTestId('lnsTableProgressBarLabel');
      const style = getComputedStyle(label);
      expect(style.fontVariantNumeric).toContain('tabular-nums');
      expect(style.minWidth).toBe('5ch');
      // Leading value (left-aligned column) is right-aligned so the bar starts flush.
      expect(style.textAlign).toBe('right');
    });

    it('left-aligns a trailing value so the bar ends flush (right-aligned column)', () => {
      render(<ProgressBarCell {...baseProps} alignment="right" labelWidthCh={5} />);
      const label = screen.getByTestId('lnsTableProgressBarLabel');
      expect(getComputedStyle(label).textAlign).toBe('left');
    });
  });

  describe('ProgressBarCell baseline', () => {
    const baseProps = {
      value: 42,
      label: '42',
      domain: [0, 100] as [number, number],
      fill: { type: MeterFillStyle.Single, color: '#123' } as ReturnType<typeof getMeterFill>,
      size: MeterSize.Medium,
      alignment: 'right' as const,
    };

    beforeEach(() => meterMock.mockClear());

    it('defaults the fill baseline to 0 and rounds the start at the domain edge', () => {
      render(<ProgressBarCell {...baseProps} />);
      expect(meterMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ baseline: 0, roundFillStart: true })
      );
    });

    it('leaves the start square when the domain crosses below the baseline', () => {
      render(<ProgressBarCell {...baseProps} domain={[-50, 100]} />);
      expect(meterMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ baseline: 0, roundFillStart: false })
      );
    });

    it('honors an explicit baseline inside the domain and squares the start', () => {
      render(<ProgressBarCell {...baseProps} domain={[0, 200]} baseline={50} />);
      expect(meterMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ baseline: 50, roundFillStart: false })
      );
    });
  });
});
