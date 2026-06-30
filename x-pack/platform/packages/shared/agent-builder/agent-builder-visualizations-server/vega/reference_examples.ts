/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { VEGA_V5_SCHEMA, type VegaDialect } from './dialect';
import { VEGA_LITE_SCHEMA } from './normalize_spec';
import {
  EUI_TEXT_PARAGRAPH,
  EUI_TEXT_HEADING,
  EUI_TEXT_SUBDUED,
  EUI_TEXT_SUCCESS,
  EUI_TEXT_DANGER,
  EUI_BACKGROUND_SUBDUED,
  EUI_BORDER_PLAIN,
  EUI_CHART_CONFIG,
} from './colors';

/**
 * A worked reference, injected into the author prompt when the request matches.
 * It teaches the structure (and EUI colors) for a chart type; the model adapts
 * the field names to the real ES|QL columns. Raw-Vega examples also flip the
 * author into the raw-Vega dialect with its authoring rules.
 */
export interface VegaExample {
  /** Short identifier used in logs/prompt headers. */
  name: string;
  /** Whether the example (and the chart it teaches) is Vega-Lite or raw Vega. */
  dialect: VegaDialect;
  /** Human note describing what the example demonstrates and how to adapt it. */
  guidance: string;
  /** The example spec (a complete, copyable ES|QL spec; normalize re-binds the url). */
  spec: Record<string, unknown>;
}

/**
 * Inline ES|QL data source understood by Kibana's Vega renderer. The reference
 * specs embed this so they are complete, copyable ES|QL specifications; the
 * system re-binds the canonical query at normalize time. `%timefield%` lets
 * Kibana bind the time-picker params (`?_tstart`/`?_tend`) used by the queries.
 */
const esqlUrl = (query: string, timefield = '@timestamp') => ({
  '%type%': 'esql',
  query,
  '%timefield%': timefield,
});

/**
 * Interactive two-stack Sankey, adapted from the Elastic blog
 * (https://www.elastic.co/blog/sankey-visualization-with-vega-in-kibana) to an
 * ES|QL data source.
 *
 * The blog read a composite-aggregation bucket (`key.stk1`/`doc_count`); here a
 * base `source` data set carries the inline ES|QL query, and the `rawData` set
 * maps the real columns onto the dot-free roles `stk1` (left category), `stk2`
 * (right category) and `size` (numeric flow). `rawData` is the stable,
 * unfiltered set the color scale keys off so colors stay constant when a country
 * is selected; everything downstream uses the dot-free names, so dotted column
 * names only need bracket access in those three mapping expressions and never
 * appear in transform field references.
 *
 * Interactivity from the blog is preserved: hovering a stack highlights its
 * flows (`groupHover`), clicking a stack filters to that country
 * (`groupSelector`), and a "Show All" button (plus double-click) resets it.
 */
