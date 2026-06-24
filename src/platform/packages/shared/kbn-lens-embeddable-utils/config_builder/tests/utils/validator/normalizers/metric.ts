/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  LENS_METRIC_BREAKDOWN_DEFAULT_MAX_COLUMNS,
  type MetricVisualizationState,
} from '@kbn/lens-common';

import type { LensAttributes } from '../../../../types';
import {
  DEFAULT_PRIMARY_ICON_ALIGNMENT,
  DEFAULT_PRIMARY_LABELS_ALIGNMENT,
  DEFAULT_PRIMARY_POSITION,
  DEFAULT_PRIMARY_VALUE_ALIGNMENT,
  DEFAULT_SECONDARY_LABEL_PLACEMENT,
  DEFAULT_SECONDARY_VALUE_ALIGNMENT,
} from '../../../../transforms/charts/metric/defaults';
import type { NormalizerConfig } from './normalize';
import { mergeNormalizers } from './normalize';
import type { IdRemapping } from './common';
import {
  DEFAULT_LAYER_ID,
  getCommonNormalizer,
  getFormBasedDatasourceState,
  getPaletteNormalizer,
} from './common';
import { getMetricAccessor } from '../../../../transforms/charts/utils';
import { iconCompat } from '../../../../transforms/charts/metric';
import { getContinuity, getRangeValue } from '../../../../transforms/coloring';

type MetricAttributes = Extract<LensAttributes, { visualizationType: 'lnsMetric' }>;

/**
 * Deprecated legacy TSVB-era styling properties that are now ignored by the transforms.
 */
interface LegacyMetricStyling {
  textAlign?: unknown;
  size?: unknown;
  titlePosition?: unknown;
  colorMode?: unknown;
  valuesTextSize?: unknown;
  titlesTextSize?: unknown;
}

// Optional visualization accessors that legacy SOs may persist as explicit `null`; the transform
// always omits them when absent.
const NULLABLE_VIZ_ACCESSORS = [
  'maxAccessor',
  'breakdownByAccessor',
  'secondaryMetricAccessor',
  'trendlineLayerId',
  'trendlineLayerType',
  'trendlineTimeAccessor',
  'trendlineMetricAccessor',
  'trendlineSecondaryMetricAccessor',
  'trendlineBreakdownByAccessor',
] as const satisfies ReadonlyArray<keyof MetricVisualizationState>;

const ACCESSOR = 'metric_accessor';
const TRENDLINE_LAYER_ID = `${DEFAULT_LAYER_ID}_trendline`;
const SECONDARY_TRENDLINE_COLUMN = `${ACCESSOR}_secondary_trendlineX0`;

// `applyColorTo` only supports targeting the value or the background; other legacy values
// (e.g. `bar`) are dropped by the transform.
const validApplyColorTo = new Set(['value', 'background']);

// Canonical metric column ids produced by the column remapping; ES|QL layers may carry extra
// columns (used only inside the query) that the transform prunes.
const canonicalMetricColumns = new Set([
  'metric_accessor_metric',
  'metric_accessor_secondary',
  'metric_accessor_max',
  'metric_accessor_breakdown',
  `${ACCESSOR}_trendline`,
  SECONDARY_TRENDLINE_COLUMN,
  `${ACCESSOR}_breakdown_trendline`,
  'x_date_histogram',
]);

function getColumnRemapping(viz: MetricVisualizationState): IdRemapping {
  // Legacy SOs may store the primary accessor under `accessor` instead of `metricAccessor`.
  const accessor = getMetricAccessor(viz);
  return [
    [accessor, 'metric_accessor_metric'],
    [viz.secondaryMetricAccessor, 'metric_accessor_secondary'],
    [viz.maxAccessor, 'metric_accessor_max'],
    [viz.breakdownByAccessor, 'metric_accessor_breakdown'],
    [viz.trendlineTimeAccessor, 'x_date_histogram'],
    [viz.trendlineMetricAccessor, `${ACCESSOR}_trendline`],
    // The transform rebuilds the secondary trendline column with an `X0` formula-managed suffix.
    [viz.trendlineSecondaryMetricAccessor, SECONDARY_TRENDLINE_COLUMN],
    [viz.trendlineBreakdownByAccessor, `${ACCESSOR}_breakdown_trendline`],
  ];
}

