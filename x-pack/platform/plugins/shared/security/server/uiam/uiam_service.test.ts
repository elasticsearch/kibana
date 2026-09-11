/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import fs from 'fs';
import undici from 'undici';

import { loggingSystemMock } from '@kbn/core/server/mocks';
import {
  deriveInternalCallerAttestation,
  HTTPAuthorizationHeader,
  UIAM_INTERNAL_CALLER_ATTESTATION_HEADER,
} from '@kbn/core-security-server';
import type { ServiceAccount } from '@kbn/core-security-server';

import {
  type GrantUiamApiKeyRequestBody,
  type GrantUiamApiKeyResponse,
  type OAuthClientResponse,
  type OAuthConnectionResponse,
  UiamService,
} from './uiam_service';
import { ES_CLIENT_AUTHENTICATION_HEADER } from '../../common/constants';
import { ConfigSchema } from '../config';
import { securityTelemetry } from '../otel/instrumentation';

jest.mock('../otel/instrumentation', () => ({
  securityTelemetry: {
    recordOAuthTokenExchangeAttempt: jest.fn(),
  },
}));

const AGENT_MOCK = { name: "I'm the danger. I'm the one who knocks." };

describe('UiamService', () => {
  let uiamService: UiamService;
  let readFileSyncSpy: jest.SpyInstance;
  let agentSpy: jest.SpyInstance;
  let fetchSpy: jest.SpyInstance;
  beforeEach(() => {
    readFileSyncSpy = jest
      .spyOn(fs, 'readFileSync')
      .mockImplementation((path) => `mocked file content for ${path}`);
    agentSpy = jest.spyOn(undici, 'Agent').mockImplementation(() => AGENT_MOCK as any);
    fetchSpy = jest.spyOn(window, 'fetch');

    uiamService = new UiamService(
      loggingSystemMock.createLogger(),
      ConfigSchema.validate(
        {
          uiam: {
            enabled: true,
            url: 'https://uiam.service',
            sharedSecret: 'secret',
            ssl: { certificateAuthorities: '/some/ca/path' },
          },
        },
        { serverless: true }
      ).uiam,
      {
        kibanaServerResourceURL: 'https://my-project.kb.us-east-1.cloud.es.io:9243',
        elasticsearchUrl: 'https://es.example.com',
        kibanaVersion: '9.0.0',
      }
    );
  });

  afterEach(() => {
    readFileSyncSpy.mockRestore();
    agentSpy.mockRestore();
    fetchSpy.mockRestore();
  });

  describe('#constructor', () => {
    it('fails if UIAM functionality is not enabled', () => {
      expect(
        () =>
          new UiamService(
            loggingSystemMock.createLogger(),
            {
              enabled: false,
              url: 'https://uiam.service',
              sharedSecret: 'secret',
              ssl: { verificationMode: 'none' },
            },
            { kibanaServerResourceURL: 'https://kibana.test', kibanaVersion: '9.0.0' }
          )
      ).toThrow('UIAM is not enabled.');
    });

    it('fails if UIAM service URL is not configured', () => {
      expect(
        () =>
          new UiamService(
            loggingSystemMock.createLogger(),
            {
              enabled: true,
              sharedSecret: 'secret',
              ssl: { verificationMode: 'none' },
            },
            { kibanaServerResourceURL: 'https://kibana.test', kibanaVersion: '9.0.0' }
          )
      ).toThrow('UIAM URL is not configured.');
    });

    it('fails if UIAM service shared secret is not configured', () => {
      expect(
        () =>
          new UiamService(
            loggingSystemMock.createLogger(),
            {
              enabled: true,
              url: 'https://uiam.service',
              ssl: { verificationMode: 'none' },
            },
            { kibanaServerResourceURL: 'https://kibana.test', kibanaVersion: '9.0.0' }
          )
      ).toThrow('UIAM shared secret is not configured.');
    });

    it('does not create custom dispatcher for `full` verification without custom TLS settings', () => {
      agentSpy.mockClear();
      new UiamService(
        loggingSystemMock.createLogger(),
        {
          enabled: true,
          url: 'https://uiam.service',
          sharedSecret: 'secret',
          ssl: { verificationMode: 'full' },
        },
        { kibanaServerResourceURL: 'https://kibana.test', kibanaVersion: '9.0.0' }
      );
      expect(agentSpy).not.toHaveBeenCalled();
    });

    it('creates a custom dispatcher for `full` verification when custom CAs are needed', () => {
      agentSpy.mockClear();
      new UiamService(
        loggingSystemMock.createLogger(),
        {
          enabled: true,
          url: 'https://uiam.service',
          sharedSecret: 'secret',
          ssl: { verificationMode: 'full', certificateAuthorities: '/some/ca/path' },
        },
        { kibanaServerResourceURL: 'https://kibana.test', kibanaVersion: '9.0.0' }
      );
      expect(agentSpy).toHaveBeenCalledTimes(1);
      expect(agentSpy).toHaveBeenCalledWith({
        connect: {
          ca: ['mocked file content for /some/ca/path'],
          allowPartialTrustChain: true,
          rejectUnauthorized: true,
        },
      });

      agentSpy.mockClear();
      new UiamService(
        loggingSystemMock.createLogger(),
        {
          enabled: true,
          url: 'https://uiam.service',
          sharedSecret: 'secret',
          ssl: {
            verificationMode: 'full',
            certificateAuthorities: ['/some/ca/path-1', '/some/ca/path-2'],
          },
        },
        { kibanaServerResourceURL: 'https://kibana.test', kibanaVersion: '9.0.0' }
      );
      expect(agentSpy).toHaveBeenCalledTimes(1);
      expect(agentSpy).toHaveBeenCalledWith({
        connect: {
          ca: [
            'mocked file content for /some/ca/path-1',
            'mocked file content for /some/ca/path-2',
          ],
          allowPartialTrustChain: true,
          rejectUnauthorized: true,
        },
      });
    });

    it('creates a custom dispatcher for `certificate` verification', () => {
      agentSpy.mockClear();
      new UiamService(
        loggingSystemMock.createLogger(),
        {
          enabled: true,
          url: 'https://uiam.service',
          sharedSecret: 'secret',
          ssl: { verificationMode: 'certificate', certificateAuthorities: '/some/ca/path' },
        },
        { kibanaServerResourceURL: 'https://kibana.test', kibanaVersion: '9.0.0' }
      );
      expect(agentSpy).toHaveBeenCalledTimes(1);
      expect(agentSpy).toHaveBeenCalledWith({
        connect: {
          ca: ['mocked file content for /some/ca/path'],
          allowPartialTrustChain: true,
          rejectUnauthorized: true,
          checkServerIdentity: expect.any(Function),
        },
      });

      agentSpy.mockClear();
      new UiamService(
        loggingSystemMock.createLogger(),
        {
          enabled: true,
          url: 'https://uiam.service',
          sharedSecret: 'secret',
          ssl: { verificationMode: 'certificate' },
        },
        { kibanaServerResourceURL: 'https://kibana.test', kibanaVersion: '9.0.0' }
      );
      expect(agentSpy).toHaveBeenCalledTimes(1);
      expect(agentSpy).toHaveBeenCalledWith({
        connect: {
          allowPartialTrustChain: true,
          rejectUnauthorized: true,
          checkServerIdentity: expect.any(Function),
        },
      });
    });

    it('creates a custom dispatcher for `none` verification', () => {
      agentSpy.mockClear();
      new UiamService(
        loggingSystemMock.createLogger(),
        {
          enabled: true,
          url: 'https://uiam.service',
          sharedSecret: 'secret',
          ssl: { verificationMode: 'none' },
        },
        { kibanaServerResourceURL: 'https://kibana.test', kibanaVersion: '9.0.0' }
      );
      expect(agentSpy).toHaveBeenCalledTimes(1);
      expect(agentSpy).toHaveBeenCalledWith({
        connect: { allowPartialTrustChain: true, rejectUnauthorized: false },
      });
    });

    it('creates a custom dispatcher with client certificate and key for mTLS', () => {
      agentSpy.mockClear();
      new UiamService(
        loggingSystemMock.createLogger(),
        {
          enabled: true,
          url: 'https://uiam.service',
          sharedSecret: 'secret',
          ssl: {
            verificationMode: 'full',
            certificate: '/path/to/cert.pem',
            key: '/path/to/key.pem',
          },
        },
        { kibanaServerResourceURL: 'https://kibana.test', kibanaVersion: '9.0.0' }
      );
      expect(agentSpy).toHaveBeenCalledTimes(1);
      expect(agentSpy).toHaveBeenCalledWith({
        connect: {
          cert: 'mocked file content for /path/to/cert.pem',
          key: 'mocked file content for /path/to/key.pem',
          allowPartialTrustChain: true,
          rejectUnauthorized: true,
        },
      });
    });

    it('creates a custom dispatcher with mTLS client cert and CAs', () => {
      agentSpy.mockClear();
      new UiamService(
        loggingSystemMock.createLogger(),
        {
          enabled: true,
          url: 'https://uiam.service',
          sharedSecret: 'secret',
          ssl: {
            verificationMode: 'full',
            certificate: '/path/to/cert.pem',
            key: '/path/to/key.pem',
            certificateAuthorities: '/some/ca/path',
          },
        },
        { kibanaServerResourceURL: 'https://kibana.test', kibanaVersion: '9.0.0' }
      );
      expect(agentSpy).toHaveBeenCalledTimes(1);
      expect(agentSpy).toHaveBeenCalledWith({
        connect: {
          ca: ['mocked file content for /some/ca/path'],
          cert: 'mocked file content for /path/to/cert.pem',
          key: 'mocked file content for /path/to/key.pem',
          allowPartialTrustChain: true,
          rejectUnauthorized: true,
        },
      });
    });
  });

  describe('#getAuthenticationHeaders', () => {
    it('includes shared secret as a separate header', () => {
      expect(uiamService.getAuthenticationHeaders('some-token')).toEqual({
        authorization: `Bearer some-token`,
        [ES_CLIENT_AUTHENTICATION_HEADER]: 'secret',
      });
    });
  });

  describe('#getClientAuthentication', () => {
    it('includes shared secret in client authentication', () => {
      expect(uiamService.getClientAuthentication()).toEqual({
        scheme: 'SharedSecret',
        value: 'secret',
      });
    });
  });

  describe('#getInternalCallerAttestationHeaders', () => {
    it('carries the attestation derived from the shared secret, and never the secret itself', () => {
      const credential = new HTTPAuthorizationHeader('Bearer', 'essu_one');
      expect(uiamService.getInternalCallerAttestationHeaders(credential)).toEqual({
        [UIAM_INTERNAL_CALLER_ATTESTATION_HEADER]: deriveInternalCallerAttestation(
          'secret',
          credential
        ),
      });
    });

    it('binds the attestation to the credential', () => {
      expect(
        uiamService.getInternalCallerAttestationHeaders(
          new HTTPAuthorizationHeader('Bearer', 'essu_one')
        )
      ).not.toEqual(
        uiamService.getInternalCallerAttestationHeaders(
          new HTTPAuthorizationHeader('Bearer', 'essu_two')
        )
      );
    });
  });

  describe('#refreshSessionTokens', () => {
    it('properly calls UIAM service to refresh the tokens', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: 'new-token', refresh_token: 'new-refresh' }),
      });

      await expect(uiamService.refreshSessionTokens('old-refresh')).resolves.toEqual({
        accessToken: 'new-token',
        refreshToken: 'new-refresh',
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith('https://uiam.service/uiam/api/v1/tokens/_refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Kibana/9.0.0',
          [ES_CLIENT_AUTHENTICATION_HEADER]: 'secret',
        },
        body: JSON.stringify({ refresh_token: 'old-refresh' }),
        dispatcher: AGENT_MOCK,
      });
    });

    it('throws error if refresh fails with 400 status code', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 400,
        headers: new Headers(),
        json: async () => ({ error: { message: 'Bad request' } }),
      });

      await expect(uiamService.refreshSessionTokens('old-refresh')).rejects.toThrow('Bad request');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith('https://uiam.service/uiam/api/v1/tokens/_refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Kibana/9.0.0',
          [ES_CLIENT_AUTHENTICATION_HEADER]: 'secret',
        },
        body: JSON.stringify({ refresh_token: 'old-refresh' }),
        dispatcher: AGENT_MOCK,
      });
    });
  });

  describe('#invalidateSessionTokens', () => {
    it('properly calls UIAM service to invalidate the tokens', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ invalidated_tokens: 2 }),
      });

      await uiamService.invalidateSessionTokens('old-token', 'old-refresh');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith('https://uiam.service/uiam/api/v1/tokens/_invalidate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Kibana/9.0.0',
          [ES_CLIENT_AUTHENTICATION_HEADER]: 'secret',
          Authorization: 'Bearer old-token',
        },
        body: JSON.stringify({ tokens: ['old-token', 'old-refresh'] }),
        dispatcher: AGENT_MOCK,
      });
    });

    it('throws error if invalidation fails with 400 status code', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 400,
        headers: new Headers(),
        json: async () => ({ error: { message: 'Bad request' } }),
      });

      await expect(uiamService.invalidateSessionTokens('old-token', 'old-refresh')).rejects.toThrow(
        'Bad request'
      );

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith('https://uiam.service/uiam/api/v1/tokens/_invalidate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Kibana/9.0.0',
          [ES_CLIENT_AUTHENTICATION_HEADER]: 'secret',
          Authorization: 'Bearer old-token',
        },
        body: JSON.stringify({ tokens: ['old-token', 'old-refresh'] }),
        dispatcher: AGENT_MOCK,
      });
    });
  });

  describe('#exchangeOAuthToken', () => {
    beforeEach(() => {
      (securityTelemetry.recordOAuthTokenExchangeAttempt as jest.Mock).mockClear();
    });

    it('properly calls UIAM service to exchange an OAuth token for an ephemeral token', async () => {
      const mockResponse = {
        token: 'essu_ephemeral_token_value',
        credentials: {
          oauth: {
            audience: 'https://my-project.kb.us-east-1.cloud.es.io:9243',
          },
        },
      };

      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await expect(uiamService.exchangeOAuthToken('essu_oauth_access_token')).resolves.toBe(
        'essu_ephemeral_token_value'
      );

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://uiam.service/uiam/api/v1/authentication/_authenticate?include_token=true&audience=https%3A%2F%2Fmy-project.kb.us-east-1.cloud.es.io%3A9243',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Kibana/9.0.0',
            Authorization: 'Bearer essu_oauth_access_token',
          },
          dispatcher: AGENT_MOCK,
        }
      );
      expect(securityTelemetry.recordOAuthTokenExchangeAttempt).toHaveBeenCalledWith(
        expect.any(Number),
        { outcome: 'success' }
      );
    });

    it('throws when audience in response does not match expected audience', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({
          token: 'essu_ephemeral_token_value',
          credentials: {
            oauth: { audience: 'https://wrong-kibana.example.com' },
          },
        }),
      });

      await expect(uiamService.exchangeOAuthToken('essu_oauth_access_token')).rejects.toThrow(
        'OAuth token audience mismatch'
      );
      expect(securityTelemetry.recordOAuthTokenExchangeAttempt).toHaveBeenCalledWith(
        expect.any(Number),
        {
          outcome: 'failure',
          oauthErrorType: 'KIBANA.AUDIENCE_MISMATCH',
          oauthErrorCode: undefined,
        }
      );
    });

    it('throws and logs error when UIAM service returns an error', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Invalid token' } }),
        headers: new Headers(),
      });

      await expect(uiamService.exchangeOAuthToken('essu_invalid_token')).rejects.toThrow();
      expect(securityTelemetry.recordOAuthTokenExchangeAttempt).toHaveBeenCalledWith(
        expect.any(Number),
        { outcome: 'failure', oauthErrorType: 'UNKNOWN', oauthErrorCode: undefined }
      );
    });

    it('records the UIAM error type when the exchange fails with a classified error', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          request_id: '2f26103be7be5483ef70f099ca9d5567',
          error: {
            message: 'Authentication failed',
            type: 'AUTHENTICATION.TOKEN',
            resource: 'ba6ab8be-9c98-43ec-a5f9-7b163af9e432',
            code: '0x7E0116',
          },
        }),
        headers: new Headers(),
      });

      await expect(uiamService.exchangeOAuthToken('essu_expired_token')).rejects.toThrow();
      expect(securityTelemetry.recordOAuthTokenExchangeAttempt).toHaveBeenCalledWith(
        expect.any(Number),
        { outcome: 'failure', oauthErrorType: 'AUTHENTICATION.TOKEN', oauthErrorCode: '0x7E0116' }
      );
    });
  });

  describe('#grantApiKey', () => {
    it('properly calls UIAM service to grant an API key with Bearer scheme and name', async () => {
      const mockResponse: GrantUiamApiKeyResponse = {
        id: 'api-key-id',
        key: 'encoded-key-value',
        description: 'my-api-key',
      };

      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await expect(
        uiamService.grantApiKey(new HTTPAuthorizationHeader('Bearer', 'access-token'), {
          name: 'my-api-key',
        })
      ).resolves.toEqual(mockResponse);

      const expectedRequestBody: GrantUiamApiKeyRequestBody = {
        description: 'my-api-key',
        internal: true,
        role_assignments: {
          limit: {
            access: ['application'],
            resource: ['project'],
          },
        },
      };

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith('https://uiam.service/uiam/api/v1/api-keys/_grant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Kibana/9.0.0',
          [ES_CLIENT_AUTHENTICATION_HEADER]: 'secret',
          Authorization: 'Bearer access-token',
        },
        body: JSON.stringify(expectedRequestBody),
        dispatcher: AGENT_MOCK,
      });
    });

    it('properly calls UIAM service to grant an API key with ApiKey scheme and name', async () => {
      const mockResponse: GrantUiamApiKeyResponse = {
        id: 'api-key-id',
        key: 'essu_api_key_from_grant',
        description: 'api-key-from-grant',
      };

      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await expect(
        uiamService.grantApiKey(new HTTPAuthorizationHeader('ApiKey', 'essu_api_key'), {
          name: 'api-key-from-grant',
        })
      ).resolves.toEqual(mockResponse);

      const expectedRequestBody: GrantUiamApiKeyRequestBody = {
        description: 'api-key-from-grant',
        internal: true,
        role_assignments: {
          limit: {
            access: ['application'],
            resource: ['project'],
          },
        },
      };

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith('https://uiam.service/uiam/api/v1/api-keys/_grant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Kibana/9.0.0',
          [ES_CLIENT_AUTHENTICATION_HEADER]: 'secret',
          Authorization: 'ApiKey essu_api_key',
        },
        body: JSON.stringify(expectedRequestBody),
        dispatcher: AGENT_MOCK,
      });
    });

    it('withholds only the shared secret (not the mTLS certificate) when client authentication is not requested', async () => {
      const mockResponse: GrantUiamApiKeyResponse = {
        id: 'api-key-id',
        key: 'essu_api_key_from_grant',
        description: 'api-key-from-grant',
      };
      agentSpy.mockClear();
      const mtlsUiamService = new UiamService(
        loggingSystemMock.createLogger(),
        ConfigSchema.validate(
          {
            uiam: {
              enabled: true,
              url: 'https://uiam.service',
              sharedSecret: 'secret',
              ssl: {
                certificateAuthorities: '/some/ca/path',
                certificate: '/path/to/cert.pem',
                key: '/path/to/key.pem',
              },
            },
          },
          { serverless: true }
        ).uiam,
        { kibanaServerResourceURL: 'https://kibana.test', kibanaVersion: '9.0.0' }
      );

      // The dispatcher created during construction always includes the mTLS client certificate.
      expect(agentSpy).toHaveBeenCalledWith({
        connect: {
          ca: ['mocked file content for /some/ca/path'],
          cert: 'mocked file content for /path/to/cert.pem',
          key: 'mocked file content for /path/to/key.pem',
          allowPartialTrustChain: true,
          rejectUnauthorized: true,
        },
      });

      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await expect(
        mtlsUiamService.grantApiKey(
          new HTTPAuthorizationHeader('ApiKey', 'essu_api_key'),
          {
            name: 'api-key-from-grant',
          },
          { includeClientAuthentication: false }
        )
      ).resolves.toEqual(mockResponse);

      const expectedRequestBody: GrantUiamApiKeyRequestBody = {
        description: 'api-key-from-grant',
        internal: true,
        role_assignments: {
          limit: {
            access: ['application'],
            resource: ['project'],
          },
        },
      };

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith('https://uiam.service/uiam/api/v1/api-keys/_grant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Kibana/9.0.0',
          Authorization: 'ApiKey essu_api_key',
        },
        body: JSON.stringify(expectedRequestBody),
        dispatcher: AGENT_MOCK,
      });
    });

    it('properly calls UIAM service to grant an API key with expiration', async () => {
      const mockResponse: GrantUiamApiKeyResponse = {
        id: 'api-key-id-with-exp',
        key: 'encoded-key-with-expiration',
        description: 'test-key-with-exp',
      };

      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await expect(
        uiamService.grantApiKey(new HTTPAuthorizationHeader('Bearer', 'access-token'), {
          name: 'test-key-with-exp',
          expiration: '7d',
        })
      ).resolves.toEqual(mockResponse);

      const expectedRequestBody: GrantUiamApiKeyRequestBody = {
        description: 'test-key-with-exp',
        internal: true,
        expiration: '7d',
        role_assignments: {
          limit: {
            access: ['application'],
            resource: ['project'],
          },
        },
      };

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith('https://uiam.service/uiam/api/v1/api-keys/_grant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Kibana/9.0.0',
          [ES_CLIENT_AUTHENTICATION_HEADER]: 'secret',
          Authorization: 'Bearer access-token',
        },
        body: JSON.stringify(expectedRequestBody),
        dispatcher: AGENT_MOCK,
      });
    });

    it('throws error if granting API key fails with 400 status code', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 400,
        headers: new Headers(),
        json: async () => ({ error: { message: 'Invalid request' } }),
      });

      await expect(
        uiamService.grantApiKey(new HTTPAuthorizationHeader('Bearer', 'access-token'), {
          name: 'test-key',
        })
      ).rejects.toThrow('Invalid request');

      const expectedRequestBody: GrantUiamApiKeyRequestBody = {
        description: 'test-key',
        internal: true,
        role_assignments: {
          limit: {
            access: ['application'],
            resource: ['project'],
          },
        },
      };

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith('https://uiam.service/uiam/api/v1/api-keys/_grant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Kibana/9.0.0',
          [ES_CLIENT_AUTHENTICATION_HEADER]: 'secret',
          Authorization: 'Bearer access-token',
        },
        body: JSON.stringify(expectedRequestBody),
        dispatcher: AGENT_MOCK,
      });
    });

    it('throws error with "Unknown error" message if error response has no message', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers(),
        json: async () => ({ error: {} }),
      });

      await expect(
        uiamService.grantApiKey(new HTTPAuthorizationHeader('Bearer', 'access-token'), {
          name: 'test-key',
        })
      ).rejects.toThrow('Unknown error');
    });

    it('throws error if granting API key fails with 401 unauthorized status code', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers(),
        json: async () => ({ error: { message: 'Unauthorized' } }),
      });

      await expect(
        uiamService.grantApiKey(new HTTPAuthorizationHeader('Bearer', 'invalid-token'), {
          name: 'test-key',
        })
      ).rejects.toThrow('Unauthorized');
    });

    it('throws error if granting API key fails with 403 forbidden status code', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 403,
        headers: new Headers(),
        json: async () => ({ error: { message: 'Forbidden' } }),
      });

      await expect(
        uiamService.grantApiKey(new HTTPAuthorizationHeader('Bearer', 'access-token'), {
          name: 'test-key',
        })
      ).rejects.toThrow('Forbidden');
    });

    it('throws error if granting API key fails with 500 server error status code', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers(),
        json: async () => ({ error: { message: 'Internal Server Error' } }),
      });

      await expect(
        uiamService.grantApiKey(new HTTPAuthorizationHeader('Bearer', 'access-token'), {
          name: 'test-key',
        })
      ).rejects.toThrow('Internal Server Error');
    });
  });

  describe('#revokeApiKey', () => {
    it('properly calls UIAM service to revoke an API key', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 204,
      });

      await uiamService.revokeApiKey('test-key-id', 'access-token');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://uiam.service/uiam/api/v1/api-keys/test-key-id',
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Kibana/9.0.0',
            [ES_CLIENT_AUTHENTICATION_HEADER]: 'secret',
            Authorization: 'ApiKey access-token',
          },
          dispatcher: AGENT_MOCK,
        }
      );
    });

    it('throws error if revocation fails with 400 status code', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 400,
        headers: new Headers(),
        json: async () => ({ error: { message: 'Bad request' } }),
      });

      await expect(uiamService.revokeApiKey('test-key-id', 'access-token')).rejects.toThrow(
        'Bad request'
      );

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://uiam.service/uiam/api/v1/api-keys/test-key-id',
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Kibana/9.0.0',
            [ES_CLIENT_AUTHENTICATION_HEADER]: 'secret',
            Authorization: 'ApiKey access-token',
          },
          dispatcher: AGENT_MOCK,
        }
      );
    });
  });

  describe('#convertApiKeys', () => {
    it('properly calls UIAM service to convert API keys with injected endpoint', async () => {
      const mockResponse = {
        results: [
          {
            status: 'success',
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

      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await expect(uiamService.convertApiKeys(['es-api-key-base64'])).resolves.toEqual(
        mockResponse
      );

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith('https://uiam.service/uiam/api/v1/api-keys/_convert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Kibana/9.0.0',
          [ES_CLIENT_AUTHENTICATION_HEADER]: 'secret',
        },
        body: JSON.stringify({
          keys: [
            { type: 'elasticsearch', key: 'es-api-key-base64', endpoint: 'https://es.example.com' },
          ],
        }),
        dispatcher: AGENT_MOCK,
      });
    });

    it('properly calls UIAM service to convert multiple API keys with injected endpoint', async () => {
      const mockResponse = {
        results: [
          {
            status: 'success',
            id: 'key-1',
            key: 'essu_key_1',
            description: 'key 1',
            organization_id: 'org-1',
            internal: true,
            role_assignments: {},
            creation_date: '2026-01-01T00:00:00Z',
            expiration_date: null,
          },
          {
            status: 'failed',
            code: 'ES_API_KEY_AUTHENTICATION_FAILED',
            message: 'Auth failed',
            resource: null,
            type: 'UNKNOWN',
          },
        ],
      };

      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await expect(uiamService.convertApiKeys(['valid-key', 'invalid-key'])).resolves.toEqual(
        mockResponse
      );

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith('https://uiam.service/uiam/api/v1/api-keys/_convert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Kibana/9.0.0',
          [ES_CLIENT_AUTHENTICATION_HEADER]: 'secret',
        },
        body: JSON.stringify({
          keys: [
            { type: 'elasticsearch', key: 'valid-key', endpoint: 'https://es.example.com' },
            { type: 'elasticsearch', key: 'invalid-key', endpoint: 'https://es.example.com' },
          ],
        }),
        dispatcher: AGENT_MOCK,
      });
    });

    it('throws when elasticsearchUrl is not configured', async () => {
      const serviceWithoutUrl = new UiamService(
        loggingSystemMock.createLogger(),
        ConfigSchema.validate(
          {
            uiam: {
              enabled: true,
              url: 'https://uiam.service',
              sharedSecret: 'secret',
              ssl: { certificateAuthorities: '/some/ca/path' },
            },
          },
          { serverless: true }
        ).uiam,
        { kibanaServerResourceURL: 'https://kibana.test', kibanaVersion: '9.0.0' }
      );

      await expect(serviceWithoutUrl.convertApiKeys(['es-api-key'])).rejects.toThrow(
        'Cannot convert API keys: Elasticsearch URL could not be resolved from cloud.id'
      );

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('throws error if conversion fails with 400 status code', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 400,
        headers: new Headers(),
        json: async () => ({ error: { message: 'Must authenticate using mTLS' } }),
      });

      await expect(uiamService.convertApiKeys(['es-api-key'])).rejects.toThrow(
        'Must authenticate using mTLS'
      );

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith('https://uiam.service/uiam/api/v1/api-keys/_convert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Kibana/9.0.0',
          [ES_CLIENT_AUTHENTICATION_HEADER]: 'secret',
        },
        body: JSON.stringify({
          keys: [{ type: 'elasticsearch', key: 'es-api-key', endpoint: 'https://es.example.com' }],
        }),
        dispatcher: AGENT_MOCK,
      });
    });
  });

  describe('#createServiceAccount', () => {
    const body = {
      organization_id: 'organization-id',
      name: 'nightshift-relay',
      role_assignments: { limit: { access: ['application'], resource: ['project'] } },
      assumable_by: [
        {
          type: 'project-service-account' as const,
          organization_id: 'organization-id',
          project_type: 'security',
          project_id: 'project-id',
        },
      ],
    };

    it('properly calls UIAM service to create a service account', async () => {
      const mockResponse: ServiceAccount = {
        id: 'service-account-id',
        type: 'project',
        name: 'nightshift-relay',
        organization_id: 'organization-id',
        role_assignments: body.role_assignments,
        assumable_by: body.assumable_by,
      };

      fetchSpy.mockResolvedValue({ ok: true, json: async () => mockResponse });

      await expect(
        uiamService.createServiceAccount(
          new HTTPAuthorizationHeader('Bearer', 'access-token'),
          body
        )
      ).resolves.toEqual(mockResponse);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith('https://uiam.service/uiam/api/v1/service-accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Kibana/9.0.0',
          [ES_CLIENT_AUTHENTICATION_HEADER]: 'secret',
          Authorization: 'Bearer access-token',
        },
        body: JSON.stringify({
          ...body,
          type: 'project',
        }),
        dispatcher: AGENT_MOCK,
      });
    });

    it.each([true, false])(
      'authenticates API keys with includeClientAuthentication=%s',
      async (includeClientAuthentication) => {
        fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ id: 'service-account-id' }) });
        await uiamService.createServiceAccount(
          new HTTPAuthorizationHeader('ApiKey', 'essu_key'),
          body,
          { includeClientAuthentication }
        );
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'Kibana/9.0.0',
              Authorization: 'ApiKey essu_key',
              ...(includeClientAuthentication
                ? { [ES_CLIENT_AUTHENTICATION_HEADER]: 'secret' }
                : {}),
            },
          })
        );
      }
    );

    it('withholds only the shared secret (not the mTLS certificate) when client authentication is not requested', async () => {
      agentSpy.mockClear();
      const mtlsUiamService = new UiamService(
        loggingSystemMock.createLogger(),
        ConfigSchema.validate(
          {
            uiam: {
              enabled: true,
              url: 'https://uiam.service',
              sharedSecret: 'secret',
              ssl: {
                certificateAuthorities: '/some/ca/path',
                certificate: '/path/to/cert.pem',
                key: '/path/to/key.pem',
              },
            },
          },
          { serverless: true }
        ).uiam,
        { kibanaServerResourceURL: 'https://kibana.test', kibanaVersion: '9.0.0' }
      );

      // The dispatcher created during construction always includes the mTLS client certificate.
      expect(agentSpy).toHaveBeenCalledWith({
        connect: {
          ca: ['mocked file content for /some/ca/path'],
          cert: 'mocked file content for /path/to/cert.pem',
          key: 'mocked file content for /path/to/key.pem',
          allowPartialTrustChain: true,
          rejectUnauthorized: true,
        },
      });

      fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ id: 'service-account-id' }) });
      await mtlsUiamService.createServiceAccount(
        new HTTPAuthorizationHeader('ApiKey', 'essu_key'),
        body,
        { includeClientAuthentication: false }
      );

      expect(fetchSpy).toHaveBeenCalledWith('https://uiam.service/uiam/api/v1/service-accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Kibana/9.0.0',
          Authorization: 'ApiKey essu_key',
        },
        body: JSON.stringify({
          ...body,
          type: 'project',
        }),
        dispatcher: AGENT_MOCK,
      });
    });

    it('reproduces the UIAM status code and payload when creation fails', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 409,
        headers: new Headers(),
        json: async () => ({
          error: {
            code: 'SERVICE_ACCOUNT_LIMIT_REACHED',
            type: 'conflict',
            message: 'Project has reached its service account limit',
          },
        }),
      });

      await expect(
        uiamService.createServiceAccount(
          new HTTPAuthorizationHeader('Bearer', 'access-token'),
          body
        )
      ).rejects.toMatchObject({
        output: { statusCode: 409 },
      });
    });

    it('logs and rethrows transport errors', async () => {
      fetchSpy.mockRejectedValue(new Error('socket hang up'));

      await expect(
        uiamService.createServiceAccount(
          new HTTPAuthorizationHeader('Bearer', 'access-token'),
          body
        )
      ).rejects.toThrowError('socket hang up');
    });
  });

  describe('#exchangeServiceAccountToken', () => {
    const exchangeLogger = loggingSystemMock.createLogger();

    beforeEach(() => {
      jest.mocked(exchangeLogger.debug).mockClear();
      jest.mocked(exchangeLogger.error).mockClear();
      uiamService = new UiamService(
        exchangeLogger,
        ConfigSchema.validate(
          {
            uiam: {
              enabled: true,
              url: 'https://uiam.service',
              sharedSecret: 'secret',
              ssl: { certificate: '/path/to/cert.pem', key: '/path/to/key.pem' },
            },
          },
          { serverless: true }
        ).uiam,
        {
          kibanaServerResourceURL: 'https://my-project.kb.us-east-1.cloud.es.io:9243',
          kibanaVersion: '9.0.0',
        }
      );
    });

    it('authenticates with mTLS without a shared secret or user credential', async () => {
      fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ token: 'essu_token' }) });

      await expect(uiamService.exchangeServiceAccountToken('service-account-id')).resolves.toEqual({
        token: 'essu_token',
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://uiam.service/uiam/api/v1/service-accounts/service-account-id/credentials/_exchange',
        {
          method: 'POST',
          headers: {
            'User-Agent': 'Kibana/9.0.0',
          },
          dispatcher: AGENT_MOCK,
        }
      );

      expect(agentSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          connect: expect.objectContaining({
            cert: 'mocked file content for /path/to/cert.pem',
            key: 'mocked file content for /path/to/key.pem',
          }),
        })
      );
      expect(exchangeLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('service-account-id')
      );
      const [, { headers }] = fetchSpy.mock.calls[0];
      expect(headers).not.toHaveProperty(ES_CLIENT_AUTHENTICATION_HEADER);
      expect(headers).not.toHaveProperty('Authorization');
      expect(headers).not.toHaveProperty('authorization');
    });

    it('URL-encodes the service account id', async () => {
      fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ token: 'essu_token' }) });

      await uiamService.exchangeServiceAccountToken('id/../with special?chars');

      expect(fetchSpy).toHaveBeenCalledWith(
        `https://uiam.service/uiam/api/v1/service-accounts/${encodeURIComponent(
          'id/../with special?chars'
        )}/credentials/_exchange`,
        expect.anything()
      );
    });

    it('reproduces the UIAM status code and payload when the exchange fails', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 403,
        headers: new Headers(),
        json: async () => ({
          error: {
            code: 'FORBIDDEN',
            type: 'authorization',
            message: 'Principal is not authorized to assume this service account',
          },
        }),
      });

      await expect(
        uiamService.exchangeServiceAccountToken('service-account-id')
      ).rejects.toMatchObject({ output: { statusCode: 403 } });
    });

    it('logs and rethrows transport errors', async () => {
      fetchSpy.mockRejectedValue(new Error('secret-credential'));

      await expect(
        uiamService.exchangeServiceAccountToken('service-account-id')
      ).rejects.toThrowError('secret-credential');
      expect(exchangeLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('service-account-id')
      );
      for (const call of jest.mocked(exchangeLogger.error).mock.calls) {
        expect(String(call[0])).not.toContain('secret-credential');
      }
    });
  });

  describe('#createOAuthClient', () => {
    it('properly calls UIAM service to create an OAuth client', async () => {
      const mockResponse: OAuthClientResponse = {
        id: 'client-id',
        resource: 'https://test-project.kb.us-central1.gcp.elastic.cloud',
        client_name: 'Test Client',
      };

      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await expect(
        uiamService.createOAuthClient('access-token', {
          resource: 'https://test-project.kb.us-central1.gcp.elastic.cloud',
          project_id: 'test-project-id',
          client_name: 'Test Client',
        })
      ).resolves.toEqual(mockResponse);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith('https://uiam.service/uiam/api/v1/oauth/clients', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Kibana/9.0.0',
          [ES_CLIENT_AUTHENTICATION_HEADER]: 'secret',
          Authorization: 'Bearer access-token',
        },
        body: JSON.stringify({
          resource: 'https://test-project.kb.us-central1.gcp.elastic.cloud',
          project_id: 'test-project-id',
          client_name: 'Test Client',
        }),
        dispatcher: AGENT_MOCK,
      });
    });

    it('throws error if creation fails', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 400,
        headers: new Headers(),
        json: async () => ({ error: { message: 'Bad request' } }),
      });

      await expect(
        uiamService.createOAuthClient('access-token', {
          resource: 'https://test-project.kb.us-central1.gcp.elastic.cloud',
          project_id: 'test-project-id',
        })
      ).rejects.toThrow('Bad request');
    });

    it('forwards redirect_uris, client_logo, and client_metadata verbatim to UIAM', async () => {
      const mockResponse: OAuthClientResponse = {
        id: 'client-id',
        resource: 'https://test-project.kb.us-central1.gcp.elastic.cloud',
        redirect_uris: ['https://example.com/cb'],
        client_logo: { media_type: 'image/png', data: 'abc' },
      };

      fetchSpy.mockResolvedValue({ ok: true, json: async () => mockResponse });

      const body = {
        resource: 'https://test-project.kb.us-central1.gcp.elastic.cloud',
        project_id: 'test-project-id',
        client_type: 'confidential' as const,
        client_metadata: { owner: 'admin' },
        client_logo: { media_type: 'image/png', data: 'abc' },
        redirect_uris: ['https://example.com/cb'],
      };

      await expect(uiamService.createOAuthClient('access-token', body)).resolves.toEqual(
        mockResponse
      );

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://uiam.service/uiam/api/v1/oauth/clients',
        expect.objectContaining({ method: 'POST', body: JSON.stringify(body) })
      );
    });

    it('surfaces UIAM ErrorDetails (code, type, resource) in the thrown Boom message', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 400,
        headers: new Headers(),
        json: async () => ({
          error: {
            code: 'INVALID_REDIRECT_URI',
            type: 'validation_error',
            resource: 'redirect_uris[0]',
            message: 'Redirect URI must not contain a fragment',
          },
        }),
      });

      await expect(
        uiamService.createOAuthClient('access-token', {
          resource: 'https://test-project.kb.us-central1.gcp.elastic.cloud',
          project_id: 'test-project-id',
        })
      ).rejects.toThrow(
        '[INVALID_REDIRECT_URI/validation_error] Redirect URI must not contain a fragment (resource: redirect_uris[0])'
      );
    });
  });

  describe('#listOAuthClients', () => {
    it('properly calls UIAM service to list OAuth clients', async () => {
      const mockResponse = { clients: [] };

      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await expect(uiamService.listOAuthClients('access-token')).resolves.toEqual(mockResponse);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith('https://uiam.service/uiam/api/v1/oauth/clients', {
        method: 'GET',
        headers: {
          'User-Agent': 'Kibana/9.0.0',
          [ES_CLIENT_AUTHENTICATION_HEADER]: 'secret',
          Authorization: 'Bearer access-token',
        },
        dispatcher: AGENT_MOCK,
      });
    });

    it('includes client_id query parameter when provided', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ clients: [] }),
      });

      await uiamService.listOAuthClients('access-token', 'specific-client-id');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://uiam.service/uiam/api/v1/oauth/clients?client_id=specific-client-id',
        {
          method: 'GET',
          headers: {
            'User-Agent': 'Kibana/9.0.0',
            [ES_CLIENT_AUTHENTICATION_HEADER]: 'secret',
            Authorization: 'Bearer access-token',
          },
          dispatcher: AGENT_MOCK,
        }
      );
    });

    it('includes project_id query parameter when provided', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ clients: [] }),
      });

      await uiamService.listOAuthClients('access-token', undefined, 'my-project-id');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://uiam.service/uiam/api/v1/oauth/clients?project_id=my-project-id',
        {
          method: 'GET',
          headers: {
            'User-Agent': 'Kibana/9.0.0',
            [ES_CLIENT_AUTHENTICATION_HEADER]: 'secret',
            Authorization: 'Bearer access-token',
          },
          dispatcher: AGENT_MOCK,
        }
      );
    });

    it('throws error if listing fails', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 403,
        headers: new Headers(),
        json: async () => ({ error: { message: 'Forbidden' } }),
      });

      await expect(uiamService.listOAuthClients('access-token')).rejects.toThrow('Forbidden');
    });
  });

  describe('#updateOAuthClient', () => {
    it('properly calls UIAM service to update an OAuth client', async () => {
      const mockResponse: OAuthClientResponse = {
        id: 'client-id',
        resource: 'https://test-project.kb.us-central1.gcp.elastic.cloud',
        client_name: 'Updated Name',
      };

      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await expect(
        uiamService.updateOAuthClient('access-token', 'client-id', {
          client_name: 'Updated Name',
          client_metadata: { key: 'value' },
        })
      ).resolves.toEqual(mockResponse);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://uiam.service/uiam/api/v1/oauth/clients/client-id',
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Kibana/9.0.0',
            [ES_CLIENT_AUTHENTICATION_HEADER]: 'secret',
            Authorization: 'Bearer access-token',
          },
          body: JSON.stringify({ client_name: 'Updated Name', client_metadata: { key: 'value' } }),
          dispatcher: AGENT_MOCK,
        }
      );
    });

    it('throws error if update fails', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 404,
        headers: new Headers(),
        json: async () => ({ error: { message: 'Client not found' } }),
      });

      await expect(
        uiamService.updateOAuthClient('access-token', 'missing-id', {
          client_metadata: {},
        })
      ).rejects.toThrow('Client not found');
    });

    it('encodes reserved characters in the client id path segment', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'weird/id?x#y',
          resource: 'https://test-project.kb.us-central1.gcp.elastic.cloud',
        }),
      });

      await uiamService.updateOAuthClient('access-token', 'weird/id?x#y', {
        client_name: 'Updated',
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://uiam.service/uiam/api/v1/oauth/clients/weird%2Fid%3Fx%23y',
        expect.objectContaining({ method: 'PATCH' })
      );
    });
  });

  describe('#revokeOAuthClient', () => {
    it('properly calls UIAM service to revoke an OAuth client', async () => {
      const mockResponse: OAuthClientResponse = {
        id: 'client-id',
        resource: 'https://test-project.kb.us-central1.gcp.elastic.cloud',
        revoked: true,
      };

      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await expect(
        uiamService.revokeOAuthClient('access-token', 'client-id', 'no longer needed')
      ).resolves.toEqual(mockResponse);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://uiam.service/uiam/api/v1/oauth/clients/client-id/_revoke',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Kibana/9.0.0',
            [ES_CLIENT_AUTHENTICATION_HEADER]: 'secret',
            Authorization: 'Bearer access-token',
          },
          body: JSON.stringify({ reason: 'no longer needed' }),
          dispatcher: AGENT_MOCK,
        }
      );
    });

    it('throws error if revocation fails', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 400,
        headers: new Headers(),
        json: async () => ({ error: { message: 'Already revoked' } }),
      });

      await expect(uiamService.revokeOAuthClient('access-token', 'client-id')).rejects.toThrow(
        'Already revoked'
      );
    });

    it('encodes reserved characters in the client id path segment', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'weird/id?x#y',
          resource: 'https://test-project.kb.us-central1.gcp.elastic.cloud',
          revoked: true,
        }),
      });

      await uiamService.revokeOAuthClient('access-token', 'weird/id?x#y');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://uiam.service/uiam/api/v1/oauth/clients/weird%2Fid%3Fx%23y/_revoke',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('#deleteOAuthClient', () => {
    it('properly calls UIAM service to delete an OAuth client', async () => {
      fetchSpy.mockResolvedValue({ ok: true, status: 204 });

      await expect(
        uiamService.deleteOAuthClient('access-token', 'client-id')
      ).resolves.toBeUndefined();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://uiam.service/uiam/api/v1/oauth/clients/client-id',
        {
          method: 'DELETE',
          headers: {
            'User-Agent': 'Kibana/9.0.0',
            [ES_CLIENT_AUTHENTICATION_HEADER]: 'secret',
            Authorization: 'Bearer access-token',
          },
          dispatcher: AGENT_MOCK,
        }
      );
    });

    it('throws error if deletion fails', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 404,
        headers: new Headers(),
        json: async () => ({ error: { message: 'OAuth client not found' } }),
      });

      await expect(uiamService.deleteOAuthClient('access-token', 'client-id')).rejects.toThrow(
        'OAuth client not found'
      );
    });

    it('encodes reserved characters in the client id path segment', async () => {
      fetchSpy.mockResolvedValue({ ok: true, status: 204 });

      await uiamService.deleteOAuthClient('access-token', 'weird/id?x#y');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://uiam.service/uiam/api/v1/oauth/clients/weird%2Fid%3Fx%23y',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('#listOAuthConnections', () => {
    it('properly calls UIAM service to list OAuth connections', async () => {
      const mockResponse = { connections: [] };

      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await expect(uiamService.listOAuthConnections('access-token')).resolves.toEqual(mockResponse);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith('https://uiam.service/uiam/api/v1/oauth/connections', {
        method: 'GET',
        headers: {
          'User-Agent': 'Kibana/9.0.0',
          [ES_CLIENT_AUTHENTICATION_HEADER]: 'secret',
          Authorization: 'Bearer access-token',
        },
        dispatcher: AGENT_MOCK,
      });
    });

    it('includes query parameters when provided', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ connections: [] }),
      });

      await uiamService.listOAuthConnections('access-token', 'cid', 'conn-id', 'my-project-id');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://uiam.service/uiam/api/v1/oauth/connections?client_id=cid&connection_id=conn-id&project_id=my-project-id',
        {
          method: 'GET',
          headers: {
            'User-Agent': 'Kibana/9.0.0',
            [ES_CLIENT_AUTHENTICATION_HEADER]: 'secret',
            Authorization: 'Bearer access-token',
          },
          dispatcher: AGENT_MOCK,
        }
      );
    });

    it('includes project_id query parameter when provided', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ connections: [] }),
      });

      await uiamService.listOAuthConnections('access-token', undefined, undefined, 'my-project-id');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://uiam.service/uiam/api/v1/oauth/connections?project_id=my-project-id',
        {
          method: 'GET',
          headers: {
            'User-Agent': 'Kibana/9.0.0',
            [ES_CLIENT_AUTHENTICATION_HEADER]: 'secret',
            Authorization: 'Bearer access-token',
          },
          dispatcher: AGENT_MOCK,
        }
      );
    });

    it('throws error if listing fails', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers(),
        json: async () => ({ error: { message: 'Internal Server Error' } }),
      });

      await expect(uiamService.listOAuthConnections('access-token')).rejects.toThrow(
        'Internal Server Error'
      );
    });
  });

  describe('#updateOAuthConnection', () => {
    it('properly calls UIAM service to update an OAuth connection', async () => {
      const mockResponse: OAuthConnectionResponse = {
        id: 'conn-id',
        client_id: 'client-id',
        resource: 'https://test-project.kb.us-central1.gcp.elastic.cloud',
        name: 'New name',
      };

      fetchSpy.mockResolvedValue({ ok: true, json: async () => mockResponse });

      await expect(
        uiamService.updateOAuthConnection('access-token', 'client-id', 'conn-id', {
          name: 'New name',
        })
      ).resolves.toEqual(mockResponse);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://uiam.service/uiam/api/v1/oauth/clients/client-id/connections/conn-id',
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Kibana/9.0.0',
            [ES_CLIENT_AUTHENTICATION_HEADER]: 'secret',
            Authorization: 'Bearer access-token',
          },
          body: JSON.stringify({ name: 'New name' }),
          dispatcher: AGENT_MOCK,
        }
      );
    });

    it('throws error if update fails', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 404,
        headers: new Headers(),
        json: async () => ({ error: { message: 'Connection not found' } }),
      });

      await expect(
        uiamService.updateOAuthConnection('access-token', 'client-id', 'missing', {
          name: 'x',
        })
      ).rejects.toThrow('Connection not found');
    });

    it('encodes reserved characters in both path segments', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'conn/id?x',
          client_id: 'client/id#y',
          resource: 'https://test-project.kb.us-central1.gcp.elastic.cloud',
          name: 'n',
        }),
      });

      await uiamService.updateOAuthConnection('access-token', 'client/id#y', 'conn/id?x', {
        name: 'n',
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://uiam.service/uiam/api/v1/oauth/clients/client%2Fid%23y/connections/conn%2Fid%3Fx',
        expect.objectContaining({ method: 'PATCH' })
      );
    });
  });

  describe('#revokeOAuthConnection', () => {
    it('properly calls UIAM service to revoke an OAuth connection', async () => {
      const mockResponse: OAuthConnectionResponse = {
        id: 'conn-id',
        client_id: 'client-id',
        resource: 'https://test-project.kb.us-central1.gcp.elastic.cloud',
        revoked: true,
      };

      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      await expect(
        uiamService.revokeOAuthConnection('access-token', 'client-id', 'conn-id', 'revoked')
      ).resolves.toEqual(mockResponse);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://uiam.service/uiam/api/v1/oauth/clients/client-id/connections/conn-id/_revoke',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Kibana/9.0.0',
            [ES_CLIENT_AUTHENTICATION_HEADER]: 'secret',
            Authorization: 'Bearer access-token',
          },
          body: JSON.stringify({ reason: 'revoked' }),
          dispatcher: AGENT_MOCK,
        }
      );
    });

    it('throws error if revocation fails', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 400,
        headers: new Headers(),
        json: async () => ({ error: { message: 'Connection not found' } }),
      });

      await expect(
        uiamService.revokeOAuthConnection('access-token', 'client-id', 'conn-id')
      ).rejects.toThrow('Connection not found');
    });

    it('encodes reserved characters in both path segments', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'conn/id?x',
          client_id: 'client/id#y',
          resource: 'https://test-project.kb.us-central1.gcp.elastic.cloud',
          revoked: true,
        }),
      });

      await uiamService.revokeOAuthConnection('access-token', 'client/id#y', 'conn/id?x');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://uiam.service/uiam/api/v1/oauth/clients/client%2Fid%23y/connections/conn%2Fid%3Fx/_revoke',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('#deleteOAuthConnection', () => {
    it('properly calls UIAM service to delete an OAuth connection', async () => {
      fetchSpy.mockResolvedValue({ ok: true, status: 204 });

      await expect(
        uiamService.deleteOAuthConnection('access-token', 'client-id', 'conn-id')
      ).resolves.toBeUndefined();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://uiam.service/uiam/api/v1/oauth/clients/client-id/connections/conn-id',
        {
          method: 'DELETE',
          headers: {
            'User-Agent': 'Kibana/9.0.0',
            [ES_CLIENT_AUTHENTICATION_HEADER]: 'secret',
            Authorization: 'Bearer access-token',
          },
          dispatcher: AGENT_MOCK,
        }
      );
    });

    it('throws error if deletion fails', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 404,
        headers: new Headers(),
        json: async () => ({ error: { message: 'Connection not found' } }),
      });

      await expect(
        uiamService.deleteOAuthConnection('access-token', 'client-id', 'conn-id')
      ).rejects.toThrow('Connection not found');
    });

    it('encodes reserved characters in both path segments', async () => {
      fetchSpy.mockResolvedValue({ ok: true, status: 204 });

      await uiamService.deleteOAuthConnection('access-token', 'client/id#y', 'conn/id?x');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://uiam.service/uiam/api/v1/oauth/clients/client%2Fid%23y/connections/conn%2Fid%3Fx',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('#resolveUsers', () => {
    it('returns an empty map without calling UIAM when there are no user ids', async () => {
      await expect(uiamService.resolveUsers('access-token', [])).resolves.toEqual({ users: {} });

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('resolves a single user id', async () => {
      const mockResponse = {
        users: {
          'user-1': { email: 'a@example.com', first_name: 'Ada', last_name: 'Lovelace' },
        },
      };

      fetchSpy.mockResolvedValue({ ok: true, json: async () => mockResponse });

      await expect(uiamService.resolveUsers('access-token', ['user-1'])).resolves.toEqual(
        mockResponse
      );

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://uiam.service/uiam/api/v1/users?user_id=user-1',
        {
          method: 'GET',
          headers: {
            'User-Agent': 'Kibana/9.0.0',
            [ES_CLIENT_AUTHENTICATION_HEADER]: 'secret',
            Authorization: 'Bearer access-token',
          },
          dispatcher: AGENT_MOCK,
        }
      );
    });

    it('comma-joins and deduplicates user ids', async () => {
      fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ users: {} }) });

      await uiamService.resolveUsers('access-token', ['user-1', 'user-2', 'user-1']);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://uiam.service/uiam/api/v1/users?user_id=user-1%2Cuser-2',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('splits large lists into batches and merges the results', async () => {
      const userIds = Array.from({ length: 250 }, (_, i) => `user-${i}`);

      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ users: { 'user-0': { first_name: 'First' } } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ users: { 'user-100': { first_name: 'Second' } } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ users: { 'user-200': { first_name: 'Third' } } }),
        });

      await expect(uiamService.resolveUsers('access-token', userIds)).resolves.toEqual({
        users: {
          'user-0': { first_name: 'First' },
          'user-100': { first_name: 'Second' },
          'user-200': { first_name: 'Third' },
        },
      });

      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it('returns partial results when some batches fail', async () => {
      const userIds = Array.from({ length: 250 }, (_, i) => `user-${i}`);

      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ users: { 'user-0': { first_name: 'First' } } }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          headers: new Headers(),
          json: async () => ({ error: { message: 'Internal Server Error' } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ users: { 'user-200': { first_name: 'Third' } } }),
        });

      await expect(uiamService.resolveUsers('access-token', userIds)).resolves.toEqual({
        users: {
          'user-0': { first_name: 'First' },
          'user-200': { first_name: 'Third' },
        },
      });

      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it('throws error if resolution fails', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers(),
        json: async () => ({ error: { message: 'Internal Server Error' } }),
      });

      await expect(uiamService.resolveUsers('access-token', ['user-1'])).rejects.toThrow(
        'Internal Server Error'
      );
    });
  });
});
