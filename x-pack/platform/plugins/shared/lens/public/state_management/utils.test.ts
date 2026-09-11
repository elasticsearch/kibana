/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Datatable } from '@kbn/expressions-plugin/common';
import type { DatasourceStates } from '@kbn/lens-common';
import { createMockDatasource, createMockFramePublicAPI } from '../mocks';
import { getDatasourceLayers, getUpdatedFrameWithDatasourceState } from './utils';

const dateColumnTable = (rows: Array<Record<string, unknown>>): Datatable => ({
  type: 'datatable',
  columns: [{ id: 'col1', name: '@timestamp', meta: { type: 'date' } }],
  rows,
});

describe('getDatasourceLayers', () => {
  const datasource = createMockDatasource('formBased');
  datasource.getLayers.mockReturnValue(['layer1']);
  const datasourceMap = { formBased: datasource };
  const datasourceStates = {
    formBased: { isLoading: false, state: {} },
  } as DatasourceStates;
  const indexPatterns = {};

  beforeEach(() => {
    getDatasourceLayers.clear();
    datasource.getPublicAPI.mockClear();
  });

  it('passes the layer inspector table into getPublicAPI', () => {
    const activeDataTable = dateColumnTable([{ col1: 1 }]);
    getDatasourceLayers(datasourceStates, datasourceMap, indexPatterns, {
      layer1: activeDataTable,
    });
    expect(datasource.getPublicAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        layerId: 'layer1',
        activeDataTable,
      })
    );
  });

  it('omits overlay when the layer table is not passed', () => {
    getDatasourceLayers(datasourceStates, datasourceMap, indexPatterns);
    expect(datasource.getPublicAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        layerId: 'layer1',
        activeDataTable: undefined,
      })
    );
  });
});

describe('getUpdatedFrameWithDatasourceState', () => {
  it('passes the layer inspector table into getPublicAPI', () => {
    const datasource = createMockDatasource('formBased');
    const activeDataTable = dateColumnTable([{ col1: 1 }]);
    const frame = createMockFramePublicAPI({
      activeData: { layer1: activeDataTable },
    });
    getUpdatedFrameWithDatasourceState(frame, datasource, {}, 'layer1');
    expect(datasource.getPublicAPI).toHaveBeenCalledWith(
      expect.objectContaining({
        layerId: 'layer1',
        activeDataTable,
      })
    );
  });
});
