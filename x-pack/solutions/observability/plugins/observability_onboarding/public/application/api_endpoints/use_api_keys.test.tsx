/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { act, renderHook } from '@testing-library/react';
import { useKibana } from '../../hooks/use_kibana';
import { callObservabilityOnboardingApi } from '../../services/rest/create_call_api';
import { ApiEndpointId } from '../../../common/api_endpoints';
import { useApiKeys } from './use_api_keys';

jest.mock('../../hooks/use_kibana', () => ({ useKibana: jest.fn() }));
jest.mock('../../services/rest/create_call_api', () => ({
  callObservabilityOnboardingApi: jest.fn(),
}));

const mockUseKibana = useKibana as jest.Mock;
const mockCallApi = callObservabilityOnboardingApi as jest.Mock;

const addSuccess = jest.fn();
const addError = jest.fn();

describe('useApiKeys', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseKibana.mockReturnValue({
      services: { notifications: { toasts: { addSuccess, addError } } },
    });
  });

  it('stores the key and shows a single success toast on success', async () => {
    mockCallApi.mockResolvedValue({ encodedApiKey: 'encoded-key' });

    const { result } = renderHook(() => useApiKeys());
    await act(async () => {
      await result.current.createApiKey(ApiEndpointId.Elasticsearch);
    });

    expect(result.current.encodedApiKeys[ApiEndpointId.Elasticsearch]).toBe('encoded-key');
    expect(addSuccess).toHaveBeenCalledTimes(1);
    expect(addError).not.toHaveBeenCalled();
  });

  it('shows the error toast and no success toast when creation fails', async () => {
    mockCallApi.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useApiKeys());
    await act(async () => {
      await result.current.createApiKey(ApiEndpointId.Elasticsearch);
    });

    expect(addError).toHaveBeenCalledTimes(1);
    expect(addSuccess).not.toHaveBeenCalled();
    expect(result.current.encodedApiKeys[ApiEndpointId.Elasticsearch]).toBeUndefined();
  });
});
