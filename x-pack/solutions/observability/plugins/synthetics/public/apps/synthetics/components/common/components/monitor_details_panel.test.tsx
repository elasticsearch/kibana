/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { MonitorDetailsPanel, getScheduleFromTimespan } from './monitor_details_panel';
import type {
  EncryptedSyntheticsSavedMonitor,
  HeartbeatSyntheticsMonitor,
  Ping,
  RemoteSyntheticsMonitor,
} from '../../../../../../common/runtime_types';
import { MonitorTypeEnum } from '../../../../../../common/runtime_types';

jest.mock('react-redux-v7', () => ({
  useDispatch: () => jest.fn(),
}));

jest.mock('../../../../../hooks/use_kibana_space', () => ({
  useKibanaSpace: () => ({ space: { id: 'default' } }),
}));

jest.mock('../../../hooks', () => ({
  useGetUrlParams: () => ({ spaceId: undefined, remoteName: undefined }),
}));

jest.mock('../../../../../hooks/use_date_format', () => ({
  useDateFormat: () => (ts?: string) => ts ?? '',
}));

jest.mock('../../monitors_page/management/monitor_list_table/monitor_enabled', () => ({
  MonitorEnabled: () => <div data-test-subj="monitorEnabledStub" />,
}));

jest.mock('../../monitor_details/monitor_summary/locations_status', () => ({
  LocationsStatus: () => <div data-test-subj="locationsStatusStub" />,
}));

jest.mock('./monitor_assigned_agents', () => ({
  MonitorAssignedAgents: () => <div data-test-subj="monitorAssignedAgentsStub" />,
}));

jest.mock('@kbn/observability-shared-plugin/public', () => ({
  TagsList: ({ tags }: { tags: string[] }) => (
    <div data-test-subj="tagsListStub">{tags.join(',')}</div>
  ),
}));

jest.mock('./monitor_maintenance_windows', () => ({
  MonitorMaintenanceWindows: ({ monitorMWs }: { monitorMWs: string[] }) => (
    <div data-test-subj="maintenanceWindowsStub">{monitorMWs.join(',')}</div>
  ),
}));

const localMonitor = {
  config_id: 'config-1',
  id: 'config-1',
  name: 'Local monitor',
  type: MonitorTypeEnum.BROWSER,
  tags: ['env:prod'],
  enabled: true,
  schedule: { number: '5', unit: 'm' },
  locations: [{ id: 'us-east', label: 'US East' }],
  created_at: '2025-12-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  origin: 'ui',
  project_id: '',
  labels: {},
} as unknown as EncryptedSyntheticsSavedMonitor;

const remoteMonitor: RemoteSyntheticsMonitor = {
  config_id: 'config-1',
  id: 'config-1',
  name: 'Remote monitor',
  type: MonitorTypeEnum.BROWSER,
  tags: ['env:prod'],
  locations: [{ id: 'us-east', label: 'US East' }],
  remote: { remoteName: 'cluster-a' },
};

const heartbeatMonitor: HeartbeatSyntheticsMonitor = {
  config_id: 'config-1',
  id: 'config-1',
  name: 'Heartbeat monitor',
  type: MonitorTypeEnum.HTTP,
  tags: ['env:prod'],
  locations: [{ id: 'us-east', label: 'US East' }],
  origin: 'heartbeat',
};

const pingWithTimespan = {
  '@timestamp': '2026-01-01T00:00:00Z',
  monitor: {
    timespan: { gte: '2026-01-01T00:00:00Z', lt: '2026-01-01T00:01:00Z' },
  },
} as unknown as Ping;

