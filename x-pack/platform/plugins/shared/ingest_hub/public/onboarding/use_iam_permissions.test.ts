/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook, waitFor, act } from '@testing-library/react';

import { useKibana } from '@kbn/kibana-react-plugin/public';

import type { GetIamPermissionsResponse } from '../../common/iam_permissions_api';
import { IAM_PERMISSIONS_API_PATH } from '../../common/iam_permissions_api';
import { useIamPermissions } from './use_iam_permissions';

jest.mock('@kbn/kibana-react-plugin/public', () => ({
  useKibana: jest.fn(),
}));

const makeResponse = (actions: string[]): GetIamPermissionsResponse => ({
  merged: {
    Version: '2012-10-17',
    Statement: [{ Sid: 'All', Effect: 'Allow', Resource: '*', Action: actions }],
  },
  mergedManagedPolicyArns: [],
  byService: {},
});

describe('useIamPermissions', () => {
  let mockHttpGet: jest.Mock;

  beforeEach(() => {
    mockHttpGet = jest.fn();
    (useKibana as jest.Mock).mockReturnValue({
      services: { http: { get: mockHttpGet } },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('starts in loading state and resolves to data on success', async () => {
    const response = makeResponse(['ec2:DescribeInstances']);
    mockHttpGet.mockResolvedValue(response);

    const { result } = renderHook(() => useIamPermissions(['ec2_metrics']));

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual(response);
    expect(result.current.error).toBeNull();
    expect(mockHttpGet).toHaveBeenCalledWith(IAM_PERMISSIONS_API_PATH, {
      query: { services: 'ec2_metrics' },
      signal: expect.any(AbortSignal),
    });
  });

  it('sorts service ids into a stable key so array order does not cause a refetch', async () => {
    mockHttpGet.mockResolvedValue(makeResponse([]));

    const { rerender } = renderHook(({ ids }) => useIamPermissions(ids), {
      initialProps: { ids: ['vpcflow', 'cloudtrail'] },
    });

    await waitFor(() => expect(mockHttpGet).toHaveBeenCalledTimes(1));

    // Same ids, different order — should NOT trigger a second fetch
    rerender({ ids: ['cloudtrail', 'vpcflow'] });
    await waitFor(() => expect(mockHttpGet).toHaveBeenCalledTimes(1));

    expect(mockHttpGet).toHaveBeenCalledWith(IAM_PERMISSIONS_API_PATH, {
      query: { services: 'cloudtrail,vpcflow' },
      signal: expect.any(AbortSignal),
    });
  });

  it('refetches when the service id set actually changes', async () => {
    mockHttpGet.mockResolvedValue(makeResponse([]));

    const { rerender } = renderHook(({ ids }) => useIamPermissions(ids), {
      initialProps: { ids: ['cloudtrail'] },
    });

    await waitFor(() => expect(mockHttpGet).toHaveBeenCalledTimes(1));

    rerender({ ids: ['cloudtrail', 'vpcflow'] });
    await waitFor(() => expect(mockHttpGet).toHaveBeenCalledTimes(2));
  });

  it('returns null data and no loading when serviceIds is empty', async () => {
    const { result } = renderHook(() => useIamPermissions([]));

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(mockHttpGet).not.toHaveBeenCalled();
  });

  it('sets error state when the request fails', async () => {
    mockHttpGet.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useIamPermissions(['cloudtrail']));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Network error');
  });

  it('does not set error state when the request is aborted', async () => {
    const abortError = new Error('AbortError');
    abortError.name = 'AbortError';
    mockHttpGet.mockRejectedValue(abortError);

    const { result } = renderHook(() => useIamPermissions(['cloudtrail']));

    // Give the promise time to reject
    await waitFor(() => expect(mockHttpGet).toHaveBeenCalledTimes(1));

    // After an abort, no error should be set
    expect(result.current.error).toBeNull();
    expect(result.current.data).toBeNull();
  });

  it('aborts the in-flight request when serviceIds changes before the first resolves', async () => {
    // The first call returns a promise that respects the AbortSignal — it rejects with
    // AbortError when the controller fires, simulating how the real http client behaves.
    mockHttpGet.mockImplementationOnce(
      (_path: string, { signal }: { signal: AbortSignal }) =>
        new Promise<GetIamPermissionsResponse>((resolve, reject) => {
          const onAbort = () => {
            const err = new Error('The user aborted a request.');
            err.name = 'AbortError';
            reject(err);
          };
          if (signal.aborted) {
            onAbort();
          } else {
            signal.addEventListener('abort', onAbort);
          }
          // This promise deliberately never resolves on its own — the abort wins.
          void resolve; // silence unused-var lint
        })
    );
    mockHttpGet.mockResolvedValueOnce(makeResponse(['vpcflow:action']));

    const { result, rerender } = renderHook(({ ids }) => useIamPermissions(ids), {
      initialProps: { ids: ['cloudtrail'] },
    });

    // Change ids before the first request resolves — the hook aborts the first call
    act(() => {
      rerender({ ids: ['vpcflow'] });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Only the second request's data should be present; the first was aborted silently
    expect(result.current.data).toEqual(makeResponse(['vpcflow:action']));
    expect(result.current.error).toBeNull();
  });
});
