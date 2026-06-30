/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CellDecorationFillConfig } from '@kbn/lens-common';
import { chartPluginMock } from '@kbn/charts-plugin/public/mocks';
import {
  getDefaultFillConfig,
  isPaletteFillMode,
  getProgressBarDomain,
  getDecorationCustomRange,
  getProgressBarPaletteStops,
  getDecorationDefaultColor,
  DEFAULT_PROGRESS_BAR_COLOR,
} from './utils';

describe('datatable progress bar utils', () => {
  describe('getDefaultFillConfig', () => {
    it('defaults to a single fill with auto range and the progress default color', () => {
      expect(getDefaultFillConfig('progress')).toEqual({
        fillMode: 'single',
        color: DEFAULT_PROGRESS_BAR_COLOR,
        valueRange: { mode: 'auto' },
      });
    });
  });

  describe('getDecorationDefaultColor', () => {
    it('returns the datavis color for progress and undefined for other modes', () => {
      expect(getDecorationDefaultColor('progress')).toBe(DEFAULT_PROGRESS_BAR_COLOR);
      expect(getDecorationDefaultColor('cell')).toBeUndefined();
      expect(getDecorationDefaultColor('text')).toBeUndefined();
      expect(getDecorationDefaultColor('badge')).toBeUndefined();
      expect(getDecorationDefaultColor('none')).toBeUndefined();
    });
  });

  describe('isPaletteFillMode', () => {
    it('is true only for solid and gradient', () => {
      expect(isPaletteFillMode('single')).toBe(false);
      expect(isPaletteFillMode('solid')).toBe(true);
      expect(isPaletteFillMode('gradient')).toBe(true);
    });
  });

  describe('getProgressBarDomain', () => {
    const single = (
      overrides: Partial<CellDecorationFillConfig> = {}
    ): CellDecorationFillConfig => ({
      fillMode: 'single',
      ...overrides,
    });

    it('uses the loaded data bounds for an auto range (positive)', () => {
      const domain = getProgressBarDomain(
        { fillStyle: single({ valueRange: { mode: 'auto' } }) },
        { min: 10, max: 90 }
      );
      // Baseline 0 is kept inside the domain.
      expect(domain).toEqual({ min: 0, max: 90 });
    });

    it('keeps zero anchored for a negative-only auto range', () => {
      const domain = getProgressBarDomain(
        { fillStyle: single({ valueRange: { mode: 'auto' } }) },
        { min: -120, max: -10 }
      );
      expect(domain).toEqual({ min: -120, max: 0 });
    });

    it('spans the full mixed-sign auto range', () => {
      const domain = getProgressBarDomain(
        { fillStyle: single({ valueRange: { mode: 'auto' } }) },
        { min: -50, max: 50 }
      );
      expect(domain).toEqual({ min: -50, max: 50 });
    });

    it('honors a single-mode custom range, widening to include zero', () => {
      const domain = getProgressBarDomain(
        { fillStyle: single({ valueRange: { mode: 'custom', min: 20, max: 80 } }) },
        { min: 0, max: 100 }
      );
      expect(domain).toEqual({ min: 0, max: 80 });
    });

    it('supports a custom range with a negative minimum (single mode)', () => {
      const domain = getProgressBarDomain(
        { fillStyle: single({ valueRange: { mode: 'custom', min: -30, max: 70 } }) },
        { min: -10, max: 50 }
      );
      expect(domain).toEqual({ min: -30, max: 70 });
    });

    it('reads custom bounds from palette params for solid/gradient', () => {
      const domain = getProgressBarDomain(
        {
          fillStyle: { fillMode: 'gradient', valueRange: { mode: 'custom' } },
          palette: { params: { rangeMin: -40, rangeMax: 60 } },
        },
        { min: -10, max: 10 }
      );
      expect(domain).toEqual({ min: -40, max: 60 });
    });

    it('guards against a degenerate (zero-width) domain', () => {
      const domain = getProgressBarDomain(
        { fillStyle: single({ valueRange: { mode: 'auto' } }) },
        { min: 0, max: 0 }
      );
      expect(domain).toEqual({ min: 0, max: 1 });
    });

    it('falls back to data bounds when a custom bound is non-finite', () => {
      const domain = getProgressBarDomain(
        { fillStyle: single({ valueRange: { mode: 'custom', min: NaN, max: 70 } }) },
        { min: 10, max: 50 }
      );
      // NaN min is replaced by the data min (10), then widened to include 0.
      expect(domain).toEqual({ min: 0, max: 70 });
    });

    it('normalizes an inverted custom range', () => {
      const domain = getProgressBarDomain(
        { fillStyle: single({ valueRange: { mode: 'custom', min: 80, max: 20 } }) },
        { min: 0, max: 100 }
      );
      expect(domain).toEqual({ min: 0, max: 80 });
    });

    it('ignores stale palette range for a single fill', () => {
      const domain = getProgressBarDomain(
        {
          fillStyle: single({ valueRange: { mode: 'auto' } }),
          palette: { params: { rangeMin: -999, rangeMax: 999 } },
        },
        { min: 10, max: 90 }
      );
      // Single mode must not read leftover palette bounds.
      expect(domain).toEqual({ min: 0, max: 90 });
    });

    it('treats open-ended (±Infinity) palette continuities as the data bounds', () => {
      // Default by-value palettes store open-ended continuities as ±Infinity on
      // the palette params; the domain must collapse those to finite data bounds.
      const domain = getProgressBarDomain(
        {
          fillStyle: { fillMode: 'solid', valueRange: { mode: 'custom' } },
          palette: {
            params: { rangeMin: Number.NEGATIVE_INFINITY, rangeMax: Number.POSITIVE_INFINITY },
          },
        },
        { min: -30, max: 27 }
      );
      expect(domain).toEqual({ min: -30, max: 27 });
      expect(Number.isFinite(domain.min)).toBe(true);
      expect(Number.isFinite(domain.max)).toBe(true);
    });

    it('uses data bounds for an explicit Auto palette fill, ignoring stale palette range', () => {
      // Switching Custom -> Auto keeps the last custom bounds on fillStyle (range
      // retention) and may leave stale rangeMin/rangeMax on the palette. An
      // explicit Auto mode must win: the domain follows the data bounds (here a
      // positive-only column spans [0, 108], not the stale [0, 200]).
      const domain = getProgressBarDomain(
        {
          fillStyle: { fillMode: 'gradient', valueRange: { mode: 'auto', min: 0, max: 200 } },
          palette: { params: { rangeMin: 0, rangeMax: 200 } },
        },
        { min: 19, max: 108 }
      );
      expect(domain).toEqual({ min: 0, max: 108 });
    });

    it('drops a positive-only palette fill back to [0, max] when switched to Auto', () => {
      // Mixed-sign custom range, then Auto, on data that is positive-only: the
      // baseline returns to the left edge (0) and the bar spans the data max.
      const domain = getProgressBarDomain(
        {
          fillStyle: { fillMode: 'gradient', valueRange: { mode: 'auto', min: -24, max: 108 } },
          palette: { params: { rangeMin: -24, rangeMax: 108 } },
        },
        { min: 19, max: 108 }
      );
      expect(domain).toEqual({ min: 0, max: 108 });
    });

    it('honors a palette range only when fillStyle has no explicit mode (legacy/API)', () => {
      // Backward compatibility: an as-code/legacy column may carry the custom
      // range solely on the palette with no fillStyle.valueRange.mode. That still
      // reads as custom so API-configured ranges keep working.
      const domain = getProgressBarDomain(
        {
          fillStyle: { fillMode: 'solid' },
          palette: { params: { rangeMin: 5, rangeMax: 250 } },
        },
        { min: 19, max: 108 }
      );
      expect(domain).toEqual({ min: 0, max: 250 });
    });
  });

  describe('getProgressBarPaletteStops', () => {
    const paletteService = chartPluginMock.createPaletteRegistry();

    it('zips parallel colors/stops into domain-valued stops', () => {
      expect(
        getProgressBarPaletteStops(paletteService, { min: 0, max: 100 }, ['#aaa', '#bbb'], [0, 50])
      ).toEqual([
        { color: '#aaa', stop: 0 },
        { color: '#bbb', stop: 50 },
      ]);
    });

    it('distributes serialized colors across the domain when stops are empty', () => {
      // Predefined (by-name) palettes serialize their resolved colors but omit
      // numeric stops; the selected colors must drive the bar rather than being
      // discarded in favor of the default palette.
      const stops = getProgressBarPaletteStops(
        paletteService,
        { min: 0, max: 100 },
        ['#111', '#222', '#333', '#444'],
        []
      );
      expect(stops).toEqual([
        { color: '#111', stop: 0 },
        { color: '#222', stop: 25 },
        { color: '#333', stop: 50 },
        { color: '#444', stop: 75 },
      ]);
    });

    it('honors a single serialized color as a flat fill anchored at min', () => {
      expect(
        getProgressBarPaletteStops(paletteService, { min: -20, max: 50 }, ['#abcdef'], [])
      ).toEqual([{ color: '#abcdef', stop: -20 }]);
    });

    it('recomputes the default palette only when no colors are serialized', () => {
      const stops = getProgressBarPaletteStops(paletteService, { min: 0, max: 100 }, [], []);
      expect(stops.length).toBeGreaterThan(0);
      stops.forEach((s) => {
        expect(typeof s.color).toBe('string');
        expect(typeof s.stop).toBe('number');
      });
    });
  });

  describe('getDecorationCustomRange', () => {
    it('returns auto when there is no fill config', () => {
      expect(getDecorationCustomRange({}, { min: 0, max: 100 })).toEqual({ mode: 'auto' });
    });

    it('falls back to data bounds for single mode without explicit bounds', () => {
      expect(
        getDecorationCustomRange(
          { fillStyle: { fillMode: 'single', valueRange: { mode: 'custom' } } },
          { min: 5, max: 95 }
        )
      ).toEqual({ mode: 'custom', min: 5, max: 95 });
    });

    it('reads bounds from palette params for solid/gradient', () => {
      expect(
        getDecorationCustomRange(
          {
            fillStyle: { fillMode: 'solid', valueRange: { mode: 'custom' } },
            palette: { params: { rangeMin: 1, rangeMax: 9 } },
          },
          { min: 0, max: 100 }
        )
      ).toEqual({ mode: 'custom', min: 1, max: 9 });
    });

    it('collapses open-ended (±Infinity) palette bounds to finite data bounds', () => {
      // Regression: open-ended palette continuities store ±Infinity, which must
      // not reach the dual-range control (it crashed / rendered NaN inputs).
      const range = getDecorationCustomRange(
        {
          fillStyle: { fillMode: 'solid', valueRange: { mode: 'custom' } },
          palette: {
            params: { rangeMin: Number.NEGATIVE_INFINITY, rangeMax: Number.POSITIVE_INFINITY },
          },
        },
        { min: -30, max: 27 }
      );
      expect(range).toEqual({ mode: 'custom', min: -30, max: 27 });
      expect(Number.isFinite(range.min as number)).toBe(true);
      expect(Number.isFinite(range.max as number)).toBe(true);
    });
  });
});
