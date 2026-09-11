/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { esql } from '@elastic/esql';

import type { DatatableColumnType } from '@kbn/expressions-plugin/common';
import type {
  DataType,
  FormBasedLayer,
  FormBasedPrivateState,
  FramePublicAPI,
  TextBasedLayer,
  TextBasedLayerColumn,
  TextBasedPrivateState,
  TypedLensSerializedState,
  ValueFormatConfig,
} from '@kbn/lens-common';
import { getChartScopedFilterQuery } from '@kbn/lens-common';

import { operationDefinitionMap } from '../../../datasources/form_based/operations';
import type {
  ConvertibleLayer,
  ConvertToEsqlParams,
  EsqlConversionData,
  LayerConversionData,
} from './esql_conversion_types';

// Map Lens DataType to DatatableColumnType
// Some Lens types (counter, gauge, document) aren't valid DatatableColumnTypes
const getMetaTypeFromDataType = (dataType: DataType): DatatableColumnType => {
  if (dataType === 'document') {
    return 'string';
  }
  if (dataType === 'counter' || dataType === 'gauge') {
    return 'number';
  }
  return dataType;
};

/**
 * Retrieves conversion data for a form-based layer.
 */
function getLayerConversionData(
  layerId: string,
  layers: Record<string, FormBasedLayer>,
  preComputedData: { query: string; conversionData: EsqlConversionData }
): LayerConversionData | undefined {
  if (!(layerId in layers)) return undefined;

  const layer = layers[layerId];
  if (!layer || !layer.columnOrder || !layer.columns) return undefined;

  return {
    layerId,
    layer,
    conversionResult: {
      esql: preComputedData.query,
      esAggsIdMap: preComputedData.conversionData.esAggsIdMap,
      partialRows: preComputedData.conversionData.partialRows,
    },
  };
}

/**
 * Builds the text-based datasource state.
 * Uses data from the passed ConvertibleLayer objects.
 * Preserves original column IDs so visualizations can still reference them.
 * The fieldName property holds the ES|QL field name.
 */
function buildTextBasedState(
  layersToConvert: ConvertibleLayer[],
  layers: Record<string, FormBasedLayer>,
  framePublicAPI: FramePublicAPI
): TextBasedPrivateState | undefined {
  if (layersToConvert.length === 0) return undefined;

  const newLayers: Record<string, TextBasedLayer> = {};

  for (const convertibleLayer of layersToConvert) {
    const layerId = convertibleLayer.id;
    const preComputedData = {
      query: convertibleLayer.query,
      conversionData: convertibleLayer.conversionData,
    };

    const conversionData = getLayerConversionData(layerId, layers, preComputedData);
    if (!conversionData) continue;

    const { layer, conversionResult } = conversionData;

    // Get index pattern for field format lookup
    const indexPattern = framePublicAPI.dataViews.indexPatterns[layer.indexPatternId];

    // Build new text-based columns from esAggsIdMap
    // Keep original column IDs so visualizations can still reference them
    // sourceColumn from esAggsIdMap already has properly computed label (via getDefaultLabel) and format
    const newColumns: TextBasedLayerColumn[] = Object.entries(conversionResult.esAggsIdMap).map(
      ([esqlFieldName, originalColumns]) => {
        const sourceColumn = originalColumns[0];
        const dataType = sourceColumn.dataType ?? 'string';
        const metaType = getMetaTypeFromDataType(dataType);

        const column: TextBasedLayerColumn = {
          columnId: sourceColumn.id,
          fieldName: esqlFieldName,
          meta: {
            type: metaType,
          },
        };

        const hasCustomLabel = Boolean(sourceColumn.customLabel);

        column.customLabel = true; // set always to true so we can use the default label as a custom label
        if (hasCustomLabel) {
          column.label = sourceColumn.label;
          // This is a sanity check to satisfy TS for the incoming form based column.
        } else if ('operationType' in sourceColumn && sourceColumn.operationType) {
          // use the generated default label
          column.label = operationDefinitionMap[sourceColumn.operationType].getDefaultLabel(
            layer.columns[sourceColumn.id],
            layer.columns,
            indexPattern
          );
        }

        // GenericIndexPatternColumn doesn't declare params on all variants (e.g. field-based columns),
        // but at runtime many have params.format. Cast to a minimal shape so we can safely read it.
        const originalCol = layer.columns[sourceColumn.id] as
          | { params?: { format?: ValueFormatConfig } }
          | undefined;
        const hadUserFormat = Boolean(
          originalCol?.params &&
            'format' in originalCol.params &&
            originalCol.params.format !== undefined
        );

        // Only set format when the user had explicitly configured it on the form-based column.
        // If it was default (no user override), leave column.params.format unset so it stays default.
        if (hadUserFormat) {
          let format = sourceColumn.format;
          if (!format?.id && sourceColumn.sourceField && indexPattern?.fieldFormatMap) {
            const fieldFormat = indexPattern.fieldFormatMap[sourceColumn.sourceField];
            if (fieldFormat?.id) {
              format = fieldFormat as typeof sourceColumn.format;
            }
          }
          if (format?.id !== undefined) {
            column.params = { format: format as ValueFormatConfig };
          }
        }

        return column;
      }
    );

    newLayers[layerId] = {
      index: layer.indexPatternId,
      query: { esql: esql(conversionResult.esql).print('wrapping') },
      columns: newColumns,
      timeField: framePublicAPI.dataViews.indexPatterns[layer.indexPatternId]?.timeFieldName,
    };
  }

  if (Object.keys(newLayers).length === 0) return undefined;

  return {
    layers: newLayers,
    indexPatternRefs: Object.values(framePublicAPI.dataViews.indexPatterns).map((ip) => ({
      id: ip.id!,
      title: ip.title,
      name: ip.name,
      timeField: ip.timeFieldName,
    })),
  };
}