const SANKEY_SPEC: Record<string, unknown> = {
  $schema: VEGA_V5_SCHEMA,
  data: [
    // Base set: the inline ES|QL query whose rows expose the columns mapped below.
    {
      name: 'source',
      url: esqlUrl(
        'FROM kibana_sample_data_logs\n' +
          '| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n' +
          '| STATS request_count = COUNT(*) BY geo.src, geo.dest\n' +
          '| SORT request_count DESC\n' +
          '| LIMIT 10'
      ),
    },
    {
      // Stable, unfiltered set: maps the real ES|QL columns onto the roles below.
      // Use bracket access so dotted column names (e.g. datum['geo.dest']) are
      // read literally. The color scale keys off this set so colors stay stable
      // when "nodes" is filtered by a selection.
      name: 'rawData',
      source: 'source',
      transform: [
        { type: 'formula', expr: "datum['geo.src']", as: 'stk1' },
        { type: 'formula', expr: "datum['geo.dest']", as: 'stk2' },
        { type: 'formula', expr: "datum['request_count']", as: 'size' },
      ],
    },
    {
      name: 'nodes',
      source: 'rawData',
      transform: [
        // When a country is selected, filter out unrelated flows.
        {
          type: 'filter',
          expr: '!groupSelector || groupSelector.stk1 == datum.stk1 || groupSelector.stk2 == datum.stk2',
        },
        { type: 'formula', expr: 'datum.stk1 + datum.stk2', as: 'key' },
        // Split each row into a source node (stack=stk1) and a destination node
        // (stack=stk2); the country code goes into grpId.
        { type: 'fold', fields: ['stk1', 'stk2'], as: ['stack', 'grpId'] },
        {
          type: 'formula',
          expr: "datum.stack == 'stk1' ? datum.stk1 + datum.stk2 : datum.stk2 + datum.stk1",
          as: 'sortField',
        },
        {
          type: 'stack',
          groupby: ['stack'],
          sort: { field: 'sortField', order: 'descending' },
          field: 'size',
        },
        { type: 'formula', expr: '(datum.y0 + datum.y1) / 2', as: 'yc' },
      ],
    },
    {
      name: 'groups',
      source: 'nodes',
      transform: [
        {
          type: 'aggregate',
          groupby: ['stack', 'grpId'],
          fields: ['size'],
          ops: ['sum'],
          as: ['total'],
        },
        {
          type: 'stack',
          groupby: ['stack'],
          sort: { field: 'grpId', order: 'descending' },
          field: 'total',
        },
        { type: 'formula', expr: "scale('y', datum.y0)", as: 'scaledY0' },
        { type: 'formula', expr: "scale('y', datum.y1)", as: 'scaledY1' },
        { type: 'formula', expr: "datum.stack == 'stk1'", as: 'rightLabel' },
        { type: 'formula', expr: "datum.total / domain('y')[1]", as: 'percentage' },
      ],
    },
    {
      name: 'destinationNodes',
      source: 'nodes',
      transform: [{ type: 'filter', expr: "datum.stack == 'stk2'" }],
    },
    {
      name: 'edges',
      source: 'nodes',
      transform: [
        { type: 'filter', expr: "datum.stack == 'stk1'" },
        { type: 'lookup', from: 'destinationNodes', key: 'key', fields: ['key'], as: ['target'] },
        {
          type: 'linkpath',
          orient: 'horizontal',
          shape: 'diagonal',
          sourceY: { expr: "scale('y', datum.yc)" },
          sourceX: { expr: "scale('x', 'stk1') + bandwidth('x')" },
          targetY: { expr: "scale('y', datum.target.yc)" },
          targetX: { expr: "scale('x', 'stk2')" },
        },
        { type: 'formula', expr: "range('y')[0] - scale('y', datum.size)", as: 'strokeWidth' },
        { type: 'formula', expr: "datum.size / domain('y')[1]", as: 'percentage' },
      ],
    },
  ],
  scales: [
    {
      name: 'x',
      type: 'band',
      range: 'width',
      domain: ['stk1', 'stk2'],
      // Leave outer padding so the two stacks sit inside the panel and the
      // (centered) axis labels below them don't overflow the edges.
      paddingOuter: 0.1,
      paddingInner: 0.95,
    },
    { name: 'y', type: 'linear', range: 'height', domain: { data: 'nodes', field: 'y1' } },
    // Categorical colors keyed off the unfiltered rawData (both stacks) so every
    // country is colored and colors stay stable while a selection filters "nodes".
    // range:"category" resolves to Kibana's themed Elastic (EUI) palette — 10
    // distinct, theme-aware hues. Do NOT hardcode a hex range (it washes out at
    // low opacity and ignores dark mode) or force a built-in scheme like tableau10.
    {
      name: 'color',
      type: 'ordinal',
      range: 'category',
      domain: { data: 'rawData', fields: ['stk1', 'stk2'] },
    },
    {
      name: 'stackNames',
      type: 'ordinal',
      range: ['Source', 'Destination'],
      domain: ['stk1', 'stk2'],
    },
  ],
  axes: [
    {
      orient: 'bottom',
      scale: 'x',
      encode: {
        labels: {
          update: {
            text: { scale: 'stackNames', field: 'value' },
            // Anchor each stack's label inward (left stack → left, right stack →
            // right) so the long labels never spill past the panel edges.
            align: {
              signal:
                "datum.value === 'stk2' ? 'right' : (datum.value === 'stk1' ? 'left' : 'center')",
            },
          },
        },
      },
    },
    { orient: 'left', scale: 'y' },
  ],
  marks: [
    {
      type: 'path',
      name: 'edgeMark',
      from: { data: 'edges' },
      // Prevents autosizing issues with large strokeWidth for paths.
      clip: true,
      encode: {
        update: {
          // Use the left node's color, except when a source country is selected,
          // in which case color by destination.
          stroke: [
            {
              test: "groupSelector && groupSelector.stack == 'stk1'",
              scale: 'color',
              field: 'stk2',
            },
            { scale: 'color', field: 'stk1' },
          ],
          strokeWidth: { field: 'strokeWidth' },
          path: { field: 'path' },
          strokeOpacity: {
            signal:
              '!groupSelector && (groupHover.stk1 == datum.stk1 || groupHover.stk2 == datum.stk2) ? 0.9 : 0.3',
          },
          zindex: {
            signal:
              '!groupSelector && (groupHover.stk1 == datum.stk1 || groupHover.stk2 == datum.stk2) ? 1 : 0',
          },
          tooltip: {
            signal:
              "datum.stk1 + ' → ' + datum.stk2 + '   ' + format(datum.size, ',.0f') + '   (' + format(datum.percentage, '.1%') + ')'",
          },
        },
        hover: { strokeOpacity: { value: 1 } },
      },
    },
    {
      type: 'rect',
      name: 'groupMark',
      from: { data: 'groups' },
      encode: {
        enter: { fill: { scale: 'color', field: 'grpId' }, width: { scale: 'x', band: 1 } },
        update: {
          x: { scale: 'x', field: 'stack' },
          y: { field: 'scaledY0' },
          y2: { field: 'scaledY1' },
          fillOpacity: { value: 0.6 },
          tooltip: {
            signal:
              "datum.grpId + '   ' + format(datum.total, ',.0f') + '   (' + format(datum.percentage, '.1%') + ')'",
          },
        },
        hover: { fillOpacity: { value: 1 } },
      },
    },
    {
      type: 'text',
      from: { data: 'groups' },
      // Don't process events for labels - otherwise line mouseover is unclean.
      interactive: false,
      encode: {
        update: {
          x: { signal: "scale('x', datum.stack) + (datum.rightLabel ? bandwidth('x') + 8 : -8)" },
          yc: { signal: '(datum.scaledY0 + datum.scaledY1) / 2' },
          align: { signal: "datum.rightLabel ? 'left' : 'right'" },
          baseline: { value: 'middle' },
          fontWeight: { value: 'bold' },
          // EUI textParagraph (light theme) — dark, readable on a light panel.
          fill: { value: EUI_TEXT_PARAGRAPH },
          text: { signal: "abs(datum.scaledY0 - datum.scaledY1) > 13 ? datum.grpId : ''" },
        },
      },
    },
    {
      // "Show All" button, shown only while a country is selected.
      type: 'group',
      data: [
        {
          name: 'dataForShowAll',
          values: [{}],
          transform: [{ type: 'filter', expr: 'groupSelector' }],
        },
      ],
      encode: {
        enter: {
          xc: { signal: 'width / 2' },
          y: { value: 30 },
          width: { value: 80 },
          height: { value: 30 },
        },
      },
      marks: [
        {
          type: 'group',
          name: 'groupReset',
          from: { data: 'dataForShowAll' },
          encode: {
            enter: {
              cornerRadius: { value: 6 },
              fill: { value: EUI_BACKGROUND_SUBDUED },
              stroke: { value: EUI_BORDER_PLAIN },
              strokeWidth: { value: 2 },
              height: { field: { group: 'height' } },
              width: { field: { group: 'width' } },
            },
            update: { opacity: { value: 1 } },
            hover: { opacity: { value: 0.7 } },
          },
          marks: [
            {
              type: 'text',
              interactive: false,
              encode: {
                enter: {
                  xc: { field: { group: 'width' }, mult: 0.5 },
                  yc: { field: { group: 'height' }, mult: 0.5, offset: 2 },
                  align: { value: 'center' },
                  baseline: { value: 'middle' },
                  fontWeight: { value: 'bold' },
                  text: { value: 'Show All' },
                },
              },
            },
          ],
        },
      ],
    },
  ],
  signals: [
    {
      // Highlight flows to/from the hovered country.
      name: 'groupHover',
      value: {},
      on: [
        {
          events: '@groupMark:mouseover',
          update:
            "{stk1: datum.stack == 'stk1' && datum.grpId, stk2: datum.stack == 'stk2' && datum.grpId}",
        },
        { events: 'mouseout', update: '{}' },
      ],
    },
    {
      // Filter to only the flows related to the selected country.
      name: 'groupSelector',
      value: false,
      on: [
        {
          events: '@groupMark:click!',
          update:
            "{stack: datum.stack, stk1: datum.stack == 'stk1' && datum.grpId, stk2: datum.stack == 'stk2' && datum.grpId}",
        },
        {
          events: [{ type: 'click', markname: 'groupReset' }, { type: 'dblclick' }],
          update: 'false',
        },
      ],
    },
  ],
  // EUI-aligned text colors (Borealis light): textParagraph for labels,
  // textHeading for titles, textSubdued for axis lines/ticks.
  config: EUI_CHART_CONFIG,
};

