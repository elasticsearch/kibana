/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

jest.mock('axios');
jest.mock('../axios_utils');
jest.mock('./url');

import axios from 'axios';
import type { AxiosResponse } from 'axios';
import type { SSLSettings } from '@kbn/actions-utils';
import { loggerMock } from '@kbn/logging-mocks';
import { actionsConfigMock } from '../../actions_config.mock';
import { request } from '../axios_utils';
import { getEarsEndpointsForProvider, resolveEarsUrl } from './url';
import { requestEarsRefreshToken } from './request_ears_refresh_token';

const mockRequest = request as jest.MockedFunction<typeof request>;
const mockGetEarsEndpointsForProvider = getEarsEndpointsForProvider as jest.MockedFunction<
  typeof getEarsEndpointsForProvider
>;
const mockResolveEarsUrl = resolveEarsUrl as jest.MockedFunction<typeof resolveEarsUrl>;

const REFRESH_URL = 'https://ears.example.com/v1/my-provider/oauth/refresh';

describe('requestEarsRefreshToken', () => {
  const logger = loggerMock.create();
  const configurationUtilities = actionsConfigMock.create();

  beforeEach(() => {
    jest.clearAllMocks();
    (axios.create as jest.Mock).mockReturnValue({});
    mockGetEarsEndpointsForProvider.mockReturnValue({
      authorizeEndpoint: 'v1/my-provider/oauth/authorize',
      tokenEndpoint: 'v1/my-provider/oauth/token',
      refreshEndpoint: 'v1/my-provider/oauth/refresh',
    });
    mockResolveEarsUrl.mockReturnValue(REFRESH_URL);
    mockRequest.mockResolvedValue({
      status: 200,
      data: {
        access_token: 'new-access-token',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'new-refresh-token',
        refresh_token_expires_in: 604800,
      },
    } as unknown as AxiosResponse);
  });

  it('passes sslOverrides from getEARSSSLSettings to the request call', async () => {
    const sslSettings: SSLSettings = { verificationMode: 'full', cert: Buffer.from('cert') };
    configurationUtilities.getEARSSSLSettings.mockReturnValue(sslSettings);

    await requestEarsRefreshToken(
      'my-provider',
      logger,
      { refreshToken: 'stored-refresh-token' },
      configurationUtilities
    );

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({ sslOverrides: sslSettings })
    );
  });

  it('rejects with a catchable error (does not crash) when the configured EARS ssl files cannot be read', async () => {
    // Simulates an invalid xpack.actions.auth.ears.ssl.certificate/key path:
    // readFileSync throws inside getEARSSSLSettings when the request is built.
    configurationUtilities.getEARSSSLSettings.mockImplementationOnce(() => {
      throw new Error("ENOENT: no such file or directory, open '/bad/cert.pem'");
    });

    // The failure surfaces as a rejected promise the caller can catch, rather than
    // an uncaught throw that crashes Kibana.
    await expect(
      requestEarsRefreshToken(
        'my-provider',
        logger,
        { refreshToken: 'stored-refresh-token' },
        configurationUtilities
      )
    ).rejects.toThrow("ENOENT: no such file or directory, open '/bad/cert.pem'");

    // The HTTP request is never attempted when the client certificate cannot be loaded.
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('returns a mapped token response on success', async () => {
    const result = await requestEarsRefreshToken(
      'my-provider',
      logger,
      { refreshToken: 'stored-refresh-token' },
      configurationUtilities
    );

    expect(result).toEqual({
      tokenType: 'Bearer',
      accessToken: 'new-access-token',
      expiresIn: 3600,
      refreshToken: 'new-refresh-token',
      refreshTokenExpiresIn: 604800,
    });
  });

  it('throws when the EARS refresh endpoint returns a non-200 status', async () => {
    mockRequest.mockResolvedValueOnce({
      status: 401,
      data: { error: 'invalid_token' },
    } as unknown as AxiosResponse);

    await expect(
      requestEarsRefreshToken(
        'my-provider',
        logger,
        { refreshToken: 'expired-refresh-token' },
        configurationUtilities
      )
    ).rejects.toThrow('Failed to refresh token from auth redirect service');
  });
});