/**
 * Converts form-based layers to text-based (ES|QL) and returns new attributes.
 * Returns undefined if conversion fails or no layers to convert.
 */
export function convertFormBasedToTextBasedLayer({
  layersToConvert,
  attributes,
  visualizationState,
  datasourceStates,
  framePublicAPI,
}: ConvertToEsqlParams): TypedLensSerializedState['attributes'] | undefined {
  const validLayersToConvert = layersToConvert.filter(
    (layer) => layer.type === 'data' && layer.isConvertibleToEsql && layer.query.trim().length > 0
  );
  if (validLayersToConvert.length === 0) {
    return undefined;
  }

  const formBasedState = datasourceStates.formBased?.state as FormBasedPrivateState | undefined;
  if (!formBasedState?.layers) {
    return undefined;
  }

  const newDatasourceState = buildTextBasedState(
    validLayersToConvert,
    formBasedState.layers,
    framePublicAPI
  );

  if (!newDatasourceState) {
    return undefined;
  }

  // Ensure the converted layer carries an ES|QL query
  const firstLayerId = validLayersToConvert[0].id;
  const esqlQuery = newDatasourceState.layers[firstLayerId]?.query;

  if (!esqlQuery?.esql.trim()) {
    return undefined;
  }

  const convertedLayerIds = new Set(validLayersToConvert.map(({ id }) => id));
  const remainingFormBasedLayers = Object.fromEntries(
    Object.entries(formBasedState.layers).filter(([id]) => !convertedLayerIds.has(id))
  );
  const hasRemainingFormBasedLayers = Object.keys(remainingFormBasedLayers).length > 0;

  // Build new attributes with converted layers in the text-based datasource and preserve
  // non-data helper layers (reference lines/annotations) in the form-based datasource.
  // Callers must not pass a subset of data layers: leaving a form-based data layer
  // alongside text-based ones creates an invalid mixed state (see useEsqlConversionCheck guard).
  const newAttributes: TypedLensSerializedState['attributes'] = {
    ...attributes,
    state: {
      ...attributes.state,
      // ES|QL lives exclusively on the text-based layers; keep only a
      // chart-scoped KQL/Lucene filter in the top-level slot (if any).
      query: getChartScopedFilterQuery(attributes.state.query),
      datasourceStates: {
        ...(hasRemainingFormBasedLayers
          ? { formBased: { ...formBasedState, layers: remainingFormBasedLayers } }
          : {}),
        textBased: newDatasourceState,
      },
      visualization: visualizationState,
    },
  };

  return newAttributes;
}
