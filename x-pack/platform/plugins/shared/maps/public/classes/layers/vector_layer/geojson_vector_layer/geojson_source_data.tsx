/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FeatureCollection } from 'geojson';
import {
  EMPTY_FEATURE_COLLECTION,
  SOURCE_DATA_REQUEST_ID,
  VECTOR_SHAPE_TYPE,
} from '../../../../../common/constants';
import type {
  DataRequestMeta,
  Timeslice,
  VectorSourceRequestMeta,
} from '../../../../../common/descriptor_types';
import type { DataRequestContext } from '../../../../actions';
import type { IVectorSource } from '../../../sources/vector_source';
import { DataRequestAbortError } from '../../../util/data_request';
import type { DataRequest } from '../../../util/data_request';
import { getCentroidFeatures } from './get_centroid_features';
import { canSkipSourceUpdate } from '../../../util/can_skip_fetch';
import { assignFeatureIds } from './assign_feature_ids';

export async function syncGeojsonSourceData({
  layerId,
  layerName,
  prevDataRequest,
  requestMeta,
  syncContext,
  source,
  getUpdateDueToTimeslice,
}: {
  layerId: string;
  layerName: string;
  prevDataRequest: DataRequest | undefined;
  requestMeta: VectorSourceRequestMeta;
  syncContext: DataRequestContext;
  source: IVectorSource;
  getUpdateDueToTimeslice: (timeslice?: Timeslice) => boolean;
}): Promise<{ refreshed: boolean; featureCollection: FeatureCollection }> {
  const {
    startLoading,
    stopLoading,
    onLoadError,
    onLoadAbort,
    registerCancelCallback,
    isRequestStillActive,
  } = syncContext;
  const dataRequestId = SOURCE_DATA_REQUEST_ID;
  const requestToken = Symbol(`${layerId}-${dataRequestId}`);

  const canSkipFetch = syncContext.forceRefreshDueToDrawing
    ? false
    : await canSkipSourceUpdate({
        source,
        prevDataRequest,
        nextRequestMeta: requestMeta,
        extentAware: source.isFilterByMapBounds(),
        getUpdateDueToTimeslice,
      });

  if (canSkipFetch) {
    return {
      refreshed: false,
      featureCollection: prevDataRequest
        ? (prevDataRequest.getData() as FeatureCollection)
        : EMPTY_FEATURE_COLLECTION,
    };
  }

  try {
    startLoading(dataRequestId, requestToken, requestMeta);
    const { data: sourceFeatureCollection, meta } = await source.getGeoJsonWithMeta(
      layerName,
      requestMeta,
      registerCancelCallback.bind(null, requestToken),
      () => {
        return isRequestStillActive(dataRequestId, requestToken);
      },
      syncContext.inspectorAdapters
    );
    const layerFeatureCollection = assignFeatureIds(sourceFeatureCollection);
    const supportedShapes = await source.getSupportedShapeTypes();
    if (
      supportedShapes.includes(VECTOR_SHAPE_TYPE.LINE) ||
      supportedShapes.includes(VECTOR_SHAPE_TYPE.POLYGON)
    ) {
      layerFeatureCollection.features.push(...getCentroidFeatures(layerFeatureCollection));
    }
    const responseMeta: DataRequestMeta = meta ? { ...meta } : {};
    if (requestMeta.applyGlobalTime && (await source.isTimeAware())) {
      const timesliceMaskField = await source.getTimesliceMaskFieldName();
      if (timesliceMaskField) {
        responseMeta.timesliceMaskField = timesliceMaskField;
      }
    }
    stopLoading(dataRequestId, requestToken, layerFeatureCollection, responseMeta);
    return {
      refreshed: true,
      featureCollection: layerFeatureCollection,
    };
  } catch (error) {
    if (error instanceof DataRequestAbortError) {
      onLoadAbort(dataRequestId, requestToken);
    } else {
      onLoadError(dataRequestId, requestToken, error);
    }
    throw error;
  }
}
