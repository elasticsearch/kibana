/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { floorTo30Min, roundUpTo30Min } from '../slot_utils';

// Use a fixed UTC instant so the slot math is timezone-independent: the helpers
// operate on absolute ms (getTime), so UTC literals keep the assertions stable.
const at = (iso: string): Date => new Date(iso);

describe('slot_utils', () => {
  describe('roundUpTo30Min', () => {
    it('should leave a date already on a 30-minute boundary unchanged', () => {
      expect(roundUpTo30Min(at('2026-06-19T14:30:00.000Z')).toISOString()).toBe(
        '2026-06-19T14:30:00.000Z'
      );
    });

    it('should round a mid-slot time up to the next boundary', () => {
      expect(roundUpTo30Min(at('2026-06-19T14:01:00.000Z')).toISOString()).toBe(
        '2026-06-19T14:30:00.000Z'
      );
    });

    it('should round up past the hour', () => {
      expect(roundUpTo30Min(at('2026-06-19T14:31:00.000Z')).toISOString()).toBe(
        '2026-06-19T15:00:00.000Z'
      );
    });

    it('should round up when only seconds/millis are past a boundary', () => {
      expect(roundUpTo30Min(at('2026-06-19T14:30:00.001Z')).toISOString()).toBe(
        '2026-06-19T15:00:00.000Z'
      );
    });
  });

  describe('floorTo30Min', () => {
    it('should leave a date already on a 30-minute boundary unchanged', () => {
      expect(floorTo30Min(at('2026-06-19T14:30:00.000Z')).toISOString()).toBe(
        '2026-06-19T14:30:00.000Z'
      );
    });

    it('should floor a mid-slot time down to its boundary', () => {
      expect(floorTo30Min(at('2026-06-19T14:29:59.000Z')).toISOString()).toBe(
        '2026-06-19T14:00:00.000Z'
      );
    });

    it('should floor down across the hour', () => {
      expect(floorTo30Min(at('2026-06-19T15:00:00.000Z')).toISOString()).toBe(
        '2026-06-19T15:00:00.000Z'
      );
      expect(floorTo30Min(at('2026-06-19T15:01:00.000Z')).toISOString()).toBe(
        '2026-06-19T15:00:00.000Z'
      );
    });
  });
});
