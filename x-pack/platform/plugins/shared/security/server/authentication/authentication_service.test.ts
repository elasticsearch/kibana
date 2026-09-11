/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

jest.mock('./authenticator');

import { mockCanRedirectRequest } from './authentication_service.test.mocks';

import { errors } from '@elastic/elasticsearch';
import dedent from 'dedent';

import type {
  AuthenticationHandler,
  AuthToolkit,
  CustomBrandingSetup,
  ElasticsearchServiceSetup,
  HttpServiceSetup,
  HttpServiceStart,
  IStaticAssets,
  KibanaRequest,
  Logger,
  LoggerFactory,
  OnPreResponseToolkit,
  UnauthorizedErrorHandler,
  UnauthorizedErrorHandlerToolkit,
} from '@kbn/core/server';
import { CspConfig } from '@kbn/core/server';
import {
  coreMock,
  elasticsearchServiceMock,
  httpServerMock,
  httpServiceMock,
  loggingSystemMock,
} from '@kbn/core/server/mocks';
import { customBrandingServiceMock } from '@kbn/core-custom-branding-server-mocks';
import type { UserActivityServiceStart } from '@kbn/core-user-activity-server';
import { userActivityServiceMock } from '@kbn/core-user-activity-server-mocks';
import type { UnauthorizedError } from '@kbn/es-errors';
import type { AuditServiceSetup } from '@kbn/security-plugin-types-server';
import type { PublicMethodsOf } from '@kbn/utility-types';

import { AuthenticationResult } from './authentication_result';
import { AuthenticationService } from './authentication_service';
import type { AuthenticatedUser, SecurityLicense } from '../../common';
import { KIBANA_AUTH_FULL_HEADER } from '../../common/constants';
import { licenseMock } from '../../common/licensing/index.mock';
import { mockAuthenticatedUser } from '../../common/model/authenticated_user.mock';
import { auditServiceMock } from '../audit/mocks';
import type { ConfigType } from '../config';
import { ConfigSchema, createConfig } from '../config';
import type { SecurityFeatureUsageServiceStart } from '../feature_usage';
import { securityFeatureUsageServiceMock } from '../feature_usage/index.mock';
import { securityMock } from '../mocks';
import { ROUTE_TAG_ACCEPT_UIAM_OAUTH, ROUTE_TAG_AUTH_FLOW } from '../routes/tags';
import { serviceAccountsServiceMock } from '../service_accounts/service_accounts_service.mock';
import type { Session } from '../session_management';
import { sessionMock } from '../session_management/session.mock';
import { userProfileServiceMock } from '../user_profile/user_profile_service.mock';

