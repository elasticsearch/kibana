/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import sinon from 'sinon';
import type { FeatureCollection } from 'geojson';
import { MockSyncContext } from '../../__fixtures__/mock_sync_context';
import type { IVectorSource } from '../../../sources/vector_source';
import { DataRequestAbortError } from '../../../util/data_request';
import { syncGeojsonSourceData } from './geojson_source_data';
import { VECTOR_SHAPE_TYPE } from '../../../../../common/constants';

const requestMeta = {
  filters: [],
  timeFilters: { from: 'now', to: '15m', mode: 'relative' as const },
  zoom: 0,
  isReadOnly: false,
  executionContext: {},
  applyGlobalQuery: true,
  applyGlobalTime: false,
  applyForceRefresh: true,
  fieldNames: [],
  sourceMeta: {},
  isForceRefresh: false,
  isFeatureEditorOpenForLayer: false,
};

const emptyFeatureCollection: FeatureCollection = { type: 'FeatureCollection', features: [] };

function createMockSource(overrides: Partial<IVectorSource> = {}): IVectorSource {
  return {
    isFilterByMapBounds: () => false,
    isTimeAware: async () => false,
    isFieldAware: () => false,
    isQueryAware: () => false,
    isGeoGridPrecisionAware: () => false,
    getSupportedShapeTypes: async () => [VECTOR_SHAPE_TYPE.POINT],
    getGeoJsonWithMeta: async () => ({ data: emptyFeatureCollection, meta: {} }),
    getTimesliceMaskFieldName: async () => null,
    ...overrides,
  } as unknown as IVectorSource;
}

describe('syncGeojsonSourceData', () => {
  test('calls startLoading and stopLoading on success', async () => {
    const syncContext = new MockSyncContext({ dataFilters: {} });
    const source = createMockSource();

    await syncGeojsonSourceData({
      layerId: 'layer1',
      layerName: 'my layer',
      prevDataRequest: undefined,
      requestMeta,
      syncContext,
      source,
      getUpdateDueToTimeslice: () => true,
    });

    // @ts-expect-error
    sinon.assert.calledOnce(syncContext.startLoading);
    // @ts-expect-error
    sinon.assert.calledOnce(syncContext.stopLoading);
    // @ts-expect-error
    sinon.assert.notCalled(syncContext.onLoadError);
    // @ts-expect-error
    sinon.assert.notCalled(syncContext.onLoadAbort);
  });

  test('calls onLoadAbort (not onLoadError) and rethrows when DataRequestAbortError is thrown', async () => {
    const syncContext = new MockSyncContext({ dataFilters: {} });
    const source = createMockSource({
      getGeoJsonWithMeta: async () => {
        throw new DataRequestAbortError();
      },
    });

    await expect(
      syncGeojsonSourceData({
        layerId: 'layer1',
        layerName: 'my layer',
        prevDataRequest: undefined,
        requestMeta,
        syncContext,
        source,
        getUpdateDueToTimeslice: () => true,
      })
    ).rejects.toThrow(DataRequestAbortError);

    // @ts-expect-error
    sinon.assert.calledOnce(syncContext.onLoadAbort);
    // @ts-expect-error
    sinon.assert.notCalled(syncContext.onLoadError);
    // @ts-expect-error
    sinon.assert.notCalled(syncContext.stopLoading);
  });

  test('calls onLoadError (not onLoadAbort) and rethrows when a non-abort error is thrown', async () => {
    const syncContext = new MockSyncContext({ dataFilters: {} });
    const fetchError = new Error('fetch failed');
    const source = createMockSource({
      getGeoJsonWithMeta: async () => {
        throw fetchError;
      },
    });

    await expect(
      syncGeojsonSourceData({
        layerId: 'layer1',
        layerName: 'my layer',
        prevDataRequest: undefined,
        requestMeta,
        syncContext,
        source,
        getUpdateDueToTimeslice: () => true,
      })
    ).rejects.toThrow(fetchError);

    // @ts-expect-error
    sinon.assert.calledOnce(syncContext.onLoadError);
    // @ts-expect-error
    sinon.assert.notCalled(syncContext.onLoadAbort);
    // @ts-expect-error
    sinon.assert.notCalled(syncContext.stopLoading);
  });
});
