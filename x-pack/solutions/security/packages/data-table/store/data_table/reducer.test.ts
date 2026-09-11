/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { mockGlobalState } from '../../mock/global_state';
import { TableId } from '../../common/types';
import {
  updateShowBuildingBlockAlertsFilter,
  updateShowThreatIndicatorAlertsFilter,
} from './actions';
import { dataTableReducer } from './reducer';
import type { TableState } from './types';
import { EMPTY_TABLE_BY_ID } from './types';

const additionalFilters = {
  showBuildingBlockAlerts: false,
  showOnlyThreatIndicatorAlerts: false,
};

const tableWithFilters = {
  tableById: {
    [TableId.test]: {
      ...mockGlobalState.dataTable.tableById[TableId.test],
      additionalFilters,
    },
  },
} as unknown as TableState;

describe('dataTableReducer additional filters', () => {
  describe('updateShowBuildingBlockAlertsFilter', () => {
    test('it does not throw and is a noop when the table id is missing', () => {
      const state: TableState = { tableById: EMPTY_TABLE_BY_ID };
      const action = updateShowBuildingBlockAlertsFilter({
        id: 'does-not-exist',
        showBuildingBlockAlerts: true,
      });

      expect(() => dataTableReducer(state, action)).not.toThrow();

      const nextState = dataTableReducer(state, action);

      expect(nextState).toBe(state);
      expect(nextState.tableById['does-not-exist']).toBeUndefined();
    });

    test('it updates showBuildingBlockAlerts on an existing table', () => {
      const nextState = dataTableReducer(
        tableWithFilters,
        updateShowBuildingBlockAlertsFilter({
          id: TableId.test,
          showBuildingBlockAlerts: true,
        })
      );

      expect(nextState.tableById[TableId.test].additionalFilters).toEqual({
        showBuildingBlockAlerts: true,
        showOnlyThreatIndicatorAlerts: false,
      });
    });
  });

  describe('updateShowThreatIndicatorAlertsFilter', () => {
    test('it does not throw and is a noop when the table id is missing', () => {
      const state: TableState = { tableById: EMPTY_TABLE_BY_ID };
      const action = updateShowThreatIndicatorAlertsFilter({
        id: 'does-not-exist',
        showOnlyThreatIndicatorAlerts: true,
      });

      expect(() => dataTableReducer(state, action)).not.toThrow();

      const nextState = dataTableReducer(state, action);

      expect(nextState).toBe(state);
      expect(nextState.tableById['does-not-exist']).toBeUndefined();
    });

    test('it updates showOnlyThreatIndicatorAlerts on an existing table', () => {
      const nextState = dataTableReducer(
        tableWithFilters,
        updateShowThreatIndicatorAlertsFilter({
          id: TableId.test,
          showOnlyThreatIndicatorAlerts: true,
        })
      );

      expect(nextState.tableById[TableId.test].additionalFilters).toEqual({
        showBuildingBlockAlerts: false,
        showOnlyThreatIndicatorAlerts: true,
      });
    });
  });
});
