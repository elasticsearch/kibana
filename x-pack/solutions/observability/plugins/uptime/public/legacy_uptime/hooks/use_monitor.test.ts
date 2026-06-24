/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import { useParams } from 'react-router-dom';
import { useMonitorId } from './use_monitor';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: jest.fn(),
}));

describe('useMonitorId', () => {
  const mockUseParams = (monitorId: string | undefined) => {
    (useParams as jest.Mock).mockReturnValue({ monitorId });
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('decodes a valid base64-encoded monitor id', () => {
    const rawId = 'pbwsvmz-1-0010_thrivent_ping-ep-migrate-to-elk-default';
    mockUseParams(btoa(rawId));

    const { result } = renderHook(() => useMonitorId());

    expect(result.current).toBe(rawId);
  });

  it('returns the raw param when it is not valid base64 instead of throwing', () => {
    // A hand-typed/bookmarked URL can contain a raw (unencoded) id that is not valid base64.
    mockUseParams('healthCheck-pre');

    const { result } = renderHook(() => useMonitorId());

    expect(result.current).toBe('healthCheck-pre');
  });

  it('returns an empty string when no monitorId is present', () => {
    mockUseParams(undefined);

    const { result } = renderHook(() => useMonitorId());

    expect(result.current).toBe('');
  });
});
