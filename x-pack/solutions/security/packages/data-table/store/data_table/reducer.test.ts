/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  initializeDataTableSettings,
  updateShowBuildingBlockAlertsFilter,
  updateShowThreatIndicatorAlertsFilter,
} from './actions';
import { dataTableReducer } from './reducer';
import { TableId } from '../../common/types';
import type { TableState } from './types';
import { EMPTY_TABLE_BY_ID } from './types';

const id = TableId.alertsOnRuleDetailsPage;
const emptyState: TableState = { tableById: EMPTY_TABLE_BY_ID };

describe('dataTableReducer', () => {
  describe('updateShowBuildingBlockAlertsFilter', () => {
    test('it sets the filter on a table that has not been initialized yet', () => {
      const state = dataTableReducer(
        emptyState,
        updateShowBuildingBlockAlertsFilter({ id, showBuildingBlockAlerts: true })
      );

      expect(state.tableById[id].additionalFilters).toEqual({
        showBuildingBlockAlerts: true,
        showOnlyThreatIndicatorAlerts: false,
      });
    });

    test('it preserves the filter when the table is initialized afterwards', () => {
      const stateWithFilter = dataTableReducer(
        emptyState,
        updateShowBuildingBlockAlertsFilter({ id, showBuildingBlockAlerts: true })
      );

      const state = dataTableReducer(
        stateWithFilter,
        initializeDataTableSettings({ id, title: 'Alerts', defaultColumns: [] })
      );

      expect(state.tableById[id].additionalFilters.showBuildingBlockAlerts).toBe(true);
    });

    test('it does not overwrite the threat indicator filter', () => {
      const stateWithThreatFilter = dataTableReducer(
        emptyState,
        updateShowThreatIndicatorAlertsFilter({ id, showOnlyThreatIndicatorAlerts: true })
      );

      const state = dataTableReducer(
        stateWithThreatFilter,
        updateShowBuildingBlockAlertsFilter({ id, showBuildingBlockAlerts: true })
      );

      expect(state.tableById[id].additionalFilters).toEqual({
        showBuildingBlockAlerts: true,
        showOnlyThreatIndicatorAlerts: true,
      });
    });
  });

  describe('updateShowThreatIndicatorAlertsFilter', () => {
    test('it sets the filter on a table that has not been initialized yet', () => {
      const state = dataTableReducer(
        emptyState,
        updateShowThreatIndicatorAlertsFilter({ id, showOnlyThreatIndicatorAlerts: true })
      );

      expect(state.tableById[id].additionalFilters).toEqual({
        showBuildingBlockAlerts: false,
        showOnlyThreatIndicatorAlerts: true,
      });
    });
  });
});