describe('AuthenticationService', () => {
  let service: AuthenticationService;
  let logger: jest.Mocked<Logger>;
  let mockSetupAuthenticationParams: {
    http: jest.Mocked<HttpServiceSetup>;
    elasticsearch: jest.Mocked<ElasticsearchServiceSetup>;
    config: ConfigType;
    license: jest.Mocked<SecurityLicense>;
    staticAssets: IStaticAssets;
    customBranding: jest.Mocked<CustomBrandingSetup>;
    getServiceAccounts: jest.Mock;
  };
  let mockStartAuthenticationParams: {
    audit: jest.Mocked<AuditServiceSetup>;
    config: ConfigType;
    loggers: LoggerFactory;
    http: jest.Mocked<HttpServiceStart>;
    clusterClient: ReturnType<typeof elasticsearchServiceMock.createClusterClient>;
    featureUsageService: jest.Mocked<SecurityFeatureUsageServiceStart>;
    userProfileService: ReturnType<typeof userProfileServiceMock.createStart>;
    session: jest.Mocked<PublicMethodsOf<Session>>;
    applicationName: 'kibana-.kibana';
    kibanaFeatures: [];
    isElasticCloudDeployment: jest.Mock;
    customLogoutURL?: string;
    userActivity: UserActivityServiceStart;
  };
  beforeEach(() => {
    logger = loggingSystemMock.createLogger();

    const coreSetupMock = coreMock.createSetup();
    const httpMock = coreSetupMock.http;
    (httpMock.basePath.prepend as jest.Mock).mockImplementation(
      (path) => `${httpMock.basePath.serverBasePath}${path}`
    );
    (httpMock.basePath.get as jest.Mock).mockImplementation(() => httpMock.basePath.serverBasePath);
    mockSetupAuthenticationParams = {
      http: httpMock,
      elasticsearch: coreSetupMock.elasticsearch,
      config: createConfig(ConfigSchema.validate({}), loggingSystemMock.create().get(), {
        isTLSEnabled: false,
      }),
      license: licenseMock.create(),
      staticAssets: coreSetupMock.http.staticAssets,
      customBranding: customBrandingServiceMock.createSetupContract(),
      getServiceAccounts: jest.fn().mockReturnValue(null),
    };
    mockCanRedirectRequest.mockReturnValue(false);

    const coreStart = coreMock.createStart();
    mockStartAuthenticationParams = {
      audit: auditServiceMock.create(),
      config: createConfig(
        ConfigSchema.validate({
          encryptionKey: 'ab'.repeat(16),
          secureCookies: true,
          cookieName: 'my-sid-cookie',
        }),
        loggingSystemMock.create().get(),
        { isTLSEnabled: false }
      ),
      http: coreStart.http,
      clusterClient: elasticsearchServiceMock.createClusterClient(),
      loggers: loggingSystemMock.create(),
      featureUsageService: securityFeatureUsageServiceMock.createStartContract(),
      session: sessionMock.create(),
      userProfileService: userProfileServiceMock.createStart(),
      applicationName: 'kibana-.kibana',
      kibanaFeatures: [],
      isElasticCloudDeployment: jest.fn().mockReturnValue(false),
      customLogoutURL: 'https://some-logout-origin/logout',
      userActivity: userActivityServiceMock.createStartContract(),
    };
    (mockStartAuthenticationParams.http.basePath.get as jest.Mock).mockImplementation(
      () => mockStartAuthenticationParams.http.basePath.serverBasePath
    );

    service = new AuthenticationService(logger);
  });

  afterEach(() => jest.clearAllMocks());

  describe('#setup()', () => {
    it('properly registers auth handler', () => {
      service.setup(mockSetupAuthenticationParams);

      expect(mockSetupAuthenticationParams.http.registerAuth).toHaveBeenCalledTimes(1);
      expect(mockSetupAuthenticationParams.http.registerAuth).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });

    it('properly registers unauthorized error handler', () => {
      service.setup(mockSetupAuthenticationParams);

      expect(
        mockSetupAuthenticationParams.elasticsearch.setUnauthorizedErrorHandler
      ).toHaveBeenCalledTimes(1);
      expect(
        mockSetupAuthenticationParams.elasticsearch.setUnauthorizedErrorHandler
      ).toHaveBeenCalledWith(expect.any(Function));
    });

    it('does not refresh a fake request before authentication is initialized', async () => {
      service.setup(mockSetupAuthenticationParams);
      const [handler] =
        mockSetupAuthenticationParams.elasticsearch.setUnauthorizedErrorHandler.mock.calls[0];
      const serviceAccounts = serviceAccountsServiceMock.createStart();
      mockSetupAuthenticationParams.getServiceAccounts.mockReturnValue(serviceAccounts);
      const toolkit = { notHandled: jest.fn(), retry: jest.fn() };
      const error = new errors.ResponseError(
        securityMock.createApiResponse({
          statusCode: 401,
          body: { error: { reason: 'token expired' } },
        })
      ) as UnauthorizedError;
      await handler({ error, request: httpServerMock.createFakeKibanaRequest({}) }, toolkit);
      expect(serviceAccounts.reauthenticateFakeRequest).not.toHaveBeenCalled();
      expect(toolkit.retry).not.toHaveBeenCalled();
      expect(toolkit.notHandled).toHaveBeenCalledTimes(1);
    });

    it('properly registers onPreResponse handler', () => {
      service.setup(mockSetupAuthenticationParams);

      expect(mockSetupAuthenticationParams.http.registerOnPreResponse).toHaveBeenCalledTimes(1);
      expect(mockSetupAuthenticationParams.http.registerOnPreResponse).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });

    it('properly registers auth handler with no providers', () => {
      mockSetupAuthenticationParams.config.authc = {
        ...mockSetupAuthenticationParams.config.authc,
        sortedProviders: [],
      };
      service.setup(mockSetupAuthenticationParams);

      expect(mockSetupAuthenticationParams.http.registerAuth).toHaveBeenCalledTimes(1);
      expect(mockSetupAuthenticationParams.http.registerAuth).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });
  });

  describe('#start()', () => {
    beforeEach(() => {
      service.setup(mockSetupAuthenticationParams);
    });

    describe('authentication handler', () => {
      let authHandler: AuthenticationHandler;
      let authenticate: jest.SpyInstance<Promise<AuthenticationResult>, [KibanaRequest]>;
      let mockAuthToolkit: jest.Mocked<AuthToolkit>;
      beforeEach(() => {
        mockAuthToolkit = httpServiceMock.createAuthToolkit();

        service.start(mockStartAuthenticationParams);

        authHandler = mockSetupAuthenticationParams.http.registerAuth.mock.calls[0][0];
        authenticate =
          jest.requireMock('./authenticator').Authenticator.mock.instances[0].authenticate;
      });

      it('returns error if license is not available.', async () => {
        const mockResponse = httpServerMock.createLifecycleResponseFactory();

        mockSetupAuthenticationParams.license.isLicenseAvailable.mockReturnValue(false);

        await authHandler(httpServerMock.createKibanaRequest(), mockResponse, mockAuthToolkit);

        expect(mockResponse.customError).toHaveBeenCalledTimes(1);
        expect(mockResponse.customError).toHaveBeenCalledWith({
          body: 'License information could not be obtained from Elasticsearch. Please check the logs for further details.',
          statusCode: 503,
          headers: { 'Retry-After': '30' },
        });
        expect(mockAuthToolkit.authenticated).not.toHaveBeenCalled();
        expect(mockAuthToolkit.redirected).not.toHaveBeenCalled();
      });

      it('replies with no credentials when security is disabled in elasticsearch', async () => {
        const mockRequest = httpServerMock.createKibanaRequest();
        const mockResponse = httpServerMock.createLifecycleResponseFactory();

        mockSetupAuthenticationParams.license.isEnabled.mockReturnValue(false);

        await authHandler(mockRequest, mockResponse, mockAuthToolkit);

        expect(mockAuthToolkit.authenticated).toHaveBeenCalledTimes(1);
        expect(mockAuthToolkit.authenticated).toHaveBeenCalledWith();
        expect(mockAuthToolkit.redirected).not.toHaveBeenCalled();

        expect(authenticate).not.toHaveBeenCalled();
      });

      it('continues request with credentials on success', async () => {
        const mockRequest = httpServerMock.createKibanaRequest();
        const mockResponse = httpServerMock.createLifecycleResponseFactory();
        const mockUser = mockAuthenticatedUser();
        const mockAuthHeaders = { authorization: 'Basic xxx' };

        authenticate.mockResolvedValue(
          AuthenticationResult.succeeded(mockUser, { authHeaders: mockAuthHeaders })
        );

        await authHandler(mockRequest, mockResponse, mockAuthToolkit);

        expect(mockAuthToolkit.authenticated).toHaveBeenCalledTimes(1);
        expect(mockAuthToolkit.authenticated).toHaveBeenCalledWith({
          state: mockUser,
          requestHeaders: mockAuthHeaders,
        });
        expect(mockAuthToolkit.redirected).not.toHaveBeenCalled();

        expect(authenticate).toHaveBeenCalledTimes(1);
        expect(authenticate).toHaveBeenCalledWith(mockRequest);
      });

      it('returns authentication response headers on success if any', async () => {
        const mockRequest = httpServerMock.createKibanaRequest();
        const mockResponse = httpServerMock.createLifecycleResponseFactory();
        const mockUser = mockAuthenticatedUser();
        const mockAuthHeaders = { authorization: 'Basic xxx' };
        const mockAuthResponseHeaders = { 'WWW-Authenticate': 'Negotiate' };

        authenticate.mockResolvedValue(
          AuthenticationResult.succeeded(mockUser, {
            authHeaders: mockAuthHeaders,
            authResponseHeaders: mockAuthResponseHeaders,
          })
        );

        await authHandler(mockRequest, mockResponse, mockAuthToolkit);

        expect(mockAuthToolkit.authenticated).toHaveBeenCalledTimes(1);
        expect(mockAuthToolkit.authenticated).toHaveBeenCalledWith({
          state: mockUser,
          requestHeaders: mockAuthHeaders,
          responseHeaders: mockAuthResponseHeaders,
        });
        expect(mockAuthToolkit.redirected).not.toHaveBeenCalled();

        expect(authenticate).toHaveBeenCalledTimes(1);
        expect(authenticate).toHaveBeenCalledWith(mockRequest);
      });

      it('sets authenticated state correctly with user profile id', async () => {
        const mockRequest = httpServerMock.createKibanaRequest();
        const mockResponse = httpServerMock.createLifecycleResponseFactory();
        const mockUser = mockAuthenticatedUser();
        const mockAuthHeaders = { authorization: 'Basic xxx' };
        const mockAuthResponseHeaders = { 'WWW-Authenticate': 'Negotiate' };

        authenticate.mockResolvedValue(
          AuthenticationResult.succeeded(
            { ...mockUser, profile_uid: 'USER_PROFILE_ID' },
            {
              authHeaders: mockAuthHeaders,
              authResponseHeaders: mockAuthResponseHeaders,
            }
          )
        );

        await authHandler(mockRequest, mockResponse, mockAuthToolkit);

        expect(mockAuthToolkit.authenticated).toHaveBeenCalledTimes(1);
        expect(mockAuthToolkit.authenticated).toHaveBeenCalledWith({
          state: { ...mockUser, profile_uid: 'USER_PROFILE_ID' },
          requestHeaders: mockAuthHeaders,
          responseHeaders: mockAuthResponseHeaders,
        });
      });

      it('redirects user if redirection is requested by the authenticator preserving authentication response headers if any', async () => {
        const mockResponse = httpServerMock.createLifecycleResponseFactory();
        authenticate.mockResolvedValue(
          AuthenticationResult.redirectTo('/some/url', {
            authResponseHeaders: { 'WWW-Authenticate': 'Negotiate' },
          })
        );

        await authHandler(httpServerMock.createKibanaRequest(), mockResponse, mockAuthToolkit);

        expect(mockAuthToolkit.redirected).toHaveBeenCalledTimes(1);
        expect(mockAuthToolkit.redirected).toHaveBeenCalledWith({
          location: '/some/url',
          'WWW-Authenticate': 'Negotiate',
        });
        expect(mockAuthToolkit.authenticated).not.toHaveBeenCalled();
      });

      it('rejects with `Internal Server Error` and log error when `authenticate` throws unhandled exception', async () => {
        const mockResponse = httpServerMock.createLifecycleResponseFactory();
        const failureReason = new Error('something went wrong');
        authenticate.mockRejectedValue(failureReason);

        await expect(
          authHandler(httpServerMock.createKibanaRequest(), mockResponse, mockAuthToolkit)
        ).rejects.toThrow(failureReason);

        expect(mockAuthToolkit.authenticated).not.toHaveBeenCalled();
        expect(mockAuthToolkit.redirected).not.toHaveBeenCalled();
      });

      it('rejects with original `badRequest` error when `authenticate` fails to authenticate user', async () => {
        const mockResponse = httpServerMock.createLifecycleResponseFactory();
        const esError = new errors.ResponseError(
          securityMock.createApiResponse({ statusCode: 400, body: 'some message' })
        );
        authenticate.mockResolvedValue(AuthenticationResult.failed(esError));

        await authHandler(httpServerMock.createKibanaRequest(), mockResponse, mockAuthToolkit);

        expect(mockResponse.customError).toHaveBeenCalledTimes(1);
        const [[response]] = mockResponse.customError.mock.calls;
        expect(response.body).toBe(esError);

        expect(mockAuthToolkit.authenticated).not.toHaveBeenCalled();
        expect(mockAuthToolkit.redirected).not.toHaveBeenCalled();
      });

      it('includes `WWW-Authenticate` header if `authenticate` fails to authenticate user and provides challenges', async () => {
        const mockResponse = httpServerMock.createLifecycleResponseFactory();
        const originalError = new errors.ResponseError(
          securityMock.createApiResponse({
            statusCode: 403,
            body: 'some message',
            headers: {
              'WWW-Authenticate': [
                'Basic realm="Access to prod", charset="UTF-8"',
                'Basic',
                'Negotiate',
              ],
            },
          })
        );
        authenticate.mockResolvedValue(
          AuthenticationResult.failed(originalError, {
            authResponseHeaders: { 'WWW-Authenticate': 'Negotiate' },
          })
        );

        await authHandler(httpServerMock.createKibanaRequest(), mockResponse, mockAuthToolkit);

        expect(mockResponse.customError).toHaveBeenCalledTimes(1);
        const [[options]] = mockResponse.customError.mock.calls;
        expect(options.body).toBe(originalError);
        expect(options!.headers).toEqual({ 'WWW-Authenticate': 'Negotiate' });

        expect(mockAuthToolkit.authenticated).not.toHaveBeenCalled();
        expect(mockAuthToolkit.redirected).not.toHaveBeenCalled();
      });

      it('returns `notHandled` when authentication can not be handled', async () => {
        const mockResponse = httpServerMock.createLifecycleResponseFactory();
        authenticate.mockResolvedValue(AuthenticationResult.notHandled());

        await authHandler(httpServerMock.createKibanaRequest(), mockResponse, mockAuthToolkit);

        expect(mockAuthToolkit.notHandled).toHaveBeenCalledTimes(1);

        expect(mockAuthToolkit.authenticated).not.toHaveBeenCalled();
        expect(mockAuthToolkit.redirected).not.toHaveBeenCalled();
      });
    });

    describe('unauthorized error handler', () => {
      let unauthorizedErrorHandler: UnauthorizedErrorHandler;
      let reauthenticate: jest.SpyInstance<Promise<AuthenticationResult>, [KibanaRequest]>;
      let mockUnauthorizedErrorToolkit: jest.Mocked<UnauthorizedErrorHandlerToolkit>;
      beforeEach(() => {
        mockUnauthorizedErrorToolkit = { notHandled: jest.fn(), retry: jest.fn() };

        service.start(mockStartAuthenticationParams);

        unauthorizedErrorHandler =
          mockSetupAuthenticationParams.elasticsearch.setUnauthorizedErrorHandler.mock.calls[0][0];
        reauthenticate =
          jest.requireMock('./authenticator').Authenticator.mock.instances[0].reauthenticate;
      });

      describe('service-account-bound fake requests', () => {
        let serviceAccounts: ReturnType<typeof serviceAccountsServiceMock.createStart>;
        const fakeRequestError = new errors.ResponseError(
          securityMock.createApiResponse({
            statusCode: 401,
            body: { error: { caused_by: { authentication_error_code: '0x7E0116' } } },
          })
        ) as UnauthorizedError;

        beforeEach(() => {
          serviceAccounts = serviceAccountsServiceMock.createStart();
          mockSetupAuthenticationParams.getServiceAccounts.mockReturnValue(serviceAccounts);
        });

        it('retries with the replaced credential when the request is service-account-bound', async () => {
          serviceAccounts.reauthenticateFakeRequest.mockResolvedValue({
            authorization: 'Bearer essu_fresh_token',
          });
          const request = httpServerMock.createFakeKibanaRequest({
            headers: { authorization: 'Bearer essu_stale_token' },
          });

          await unauthorizedErrorHandler(
            { error: fakeRequestError, request },
            mockUnauthorizedErrorToolkit
          );

          expect(serviceAccounts.reauthenticateFakeRequest).toHaveBeenCalledTimes(1);
          expect(serviceAccounts.reauthenticateFakeRequest).toHaveBeenCalledWith(request);
          // The lowercase `authorization` key is load-bearing for the transport header merge.
          expect(mockUnauthorizedErrorToolkit.retry).toHaveBeenCalledWith({
            authHeaders: { authorization: 'Bearer essu_fresh_token' },
          });
          // The session machinery must never run for fake requests.
          expect(reauthenticate).not.toHaveBeenCalled();
        });

        it('does not handle the error when the request is not service-account-bound', async () => {
          serviceAccounts.reauthenticateFakeRequest.mockResolvedValue(null);
          const request = httpServerMock.createFakeKibanaRequest({
            headers: { authorization: 'ApiKey essu_task_manager_key' },
          });

          await unauthorizedErrorHandler(
            { error: fakeRequestError, request },
            mockUnauthorizedErrorToolkit
          );

          expect(mockUnauthorizedErrorToolkit.notHandled).toHaveBeenCalledTimes(1);
          expect(mockUnauthorizedErrorToolkit.retry).not.toHaveBeenCalled();
          expect(reauthenticate).not.toHaveBeenCalled();
        });

        it('does not handle the error when the credential replacement rejects', async () => {
          serviceAccounts.reauthenticateFakeRequest.mockRejectedValue(new Error('mint failed'));
          const request = httpServerMock.createFakeKibanaRequest({});

          await unauthorizedErrorHandler(
            { error: fakeRequestError, request },
            mockUnauthorizedErrorToolkit
          );

          expect(mockUnauthorizedErrorToolkit.notHandled).toHaveBeenCalledTimes(1);
          expect(mockUnauthorizedErrorToolkit.retry).not.toHaveBeenCalled();
        });

        it('does not handle the error when the service accounts service is not available', async () => {
          mockSetupAuthenticationParams.getServiceAccounts.mockReturnValue(null);
          const request = httpServerMock.createFakeKibanaRequest({});

          await unauthorizedErrorHandler(
            { error: fakeRequestError, request },
            mockUnauthorizedErrorToolkit
          );

          expect(mockUnauthorizedErrorToolkit.notHandled).toHaveBeenCalledTimes(1);
          expect(mockUnauthorizedErrorToolkit.retry).not.toHaveBeenCalled();
          expect(reauthenticate).not.toHaveBeenCalled();
        });

        it('does not attempt replacement for non-expiry 401 errors', async () => {
          serviceAccounts.reauthenticateFakeRequest.mockResolvedValue({
            authorization: 'Bearer essu_fresh_token',
          });
          // A 401 that would NOT pass the session path's expired-token classification.
          const nonExpiredError = new errors.ResponseError(
            securityMock.createApiResponse({
              statusCode: 401,
              body: { error: { reason: 'current license is non-compliant' } },
            })
          ) as UnauthorizedError;

          await unauthorizedErrorHandler(
            { error: nonExpiredError, request: httpServerMock.createFakeKibanaRequest({}) },
            mockUnauthorizedErrorToolkit
          );

          expect(mockUnauthorizedErrorToolkit.retry).not.toHaveBeenCalled();
          expect(serviceAccounts.reauthenticateFakeRequest).not.toHaveBeenCalled();
          expect(mockUnauthorizedErrorToolkit.notHandled).toHaveBeenCalledTimes(1);
        });

        it.each(['isLicenseAvailable', 'isEnabled'] as const)(
          'does not refresh when %s is false',
          async (method) => {
            mockSetupAuthenticationParams.license[method].mockReturnValue(false);
            await unauthorizedErrorHandler(
              { error: fakeRequestError, request: httpServerMock.createFakeKibanaRequest({}) },
              mockUnauthorizedErrorToolkit
            );
            expect(serviceAccounts.reauthenticateFakeRequest).not.toHaveBeenCalled();
            expect(reauthenticate).not.toHaveBeenCalled();
            expect(mockUnauthorizedErrorToolkit.retry).not.toHaveBeenCalled();
            expect(mockUnauthorizedErrorToolkit.notHandled).toHaveBeenCalledTimes(1);
          }
        );

        it('recognizes the native Elasticsearch token expiry reason', async () => {
          serviceAccounts.reauthenticateFakeRequest.mockResolvedValue({
            authorization: 'Bearer replacement',
          });
          const error = new errors.ResponseError(
            securityMock.createApiResponse({
              statusCode: 401,
              body: { error: { reason: 'token expired' } },
            })
          ) as UnauthorizedError;
          await unauthorizedErrorHandler(
            { error, request: httpServerMock.createFakeKibanaRequest({}) },
            mockUnauthorizedErrorToolkit
          );
          expect(mockUnauthorizedErrorToolkit.retry).toHaveBeenCalledWith({
            authHeaders: { authorization: 'Bearer replacement' },
          });
          expect(reauthenticate).not.toHaveBeenCalled();
        });

        it.each([
          {},
          { error: { caused_by: { authentication_error_code: '0x3B8626' } } },
          { error: { caused_by: { authentication_error_code: '0xEDF789' } } },
        ])('does not mint for an unrecognized or rejected credential: %j', async (body) => {
          const error = new errors.ResponseError(
            securityMock.createApiResponse({ statusCode: 401, body })
          ) as UnauthorizedError;
          await unauthorizedErrorHandler(
            { error, request: httpServerMock.createFakeKibanaRequest({}) },
            mockUnauthorizedErrorToolkit
          );
          expect(serviceAccounts.reauthenticateFakeRequest).not.toHaveBeenCalled();
          expect(mockUnauthorizedErrorToolkit.retry).not.toHaveBeenCalled();
          expect(reauthenticate).not.toHaveBeenCalled();
        });
      });

      it('does not handle error if license is not available.', async () => {
        mockSetupAuthenticationParams.license.isLicenseAvailable.mockReturnValue(false);

        const failureReason = new errors.ResponseError(
          securityMock.createApiResponse({ statusCode: 401, body: {} })
        ) as UnauthorizedError;

        await unauthorizedErrorHandler(
          { error: failureReason, request: httpServerMock.createKibanaRequest() },
          mockUnauthorizedErrorToolkit
        );

        expect(mockUnauthorizedErrorToolkit.notHandled).toHaveBeenCalledTimes(1);
        expect(mockUnauthorizedErrorToolkit.retry).not.toHaveBeenCalled();
        expect(reauthenticate).not.toHaveBeenCalled();
      });

      it('does not handle error when security is disabled in elasticsearch.', async () => {
        mockSetupAuthenticationParams.license.isEnabled.mockReturnValue(false);

        const failureReason = new errors.ResponseError(
          securityMock.createApiResponse({ statusCode: 401, body: {} })
        ) as UnauthorizedError;

        await unauthorizedErrorHandler(
          { error: failureReason, request: httpServerMock.createKibanaRequest() },
          mockUnauthorizedErrorToolkit
        );

        expect(mockUnauthorizedErrorToolkit.notHandled).toHaveBeenCalledTimes(1);
        expect(mockUnauthorizedErrorToolkit.retry).not.toHaveBeenCalled();
        expect(reauthenticate).not.toHaveBeenCalled();
      });

      it('does not handle non-401 errors.', async () => {
        const failureReason = new errors.ResponseError(
          securityMock.createApiResponse({ statusCode: 403, body: {} })
        ) as UnauthorizedError;

        await unauthorizedErrorHandler(
          { error: failureReason, request: httpServerMock.createKibanaRequest() },
          mockUnauthorizedErrorToolkit
        );

        expect(mockUnauthorizedErrorToolkit.notHandled).toHaveBeenCalledTimes(1);
        expect(mockUnauthorizedErrorToolkit.retry).not.toHaveBeenCalled();
        expect(reauthenticate).not.toHaveBeenCalled();
      });

      it('does not handle 401 errors if not related to expired token.', async () => {
        const failureReason = new errors.ResponseError(
          securityMock.createApiResponse({
            statusCode: 401,
            body: { error: { reason: 'current license is non-compliant' } },
          })
        ) as UnauthorizedError;

        await unauthorizedErrorHandler(
          { error: failureReason, request: httpServerMock.createKibanaRequest() },
          mockUnauthorizedErrorToolkit
        );

        expect(mockUnauthorizedErrorToolkit.notHandled).toHaveBeenCalledTimes(1);
        expect(mockUnauthorizedErrorToolkit.retry).not.toHaveBeenCalled();
        expect(reauthenticate).not.toHaveBeenCalled();
      });

      it('does not handle error unless provider successfully returns new headers.', async () => {
        const failureReason = new errors.ResponseError(
          securityMock.createApiResponse({
            statusCode: 401,
            body: { error: { reason: 'token expired' } },
          })
        ) as UnauthorizedError;

        const nonHandleableResults = [
          AuthenticationResult.notHandled(),
          AuthenticationResult.failed(
            new errors.ResponseError(securityMock.createApiResponse({ statusCode: 404, body: {} }))
          ),
          AuthenticationResult.redirectTo('some-url'),
          AuthenticationResult.succeeded(mockAuthenticatedUser(), {
            authResponseHeaders: { header: 'value' },
          }),
        ];

        const mockRequest = httpServerMock.createKibanaRequest();
        for (const result of nonHandleableResults) {
          reauthenticate.mockResolvedValue(result);

          await unauthorizedErrorHandler(
            { error: failureReason, request: mockRequest },
            mockUnauthorizedErrorToolkit
          );

          expect(mockUnauthorizedErrorToolkit.notHandled).toHaveBeenCalledTimes(1);
          expect(mockUnauthorizedErrorToolkit.retry).not.toHaveBeenCalled();

          expect(reauthenticate).toHaveBeenCalledTimes(1);
          expect(reauthenticate).toHaveBeenCalledWith(mockRequest);

          mockUnauthorizedErrorToolkit.notHandled.mockClear();
          reauthenticate.mockClear();
        }
      });

      it('handles error if authentication succeeds and authentication headers are available.', async () => {
        const failureReason = new errors.ResponseError(
          securityMock.createApiResponse({
            statusCode: 401,
            body: { error: { reason: 'token expired' } },
          })
        ) as UnauthorizedError;

        reauthenticate.mockResolvedValue(
          AuthenticationResult.succeeded(mockAuthenticatedUser(), {
            authHeaders: { header: 'value' },
          })
        );

        const mockRequest = httpServerMock.createKibanaRequest();
        await unauthorizedErrorHandler(
          { error: failureReason, request: mockRequest },
          mockUnauthorizedErrorToolkit
        );

        expect(mockUnauthorizedErrorToolkit.retry).toHaveBeenCalledTimes(1);
        expect(mockUnauthorizedErrorToolkit.retry).toHaveBeenCalledWith({
          authHeaders: { header: 'value' },
        });
        expect(mockUnauthorizedErrorToolkit.notHandled).not.toHaveBeenCalled();

        expect(reauthenticate).toHaveBeenCalledTimes(1);
        expect(reauthenticate).toHaveBeenCalledWith(mockRequest);
      });

      it('handles error if authentication succeeds and authentication headers are available (UIAM).', async () => {
        const failureReason = new errors.ResponseError(
          securityMock.createApiResponse({
            statusCode: 401,
            body: {
              error: {
                reason: 'failed to authenticate cloud access token for project',
                caused_by: { authentication_error_code: '0x7E0116' },
              },
            },
          })
        ) as UnauthorizedError;

        reauthenticate.mockResolvedValue(
          AuthenticationResult.succeeded(mockAuthenticatedUser(), {
            authHeaders: { header: 'value' },
          })
        );

        const mockRequest = httpServerMock.createKibanaRequest();
        await unauthorizedErrorHandler(
          { error: failureReason, request: mockRequest },
          mockUnauthorizedErrorToolkit
        );

        expect(mockUnauthorizedErrorToolkit.retry).toHaveBeenCalledTimes(1);
        expect(mockUnauthorizedErrorToolkit.retry).toHaveBeenCalledWith({
          authHeaders: { header: 'value' },
        });
        expect(mockUnauthorizedErrorToolkit.notHandled).not.toHaveBeenCalled();

        expect(reauthenticate).toHaveBeenCalledTimes(1);
        expect(reauthenticate).toHaveBeenCalledWith(mockRequest);
      });

      it('filters out and recovers `Authorization` header and enforces full authentication when provider cannot handle error.', async () => {
        const failureReason = new errors.ResponseError(
          securityMock.createApiResponse({
            statusCode: 401,
            body: { error: { reason: 'token expired' } },
          })
        ) as UnauthorizedError;

        const mockRequest = httpServerMock.createKibanaRequest({
          headers: { Authorization: 'Basic xxx', Random: 'random' },
        });

        let modifiedHeaders;
        reauthenticate.mockImplementation((request) => {
          modifiedHeaders = request.headers;
          return Promise.resolve(AuthenticationResult.notHandled());
        });

        await unauthorizedErrorHandler(
          { error: failureReason, request: mockRequest },
          mockUnauthorizedErrorToolkit
        );

        expect(reauthenticate).toHaveBeenCalledTimes(1);
        expect(reauthenticate).toHaveBeenCalledWith(mockRequest);
        expect(modifiedHeaders).toEqual({ Random: 'random', [KIBANA_AUTH_FULL_HEADER]: 'true' });

        expect(mockRequest.headers).toEqual({ Authorization: 'Basic xxx', Random: 'random' });
      });

      it('filters out and recovers `Authorization` header and enforces full authentication when provider can handle error.', async () => {
        const failureReason = new errors.ResponseError(
          securityMock.createApiResponse({
            statusCode: 401,
            body: { error: { reason: 'token expired' } },
          })
        ) as UnauthorizedError;

        const mockRequest = httpServerMock.createKibanaRequest({
          headers: { Authorization: 'Basic xxx', Random: 'random' },
        });

        let modifiedHeaders;
        reauthenticate.mockImplementation((request) => {
          modifiedHeaders = request.headers;
          return Promise.resolve(
            AuthenticationResult.succeeded(mockAuthenticatedUser(), {
              authHeaders: { header: 'value' },
            })
          );
        });

        await unauthorizedErrorHandler(
          { error: failureReason, request: mockRequest },
          mockUnauthorizedErrorToolkit
        );

        expect(reauthenticate).toHaveBeenCalledTimes(1);
        expect(reauthenticate).toHaveBeenCalledWith(mockRequest);
        expect(modifiedHeaders).toEqual({ Random: 'random', [KIBANA_AUTH_FULL_HEADER]: 'true' });

        expect(mockRequest.headers).toEqual({ Authorization: 'Basic xxx', Random: 'random' });
      });

      it('filters out and recovers `Authorization` header and enforces full authentication when provider fails with unexpected error.', async () => {
        const failureReason = new errors.ResponseError(
          securityMock.createApiResponse({
            statusCode: 401,
            body: { error: { reason: 'token expired' } },
          })
        ) as UnauthorizedError;

        const mockRequest = httpServerMock.createKibanaRequest({
          headers: { Authorization: 'Basic xxx', Random: 'random' },
        });

        let modifiedHeaders;
        reauthenticate.mockImplementation((request) => {
          modifiedHeaders = request.headers;
          return Promise.reject(new Error('Uh oh.'));
        });

        await expect(
          unauthorizedErrorHandler(
            { error: failureReason, request: mockRequest },
            mockUnauthorizedErrorToolkit
          )
        ).rejects.toThrow(new Error('Uh oh.'));

        expect(reauthenticate).toHaveBeenCalledTimes(1);
        expect(reauthenticate).toHaveBeenCalledWith(mockRequest);
        expect(modifiedHeaders).toEqual({ Random: 'random', [KIBANA_AUTH_FULL_HEADER]: 'true' });

        expect(mockRequest.headers).toEqual({ Authorization: 'Basic xxx', Random: 'random' });
      });
    });

    describe('getServerBaseURL()', () => {
      let getServerBaseURL: () => string;
      beforeEach(() => {
        mockStartAuthenticationParams.http.getServerInfo.mockReturnValue({
          name: 'some-name',
          protocol: 'socket',
          hostname: 'test-hostname',
          port: 1234,
        });

        service.setup(mockSetupAuthenticationParams);
        service.start(mockStartAuthenticationParams);

        getServerBaseURL =
          jest.requireMock('./authenticator').Authenticator.mock.calls[0][0].getServerBaseURL;
      });

      it('falls back to legacy server config if `public` config is not specified', async () => {
        expect(getServerBaseURL()).toBe('socket://test-hostname:1234');
      });

      it('respects `public` config if it is specified', async () => {
        mockStartAuthenticationParams.config.public = {
          protocol: 'https',
        } as ConfigType['public'];
        expect(getServerBaseURL()).toBe('https://test-hostname:1234');

        mockStartAuthenticationParams.config.public = {
          hostname: 'elastic.co',
        } as ConfigType['public'];
        expect(getServerBaseURL()).toBe('socket://elastic.co:1234');

        mockStartAuthenticationParams.config.public = {
          port: 4321,
        } as ConfigType['public'];
        expect(getServerBaseURL()).toBe('socket://test-hostname:4321');

        mockStartAuthenticationParams.config.public = {
          protocol: 'https',
          hostname: 'elastic.co',
          port: 4321,
        } as ConfigType['public'];
        expect(getServerBaseURL()).toBe('https://elastic.co:4321');
      });
    });

    describe('getCurrentUser()', () => {
      let getCurrentUser: (r: KibanaRequest) => AuthenticatedUser | null;
      beforeEach(async () => {
        getCurrentUser = service.start(mockStartAuthenticationParams).getCurrentUser;
      });

      it('returns user from the auth state.', () => {
        const mockUser = mockAuthenticatedUser();

        const mockAuthGet = mockStartAuthenticationParams.http.auth.get as jest.Mock;
        mockAuthGet.mockReturnValue({ state: mockUser });

        const mockRequest = httpServerMock.createKibanaRequest();
        expect(getCurrentUser(mockRequest)).toBe(mockUser);
        expect(mockAuthGet).toHaveBeenCalledTimes(1);
        expect(mockAuthGet).toHaveBeenCalledWith(mockRequest);
      });

      it('returns null if auth state is not available.', () => {
        const mockAuthGet = mockStartAuthenticationParams.http.auth.get as jest.Mock;
        mockAuthGet.mockReturnValue({});

        const mockRequest = httpServerMock.createKibanaRequest();
        expect(getCurrentUser(mockRequest)).toBeNull();
        expect(mockAuthGet).toHaveBeenCalledTimes(1);
        expect(mockAuthGet).toHaveBeenCalledWith(mockRequest);
      });
    });
  });

  describe('onPreResponse handler', () => {
    function getService({ runStart = true }: { runStart?: boolean } = {}) {
      service.setup(mockSetupAuthenticationParams);

      if (runStart) {
        service.start(mockStartAuthenticationParams);
      }

      const onPreResponseHandler =
        mockSetupAuthenticationParams.http.registerOnPreResponse.mock.calls[0][0];
      const [authenticator] = jest.requireMock('./authenticator').Authenticator.mock.instances;

      return { authenticator, onPreResponseHandler };
    }

    it('ignores responses with non-401 status code', async () => {
      const mockReturnedValue = { type: 'next' as any };
      const mockOnPreResponseToolkit = httpServiceMock.createOnPreResponseToolkit();
      mockOnPreResponseToolkit.next.mockReturnValue(mockReturnedValue);

      const { onPreResponseHandler } = getService();
      for (const statusCode of [200, 400, 403, 404]) {
        await expect(
          onPreResponseHandler(
            httpServerMock.createKibanaRequest(),
            { statusCode },
            mockOnPreResponseToolkit
          )
        ).resolves.toBe(mockReturnedValue);
      }
    });

    it('ignores responses to requests that cannot handle redirects', async () => {
      const mockReturnedValue = { type: 'next' as any };
      const mockOnPreResponseToolkit = httpServiceMock.createOnPreResponseToolkit();
      mockOnPreResponseToolkit.next.mockReturnValue(mockReturnedValue);
      mockCanRedirectRequest.mockReturnValue(false);

      const { onPreResponseHandler } = getService();
      await expect(
        onPreResponseHandler(
          httpServerMock.createKibanaRequest(),
          { statusCode: 401 },
          mockOnPreResponseToolkit
        )
      ).resolves.toBe(mockReturnedValue);
    });

    describe('UIAM OAuth WWW-Authenticate header', () => {
      it('returns JSON-RPC error with WWW-Authenticate header for 401 on routes tagged with ROUTE_TAG_ACCEPT_UIAM_OAUTH', async () => {
        const mockReturnedValue = { type: 'render' as any };
        const mockOnPreResponseToolkit = httpServiceMock.createOnPreResponseToolkit();
        mockOnPreResponseToolkit.render.mockReturnValue(mockReturnedValue);

        mockSetupAuthenticationParams.config = createConfig(
          ConfigSchema.validate(
            {
              mcp: {
                oauth2: {
                  metadata: {
                    authorization_servers: ['https://localhost:9200'],
                    resource: 'http://localhost:5620',
                  },
                },
              },
            },
            { serverless: true }
          ),
          loggingSystemMock.create().get(),
          { isTLSEnabled: false }
        );

        const { onPreResponseHandler } = getService();

        await expect(
          onPreResponseHandler(
            httpServerMock.createKibanaRequest({
              routeTags: [ROUTE_TAG_ACCEPT_UIAM_OAUTH],
            }),
            { statusCode: 401 },
            mockOnPreResponseToolkit
          )
        ).resolves.toBe(mockReturnedValue);

        expect(mockOnPreResponseToolkit.render).toHaveBeenCalledWith({
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32000, message: 'Unauthorized' },
          }),
          headers: {
            'WWW-Authenticate': expect.stringContaining('Bearer resource_metadata="'),
            'Content-Type': 'application/json',
          },
        });
      });

      it('does not add WWW-Authenticate header when mcp config is not set', async () => {
        const mockReturnedValue = { type: 'next' as any };
        const mockOnPreResponseToolkit = httpServiceMock.createOnPreResponseToolkit();
        mockOnPreResponseToolkit.next.mockReturnValue(mockReturnedValue);

        const { onPreResponseHandler } = getService();
        await onPreResponseHandler(
          httpServerMock.createKibanaRequest({
            routeTags: [ROUTE_TAG_ACCEPT_UIAM_OAUTH],
          }),
          { statusCode: 401 },
          mockOnPreResponseToolkit
        );

        expect(mockOnPreResponseToolkit.next).toHaveBeenCalledWith();
      });

      it('does not add WWW-Authenticate header for non-401 responses on tagged routes', async () => {
        const mockReturnedValue = { type: 'next' as any };
        const mockOnPreResponseToolkit = httpServiceMock.createOnPreResponseToolkit();
        mockOnPreResponseToolkit.next.mockReturnValue(mockReturnedValue);

        mockSetupAuthenticationParams.config = createConfig(
          ConfigSchema.validate(
            {
              mcp: {
                oauth2: {
                  metadata: {
                    authorization_servers: ['https://localhost:9200'],
                    resource: 'http://localhost:5620',
                  },
                },
              },
            },
            { serverless: true }
          ),
          loggingSystemMock.create().get(),
          { isTLSEnabled: false }
        );

        const { onPreResponseHandler } = getService();
        await onPreResponseHandler(
          httpServerMock.createKibanaRequest({
            routeTags: [ROUTE_TAG_ACCEPT_UIAM_OAUTH],
          }),
          { statusCode: 200 },
          mockOnPreResponseToolkit
        );

        expect(mockOnPreResponseToolkit.next).toHaveBeenCalledWith();
      });

      it('does not add WWW-Authenticate header for 401 on routes without the tag', async () => {
        const mockReturnedValue = { type: 'next' as any };
        const mockOnPreResponseToolkit = httpServiceMock.createOnPreResponseToolkit();
        mockOnPreResponseToolkit.next.mockReturnValue(mockReturnedValue);

        mockSetupAuthenticationParams.config = createConfig(
          ConfigSchema.validate(
            {
              mcp: {
                oauth2: {
                  metadata: {
                    authorization_servers: ['https://localhost:9200'],
                    resource: 'http://localhost:5620',
                  },
                },
              },
            },
            { serverless: true }
          ),
          loggingSystemMock.create().get(),
          { isTLSEnabled: false }
        );

        const { onPreResponseHandler } = getService();
        await onPreResponseHandler(
          httpServerMock.createKibanaRequest(),
          { statusCode: 401 },
          mockOnPreResponseToolkit
        );

        expect(mockOnPreResponseToolkit.next).toHaveBeenCalledWith();
      });
    });

    it('ignores responses if authenticator is not initialized', async () => {
      // Run `setup`, but not `start` to simulate non-initialized `Authenticator`.
      const { onPreResponseHandler } = getService({ runStart: false });

      const mockReturnedValue = { type: 'next' as any };
      const mockOnPreResponseToolkit = httpServiceMock.createOnPreResponseToolkit();
      mockOnPreResponseToolkit.next.mockReturnValue(mockReturnedValue);
      mockCanRedirectRequest.mockReturnValue(true);

      await expect(
        onPreResponseHandler(
          httpServerMock.createKibanaRequest(),
          { statusCode: 401 },
          mockOnPreResponseToolkit
        )
      ).resolves.toBe(mockReturnedValue);
    });

    describe('when login form is available', () => {
      let mockReturnedValue: { type: any; body: string };
      let mockOnPreResponseToolkit: jest.Mocked<OnPreResponseToolkit>;
      beforeEach(() => {
        mockReturnedValue = { type: 'render' as any, body: 'body' };
        mockOnPreResponseToolkit = httpServiceMock.createOnPreResponseToolkit();
        mockOnPreResponseToolkit.render.mockReturnValue(mockReturnedValue);
      });

      it('redirects to the login page when user does not have an active session', async () => {
        mockCanRedirectRequest.mockReturnValue(true);

        const { authenticator, onPreResponseHandler } = getService();
        authenticator.getRequestOriginalURL.mockReturnValue('/mock-server-basepath/app/some');

        await expect(
          onPreResponseHandler(
            httpServerMock.createKibanaRequest({ path: '/app/some', query: { param: 'one two' } }),
            { statusCode: 401 },
            mockOnPreResponseToolkit
          )
        ).resolves.toBe(mockReturnedValue);

        expect(mockOnPreResponseToolkit.render).toHaveBeenCalledWith({
          body: dedent`
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charSet="utf-8" />
            <meta httpEquiv="X-UA-Compatible" content="IE=edge,chrome=1" />
            <meta name="viewport" content="width=device-width" />
            <title>Elastic</title>
            <link rel="icon" type="image/svg+xml" href="/favicons/favicon.svg" />
            <link rel="alternate icon" type="image/png" href="/favicons/favicon.png" />
            <meta name="theme-color" content="#ffffff" />
            <meta name="color-scheme" content="light dark" />
            <meta http-equiv="refresh" content="0;url=/mock-server-basepath/login?msg=UNAUTHENTICATED&next=%2Fmock-server-basepath%2Fapp%2Fsome" />
            <style type="text/css">
              body { opacity: 0; animation: fade-in 0.5s ease-in 2s forwards; }
              @keyframes fade-in { to { opacity: 1; } }
            </style>
          </head>
          <body>
            <h1>Unauthenticated</h1>
            <a href="/mock-server-basepath/login?msg=UNAUTHENTICATED&next=%2Fmock-server-basepath%2Fapp%2Fsome">Click here if you are not redirected automatically</a>
          </body>
          </html>
          `,
          headers: {
            'Content-Security-Policy': CspConfig.DEFAULT.header,
            'Content-Security-Policy-Report-Only': CspConfig.DEFAULT.reportOnlyHeader,
            Refresh:
              '0;url=/mock-server-basepath/login?msg=UNAUTHENTICATED&next=%2Fmock-server-basepath%2Fapp%2Fsome',
          },
        });
      });

      it('performs logout if user has an active session', async () => {
        mockStartAuthenticationParams.session.getSID.mockResolvedValue('some-sid');

        const { authenticator, onPreResponseHandler } = getService();
        authenticator.getRequestOriginalURL.mockReturnValue('/mock-server-basepath/app/some');
        mockCanRedirectRequest.mockReturnValue(true);

        await expect(
          onPreResponseHandler(
            httpServerMock.createKibanaRequest({ path: '/app/some', query: { param: 'one two' } }),
            { statusCode: 401 },
            mockOnPreResponseToolkit
          )
        ).resolves.toBe(mockReturnedValue);

        expect(mockOnPreResponseToolkit.render).toHaveBeenCalledWith({
          body: dedent`
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charSet="utf-8" />
            <meta httpEquiv="X-UA-Compatible" content="IE=edge,chrome=1" />
            <meta name="viewport" content="width=device-width" />
            <title>Elastic</title>
            <link rel="icon" type="image/svg+xml" href="/favicons/favicon.svg" />
            <link rel="alternate icon" type="image/png" href="/favicons/favicon.png" />
            <meta name="theme-color" content="#ffffff" />
            <meta name="color-scheme" content="light dark" />
            <meta http-equiv="refresh" content="0;url=/mock-server-basepath/logout?msg=UNAUTHENTICATED&next=%2Fmock-server-basepath%2Fapp%2Fsome" />
            <style type="text/css">
              body { opacity: 0; animation: fade-in 0.5s ease-in 2s forwards; }
              @keyframes fade-in { to { opacity: 1; } }
            </style>
          </head>
          <body>
            <h1>Unauthenticated</h1>
            <a href="/mock-server-basepath/logout?msg=UNAUTHENTICATED&next=%2Fmock-server-basepath%2Fapp%2Fsome">Click here if you are not redirected automatically</a>
          </body>
          </html>
          `,
          headers: {
            'Content-Security-Policy': CspConfig.DEFAULT.header,
            'Content-Security-Policy-Report-Only': CspConfig.DEFAULT.reportOnlyHeader,
            Refresh:
              '0;url=/mock-server-basepath/logout?msg=UNAUTHENTICATED&next=%2Fmock-server-basepath%2Fapp%2Fsome',
          },
        });
      });

      it('does not preserve path for the authentication flow paths', async () => {
        const { authenticator, onPreResponseHandler } = getService();
        authenticator.getRequestOriginalURL.mockReturnValue('/mock-server-basepath/app/some');
        mockCanRedirectRequest.mockReturnValue(true);

        await expect(
          onPreResponseHandler(
            httpServerMock.createKibanaRequest({
              path: '/api/security/saml/callback',
              query: { param: 'one two' },
              routeTags: [ROUTE_TAG_AUTH_FLOW],
            }),
            { statusCode: 401 },
            mockOnPreResponseToolkit
          )
        ).resolves.toBe(mockReturnedValue);

        expect(mockOnPreResponseToolkit.render).toHaveBeenCalledWith({
          body: dedent`
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charSet="utf-8" />
            <meta httpEquiv="X-UA-Compatible" content="IE=edge,chrome=1" />
            <meta name="viewport" content="width=device-width" />
            <title>Elastic</title>
            <link rel="icon" type="image/svg+xml" href="/favicons/favicon.svg" />
            <link rel="alternate icon" type="image/png" href="/favicons/favicon.png" />
            <meta name="theme-color" content="#ffffff" />
            <meta name="color-scheme" content="light dark" />
            <meta http-equiv="refresh" content="0;url=/mock-server-basepath/login?msg=UNAUTHENTICATED&next=%2Fmock-server-basepath%2F" />
            <style type="text/css">
              body { opacity: 0; animation: fade-in 0.5s ease-in 2s forwards; }
              @keyframes fade-in { to { opacity: 1; } }
            </style>
          </head>
          <body>
            <h1>Unauthenticated</h1>
            <a href="/mock-server-basepath/login?msg=UNAUTHENTICATED&next=%2Fmock-server-basepath%2F">Click here if you are not redirected automatically</a>
          </body>
          </html>
          `,
          headers: {
            'Content-Security-Policy': CspConfig.DEFAULT.header,
            'Content-Security-Policy-Report-Only': CspConfig.DEFAULT.reportOnlyHeader,
            Refresh:
              '0;url=/mock-server-basepath/login?msg=UNAUTHENTICATED&next=%2Fmock-server-basepath%2F',
          },
        });
      });
    });

    describe('when login selector is available', () => {
      let mockReturnedValue: { type: any; body: string };
      let mockOnPreResponseToolkit: jest.Mocked<OnPreResponseToolkit>;
      beforeEach(() => {
        mockReturnedValue = { type: 'render' as any, body: 'body' };
        mockOnPreResponseToolkit = httpServiceMock.createOnPreResponseToolkit();
        mockOnPreResponseToolkit.render.mockReturnValue(mockReturnedValue);

        mockSetupAuthenticationParams.config = createConfig(
          ConfigSchema.validate({
            authc: {
              providers: {
                saml: { saml1: { order: 0, realm: 'saml1' } },
                basic: { basic1: { order: 1 } },
              },
            },
          }),
          loggingSystemMock.create().get(),
          { isTLSEnabled: false }
        );
      });

      it('redirects to the login page when user does not have an active session', async () => {
        const { authenticator, onPreResponseHandler } = getService();
        authenticator.getRequestOriginalURL.mockReturnValue('/mock-server-basepath/app/some');
        mockCanRedirectRequest.mockReturnValue(true);

        await expect(
          onPreResponseHandler(
            httpServerMock.createKibanaRequest({ path: '/app/some', query: { param: 'one two' } }),
            { statusCode: 401 },
            mockOnPreResponseToolkit
          )
        ).resolves.toBe(mockReturnedValue);

        expect(mockOnPreResponseToolkit.render).toHaveBeenCalledWith({
          body: dedent`
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charSet="utf-8" />
            <meta httpEquiv="X-UA-Compatible" content="IE=edge,chrome=1" />
            <meta name="viewport" content="width=device-width" />
            <title>Elastic</title>
            <link rel="icon" type="image/svg+xml" href="/favicons/favicon.svg" />
            <link rel="alternate icon" type="image/png" href="/favicons/favicon.png" />
            <meta name="theme-color" content="#ffffff" />
            <meta name="color-scheme" content="light dark" />
            <meta http-equiv="refresh" content="0;url=/mock-server-basepath/login?msg=UNAUTHENTICATED&next=%2Fmock-server-basepath%2Fapp%2Fsome" />
            <style type="text/css">
              body { opacity: 0; animation: fade-in 0.5s ease-in 2s forwards; }
              @keyframes fade-in { to { opacity: 1; } }
            </style>
          </head>
          <body>
            <h1>Unauthenticated</h1>
            <a href="/mock-server-basepath/login?msg=UNAUTHENTICATED&next=%2Fmock-server-basepath%2Fapp%2Fsome">Click here if you are not redirected automatically</a>
          </body>
          </html>
          `,
          headers: {
            'Content-Security-Policy': CspConfig.DEFAULT.header,
            'Content-Security-Policy-Report-Only': CspConfig.DEFAULT.reportOnlyHeader,
            Refresh:
              '0;url=/mock-server-basepath/login?msg=UNAUTHENTICATED&next=%2Fmock-server-basepath%2Fapp%2Fsome',
          },
        });
      });

      it('performs logout if user has an active session', async () => {
        mockStartAuthenticationParams.session.getSID.mockResolvedValue('some-sid');

        const { authenticator, onPreResponseHandler } = getService();
        authenticator.getRequestOriginalURL.mockReturnValue('/mock-server-basepath/app/some');
        mockCanRedirectRequest.mockReturnValue(true);

        await expect(
          onPreResponseHandler(
            httpServerMock.createKibanaRequest({ path: '/app/some', query: { param: 'one two' } }),
            { statusCode: 401 },
            mockOnPreResponseToolkit
          )
        ).resolves.toBe(mockReturnedValue);

        expect(mockOnPreResponseToolkit.render).toHaveBeenCalledWith({
          body: dedent`
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charSet="utf-8" />
            <meta httpEquiv="X-UA-Compatible" content="IE=edge,chrome=1" />
            <meta name="viewport" content="width=device-width" />
            <title>Elastic</title>
            <link rel="icon" type="image/svg+xml" href="/favicons/favicon.svg" />
            <link rel="alternate icon" type="image/png" href="/favicons/favicon.png" />
            <meta name="theme-color" content="#ffffff" />
            <meta name="color-scheme" content="light dark" />
            <meta http-equiv="refresh" content="0;url=/mock-server-basepath/logout?msg=UNAUTHENTICATED&next=%2Fmock-server-basepath%2Fapp%2Fsome" />
            <style type="text/css">
              body { opacity: 0; animation: fade-in 0.5s ease-in 2s forwards; }
              @keyframes fade-in { to { opacity: 1; } }
            </style>
          </head>
          <body>
            <h1>Unauthenticated</h1>
            <a href="/mock-server-basepath/logout?msg=UNAUTHENTICATED&next=%2Fmock-server-basepath%2Fapp%2Fsome">Click here if you are not redirected automatically</a>
          </body>
          </html>
          `,
          headers: {
            'Content-Security-Policy': CspConfig.DEFAULT.header,
            'Content-Security-Policy-Report-Only': CspConfig.DEFAULT.reportOnlyHeader,
            Refresh:
              '0;url=/mock-server-basepath/logout?msg=UNAUTHENTICATED&next=%2Fmock-server-basepath%2Fapp%2Fsome',
          },
        });
      });

      it('does not preserve path for the authentication flow paths', async () => {
        const { authenticator, onPreResponseHandler } = getService();
        authenticator.getRequestOriginalURL.mockReturnValue('/mock-server-basepath/app/some');
        mockCanRedirectRequest.mockReturnValue(true);

        await expect(
          onPreResponseHandler(
            httpServerMock.createKibanaRequest({
              path: '/api/security/saml/callback',
              query: { param: 'one two' },
              routeTags: [ROUTE_TAG_AUTH_FLOW],
            }),
            { statusCode: 401 },
            mockOnPreResponseToolkit
          )
        ).resolves.toBe(mockReturnedValue);

        expect(mockOnPreResponseToolkit.render).toHaveBeenCalledWith({
          body: dedent`
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charSet="utf-8" />
            <meta httpEquiv="X-UA-Compatible" content="IE=edge,chrome=1" />
            <meta name="viewport" content="width=device-width" />
            <title>Elastic</title>
            <link rel="icon" type="image/svg+xml" href="/favicons/favicon.svg" />
            <link rel="alternate icon" type="image/png" href="/favicons/favicon.png" />
            <meta name="theme-color" content="#ffffff" />
            <meta name="color-scheme" content="light dark" />
            <meta http-equiv="refresh" content="0;url=/mock-server-basepath/login?msg=UNAUTHENTICATED&next=%2Fmock-server-basepath%2F" />
            <style type="text/css">
              body { opacity: 0; animation: fade-in 0.5s ease-in 2s forwards; }
              @keyframes fade-in { to { opacity: 1; } }
            </style>
          </head>
          <body>
            <h1>Unauthenticated</h1>
            <a href="/mock-server-basepath/login?msg=UNAUTHENTICATED&next=%2Fmock-server-basepath%2F">Click here if you are not redirected automatically</a>
          </body>
          </html>
          `,
          headers: {
            'Content-Security-Policy': CspConfig.DEFAULT.header,
            'Content-Security-Policy-Report-Only': CspConfig.DEFAULT.reportOnlyHeader,
            Refresh:
              '0;url=/mock-server-basepath/login?msg=UNAUTHENTICATED&next=%2Fmock-server-basepath%2F',
          },
        });
      });
    });

    describe('when neither login selector nor login form is available', () => {
      let mockReturnedValue: { type: any; body: string };
      let mockOnPreResponseToolkit: jest.Mocked<OnPreResponseToolkit>;
      beforeEach(() => {
        mockReturnedValue = { type: 'render' as any, body: 'body' };
        mockOnPreResponseToolkit = httpServiceMock.createOnPreResponseToolkit();
        mockOnPreResponseToolkit.render.mockReturnValue(mockReturnedValue);

        mockSetupAuthenticationParams.config = createConfig(
          ConfigSchema.validate({
            authc: { providers: { saml: { saml1: { order: 0, realm: 'saml1' } } } },
          }),
          loggingSystemMock.create().get(),
          { isTLSEnabled: false }
        );
      });

      it('renders unauthenticated page if user does not have an active session', async () => {
        const { authenticator, onPreResponseHandler } = getService();
        authenticator.getRequestOriginalURL.mockReturnValue('/mock-server-basepath/app/some');
        mockCanRedirectRequest.mockReturnValue(true);
        await expect(
          onPreResponseHandler(
            httpServerMock.createKibanaRequest({ path: '/app/some', query: { param: 'one two' } }),
            { statusCode: 401 },
            mockOnPreResponseToolkit
          )
        ).resolves.toBe(mockReturnedValue);

        expect(mockOnPreResponseToolkit.render).toHaveBeenCalledWith({
          body: dedent`
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charSet="utf-8" />
            <meta httpEquiv="X-UA-Compatible" content="IE=edge,chrome=1" />
            <meta name="viewport" content="width=device-width" />
            <title>Elastic</title>
            <link rel="icon" type="image/svg+xml" href="/favicons/favicon.svg" />
            <link rel="alternate icon" type="image/png" href="/favicons/favicon.png" />
            <meta name="theme-color" content="#ffffff" />
            <meta name="color-scheme" content="light dark" />
            <meta http-equiv="refresh" content="0;url=/mock-server-basepath/security/unauthenticated?next=%2Fmock-server-basepath%2Fapp%2Fsome" />
            <style type="text/css">
              body { opacity: 0; animation: fade-in 0.5s ease-in 2s forwards; }
              @keyframes fade-in { to { opacity: 1; } }
            </style>
          </head>
          <body>
            <h1>Unauthenticated</h1>
            <a href="/mock-server-basepath/security/unauthenticated?next=%2Fmock-server-basepath%2Fapp%2Fsome">Click here if you are not redirected automatically</a>
          </body>
          </html>
          `,
          headers: {
            'Content-Security-Policy': CspConfig.DEFAULT.header,
            'Content-Security-Policy-Report-Only': CspConfig.DEFAULT.reportOnlyHeader,
            Refresh:
              '0;url=/mock-server-basepath/security/unauthenticated?next=%2Fmock-server-basepath%2Fapp%2Fsome',
          },
        });
      });

      it('renders unauthenticated page if user has an active session', async () => {
        mockStartAuthenticationParams.session.getSID.mockResolvedValue('some-sid');

        const { authenticator, onPreResponseHandler } = getService();
        authenticator.getRequestOriginalURL.mockReturnValue('/mock-server-basepath/app/some');
        mockCanRedirectRequest.mockReturnValue(true);

        await expect(
          onPreResponseHandler(
            httpServerMock.createKibanaRequest({ path: '/app/some', query: { param: 'one two' } }),
            { statusCode: 401 },
            mockOnPreResponseToolkit
          )
        ).resolves.toBe(mockReturnedValue);

        expect(mockOnPreResponseToolkit.render).toHaveBeenCalledWith({
          body: dedent`
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charSet="utf-8" />
            <meta httpEquiv="X-UA-Compatible" content="IE=edge,chrome=1" />
            <meta name="viewport" content="width=device-width" />
            <title>Elastic</title>
            <link rel="icon" type="image/svg+xml" href="/favicons/favicon.svg" />
            <link rel="alternate icon" type="image/png" href="/favicons/favicon.png" />
            <meta name="theme-color" content="#ffffff" />
            <meta name="color-scheme" content="light dark" />
            <meta http-equiv="refresh" content="0;url=/mock-server-basepath/security/unauthenticated?next=%2Fmock-server-basepath%2Fapp%2Fsome" />
            <style type="text/css">
              body { opacity: 0; animation: fade-in 0.5s ease-in 2s forwards; }
              @keyframes fade-in { to { opacity: 1; } }
            </style>
          </head>
          <body>
            <h1>Unauthenticated</h1>
            <a href="/mock-server-basepath/security/unauthenticated?next=%2Fmock-server-basepath%2Fapp%2Fsome">Click here if you are not redirected automatically</a>
          </body>
          </html>
          `,
          headers: {
            'Content-Security-Policy': CspConfig.DEFAULT.header,
            'Content-Security-Policy-Report-Only': CspConfig.DEFAULT.reportOnlyHeader,
            Refresh:
              '0;url=/mock-server-basepath/security/unauthenticated?next=%2Fmock-server-basepath%2Fapp%2Fsome',
          },
        });
      });

      it('does not preserve path for the authentication flow paths', async () => {
        const { authenticator, onPreResponseHandler } = getService();
        authenticator.getRequestOriginalURL.mockReturnValue('/mock-server-basepath/app/some');
        mockCanRedirectRequest.mockReturnValue(true);

        await expect(
          onPreResponseHandler(
            httpServerMock.createKibanaRequest({
              path: '/api/security/saml/callback',
              query: { param: 'one two' },
              routeTags: [ROUTE_TAG_AUTH_FLOW],
            }),
            { statusCode: 401 },
            mockOnPreResponseToolkit
          )
        ).resolves.toBe(mockReturnedValue);

        expect(mockOnPreResponseToolkit.render).toHaveBeenCalledWith({
          body: dedent`
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charSet="utf-8" />
            <meta httpEquiv="X-UA-Compatible" content="IE=edge,chrome=1" />
            <meta name="viewport" content="width=device-width" />
            <title>Elastic</title>
            <link rel="icon" type="image/svg+xml" href="/favicons/favicon.svg" />
            <link rel="alternate icon" type="image/png" href="/favicons/favicon.png" />
            <meta name="theme-color" content="#ffffff" />
            <meta name="color-scheme" content="light dark" />
            <meta http-equiv="refresh" content="0;url=/mock-server-basepath/security/unauthenticated?next=%2Fmock-server-basepath%2F" />
            <style type="text/css">
              body { opacity: 0; animation: fade-in 0.5s ease-in 2s forwards; }
              @keyframes fade-in { to { opacity: 1; } }
            </style>
          </head>
          <body>
            <h1>Unauthenticated</h1>
            <a href="/mock-server-basepath/security/unauthenticated?next=%2Fmock-server-basepath%2F">Click here if you are not redirected automatically</a>
          </body>
          </html>
          `,
          headers: {
            'Content-Security-Policy': CspConfig.DEFAULT.header,
            'Content-Security-Policy-Report-Only': CspConfig.DEFAULT.reportOnlyHeader,
            Refresh:
              '0;url=/mock-server-basepath/security/unauthenticated?next=%2Fmock-server-basepath%2F',
          },
        });
      });
    });

    describe('handles unexpected post-authentication failures', () => {
      let mockReturnedValue: { type: any; body: string };
      let mockOnPreResponseToolkit: jest.Mocked<OnPreResponseToolkit>;
      beforeEach(() => {
        mockReturnedValue = { type: 'render' as any, body: 'body' };
        mockOnPreResponseToolkit = httpServiceMock.createOnPreResponseToolkit();
        mockOnPreResponseToolkit.render.mockReturnValue(mockReturnedValue);
      });

      it('when login page is unavailable', async () => {
        mockSetupAuthenticationParams.config = createConfig(
          ConfigSchema.validate({
            authc: {
              providers: { saml: { saml1: { order: 150, realm: 'saml1' } } },
            },
          }),
          loggingSystemMock.create().get(),
          { isTLSEnabled: false }
        );
        const { authenticator, onPreResponseHandler } = getService();
        authenticator.getRequestOriginalURL.mockReturnValue('/mock-server-basepath/app/some');
        mockCanRedirectRequest.mockReturnValue(true);

        await expect(
          onPreResponseHandler(
            httpServerMock.createKibanaRequest({
              path: '/app/some',
              query: { param: 'one two' },
              routeTags: [ROUTE_TAG_AUTH_FLOW],
            }),
            { statusCode: 500 },
            mockOnPreResponseToolkit
          )
        ).resolves.toBe(mockReturnedValue);

        expect(mockOnPreResponseToolkit.render).toHaveBeenCalledWith({
          body: dedent`
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charSet="utf-8" />
            <meta httpEquiv="X-UA-Compatible" content="IE=edge,chrome=1" />
            <meta name="viewport" content="width=device-width" />
            <title>Elastic</title>
            <link rel="icon" type="image/svg+xml" href="/favicons/favicon.svg" />
            <link rel="alternate icon" type="image/png" href="/favicons/favicon.png" />
            <meta name="theme-color" content="#ffffff" />
            <meta name="color-scheme" content="light dark" />
            <meta http-equiv="refresh" content="0;url=/mock-server-basepath/security/unauthenticated?next=%2Fmock-server-basepath%2F" />
            <style type="text/css">
              body { opacity: 0; animation: fade-in 0.5s ease-in 2s forwards; }
              @keyframes fade-in { to { opacity: 1; } }
            </style>
          </head>
          <body>
            <h1>Unauthenticated</h1>
            <a href="/mock-server-basepath/security/unauthenticated?next=%2Fmock-server-basepath%2F">Click here if you are not redirected automatically</a>
          </body>
          </html>
          `,
          headers: {
            'Content-Security-Policy': CspConfig.DEFAULT.header,
            'Content-Security-Policy-Report-Only': CspConfig.DEFAULT.reportOnlyHeader,
            Refresh:
              '0;url=/mock-server-basepath/security/unauthenticated?next=%2Fmock-server-basepath%2F',
          },
        });
      });

      it('when login page is available', async () => {
        mockSetupAuthenticationParams.config = createConfig(
          ConfigSchema.validate({
            authc: {
              selector: { enabled: true },
            },
          }),
          loggingSystemMock.create().get(),
          { isTLSEnabled: false }
        );
        const { authenticator, onPreResponseHandler } = getService();
        authenticator.getRequestOriginalURL.mockReturnValue('/mock-server-basepath/app/some');
        mockCanRedirectRequest.mockReturnValue(true);

        await expect(
          onPreResponseHandler(
            httpServerMock.createKibanaRequest({
              path: '/app/some',
              query: { param: 'one two' },
              routeTags: [ROUTE_TAG_AUTH_FLOW],
            }),
            { statusCode: 500 },
            mockOnPreResponseToolkit
          )
        ).resolves.toBe(mockReturnedValue);

        expect(mockOnPreResponseToolkit.render).toHaveBeenCalledWith({
          body: dedent`
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charSet="utf-8" />
            <meta httpEquiv="X-UA-Compatible" content="IE=edge,chrome=1" />
            <meta name="viewport" content="width=device-width" />
            <title>Elastic</title>
            <link rel="icon" type="image/svg+xml" href="/favicons/favicon.svg" />
            <link rel="alternate icon" type="image/png" href="/favicons/favicon.png" />
            <meta name="theme-color" content="#ffffff" />
            <meta name="color-scheme" content="light dark" />
            <meta http-equiv="refresh" content="0;url=/mock-server-basepath/login?msg=UNAUTHENTICATED&next=%2Fmock-server-basepath%2F" />
            <style type="text/css">
              body { opacity: 0; animation: fade-in 0.5s ease-in 2s forwards; }
              @keyframes fade-in { to { opacity: 1; } }
            </style>
          </head>
          <body>
            <h1>Unauthenticated</h1>
            <a href="/mock-server-basepath/login?msg=UNAUTHENTICATED&next=%2Fmock-server-basepath%2F">Click here if you are not redirected automatically</a>
          </body>
          </html>
          `,
          headers: {
            'Content-Security-Policy': CspConfig.DEFAULT.header,
            'Content-Security-Policy-Report-Only': CspConfig.DEFAULT.reportOnlyHeader,
            Refresh:
              '0;url=/mock-server-basepath/login?msg=UNAUTHENTICATED&next=%2Fmock-server-basepath%2F',
          },
        });
      });

      it('when logout redirect fails', async () => {
        const { authenticator, onPreResponseHandler } = getService();
        authenticator.getRequestOriginalURL.mockReturnValue('/mock-server-basepath/app/some');
        mockCanRedirectRequest.mockReturnValue(true);

        await expect(
          onPreResponseHandler(
            httpServerMock.createKibanaRequest({
              path: '/api/security/logout',
              routeTags: [ROUTE_TAG_AUTH_FLOW],
            }),
            { statusCode: 500 },
            mockOnPreResponseToolkit
          )
        ).resolves.toBe(mockReturnedValue);

        expect(mockOnPreResponseToolkit.render).toHaveBeenCalledWith({
          body: dedent`
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charSet="utf-8" />
            <meta httpEquiv="X-UA-Compatible" content="IE=edge,chrome=1" />
            <meta name="viewport" content="width=device-width" />
            <title>Elastic</title>
            <link rel="icon" type="image/svg+xml" href="/favicons/favicon.svg" />
            <link rel="alternate icon" type="image/png" href="/favicons/favicon.png" />
            <meta name="theme-color" content="#ffffff" />
            <meta name="color-scheme" content="light dark" />
            <meta http-equiv="refresh" content="0;url=/mock-server-basepath/security/unauthenticated?next=%2Fmock-server-basepath%2F" />
            <style type="text/css">
              body { opacity: 0; animation: fade-in 0.5s ease-in 2s forwards; }
              @keyframes fade-in { to { opacity: 1; } }
            </style>
          </head>
          <body>
            <h1>Unauthenticated</h1>
            <a href="/mock-server-basepath/security/unauthenticated?next=%2Fmock-server-basepath%2F">Click here if you are not redirected automatically</a>
          </body>
          </html>
          `,
          headers: {
            'Content-Security-Policy': CspConfig.DEFAULT.header,
            'Content-Security-Policy-Report-Only': CspConfig.DEFAULT.reportOnlyHeader,
            Refresh:
              '0;url=/mock-server-basepath/security/unauthenticated?next=%2Fmock-server-basepath%2F',
          },
        });
      });
    });
  });
});
