/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiButtonGroup } from '@elastic/eui';
import type {
  FramePublicAPI,
  VisualizationDimensionEditorProps,
  LegacyMetricState,
} from '@kbn/lens-common';
import { createMockDatasource, createMockFramePublicAPI } from '../../mocks';
import { MetricDimensionEditor } from './dimension_editor';
import { chartPluginMock } from '@kbn/charts-plugin/public/mocks';
import { ColorMode } from '@kbn/charts-plugin/public';
import type { PaletteOutput, PaletteRegistry, CustomPaletteParams } from '@kbn/coloring';
import { CustomizablePalette } from '@kbn/coloring';
import { act } from 'react-dom/test-utils';

import { PalettePanelContainer } from '../../shared_components';
import { LayerTypes } from '@kbn/expression-xy-plugin/public';
import type { DatasourcePublicAPI } from '../..';
import { mountWithProviders } from '../../test_utils/test_utils';

function paletteParamsContaining(paramsToCheck: PaletteOutput<CustomPaletteParams>['params']) {
  return expect.objectContaining({
    palette: expect.objectContaining({
      params: expect.objectContaining(paramsToCheck),
    }),
  });
}

describe('metric dimension editor', () => {
  let frame: FramePublicAPI;
  let state: LegacyMetricState;
  let setState: (newState: LegacyMetricState) => void;
  let props: VisualizationDimensionEditorProps<LegacyMetricState> & {
    paletteService: PaletteRegistry;
  };

  function testState(): LegacyMetricState {
    return {
      layerId: 'first',
      layerType: LayerTypes.DATA,
      accessor: 'foo',
    };
  }

  beforeEach(() => {
    state = testState();
    frame = createMockFramePublicAPI();
    frame.datasourceLayers = {
      first: createMockDatasource('test').publicAPIMock,
    };
    frame.activeData = {
      first: {
        type: 'datatable',
        columns: [
          {
            id: 'foo',
            name: 'foo',
            meta: {
              type: 'string',
            },
          },
        ],
        rows: [{ foo: 5 }],
      },
    };
    setState = jest.fn();
    props = {
      accessor: 'foo',
      frame,
      groupId: 'columns',
      layerId: 'first',
      state,
      setState,
      paletteService: chartPluginMock.createPaletteRegistry(),
      panelRef: React.createRef(),
      addLayer: jest.fn(),
      removeLayer: jest.fn(),
      datasource: {} as DatasourcePublicAPI,
    };
    // add a div to the ref
    props.panelRef.current = document.createElement('div');
  });

  it('should not show the dynamic coloring option for non numeric columns', () => {
    const instance = mountWithProviders(<MetricDimensionEditor {...props} />);
    expect(
      instance.find('[data-test-subj="lnsLegacyMetric_dynamicColoring_groups"]').exists()
    ).toBe(false);
    expect(instance.find('[data-test-subj="lns_dynamicColoring_edit"]').exists()).toBe(false);
  });

  it('should set the dynamic coloring default to "none"', () => {
    frame.activeData!.first.columns[0].meta.type = 'number';
    const instance = mountWithProviders(<MetricDimensionEditor {...props} />);
    expect(
      instance
        .find('[data-test-subj="lnsLegacyMetric_dynamicColoring_groups"]')
        .find(EuiButtonGroup)
        .prop('idSelected')
    ).toEqual(expect.stringContaining(ColorMode.None));

    expect(instance.find('[data-test-subj="lns_dynamicColoring_edit"]').exists()).toBe(false);
  });

  it('should show the dynamic palette display ony when colorMode is different from "none"', () => {
    frame.activeData!.first.columns[0].meta.type = 'number';
    state.colorMode = ColorMode.Labels;
    const instance = mountWithProviders(<MetricDimensionEditor {...props} />);
    expect(
      instance
        .find('[data-test-subj="lnsLegacyMetric_dynamicColoring_groups"]')
        .find(EuiButtonGroup)
        .prop('idSelected')
    ).toEqual(expect.stringContaining(ColorMode.Labels));

    expect(instance.find('[data-test-subj="lns_dynamicColoring_edit"]').exists()).toBe(true);
  });

  it('should prefill the palette stops with some colors when enabling coloring', () => {
    frame.activeData!.first.columns[0].meta.type = 'number';
    const instance = mountWithProviders(<MetricDimensionEditor {...props} />);

    act(() => {
      instance
        .find('[data-test-subj="lnsLegacyMetric_dynamicColoring_groups"]')
        .find(EuiButtonGroup)
        .prop('onChange')!(ColorMode.Labels);
    });
    instance.update();

    expect(props.setState).toHaveBeenCalledWith(
      paletteParamsContaining({
        stops: expect.any(Array), // shallow check it's ok
      })
    );
  });

  it('should open the palette panel when "Settings" link is clicked in the palette input', () => {
    frame.activeData!.first.columns[0].meta.type = 'number';
    state.colorMode = ColorMode.Background;
    const instance = mountWithProviders(<MetricDimensionEditor {...props} />);

    act(() => {
      instance.find('[data-test-subj="lns_colorEditing_trigger"]').first().simulate('click');
    });
    instance.update();

    expect(instance.find(PalettePanelContainer).exists()).toBe(true);
  });

  it('should provide have a special data min/max for zero metric value', () => {
    frame.activeData!.first.columns[0].meta.type = 'number';
    frame.activeData!.first.rows[0].foo = 0;
    state.colorMode = ColorMode.Background;
    const instance = mountWithProviders(<MetricDimensionEditor {...props} />);

    act(() => {
      instance.find('[data-test-subj="lns_colorEditing_trigger"]').first().simulate('click');
    });
    instance.update();

    expect(instance.find(CustomizablePalette).prop('dataBounds')).toEqual({ min: -50, max: 100 });
  });

  it('should work for negative metric value', () => {
    frame.activeData!.first.columns[0].meta.type = 'number';
    frame.activeData!.first.rows[0].foo = -1;
    state.colorMode = ColorMode.Background;
    const instance = mountWithProviders(<MetricDimensionEditor {...props} />);

    act(() => {
      instance.find('[data-test-subj="lns_colorEditing_trigger"]').first().simulate('click');
    });
    instance.update();

    expect(instance.find(CustomizablePalette).prop('dataBounds')).toEqual({ min: -2, max: 0 });
  });

  it('should apply the default named palette with open bounds', () => {
    frame.activeData!.first.columns[0].meta.type = 'number';
    frame.activeData!.first.rows[0].foo = 5;
    state.colorMode = ColorMode.None;
    state.palette = undefined;
    const instance = mountWithProviders(<MetricDimensionEditor {...props} />);

    act(() => {
      instance
        .find('[data-test-subj="lnsLegacyMetric_dynamicColoring_groups"]')
        .find(EuiButtonGroup)
        .prop('onChange')!(ColorMode.Background);
    });

    expect(setState).toHaveBeenCalledWith(
      paletteParamsContaining({
        name: 'status',
        continuity: 'all',
        rangeMin: -Infinity,
        rangeMax: Infinity,
        stops: expect.arrayContaining([]),
      })
    );
  });
});