const SANKEY_EXAMPLE: VegaExample = {
  name: 'sankey',
  dialect: 'vega',
  guidance:
    'An interactive two-stack Sankey / flow diagram (hover to highlight, click a ' +
    'stack to filter, "Show All" to reset). Base your spec on this reference: swap the ' +
    '"source" ES|QL query for one that returns a left category, a right category and a ' +
    'numeric flow, then point the three "rawData" formulas at those columns (use bracket ' +
    "access so dotted names like datum['geo.dest'] are read literally). Keep the rest of " +
    'the structure (data sets, scales, marks, signals) intact, and constrain the ES|QL ' +
    'result to a manageable number of flows (e.g. SORT … DESC | LIMIT 10).',
  spec: SANKEY_SPEC,
};

/**
 * Vega-Lite scatter / bubble plot, adapted from the Elastic blog
 * (https://www.elastic.co/blog/custom-vega-visualizations-in-kibana) to an
 * ES|QL data source with the EUI categorical palette.
 *
 * Two quantitative axes with an optional categorical color (and an optional
 * size channel for a bubble plot). The inline ES|QL query aggregates one point
 * per category; the field references match its result columns.
 */
const SCATTER_SPEC: Record<string, unknown> = {
  $schema: VEGA_LITE_SCHEMA,
  data: {
    url: esqlUrl(
      'FROM kibana_sample_data_logs\n' +
        '| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n' +
        '| STATS request_count = COUNT(*), avg_bytes = AVG(bytes) BY extension = extension.keyword\n' +
        '| SORT request_count DESC'
    ),
  },
  mark: { type: 'point', filled: true, size: 60, opacity: 0.7 },
  encoding: {
    x: { field: 'request_count', type: 'quantitative', axis: { title: 'Request count' } },
    y: { field: 'avg_bytes', type: 'quantitative', axis: { title: 'Average bytes' } },
    // Optional: drop "color" for a single-series scatter (the system applies a
    // default EUI color). Keep it for a categorical breakdown. No explicit scale
    // "range"/"scheme": Kibana themes the default categorical palette to EUI.
    color: {
      field: 'extension',
      type: 'nominal',
      legend: { title: 'Extension' },
    },
    // Optional: add a "size" channel (quantitative) to turn this into a bubble plot.
    tooltip: [
      { field: 'request_count', type: 'quantitative' },
      { field: 'avg_bytes', type: 'quantitative' },
      { field: 'extension', type: 'nominal' },
    ],
  },
  config: EUI_CHART_CONFIG,
};