describe('MonitorDetailsPanel', () => {
  it('renders SO-only sections (Enabled, Created, Last modified, Frequency) for a local monitor', () => {
    render(<MonitorDetailsPanel monitor={localMonitor} loading={false} configId="config-1" />);

    expect(screen.getByTestId('monitorEnabledStub')).toBeInTheDocument();
    expect(screen.getByText(/^Created$/i)).toBeInTheDocument();
    expect(screen.getByText(/Last modified/i)).toBeInTheDocument();
    expect(screen.getByText(/Frequency/i)).toBeInTheDocument();
  });

  it('hides SO-only sections for a remote monitor (no saved object on this cluster)', () => {
    render(<MonitorDetailsPanel monitor={remoteMonitor} loading={false} configId="config-1" />);

    expect(screen.queryByTestId('monitorEnabledStub')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Created$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Last modified/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Frequency/i)).not.toBeInTheDocument();
  });

  it('renders common sections (Monitor ID, Monitor type, Locations, Tags) for a remote monitor', () => {
    render(<MonitorDetailsPanel monitor={remoteMonitor} loading={false} configId="config-1" />);

    expect(screen.getByText('config-1')).toBeInTheDocument();
    expect(screen.getByTestId('locationsStatusStub')).toBeInTheDocument();
    expect(screen.getByTestId('tagsListStub')).toHaveTextContent('env:prod');
  });

  it('renders without crashing and hides SO-only sections for a heartbeat monitor', () => {
    render(<MonitorDetailsPanel monitor={heartbeatMonitor} loading={false} configId="config-1" />);

    expect(screen.queryByTestId('monitorEnabledStub')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Created$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Last modified/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('tagsListStub')).toHaveTextContent('env:prod');
  });

  it('renders the maintenance windows section when the monitor has attached windows', () => {
    render(
      <MonitorDetailsPanel
        monitor={
          {
            ...localMonitor,
            maintenance_windows: ['mw-1', 'mw-2'],
          } as EncryptedSyntheticsSavedMonitor
        }
        loading={false}
        configId="config-1"
      />
    );

    expect(screen.getByText(/Maintenance windows/i)).toBeInTheDocument();
    expect(screen.getByTestId('maintenanceWindowsStub')).toHaveTextContent('mw-1,mw-2');
  });

  it('hides the maintenance windows section when none are attached', () => {
    render(<MonitorDetailsPanel monitor={localMonitor} loading={false} configId="config-1" />);

    expect(screen.queryByText(/Maintenance windows/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('maintenanceWindowsStub')).not.toBeInTheDocument();
  });

  it('derives the frequency from the latest ping timespan for a heartbeat monitor', () => {
    render(
      <MonitorDetailsPanel
        monitor={heartbeatMonitor}
        latestPing={pingWithTimespan}
        loading={false}
        configId="config-1"
      />
    );

    expect(screen.getByText(/Frequency/i)).toBeInTheDocument();
    expect(screen.getByText(/Every 1 minute/i)).toBeInTheDocument();
  });
});

describe('getScheduleFromTimespan', () => {
  it('returns undefined when timespan is missing or malformed', () => {
    expect(getScheduleFromTimespan(undefined)).toBeUndefined();
    expect(
      getScheduleFromTimespan({ gte: '2026-01-01T00:00:00Z', lt: '2026-01-01T00:00:00Z' })
    ).toBeUndefined();
    expect(
      getScheduleFromTimespan({ gte: '2026-01-01T00:01:00Z', lt: '2026-01-01T00:00:00Z' })
    ).toBeUndefined();
  });

  it('derives whole-unit schedules from the span', () => {
    expect(
      getScheduleFromTimespan({ gte: '2026-01-01T00:00:00Z', lt: '2026-01-01T00:00:30Z' })
    ).toEqual({ number: '30', unit: 's' });
    expect(
      getScheduleFromTimespan({ gte: '2026-01-01T00:00:00Z', lt: '2026-01-01T00:03:00Z' })
    ).toEqual({ number: '3', unit: 'm' });
    expect(
      getScheduleFromTimespan({ gte: '2026-01-01T00:00:00Z', lt: '2026-01-01T01:00:00Z' })
    ).toEqual({ number: '1', unit: 'h' });
    expect(
      getScheduleFromTimespan({ gte: '2026-01-01T00:00:00Z', lt: '2026-01-02T00:00:00Z' })
    ).toEqual({ number: '1', unit: 'd' });
  });
});
