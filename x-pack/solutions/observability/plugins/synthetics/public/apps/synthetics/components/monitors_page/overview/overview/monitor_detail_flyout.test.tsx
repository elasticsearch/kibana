/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import * as reduxHooks from 'react-redux';
import { render } from '../../../../utils/testing/rtl_helpers';
import { fireEvent } from '@testing-library/react';
import { MonitorDetailFlyout } from './monitor_detail_flyout';
import * as observabilitySharedPublic from '@kbn/observability-shared-plugin/public';
import * as monitorDetail from '../../../../hooks/use_monitor_detail';
import * as statusByLocation from '../../../../hooks/use_status_by_location';
import * as monitorDetailLocator from '../../../../hooks/use_monitor_detail_locator';
import { TagsList } from '@kbn/observability-shared-plugin/public';
import { useFetcher, useEsSearch } from '@kbn/observability-shared-plugin/public';
import { OBSERVABILITY_MONITOR_ATTACHMENT_TYPE_ID } from '@kbn/observability-agent-builder-plugin/public';
import { getMonitorAction } from '../../../../state';

jest.mock('@kbn/observability-shared-plugin/public');

const TagsListMock = TagsList as jest.Mock;
TagsListMock.mockReturnValue(<div>Tags list</div>);

const useFetcherMock = useFetcher as jest.Mock;

useFetcherMock.mockReturnValue({
  data: { monitor: { tags: ['tag1', 'tag2'] } },
  status: 200,
  refetch: jest.fn(),
});

// `jest.mock('@kbn/observability-shared-plugin/public')` auto-mocks every export
// with `() => undefined`. The flyout renders `MonitorStatusPanel`, which now
// reaches `useExternalMonitor` via `useSelectedMonitor`; that hook destructures
// `useEsSearch(...)`, so the mock must return a non-undefined result.
const useEsSearchMock = useEsSearch as jest.Mock;

useEsSearchMock.mockReturnValue({
  data: undefined,
  loading: false,
  error: undefined,
});

