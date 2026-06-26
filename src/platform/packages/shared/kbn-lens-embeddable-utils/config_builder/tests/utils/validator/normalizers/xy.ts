/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { orderBy } from 'lodash';
import type { LensAttributes } from '../../../../types';
import type { NormalizerConfig } from './normalize';
import { mergeNormalizers } from './normalize';
import type { IdRemapping } from './common';
import { getCommonNormalizer, getColorMappingNormalizer } from './common';
import type { FormBasedPersistedState } from '@kbn/lens-common';

// Default colorMappings in Lens state format, mirroring what fromColorMappingAPIToLensState
// produces for DEFAULT_LINE_CATEGORICAL_COLOR_MAPPING and DEFAULT_CATEGORICAL_COLOR_MAPPING.
// `touched` is intentionally omitted — it is covered by COMMON_STATE_IGNORE_PATHS and is stripped
// from the transformed side before comparison, so the original must not carry it either.
const DEFAULT_LINE_COLOR_MAPPING = {
  colorMode: { type: 'categorical' as const },
  paletteId: 'elastic_line_optimized',
  assignments: [] as [],
  specialAssignments: [{ rules: [{ type: 'other' as const }], color: { type: 'loop' as const } }],
};

const DEFAULT_COLOR_MAPPING = {
  colorMode: { type: 'categorical' as const },
  paletteId: 'default',
  assignments: [] as [],
  specialAssignments: [{ rules: [{ type: 'other' as const }], color: { type: 'loop' as const } }],
};

type XYAttributes = Extract<LensAttributes, { visualizationType: 'lnsXY' }>;

// Mirrors seriesTypeFromStateToAPIMap in api_layers.ts
const seriesTypeToAPIType: Record<string, string> = {
  bar: 'bar',
  bar_stacked: 'bar_stacked',
  bar_percentage_stacked: 'bar_percentage',
  bar_horizontal: 'bar_horizontal',
  bar_horizontal_stacked: 'bar_horizontal_stacked',
  bar_horizontal_percentage_stacked: 'bar_horizontal_percentage',
  line: 'line',
  area: 'area',
  area_stacked: 'area_stacked',
  area_percentage_stacked: 'area_percentage',
};

function getAPILayerType(layer: any): string | undefined {
  const { layerType } = layer;
  if (!layerType || layerType === 'data') {
    return seriesTypeToAPIType[layer.seriesType];
  }
  if (layerType === 'referenceLine') return 'reference_lines';
  if (layerType === 'annotations') {
    return layer.persistanceType === 'byReference' ? 'annotation_group' : 'annotations';
  }
  return undefined;
}

function computeLayerRemapping(layers: any[]): IdRemapping {
  return layers.flatMap((layer, i) => {
    const apiType = getAPILayerType(layer);
    return apiType !== undefined ? [[layer.layerId, `${apiType}_${i}`] as [string, string]] : [];
  });
}

function computeColumnRemapping(
  layers: any[],
  formBased?: FormBasedPersistedState
): IdRemapping {
  const remapping: IdRemapping = [];
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    const apiType = getAPILayerType(layer);
    if (apiType === undefined) continue;

    if (!layer.layerType || layer.layerType === 'data') {
      if (layer.xAccessor) remapping.push([layer.xAccessor, `${apiType}_x`]);
      (layer.accessors ?? []).forEach((acc: string, j: number) => {
        remapping.push([acc, `${apiType}_y_${j}`]);
        // Include the inner reference column for non-formula reference-based metrics
        // (e.g. the backing max column of a differences metric), mirroring processMetricColumnsWithReferences.
        const fbCol = formBased?.layers?.[layer.layerId]?.columns?.[acc] as any;
        if (
          fbCol &&
          Array.isArray(fbCol.references) &&
          fbCol.references.length > 0 &&
          fbCol.operationType !== 'formula'
        ) {
          remapping.push([fbCol.references[0] as string, `${apiType}_y_ref_${j}`]);
        }
      });
      if (layer.splitAccessors?.[0]) remapping.push([layer.splitAccessors[0], `${apiType}_breakdown`]);
    } else if (layer.layerType === 'referenceLine') {
      (layer.accessors ?? []).forEach((acc: string, j: number) =>
        remapping.push([acc, `reference_lines_threshold_${j}`])
      );
    }
  }
  return remapping;
}

