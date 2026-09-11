/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import { DOC_VIEWER_FLYOUT_HISTORY_KEY } from '@kbn/unified-doc-viewer';
import { useIsInSecurityApp } from '../../common/hooks/is_in_security_app';
import { useCspFlyoutApi } from './use_csp_flyout_api';
import { documentFlyoutHistoryKey } from '../shared/constants/flyout_history';

jest.mock('react-redux-v7', () => ({ useStore: () => ({}) }));
jest.mock('react-router-dom', () => ({ useHistory: () => ({}) }));
jest.mock('../../common/hooks/is_in_security_app');

jest.mock('../shared/components/flyout_provider', () => ({
  flyoutProviders: ({ children }: { children: unknown }) => children,
}));

jest.mock('../shared/utils/build_flyout_nav_title', () => ({
  buildFlyoutNavTitle: (title: string) => title,
}));

jest.mock('../shared/hooks/use_default_flyout_properties', () => ({
  useDefaultDocumentFlyoutProperties: () => ({ size: 's' }),
}));

jest.mock('./misconfiguration/main', () => ({ Misconfiguration: () => null }));
jest.mock('./vulnerability/main', () => ({ Vulnerability: () => null }));

const mockFlyoutRef = { close: jest.fn(), onClose: Promise.resolve() };
const mockOpenSystemFlyout = jest.fn().mockReturnValue(mockFlyoutRef);
const mockReportEvent = jest.fn();

jest.mock('../../common/lib/kibana', () => ({
  useKibana: () => ({
    services: {
      overlays: { openSystemFlyout: mockOpenSystemFlyout },
      storage: { get: jest.fn(), set: jest.fn(), remove: jest.fn() },
      telemetry: { reportEvent: mockReportEvent },
    },
  }),
}));

const useIsInSecurityAppMock = useIsInSecurityApp as jest.Mock;

describe('useCspFlyoutApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useIsInSecurityAppMock.mockReturnValue(true);
  });

  it('opens a system flyout for a misconfiguration finding', () => {
    const { result } = renderHook(() => useCspFlyoutApi());

    const handle = result.current.openMisconfigurationFinding({
      resourceId: 'resource-1',
      ruleId: 'rule-1',
    });

    expect(mockOpenSystemFlyout).toHaveBeenCalledTimes(1);
    expect(mockOpenSystemFlyout).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ session: 'start', historyKey: documentFlyoutHistoryKey })
    );
    expect(handle.onClose).toBe(mockFlyoutRef.onClose);

    handle.close();
    expect(mockFlyoutRef.close).toHaveBeenCalledTimes(1);
  });

  it('opens a system flyout for a vulnerability finding', () => {
    const { result } = renderHook(() => useCspFlyoutApi());

    const handle = result.current.openVulnerabilityFinding({
      vulnerabilityId: 'CVE-1',
      resourceId: 'resource-1',
      packageName: 'pkg',
      packageVersion: '1.0.0',
      eventId: 'event-1',
    });

    expect(mockOpenSystemFlyout).toHaveBeenCalledTimes(1);
    expect(mockOpenSystemFlyout).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ session: 'start', historyKey: documentFlyoutHistoryKey })
    );
    expect(handle.onClose).toBe(mockFlyoutRef.onClose);

    handle.close();
    expect(mockFlyoutRef.close).toHaveBeenCalledTimes(1);
  });

  it('opens a misconfiguration finding as a child, forwarding the optional title', () => {
    const { result } = renderHook(() => useCspFlyoutApi());

    result.current.openMisconfigurationFindingAsChild(
      { resourceId: 'resource-1', ruleId: 'rule-1' },
      { title: 'my-host' }
    );

    expect(mockOpenSystemFlyout).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        session: 'inherit',
        title: 'my-host',
        historyKey: documentFlyoutHistoryKey,
      })
    );
  });

  it('opens a vulnerability finding as a child, forwarding the optional title', () => {
    const { result } = renderHook(() => useCspFlyoutApi());

    result.current.openVulnerabilityFindingAsChild(
      {
        vulnerabilityId: 'CVE-1',
        resourceId: 'resource-1',
        packageName: 'pkg',
        packageVersion: '1.0.0',
        eventId: 'event-1',
      },
      { title: 'my-host' }
    );

    expect(mockOpenSystemFlyout).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        session: 'inherit',
        title: 'my-host',
        historyKey: documentFlyoutHistoryKey,
      })
    );
  });

  it('uses the doc-viewer history key when outside the security app', () => {
    useIsInSecurityAppMock.mockReturnValue(false);
    const { result } = renderHook(() => useCspFlyoutApi());

    result.current.openMisconfigurationFinding({ resourceId: 'resource-1', ruleId: 'rule-1' });

    expect(mockOpenSystemFlyout.mock.calls[0][1].historyKey).toBe(DOC_VIEWER_FLYOUT_HISTORY_KEY);
  });
});
