/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import moment from 'moment';

import { DEFAULT_DATE_FORMAT } from '../constants';
import { prettifyValue } from './prettify_value';

describe('prettifyValue', () => {
  describe('relative to now — collapses "to now"', () => {
    it('simplifies "now-7d/d to now" to "-7d"', () => {
      expect(prettifyValue('now-7d/d to now')).toBe('-7d');
    });

    it('simplifies "now-15m to now" to "-15m"', () => {
      expect(prettifyValue('now-15m to now')).toBe('-15m');
    });

    it('simplifies "now-1h/h to now" to "-1h"', () => {
      expect(prettifyValue('now-1h/h to now')).toBe('-1h');
    });

    it('simplifies "now to now+1d" to "+1d"', () => {
      expect(prettifyValue('now to now+1d')).toBe('+1d');
    });

    it('keeps rounding on end bound: "now to now+3M/d" to "+3M/d"', () => {
      expect(prettifyValue('now to now+3M/d')).toBe('+3M/d');
    });
  });

  describe('both bounds relative — keeps delimiter', () => {
    it('strips rounding only from start: "now-30d/d to now-7d/d" to "-30d to -7d/d"', () => {
      expect(prettifyValue('now-30d/d to now-7d/d')).toBe('-30d to -7d/d');
    });

    it('simplifies "now-1y to now-1M" to "-1y to -1M"', () => {
      expect(prettifyValue('now-1y to now-1M')).toBe('-1y to -1M');
    });
  });

  describe('mixed relative and absolute', () => {
    it('prettifies the relative start, formats absolute end', () => {
      expect(prettifyValue('now-1d/d to 2025-06-15T00:00:00Z')).toBe(
        `-1d to ${moment('2025-06-15T00:00:00Z').format(DEFAULT_DATE_FORMAT)}`
      );
    });

    it('formats absolute start, keeps rounding on end bound', () => {
      expect(prettifyValue('2025-01-01T00:00:00Z to now+7d/d')).toBe(
        `${moment('2025-01-01T00:00:00Z').format(DEFAULT_DATE_FORMAT)} to +7d/d`
      );
    });
  });

  describe('now + rounding only (no offset) — pass through', () => {
    it('leaves "now/d to now" unchanged', () => {
      expect(prettifyValue('now/d to now')).toBe('now/d to now');
    });

    it('leaves "now/w to now/w" unchanged', () => {
      expect(prettifyValue('now/w to now/w')).toBe('now/w to now/w');
    });

    it('leaves single "now/d" unchanged', () => {
      expect(prettifyValue('now/d')).toBe('now/d');
    });

    it('leaves "now/M" unchanged', () => {
      expect(prettifyValue('now/M')).toBe('now/M');
    });
  });

  describe('absolute dates — formats ISO strings', () => {
    it('formats absolute-to-absolute with DEFAULT_DATE_FORMAT', () => {
      expect(prettifyValue('2025-01-01T00:00:00Z to 2025-06-15T00:00:00Z')).toBe(
        `${moment.utc('2025-01-01T00:00:00Z').local().format(DEFAULT_DATE_FORMAT)} to ${moment
          .utc('2025-06-15T00:00:00Z')
          .local()
          .format(DEFAULT_DATE_FORMAT)}`
      );
    });

    it('formats absolute-to-now', () => {
      expect(prettifyValue('2025-01-01T00:00:00Z to now')).toBe(
        `${moment.utc('2025-01-01T00:00:00Z').local().format(DEFAULT_DATE_FORMAT)} to now`
      );
    });

    it('formats a single absolute ISO date', () => {
      expect(prettifyValue('2025-06-15T12:30:00Z')).toBe(
        moment.utc('2025-06-15T12:30:00Z').local().format(DEFAULT_DATE_FORMAT)
      );
    });
  });

  describe('natural language — pass through', () => {
    it('leaves "last 15 minutes" unchanged', () => {
      expect(prettifyValue('last 15 minutes')).toBe('last 15 minutes');
    });

    it('leaves "next 3 weeks" unchanged', () => {
      expect(prettifyValue('next 3 weeks')).toBe('next 3 weeks');
    });

    it('leaves "today" unchanged', () => {
      expect(prettifyValue('today')).toBe('today');
    });

    it('leaves "yesterday" unchanged', () => {
      expect(prettifyValue('yesterday')).toBe('yesterday');
    });
  });

  describe('single dateMath expression (no delimiter)', () => {
    it('simplifies "now-7d/d" to "-7d"', () => {
      expect(prettifyValue('now-7d/d')).toBe('-7d');
    });

    it('simplifies "now+1h" to "+1h"', () => {
      expect(prettifyValue('now+1h')).toBe('+1h');
    });

    it('leaves bare "now" unchanged', () => {
      expect(prettifyValue('now')).toBe('now');
    });
  });

  describe('edge cases', () => {
    it('returns empty string unchanged', () => {
      expect(prettifyValue('')).toBe('');
    });

    it('returns whitespace-only unchanged', () => {
      expect(prettifyValue('   ')).toBe('   ');
    });

    it('handles "now to now" pass-through', () => {
      expect(prettifyValue('now to now')).toBe('now to now');
    });
  });

  describe('alternative delimiters', () => {
    it('handles "until" delimiter', () => {
      expect(prettifyValue('now-7d/d until now')).toBe('-7d');
    });

    it('handles dash delimiter', () => {
      expect(prettifyValue('now-7d/d - now')).toBe('-7d');
    });

    it('handles extra consumer delimiter', () => {
      expect(prettifyValue('now-7d/d through now', { extraDelimiter: 'through' })).toBe('-7d');
    });
  });

  describe('preset matching', () => {
    const presets = [
      { start: 'now/w', end: 'now/w', label: 'This week' },
      { start: 'now/d', end: 'now/d', label: 'Today' },
      { start: 'now-1d/d', end: 'now-1d/d', label: 'Yesterday' },
      { start: 'now-7d/d', end: 'now', label: 'Last 7 days' },
    ];

    it('resolves matching bounds to preset label', () => {
      expect(prettifyValue('now/w to now/w', { presets })).toBe('This week');
    });

    it('resolves "now/d to now/d" to "Today"', () => {
      expect(prettifyValue('now/d to now/d', { presets })).toBe('Today');
    });

    it('resolves "now-1d/d to now-1d/d" to "Yesterday"', () => {
      expect(prettifyValue('now-1d/d to now-1d/d', { presets })).toBe('Yesterday');
    });

    it('resolves "now-7d/d to now" to "Last 7 days"', () => {
      expect(prettifyValue('now-7d/d to now', { presets })).toBe('Last 7 days');
    });

    it('falls through to normal prettify when no preset matches', () => {
      expect(prettifyValue('now-3d/d to now', { presets })).toBe('-3d');
    });

    it('ignores display-form preset labels (non natural-language) and prettifies the bounds', () => {
      const start = '2026-05-01T00:00:00.000Z';
      const end = '2026-05-02T23:59:00.000Z';

      expect(
        prettifyValue(`${start} to ${end}`, {
          presets: [{ start, end, label: 'May 1, 00:00 → May 2, 23:59' }],
        })
      ).toBe(
        `${moment.utc(start).local().format(DEFAULT_DATE_FORMAT)} to ${moment
          .utc(end)
          .local()
          .format(DEFAULT_DATE_FORMAT)}`
      );
    });

    it('works without presets (no options)', () => {
      expect(prettifyValue('now-7d/d to now')).toBe('-7d');
    });
  });
});