const alignVisualizationDefaults: NormalizerConfig<MetricAttributes> = {
  original: (attributes) => {
    const viz = attributes.state.visualization;
    const legacyViz = viz as MetricVisualizationState & LegacyMetricStyling;

    // Drop explicit null accessors (legacy SOs persist nulls while the transform drops them).
    for (const key of NULLABLE_VIZ_ACCESSORS) {
      if (viz[key] == null) {
        delete viz[key];
      }
    }

    // Icons with no API mapping (e.g. legacy `empty`/`popout`) are dropped by the transform.
    if (viz.icon && iconCompat.toAPI(viz.icon) === undefined) {
      delete viz.icon;
    }

    // Unsupported `applyColorTo` values (e.g. legacy `bar`) are dropped.
    if (viz.applyColorTo && !validApplyColorTo.has(viz.applyColorTo)) {
      delete viz.applyColorTo;
    }

    // The transform derives `showBar` purely from the presence of a max-accessor background bar.
    viz.showBar = Boolean(viz.maxAccessor);
    viz.titlesTextAlign = viz.titlesTextAlign ?? DEFAULT_PRIMARY_LABELS_ALIGNMENT;

    if (viz.icon) {
      viz.iconAlign = viz.iconAlign ?? DEFAULT_PRIMARY_ICON_ALIGNMENT;
    } else {
      delete viz.iconAlign;
    }

    viz.primaryAlign = viz.primaryAlign ?? viz.valuesTextAlign ?? DEFAULT_PRIMARY_VALUE_ALIGNMENT;
    viz.primaryPosition = viz.primaryPosition ?? DEFAULT_PRIMARY_POSITION;

    // Without a secondary metric, the transform resets secondary styling to its defaults.
    if (viz.secondaryMetricAccessor) {
      viz.secondaryAlign = viz.secondaryAlign ?? DEFAULT_SECONDARY_VALUE_ALIGNMENT;
      viz.secondaryLabelPosition = viz.secondaryLabelPosition ?? DEFAULT_SECONDARY_LABEL_PLACEMENT;
    } else {
      viz.secondaryAlign = DEFAULT_SECONDARY_VALUE_ALIGNMENT;
      viz.secondaryLabelPosition = DEFAULT_SECONDARY_LABEL_PLACEMENT;
    }

    // Absent sizing round-trips through the API as `auto`, which maps back to `valueFontMode: 'default'`.
    viz.valueFontMode = viz.valueFontMode ?? 'default';

    if (viz.breakdownByAccessor && viz.maxCols == null) {
      viz.maxCols = LENS_METRIC_BREAKDOWN_DEFAULT_MAX_COLUMNS;
    }

    // `secondaryTrend: { type: 'none' }` is the absence of a trend; the transform omits it.
    if (viz.secondaryTrend?.type === 'none') {
      delete viz.secondaryTrend;
    }

    // Empty subtitle is dropped during the round-trip.
    if (viz.subtitle === '') {
      delete viz.subtitle;
    }

    // Deprecated / legacy TSVB-era styling keys are not produced by the transform.
    delete viz.valuesTextAlign;
    delete viz.titleWeight;
    delete legacyViz.textAlign;
    delete legacyViz.size;
    delete legacyViz.titlePosition;
    delete legacyViz.colorMode;
    delete legacyViz.valuesTextSize;
    delete legacyViz.titlesTextSize;

    return attributes;
  },
  transformed: (attributes) => {
    const viz = attributes.state.visualization;

    viz.secondaryAlign = viz.secondaryAlign ?? DEFAULT_SECONDARY_VALUE_ALIGNMENT;
    viz.secondaryLabelPosition = viz.secondaryLabelPosition ?? DEFAULT_SECONDARY_LABEL_PLACEMENT;

    return attributes;
  },
};

