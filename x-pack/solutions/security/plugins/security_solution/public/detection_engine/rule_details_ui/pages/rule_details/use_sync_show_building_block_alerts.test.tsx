/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { dataTableActions, TableId } from '@kbn/securitysolution-data-table';
import { createMockStore, mockGlobalState, TestProviders } from '../../../../common/mock';
import type { State } from '../../../../common/store/types';
import { useSyncShowBuildingBlockAlerts } from './use_sync_show_building_block_alerts';

const buildingBlockFilterAction = (showBuildingBlockAlerts: boolean) =>
  dataTableActions.updateShowBuildingBlockAlertsFilter({
    id: TableId.alertsOnRuleDetailsPage,
    showBuildingBlockAlerts,
  });

const stateWithRuleDetailsTable = ({
  showBuildingBlockAlerts = false,
}: {
  showBuildingBlockAlerts?: boolean;
} = {}): State => ({
  ...mockGlobalState,
  dataTable: {
    ...mockGlobalState.dataTable,
    tableById: {
      ...mockGlobalState.dataTable.tableById,
      [TableId.alertsOnRuleDetailsPage]: {
        ...mockGlobalState.dataTable.tableById[TableId.test],
        id: TableId.alertsOnRuleDetailsPage,
        additionalFilters: {
          showBuildingBlockAlerts,
          showOnlyThreatIndicatorAlerts: false,
        },
      },
    },
  },
});

const renderUseSyncShowBuildingBlockAlerts = (
  isBuildingBlockRule: boolean,
  store = createMockStore()
) => {
  const dispatchSpy = jest.spyOn(store, 'dispatch');

  renderHook(() => useSyncShowBuildingBlockAlerts(isBuildingBlockRule), {
    wrapper: ({ children }) => <TestProviders store={store}>{children}</TestProviders>,
  });

  return { dispatchSpy, store };
};

describe('useSyncShowBuildingBlockAlerts', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not dispatch when the rule-details table is missing', () => {
    const { dispatchSpy } = renderUseSyncShowBuildingBlockAlerts(true);

    expect(dispatchSpy).not.toHaveBeenCalledWith(buildingBlockFilterAction(true));
    expect(dispatchSpy).not.toHaveBeenCalledWith(buildingBlockFilterAction(false));
  });

  it('dispatches once the rule-details table exists and the value differs', () => {
    const { dispatchSpy } = renderUseSyncShowBuildingBlockAlerts(
      true,
      createMockStore(stateWithRuleDetailsTable())
    );

    expect(dispatchSpy).toHaveBeenCalledWith(buildingBlockFilterAction(true));
  });

  it('does not dispatch when the table exists and the value is already correct', () => {
    const { dispatchSpy } = renderUseSyncShowBuildingBlockAlerts(
      true,
      createMockStore(stateWithRuleDetailsTable({ showBuildingBlockAlerts: true }))
    );

    expect(dispatchSpy).not.toHaveBeenCalledWith(buildingBlockFilterAction(true));
  });

  it('dispatches after the table is initialized', () => {
    const { dispatchSpy, store } = renderUseSyncShowBuildingBlockAlerts(true);

    expect(dispatchSpy).not.toHaveBeenCalledWith(buildingBlockFilterAction(true));

    act(() => {
      store.dispatch(
        dataTableActions.initializeDataTableSettings({
          id: TableId.alertsOnRuleDetailsPage,
        })
      );
    });

    expect(dispatchSpy).toHaveBeenCalledWith(buildingBlockFilterAction(true));
    expect(
      store.getState().dataTable.tableById[TableId.alertsOnRuleDetailsPage].additionalFilters
        .showBuildingBlockAlerts
    ).toBe(true);
  });

  it('clears the building-block filter when the table exists for a non-building-block rule', () => {
    const { dispatchSpy } = renderUseSyncShowBuildingBlockAlerts(
      false,
      createMockStore(stateWithRuleDetailsTable({ showBuildingBlockAlerts: true }))
    );

    expect(dispatchSpy).toHaveBeenCalledWith(buildingBlockFilterAction(false));
  });
});