const SCATTER_EXAMPLE: VegaExample = {
  name: 'scatter / bubble plot',
  dialect: 'vega-lite',
  guidance:
    'A scatter (or bubble) plot with two quantitative axes. Swap the "data.url" ES|QL ' +
    'query for yours and point x / y at the numeric columns and "color" at a nominal ' +
    'column (or remove the "color" channel for a single series). Add a quantitative ' +
    '"size" channel for a bubble plot. Keep the EUI color range and config.',
  spec: SCATTER_SPEC,
};

/**
 * Raw-Vega trend indicator, adapted from the Elastic blog
 * (https://www.elastic.co/blog/custom-vega-visualizations-in-kibana) to an
 * ES|QL data source.
 *
 * The ES|QL `source` query returns time-bucketed counts (a BUCKET column and a
 * numeric measure). The spec splits the buckets into an older and a newer half,
 * sums each, and renders one big text mark: an up/down/flat arrow, the latest
 * value, and the percentage change — colored with EUI success/danger tokens.
 */
const TREND_SPEC: Record<string, unknown> = {
  $schema: VEGA_V5_SCHEMA,
  data: [
    // Base set: the inline ES|QL query returns one row per time bucket.
    {
      name: 'source',
      url: esqlUrl(
        'FROM kibana_sample_data_logs\n' +
          '| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n' +
          '| STATS request_count = COUNT(*) BY time_bucket = BUCKET(@timestamp, 50, ?_tstart, ?_tend)\n' +
          '| SORT time_bucket ASC'
      ),
    },
    {
      name: 'periods',
      source: 'source',
      transform: [
        // Total bucket count, used to split the series into two equal halves.
        { type: 'joinaggregate', ops: ['count'], fields: [null], as: ['__total'] },
        // Number buckets in time order so the split is older-half vs newer-half.
        {
          type: 'window',
          sort: { field: 'time_bucket', order: 'ascending' },
          ops: ['row_number'],
          as: ['row_number'],
        },
        {
          type: 'formula',
          expr: 'floor((datum.row_number - 1) / (datum.__total / 2))',
          as: 'group',
        },
        {
          type: 'aggregate',
          groupby: ['group'],
          ops: ['sum'],
          fields: ['request_count'],
          as: ['count'],
        },
      ],
    },
    {
      // Single object holding the derived last / prev / change values.
      name: 'results',
      values: [{}],
      transform: [
        { type: 'formula', expr: "data('periods')[1] ? data('periods')[1].count : 0", as: 'last' },
        { type: 'formula', expr: "data('periods')[0] ? data('periods')[0].count : 0", as: 'prev' },
        { type: 'formula', expr: 'datum.last > datum.prev', as: 'up' },
        { type: 'formula', expr: 'datum.last < datum.prev', as: 'down' },
        {
          type: 'formula',
          expr: 'if(datum.prev == 0, if(datum.last == 0, 0, 1), (datum.last - datum.prev) / datum.prev)',
          as: 'percentChange',
        },
        { type: 'formula', expr: "if(datum.up, '↑', if(datum.down, '↓', '→'))", as: 'symbol' },
      ],
    },
  ],
  marks: [
    {
      type: 'text',
      from: { data: 'results' },
      encode: {
        update: {
          text: {
            signal:
              "datum.symbol + ' ' + format(datum.last, ',') + '  (' + format(datum.percentChange, '+.1%') + ')'",
          },
          // EUI textSuccess when rising, textDanger when falling, textSubdued when flat.
          fill: {
            signal: `datum.up ? '${EUI_TEXT_SUCCESS}' : (datum.down ? '${EUI_TEXT_DANGER}' : '${EUI_TEXT_SUBDUED}')`,
          },
          align: { value: 'center' },
          baseline: { value: 'middle' },
          xc: { signal: 'width / 2' },
          yc: { signal: 'height / 2' },
          fontSize: { signal: 'min(width / 10, height) / 1.3' },
          fontWeight: { value: 'bold' },
        },
      },
    },
  ],
};

