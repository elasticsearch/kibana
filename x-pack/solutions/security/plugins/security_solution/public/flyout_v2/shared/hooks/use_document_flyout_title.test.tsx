/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { renderHook, act } from '@testing-library/react';
import type { DataTableRecord } from '@kbn/discover-utils';
import { DOC_VIEWER_FLYOUT_HISTORY_KEY } from '@kbn/unified-doc-viewer';
import { useDocumentFlyoutTitle } from './use_document_flyout_title';
import { useKibana } from '../../../common/lib/kibana';
import { useIsInSecurityApp } from '../../../common/hooks/is_in_security_app';
import { documentFlyoutHistoryKey } from '../constants/flyout_history';

jest.mock('react-redux', () => ({
  ...jest.requireActual('react-redux'),
  useStore: () => ({ getState: jest.fn(), dispatch: jest.fn(), subscribe: jest.fn() }),
}));
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useHistory: () => ({}),
}));
jest.mock('../../../common/lib/kibana');
jest.mock('../../../common/hooks/is_in_security_app');
jest.mock('../components/flyout_provider', () => ({
  flyoutProviders: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('../../document/main', () => ({
  DocumentFlyout: () => <div data-test-subj="documentFlyoutMock" />,
}));
jest.mock('../../document/main/components/severity', () => ({
  DocumentSeverity: () => <div data-test-subj="documentSeverityMock" />,
}));
jest.mock('../components/timestamp', () => ({
  Timestamp: () => <div data-test-subj="timestampMock" />,
}));

const createHit = (flattened: DataTableRecord['flattened']): DataTableRecord =>
  ({
    id: '1',
    raw: { _id: '1', _index: 'test', _source: {} },
    flattened,
    isAnchor: false,
  } as DataTableRecord);

const alertHit = createHit({
  'event.kind': 'signal',
  'kibana.alert.rule.name': 'My Rule',
});

const eventHit = createHit({
  'event.kind': 'event',
  'event.category': 'host',
  'host.name': 'host-1',
});

describe('useDocumentFlyoutTitle', () => {
  const mockUseKibana = jest.mocked(useKibana);
  const mockUseIsInSecurityApp = jest.mocked(useIsInSecurityApp);
  const openSystemFlyout = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseIsInSecurityApp.mockReturnValue(true);
    mockUseKibana.mockReturnValue({
      services: {
        overlays: { openSystemFlyout },
      },
    } as unknown as ReturnType<typeof useKibana>);
  });

  it('derives label and warning icon for alerts', () => {
    const { result } = renderHook(() => useDocumentFlyoutTitle({ hit: alertHit }));

    expect(result.current.label).toBe('My Rule');
    expect(result.current.iconType).toBe('warning');
  });

  it('derives label and analyzeEvent icon for non-alert events', () => {
    const { result } = renderHook(() => useDocumentFlyoutTitle({ hit: eventHit }));

    expect(result.current.label).toBe('host-1');
    expect(result.current.iconType).toBe('analyzeEvent');
  });

  it('opens the document flyout with documentFlyoutHistoryKey and session inherit when in the Security app', () => {
    const { result } = renderHook(() => useDocumentFlyoutTitle({ hit: alertHit }));

    act(() => {
      result.current.onTitleClick();
    });

    expect(openSystemFlyout).toHaveBeenCalledTimes(1);
    expect(openSystemFlyout).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        historyKey: documentFlyoutHistoryKey,
        session: 'inherit',
      })
    );
  });

  it('uses DOC_VIEWER_FLYOUT_HISTORY_KEY when not in the Security app', () => {
    mockUseIsInSecurityApp.mockReturnValue(false);

    const { result } = renderHook(() => useDocumentFlyoutTitle({ hit: eventHit }));

    act(() => {
      result.current.onTitleClick();
    });

    expect(openSystemFlyout).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        historyKey: DOC_VIEWER_FLYOUT_HISTORY_KEY,
        session: 'inherit',
      })
    );
  });

  it('returns badge and timestamp nodes derived from the hit', () => {
    const { result } = renderHook(() => useDocumentFlyoutTitle({ hit: alertHit }));

    expect(result.current.badge).toBeTruthy();
    expect(result.current.timestamp).toBeTruthy();
  });
});