/**
 * Column-level metric cleanups not handled by the common normalizer. These only ever apply to the
 * original (legacy SO) side, since the transform already emits the canonical shape:
 * - drop optional fields the transform omits (`reducedTimeRange`, `filter`, `timeShift`,
 *   `timeScale` when empty/null, and the `isStaticValue` marker on static-value columns)
 * - the trendline date histogram's `sourceField` is re-derived at runtime, so the transform
 *   emits an empty string instead of the persisted time field
 * - the rebuilt trendline layer inherits its main layer's `sampling`
 */
const alignMetricColumns: NormalizerConfig<MetricAttributes> = {
  original: (attributes) => {
    const formBased = getFormBasedDatasourceState(attributes.state.datasourceStates);
    const layers = formBased?.layers ?? {};
    for (const layer of Object.values(layers)) {
      const isTrendline = Boolean(layer.linkToLayers?.length);
      if (isTrendline) {
        const mainLayer = layers[layer.linkToLayers![0]];
        if (mainLayer?.sampling != null) {
          layer.sampling = mainLayer.sampling;
        }
      }
      for (const col of Object.values(layer.columns)) {
        const column = col as unknown as Record<string, unknown>;
        if (column.reducedTimeRange == null || column.reducedTimeRange === '') {
          delete column.reducedTimeRange;
        }
        if (column.filter == null) {
          delete column.filter;
        }
        if (column.timeShift == null) {
          delete column.timeShift;
        }
        if (column.timeScale == null) {
          delete column.timeScale;
        }
        delete column.isStaticValue;
        if (isTrendline && column.operationType === 'date_histogram') {
          column.sourceField = '';
        }
      }
    }
    return attributes;
  },
  ignore: [
    // ES|QL column display format (`params`) is not preserved through the API round-trip,
    // consistent with the already-ignored `meta` / `inMetricDimension` text-based fields.
    'state.datasourceStates.textBased.layers.*.columns.*.params',
    // Runtime-only ES|QL fields not produced by the transform.
    'state.datasourceStates.textBased.initialContext',
    'state.datasourceStates.textBased.layers.*.columns.*.variable',
  ],
};

/**
 * The transform only keeps `trendlineSecondaryMetricAccessor` when its column actually exists in
 * the rebuilt trendline layer; an orphaned accessor (no backing column) is dropped.
 */
const alignTrendlineSecondary: NormalizerConfig<MetricAttributes> = {
  original: (attributes) => {
    const viz = attributes.state.visualization;
    if (!viz.trendlineSecondaryMetricAccessor) {
      return attributes;
    }
    const formBased = getFormBasedDatasourceState(attributes.state.datasourceStates);
    const trendlineLayer = formBased?.layers?.[TRENDLINE_LAYER_ID];
    if (!trendlineLayer?.columns?.[SECONDARY_TRENDLINE_COLUMN]) {
      delete viz.trendlineSecondaryMetricAccessor;
    }
    return attributes;
  },
};

/**
 * Form-based layers backed by an ad-hoc data view keep their references in `internalReferences`,
 * not the top-level `references`. Legacy SOs may leave a stale top-level reference behind, and a
 * linked trendline layer inherits the parent layer's ad-hoc internal reference.
 */
const alignFormBasedAdHocReferencesNormalizer: NormalizerConfig<MetricAttributes> = {
  original: (attributes) => {
    const adHocIds = new Set(Object.keys(attributes.state.adHocDataViews ?? {}));
    const formBased = getFormBasedDatasourceState(attributes.state.datasourceStates);
    if (adHocIds.size === 0 || !formBased?.layers) {
      return attributes;
    }

    const internalReferences = attributes.state.internalReferences ?? [];
    const refName = (layerId: string) => `indexpattern-datasource-layer-${layerId}`;

    for (const [layerId, layer] of Object.entries(formBased.layers)) {
      const existing = internalReferences.find((ref) => ref.name === refName(layerId));
      let adHocId = existing && adHocIds.has(existing.id) ? existing.id : undefined;

      if (!adHocId && layer.linkToLayers?.length) {
        const parent = internalReferences.find(
          (ref) => ref.name === refName(layer.linkToLayers![0])
        );
        adHocId = parent && adHocIds.has(parent.id) ? parent.id : undefined;
      }

      if (!adHocId) {
        continue;
      }
      if (!existing) {
        internalReferences.push({ id: adHocId, name: refName(layerId), type: 'index-pattern' });
      }
      attributes.references = attributes.references.filter((ref) => ref.name !== refName(layerId));
    }

    if (internalReferences.length > 0) {
      attributes.state.internalReferences = internalReferences;
    }
    return attributes;
  },
};

