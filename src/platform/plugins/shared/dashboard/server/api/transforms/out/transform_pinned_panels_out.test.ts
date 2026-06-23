/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  ControlValuesSource,
  DEFAULT_DSL_OPTIONS_LIST_STATE,
  DEFAULT_PINNED_CONTROL_STATE,
  DEFAULT_RANGE_SLIDER_STATE,
  DEFAULT_TIME_SLIDER_STATE,
  OPTIONS_LIST_CONTROL,
  RANGE_SLIDER_CONTROL,
  TIME_SLIDER_CONTROL,
} from '@kbn/controls-constants';
import type { DashboardSavedObjectAttributes } from '../../../dashboard_saved_object';
import type { DashboardState } from '../../types';
import {
  transformPinnedPanelProperties,
  transformPinnedPanelsObjectToArray,
  transformPinnedPanelsOut,
  type StoredPinnedPanels,
} from './transform_pinned_panels_out';
import {
  optionsListDSLControlSchema,
  rangeSliderControlSchema,
  timeSliderControlSchema,
} from '@kbn/controls-schemas';

const mockGetTransforms = jest.fn();

beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('../../../kibana_services').embeddableService = {
    getTransforms: mockGetTransforms,
  };

  mockGetTransforms.mockImplementation((embeddableType) => {
    function getSchema(type: string) {
      if (type === OPTIONS_LIST_CONTROL) {
        return optionsListDSLControlSchema;
      }

      if (type === RANGE_SLIDER_CONTROL) {
        return rangeSliderControlSchema;
      }

      if (type === TIME_SLIDER_CONTROL) {
        return timeSliderControlSchema;
      }

      if (type === 'invalidPanel') {
        return {
          validate: jest.fn().mockImplementation(() => {
            throw new Error('Boo!');
          }),
        };
      }
    }
    return {
      transformOut: jest.fn().mockImplementation((val) => val),
      schema: getSchema(embeddableType),
    };
  });
});

describe('pinned panels', () => {
  const mockPinnedPanels = {
    control1: {
      id: 'control1',
      type: OPTIONS_LIST_CONTROL,
      grow: true,
      config: { data_view_id: 'dataViewId', field_name: 'fieldName' },
      order: 0,
    },
    control2: {
      id: 'control2',
      type: RANGE_SLIDER_CONTROL,
      width: 'small',
      config: { data_view_id: 'dataViewId', field_name: 'fieldName', step: 2 },
      order: 1,
    },
    control3: {
      id: 'control3',
      type: TIME_SLIDER_CONTROL,
      grow: true,
      width: 'large',
      config: {},
      order: 2,
    },
  } as Required<DashboardSavedObjectAttributes>['pinned_panels']['panels'];

  const transformedPinnedPanels = [
    {
      id: 'control1',
      type: OPTIONS_LIST_CONTROL,
      ...DEFAULT_PINNED_CONTROL_STATE,
      grow: true,
      config: {
        ...DEFAULT_DSL_OPTIONS_LIST_STATE,
        data_view_id: 'dataViewId',
        field_name: 'fieldName',
      },
    },
    {
      id: 'control2',
      type: RANGE_SLIDER_CONTROL,
      ...DEFAULT_PINNED_CONTROL_STATE,
      width: 'small',
      config: {
        ...DEFAULT_RANGE_SLIDER_STATE,
        values_source: ControlValuesSource.FIELD,
        data_view_id: 'dataViewId',
        field_name: 'fieldName',
        step: 2,
      },
    },
    {
      id: 'control3',
      type: TIME_SLIDER_CONTROL,
      grow: true,
      width: 'large',
      config: DEFAULT_TIME_SLIDER_STATE,
    },
  ] as unknown as DashboardState['pinned_panels'];

  it('should transform pinned panels object to array with all transformations applied', () => {
    const result = transformPinnedPanelsOut(undefined, { panels: mockPinnedPanels }, []);
    expect(result.panels).toEqual(transformedPinnedPanels);
  });

  it('should transform pinned panels object to array', () => {
    const result = transformPinnedPanelsObjectToArray(mockPinnedPanels);
    expect(result).toHaveLength(3);
    expect(result).toHaveProperty('0.id', 'control1');
    expect(result).toHaveProperty('1.id', 'control2');
    expect(result).toHaveProperty('2.id', 'control3');
  });

  it('drops any invalid panels', () => {
    const invalidPanel = {
      type: 'invalidPanel',
      grow: true,
      config: {},
      unsupportedProperty: 'unsupported',
      order: 3,
    };
    const result = transformPinnedPanelsOut(
      undefined,
      {
        panels: {
          ...mockPinnedPanels,
          invalidPanel,
        },
      } as DashboardSavedObjectAttributes['pinned_panels'],
      []
    );
    expect(result.panels).toEqual(transformedPinnedPanels);
    expect(result.warnings).toMatchInlineSnapshot(`
      Array [
        Object {
          "message": "Unable to transform pinned panel config. Error: Boo!",
          "panel_config": Object {},
          "panel_type": "invalidPanel",
          "type": "dropped_panel",
        },
      ]
    `);
  });

  describe('transform <9.4 legacy controls', () => {
    it('should transform controls explicit input', () => {
      const controlsArray = transformPinnedPanelsObjectToArray({
        ...mockPinnedPanels,
        control3: {
          ...mockPinnedPanels.control3,
          unsupportedProperty: 'unsupported',
        },
      } as StoredPinnedPanels);
      const result = transformPinnedPanelProperties(controlsArray);

      expect(result).toHaveProperty('0.config.data_view_id', 'dataViewId');
      expect(result).not.toHaveProperty('0.explicitInput');

      expect(result).toHaveProperty('1.config.step', 2);
      expect(result).not.toHaveProperty('1.explicitInput');

      expect(result).toHaveProperty('2.config');
      expect(result).not.toHaveProperty('2.explicitInput');
      expect(result).not.toHaveProperty('2.unsupportedProperty');
      expect(result).not.toHaveProperty('2.config.unsupportedProperty');
    });

    it('should transform serialized control state to array with all transformations applied', () => {
      const serializedControlState = { panelsJSON: JSON.stringify(mockPinnedPanels) };
      const result = transformPinnedPanelsOut(serializedControlState, undefined, []);
      expect(result.panels).toEqual(transformedPinnedPanels);
    });
  });
});