const TREND_EXAMPLE: VegaExample = {
  name: 'trend indicator',
  dialect: 'vega',
  guidance:
    'A single big-number trend indicator comparing a newer period to an older one ' +
    '(arrow + latest value + % change). Keep the "source" ES|QL query time-bucketed ' +
    '(a date BUCKET column and a numeric measure, sorted ascending); point the window ' +
    'sort at the bucket column and the aggregate at the measure (here time_bucket and ' +
    'request_count). Keep the two-halves split, the derived fields, and the EUI colors.',
  spec: TREND_SPEC,
};

/**
 * Responsive small-multiples (trellis), authored in raw Vega because Vega-Lite's
 * `facet`/`repeat` size each sub-view with fixed pixels and does NOT reflow to
 * fill its container. Here the grid is derived from the `width`/`height` signals
 * Kibana provides, so the layout reflows on resize: the column count grows with
 * width and each cell's size is computed from the container.
 *
 * Layout budget is the key to it looking clean: every cell reserves a left inset
 * (`yAxisWidth`) for its y-axis labels and a top inset (`titleHeight`) for its
 * title, plus a gap (`gapX`/`gapY`) between cells. Each cell's plot is shifted
 * right by `yAxisWidth` so the left-oriented axis labels (drawn at negative local
 * x) fall into that reserved inset instead of bleeding into the neighbor cell.
 *
 * The `source` ES|QL query returns one row per (x-bucket, category, measure). A
 * layout-independent `categoryKeys` set indexes the distinct categories (so
 * `numGroups` can read it without forming a cycle), and a `categories` set
 * computes each one's grid position (col/row → x/y) from the layout signals (the
 * formulas depend on the signals, so they recompute on resize). Each cell is a
 * `group` mark positioned from that set; its line+area read the category's rows,
 * share the y domain across all cells (comparable scales), and are colored from
 * the themed EUI categorical palette (`range: "category"`).
 */
