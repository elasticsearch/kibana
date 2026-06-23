/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EpisodeSeverity,
  EPISODE_SEVERITIES,
  getEpisodeSeverityLabel,
  getHeatmapDatumFromElementClick,
  isSupportedEpisodeSeverity,
  normalizeEpisodeSeverity,
  shouldSuppressSeverityHeatmapTooltip,
  toEpisodeSeverityChartColorBands,
} from './severity_utils';

describe('isSupportedEpisodeSeverity', () => {
  it('returns true for supported severity values', () => {
    expect(isSupportedEpisodeSeverity('high')).toBe(true);
    expect(isSupportedEpisodeSeverity('CRITICAL')).toBe(true);
  });

  it('returns false for unsupported, null, or empty values', () => {
    expect(isSupportedEpisodeSeverity('SEV1')).toBe(false);
    expect(isSupportedEpisodeSeverity(null)).toBe(false);
    expect(isSupportedEpisodeSeverity(undefined)).toBe(false);
    expect(isSupportedEpisodeSeverity('')).toBe(false);
  });
});

describe('normalizeEpisodeSeverity', () => {
  it('lowercases severity values', () => {
    expect(normalizeEpisodeSeverity('HIGH')).toBe(EpisodeSeverity.High);
  });
});

describe('getEpisodeSeverityLabel', () => {
  it.each(EPISODE_SEVERITIES)('returns a label for %s', (severity) => {
    expect(getEpisodeSeverityLabel(severity).length).toBeGreaterThan(0);
  });

  it('returns expected English labels', () => {
    expect(getEpisodeSeverityLabel(EpisodeSeverity.High)).toBe('High');
    expect(getEpisodeSeverityLabel(EpisodeSeverity.Critical)).toBe('Critical');
  });
});

describe('toEpisodeSeverityChartColorBands', () => {
  it('builds one band per severity with numeric ranges and labels', () => {
    const bands = toEpisodeSeverityChartColorBands(() => '#000');

    expect(bands).toHaveLength(EPISODE_SEVERITIES.length);
    expect(bands[0]).toEqual({
      start: 0,
      end: 1,
      color: '#000',
      label: 'Info',
    });
    expect(bands[bands.length - 1]?.end).toBe(Infinity);
    expect(bands[bands.length - 1]?.label).toBe('Critical');
  });
});

describe('getHeatmapDatumFromElementClick', () => {
  const data = [{ id: 'a' }, { id: 'b' }];

  it('returns the datum for the clicked heatmap cell', () => {
    expect(
      getHeatmapDatumFromElementClick(
        [[{ datum: { originalIndex: 1 } } as never, {} as never]],
        data
      )
    ).toEqual({ id: 'b' });
  });

  it('returns undefined when no cell was clicked', () => {
    expect(getHeatmapDatumFromElementClick([], data)).toBeUndefined();
  });
});

describe('shouldSuppressSeverityHeatmapTooltip', () => {
  it('suppresses the tooltip when a cell is selected', () => {
    expect(shouldSuppressSeverityHeatmapTooltip({ x: 0 })).toBe(true);
  });

  it('shows the tooltip when no cell is selected', () => {
    expect(shouldSuppressSeverityHeatmapTooltip(null)).toBe(false);
  });
});
