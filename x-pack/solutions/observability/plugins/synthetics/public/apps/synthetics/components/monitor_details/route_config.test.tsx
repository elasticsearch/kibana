/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { renderHook } from '@testing-library/react';
import { getMonitorDetailsRoute } from './route_config';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useRouteMatch: () => ({ params: { monitorId: 'm-1' } }),
}));

const mockUrlParams = jest.fn();
jest.mock('../../hooks', () => ({
  useGetUrlParams: () => mockUrlParams(),
}));

const mockSelectedMonitor = jest.fn();
jest.mock('./hooks/use_selected_monitor', () => ({
  useSelectedMonitor: () => mockSelectedMonitor(),
}));

jest.mock('./monitor_alerts/alerts_icon', () => ({
  MonitorAlertsIcon: () => <span data-test-subj="mock-alerts-icon" />,
}));

jest.mock('./monitor_errors/errors_icon', () => ({
  MonitorErrorsIcon: () => <span data-test-subj="mock-errors-icon" />,
}));

const makeHistory = () =>
  ({
    location: { search: '' },
  } as any);

describe('getMonitorDetailsRoute - Alerts tab', () => {
  beforeEach(() => {
    mockUrlParams.mockReturnValue({});
    mockSelectedMonitor.mockReturnValue({ monitor: null });
  });

  afterEach(() => jest.clearAllMocks());

  const getAlertsTab = () => {
    const { result } = renderHook(() => getMonitorDetailsRoute(makeHistory(), '', 'Kibana'));
    const alertsRoute = result.current.find((r) =>
      String(r.dataTestSubj).startsWith('syntheticsMonitorAlertsPage')
    );
    const tabs = alertsRoute?.pageHeader?.tabs ?? [];
    return tabs.find((t: any) => t['data-test-subj'] === 'syntheticsMonitorAlertsTab') as any;
  };

  it('renders the Alerts tab as enabled with the badge for local monitors', () => {
    const alertsTab = getAlertsTab();

    expect(alertsTab.disabled).toBeFalsy();
    expect(alertsTab.label).toBe('Alerts');
    expect(alertsTab.href).toContain('/alerts');
    expect(alertsTab.prepend).not.toBeUndefined();
  });

  it('disables the Alerts tab, drops the badge, and shows a tooltip for remote monitors', () => {
    mockUrlParams.mockReturnValue({ remoteName: 'remote-a' });

    const alertsTab = getAlertsTab();

    expect(alertsTab.disabled).toBe(true);
    expect(alertsTab.href).toBeUndefined();
    expect(alertsTab.prepend).toBeUndefined();
    expect(alertsTab.label).not.toBe('Alerts');
  });

  it('disables the Alerts tab for heartbeat monitors (no remoteName, detected from monitor shape)', () => {
    mockSelectedMonitor.mockReturnValue({ monitor: { origin: 'heartbeat' } });

    const alertsTab = getAlertsTab();

    expect(alertsTab.disabled).toBe(true);
    expect(alertsTab.href).toBeUndefined();
    expect(alertsTab.prepend).toBeUndefined();
    expect(alertsTab.label).not.toBe('Alerts');
  });
});
