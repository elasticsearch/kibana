/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { GaugeVisualizationState } from '@kbn/lens-common';

import type { LensAttributes } from '../../../../types';
import type { NormalizerConfig } from './normalize';
import { mergeNormalizers } from './normalize';
import type { IdRemapping } from './common';
import { DEFAULT_LAYER_ID, getCommonNormalizer, getPaletteNormalizer } from './common';
import { getMetricAccessor } from '../../../../transforms/charts/utils';

type GaugeAttributes = Extract<LensAttributes, { visualizationType: 'lnsGauge' }>;

const ACCESSOR_METRIC = 'gauge_accessor_metric';
const ACCESSOR_MIN = 'gauge_accessor_min';
const ACCESSOR_MAX = 'gauge_accessor_max';
const ACCESSOR_GOAL = 'gauge_accessor_goal';

function getColumnRemapping(viz: GaugeVisualizationState): IdRemapping {
  return [
    [getMetricAccessor(viz), ACCESSOR_METRIC],
    [viz.minAccessor, ACCESSOR_MIN],
    [viz.maxAccessor, ACCESSOR_MAX],
    [viz.goalAccessor, ACCESSOR_GOAL],
  ];
}

/**
 * A gauge SO references a single form-based layer (`viz.layerId`). Some panels
 * carry an extra secondary form-based layer linked via `linkToLayers` (e.g. a
 * trend/reference layer authored alongside the gauge). The transform only emits
 * the gauge's own layer and drops the linked one (and its reference), so strip
 * any non-gauge form-based layer from the original before the common normalizer
 * runs. Runs at order -2 so the dropped layer's reference never reaches the
 * common reference handling (order -1).
 */
const alignExtraLayers: NormalizerConfig<GaugeAttributes> = {
  order: -2,
  original: (attributes) => {
    const gaugeLayerId = (attributes.state.visualization as GaugeVisualizationState).layerId;
    const formBased = attributes.state.datasourceStates.formBased;

    if (!formBased?.layers || !gaugeLayerId) {
      return attributes;
    }

    const removedLayerIds = Object.keys(formBased.layers).filter((id) => id !== gaugeLayerId);
    if (removedLayerIds.length === 0) {
      return attributes;
    }

    for (const id of removedLayerIds) {
      delete formBased.layers[id];
    }

    attributes.references = attributes.references.filter(
      (reference) =>
        !removedLayerIds.some((id) => reference.name === `indexpattern-datasource-layer-${id}`)
    );

    return attributes;
  },
};

const alignId: NormalizerConfig<GaugeAttributes> = {
  original: (attributes) => {
    const viz = attributes.state.visualization;

    viz.layerId = DEFAULT_LAYER_ID;

    const metricAccessor = getMetricAccessor(viz);
    if (metricAccessor) {
      viz.metricAccessor = ACCESSOR_METRIC;
      // Remove the legacy `accessor` alias if present
      delete (viz as { accessor?: string }).accessor;
    }
    if (viz.minAccessor) viz.minAccessor = ACCESSOR_MIN;
    if (viz.maxAccessor) viz.maxAccessor = ACCESSOR_MAX;
    if (viz.goalAccessor) viz.goalAccessor = ACCESSOR_GOAL;

    return attributes;
  },
};

const alignLegacyTypes: NormalizerConfig<GaugeAttributes> = {
  original: (attributes) => {
    const viz = attributes.state.visualization;

    // Apply transform defaults that legacy SOs may omit
    viz.shape = viz.shape ?? 'horizontalBullet';
    viz.ticksPosition = viz.ticksPosition ?? 'bands';
    viz.labelMajorMode = viz.labelMajorMode ?? 'auto';
    // The state->API->state round-trip emits NO_COLOR unless colorMode is
    // explicitly 'palette', so a missing colorMode resolves to 'none'.
    viz.colorMode = viz.colorMode ?? 'none';

    // An empty `labelMinor` is equivalent to it being absent; the transform only
    // emits it when truthy.
    if (viz.labelMinor === '') {
      delete viz.labelMinor;
    }

    // `isStaticValue` is a runtime-only flag on static_value columns that the
    // transform does not emit. Drop it from the original to compare cleanly.
    for (const layer of Object.values(attributes.state.datasourceStates.formBased?.layers ?? {})) {
      for (const col of Object.values(layer.columns)) {
        delete (col as { isStaticValue?: boolean }).isStaticValue;
      }
    }

    return attributes;
  },
  transformed: (attributes) => {
    const viz = attributes.state.visualization as GaugeVisualizationState;

    // The transform always emits optional accessor and label keys, even when
    // undefined. The original side only sets the keys it actually carries, so
    // strip the undefined-valued ones to compare apples to apples.
    for (const key of ['minAccessor', 'maxAccessor', 'goalAccessor', 'labelMinor'] as const) {
      if (viz[key] === undefined) {
        delete viz[key];
      }
    }

    // Remove transform-added column properties not in the original
    for (const layer of Object.values(attributes.state.datasourceStates.formBased?.layers ?? {})) {
      for (const col of Object.values(layer.columns)) {
        delete (col as { params?: { parentFormat?: unknown } }).params?.parentFormat;
      }
    }

    return attributes;
  },
};

const GAUGE_ACCESSOR_IDS = new Set([ACCESSOR_METRIC, ACCESSOR_MAX, ACCESSOR_MIN, ACCESSOR_GOAL]);

/**
 * For ES|QL gauges the transform emits only the accessor columns (metric, max,
 * min, goal) and drops any extra/duplicate query columns. The common normalizer
 * sorts textBased columns alphabetically by `columnId`, so filter extras while
 * preserving that order rather than imposing a custom sequence.
 */
const alignESQLColumns: NormalizerConfig<GaugeAttributes> = {
  original: (attributes) => {
    const textBasedLayers = attributes.state.datasourceStates.textBased?.layers ?? {};
    for (const layer of Object.values(textBasedLayers)) {
      layer.columns = layer.columns.filter((col) => GAUGE_ACCESSOR_IDS.has(col.columnId));
    }
    return attributes;
  },
};

export const normalizeGauge = mergeNormalizers<GaugeAttributes>([
  getCommonNormalizer<GaugeAttributes>(({ state: { visualization } }) => ({
    layerRemapping: [[(visualization as GaugeVisualizationState).layerId, DEFAULT_LAYER_ID]],
    columnRemapping: getColumnRemapping(visualization as GaugeVisualizationState),
  })),
  getPaletteNormalizer<GaugeAttributes>('state.visualization.palette'),
  alignExtraLayers,
  alignId,
  alignLegacyTypes,
  alignESQLColumns,
]);