const SMALL_MULTIPLES_SPEC: Record<string, unknown> = {
  $schema: VEGA_V5_SCHEMA,
  // CRITICAL for manual-layout raw Vega: use `pad`, not `fit`. Kibana sets the
  // `width`/`height` signals to the container size, but its default `fit`
  // autosize then *shrinks* those same signals to fit the measured content —
  // and because this grid derives its layout FROM `width`/`height`, that feeds
  // back and collapses every cell into a tiny strip. `pad` keeps the container
  // size (so the grid fills the panel and stays responsive) without shrinking.
  autosize: { type: 'pad', contains: 'padding' },
  // Reflow signals: derive the grid from the container size Kibana provides.
  signals: [
    // Horizontal/vertical gap between cells.
    { name: 'gapX', value: 16 },
    { name: 'gapY', value: 20 },
    // Space reserved inside each cell for the title (top) and y-axis (left).
    { name: 'titleHeight', value: 18 },
    { name: 'yAxisWidth', value: 34 },
    // Smallest readable cell width; caps the column count so cells never get too narrow.
    { name: 'minCellWidth', value: 160 },
    { name: 'numGroups', update: "length(data('categoryKeys'))" },
    // Balanced grid: aim for a square-ish layout (~sqrt(n) adjusted by the panel
    // aspect ratio) so the cells don't degenerate into a tall single-column list,
    // then cap the columns by width so each cell stays at least minCellWidth wide.
    // max(1, height) guards against a 0-height container (e.g. headless validation).
    { name: 'aspectColumns', update: 'round(sqrt(numGroups * width / max(1, height)))' },
    { name: 'widthCapColumns', update: 'max(1, floor(width / minCellWidth))' },
    {
      name: 'columns',
      update: 'max(1, min(numGroups, max(1, aspectColumns), widthCapColumns))',
    },
    { name: 'rows', update: 'max(1, ceil(numGroups / columns))' },
    { name: 'cellWidth', update: 'width / columns' },
    { name: 'cellHeight', update: 'height / rows' },
  ],
  data: [
    // Base set: the inline ES|QL query, one row per (x-bucket, category, measure).
    {
      name: 'source',
      url: esqlUrl(
        'FROM kibana_sample_data_logs\n' +
          '| WHERE @timestamp >= ?_tstart AND @timestamp < ?_tend\n' +
          '| STATS request_count = COUNT(*) BY time_bucket = BUCKET(@timestamp, 50, ?_tstart, ?_tend), category = machine.os.keyword\n' +
          '| SORT category ASC, time_bucket ASC'
      ),
    },
    {
      // Distinct categories with a stable 1-based index. Kept independent of the
      // layout signals so `numGroups` can read it without forming a cycle
      // (categories → columns → numGroups would otherwise loop back here).
      name: 'categoryKeys',
      source: 'source',
      transform: [
        { type: 'aggregate', groupby: ['category'] },
        {
          type: 'window',
          sort: { field: 'category', order: 'ascending' },
          ops: ['row_number'],
          as: ['index'],
        },
      ],
    },
    {
      // One row per small multiple with its grid position. The col/row/x/y
      // formulas depend on the layout signals, so they recompute on resize.
      // x/y shift the plot right/down by the reserved insets so the y-axis labels
      // and title sit inside the cell instead of overflowing the neighbor.
      name: 'categories',
      source: 'categoryKeys',
      transform: [
        { type: 'formula', expr: '(datum.index - 1) % columns', as: 'col' },
        { type: 'formula', expr: 'floor((datum.index - 1) / columns)', as: 'row' },
        { type: 'formula', expr: 'datum.col * cellWidth + yAxisWidth', as: 'x' },
        { type: 'formula', expr: 'datum.row * cellHeight + titleHeight', as: 'y' },
      ],
    },
  ],
  scales: [
    // One EUI hue per small multiple. range:"category" resolves to Kibana's
    // themed Elastic palette (theme-aware); do NOT hardcode a hex range.
    {
      name: 'color',
      type: 'ordinal',
      range: 'category',
      domain: { data: 'source', field: 'category' },
    },
  ],
  marks: [
    {
      // One cell per category, positioned and sized from the reflow signals.
      // The cell's drawable box excludes the reserved insets and the inter-cell
      // gap, so the plot, its title (just above) and its y-axis (just left) all
      // stay within the cell's slice of the grid.
      type: 'group',
      from: { data: 'categories' },
      encode: {
        update: {
          x: { field: 'x' },
          y: { field: 'y' },
          width: { signal: 'max(0, cellWidth - yAxisWidth - gapX)' },
          height: { signal: 'max(0, cellHeight - titleHeight - gapY)' },
        },
      },
      // Just this category's rows (filtered from the shared base set).
      data: [
        {
          name: 'cell',
          source: 'source',
          transform: [{ type: 'filter', expr: 'datum.category === parent.category' }],
        },
      ],
      scales: [
        {
          name: 'x',
          type: 'point',
          range: 'width',
          domain: { data: 'source', field: 'time_bucket' },
        },
        {
          // Shared y domain (full base set) so every cell is visually comparable.
          name: 'y',
          type: 'linear',
          range: [{ signal: 'height' }, 0],
          nice: true,
          zero: true,
          domain: { data: 'source', field: 'request_count' },
        },
      ],
      axes: [
        // The per-cell x labels would be far too dense; keep only a baseline.
        { orient: 'bottom', scale: 'x', labels: false, ticks: false, domain: true },
        {
          orient: 'left',
          scale: 'y',
          tickCount: 3,
          labelFontSize: 9,
          domain: false,
          ticks: false,
          grid: true,
          gridColor: EUI_BORDER_PLAIN,
          gridOpacity: 0.6,
        },
      ],
      marks: [
        {
          // Cell title (the category name), in the reserved top inset above the plot.
          type: 'text',
          interactive: false,
          encode: {
            update: {
              x: { value: 0 },
              y: { signal: '-titleHeight + 2' },
              align: { value: 'left' },
              baseline: { value: 'top' },
              fontSize: { value: 12 },
              fontWeight: { value: 'bold' },
              fill: { value: EUI_TEXT_HEADING },
              text: { signal: 'parent.category' },
            },
          },
        },
        {
          type: 'area',
          from: { data: 'cell' },
          encode: {
            update: {
              x: { scale: 'x', field: 'time_bucket' },
              y: { scale: 'y', field: 'request_count' },
              y2: { scale: 'y', value: 0 },
              fill: { scale: 'color', field: 'category' },
              fillOpacity: { value: 0.25 },
            },
          },
        },
        {
          type: 'line',
          from: { data: 'cell' },
          encode: {
            update: {
              x: { scale: 'x', field: 'time_bucket' },
              y: { scale: 'y', field: 'request_count' },
              stroke: { scale: 'color', field: 'category' },
              strokeWidth: { value: 2 },
            },
          },
        },
      ],
    },
  ],
  config: EUI_CHART_CONFIG,
};

