/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';

import type { AuthenticatedUser, KibanaRequest } from '@kbn/core/server';
import {
  elasticsearchServiceMock,
  httpServerMock,
  loggingSystemMock,
} from '@kbn/core/server/mocks';
import { mockAuthenticatedUser } from '@kbn/core-security-common/mocks';
import { HTTPAuthorizationHeader } from '@kbn/core-security-server';
import type { Logger } from '@kbn/logging';

import { UiamAPIKeys } from './uiam_api_keys';
import type { SecurityLicense } from '../../../../common';
import { licenseMock } from '../../../../common/licensing/index.mock';
import type { UiamServicePublic } from '../../../uiam';

describe('UiamAPIKeys', () => {
  let uiamApiKeys: UiamAPIKeys;
  let mockClusterClient: ReturnType<typeof elasticsearchServiceMock.createClusterClient>;
  let mockScopedClusterClient: ReturnType<
    typeof elasticsearchServiceMock.createScopedClusterClient
  >;
  let mockLicense: jest.Mocked<SecurityLicense>;
  let mockUiam: jest.Mocked<UiamServicePublic>;
  let mockGetCurrentUser: jest.Mock<AuthenticatedUser | null, [KibanaRequest]>;
  let logger: Logger;

  /** Mimics what Elasticsearch reports for a request authenticated with a UIAM API key. */
  const authenticatedWithApiKey = (internal: boolean) =>
    mockGetCurrentUser.mockReturnValue(
      mockAuthenticatedUser({
        authentication_type: 'api_key',
        api_key: { id: 'key-id', name: 'key-name', managed_by: 'cloud', internal },
      }) as AuthenticatedUser
    );

  beforeEach(() => {
    mockClusterClient = elasticsearchServiceMock.createClusterClient();
    mockScopedClusterClient = elasticsearchServiceMock.createScopedClusterClient();
    mockClusterClient.asScoped.mockReturnValue(mockScopedClusterClient);

    mockLicense = licenseMock.create();
    mockLicense.isEnabled.mockReturnValue(true);

    logger = loggingSystemMock.create().get('uiam-api-keys');

    mockUiam = {
      getAuthenticationHeaders: jest.fn(),
      getClientAuthentication: jest.fn(),
      getInternalCallerAttestationHeaders: jest.fn(),
      refreshSessionTokens: jest.fn(),
      invalidateSessionTokens: jest.fn(),
      grantApiKey: jest.fn(),
      revokeApiKey: jest.fn(),
      convertApiKeys: jest.fn(),
      exchangeOAuthToken: jest.fn(),
      createServiceAccount: jest.fn(),
      exchangeServiceAccountToken: jest.fn(),
      createOAuthClient: jest.fn(),
      listOAuthClients: jest.fn(),
      updateOAuthClient: jest.fn(),
      revokeOAuthClient: jest.fn(),
      deleteOAuthClient: jest.fn(),
      listOAuthConnections: jest.fn(),
      updateOAuthConnection: jest.fn(),
      revokeOAuthConnection: jest.fn(),
      deleteOAuthConnection: jest.fn(),
      resolveUsers: jest.fn(),
    };

    // Defaults to a session-authenticated user, which is not an API key and therefore still needs
    // Kibana's client authentication.
    mockGetCurrentUser = jest.fn().mockReturnValue(mockAuthenticatedUser() as AuthenticatedUser);

    uiamApiKeys = new UiamAPIKeys({
      logger,
      license: mockLicense,
      uiam: mockUiam,
      getCurrentUser: mockGetCurrentUser,
    });
  });

  describe('grant()', () => {
    const createMockRequest = (authHeader?: string): KibanaRequest => {
      return httpServerMock.createKibanaRequest({
        headers: authHeader ? { authorization: authHeader } : {},
      });
    };

    it('returns null when license is not enabled', async () => {
      mockLicense.isEnabled.mockReturnValue(false);
      const request = createMockRequest('ApiKey test_key');

      const result = await uiamApiKeys.grant(request, {
        name: 'test-key',
      });

      expect(result).toBeNull();
      expect(mockUiam.grantApiKey).not.toHaveBeenCalled();
    });

    it('throws error when request does not contain authorization header', async () => {
      const request = createMockRequest();

      await expect(uiamApiKeys.grant(request, { name: 'test-key' })).rejects.toThrow(
        'Unable to determine if request has UIAM credentials, request does not contain an authorization header'
      );
    });

    it('throws error when credentials do not start with UIAM prefix', async () => {
      const request = createMockRequest('ApiKey regular_api_key_123');

      await expect(
        uiamApiKeys.grant(request, {
          name: 'test-key',
          expiration: '7d',
        })
      ).rejects.toThrow('Cannot grant API key: provided credential is not compatible with UIAM');

      expect(mockUiam.grantApiKey).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        'Cannot grant API key: provided credential is not compatible with UIAM'
      );
    });

    it('grants a new API key via UIAM when credentials start with UIAM prefix', async () => {
      const request = createMockRequest('ApiKey essu_uiam_credential_123');
      mockUiam.grantApiKey.mockResolvedValue({
        id: 'new_key_id',
        key: 'essu_new_key_value',
        description: 'My Test Key',
      });

      const result = await uiamApiKeys.grant(request, {
        name: 'test-key',
        expiration: '7d',
      });

      expect(result).toEqual({
        id: 'new_key_id',
        name: 'My Test Key',
        api_key: 'essu_new_key_value',
      });
      expect(mockUiam.grantApiKey).toHaveBeenCalledWith(
        expect.objectContaining({
          scheme: 'ApiKey',
          credentials: 'essu_uiam_credential_123',
        }),
        {
          name: 'test-key',
          expiration: '7d',
        },
        { includeClientAuthentication: true }
      );

      expect(logger.debug).toHaveBeenCalledWith('Trying to grant an API key');
      expect(logger.debug).toHaveBeenCalledWith('Using authorization scheme: ApiKey');
      expect(logger.debug).toHaveBeenCalledWith('API key was granted successfully');
    });

    it('grants API key without expiration when not provided', async () => {
      const request = createMockRequest('ApiKey essu_uiam_credential_123');
      mockUiam.grantApiKey.mockResolvedValue({
        id: 'new_key_id',
        key: 'essu_new_key_value',
        description: 'My Test Key',
      });

      const result = await uiamApiKeys.grant(request, {
        name: 'test-key',
      });

      expect(result).toEqual({
        id: 'new_key_id',
        name: 'My Test Key',
        api_key: 'essu_new_key_value',
      });
      expect(mockUiam.grantApiKey).toHaveBeenCalledWith(
        expect.objectContaining({
          scheme: 'ApiKey',
          credentials: 'essu_uiam_credential_123',
        }),
        {
          name: 'test-key',
        },
        { includeClientAuthentication: true }
      );
    });

    // UIAM requires Kibana's client authentication for everything except external API keys, which
    // it rejects outright when it's present.
    describe('client authentication', () => {
      const grantWith = async (request: KibanaRequest) => {
        mockUiam.grantApiKey.mockResolvedValue({
          id: 'new_key_id',
          key: 'essu_new_key_value',
          description: 'My Test Key',
        });

        await uiamApiKeys.grant(request, { name: 'test-key' });

        return mockUiam.grantApiKey.mock.calls[0][2];
      };

      it('is omitted for an external API key', async () => {
        authenticatedWithApiKey(false);

        expect(await grantWith(createMockRequest('ApiKey essu_external_credential_123'))).toEqual({
          includeClientAuthentication: false,
        });
      });

      it('is included for an internal API key', async () => {
        authenticatedWithApiKey(true);

        expect(await grantWith(createMockRequest('ApiKey essu_internal_credential_123'))).toEqual({
          includeClientAuthentication: true,
        });
      });

      it('is included for a session access token', async () => {
        expect(await grantWith(createMockRequest('Bearer essu_access_token_123'))).toEqual({
          includeClientAuthentication: true,
        });
      });

      it('is included for a fake request, which carries an internal API key', async () => {
        mockGetCurrentUser.mockReturnValue(null);

        const request = httpServerMock.createFakeKibanaRequest({
          headers: { authorization: 'ApiKey essu_internal_credential_123' },
        });

        expect(await grantWith(request)).toEqual({ includeClientAuthentication: true });
      });
    });

    it('logs and throws error when UIAM API key grant fails', async () => {
      const request = createMockRequest('ApiKey essu_uiam_credential_123');
      const error = new Error('UIAM service error');
      mockUiam.grantApiKey.mockRejectedValue(error);

      await expect(uiamApiKeys.grant(request, { name: 'test-key' })).rejects.toThrow(
        'UIAM service error'
      );

      expect(logger.error).toHaveBeenCalledWith('Failed to grant API key: UIAM service error');
    });

    it('throws error when using Bearer scheme without UIAM prefix', async () => {
      const request = createMockRequest('Bearer regular_bearer_token_123');

      await expect(
        uiamApiKeys.grant(request, {
          name: 'test-key',
          expiration: '7d',
        })
      ).rejects.toThrow('Cannot grant API key: provided credential is not compatible with UIAM');

      expect(mockUiam.grantApiKey).not.toHaveBeenCalled();
    });

    it('grants a new API key via UIAM when using Bearer scheme with UIAM prefix', async () => {
      const request = createMockRequest('Bearer essu_uiam_bearer_token_123');
      mockUiam.grantApiKey.mockResolvedValue({
        id: 'new_bearer_key_id',
        key: 'essu_new_bearer_key_value',
        description: 'My Bearer Test Key',
      });

      const result = await uiamApiKeys.grant(request, {
        name: 'test-bearer-key',
        expiration: '30d',
      });

      expect(result).toEqual({
        id: 'new_bearer_key_id',
        name: 'My Bearer Test Key',
        api_key: 'essu_new_bearer_key_value',
      });
      expect(mockUiam.grantApiKey).toHaveBeenCalledWith(
        expect.objectContaining({
          scheme: 'Bearer',
          credentials: 'essu_uiam_bearer_token_123',
        }),
        {
          name: 'test-bearer-key',
          expiration: '30d',
        },
        { includeClientAuthentication: true }
      );
      expect(logger.debug).toHaveBeenCalledWith('Using authorization scheme: Bearer');
    });
  });

  describe('invalidate()', () => {
    const createMockRequest = (authHeader?: string): KibanaRequest => {
      return httpServerMock.createKibanaRequest({
        headers: authHeader ? { authorization: authHeader } : {},
      });
    };

    it('returns null when license is not enabled', async () => {
      mockLicense.isEnabled.mockReturnValue(false);
      const request = createMockRequest('ApiKey essu_test_key');

      const result = await uiamApiKeys.invalidate(request, {
        id: 'key_id_123',
      });

      expect(result).toBeNull();
      expect(mockUiam.revokeApiKey).not.toHaveBeenCalled();
    });

    it('throws error when request does not contain authorization header', async () => {
      const request = createMockRequest();

      await expect(uiamApiKeys.invalidate(request, { id: 'key_id_123' })).rejects.toThrow(
        'Unable to determine if request has UIAM credentials, request does not contain an authorization header'
      );
    });

    it('throws error when credentials do not start with UIAM prefix', async () => {
      const request = createMockRequest('ApiKey regular_api_key_123');

      await expect(uiamApiKeys.invalidate(request, { id: 'key_id_123' })).rejects.toThrow(
        'Cannot invalidate API key: not a UIAM API key'
      );
    });

    it('successfully invalidates a UIAM API key', async () => {
      const request = createMockRequest('ApiKey essu_uiam_credential_123');
      mockUiam.revokeApiKey.mockResolvedValue();

      const result = await uiamApiKeys.invalidate(request, {
        id: 'key_id_123',
      });

      expect(result).toEqual({
        invalidated_api_keys: ['key_id_123'],
        previously_invalidated_api_keys: [],
        error_count: 0,
      });
      expect(mockUiam.revokeApiKey).toHaveBeenCalledWith('key_id_123', 'essu_uiam_credential_123');
      expect(logger.debug).toHaveBeenCalledWith('Trying to invalidate API key key_id_123');
      expect(logger.debug).toHaveBeenCalledWith('API key key_id_123 was invalidated successfully');
    });

    it('returns error details with type "exception" when a non-Boom error occurs', async () => {
      const request = createMockRequest('ApiKey essu_uiam_credential_123');
      const error = new Error('Revocation failed');
      mockUiam.revokeApiKey.mockRejectedValue(error);

      const result = await uiamApiKeys.invalidate(request, {
        id: 'key_id_123',
      });

      expect(result).toEqual({
        invalidated_api_keys: [],
        previously_invalidated_api_keys: [],
        error_count: 1,
        error_details: [
          {
            type: 'exception',
            reason: 'Failed to invalidate API key key_id_123: Revocation failed',
          },
        ],
      });
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to invalidate API key key_id_123: Revocation failed'
      );
    });

    it('surfaces the UIAM error code in error_details type when a Boom error with payload occurs', async () => {
      const request = createMockRequest('ApiKey essu_uiam_credential_123');
      const boomError = new Boom.Boom('APIKEY_REVOKED');
      boomError.output = {
        statusCode: 404,
        payload: { error: { code: '0xD38358', message: 'APIKEY_REVOKED' } } as any,
        headers: {},
      };
      mockUiam.revokeApiKey.mockRejectedValue(boomError);

      const result = await uiamApiKeys.invalidate(request, {
        id: 'key_id_123',
      });

      expect(result).toEqual({
        invalidated_api_keys: [],
        previously_invalidated_api_keys: [],
        error_count: 1,
        error_details: [
          {
            type: 'exception',
            reason: expect.stringContaining('Failed to invalidate API key key_id_123'),
            code: '0xD38358',
          },
        ],
      });
    });

    it('does not include code when Boom error has no UIAM error code', async () => {
      const request = createMockRequest('ApiKey essu_uiam_credential_123');
      const boomError = new Boom.Boom('Bad request', { statusCode: 400 });
      mockUiam.revokeApiKey.mockRejectedValue(boomError);

      const result = await uiamApiKeys.invalidate(request, {
        id: 'key_id_123',
      });

      expect(result!.error_details![0].type).toBe('exception');
      expect(result!.error_details![0].code).toBeUndefined();
    });
  });

  describe('convert()', () => {
    it('returns null when license is not enabled', async () => {
      mockLicense.isEnabled.mockReturnValue(false);

      const result = await uiamApiKeys.convert(['es-api-key']);

      expect(result).toBeNull();
      expect(mockUiam.convertApiKeys).not.toHaveBeenCalled();
    });

    it('successfully converts API keys via UIAM', async () => {
      const mockResponse = {
        results: [
          {
            status: 'success' as const,
            id: 'converted-key-id',
            key: 'essu_converted_key',
            description: 'converted key',
            organization_id: 'org-123',
            internal: true,
            role_assignments: {},
            creation_date: '2026-01-01T00:00:00Z',
            expiration_date: null,
          },
        ],
      };
      mockUiam.convertApiKeys.mockResolvedValue(mockResponse);

      const result = await uiamApiKeys.convert(['es-api-key-base64']);

      expect(result).toEqual(mockResponse);
      expect(mockUiam.convertApiKeys).toHaveBeenCalledWith(['es-api-key-base64']);
      expect(logger.debug).toHaveBeenCalledWith('Trying to convert 1 API key(s)');
    });

    it('injects the same elasticsearch URL endpoint for all keys', async () => {
      const mockResponse = {
        results: [
          {
            status: 'success' as const,
            id: 'k1',
            key: 'essu_k1',
            description: 'key 1',
            organization_id: 'org-1',
            internal: true,
            role_assignments: {},
            creation_date: '2026-01-01T00:00:00Z',
            expiration_date: null,
          },
          {
            status: 'failed' as const,
            code: 'ES_API_KEY_AUTHENTICATION_FAILED',
            message: 'Auth failed',
            resource: null,
            type: 'UNKNOWN',
          },
        ],
      };
      mockUiam.convertApiKeys.mockResolvedValue(mockResponse);

      const result = await uiamApiKeys.convert(['valid-key', 'invalid-key']);

      expect(result).toEqual(mockResponse);
      expect(mockUiam.convertApiKeys).toHaveBeenCalledWith(['valid-key', 'invalid-key']);
    });

    it('logs and throws error when UIAM conversion fails', async () => {
      const error = new Error('UIAM service error');
      mockUiam.convertApiKeys.mockRejectedValue(error);

      await expect(uiamApiKeys.convert(['es-api-key'])).rejects.toThrow('UIAM service error');

      expect(logger.error).toHaveBeenCalledWith('Failed to convert API keys: UIAM service error');
    });
  });

  describe('getAuthorizationHeader()', () => {
    it('extracts authorization header from request', () => {
      const request = httpServerMock.createKibanaRequest({
        headers: {
          authorization: 'Bearer test_token_123',
        },
      });

      const result = UiamAPIKeys.getAuthorizationHeader(request);

      expect(result).toBeInstanceOf(HTTPAuthorizationHeader);
      expect(result.scheme).toBe('Bearer');
      expect(result.credentials).toBe('test_token_123');
    });

    it('throws error when authorization header is missing', () => {
      const request = httpServerMock.createKibanaRequest();

      expect(() => UiamAPIKeys.getAuthorizationHeader(request)).toThrow(
        'Unable to determine if request has UIAM credentials, request does not contain an authorization header'
      );
    });

    it('handles ApiKey scheme correctly', () => {
      const request = httpServerMock.createKibanaRequest({
        headers: {
          authorization: 'ApiKey essu_key_value',
        },
      });

      const result = UiamAPIKeys.getAuthorizationHeader(request);

      expect(result.scheme).toBe('ApiKey');
      expect(result.credentials).toBe('essu_key_value');
    });
  });
});