/**
 * The metric API only keeps a color-by-value palette when there is a breakdown or the range is
 * absolute (`rangeType: 'number'`); otherwise it falls back to AUTO and the palette is dropped.
 * When kept, the palette's `continuity` is always re-derived from the range bounds.
 *
 * For custom palettes the API stores each band's upper bound (lte) in `stops`, while `colorStops`
 * carries the lower bound. The transform re-derives `colorStops` from the normalized `stops`: each
 * band opens at the previous band's upper bound (the first opens at `rangeMin`).
 *
 * All of this only applies to the original (legacy) side, since the transform already emits the
 * dropped palette, the re-derived `continuity`, and the re-derived `colorStops`.
 */
const alignMetricPaletteNormalizer: NormalizerConfig<MetricAttributes> = {
  original: (attributes) => {
    const viz = attributes.state.visualization;
    const palette = viz.palette;
    if (!palette?.params) {
      return attributes;
    }

    const isAbsoluteRange = palette.params.rangeType === 'number';
    if (!viz.breakdownByAccessor && !isAbsoluteRange) {
      delete viz.palette;
      delete viz.applyColorTo;
      return attributes;
    }

    const params = palette.params;
    params.continuity = getContinuity(
      getRangeValue(params.rangeMin),
      getRangeValue(params.rangeMax)
    );

    if (palette.name === 'custom') {
      const stops = params.stops as Array<{ color: string; stop: number | null }> | undefined;
      const colorStops = params.colorStops as
        | Array<{ color: string; stop: number | null }>
        | undefined;
      if (stops?.length && colorStops) {
        const rangeMin = getRangeValue(params.rangeMin);
        params.colorStops = stops.map((current, i) => ({
          color: current.color,
          stop: i === 0 ? rangeMin : stops[i - 1].stop,
        })) as typeof params.colorStops;
      }
    }
    return attributes;
  },
};

/**
 * ES|QL layers may declare extra columns referenced only inside the query (sorting, intermediate
 * EVALs). The transform keeps only the columns bound to a metric accessor, so prune the rest.
 */
const alignTextBasedColumns: NormalizerConfig<MetricAttributes> = {
  original: (attributes) => {
    const textBased = attributes.state.datasourceStates.textBased;
    for (const layer of Object.values(textBased?.layers ?? {})) {
      layer.columns = layer.columns.filter((c) => canonicalMetricColumns.has(c.columnId));
    }
    return attributes;
  },
};

const alignStaticValueMax: NormalizerConfig<MetricAttributes> = {
  original: (attributes) => {
    const viz = attributes.state.visualization;
    // Only drop when trendline takes precedence
    if (!viz.trendlineLayerId || viz.maxAccessor !== 'metric_accessor_max') {
      return attributes;
    }
    const formBased = getFormBasedDatasourceState(attributes.state.datasourceStates);
    const layer = formBased?.layers?.[DEFAULT_LAYER_ID];
    const maxColumn = layer?.columns?.metric_accessor_max as { operationType?: string } | undefined;
    if (!layer || maxColumn?.operationType !== 'static_value') {
      return attributes;
    }

    delete layer.columns.metric_accessor_max;
    layer.columnOrder = layer.columnOrder.filter((id: string) => id !== 'metric_accessor_max');
    delete viz.maxAccessor;
    viz.showBar = false;
    return attributes;
  },
  // No `transformed` —> the non-trendline panels should round-trip cleanly
};

