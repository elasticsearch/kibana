/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { TimelineNonEcsData } from '@kbn/timelines-plugin/common';
import { TestProviders } from '../../../mock';
import type { StatefulAlertBulkActionsProps } from './alert_bulk_actions';
import { AlertBulkActionsComponent } from './alert_bulk_actions';
import { TableId } from '@kbn/securitysolution-data-table';
import { clearSelected } from '@kbn/securitysolution-data-table/store/data_table/actions';
import { render, screen, fireEvent } from '@testing-library/react';
import { useAlertsPrivileges } from '../../../../detections/containers/detection_engine/alerts/use_alerts_privileges';

jest.mock('../../../../detections/containers/detection_engine/alerts/use_alerts_privileges');

const mockSelectedEventIds: Record<string, TimelineNonEcsData[]> = {
  nvowrrn: [{ field: 'nvowrrn' }],
};

function renderAlertBulkActions(props?: Partial<StatefulAlertBulkActionsProps>) {
  return render(
    <TestProviders>
      <AlertBulkActionsComponent
        isSelectAllChecked={false}
        id={TableId.alertsOnAlertsPage}
        selectedEventIds={mockSelectedEventIds}
        totalItems={10}
        data={[]}
        clearSelected={clearSelected}
        {...props}
      />
    </TestProviders>
  );
}

describe('AlertBulkActionsComponent', () => {
  beforeEach(() => {
    (useAlertsPrivileges as jest.Mock).mockReturnValue({ hasAlertsUpdate: true });
  });

  it('it renders', async () => {
    const { getByTestId } = renderAlertBulkActions();
    expect(getByTestId('bulk-actions-button-container')).toBeInTheDocument();
  });

  describe('after clicking the bulk actions button', () => {
    beforeEach(() => {
      const { container } = renderAlertBulkActions();
      const bulkActionsButton = container.querySelector(
        'button[data-test-subj="selectedShowBulkActionsButton"]'
      )!;

      fireEvent.click(bulkActionsButton);
    });

    it('"Mark as open" should be visible', () => {
      expect(screen.getByTestId('open-alert-status')).toBeInTheDocument();
    });
    it('"Mark as acknowledged" should be visible', () => {
      expect(screen.getByTestId('acknowledged-alert-status')).toBeInTheDocument();
    });
    it('"Mark as closed" should be visible', () => {
      expect(screen.getByTestId('alert-close-context-menu-item')).toBeInTheDocument();
    });
  });
});
