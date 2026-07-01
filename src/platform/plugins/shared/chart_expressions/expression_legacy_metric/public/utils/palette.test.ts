/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Datatable } from '@kbn/expressions-plugin/common';
import { getLegacyMetricDataBounds } from './palette';

const buildDatatable = (rows: Array<Record<string, unknown>>): Datatable => ({
  type: 'datatable',
  columns: [
    {
      id: 'edb34be1-c705-4ec4-8937-8743c064acd3',
      name: 'Count of records',
      meta: { type: 'number' },
    },
  ],
  rows,
});

describe('getLegacyMetricDataBounds', () => {
  describe('open bounds fallbacks', () => {
    it('returns open bounds when no data is provided', () => {
      expect(getLegacyMetricDataBounds('metric')).toEqual({ min: -Infinity, max: Infinity });
    });

    it('returns open bounds when no metric id is provided', () => {
      expect(
        getLegacyMetricDataBounds(
          undefined,
          buildDatatable([{ 'edb34be1-c705-4ec4-8937-8743c064acd3': 5 }])
        )
      ).toEqual({
        min: -Infinity,
        max: Infinity,
      });
    });

    it('returns open bounds when there are no rows', () => {
      expect(getLegacyMetricDataBounds('metric', buildDatatable([]))).toEqual({
        min: -Infinity,
        max: Infinity,
      });
    });
  });

  describe('single value', () => {
    it('centers a positive value at zero (`[0, 2 * value]`)', () => {
      expect(
        getLegacyMetricDataBounds(
          'edb34be1-c705-4ec4-8937-8743c064acd3',
          buildDatatable([{ 'edb34be1-c705-4ec4-8937-8743c064acd3': 5 }])
        )
      ).toEqual({
        min: 0,
        max: 10,
      });
    });

    it('centers a negative value at zero (`[2 * value, 0]`)', () => {
      expect(
        getLegacyMetricDataBounds(
          'edb34be1-c705-4ec4-8937-8743c064acd3',
          buildDatatable([{ 'edb34be1-c705-4ec4-8937-8743c064acd3': -1 }])
        )
      ).toEqual({
        min: -2,
        max: 0,
      });
    });

    it('falls back to a fixed `[-50, 100]` domain for a single zero value', () => {
      expect(
        getLegacyMetricDataBounds(
          'edb34be1-c705-4ec4-8937-8743c064acd3',
          buildDatatable([{ 'edb34be1-c705-4ec4-8937-8743c064acd3': 0 }])
        )
      ).toEqual({
        min: -50,
        max: 100,
      });
    });
  });

  describe('multiple values', () => {
    it('spans the actual min/max across rows', () => {
      expect(
        getLegacyMetricDataBounds(
          'edb34be1-c705-4ec4-8937-8743c064acd3',
          buildDatatable([
            { 'edb34be1-c705-4ec4-8937-8743c064acd3': 3 },
            { 'edb34be1-c705-4ec4-8937-8743c064acd3': -7 },
            { 'edb34be1-c705-4ec4-8937-8743c064acd3': 12 },
            { 'edb34be1-c705-4ec4-8937-8743c064acd3': 0 },
          ])
        )
      ).toEqual({ min: -7, max: 12 });
    });

    it('does not center around zero when more than one row is present', () => {
      expect(
        getLegacyMetricDataBounds(
          'edb34be1-c705-4ec4-8937-8743c064acd3',
          buildDatatable([
            { 'edb34be1-c705-4ec4-8937-8743c064acd3': 4 },
            { 'edb34be1-c705-4ec4-8937-8743c064acd3': 8 },
          ])
        )
      ).toEqual({ min: 4, max: 8 });
    });
  });
});
