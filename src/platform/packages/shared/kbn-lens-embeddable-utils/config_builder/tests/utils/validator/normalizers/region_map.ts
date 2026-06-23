/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ChoroplethChartState } from '@kbn/lens-common';

import type { LensAttributes } from '../../../../types';
import type { NormalizerConfig } from './normalize';
import { mergeNormalizers } from './normalize';
import type { IdRemapping } from './common';
import { DEFAULT_LAYER_ID, getCommonNormalizer } from './common';

type RegionMapAttributes = Extract<LensAttributes, { visualizationType: 'lnsChoropleth' }>;

const getColumnRemapping = ({
  valueAccessor,
  regionAccessor,
}: ChoroplethChartState): IdRemapping => [
  [valueAccessor, 'region_map_accessor_metric'],
  [regionAccessor, 'region_map_accessor_region'],
];

const alignId: NormalizerConfig<RegionMapAttributes> = {
  original: (attributes) => {
    const viz = attributes.state.visualization;
    const columnRemapping = getColumnRemapping(viz);
    const idMap = Object.fromEntries(
      columnRemapping.filter((pair): pair is [string, string] => pair[0] != null)
    );

    viz.layerId = DEFAULT_LAYER_ID;

    if (viz.valueAccessor) {
      viz.valueAccessor = idMap[viz.valueAccessor];
    }
    if (viz.regionAccessor) {
      viz.regionAccessor = idMap[viz.regionAccessor];
    }

    return attributes;
  },
};

const alignLegacyTypes: NormalizerConfig<RegionMapAttributes> = {
  original: (attributes) => {
    const viz = attributes.state.visualization;

    // layerType is not part of the choropleth chart state types.
    // Check /Users/andreanamalama/kibana/x-pack/platform/plugins/shared/maps/public/lens/choropleth_chart/visualization.tsx
    // - initialize has always set it to LayerTypes.DATA and
    // - getLayerType hardcodes return LayerTypes.DATA ignoring any persisted layerType field entirely
    if ('layerType' in viz) {
      delete viz.layerType;
    }

    return attributes;
  },
};

export const normalizeRegionMap = mergeNormalizers<RegionMapAttributes>([
  getCommonNormalizer<RegionMapAttributes>(({ state: { visualization } }) => ({
    layerRemapping: [[visualization.layerId, DEFAULT_LAYER_ID]],
    columnRemapping: getColumnRemapping(visualization),
  })),
  alignId,
  alignLegacyTypes,
]);
