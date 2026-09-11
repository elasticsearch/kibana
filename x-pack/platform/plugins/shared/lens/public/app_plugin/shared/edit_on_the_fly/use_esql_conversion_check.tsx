/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import { partition } from 'lodash';

import type {
  FormBasedLayer,
  FormBasedPrivateState,
  FramePublicAPI,
  GenericIndexPatternColumn,
  VisualizationState,
  LensDatasourceId,
  TypedLensSerializedState,
  LensDocument,
  Visualization,
} from '@kbn/lens-common';
import { i18n } from '@kbn/i18n';
import type { CoreStart } from '@kbn/core/public';

import {
  generateEsqlQuery,
  isEsqlQuerySuccess,
  esqlConversionFailureReasonMessages,
  type EsqlConversionFailureReason,
  type ColumnRoles,
} from '@kbn/lens-common';
import { isQueryAnnotationConfig } from '@kbn/event-annotation-common';
import type { EventAnnotationConfig } from '@kbn/event-annotation-common';
import type { ConvertibleLayer } from './esql_conversion_types';
import { operationDefinitionMap } from '../../../datasources/form_based/operations';
import type { LensPluginStartDependencies } from '../../../plugin';
import { layerTypes } from '../../..';
import { useLensSelector, selectPersistedDoc } from '../../../state_management';
import { convertFormBasedToTextBasedLayer } from './convert_to_text_based_layer';

interface EsqlConversionSettings {
  isConvertToEsqlButtonDisabled: boolean;
  convertToEsqlButtonTooltip: string;
  convertibleLayers: ConvertibleLayer[];
  attributes?: TypedLensSerializedState['attributes'];
}

const getEsqlConversionDisabledSettings = (
  tooltip: string = esqlConversionFailureReasonMessages.unknown
): EsqlConversionSettings => ({
  isConvertToEsqlButtonDisabled: true,
  convertToEsqlButtonTooltip: tooltip,
  convertibleLayers: [],
});

const getConvertibleLayerName = (layerId: string): string =>
  i18n.translate('xpack.lens.config.convertToEsqlLayerName', {
    defaultMessage: 'Layer {layerId}',
    values: { layerId: layerId.substring(0, 6) },
  });

/**
 * Detects query-based annotations in a visualization state. These rely on data views
 * and are not yet supported on ES|QL charts, so they block conversion.
 *
 * The state is intentionally probed structurally instead of via `XYVisualizationState`
 * and `isAnnotationsLayer`: this hook is visualization-agnostic (`visualization.state`
 * is `unknown` in the store and may belong to any vis type), mirroring the
 * `getTrendlineLayerId` probe for metric state below. Trade-off: if the annotation
 * layer shape ever changes (`layerType` / `annotations`), this returns `false` and
 * the conversion guard silently disappears — keep it in sync with
 * `XYAnnotationLayerConfig` (`@kbn/lens-common`).
 */
export const hasQueryBasedAnnotations = (visualizationState: unknown): boolean => {
  const layers = (visualizationState as { layers?: unknown })?.layers;
  if (!Array.isArray(layers)) {
    return false;
  }
  return layers.some(
    (layer: { layerType?: string; annotations?: EventAnnotationConfig[] }) =>
      layer?.layerType === layerTypes.ANNOTATIONS &&
      Array.isArray(layer.annotations) &&
      layer.annotations.some(isQueryAnnotationConfig)
  );
};

const makeNonConvertibleLayer = (
  layerId: string,
  type: ConvertibleLayer['type'],
  failureReason?: EsqlConversionFailureReason
): ConvertibleLayer => ({
  id: layerId,
  icon: 'layers',
  name: getConvertibleLayerName(layerId),
  type,
  query: '',
  isConvertibleToEsql: false,
  conversionData: { esAggsIdMap: {}, partialRows: false },
  failureReason,
});

