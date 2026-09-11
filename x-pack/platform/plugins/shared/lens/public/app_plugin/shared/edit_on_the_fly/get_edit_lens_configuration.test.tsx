/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { mockStoreDeps } from '../../../mocks';
import {
  initEmpty,
  initExisting,
  makeConfigureStore,
  setState,
  updateDatasourceState,
  updateVisualizationState,
} from '../../../state_management';
import { updatingMiddleware } from './get_edit_lens_configuration';

describe('Lens flyout', () => {
  let store: ReturnType<typeof makeConfigureStore>;
  const updaterFn = jest.fn();
  beforeEach(() => {
    store = makeConfigureStore(mockStoreDeps(), undefined, updatingMiddleware(updaterFn));
    store.dispatch = jest.fn(store.dispatch);
  });
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('updatingMiddleware for the Lens flyout', () => {
    test('updater is not run on store creation', () => {
      expect(updaterFn).not.toHaveBeenCalled();
    });

    test('updater is run if modifies visualization or datasource state', () => {
      store.dispatch(
        updateDatasourceState({
          datasourceId: 'textBased',
          newDatasourceState: 'newDatasourceState',
        })
      );
      expect(updaterFn).toHaveBeenCalledWith(
        'newDatasourceState',
        null,
        'testVis',
        'textBased',
        {
          formBased: { isLoading: true, state: null },
          textBased: { isLoading: false, state: 'newDatasourceState' },
        },
        // session ad hoc data views
        {}
      );
      store.dispatch(
        updateVisualizationState({ visualizationId: 'testVis', newState: 'newVisState' })
      );
      expect(updaterFn).toHaveBeenCalledWith(
        'newDatasourceState',
        'newVisState',
        'testVis',
        'textBased',
        {
          formBased: { isLoading: true, state: null },
          textBased: { isLoading: false, state: 'newDatasourceState' },
        },
        // session ad hoc data views
        {}
      );
    });

    test('updater is not run if it does not modify visualization or datasource state', () => {
      // assigning the states to {} to test equality by value check
      store.dispatch(
        setState({
          datasourceStates: {
            formBased: { state: {}, isLoading: true },
            textBased: { state: {}, isLoading: true },
          },
          visualization: { state: {}, activeId: 'testVis', selectedLayerId: null },
        })
      );
      updaterFn.mockClear();

      // testing
      store.dispatch(
        updateDatasourceState({
          datasourceId: 'textBased',
          newDatasourceState: {},
        })
      );
      store.dispatch(updateVisualizationState({ visualizationId: 'testVis', newState: {} }));
      expect(updaterFn).not.toHaveBeenCalled();
    });
    test('updater is not run on store initialization actions', () => {
      store.dispatch(
        initEmpty({
          newState: { visualization: { state: {}, activeId: 'testVis', selectedLayerId: null } },
        })
      );
      store.dispatch(
        initExisting({
          visualization: { state: {}, activeId: 'testVis', selectedLayerId: null },
        })
      );
      expect(updaterFn).not.toHaveBeenCalled();
    });
  });
});
