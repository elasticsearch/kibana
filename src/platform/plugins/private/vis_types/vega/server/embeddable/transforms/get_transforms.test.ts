/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SavedObjectReference } from '@kbn/core/server';
import type { DrilldownTransforms } from '@kbn/embeddable-plugin/common';
import type { DrilldownState, SerializedDrilldowns } from '@kbn/embeddable-plugin/server';
import { VEGA_SAVED_OBJECT_TYPE } from '../../../common/constants';
import type { VegaByValueState, VegaEmbeddableState } from '../schema';
import { VEGA_SAVED_OBJECT_REF_NAME } from './get_transform_in';
import { getTransforms } from './get_transforms';

const drilldownReference: SavedObjectReference = {
  id: 'target-dashboard-id',
  name: 'dashboard-drilldown-reference',
  type: 'dashboard',
};

const publicDrilldown = {
  type: 'dashboard_drilldown',
  trigger: 'FILTER_TRIGGER',
  label: 'Go to dashboard',
  dashboard_id: 'target-dashboard-id',
};

const storedDrilldown = {
  type: 'dashboard_drilldown',
  trigger: 'FILTER_TRIGGER',
  label: 'Go to dashboard',
  dashboardRefName: drilldownReference.name,
};

const drilldownTransforms: DrilldownTransforms = {
  transformIn: <State extends SerializedDrilldowns>(state: State) => {
    if (!state.drilldowns) {
      return { state, references: [] as never[] };
    }
    return {
      state: {
        ...state,
        drilldowns: [storedDrilldown] as DrilldownState[],
      },
      references: [drilldownReference],
    };
  },
  transformOut: <StoredState extends SerializedDrilldowns>(storedState: StoredState) => ({
    ...storedState,
    drilldowns: [publicDrilldown],
  }),
};

describe('Vega embeddable transforms', () => {
  const { transformIn, transformOut } = getTransforms(drilldownTransforms);

  test('extracts drilldown references from by-value state', () => {
    const state = {
      spec: { format: 'hjson', value: '{ mark: point }' },
      drilldowns: [publicDrilldown],
    } as VegaByValueState;

    expect(transformIn(state)).toEqual({
      state: {
        spec: state.spec,
        drilldowns: [storedDrilldown],
      },
      references: [drilldownReference],
    });
  });

  test('extracts both Vega library and drilldown references from by-reference state', () => {
    const state = {
      ref_id: 'vega-library-item-id',
      drilldowns: [publicDrilldown],
    } as VegaEmbeddableState;

    expect(transformIn(state)).toEqual({
      state: { drilldowns: [storedDrilldown] },
      references: [
        {
          id: 'vega-library-item-id',
          name: VEGA_SAVED_OBJECT_REF_NAME,
          type: VEGA_SAVED_OBJECT_TYPE,
        },
        drilldownReference,
      ],
    });
  });

  test('injects drilldown references into by-value state', () => {
    const state = {
      spec: { format: 'hjson', value: '{ mark: point }' },
      drilldowns: [storedDrilldown],
    } as VegaByValueState;

    expect(transformOut(state, [drilldownReference])).toEqual({
      spec: state.spec,
      drilldowns: [publicDrilldown],
    });
  });

  test('injects both Vega library and drilldown references into by-reference state', () => {
    const state = { drilldowns: [storedDrilldown] } as SerializedDrilldowns;
    const references = [
      {
        id: 'vega-library-item-id',
        name: VEGA_SAVED_OBJECT_REF_NAME,
        type: VEGA_SAVED_OBJECT_TYPE,
      },
      drilldownReference,
    ];

    expect(transformOut(state, references)).toEqual({
      ref_id: 'vega-library-item-id',
      drilldowns: [publicDrilldown],
    });
  });
});
