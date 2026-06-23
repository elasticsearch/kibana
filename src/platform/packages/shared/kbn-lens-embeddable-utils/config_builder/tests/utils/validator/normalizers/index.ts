/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { LensApiConfigChartType } from '../../../../schema';
import type { AttributesNormalizer } from './normalize';
import { normalizeHeatmap } from './heatmap';
import { normalizeDatatable } from './datatable';
import { normalizePartition } from './partition';
import { normalizeTagcloud } from './tagcloud';
import { normalizeRegionMap } from './region_map';

const chartNormalizers = {
  heatmap: normalizeHeatmap,
  data_table: normalizeDatatable,
  pie: normalizePartition,
  treemap: normalizePartition,
  mosaic: normalizePartition,
  waffle: normalizePartition,
  tag_cloud: normalizeTagcloud,
  region_map: normalizeRegionMap,
} satisfies Record<string, AttributesNormalizer<any>>;

export function getChartNormalizer(
  chartType: LensApiConfigChartType
): AttributesNormalizer | undefined {
  return (chartNormalizers as any)[chartType];
}
