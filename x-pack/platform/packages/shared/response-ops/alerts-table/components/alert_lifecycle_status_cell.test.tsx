/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Alert } from '@kbn/alerting-types';
import { AlertLifecycleStatusCell } from './alert_lifecycle_status_cell';
import type { CellComponentProps } from '../types';
import { getCasesMapMock } from '../mocks/cases.mock';
import { getMaintenanceWindowsMapMock } from '../mocks/maintenance_windows.mock';
import { useAlertSnoozedState } from '../hooks/use_alert_snoozed_state';
import { useAlertMutedState } from '../hooks/use_alert_muted_state';

jest.mock('../hooks/use_alert_snoozed_state');
jest.mock('../hooks/use_alert_muted_state');

const mockUseAlertSnoozedState = useAlertSnoozedState as jest.MockedFunction<
  typeof useAlertSnoozedState
>;
const mockUseAlertMutedState = useAlertMutedState as jest.MockedFunction<typeof useAlertMutedState>;

describe('AlertLifecycleStatusCell', () => {
  const casesMap = getCasesMapMock();
  const maintenanceWindowsMap = getMaintenanceWindowsMapMock();
  const alert: Alert = {
    _id: 'alert-id',
    _index: 'alert-index',
    'kibana.alert.status': ['active'],
  };

  const props = {
    isLoading: false,
    alert,
    cases: casesMap,
    maintenanceWindows: maintenanceWindowsMap,
    columnId: 'kibana.alert.status',
    showAlertStatusWithFlapping: true,
    // Assertion used to avoid defining all the (numerous) context properties
  } as CellComponentProps;

  beforeEach(() => {
    mockUseAlertSnoozedState.mockReturnValue({
      isSnoozed: false,
      expiresAt: undefined,
      snoozedInstance: undefined,
      ruleId: 'rule-id',
      alertInstanceId: 'instance-id',
    });
    mockUseAlertMutedState.mockReturnValue({
      isMuted: false,
      ruleId: 'rule-id',
      rule: [],
      alertInstanceId: 'instance-id',
    });
  });

  it('shows the status', async () => {
    render(<AlertLifecycleStatusCell {...props} />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('does not shows the status if showAlertStatusWithFlapping=false', async () => {
    render(<AlertLifecycleStatusCell {...props} showAlertStatusWithFlapping={false} />);
    expect(screen.queryByText('Active')).not.toBeInTheDocument();
  });

  it('shows the status with flapping', async () => {
    render(
      <AlertLifecycleStatusCell
        {...props}
        alert={{ ...alert, 'kibana.alert.flapping': ['true'] }}
      />
    );
    expect(screen.getByText('Flapping')).toBeInTheDocument();
  });

  it('shows the status with multiple values', async () => {
    render(
      <AlertLifecycleStatusCell
        {...props}
        alert={{ ...alert, 'kibana.alert.status': ['active', 'recovered'] }}
      />
    );

    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows the default cell if the status is empty', async () => {
    render(<AlertLifecycleStatusCell {...props} alert={{ ...alert, 'kibana.alert.status': [] }} />);

    expect(screen.getByText('--')).toBeInTheDocument();
  });
});

// Additional tests for acknowledged badge
describe('AlertLifecycleStatusCell - acknowledged badge', () => {
  const casesMap = getCasesMapMock();
  const maintenanceWindowsMap = getMaintenanceWindowsMapMock();
  const alert: Alert = {
    _id: 'alert-id',
    _index: 'alert-index',
    'kibana.alert.status': ['active'],
  };

  const props = {
    isLoading: false,
    alert,
    cases: casesMap,
    maintenanceWindows: maintenanceWindowsMap,
    columnId: 'kibana.alert.status',
    showAlertStatusWithFlapping: true,
  } as CellComponentProps;

  beforeEach(() => {
    mockUseAlertSnoozedState.mockReturnValue({
      isSnoozed: false,
      expiresAt: undefined,
      snoozedInstance: undefined,
      ruleId: 'rule-id',
      alertInstanceId: 'instance-id',
    });
    mockUseAlertMutedState.mockReturnValue({
      isMuted: false,
      ruleId: 'rule-id',
      rule: [],
      alertInstanceId: 'instance-id',
    });
  });

  it('shows the acknowledged badge when workflow status is acknowledged', () => {
    render(
      <AlertLifecycleStatusCell
        {...props}
        alert={{ ...alert, 'kibana.alert.workflow_status': ['acknowledged'] }}
      />
    );
    expect(screen.getByTestId('alertAcknowledgedBadge')).toBeInTheDocument();
  });

  it('does not show the acknowledged badge when workflow status is open', () => {
    render(
      <AlertLifecycleStatusCell
        {...props}
        alert={{ ...alert, 'kibana.alert.workflow_status': ['open'] }}
      />
    );
    expect(screen.queryByTestId('alertAcknowledgedBadge')).not.toBeInTheDocument();
  });

  it('does not show the acknowledged badge when workflow status is not set', () => {
    render(<AlertLifecycleStatusCell {...props} />);
    expect(screen.queryByTestId('alertAcknowledgedBadge')).not.toBeInTheDocument();
  });
});

describe('AlertLifecycleStatusCell - snooze badge tooltip', () => {
  const casesMap = getCasesMapMock();
  const maintenanceWindowsMap = getMaintenanceWindowsMapMock();
  const alert: Alert = {
    _id: 'alert-id',
    _index: 'alert-index',
    'kibana.alert.status': ['active'],
    'kibana.alert.rule.uuid': ['rule-1'],
    'kibana.alert.instance.id': ['instance-1'],
  };

  const props = {
    isLoading: false,
    alert,
    cases: casesMap,
    maintenanceWindows: maintenanceWindowsMap,
    columnId: 'kibana.alert.status',
    showAlertStatusWithFlapping: true,
  } as CellComponentProps;

  const EXPIRES_AT = '2026-06-10T12:00:00.000Z';

  beforeEach(() => {
    mockUseAlertMutedState.mockReturnValue({
      isMuted: false,
      ruleId: 'rule-1',
      rule: [],
      alertInstanceId: 'instance-1',
    });
  });

  it('shows indefinitely message when muted (no expiry, no conditions)', async () => {
    mockUseAlertMutedState.mockReturnValue({
      isMuted: true,
      ruleId: 'rule-1',
      rule: ['instance-1'],
      alertInstanceId: 'instance-1',
    });
    mockUseAlertSnoozedState.mockReturnValue({
      isSnoozed: false,
      expiresAt: undefined,
      snoozedInstance: undefined,
      ruleId: 'rule-1',
      alertInstanceId: 'instance-1',
    });

    render(<AlertLifecycleStatusCell {...props} />);
    await userEvent.hover(screen.getByTestId('alertSnoozedBadge'));
    expect(
      await screen.findByText('Alert will be snoozed indefinitely or until manual unsnooze.')
    ).toBeInTheDocument();
  });

  it('shows "will unsnooze on {date}" when snoozed with a date and no conditions', async () => {
    mockUseAlertSnoozedState.mockReturnValue({
      isSnoozed: true,
      expiresAt: EXPIRES_AT,
      snoozedInstance: {
        instanceId: 'instance-1',
        expiresAt: EXPIRES_AT,
        snoozedAt: '2026-06-01T00:00:00.000Z',
        snoozedBy: 'user1',
      },
      ruleId: 'rule-1',
      alertInstanceId: 'instance-1',
    });

    render(<AlertLifecycleStatusCell {...props} />);
    await userEvent.hover(screen.getByTestId('alertSnoozedBadge'));
    expect(await screen.findByText(/Alert will unsnooze on Jun 10, 2026/)).toBeInTheDocument();
  });

  it('shows conditions OR date when snoozed with a date and conditions using "any" operator', async () => {
    mockUseAlertSnoozedState.mockReturnValue({
      isSnoozed: true,
      expiresAt: EXPIRES_AT,
      snoozedInstance: {
        instanceId: 'instance-1',
        expiresAt: EXPIRES_AT,
        snoozedAt: '2026-06-01T00:00:00.000Z',
        snoozedBy: 'user1',
        conditions: [{ type: 'field_change', field: 'host.name' }, { type: 'severity_change' }],
        conditionOperator: 'any',
      },
      ruleId: 'rule-1',
      alertInstanceId: 'instance-1',
    });

    render(<AlertLifecycleStatusCell {...props} />);
    await userEvent.hover(screen.getByTestId('alertSnoozedBadge'));
    expect(
      await screen.findByText(
        /Alert will unsnooze if field "host\.name" is changed or severity is changed, OR on Jun 10, 2026/
      )
    ).toBeInTheDocument();
  });

  it('shows conditions OR date when snoozed with a date and conditions using "all" operator', async () => {
    mockUseAlertSnoozedState.mockReturnValue({
      isSnoozed: true,
      expiresAt: EXPIRES_AT,
      snoozedInstance: {
        instanceId: 'instance-1',
        expiresAt: EXPIRES_AT,
        snoozedAt: '2026-06-01T00:00:00.000Z',
        snoozedBy: 'user1',
        conditions: [{ type: 'severity_equals', value: 'critical' }],
        conditionOperator: 'all',
      },
      ruleId: 'rule-1',
      alertInstanceId: 'instance-1',
    });

    render(<AlertLifecycleStatusCell {...props} />);
    await userEvent.hover(screen.getByTestId('alertSnoozedBadge'));
    expect(
      await screen.findByText(/Alert will unsnooze if severity equals critical, OR on Jun 10, 2026/)
    ).toBeInTheDocument();
  });

  it('shows "will unsnooze if conditions" when expiresAt is null but conditions exist', async () => {
    mockUseAlertSnoozedState.mockReturnValue({
      isSnoozed: true,
      expiresAt: null as unknown as undefined,
      snoozedInstance: {
        instanceId: 'instance-1',
        expiresAt: null as unknown as string,
        snoozedAt: '2026-06-01T00:00:00.000Z',
        snoozedBy: 'user1',
        conditions: [{ type: 'severity_change' }],
        conditionOperator: 'any',
      },
      ruleId: 'rule-1',
      alertInstanceId: 'instance-1',
    });

    render(<AlertLifecycleStatusCell {...props} />);
    await userEvent.hover(screen.getByTestId('alertSnoozedBadge'));
    expect(
      await screen.findByText('Alert will unsnooze if severity is changed.')
    ).toBeInTheDocument();
  });

  it('shows "will unsnooze if conditions" when no expiry but conditions exist', async () => {
    mockUseAlertSnoozedState.mockReturnValue({
      isSnoozed: true,
      expiresAt: undefined,
      snoozedInstance: {
        instanceId: 'instance-1',
        snoozedAt: '2026-06-01T00:00:00.000Z',
        snoozedBy: 'user1',
        conditions: [{ type: 'field_change', field: 'host.name' }],
        conditionOperator: 'any',
      },
      ruleId: 'rule-1',
      alertInstanceId: 'instance-1',
    });

    render(<AlertLifecycleStatusCell {...props} />);
    await userEvent.hover(screen.getByTestId('alertSnoozedBadge'));
    expect(
      await screen.findByText('Alert will unsnooze if field "host.name" is changed.')
    ).toBeInTheDocument();
  });
});
