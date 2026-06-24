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

  describe('remote (CCS) monitor', () => {
    let remoteMonitor: OverviewStatusMetaData;

    beforeEach(() => {
      remoteMonitor = {
        ...testMonitor,
        remote: { remoteName: 'cluster-1', kibanaUrl: 'https://remote.example.com' },
      };
    });

    describe('with a known remote.kibanaUrl', () => {
      // "Go to monitor" intentionally stays in-app for remote monitors —
      // the local Synthetics details page reads remote data via CCS when
      // `?remoteName=<alias>` is in the URL — so it is *not* part of the
      // 3-state remote-redirect set (Edit / Clone / Enable-Disable).
      it('keeps Go to monitor as in-app navigation (local detailUrl with remoteName)', () => {
        jest
          .spyOn(monitorDetailLocatorModule, 'useMonitorDetailLocator')
          .mockReturnValue('/a/test/detail/url?remoteName=cluster-1');

        const { getByTestId } = render(
          <ActionsPopover
            isPopoverOpen={true}
            position="relative"
            setIsPopoverOpen={jest.fn()}
            monitor={remoteMonitor}
            locationId={remoteMonitor.locations[0].id}
          />
        );

        const goToMonitor = getByTestId('actionsPopoverGoToMonitor');
        expect(goToMonitor).toHaveAttribute('href', '/a/test/detail/url?remoteName=cluster-1');
        expect(goToMonitor).not.toHaveAttribute('target');
      });

      it('passes monitor.remote.remoteName through to useMonitorDetailLocator', () => {
        const detailLocatorSpy = jest
          .spyOn(monitorDetailLocatorModule, 'useMonitorDetailLocator')
          .mockReturnValue('/a/test/detail/url');

        render(
          <ActionsPopover
            isPopoverOpen={true}
            position="relative"
            setIsPopoverOpen={jest.fn()}
            monitor={remoteMonitor}
            locationId={remoteMonitor.locations[0].id}
          />
        );

        expect(detailLocatorSpy).toHaveBeenCalledWith(
          expect.objectContaining({ remoteName: 'cluster-1' })
        );
      });

      it('redirects Edit / Clone / Disable to the origin cluster', () => {
        const { getByTestId } = render(
          <ActionsPopover
            isPopoverOpen={true}
            position="relative"
            setIsPopoverOpen={jest.fn()}
            monitor={remoteMonitor}
            locationId={remoteMonitor.locations[0].id}
          />
        );

        const editLink = getByTestId('editMonitorLink');
        expect(editLink).toHaveAttribute(
          'href',
          'https://remote.example.com/app/synthetics/edit-monitor/1lkjelre'
        );
        expect(editLink).toHaveAttribute('target', '_blank');

        const cloneLink = getByTestId('cloneMonitorLink');
        expect(cloneLink).toHaveAttribute(
          'href',
          'https://remote.example.com/app/synthetics/add-monitor?cloneId=1lkjelre'
        );
        expect(cloneLink).toHaveAttribute('target', '_blank');
      });

      // No deep link or destination handler exists yet for remote
      // enable/disable, so the action stays disabled with the standard
      // "no remote equivalent" tooltip.
      it('keeps Enable/Disable disabled because the destination has no URL handler', () => {
        const { getByTestId } = render(
          <ActionsPopover
            isPopoverOpen={true}
            position="relative"
            setIsPopoverOpen={jest.fn()}
            monitor={remoteMonitor}
            locationId={remoteMonitor.locations[0].id}
          />
        );

        const enableToggle = getByTestId('syntheticsActionsPopoverEnableMonitor');
        expect(enableToggle).toBeDisabled();
        expect(enableToggle).not.toHaveAttribute('href');
      });

      it('keeps Run test manually disabled because the action has no remote equivalent', () => {
        const { getByTestId } = render(
          <ActionsPopover
            isPopoverOpen={true}
            position="relative"
            setIsPopoverOpen={jest.fn()}
            monitor={remoteMonitor}
            locationId={remoteMonitor.locations[0].id}
          />
        );

        const runTest = getByTestId('syntheticsActionsPopoverRunTestManually');
        expect(runTest).toBeDisabled();
        expect(runTest).not.toHaveAttribute('href');
      });

      it('keeps Create SLO disabled because the action has no remote equivalent', () => {
        const { getByTestId } = render(
          <ActionsPopover
            isPopoverOpen={true}
            position="relative"
            setIsPopoverOpen={jest.fn()}
            monitor={remoteMonitor}
            locationId={remoteMonitor.locations[0].id}
          />
        );

        expect(getByTestId('createSLOBtn')).toBeDisabled();
      });

      // The Synthetics overview embeddable filter schema can only narrow by
      // saved-object IDs; the dashboard's overview-status query has no
      // remote-cluster filter and doesn't narrow pings by `monitor.id`. For a
      // remote monitor that means the embeddable cannot isolate the single
      // configId — `SingleMonitorView` then violates its "exactly one
      // monitor" invariant and throws "Failed to load Kibana asset". Until
      // the schema/query learn about remote clusters, this action mirrors
      // the other local-only actions and stays disabled for remote monitors.
      it('keeps Add to dashboard disabled because the embeddable filter cannot isolate a remote monitor', () => {
        const { getByTestId } = render(
          <ActionsPopover
            isPopoverOpen={true}
            position="relative"
            setIsPopoverOpen={jest.fn()}
            monitor={remoteMonitor}
            locationId={remoteMonitor.locations[0].id}
          />
        );

        expect(getByTestId('syntheticsActionsPopoverAddToDashboard')).toBeDisabled();
      });
    });

    describe('with an undefined remote.kibanaUrl', () => {
      let remoteMonitorWithoutUrl: OverviewStatusMetaData;

      beforeEach(() => {
        remoteMonitorWithoutUrl = {
          ...testMonitor,
          remote: { remoteName: 'cluster-1' },
        };
      });

      // "Go to monitor" is intentionally outside the 3-state pattern — it
      // navigates to the local details page (which renders remote data via
      // CCS) regardless of `remote.kibanaUrl`. Only Edit / Clone need the
      // remote `kibanaUrl` because they must run on the origin cluster.
      // Enable/Disable is permanently disabled for remote regardless of
      // `kibanaUrl` (no destination URL handler today), so it isn't covered
      // by this scenario.
      it('disables Edit / Clone but keeps Go to monitor enabled', () => {
        jest
          .spyOn(monitorDetailLocatorModule, 'useMonitorDetailLocator')
          .mockReturnValue('/a/test/detail/url?remoteName=cluster-1');

        const { getByTestId } = render(
          <ActionsPopover
            isPopoverOpen={true}
            position="relative"
            setIsPopoverOpen={jest.fn()}
            monitor={remoteMonitorWithoutUrl}
            locationId={remoteMonitorWithoutUrl.locations[0].id}
          />
        );

        expect(getByTestId('actionsPopoverGoToMonitor')).toHaveAttribute(
          'href',
          '/a/test/detail/url?remoteName=cluster-1'
        );
        expect(getByTestId('editMonitorLink')).toBeDisabled();
        expect(getByTestId('cloneMonitorLink')).toBeDisabled();

        // No href is attached when disabled — clicking does not navigate.
        expect(getByTestId('editMonitorLink')).not.toHaveAttribute('href');
        expect(getByTestId('cloneMonitorLink')).not.toHaveAttribute('href');
      });

      it('falls back to the `kibanaUrl` prop when supplied (e.g. from the flyout)', () => {
        const { getByTestId } = render(
          <ActionsPopover
            isPopoverOpen={true}
            position="relative"
            setIsPopoverOpen={jest.fn()}
            monitor={remoteMonitorWithoutUrl}
            locationId={remoteMonitorWithoutUrl.locations[0].id}
            kibanaUrl="https://from-prop.example.com"
          />
        );

        expect(getByTestId('editMonitorLink')).toHaveAttribute(
          'href',
          'https://from-prop.example.com/app/synthetics/edit-monitor/1lkjelre'
        );
        expect(getByTestId('cloneMonitorLink')).toHaveAttribute(
          'href',
          'https://from-prop.example.com/app/synthetics/add-monitor?cloneId=1lkjelre'
        );
      });
    });

    it('prefers the `kibanaUrl` prop over `monitor.remote.kibanaUrl`', () => {
      const { getByTestId } = render(
        <ActionsPopover
          isPopoverOpen={true}
          position="relative"
          setIsPopoverOpen={jest.fn()}
          monitor={remoteMonitor}
          locationId={remoteMonitor.locations[0].id}
          kibanaUrl="https://from-prop.example.com"
        />
      );

      expect(getByTestId('editMonitorLink')).toHaveAttribute(
        'href',
        'https://from-prop.example.com/app/synthetics/edit-monitor/1lkjelre'
      );
    });
  });
});