// Remap viz-layer accessor IDs to match canonical IDs produced by the transform
const alignIds: NormalizerConfig<XYAttributes> = {
  original: (attributes) => {
    const viz = attributes.state.visualization as any;
    const layers: any[] = viz.layers ?? [];

    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      const apiType = getAPILayerType(layer);
      if (apiType === undefined) continue;

      const canonicalLayerId = `${apiType}_${i}`;

      if (layer.layerType === 'annotations' && layer.persistanceType === 'byReference') {
        layer.annotationGroupRef = `ref-${canonicalLayerId}`;
      }

      if (!layer.layerType || layer.layerType === 'data') {
        const accessorMap = new Map<string, string>();
        (layer.accessors ?? []).forEach((acc: string, j: number) =>
          accessorMap.set(acc, `${apiType}_y_${j}`)
        );

        if (layer.xAccessor) layer.xAccessor = `${apiType}_x`;
        if (layer.accessors) {
          layer.accessors = layer.accessors.map((_: string, j: number) => `${apiType}_y_${j}`);
        }
        if (layer.splitAccessors?.length > 0) {
          layer.splitAccessors = [`${apiType}_breakdown`, ...layer.splitAccessors.slice(1)];
        }
        if (layer.yConfig) {
          layer.yConfig = layer.yConfig.map((yc: any) => ({
            ...yc,
            forAccessor: accessorMap.get(yc.forAccessor) ?? yc.forAccessor,
          }));
        }
      }

      if (layer.layerType === 'referenceLine') {
        if (layer.accessors) {
          layer.accessors = layer.accessors.map((_: string, j: number) => `reference_lines_threshold_${j}`);
        }
        if (layer.yConfig) {
          layer.yConfig = layer.yConfig.map((yc: any, j: number) => ({
            ...yc,
            forAccessor: `reference_lines_threshold_${j}`,
          }));
        }
      }

      layer.layerId = canonicalLayerId;
    }

    return attributes;
  },
};

