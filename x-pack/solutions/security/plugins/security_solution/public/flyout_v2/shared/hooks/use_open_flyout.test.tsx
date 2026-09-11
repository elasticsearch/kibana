/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { renderHook } from '@testing-library/react';
import { useOpenFlyout } from './use_open_flyout';
import { useKibana } from '../../../common/lib/kibana';
import { useIsInSecurityApp } from '../../../common/hooks/is_in_security_app';
import { flyoutProviders } from '../components/flyout_provider';
import {
  FlyoutV2EventTypes,
  FLYOUT_ORIGIN,
  FLYOUT_SURFACE,
  FLYOUT_TYPE,
  FLYOUT_TOOL,
  FLYOUT_SESSION_KIND,
} from '../../../common/lib/telemetry';

jest.mock('react-redux-v7', () => ({
  ...jest.requireActual('react-redux-v7'),
  useStore: jest.fn(() => ({})),
}));
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useHistory: jest.fn(() => ({})),
}));
jest.mock('../../../common/lib/kibana');
jest.mock('../../../common/hooks/is_in_security_app');
jest.mock('../components/flyout_provider', () => ({
  flyoutProviders: jest.fn(() => 'FLYOUT_CONTENT'),
}));

const mockOpenSystemFlyout = jest.fn();
const mockReportEvent = jest.fn();
const mockStorage = { get: jest.fn(), set: jest.fn() };

/** Builds a deferred `OverlayRef`-like value, letting the test resolve `onClose` on demand. */
const createOverlayRef = () => {
  let resolveClose: () => void = () => {};
  const onClose = new Promise<void>((resolve) => {
    resolveClose = resolve;
  });
  return { ref: { onClose, close: jest.fn() }, resolveClose: () => resolveClose() };
};

describe('useOpenFlyout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useKibana as jest.Mock).mockReturnValue({
      services: {
        overlays: { openSystemFlyout: mockOpenSystemFlyout },
        telemetry: { reportEvent: mockReportEvent },
        storage: mockStorage,
      },
    });
    (useIsInSecurityApp as jest.Mock).mockReturnValue(true);
    // No persisted preference by default → falls back to 'overlay'.
    mockStorage.get.mockReturnValue(undefined);
  });

  it('opens the system flyout with the wrapped children and given properties', () => {
    mockOpenSystemFlyout.mockReturnValue(createOverlayRef().ref);

    const { result } = renderHook(() => useOpenFlyout());
    result.current(<div>{'content'}</div>, { size: 's', session: 'start' });

    expect(flyoutProviders).toHaveBeenCalledTimes(1);
    expect(mockOpenSystemFlyout).toHaveBeenCalledWith('FLYOUT_CONTENT', {
      size: 's',
      session: 'start',
      type: 'overlay',
    });
  });

  it('injects the persisted push/overlay preference from storage', () => {
    mockStorage.get.mockReturnValue('push');
    mockOpenSystemFlyout.mockReturnValue(createOverlayRef().ref);

    const { result } = renderHook(() => useOpenFlyout());
    result.current(<div />, { size: 's', session: 'start' });

    expect(mockOpenSystemFlyout).toHaveBeenCalledWith('FLYOUT_CONTENT', {
      size: 's',
      session: 'start',
      type: 'push',
    });
  });

  it('lets an explicit type override the persisted preference', () => {
    mockStorage.get.mockReturnValue('push');
    mockOpenSystemFlyout.mockReturnValue(createOverlayRef().ref);

    const { result } = renderHook(() => useOpenFlyout());
    result.current(<div />, { size: 's', session: 'start', type: 'overlay' });

    expect(mockOpenSystemFlyout).toHaveBeenCalledWith('FLYOUT_CONTENT', {
      size: 's',
      session: 'start',
      type: 'overlay',
    });
  });

  it('returns the OverlayRef from openSystemFlyout', () => {
    const { ref } = createOverlayRef();
    mockOpenSystemFlyout.mockReturnValue(ref);

    const { result } = renderHook(() => useOpenFlyout());
    const returned = result.current(<div />, { size: 's', session: 'start' });

    expect(returned).toBe(ref);
  });

  it('does not report telemetry when no meta is given', () => {
    mockOpenSystemFlyout.mockReturnValue(createOverlayRef().ref);

    const { result } = renderHook(() => useOpenFlyout());
    result.current(<div />, { size: 's', session: 'start' });

    expect(mockReportEvent).not.toHaveBeenCalled();
  });

  it('reports the opened event immediately when meta is given', () => {
    mockOpenSystemFlyout.mockReturnValue(createOverlayRef().ref);

    const { result } = renderHook(() => useOpenFlyout());
    result.current(
      <div />,
      { size: 's', session: 'start' },
      {
        surface: FLYOUT_SURFACE.FLYOUT,
        flyoutType: FLYOUT_TYPE.DOCUMENT,
        session: FLYOUT_SESSION_KIND.START,
        origin: FLYOUT_ORIGIN.ALERTS_TABLE,
      }
    );

    expect(mockReportEvent).toHaveBeenCalledWith(FlyoutV2EventTypes.FlyoutOpened, {
      surface: FLYOUT_SURFACE.FLYOUT,
      flyoutType: FLYOUT_TYPE.DOCUMENT,
      tool: undefined,
      session: FLYOUT_SESSION_KIND.START,
      origin: FLYOUT_ORIGIN.ALERTS_TABLE,
    });
  });

  it('reports the closed event with a numeric duration once the flyout closes', async () => {
    const { ref, resolveClose } = createOverlayRef();
    mockOpenSystemFlyout.mockReturnValue(ref);

    const { result } = renderHook(() => useOpenFlyout());
    result.current(
      <div />,
      { size: 'm', session: 'inherit' },
      {
        surface: FLYOUT_SURFACE.TOOL,
        tool: FLYOUT_TOOL.ANALYZER,
        flyoutType: FLYOUT_TYPE.DOCUMENT,
        session: FLYOUT_SESSION_KIND.INHERIT,
      }
    );

    resolveClose();
    await ref.onClose;
    // Let the `.then()` chained on `onClose` inside the hook flush.
    await Promise.resolve();

    const closedCall = mockReportEvent.mock.calls.find(
      ([eventType]) => eventType === FlyoutV2EventTypes.FlyoutClosed
    );
    expect(closedCall).toBeDefined();
    expect(closedCall?.[1]).toEqual(
      expect.objectContaining({
        flyoutType: FLYOUT_TYPE.DOCUMENT,
        tool: FLYOUT_TOOL.ANALYZER,
        session: FLYOUT_SESSION_KIND.INHERIT,
        durationMs: expect.any(Number),
      })
    );
  });
});