export const useEsqlConversionCheck = (
  showConvertToEsqlButton: boolean,
  {
    attributes,
    datasourceId,
    layerIds,
    visualization,
    activeVisualization,
  }: {
    attributes: TypedLensSerializedState['attributes'] | undefined;
    datasourceId: LensDatasourceId;
    layerIds: string[];
    visualization: VisualizationState;
    activeVisualization: Visualization | undefined;
  },
  {
    framePublicAPI,
    coreStart,
    startDependencies,
  }: {
    framePublicAPI: FramePublicAPI;
    coreStart: CoreStart;
    startDependencies: LensPluginStartDependencies;
  }
): EsqlConversionSettings => {
  // Get datasourceStates from Redux
  const { datasourceStates } = useLensSelector((state) => state.lens);
  const persistedDoc = useLensSelector(selectPersistedDoc);

  return useMemo(() => {
    const datasourceState = datasourceStates[datasourceId]?.state as FormBasedPrivateState;

    if (!showConvertToEsqlButton || !activeVisualization || !visualization?.state || !attributes) {
      return getEsqlConversionDisabledSettings();
    }

    const { state } = visualization;

    // Guard: charts saved to the library
    if (isSavedToLibrary(persistedDoc)) {
      return getEsqlConversionDisabledSettings(
        esqlConversionFailureReasonMessages.saved_to_library_not_supported
      );
    }

    // Guard: query-based annotations require data views and are not yet supported on ES|QL charts
    if (hasQueryBasedAnnotations(state)) {
      return getEsqlConversionDisabledSettings(
        esqlConversionFailureReasonMessages.query_annotations_not_supported
      );
    }

    // Detect trendline layer from metric visualization state
    const trendlineLayerId = getTrendlineLayerId(state);

    // Guard: datasource state exists and has layers
    if (!isValidDatasourceState(datasourceState)) {
      return getEsqlConversionDisabledSettings();
    }

    const layers = datasourceState.layers as Record<string, FormBasedLayer>;

    // Extract column roles from visualization state for semantic ES|QL column naming
    const columnRoles: ColumnRoles = {};
    const visState = state as Record<string, unknown>;
    if (visState.maxAccessor && typeof visState.maxAccessor === 'string') {
      columnRoles[visState.maxAccessor] = 'max_value';
    }

    // Iterate over data layers and attempt conversion for each. Non-data layers remain
    // visible in the conversion modal but stay in their original datasource.
    const convertibleLayers: ConvertibleLayer[] = [];
    for (const layerId of layerIds) {
      // Metric trendlines are converted separately and omitted from the modal.
      if (layerId === trendlineLayerId) {
        continue;
      }

      const layerType = activeVisualization.getLayerType(layerId, state) ?? layerTypes.DATA;

      // Trendlines are excluded above via trendlineLayerId; this guard only narrows
      // the type (ConvertibleLayer['type'] excludes 'metricTrendline').
      if (layerType === layerTypes.METRIC_TRENDLINE) {
        continue;
      }

      if (layerType !== layerTypes.DATA) {
        convertibleLayers.push(makeNonConvertibleLayer(layerId, layerType));
        continue;
      }

      const layer = layers[layerId];
      if (!layer || !layer.columnOrder || !layer.columns) {
        convertibleLayers.push(makeNonConvertibleLayer(layerId, layerTypes.DATA, 'unknown'));
        continue;
      }

      const { columnOrder } = layer;
      const columns = { ...layer.columns };
      const columnEntries = columnOrder.map((colId) => [colId, columns[colId]] as const);
      const [, esAggEntries] = partition(
        columnEntries,
        ([, col]) =>
          (operationDefinitionMap[col.operationType]?.input === 'fullReference' ||
            operationDefinitionMap[col.operationType]?.input === 'managedReference') &&
          col.operationType !== 'static_value'
      );

      let esqlLayer;
      try {
        esqlLayer = generateEsqlQuery(
          esAggEntries,
          layer,
          framePublicAPI.dataViews.indexPatterns[layer.indexPatternId],
          coreStart.uiSettings,
          framePublicAPI.dateRange,
          startDependencies.data.nowProvider.get(),
          columnRoles
        );
      } catch (e) {
        convertibleLayers.push(makeNonConvertibleLayer(layerId, layerTypes.DATA, 'unknown'));
        continue;
      }

      if (!isEsqlQuerySuccess(esqlLayer)) {
        convertibleLayers.push(makeNonConvertibleLayer(layerId, layerTypes.DATA, esqlLayer.reason));
        continue;
      }

      convertibleLayers.push({
        id: layerId,
        icon: 'layers',
        name: getConvertibleLayerName(layerId),
        type: layerTypes.DATA,
        query: esqlLayer.esql,
        isConvertibleToEsql: true,
        conversionData: {
          esAggsIdMap: esqlLayer.esAggsIdMap,
          partialRows: esqlLayer.partialRows,
        },
      });
    }

    // If there is a trendline layer, attempt to convert it alongside the main layer
    const trendlineResult = trendlineLayerId
      ? tryConvertTrendlineLayer(
          trendlineLayerId,
          layers[trendlineLayerId],
          framePublicAPI,
          coreStart,
          startDependencies,
          columnRoles
        )
      : undefined;

    // If a trendline layer exists but failed to convert, disable the button
    // rather than silently dropping the trendline
    if (trendlineLayerId && trendlineResult && !trendlineResult.success) {
      return getEsqlConversionDisabledSettings(
        esqlConversionFailureReasonMessages.trendline_not_supported
      );
    }

    // Guard: converting only a subset of data layers would leave a form-based data
    // layer alongside text-based ones, which is an invalid mixed state
    // (buildVisualizationAPI rejects mixed ESQL and non-ESQL data layers).
    const nonConvertibleDataLayer = convertibleLayers.find(
      (layer) => layer.type === layerTypes.DATA && !layer.isConvertibleToEsql
    );
    if (nonConvertibleDataLayer) {
      return getEsqlConversionDisabledSettings(
        esqlConversionFailureReasonMessages[nonConvertibleDataLayer.failureReason ?? 'unknown']
      );
    }

    // Trendline is auto-included in the conversion but not shown in the modal.
    // Non-data helper layers (reference lines/annotations) remain in their original datasource.
    const convertibleDataLayers = convertibleLayers.filter(
      (layer) => layer.type === layerTypes.DATA && layer.isConvertibleToEsql
    );
    const layersToConvert = trendlineResult?.success
      ? [...convertibleDataLayers, trendlineResult.layer]
      : convertibleDataLayers;

    const newAttributes = convertFormBasedToTextBasedLayer({
      layersToConvert,
      attributes,
      visualizationState: visualization.state,
      datasourceStates,
      framePublicAPI,
    });

    if (newAttributes === undefined) {
      return getEsqlConversionDisabledSettings();
    }

    return {
      isConvertToEsqlButtonDisabled: false,
      convertToEsqlButtonTooltip: i18n.translate('xpack.lens.config.convertToEsqlTooltip', {
        defaultMessage: 'Convert visualization to ES|QL',
      }),
      convertibleLayers,
      attributes: newAttributes,
    };
  }, [
    activeVisualization,
    attributes,
    coreStart,
    datasourceId,
    datasourceStates,
    framePublicAPI,
    layerIds,
    showConvertToEsqlButton,
    startDependencies,
    visualization,
    persistedDoc,
  ]);
};

