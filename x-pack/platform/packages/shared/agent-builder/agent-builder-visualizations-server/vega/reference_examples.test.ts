/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { selectVegaExample } from './reference_examples';
import { detectVegaDialect } from './dialect';
import {
  normalizeRawVegaSpec,
  normalizeVegaSpec,
  RAW_VEGA_SOURCE_DATA_NAME,
} from './normalize_spec';

describe('selectVegaExample', () => {
  it('selects the Sankey example for sankey/flow requests', () => {
    expect(selectVegaExample('show me a sankey of source to destination')?.name).toBe('sankey');
    expect(selectVegaExample('build a flow diagram of traffic')?.name).toBe('sankey');
    expect(selectVegaExample('a flow chart of countries')?.name).toBe('sankey');
  });

  it('selects the scatter example for scatter/bubble requests', () => {
    expect(selectVegaExample('a scatter plot of bytes vs latency')?.name).toBe(
      'scatter / bubble plot'
    );
    expect(selectVegaExample('show a bubble chart sized by requests')?.name).toBe(
      'scatter / bubble plot'
    );
  });

  it('selects the trend indicator example for trend indicator requests', () => {
    expect(selectVegaExample('a trend indicator of total requests')?.name).toBe('trend indicator');
  });

  it('selects the small multiples example for trellis/faceted requests', () => {
    expect(selectVegaExample('small multiples of latency by region')?.name).toBe(
      'small multiples (trellis)'
    );
    expect(selectVegaExample('a trellis of cpu usage per host')?.name).toBe(
      'small multiples (trellis)'
    );
    expect(selectVegaExample('faceted request counts by os')?.name).toBe(
      'small multiples (trellis)'
    );
  });

  it('returns undefined for requests Vega-Lite can express without an example', () => {
    expect(selectVegaExample('a bar chart of counts by status')).toBeUndefined();
    // "trend over time" is a plain line chart, not the trend-indicator big number.
    expect(selectVegaExample('show the trend over time of errors')).toBeUndefined();
  });

  it('is case-insensitive', () => {
    expect(selectVegaExample('SANKEY DIAGRAM please')?.name).toBe('sankey');
    expect(selectVegaExample('SCATTER PLOT of x vs y')?.name).toBe('scatter / bubble plot');
  });

  describe('scatter example spec (Vega-Lite)', () => {
    const example = selectVegaExample('scatter plot')!;

    it('is a Vega-Lite example', () => {
      expect(example.dialect).toBe('vega-lite');
      expect(detectVegaDialect(example.spec)).toBe('vega-lite');
    });

    it('embeds a complete inline ES|QL data source', () => {
      const data = example.spec.data as { url?: { '%type%'?: string; query?: string } };
      expect(data.url?.['%type%']).toBe('esql');
      expect(data.url?.query).toContain('FROM ');
    });

    it('relies on the themed categorical palette (no hardcoded color range/scheme)', () => {
      const encoding = example.spec.encoding as {
        color?: { field?: string; type?: string; scale?: { range?: unknown; scheme?: unknown } };
      };
      expect(encoding.color?.field).toBe('extension');
      expect(encoding.color?.type).toBe('nominal');
      // Kibana themes the default categorical palette to EUI; do not hardcode one.
      expect(encoding.color?.scale?.range).toBeUndefined();
      expect(encoding.color?.scale?.scheme).toBeUndefined();
    });

    it('uses dark, EUI-aligned axis text and normalizes cleanly', () => {
      const config = example.spec.config as { axis?: { labelColor?: string; titleColor?: string } };
      expect(config.axis?.labelColor).toBe('#1D2A3E');
      expect(config.axis?.titleColor).toBe('#111C2C');

      const esql = 'FROM logs | STATS y = AVG(bytes) BY x = AVG(latency), cat = host';
      const normalized = normalizeVegaSpec({ spec: example.spec, esqlQuery: esql });
      expect(normalized.data).toEqual({ url: { '%type%': 'esql', query: esql } });
    });
  });

  describe('trend indicator example spec (raw Vega)', () => {
    const example = selectVegaExample('trend indicator')!;

    it('is a raw Vega example', () => {
      expect(example.dialect).toBe('vega');
      expect(detectVegaDialect(example.spec)).toBe('vega');
    });

    it('declares a base "source" data set with an inline ES|QL url and renderable marks', () => {
      const data = example.spec.data as Array<{
        name?: string;
        url?: { '%type%'?: string };
      }>;
      const source = data.find((dataSet) => dataSet.name === RAW_VEGA_SOURCE_DATA_NAME);
      expect(source?.url?.['%type%']).toBe('esql');
      expect(
        Array.isArray(example.spec.marks) && (example.spec.marks as unknown[]).length
      ).toBeTruthy();
    });

    it('normalizes cleanly: ES|QL url binds onto "source" with no leftover sizing', () => {
      const esql =
        'FROM logs | STATS count = COUNT(*) BY bucket = BUCKET(@timestamp, 1 hour) | SORT bucket ASC';
      const normalized = normalizeRawVegaSpec({ spec: example.spec, esqlQuery: esql });
      const data = normalized.data as Array<{ name?: string; url?: unknown }>;
      const source = data.find((dataSet) => dataSet.name === RAW_VEGA_SOURCE_DATA_NAME);
      expect(source?.url).toEqual({ '%type%': 'esql', query: esql });
      expect(normalized.width).toBeUndefined();
      expect(normalized.height).toBeUndefined();
    });

    it('colors the delta with EUI success/danger text tokens', () => {
      const marks = example.spec.marks as Array<{
        encode?: { update?: { fill?: { signal?: string } } };
      }>;
      const fillSignal = marks[0]?.encode?.update?.fill?.signal ?? '';
      expect(fillSignal).toContain('#09724D');
      expect(fillSignal).toContain('#A71627');
    });
  });

  describe('small multiples example spec (raw Vega)', () => {
    const example = selectVegaExample('small multiples')!;

    it('is a raw Vega example', () => {
      expect(example.dialect).toBe('vega');
      expect(detectVegaDialect(example.spec)).toBe('vega');
    });

    it('derives the grid from the container size signals so it reflows on resize', () => {
      const signals = example.spec.signals as Array<{ name?: string; update?: string }>;
      const byName = (name: string) => signals.find((signal) => signal.name === name);
      // Column count and cell size are computed from the `width`/`height` signals.
      expect(byName('columns')?.update).toContain('width');
      expect(byName('cellWidth')?.update).toContain('width');
      expect(byName('cellHeight')?.update).toContain('height');
    });

    it('counts categories from a layout-independent set (avoids a dataflow cycle)', () => {
      const signals = example.spec.signals as Array<{ name?: string; update?: string }>;
      // numGroups must read the layout-independent "categoryKeys" set, not
      // "categories" (whose positions depend on the layout signals).
      expect(signals.find((signal) => signal.name === 'numGroups')?.update).toContain(
        'categoryKeys'
      );
      const data = example.spec.data as Array<{ name?: string; source?: string }>;
      expect(data.find((dataSet) => dataSet.name === 'categoryKeys')?.source).toBe('source');
      expect(data.find((dataSet) => dataSet.name === 'categories')?.source).toBe('categoryKeys');
    });

    it('uses "pad" autosize so the manual grid is not collapsed by Kibana\'s default "fit"', () => {
      // Kibana sets the width/height signals to the container size, then its
      // default "fit" autosize shrinks them to the measured content. Because the
      // grid layout derives from those signals, "fit" feeds back and collapses
      // every cell; "pad" keeps the container size so the grid fills the panel.
      expect(example.spec.autosize).toEqual({ type: 'pad', contains: 'padding' });
    });

    it('normalizes cleanly: ES|QL url binds onto "source", "pad" autosize kept, no fixed sizing', () => {
      const esql =
        'FROM kibana_sample_data_logs | STATS request_count = COUNT(*) BY time_bucket = BUCKET(@timestamp, 50, ?_tstart, ?_tend), category = machine.os.keyword | SORT category ASC, time_bucket ASC';
      const normalized = normalizeRawVegaSpec({ spec: example.spec, esqlQuery: esql });
      const data = normalized.data as Array<{ name?: string; url?: unknown }>;
      const source = data.find((dataSet) => dataSet.name === RAW_VEGA_SOURCE_DATA_NAME);
      expect(source?.url).toEqual({ '%type%': 'esql', query: esql, '%timefield%': '@timestamp' });
      // The manual-layout autosize must survive normalization (only width/height
      // are stripped) so the grid still fills its container at render time.
      expect(normalized.autosize).toEqual({ type: 'pad', contains: 'padding' });
      expect(normalized.width).toBeUndefined();
      expect(normalized.height).toBeUndefined();
    });
  });

  describe('Sankey example spec', () => {
    const example = selectVegaExample('sankey')!;

    it('is detected as raw Vega', () => {
      expect(detectVegaDialect(example.spec)).toBe('vega');
    });

    it('declares a base "source" data set and a non-empty marks array (renderable)', () => {
      const data = example.spec.data as Array<{ name?: string }>;
      expect(data.some((dataSet) => dataSet.name === RAW_VEGA_SOURCE_DATA_NAME)).toBe(true);
      expect(
        Array.isArray(example.spec.marks) && (example.spec.marks as unknown[]).length
      ).toBeTruthy();
    });

    it('normalizes cleanly: ES|QL url binds onto "source" with no leftover sizing', () => {
      const esql =
        'FROM kibana_sample_data_logs | STATS size = COUNT(*) BY src = geo.src, dest = geo.dest';
      const normalized = normalizeRawVegaSpec({ spec: example.spec, esqlQuery: esql });

      const data = normalized.data as Array<{ name?: string; url?: unknown }>;
      const source = data.find((dataSet) => dataSet.name === RAW_VEGA_SOURCE_DATA_NAME);
      expect(source?.url).toEqual({ '%type%': 'esql', query: esql });
      expect(normalized.width).toBeUndefined();
      expect(normalized.height).toBeUndefined();
    });

    it('keeps the blog interactivity: groupHover/groupSelector signals', () => {
      const signals = example.spec.signals as Array<{ name?: string }>;
      const names = signals.map((signal) => signal.name);
      expect(names).toEqual(expect.arrayContaining(['groupHover', 'groupSelector']));
    });

    it('keys color off the unfiltered "rawData" set so colors stay stable on selection', () => {
      const scales = example.spec.scales as Array<{ name?: string; domain?: { data?: string } }>;
      const color = scales.find((scale) => scale.name === 'color');
      expect(color?.domain?.data).toBe('rawData');
    });

    it('uses dark, EUI-aligned label text (not a washed-out light gray)', () => {
      const serialized = JSON.stringify(example.spec);
      expect(serialized).not.toContain('#ccc');

      const marks = example.spec.marks as Array<{ type?: string; encode?: any }>;
      const labelMark = marks.find(
        (mark) => mark.type === 'text' && mark.encode?.update?.fill?.value === '#1D2A3E'
      );
      expect(labelMark).toBeDefined();

      const config = example.spec.config as {
        axis?: { labelColor?: string; titleColor?: string };
      };
      expect(config.axis?.labelColor).toBe('#1D2A3E');
      expect(config.axis?.titleColor).toBe('#111C2C');
    });
  });
});
