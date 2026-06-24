/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

jest.mock('../ears/get_ears_access_token');
jest.mock('../ears/url');

import type { AxiosInstance } from 'axios';
import { authTypeSpecs } from '@kbn/connector-specs';
import type { AuthContext, EarsGetTokenOpts, GetTokenOpts } from '@kbn/connector-specs';
import { loggerMock } from '@kbn/logging-mocks';
import { actionsConfigMock } from '../../actions_config.mock';
import { connectorTokenClientMock } from '../connector_token_client.mock';
import { getEarsAccessToken } from '../ears/get_ears_access_token';
import { resolveEarsUrl } from '../ears/url';
import { EarsStrategy } from './ears_strategy';
import type { AuthStrategyDeps } from './types';

const mockGetEarsAccessToken = getEarsAccessToken as jest.MockedFunction<typeof getEarsAccessToken>;
const mockResolveEarsUrl = resolveEarsUrl as jest.MockedFunction<typeof resolveEarsUrl>;

const logger = loggerMock.create();
const configurationUtilities = actionsConfigMock.create();
const connectorTokenClient = connectorTokenClientMock.create();

const baseDeps: AuthStrategyDeps = {
  connectorId: 'connector-1',
  secrets: { provider: 'my-provider' },
  connectorTokenClient,
  logger,
  configurationUtilities,
};

const createMockAxiosInstance = () => {
  const mockRequest = jest.fn();
  const instance = {
    interceptors: { response: { use: jest.fn() } },
    request: mockRequest,
    defaults: { headers: { common: {} as Record<string, string> } },
  } as unknown as AxiosInstance;
  return { instance, mockRequest };
};

const getOnFulfilled = (instance: AxiosInstance) => {
  const useMock = instance.interceptors.response.use as jest.Mock;
  expect(useMock).toHaveBeenCalledTimes(1);
  return useMock.mock.calls[0][0] as (response: unknown) => Promise<unknown>;
};

const getOnRejected = (instance: AxiosInstance) => {
  const useMock = instance.interceptors.response.use as jest.Mock;
  expect(useMock).toHaveBeenCalledTimes(1);
  return useMock.mock.calls[0][1] as (error: unknown) => Promise<unknown>;
};