/**
 * Linked layers (e.g. orphaned trendline shells) with no columns are dropped by the transform
 * along with their respective datasource references.
 */
const alignEmptyLinkedLayers: NormalizerConfig<MetricAttributes> = {
  original: (attributes) => {
    const formBased = getFormBasedDatasourceState(attributes.state.datasourceStates);
    if (!formBased?.layers) {
      return attributes;
    }
    const viz = attributes.state.visualization;

    for (const [layerId, layer] of Object.entries(formBased.layers)) {
      const isEmpty =
        Object.keys(layer.columns ?? {}).length === 0 && (layer.columnOrder?.length ?? 0) === 0;
      if (!isEmpty || !layer.linkToLayers?.length) {
        continue;
      }

      delete formBased.layers[layerId];
      attributes.references = attributes.references.filter(
        (reference) => reference.name !== `indexpattern-datasource-layer-${layerId}`
      );

      if (viz.trendlineLayerId === layerId) {
        delete viz.trendlineLayerId;
        delete viz.trendlineLayerType;
        delete viz.trendlineTimeAccessor;
        delete viz.trendlineMetricAccessor;
        delete viz.trendlineSecondaryMetricAccessor;
        delete viz.trendlineBreakdownByAccessor;
      }
    }
    return attributes;
  },
};

const alignIds: NormalizerConfig<MetricAttributes> = {
  original: (attributes) => {
    const viz = attributes.state.visualization;
    const idMap = new Map(
      getColumnRemapping(viz).filter((pair): pair is [string, string] => pair[0] != null)
    );
    const remap = (id: string | undefined): string | undefined =>
      id == null ? id : idMap.get(id) ?? id;

    viz.layerId = DEFAULT_LAYER_ID;
    if (viz.trendlineLayerId) viz.trendlineLayerId = TRENDLINE_LAYER_ID;

    const accessor = getMetricAccessor(viz);
    if (accessor) viz.metricAccessor = remap(accessor);
    if (viz.secondaryMetricAccessor)
      viz.secondaryMetricAccessor = remap(viz.secondaryMetricAccessor);
    if (viz.maxAccessor) viz.maxAccessor = remap(viz.maxAccessor);
    if (viz.breakdownByAccessor) viz.breakdownByAccessor = remap(viz.breakdownByAccessor);
    if (viz.trendlineTimeAccessor) viz.trendlineTimeAccessor = remap(viz.trendlineTimeAccessor);
    if (viz.trendlineMetricAccessor)
      viz.trendlineMetricAccessor = remap(viz.trendlineMetricAccessor);
    if (viz.trendlineBreakdownByAccessor)
      viz.trendlineBreakdownByAccessor = remap(viz.trendlineBreakdownByAccessor);
    // `getColumnRemapping` maps this accessor to the `X0`-suffixed formula column id; the
    // visualization field itself uses the non-suffixed id, so set it explicitly.
    if (viz.trendlineSecondaryMetricAccessor)
      viz.trendlineSecondaryMetricAccessor = 'metric_accessor_secondary_trendline';

    if (!viz.collapseFn) delete viz.collapseFn; // remove ""
    if ('accessor' in viz) delete viz.accessor;

    return attributes;
  },
};

export const normalizeMetric = mergeNormalizers([
  getCommonNormalizer<MetricAttributes>(({ state: { visualization } }) => ({
    layerRemapping: [
      [visualization.layerId, DEFAULT_LAYER_ID],
      [visualization.trendlineLayerId, TRENDLINE_LAYER_ID],
    ],
    columnRemapping: getColumnRemapping(visualization),
  })),
  getPaletteNormalizer<MetricAttributes>('state.visualization.palette'),
  alignIds,
  alignStaticValueMax,
  alignEmptyLinkedLayers,
  alignVisualizationDefaults,
  alignMetricColumns,
  alignTextBasedColumns,
  alignTrendlineSecondary,
  alignFormBasedAdHocReferencesNormalizer,
  alignMetricPaletteNormalizer,
]);