const SMALL_MULTIPLES_EXAMPLE: VegaExample = {
  name: 'small multiples (trellis)',
  dialect: 'vega',
  guidance:
    'Responsive small multiples / trellis (one sub-chart per category) — authored in ' +
    'raw Vega because Vega-Lite facet/repeat does NOT reflow to fill the panel. Keep the ' +
    'top-level "autosize": {"type": "pad", "contains": "padding"} EXACTLY — a manual grid ' +
    'layout that derives cell positions from the width/height signals MUST use "pad"; the ' +
    'default "fit" shrinks those signals and collapses the grid. Keep the reflow signals ' +
    '(columns/rows/cellWidth/cellHeight derived from width/height) and the "categories" ' +
    'position set intact; swap the "source" ES|QL query for one returning a bucketed x ' +
    'column, a category column, and a numeric measure (sorted by category then x), then ' +
    'point the "cell" filter at the category column and the line/area marks at the x and ' +
    'measure columns. Keep the shared y domain (so cells stay comparable) and the EUI color ' +
    'scale and config. Adjust minCellWidth to trade off cell size vs. column count.',
  spec: SMALL_MULTIPLES_SPEC,
};

/** Reference examples keyed by request intent. */
const VEGA_EXAMPLES: ReadonlyArray<{ keywords: readonly RegExp[]; example: VegaExample }> = [
  { keywords: [/\bsankey\b/i, /\bflow\s+(?:diagram|chart)\b/i], example: SANKEY_EXAMPLE },
  { keywords: [/\bscatter\b/i, /\bbubble\s+(?:plot|chart)\b/i], example: SCATTER_EXAMPLE },
  { keywords: [/\btrend\s+indicator\b/i], example: TREND_EXAMPLE },
  {
    keywords: [/\bsmall\s+multiples?\b/i, /\btrellis\b/i, /\bfacet(?:ed|s|ing)?\b/i],
    example: SMALL_MULTIPLES_EXAMPLE,
  },
];

/**
 * Pick a reference example for the request, or `undefined` when none applies
 * (the default Vega-Lite path with no example is used). Matching is keyword-based
 * on the natural-language request; the example is injected into the author
 * prompt, and a raw-Vega example also switches the author into the raw dialect.
 */
export const selectVegaExample = (nlQuery: string): VegaExample | undefined =>
  VEGA_EXAMPLES.find(({ keywords }) => keywords.some((pattern) => pattern.test(nlQuery)))?.example;