// Drop/normalize legacy properties and add defaults to match transform output
const alignLegacyTypes: NormalizerConfig<XYAttributes> = {
  original: (attributes) => {
    const viz = attributes.state.visualization as any;
    const layers: any[] = viz.layers ?? [];

    // Collect IDs of viz layers that will be dropped (unknown layerType).
    // Their datasource references are stale after the transform and must be removed.
    const droppedLayerIds = new Set(
      layers
        .filter((layer: any) => getAPILayerType(layer) === undefined)
        .map((layer: any) => layer.layerId as string)
    );

    // Drop layers with unknown layerType (e.g. 'xxx') — the transform skips them
    viz.layers = layers.filter((layer: any) => getAPILayerType(layer) !== undefined);

    for (const layer of viz.layers) {
      if (!layer.layerType || layer.layerType === 'data') {
        delete layer.isHistogram;
        delete layer.simpleView;
        delete layer.xScaleType;
        delete layer.position;
        delete layer.showGridlines;

        // colorMapping and palette are only preserved when there's a breakdown
        if (!layer.splitAccessors?.length) {
          delete layer.colorMapping;
          delete layer.palette;
        } else if (!layer.colorMapping) {
          // The transform always adds a default colorMapping when a breakdown is present;
          // add the same default to the original so the round-trip comparison succeeds.
          layer.colorMapping =
            layer.seriesType === 'line' ? DEFAULT_LINE_COLOR_MAPPING : DEFAULT_COLOR_MAPPING;
        }

        // Rebuild yConfig: ensure one entry per accessor with default axisMode
        const configuredAccessors = new Map<string, any>(
          (layer.yConfig ?? []).map((yc: any) => [yc.forAccessor, yc])
        );
        const allAccessors: string[] = layer.accessors ?? [];
        layer.yConfig = allAccessors
          .map((acc) => {
            const existing = configuredAccessors.get(acc);
            return existing ? { axisMode: 'left', ...existing } : { axisMode: 'left', forAccessor: acc };
          })
          .filter((yc: any) => Object.keys(yc).length > 1);
      }
    }

    // Add missing axis visibility/orientation settings with transform defaults
    if (!viz.axisTitlesVisibilitySettings) {
      viz.axisTitlesVisibilitySettings = { x: true, yLeft: true, yRight: true };
    }
    if (!viz.tickLabelsVisibilitySettings) {
      viz.tickLabelsVisibilitySettings = { x: true, yLeft: true, yRight: true };
    }
    if (!viz.gridlinesVisibilitySettings) {
      viz.gridlinesVisibilitySettings = { x: true, yLeft: true, yRight: true };
    }
    if (!viz.labelsOrientation) {
      viz.labelsOrientation = { x: 0, yLeft: 0, yRight: 0 };
    }

    // Delete empty linkToLayers from formBased layers
    const formBased = attributes.state.datasourceStates.formBased;
    if (formBased) {
      for (const layer of Object.values(formBased.layers)) {
        const l = layer as any;
        if (Array.isArray(l.linkToLayers) && l.linkToLayers.length === 0) {
          delete l.linkToLayers;
        }
      }

      // Remove datasource layers with empty columns — result of dropped invalid viz layers
      for (const [layerId, layer] of Object.entries(formBased.layers)) {
        if (Object.keys((layer as any).columns ?? {}).length === 0) {
          delete formBased.layers[layerId];
        }
      }
    }

    // Remove references for dropped viz layers (their datasource refs are stale).
    if (droppedLayerIds.size > 0) {
      attributes.references = attributes.references.filter(
        (ref) =>
          !droppedLayerIds.has(
            ref.name.replace('indexpattern-datasource-layer-', '')
          )
      );
    }

    // Convert xy-visualization-layer-* refs to indexpattern-datasource-layer-* format.
    // The transform stores annotation layer data view refs under indexpattern-datasource-layer-*.
    attributes.references = attributes.references.map((ref) => {
      if (ref.type === 'index-pattern' && ref.name.startsWith('xy-visualization-layer-')) {
        return {
          ...ref,
          name: ref.name.replace('xy-visualization-layer-', 'indexpattern-datasource-layer-'),
        };
      }
      return ref;
    });

    // Re-sort after name conversion so the order matches what normalizeReferences produces
    // on the transformed side (which is sorted alphabetically by the common transformed callback).
    attributes.references = orderBy(attributes.references, ['name', 'id', 'type']);

    return attributes;
  },

  transformed: (attributes) => {
    // buildReferenceLineLayer always emits undefined-valued properties (fill, icon, etc.)
    // in yConfig entries. Strip them so the comparison with the original succeeds.
    const viz = attributes.state.visualization as any;
    for (const layer of viz.layers ?? []) {
      if (layer.yConfig) {
        layer.yConfig = layer.yConfig.map((yc: any) => {
          const cleaned: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(yc)) {
            if (v !== undefined) cleaned[k] = v;
          }
          return cleaned;
        });
      }
    }
    return attributes;
  },
};

export const normalizeXY = mergeNormalizers<XYAttributes>(
  [
    getCommonNormalizer<XYAttributes>(({ state: { visualization, datasourceStates } }) => ({
      layerRemapping: computeLayerRemapping((visualization as any).layers ?? []),
      columnRemapping: computeColumnRemapping(
        (visualization as any).layers ?? [],
        datasourceStates.formBased
      ),
    })),
    alignIds,
    alignLegacyTypes,
    getColorMappingNormalizer<XYAttributes>('state.visualization.layers.*.colorMapping'),
  ]
);
