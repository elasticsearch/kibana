/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { dataViewMock } from '@kbn/discover-utils/src/__mocks__';
import { EMPTY_CONTEXT_AWARENESS_TOOLKIT } from '../../../..';
import { DataSourceCategory } from '../../../../profiles';
import type { DefaultAppStateExtension, DefaultAppStateExtensionParams } from '../../../../types';
import { getDefaultAppState } from './get_default_app_state';

const createGetDefaultAppState = (prevAppState: DefaultAppStateExtension) =>
  getDefaultAppState(() => prevAppState, {
    context: {
      category: DataSourceCategory.Metrics,
    },
    toolkit: EMPTY_CONTEXT_AWARENESS_TOOLKIT,
  });

describe('getDefaultAppState', () => {
  it('preserves the previous app state while applying the metrics defaults', () => {
    const params: DefaultAppStateExtensionParams = { dataView: dataViewMock };
    const prevAppState: DefaultAppStateExtension = {
      breakdownField: 'host.name',
      columns: [{ name: 'host.name' }],
      rowHeight: 3,
    };

    const appState = createGetDefaultAppState(prevAppState)(params);

    expect(appState).toEqual({
      ...prevAppState,
      hideChart: false,
      hideTable: true,
      hideSidebar: true,
    });
  });

  it('overrides previous chart visibility state with metrics defaults', () => {
    const params: DefaultAppStateExtensionParams = { dataView: dataViewMock };
    const prevAppState: DefaultAppStateExtension = {
      hideChart: true,
      hideTable: false,
      hideSidebar: false,
    };

    const appState = createGetDefaultAppState(prevAppState)(params);

    expect(appState).toEqual({
      hideChart: false,
      hideTable: true,
      hideSidebar: true,
    });
  });
});