/**
 * Extracts the trendline layer ID from metric visualization state, if present.
 */
function getTrendlineLayerId(state: unknown): string | undefined {
  if (
    state &&
    typeof state === 'object' &&
    'trendlineLayerId' in state &&
    typeof (state as { trendlineLayerId: unknown }).trendlineLayerId === 'string'
  ) {
    return (state as { trendlineLayerId: string }).trendlineLayerId;
  }
  return undefined;
}

/**
 * Attempts to convert a trendline layer to ES|QL.
 * Returns a ConvertibleLayer on success, or undefined if conversion fails.
 * Trendline layers have includeEmptyRows stripped from date_histogram columns
 * since ES|QL trendlines don't need gap-filling and this flag blocks conversion.
 */
function tryConvertTrendlineLayer(
  trendlineLayerId: string,
  layer: FormBasedLayer | undefined,
  framePublicAPI: FramePublicAPI,
  coreStart: CoreStart,
  startDependencies: LensPluginStartDependencies,
  columnRoles: ColumnRoles
): { success: true; layer: ConvertibleLayer } | { success: false; reason?: string } {
  if (!layer?.columnOrder || !layer?.columns) return { success: false };

  // Defensive patching of date_histogram columns for trendline conversion.
  //
  // - includeEmptyRows: ES|QL trendlines don't need gap-filling; this flag blocks conversion.
  // - sourceField: normally set by initializeDimension via autoTimeField, but can be empty
  //   in edge cases (e.g. missing timeFieldName at creation time).
  const indexPattern = framePublicAPI.dataViews.indexPatterns[layer.indexPatternId];
  const timeFieldName = indexPattern?.timeFieldName ?? '';
  const columns = Object.fromEntries(
    Object.entries(layer.columns).map(([colId, col]) => {
      if (col.operationType !== 'date_histogram') return [colId, col];
      const colWithParams = col as GenericIndexPatternColumn & {
        sourceField?: string;
        params?: Record<string, unknown>;
      };
      const needsSourceField = !colWithParams.sourceField && timeFieldName;
      const needsStripEmptyRows = colWithParams.params?.includeEmptyRows;
      if (!needsSourceField && !needsStripEmptyRows) return [colId, col];
      return [
        colId,
        {
          ...col,
          ...(needsSourceField ? { sourceField: timeFieldName } : {}),
          ...(needsStripEmptyRows
            ? { params: { ...colWithParams.params, includeEmptyRows: false } }
            : {}),
        },
      ];
    })
  );

  const columnEntries = layer.columnOrder.map((colId) => [colId, columns[colId]] as const);
  const [, esAggEntries] = partition(
    columnEntries,
    ([, col]) =>
      (operationDefinitionMap[col.operationType]?.input === 'fullReference' ||
        operationDefinitionMap[col.operationType]?.input === 'managedReference') &&
      col.operationType !== 'static_value'
  );

  try {
    const esqlLayer = generateEsqlQuery(
      esAggEntries,
      { ...layer, columns },
      framePublicAPI.dataViews.indexPatterns[layer.indexPatternId],
      coreStart.uiSettings,
      framePublicAPI.dateRange,
      startDependencies.data.nowProvider.get(),
      columnRoles
    );
    if (!isEsqlQuerySuccess(esqlLayer)) {
      return { success: false, reason: esqlLayer?.reason };
    }

    return {
      success: true,
      layer: {
        id: trendlineLayerId,
        icon: 'layers',
        name: 'Trendline',
        type: layerTypes.DATA,
        query: esqlLayer.esql,
        isConvertibleToEsql: true,
        conversionData: {
          esAggsIdMap: esqlLayer.esAggsIdMap,
          partialRows: esqlLayer.partialRows,
        },
      },
    };
  } catch {
    return { success: false };
  }
}

function isValidDatasourceState(
  datasourceState: unknown
): datasourceState is { layers: Record<string, FormBasedLayer> } {
  return Boolean(
    datasourceState &&
      typeof datasourceState === 'object' &&
      datasourceState !== null &&
      'layers' in datasourceState &&
      (datasourceState as { layers?: unknown }).layers !== undefined
  );
}

function isSavedToLibrary(persistedDoc: LensDocument | undefined) {
  return Boolean(persistedDoc && persistedDoc.savedObjectId);
}
