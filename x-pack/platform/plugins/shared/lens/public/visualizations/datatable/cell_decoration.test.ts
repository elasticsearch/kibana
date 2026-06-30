/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  CELL_DECORATION_CAPABILITIES,
  DEFAULT_PROGRESS_BAR_COLOR,
  getAlignmentLabel,
  getCellDecorationCapabilities,
  getCellDecorationLabel,
  getDecorationDefaultColor,
  getUnsupportedAlignmentReason,
  getUnsupportedColumnKindReason,
  isAlignmentSupported,
  isColumnKindSupported,
  parseCellDecorationFillConfig,
} from './cell_decoration';

describe('cell decoration capabilities', () => {
  describe('getCellDecorationLabel', () => {
    it('surfaces the stored "cell" value as "Background"', () => {
      expect(getCellDecorationLabel('cell')).toBe('Background');
    });

    it('returns the expected labels for every mode', () => {
      expect(getCellDecorationLabel('none')).toBe('None');
      expect(getCellDecorationLabel('badge')).toBe('Badge');
      expect(getCellDecorationLabel('text')).toBe('Text');
      expect(getCellDecorationLabel('progress')).toBe('Progress bar');
    });

    it('defaults to the "none" label', () => {
      expect(getCellDecorationLabel()).toBe('None');
    });
  });

  describe('isColumnKindSupported', () => {
    it('offers progress for numeric columns only', () => {
      expect(isColumnKindSupported('progress', 'numeric')).toBe(true);
      expect(isColumnKindSupported('progress', 'bucketed')).toBe(false);
    });

    it('offers cell/text/badge for both numeric and bucketed columns', () => {
      for (const mode of ['cell', 'text', 'badge'] as const) {
        expect(isColumnKindSupported(mode, 'numeric')).toBe(true);
        expect(isColumnKindSupported(mode, 'bucketed')).toBe(true);
      }
    });

    it('treats "none" as having no column gate', () => {
      expect(isColumnKindSupported('none', 'numeric')).toBe(true);
      expect(isColumnKindSupported('none', 'bucketed')).toBe(true);
    });
  });

  describe('alignment support', () => {
    it('disallows center for progress and allows left/right', () => {
      expect(isAlignmentSupported('progress', 'center')).toBe(false);
      expect(isAlignmentSupported('progress', 'left')).toBe(true);
      expect(isAlignmentSupported('progress', 'right')).toBe(true);
    });

    it('allows all alignments for the other decorations', () => {
      for (const mode of ['none', 'cell', 'text', 'badge'] as const) {
        for (const alignment of ['left', 'center', 'right'] as const) {
          expect(isAlignmentSupported(mode, alignment)).toBe(true);
        }
      }
    });

    it('explains why center is unsupported for progress, with the decoration name', () => {
      const reason = getUnsupportedAlignmentReason('progress', 'center');
      expect(reason).toContain('Center');
      expect(reason).toContain('Progress bar');
    });

    it('returns no reason for a supported alignment', () => {
      expect(getUnsupportedAlignmentReason('progress', 'right')).toBeUndefined();
      expect(getUnsupportedAlignmentReason('cell', 'center')).toBeUndefined();
    });
  });

  describe('column-kind reason', () => {
    it('explains progress is numeric-only', () => {
      const reason = getUnsupportedColumnKindReason('progress', 'bucketed');
      expect(reason).toContain('Progress bar');
      expect(reason).toContain('numeric');
    });

    it('returns no reason when the column kind is supported', () => {
      expect(getUnsupportedColumnKindReason('progress', 'numeric')).toBeUndefined();
    });
  });

  describe('defaults', () => {
    it('seeds the progress default color from the registry', () => {
      expect(getDecorationDefaultColor('progress')).toBe(DEFAULT_PROGRESS_BAR_COLOR);
      expect(CELL_DECORATION_CAPABILITIES.progress.defaultColor).toBe(DEFAULT_PROGRESS_BAR_COLOR);
      expect(CELL_DECORATION_CAPABILITIES.progress.defaultFillMode).toBe('single');
      expect(CELL_DECORATION_CAPABILITIES.progress.defaultAlignment).toBe('right');
    });

    it('has no default color for non-progress decorations', () => {
      for (const mode of ['none', 'cell', 'text', 'badge'] as const) {
        expect(getDecorationDefaultColor(mode)).toBeUndefined();
      }
    });
  });

  describe('getAlignmentLabel', () => {
    it('returns translated alignment labels', () => {
      expect(getAlignmentLabel('left')).toBe('Left');
      expect(getAlignmentLabel('center')).toBe('Center');
      expect(getAlignmentLabel('right')).toBe('Right');
    });
  });

  it('exposes a capability entry for every mode', () => {
    for (const mode of ['none', 'cell', 'badge', 'text', 'progress'] as const) {
      expect(getCellDecorationCapabilities(mode).mode).toBe(mode);
    }
  });

  describe('parseCellDecorationFillConfig', () => {
    it('parses a JSON-serialized fill config', () => {
      const raw = JSON.stringify({ fillMode: 'single', color: '#abcdef' });
      expect(parseCellDecorationFillConfig(raw)).toEqual({ fillMode: 'single', color: '#abcdef' });
    });

    it('returns an already-deserialized object as-is', () => {
      const obj = { fillMode: 'gradient' as const };
      expect(parseCellDecorationFillConfig(obj)).toBe(obj);
    });

    it('degrades malformed JSON to undefined', () => {
      expect(parseCellDecorationFillConfig('{not json')).toBeUndefined();
    });

    it('returns undefined for null/undefined and non-string primitives', () => {
      expect(parseCellDecorationFillConfig(null)).toBeUndefined();
      expect(parseCellDecorationFillConfig(undefined)).toBeUndefined();
      expect(parseCellDecorationFillConfig(42)).toBeUndefined();
      expect(parseCellDecorationFillConfig(true)).toBeUndefined();
    });
  });
});