describe('Monitor Detail Flyout', () => {
  beforeEach(() => {
    jest
      .spyOn(observabilitySharedPublic, 'useTheme')
      .mockReturnValue({ eui: { euiColorVis0: 'red', euiColorVis9: 'red' } } as any);
    jest.spyOn(monitorDetail, 'useMonitorDetail').mockReturnValue({
      data: {
        docId: 'docId',
        monitor: {
          name: 'test monitor',
          id: 'test-id',
          status: 'up',
          type: 'http',
          check_group: 'check-group',
          timespan: {
            gte: 'now-15m',
            lt: 'now',
          },
        },
        url: {
          full: 'https://www.elastic.co',
        },
        tags: ['tag1', 'tag2'],
        observer: {
          name: 'us-east-1',
          geo: {
            name: 'US East',
          },
        },
        '@timestamp': '2013-03-01 12:54:23',
      },
    });
    jest.spyOn(statusByLocation, 'useStatusByLocation').mockReturnValue({
      locations: [],
      loading: false,
    });
  });

  afterEach(() => jest.clearAllMocks());

  it('close prop is called for built-in flyout close', () => {
    const onCloseMock = jest.fn();
    const { getByLabelText } = render(
      <MonitorDetailFlyout
        configId="123456"
        id="test-id"
        location="US East"
        locationId="us-east"
        onClose={onCloseMock}
        onEnabledChange={jest.fn()}
        onLocationChange={jest.fn()}
      />
    );
    const closeButton = getByLabelText('Close this dialog');
    fireEvent.click(closeButton);
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it('renders error boundary for fetch failure', () => {
    const testErrorText = 'This is a test error';

    const { getByText } = render(
      <MonitorDetailFlyout
        configId="123456"
        id="test-id"
        location="US East"
        locationId="us-east"
        onClose={jest.fn()}
        onEnabledChange={jest.fn()}
        onLocationChange={jest.fn()}
      />,
      {
        state: {
          monitorDetails: {
            syntheticsMonitorError: { body: { message: 'This is a test error' } },
          },
        },
      }
    );
    getByText(testErrorText, { exact: false });
  });

  it('hides the fetch-error callout when overview heartbeat data is available (cross-space)', () => {
    const testErrorText = 'This is a test error';

    const { queryByText } = render(
      <MonitorDetailFlyout
        configId="cross-space-config-id"
        id="cross-space-id"
        location="US East"
        locationId="us-east"
        onClose={jest.fn()}
        onEnabledChange={jest.fn()}
        onLocationChange={jest.fn()}
      />,
      {
        state: {
          monitorDetails: {
            syntheticsMonitor: null,
            syntheticsMonitorLoading: false,
            syntheticsMonitorError: {
              body: { statusCode: 404, error: 'Not Found', message: testErrorText },
            },
          },
          overviewStatus: {
            status: {
              upConfigs: {
                'cross-space-config-id-us-east': {
                  monitorQueryId: 'cross-space-id',
                  configId: 'cross-space-config-id',
                  name: 'Cross-space monitor',
                  type: 'http',
                  schedule: '1',
                  tags: [],
                  isEnabled: true,
                  isStatusAlertEnabled: false,
                  overallStatus: 'up',
                  spaces: ['team-a'],
                  locations: [{ id: 'us-east', label: 'US East', status: 'up' }],
                },
              },
              downConfigs: {},
              pendingConfigs: {},
              disabledConfigs: {},
            },
          },
        },
      }
    );

    expect(queryByText(testErrorText, { exact: false })).toBeNull();
  });

  it('renders loading state while fetching', () => {
    const { getByRole, getByText } = render(
      <MonitorDetailFlyout
        configId="123456"
        id="test-id"
        location="US East"
        locationId="us-east"
        onClose={jest.fn()}
        onEnabledChange={jest.fn()}
        onLocationChange={jest.fn()}
      />,
      {
        state: {
          monitorDetails: {
            syntheticsMonitor: null,
            syntheticsMonitorLoading: true,
          },
        },
      }
    );

    expect(getByRole('dialog')).toBeInTheDocument();
    expect(getByText('Overview')).toBeInTheDocument();
    expect(getByText('Performance')).toBeInTheDocument();
    expect(getByText('Details')).toBeInTheDocument();
  });

  it('does not dispatch getMonitorAction before the active space resolves', () => {
    // Simulate `useKibanaSpace` (which is the only `useFetcher` consumer in
    // this component) still loading — `space` is undefined across renders.
    // Previously the flyout would dispatch `getMonitorAction.get` without
    // `spaceId`, hit the active space, and 404 for cross-space monitors.
    // The retry that fires once `space` resolves was then silently dropped
    // by the `takeLeading` saga while the first call was still in flight,
    // leaving the 404 in Redux state forever.
    const previousFetcherImpl = useFetcherMock.getMockImplementation();
    useFetcherMock.mockReturnValue({
      data: undefined,
      loading: true,
      refetch: jest.fn(),
    });

    const mockDispatch = jest.fn();
    jest.spyOn(reduxHooks, 'useDispatch').mockReturnValue(mockDispatch);

    try {
      render(
        <MonitorDetailFlyout
          configId="cross-space-monitor"
          id="cross-space-monitor"
          location="US East"
          locationId="us-east"
          spaces={['team-a']}
          onClose={jest.fn()}
          onEnabledChange={jest.fn()}
          onLocationChange={jest.fn()}
        />
      );

      const getMonitorCalls = mockDispatch.mock.calls.filter(
        ([action]) => action?.type === getMonitorAction.get.type
      );
      expect(getMonitorCalls).toHaveLength(0);
    } finally {
      if (previousFetcherImpl) {
        useFetcherMock.mockImplementation(previousFetcherImpl);
      }
    }
  });

  it('renders details for fetch success', () => {
    const detailLink = '/app/synthetics/monitor/test-id';
    jest.spyOn(monitorDetailLocator, 'useMonitorDetailLocator').mockReturnValue(detailLink);
    jest.spyOn(monitorDetailLocator, 'useMonitorDetailLocator').mockReturnValue(detailLink);

    const { getByRole, getByText } = render(
      <MonitorDetailFlyout
        configId="123456"
        id="test-id"
        location="US East"
        locationId="us-east"
        onClose={jest.fn()}
        onEnabledChange={jest.fn()}
        onLocationChange={jest.fn()}
      />,
      {
        state: {
          monitorDetails: {
            syntheticsMonitor: {
              enabled: true,
              type: 'http',
              name: 'test-monitor',
              schedule: {
                number: '1',
                unit: 'm',
              },
              tags: ['prod'],
              config_id: 'test-id',
            } as any,
          },
        },
      }
    );

    expect(
      getByRole('heading', {
        level: 2,
      })
    ).toHaveTextContent('test-monitor');
    expect(getByText('Last 24 hours'));
    expect(getByText('Overview'));
    expect(getByText('Performance'));
    expect(getByText('Details'));

    fireEvent.click(getByText('Details'));
    expect(getByText('Every 1 minute'));
    expect(getByText('test-id'));
  });

  describe('remote monitor flyout', () => {
    it('renders remote monitor details panel instead of infinite spinner', () => {
      const { getByText, queryByRole } = render(
        <MonitorDetailFlyout
          configId="remote-config-id"
          id="remote-monitor-id"
          location="europe-west3-a"
          locationId="europe-west3-a"
          onClose={jest.fn()}
          onEnabledChange={jest.fn()}
          onLocationChange={jest.fn()}
        />,
        {
          state: {
            monitorDetails: {
              syntheticsMonitor: null,
              syntheticsMonitorLoading: false,
            },
            overviewStatus: {
              status: {
                upConfigs: {
                  'remote-config-id-europe-west3-a': {
                    monitorQueryId: 'remote-monitor-id',
                    configId: 'remote-config-id',
                    name: 'Remote HTTPS Monitor',
                    type: 'http',
                    schedule: '10',
                    tags: ['production'],
                    isEnabled: true,
                    isStatusAlertEnabled: false,
                    overallStatus: 'up',
                    urls: 'https://medium.com/',
                    remote: {
                      remoteName: 'remote-cluster-1',
                      kibanaUrl: 'https://remote-kibana.example.com',
                    },
                    locations: [{ id: 'europe-west3-a', label: 'europe-west3-a', status: 'up' }],
                  },
                },
                downConfigs: {},
                pendingConfigs: {},
                disabledConfigs: {},
              },
            },
          },
        }
      );

      fireEvent.click(getByText('Details'));

      // Should show the remote monitor details, not a loading spinner
      expect(getByText('Monitor details')).toBeInTheDocument();
      expect(getByText('remote-config-id')).toBeInTheDocument();
      expect(getByText('Remote cluster')).toBeInTheDocument();
      expect(getByText('remote-cluster-1')).toBeInTheDocument();
      expect(queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('renders both "View on remote cluster" and a CCS-aware "Go to monitor" button', () => {
      const detailLinkSpy = jest
        .spyOn(monitorDetailLocator, 'useMonitorDetailLocator')
        .mockReturnValue(
          '/app/synthetics/monitor/remote-config-id?locationId=europe-west3-a&remoteName=remote-cluster-1'
        );

      const { getByText, queryByText } = render(
        <MonitorDetailFlyout
          configId="remote-config-id"
          id="remote-monitor-id"
          location="europe-west3-a"
          locationId="europe-west3-a"
          onClose={jest.fn()}
          onEnabledChange={jest.fn()}
          onLocationChange={jest.fn()}
        />,
        {
          state: {
            monitorDetails: {
              syntheticsMonitor: null,
            },
            overviewStatus: {
              status: {
                upConfigs: {
                  'remote-config-id-europe-west3-a': {
                    monitorQueryId: 'remote-monitor-id',
                    configId: 'remote-config-id',
                    name: 'Remote HTTPS Monitor',
                    type: 'http',
                    schedule: '10',
                    tags: [],
                    isEnabled: true,
                    isStatusAlertEnabled: false,
                    overallStatus: 'up',
                    remote: {
                      remoteName: 'remote-cluster-1',
                      kibanaUrl: 'https://remote-kibana.example.com',
                    },
                    locations: [{ id: 'europe-west3-a', label: 'europe-west3-a', status: 'up' }],
                  },
                },
                downConfigs: {},
                pendingConfigs: {},
                disabledConfigs: {},
              },
            },
          },
        }
      );

      expect(getByText('View on remote cluster')).toBeInTheDocument();
      // The local monitor detail page is now CCS-aware, so the "Go to monitor"
      // button is shown for remote monitors and links to the local detail page
      // with the `remoteName` URL param.
      expect(getByText('Go to monitor')).toBeInTheDocument();
      expect(detailLinkSpy).toHaveBeenCalledWith(
        expect.objectContaining({ remoteName: 'remote-cluster-1' })
      );
      // Editing is still not supported for remote monitors.
      expect(queryByText('Edit monitor')).not.toBeInTheDocument();
    });

    it('enables "View on remote cluster" using the latest ping kibanaUrl when overview metadata lacks it', () => {
      // Overview-status metadata can omit `remote.kibanaUrl` (the `top_metrics`
      // aggregation drops `text`-mapped fields), so the deep link must fall back
      // to the `kibanaUrl` read straight from the latest ping's `_source`.
      jest.spyOn(monitorDetail, 'useMonitorDetail').mockReturnValue({
        data: {
          docId: 'docId',
          kibanaUrl: 'https://ping-kibana.example.com',
          monitor: {
            name: 'Remote HTTPS Monitor',
            id: 'remote-monitor-id',
            status: 'up',
            type: 'http',
          },
          '@timestamp': '2013-03-01 12:54:23',
        } as any,
      });

      const { getByTestId } = render(
        <MonitorDetailFlyout
          configId="remote-config-id"
          id="remote-monitor-id"
          location="europe-west3-a"
          locationId="europe-west3-a"
          onClose={jest.fn()}
          onEnabledChange={jest.fn()}
          onLocationChange={jest.fn()}
        />,
        {
          state: {
            monitorDetails: {
              syntheticsMonitor: null,
            },
            overviewStatus: {
              status: {
                upConfigs: {
                  'remote-config-id-europe-west3-a': {
                    monitorQueryId: 'remote-monitor-id',
                    configId: 'remote-config-id',
                    name: 'Remote HTTPS Monitor',
                    type: 'http',
                    schedule: '10',
                    tags: [],
                    isEnabled: true,
                    isStatusAlertEnabled: false,
                    overallStatus: 'up',
                    // Note: no `kibanaUrl` on the overview metadata.
                    remote: {
                      remoteName: 'remote-cluster-1',
                    },
                    locations: [{ id: 'europe-west3-a', label: 'europe-west3-a', status: 'up' }],
                  },
                },
                downConfigs: {},
                pendingConfigs: {},
                disabledConfigs: {},
              },
            },
          },
        }
      );

      const viewRemoteButton = getByTestId('syntheticsMonitorDetailFlyoutViewRemoteButton');
      expect(viewRemoteButton.getAttribute('href')).toContain('https://ping-kibana.example.com');
    });
  });

  describe('heartbeat monitor flyout', () => {
    const heartbeatState = {
      monitorDetails: {
        syntheticsMonitor: null,
        syntheticsMonitorLoading: false,
        // A leftover 404 from a previous local SO fetch must not surface for
        // read-only heartbeat monitors.
        syntheticsMonitorError: {
          body: {
            statusCode: 404,
            error: 'Not Found',
            message: 'Monitor id hb-config-id not found!',
          },
        },
      },
      overviewStatus: {
        status: {
          upConfigs: {},
          downConfigs: {},
          pendingConfigs: {},
          // Heartbeat / autodiscovered monitors commonly land in the stale
          // bucket; the flyout must still resolve them from there.
          staleConfigs: {
            'heartbeat-hb-config-id-us-east': {
              monitorQueryId: 'hb-config-id',
              configId: 'hb-config-id',
              name: 'Autodiscovered monitor',
              type: 'http',
              schedule: '1',
              tags: [],
              isEnabled: true,
              isStatusAlertEnabled: false,
              overallStatus: 'stale',
              origin: 'heartbeat' as const,
              locations: [{ id: 'us-east', label: 'US East', status: 'up' }],
            },
          },
          disabledConfigs: {},
        },
      },
    };

    it('resolves a stale heartbeat monitor and renders it read-only (no Edit, no 404 callout)', () => {
      jest
        .spyOn(monitorDetailLocator, 'useMonitorDetailLocator')
        .mockReturnValue('/app/synthetics/monitor/hb-config-id?locationId=us-east');

      const { getByText, queryByText } = render(
        <MonitorDetailFlyout
          configId="hb-config-id"
          id="hb-config-id"
          location="US East"
          locationId="us-east"
          onClose={jest.fn()}
          onEnabledChange={jest.fn()}
          onLocationChange={jest.fn()}
        />,
        { state: heartbeatState }
      );

      // The read-only detail link is offered, but editing is not.
      expect(getByText('Go to monitor')).toBeInTheDocument();
      expect(queryByText('Edit monitor')).not.toBeInTheDocument();
      // Remote-only affordances must not appear for heartbeat monitors.
      expect(queryByText('View on remote cluster')).not.toBeInTheDocument();
      // The stale 404 must be suppressed since this monitor is read-only.
      expect(queryByText('not found', { exact: false })).toBeNull();
    });

    it('does not dispatch the local saved-object fetch for heartbeat monitors', () => {
      const mockDispatch = jest.fn();
      jest.spyOn(reduxHooks, 'useDispatch').mockReturnValue(mockDispatch);

      render(
        <MonitorDetailFlyout
          configId="hb-config-id"
          id="hb-config-id"
          location="US East"
          locationId="us-east"
          onClose={jest.fn()}
          onEnabledChange={jest.fn()}
          onLocationChange={jest.fn()}
        />,
        { state: heartbeatState }
      );

      const getMonitorCalls = mockDispatch.mock.calls.filter(
        ([action]) => action?.type === getMonitorAction.get.type
      );
      expect(getMonitorCalls).toHaveLength(0);
    });
  });

  describe('agent builder attachment', () => {
    const mockSetChatConfig = jest.fn();
    const mockClearChatConfig = jest.fn();
    const mockAgentBuilder = {
      setChatConfig: mockSetChatConfig,
      clearChatConfig: mockClearChatConfig,
    };

    const monitorState = {
      monitorDetails: {
        syntheticsMonitor: {
          enabled: true,
          type: 'http',
          name: 'test-monitor',
          schedule: { number: '1', unit: 'm' },
          tags: ['prod'],
          config_id: 'test-config-id',
        } as any,
      },
    };

    it('configures attachment when agentBuilder is available and monitor is loaded', () => {
      render(
        <MonitorDetailFlyout
          configId="test-config-id"
          id="test-id"
          location="US East"
          locationId="us-east"
          onClose={jest.fn()}
          onEnabledChange={jest.fn()}
          onLocationChange={jest.fn()}
        />,
        {
          state: monitorState,
          core: { agentBuilder: mockAgentBuilder } as any,
        }
      );

      expect(mockSetChatConfig).toHaveBeenCalledWith({
        attachments: [
          {
            type: OBSERVABILITY_MONITOR_ATTACHMENT_TYPE_ID,
            data: {
              attachmentLabel: 'test-monitor monitor',
              configId: 'test-config-id',
              monitorName: 'test-monitor',
              monitorType: 'http',
            },
          },
        ],
      });
    });

    it('does not configure attachment when agentBuilder is not available', () => {
      render(
        <MonitorDetailFlyout
          configId="test-config-id"
          id="test-id"
          location="US East"
          locationId="us-east"
          onClose={jest.fn()}
          onEnabledChange={jest.fn()}
          onLocationChange={jest.fn()}
        />,
        {
          state: monitorState,
        }
      );

      expect(mockSetChatConfig).not.toHaveBeenCalled();
    });

    it('clears attachment config on unmount', () => {
      const { unmount } = render(
        <MonitorDetailFlyout
          configId="test-config-id"
          id="test-id"
          location="US East"
          locationId="us-east"
          onClose={jest.fn()}
          onEnabledChange={jest.fn()}
          onLocationChange={jest.fn()}
        />,
        {
          state: monitorState,
          core: { agentBuilder: mockAgentBuilder } as any,
        }
      );

      expect(mockSetChatConfig).toHaveBeenCalledTimes(1);

      unmount();

      expect(mockClearChatConfig).toHaveBeenCalledTimes(1);
    });
  });
});