describe('EarsStrategy', () => {
  let strategy: EarsStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new EarsStrategy();
    mockResolveEarsUrl.mockImplementation((url) => `https://ears.example.com${url}`);
  });

  describe('installResponseInterceptor', () => {
    it('throws synchronously when connectorTokenClient is absent', () => {
      const { instance } = createMockAxiosInstance();
      const { connectorTokenClient: _ctc, ...depsWithoutClient } = baseDeps;
      expect(() => strategy.installResponseInterceptor(instance, depsWithoutClient)).toThrow(
        'ConnectorTokenClient is required for EARS authorization code flow'
      );
    });

    it('passes non-401 errors through unchanged', async () => {
      const { instance } = createMockAxiosInstance();
      strategy.installResponseInterceptor(instance, baseDeps);
      const onRejected = getOnRejected(instance);

      const error = {
        config: { _retry: false, headers: {} },
        response: { status: 500 },
        message: 'Server Error',
      };
      await expect(onRejected(error)).rejects.toBe(error);
      expect(mockGetEarsAccessToken).not.toHaveBeenCalled();
    });

    it('does not retry when _retry is already set', async () => {
      const { instance } = createMockAxiosInstance();
      strategy.installResponseInterceptor(instance, baseDeps);
      const onRejected = getOnRejected(instance);

      const error = {
        config: { _retry: true, headers: {} },
        response: { status: 401 },
        message: 'Unauthorized',
      };
      await expect(onRejected(error)).rejects.toBe(error);
      expect(mockGetEarsAccessToken).not.toHaveBeenCalled();
    });

    it('rejects with message when provider is absent', async () => {
      const { instance } = createMockAxiosInstance();
      strategy.installResponseInterceptor(instance, { ...baseDeps, secrets: {} });
      const onRejected = getOnRejected(instance);

      const error = {
        config: { _retry: false, headers: {} },
        response: { status: 401 },
        message: '',
      };
      await expect(onRejected(error)).rejects.toBe(error);
      expect((error as { message: string }).message).toContain(
        'Authentication failed: Missing required EARS provider.'
      );
      expect(mockGetEarsAccessToken).not.toHaveBeenCalled();
    });

    it('refreshes token on 401 and retries the request', async () => {
      const { instance, mockRequest } = createMockAxiosInstance();
      strategy.installResponseInterceptor(instance, baseDeps);
      const onRejected = getOnRejected(instance);

      mockGetEarsAccessToken.mockResolvedValue('Bearer newtoken');
      mockRequest.mockResolvedValue({ status: 200 });

      const error = {
        config: { _retry: false, headers: {} as Record<string, string> },
        response: { status: 401 },
        message: 'Unauthorized',
      };
      await onRejected(error);

      expect(mockGetEarsAccessToken).toHaveBeenCalledWith(
        expect.objectContaining({ forceRefresh: true, connectorId: 'connector-1' })
      );
      expect(error.config.headers.Authorization).toBe('Bearer newtoken');
      expect(mockRequest).toHaveBeenCalledWith(error.config);
    });

    it('rejects with message when token refresh returns null', async () => {
      const { instance } = createMockAxiosInstance();
      strategy.installResponseInterceptor(instance, baseDeps);
      const onRejected = getOnRejected(instance);

      mockGetEarsAccessToken.mockResolvedValue(null);

      const error = {
        config: { _retry: false, headers: {} },
        response: { status: 401 },
        message: '',
      };
      await expect(onRejected(error)).rejects.toBe(error);
      expect((error as { message: string }).message).toContain(
        'Unable to refresh access token via EARS'
      );
    });

    describe('Slack 200 + ok:false auth error', () => {
      const slackDeps = { ...baseDeps, secrets: { provider: 'slack' } };

      it('token_expired triggers refresh and retries', async () => {
        const { instance, mockRequest } = createMockAxiosInstance();
        strategy.installResponseInterceptor(instance, slackDeps);
        const onFulfilled = getOnFulfilled(instance);

        mockGetEarsAccessToken.mockResolvedValue('Bearer newtoken');
        mockRequest.mockResolvedValue({ status: 200, data: { ok: true } });

        const response = {
          config: { _retry: false, headers: {} as Record<string, string> },
          data: { ok: false, error: 'token_expired' },
        };
        await onFulfilled(response);

        expect(mockGetEarsAccessToken).toHaveBeenCalledWith(
          expect.objectContaining({ forceRefresh: true, connectorId: 'connector-1' })
        );
        expect(response.config.headers.Authorization).toBe('Bearer newtoken');
        expect(mockRequest).toHaveBeenCalledWith(response.config);
      });

      it.each(['invalid_auth', 'token_revoked', 'not_authed', 'channel_not_found'])(
        '%s passes through unchanged without a refresh attempt',
        async (slackError) => {
          const { instance } = createMockAxiosInstance();
          strategy.installResponseInterceptor(instance, slackDeps);
          const onFulfilled = getOnFulfilled(instance);

          const response = {
            config: { _retry: false, headers: {} },
            data: { ok: false, error: slackError },
          };
          const result = await onFulfilled(response);
          expect(result).toBe(response);
          expect(mockGetEarsAccessToken).not.toHaveBeenCalled();
        }
      );

      it('ok:true response passes through unchanged', async () => {
        const { instance } = createMockAxiosInstance();
        strategy.installResponseInterceptor(instance, slackDeps);
        const onFulfilled = getOnFulfilled(instance);

        const response = {
          config: { _retry: false, headers: {} },
          data: { ok: true, messages: [] },
        };
        const result = await onFulfilled(response);
        expect(result).toBe(response);
        expect(mockGetEarsAccessToken).not.toHaveBeenCalled();
      });

      it('non-Slack provider passes through unchanged', async () => {
        const { instance } = createMockAxiosInstance();
        strategy.installResponseInterceptor(instance, {
          ...baseDeps,
          secrets: { provider: 'google' },
        });
        const onFulfilled = getOnFulfilled(instance);

        const response = {
          config: { _retry: false, headers: {} },
          data: { ok: false, error: 'token_expired' },
        };
        const result = await onFulfilled(response);
        expect(result).toBe(response);
        expect(mockGetEarsAccessToken).not.toHaveBeenCalled();
      });

      it('does not refresh again when _retry is already set', async () => {
        const { instance } = createMockAxiosInstance();
        strategy.installResponseInterceptor(instance, slackDeps);
        const onFulfilled = getOnFulfilled(instance);

        const response = {
          config: { _retry: true, headers: {} },
          data: { ok: false, error: 'token_expired' },
        };
        const result = await onFulfilled(response);
        expect(result).toBe(response);
        expect(mockGetEarsAccessToken).not.toHaveBeenCalled();
      });

      it('rejects with re-auth message when token refresh returns null', async () => {
        const { instance } = createMockAxiosInstance();
        strategy.installResponseInterceptor(instance, slackDeps);
        const onFulfilled = getOnFulfilled(instance);

        mockGetEarsAccessToken.mockResolvedValue(null);

        const response = {
          config: { _retry: false, headers: {} },
          data: { ok: false, error: 'token_expired' },
        };
        await expect(onFulfilled(response)).rejects.toThrow(
          'Unable to refresh access token via EARS'
        );
      });
    });

    it('calls getEarsAccessToken with the provider from secrets', async () => {
      const { instance, mockRequest } = createMockAxiosInstance();
      strategy.installResponseInterceptor(instance, {
        ...baseDeps,
        secrets: { provider: 'my-provider' },
      });
      const onRejected = getOnRejected(instance);

      mockGetEarsAccessToken.mockResolvedValue('Bearer token');
      mockRequest.mockResolvedValue({ status: 200 });

      const error = {
        config: { _retry: false, headers: {} as Record<string, string> },
        response: { status: 401 },
        message: '',
      };
      await onRejected(error);

      expect(mockGetEarsAccessToken).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'my-provider', forceRefresh: true })
      );
    });
  });

  describe('configure (bearer normalization)', () => {
    it.each([
      ['bearer initial-token', 'Bearer initial-token'],
      ['Bearer initial-token', 'Bearer initial-token'],
    ])(
      'sets Authorization header with title-case Bearer scheme at setup time (%s -> %s)',
      async (input, expected) => {
        const ctx = {
          getToken: jest.fn().mockResolvedValue(input),
        } as unknown as AuthContext;
        const { instance } = createMockAxiosInstance();

        await authTypeSpecs.Ears.configure(ctx, instance, { provider: 'google' });

        expect(instance.defaults.headers.common.Authorization).toBe(expected);
      }
    );

    it.each([
      ['bearer refreshed-token', 'Bearer refreshed-token'],
      ['Bearer refreshed-token', 'Bearer refreshed-token'],
    ])(
      'sets Authorization header with title-case Bearer scheme at refresh time (%s -> %s)',
      async (input, expected) => {
        const { instance, mockRequest } = createMockAxiosInstance();
        strategy.installResponseInterceptor(instance, baseDeps);
        const onRejected = getOnRejected(instance);

        mockGetEarsAccessToken.mockResolvedValue(input);
        mockRequest.mockResolvedValue({ status: 200 });

        const error = {
          config: { _retry: false, headers: {} as Record<string, string> },
          response: { status: 401 },
          message: 'Unauthorized',
        };
        await onRejected(error);

        expect(error.config.headers.Authorization).toBe(expected);
        expect(instance.defaults.headers.common.Authorization).toBe(expected);
      }
    );
  });

  describe('getToken', () => {
    it('throws when opts authType is not ears', async () => {
      const opts: GetTokenOpts = {
        authType: 'oauth',
        tokenUrl: 'https://example.com/token',
        clientId: 'id',
        clientSecret: 'secret',
      };
      await expect(strategy.getToken(opts, baseDeps)).rejects.toThrow(
        'EarsStrategy received non-ears token opts'
      );
    });

    it('throws when connectorTokenClient is absent', async () => {
      const { connectorTokenClient: _ctc, ...depsWithoutClient } = baseDeps;
      await expect(
        strategy.getToken({ authType: 'ears', provider: 'my-provider' }, depsWithoutClient)
      ).rejects.toThrow('ConnectorTokenClient is required for EARS OAuth flow');
    });

    it('delegates to getEarsAccessToken with provider', async () => {
      mockGetEarsAccessToken.mockResolvedValue('Bearer token');

      const opts: EarsGetTokenOpts = { authType: 'ears', provider: 'my-provider' };
      await strategy.getToken(opts, baseDeps);

      expect(mockGetEarsAccessToken).toHaveBeenCalledWith(
        expect.objectContaining({
          connectorId: 'connector-1',
          provider: 'my-provider',
          connectorTokenClient,
        })
      );
    });
  });
});
