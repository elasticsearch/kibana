/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IconType } from '@elastic/eui';

import type {
  DatasourceStates,
  EsqlConversionFailureReason,
  FormBasedLayer,
  FramePublicAPI,
  LensLayerType,
  OriginalColumn,
  TypedLensSerializedState,
} from '@kbn/lens-common';

/**
 * Output from ES|QL query generation containing column mappings and partial row info.
 */
export interface EsqlConversionData {
  esAggsIdMap: Record<string, OriginalColumn[]>;
  partialRows: boolean;
}

/**
 * Lens layer types that can appear in the ES|QL conversion UI.
 * Excludes internal metricTrendline sub-layer.
 */
export type LayerType = Exclude<LensLayerType, 'metricTrendline'>;

/**
 * Represents a Lens layer eligible for ES|QL conversion with its
 * generated query and metadata.
 */
export interface ConvertibleLayer {
  id: string;
  icon: IconType;
  name: string;
  type: LayerType;
  query: string;
  isConvertibleToEsql: boolean;
  conversionData: EsqlConversionData;
  /** Why the layer could not be converted; only set when isConvertibleToEsql is false. */
  failureReason?: EsqlConversionFailureReason;
}

/** Type alias for ES|QL query strings. */
export type EsqlConversionString = string;

/**
 * Intermediate structure holding a layer's conversion result during
 * the ES|QL transformation process.
 */
export interface LayerConversionData {
  layerId: string;
  layer: FormBasedLayer;
  conversionResult: {
    esql: string;
    partialRows: boolean;
    esAggsIdMap: EsqlConversionData['esAggsIdMap'];
  };
}

/** Parameters for converting form-based Lens layers to ES|QL datasource layers. */
export interface ConvertToEsqlParams {
  layersToConvert: ConvertibleLayer[];
  attributes: TypedLensSerializedState['attributes'];
  visualizationState: unknown;
  datasourceStates: DatasourceStates;
  framePublicAPI: FramePublicAPI;
}
