/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiFlexGroup, EuiFlexItem } from '@elastic/eui';

import React from 'react';
import { ShowAllSpaces } from '../../common/show_all_spaces';
import type { BulkEditAction } from './bulk_operations';
import { BulkOperations } from './bulk_operations';
import type { EncryptedSyntheticsSavedMonitor } from '../../../../../../../common/runtime_types';

export const MonitorListHeader = ({
  selectedItems,
  recordRangeLabel,
  setMonitorPendingDeletion,
  setMonitorPendingReset,
  setMonitorPendingStatusUpdate,
  setBulkEditAction,
  setIsLocationsFlyoutOpen,
  setIsScheduleFlyoutOpen,
  setIsMaintenanceWindowsFlyoutOpen,
  columnSelector,
}: {
  recordRangeLabel: JSX.Element;
  selectedItems: EncryptedSyntheticsSavedMonitor[];
  setMonitorPendingDeletion: (val: string[]) => void;
  setMonitorPendingReset: (val: {
    resetIds: string[];
    skippedMonitors: Array<{ id: string; name: string }>;
  }) => void;
  setMonitorPendingStatusUpdate: (val: { ids: string[]; enabled: boolean } | null) => void;
  setBulkEditAction: (action: BulkEditAction) => void;
  setIsLocationsFlyoutOpen: (val: boolean) => void;
  setIsScheduleFlyoutOpen: (val: boolean) => void;
  setIsMaintenanceWindowsFlyoutOpen: (val: boolean) => void;
  columnSelector: React.ReactNode;
}) => {
  return (
    <EuiFlexGroup alignItems="center">
      <EuiFlexItem grow={true}>
        <span>{recordRangeLabel}</span>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <BulkOperations
          selectedItems={selectedItems}
          setMonitorPendingDeletion={setMonitorPendingDeletion}
          setMonitorPendingReset={setMonitorPendingReset}
          setMonitorPendingStatusUpdate={setMonitorPendingStatusUpdate}
          setBulkEditAction={setBulkEditAction}
          setIsLocationsFlyoutOpen={setIsLocationsFlyoutOpen}
          setIsScheduleFlyoutOpen={setIsScheduleFlyoutOpen}
          setIsMaintenanceWindowsFlyoutOpen={setIsMaintenanceWindowsFlyoutOpen}
        />
      </EuiFlexItem>
      <EuiFlexItem grow={false} data-test-subj="syntheticsMonitorListColumnSelector">
        {columnSelector}
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <ShowAllSpaces />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
