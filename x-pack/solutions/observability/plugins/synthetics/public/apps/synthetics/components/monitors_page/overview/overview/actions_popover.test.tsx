/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent } from '@testing-library/react';
import { render } from '../../../../utils/testing/rtl_helpers';
import { ActionsPopover } from './actions_popover';
import * as editMonitorLocatorModule from '../../../../hooks/use_edit_monitor_locator';
import * as monitorDetailLocatorModule from '../../../../hooks/use_monitor_detail_locator';
import * as monitorEnableHandlerModule from '../../../../hooks/use_monitor_enable_handler';
import * as enablementHook from '../../../../hooks/use_enablement';
import { FETCH_STATUS } from '@kbn/observability-shared-plugin/public';
import type { OverviewStatusMetaData } from '../types';

describe('ActionsPopover', () => {
  let testMonitor: OverviewStatusMetaData;

  beforeEach(() => {
    jest.spyOn(enablementHook, 'useEnablement').mockReturnValue({
      isServiceAllowed: true,
      areApiKeysEnabled: true,
      canManageApiKeys: true,
      canEnable: true,
      isEnabled: true,
      invalidApiKeyError: false,
      loading: false,
      error: null,
    });

    testMonitor = {
      locations: [{ id: 'us_central' }],
      isEnabled: true,
      isStatusAlertEnabled: true,
      name: 'Monitor 1',
      configId: '1lkjelre',
      type: 'browser',
      tags: [],
      schedule: '120',
      monitorQueryId: '123',
      status: 'up',
    } as any;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the popover button', () => {
    const { queryByText, getByLabelText } = render(
      <ActionsPopover
        position="relative"
        isPopoverOpen={false}
        setIsPopoverOpen={jest.fn()}
        monitor={testMonitor}
        locationId={testMonitor.locations[0].id}
      />
    );
    expect(getByLabelText('Open actions menu'));
    expect(queryByText('Actions')).not.toBeInTheDocument();
  });

  it('opens the popover on click', async () => {
    const setIsPopoverOpen = jest.fn();
    const isPopoverOpen = false;
    const { getByLabelText } = render(
      <ActionsPopover
        position="relative"
        isPopoverOpen={isPopoverOpen}
        setIsPopoverOpen={setIsPopoverOpen}
        monitor={testMonitor}
        locationId={testMonitor.locations[0].id}
      />
    );
    const popoverButton = getByLabelText('Open actions menu');
    fireEvent.click(popoverButton);
    expect(setIsPopoverOpen).toHaveBeenCalled();
    // the popover passes back a function that accepts a bool and returns the inverse,
    // so we're calling it here just to make sure the behavior is correct
    expect(setIsPopoverOpen.mock.calls[0][0](isPopoverOpen)).toBe(true);
  });

  it('closes the popover on subsequent click', async () => {
    const setIsPopoverOpen = jest.fn();
    const isPopoverOpen = true;
    const { getByLabelText } = render(
      <ActionsPopover
        position="relative"
        isPopoverOpen={isPopoverOpen}
        setIsPopoverOpen={setIsPopoverOpen}
        monitor={testMonitor}
        locationId={testMonitor.locations[0].id}
      />
    );
    const popoverButton = getByLabelText('Open actions menu');
    fireEvent.click(popoverButton);
    expect(setIsPopoverOpen).toHaveBeenCalled();
    // the popover passes back a function that accepts a bool and returns the inverse,
    // so we're calling it here just to make sure the behavior is correct
    expect(setIsPopoverOpen.mock.calls[0][0](isPopoverOpen)).toBe(false);
  });

  it('contains link to edit page', async () => {
    jest
      .spyOn(editMonitorLocatorModule, 'useEditMonitorLocator')
      .mockReturnValue('/a/test/edit/url');
    const { getByTestId } = render(
      <ActionsPopover
        position="relative"
        isPopoverOpen={true}
        setIsPopoverOpen={jest.fn()}
        monitor={testMonitor}
        locationId={testMonitor.locations[0].id}
      />
    );

    expect(getByTestId('editMonitorLink')?.getAttribute('href')).toBe('/a/test/edit/url');
  });

  it('contains link to clone monitor', async () => {
    jest
      .spyOn(editMonitorLocatorModule, 'useEditMonitorLocator')
      .mockReturnValue('/a/test/edit/url');
    const { getByTestId } = render(
      <ActionsPopover
        position="relative"
        isPopoverOpen={true}
        setIsPopoverOpen={jest.fn()}
        monitor={testMonitor}
        locationId={testMonitor.locations[0].id}
      />
    );

    expect(getByTestId('cloneMonitorLink')?.getAttribute('href')).toBe(
      'synthetics/add-monitor?cloneId=1lkjelre'
    );
  });

  it('contains link to detail page', async () => {
    jest
      .spyOn(monitorDetailLocatorModule, 'useMonitorDetailLocator')
      .mockReturnValue('/a/test/detail/url');
    const { getByTestId } = render(
      <ActionsPopover
        position="relative"
        isPopoverOpen={true}
        setIsPopoverOpen={jest.fn()}
        monitor={testMonitor}
        locationId={testMonitor.locations[0].id}
      />
    );
    expect(getByTestId('actionsPopoverGoToMonitor')?.getAttribute('href')).toBe(
      '/a/test/detail/url'
    );
  });

  it('sets the enabled state', async () => {
    const updateMonitorEnabledState = jest.fn();
    jest.spyOn(monitorEnableHandlerModule, 'useMonitorEnableHandler').mockReturnValue({
      status: FETCH_STATUS.SUCCESS,
      isEnabled: true,
      updateMonitorEnabledState,
    });
    const { getByText } = render(
      <ActionsPopover
        isPopoverOpen={true}
        position="relative"
        setIsPopoverOpen={jest.fn()}
        monitor={testMonitor}
        locationId={testMonitor.locations[0].id}
      />
    );
    const enableButton = getByText('Disable monitor (all locations)');
    fireEvent.click(enableButton);
    expect(updateMonitorEnabledState).toHaveBeenCalledTimes(1);
    expect(updateMonitorEnabledState.mock.calls[0]).toEqual([false]);
  });

  it('sets enabled state to true', async () => {
    const updateMonitorEnabledState = jest.fn();
    jest.spyOn(monitorEnableHandlerModule, 'useMonitorEnableHandler').mockReturnValue({
      status: FETCH_STATUS.PENDING,
      isEnabled: null,
      updateMonitorEnabledState,
    });
    const { getByText } = render(
      <ActionsPopover
        isPopoverOpen={true}
        setIsPopoverOpen={jest.fn()}
        monitor={{ ...testMonitor, isEnabled: false }}
        position="relative"
        locationId={testMonitor.locations[0].id}
      />
    );
    const enableButton = getByText('Enable monitor (all locations)');
    fireEvent.click(enableButton);
    expect(updateMonitorEnabledState).toHaveBeenCalledTimes(1);
    expect(updateMonitorEnabledState.mock.calls[0]).toEqual([true]);
  });

  describe('remote monitor', () => {
    let remoteMonitor: OverviewStatusMetaData;

    beforeEach(() => {
      remoteMonitor = {
        ...testMonitor,
        remote: {
          remoteName: 'remote-cluster-1',
          kibanaUrl: 'https://remote-kibana.example.com',
        },
      } as any;
    });

    it('renders a CCS-aware "Go to monitor" link that threads remoteName through the locator', () => {
      const detailLinkSpy = jest
        .spyOn(monitorDetailLocatorModule, 'useMonitorDetailLocator')
        .mockReturnValue(
          '/app/synthetics/monitor/1lkjelre?locationId=us_central&remoteName=remote-cluster-1'
        );

      const { getByTestId } = render(
        <ActionsPopover
          position="relative"
          isPopoverOpen={true}
          setIsPopoverOpen={jest.fn()}
          monitor={remoteMonitor}
          locationId={remoteMonitor.locations[0].id}
        />
      );

      expect(getByTestId('actionsPopoverGoToMonitor')?.getAttribute('href')).toBe(
        '/app/synthetics/monitor/1lkjelre?locationId=us_central&remoteName=remote-cluster-1'
      );
      expect(detailLinkSpy).toHaveBeenCalledWith(
        expect.objectContaining({ remoteName: 'remote-cluster-1' })
      );
    });

    it('hides local-only management actions for remote monitors', () => {
      const { queryByText, queryByTestId } = render(
        <ActionsPopover
          position="relative"
          isPopoverOpen={true}
          setIsPopoverOpen={jest.fn()}
          monitor={remoteMonitor}
          locationId={remoteMonitor.locations[0].id}
        />
      );

      // Visible for remote monitors.
      expect(queryByTestId('actionsPopoverGoToMonitor')).toBeInTheDocument();
      expect(queryByText('Quick inspect')).toBeInTheDocument();
      expect(queryByTestId('actionsPopoverViewOnRemoteCluster')).toBeInTheDocument();

      // Local-only management actions are hidden.
      expect(queryByTestId('editMonitorLink')).not.toBeInTheDocument();
      expect(queryByTestId('cloneMonitorLink')).not.toBeInTheDocument();
      expect(queryByTestId('createSLOBtn')).not.toBeInTheDocument();
      expect(queryByText('Run test manually')).not.toBeInTheDocument();
      expect(queryByText('Disable monitor (all locations)')).not.toBeInTheDocument();
      expect(queryByText('Disable status alerts (all locations)')).not.toBeInTheDocument();
      expect(queryByText('Add to dashboard')).not.toBeInTheDocument();
    });

    it('omits "View on remote cluster" when the remote Kibana URL is not available', () => {
      const monitorWithoutKibanaUrl = {
        ...remoteMonitor,
        remote: { remoteName: 'remote-cluster-1' },
      } as any;

      const { queryByTestId } = render(
        <ActionsPopover
          position="relative"
          isPopoverOpen={true}
          setIsPopoverOpen={jest.fn()}
          monitor={monitorWithoutKibanaUrl}
          locationId={monitorWithoutKibanaUrl.locations[0].id}
        />
      );

      expect(queryByTestId('actionsPopoverGoToMonitor')).toBeInTheDocument();
      expect(queryByTestId('actionsPopoverViewOnRemoteCluster')).not.toBeInTheDocument();
    });
  });
});
