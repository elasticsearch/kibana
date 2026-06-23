/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { useUpdateRule } from './use_update_rule';
import { useService, CoreStart } from '@kbn/core-di-browser';
import { RulesApi } from '../services/rules_api';
import type { RuleResponse } from '@kbn/alerting-v2-schemas';

jest.mock('@kbn/core-di-browser');
jest.mock('../services/rules_api');

const mockUseService = useService as jest.MockedFunction<typeof useService>;
const mockCoreStart = CoreStart as jest.MockedFunction<typeof CoreStart>;

const mockRuleResponse: RuleResponse = {
  id: 'rule-1',
  kind: 'signal',
  enabled: true,
  metadata: {
    name: 'My CPU Alert',
    description: '',
    tags: [],
  },
  time_field: '@timestamp',
  schedule: { every: '1m', lookback: '5m' },
  query: { format: 'standalone', breach: { query: 'FROM logs-*' } },
  createdBy: 'test-user',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedBy: 'test-user',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('useUpdateRule', () => {
  const mockUpdateRule = jest.fn();
  const mockAddSuccess = jest.fn();
  const mockAddError = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    mockCoreStart.mockImplementation((key: string) => key as any);

    mockUseService.mockImplementation((service: unknown) => {
      if (service === RulesApi) {
        return { updateRule: mockUpdateRule } as any;
      }
      if (service === 'notifications') {
        return { toasts: { addSuccess: mockAddSuccess, addError: mockAddError } } as any;
      }
      return undefined as any;
    });
  });

  it('should update a rule and show a success toast with the rule name', async () => {
    mockUpdateRule.mockResolvedValue(mockRuleResponse);
    const { result } = renderHook(() => useUpdateRule(), { wrapper: createWrapper() });

    result.current.mutate({ id: 'rule-1', payload: { metadata: { name: 'My CPU Alert' } } });

    await waitFor(() => {
      expect(mockUpdateRule).toHaveBeenCalledWith('rule-1', { metadata: { name: 'My CPU Alert' } });
      expect(mockAddSuccess).toHaveBeenCalledWith('Rule "My CPU Alert" updated successfully');
      expect(mockAddError).not.toHaveBeenCalled();
    });
  });

  it('should surface the server error message in the modal and a friendly status in the toast', async () => {
    const httpError = Object.assign(new Error('Conflict'), {
      stack: 'Error: Forbidden\n    at fetch',
      body: { message: 'forbidden action' },
      response: { status: 403 } as Response,
    });
    mockUpdateRule.mockRejectedValue(httpError);
    const { result } = renderHook(() => useUpdateRule(), { wrapper: createWrapper() });

    result.current.mutate({ id: 'rule-1', payload: {} });

    await waitFor(() => {
      expect(mockAddError).toHaveBeenCalledTimes(1);
      const [enrichedError, options] = mockAddError.mock.calls[0];
      expect(enrichedError.message).toBe('forbidden action');
      expect(enrichedError.stack).toBe('Error: Forbidden\n    at fetch');
      expect(options).toEqual({
        title: 'Edits not saved',
        toastMessage:
          'Your role needs additional privileges to save rules. Contact your administrator for help.',
      });
      expect(mockAddSuccess).not.toHaveBeenCalled();
    });
  });

  it('should fall back to the raw error message when the status is unknown', async () => {
    const error = new Error('Network down');
    mockUpdateRule.mockRejectedValue(error);
    const { result } = renderHook(() => useUpdateRule(), { wrapper: createWrapper() });

    result.current.mutate({ id: 'rule-1', payload: {} });

    await waitFor(() => {
      expect(mockAddError).toHaveBeenCalledWith(error, {
        title: 'Edits not saved',
        toastMessage: 'Network down',
      });
    });
  });
});
