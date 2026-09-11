/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { screen } from '@testing-library/react';
import type { Query, AggregateQuery } from '@kbn/es-query';
import { LENS_DATASOURCE_ID, LENS_LAYER_TYPES } from '@kbn/lens-common';
import { coreMock } from '@kbn/core/public/mocks';
import { LayerTypes } from '@kbn/expression-xy-plugin/public';

import {
  createMockFramePublicAPI,
  mockVisualizationMap,
  mockDatasourceMap,
  mockStoreDeps,
  renderWithReduxStore,
} from '../../../mocks';
import { createMockStartDependencies } from '../../../editor_frame_service/mocks';
import { EditorFrameServiceProvider } from '../../../editor_frame_service/editor_frame_service_context';
import type { LensPluginStartDependencies } from '../../../plugin';
import { getDatasourceIdForNewLayer, useAddLayerButton } from './use_add_layer_button';

function AddLayerButtonHarness({
  framePublicAPI,
  coreStart,
  dataViews,
  uiActions,
}: {
  framePublicAPI: ReturnType<typeof createMockFramePublicAPI>;
  coreStart: ReturnType<typeof coreMock.createStart>;
  dataViews: LensPluginStartDependencies['dataViews'];
  uiActions: LensPluginStartDependencies['uiActions'];
}) {
  const addLayerButton = useAddLayerButton(
    framePublicAPI,
    coreStart,
    dataViews,
    uiActions,
    () => undefined
  );

  return <div data-test-subj="addLayerButtonHost">{addLayerButton}</div>;
}

function renderAddLayerButton(
  query?: Query | AggregateQuery,
  activeDatasourceId: 'formBased' | 'textBased' = 'formBased'
) {
  const visualizationMap = mockVisualizationMap();
  const datasourceMap = mockDatasourceMap();
  visualizationMap.testVis.getAddLayerButtonComponent = (props) => (
    <button data-test-subj="lnsLayerAddButton" onClick={() => props.addLayer(LayerTypes.DATA)} />
  );

  const framePublicAPI = createMockFramePublicAPI();
  const coreStart = coreMock.createStart();
  const startDependencies = createMockStartDependencies() as unknown as LensPluginStartDependencies;

  const datasourceState =
    activeDatasourceId === 'textBased' ? { layers: {}, indexPatternRefs: [] } : 'state';

  return renderWithReduxStore(
    <EditorFrameServiceProvider visualizationMap={visualizationMap} datasourceMap={datasourceMap}>
      <AddLayerButtonHarness
        framePublicAPI={framePublicAPI}
        coreStart={coreStart}
        dataViews={startDependencies.dataViews}
        uiActions={startDependencies.uiActions}
      />
    </EditorFrameServiceProvider>,
    {},
    {
      preloadedState: {
        datasourceStates: {
          [activeDatasourceId]: {
            isLoading: false,
            state: datasourceState,
          },
        },
        activeDatasourceId,
        query,
        visualization: {
          activeId: 'testVis',
          state: 'state',
          selectedLayerId: 'first',
        },
      },
      storeDeps: mockStoreDeps({ datasourceMap, visualizationMap }),
    }
  );
}

describe('useAddLayerButton', () => {
  it('uses the selected layer datasource for a new data layer', () => {
    expect(
      getDatasourceIdForNewLayer(LENS_LAYER_TYPES.DATA, LENS_DATASOURCE_ID.TEXT_BASED, false)
    ).toBe(LENS_DATASOURCE_ID.TEXT_BASED);
  });

  it('uses the form-based datasource for a new reference line', () => {
    expect(
      getDatasourceIdForNewLayer(
        LENS_LAYER_TYPES.REFERENCELINE,
        LENS_DATASOURCE_ID.TEXT_BASED,
        true
      )
    ).toBe(LENS_DATASOURCE_ID.FORM_BASED);
  });

  it('forces text-based for a new data layer on an ES|QL chart even when a form-based helper layer is selected', () => {
    expect(
      getDatasourceIdForNewLayer(LENS_LAYER_TYPES.DATA, LENS_DATASOURCE_ID.FORM_BASED, true)
    ).toBe(LENS_DATASOURCE_ID.TEXT_BASED);
  });

  // Multi-layer editing is supported for ES|QL charts: the add layer button renders
  // for text-based queries as well (see "enable layers for esql charts").
  it('renders the add layer button for ES|QL queries', () => {
    renderAddLayerButton({ esql: 'FROM foo' }, 'textBased');
    expect(screen.getByTestId('lnsLayerAddButton')).toBeInTheDocument();
  });

  it('renders the add layer button for non-ES|QL queries', () => {
    renderAddLayerButton({ query: '*', language: 'kuery' });
    expect(screen.getByTestId('lnsLayerAddButton')).toBeInTheDocument();
  });
});
