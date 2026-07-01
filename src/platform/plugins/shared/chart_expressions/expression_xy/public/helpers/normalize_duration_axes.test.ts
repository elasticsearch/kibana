/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SerializedFieldFormat } from '@kbn/field-formats-plugin/common';
import type { Datatable } from '@kbn/expressions-plugin/common';
import type { DataLayerConfig } from '../../common';
import { LayerTypes } from '../../common/constants';
import { normalizeSharedDurationAxes } from './normalize_duration_axes';

const durationFormat = (inputFormat: string): SerializedFieldFormat => ({
  id: 'duration',
  params: { inputFormat, outputFormat: 'humanize' },
});

const buildLayer = (
  columnFormats: Record<string, SerializedFieldFormat | undefined>,
  row: Datatable['rows'][number]
): DataLayerConfig => {
  const accessors = Object.keys(columnFormats);
  return {
    layerId: 'first',
    type: 'dataLayer',
    layerType: LayerTypes.DATA,
    showLines: true,
    seriesType: 'line',
    accessors,
    xScaleType: 'linear',
    isHistogram: false,
    isPercentage: false,
    isStacked: false,
    isHorizontal: false,
    palette: { type: 'palette', name: 'default' },
    table: {
      type: 'datatable',
      columns: accessors.map((id) => ({
        id,
        name: id,
        meta: { type: 'number', params: columnFormats[id] },
      })),
      rows: [row],
    },
  } as DataLayerConfig;
};

describe('normalizeSharedDurationAxes', () => {
  it('converts non-primary duration series into the first series unit and rewrites its format', () => {
    const layers = [
      buildLayer(
        { a: durationFormat('seconds'), b: durationFormat('milliseconds') },
        { a: 1, b: 1000 }
      ),
    ];

    const result = normalizeSharedDurationAxes(layers);

    // a new array is produced (values/formats were rewritten)
    expect(result).not.toBe(layers);

    const columns = result[0].table.columns;
    const columnA = columns.find((c) => c.id === 'a');
    const columnB = columns.find((c) => c.id === 'b');

    // first series (seconds) is untouched; second series is rewritten to the seconds format
    expect(columnA?.meta.params).toEqual(durationFormat('seconds'));
    expect(columnB?.meta.params).toEqual(durationFormat('seconds'));

    // values: a stays 1s; b 1000ms is converted to 1 (second)
    expect(result[0].table.rows[0].a).toBe(1);
    expect(result[0].table.rows[0].b).toBe(1);
  });

  it('is a no-op (same reference) when duration series share the same input unit', () => {
    const layers = [
      buildLayer({ a: durationFormat('seconds'), b: durationFormat('seconds') }, { a: 1, b: 2 }),
    ];

    expect(normalizeSharedDurationAxes(layers)).toBe(layers);
  });

  it('is a no-op (same reference) for non-duration formats', () => {
    const layers = [
      buildLayer(
        { a: { id: 'number', params: {} }, b: { id: 'number', params: {} } },
        { a: 1, b: 1000 }
      ),
    ];

    expect(normalizeSharedDurationAxes(layers)).toBe(layers);
  });
});
