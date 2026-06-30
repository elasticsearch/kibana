/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

jest.mock('./providers/basic');
jest.mock('./providers/token');
jest.mock('./providers/saml');
jest.mock('./providers/http');

import { errors } from '@elastic/elasticsearch';

import {
  elasticsearchServiceMock,
  httpServerMock,
  httpServiceMock,
  loggingSystemMock,
} from '@kbn/core/server/mocks';
import type { AuditLogger } from '@kbn/security-plugin-types-server';
import type { PublicMethodsOf } from '@kbn/utility-types';

import { AuthenticationResult } from './authentication_result';
import type { AuthenticatorOptions } from './authenticator';
import { Authenticator, enrichWithUserProfileId } from './authenticator';
import { DeauthenticationResult } from './deauthentication_result';
import type {
  BasicAuthenticationProvider,
  HTTPAuthenticationProvider,
  SAMLAuthenticationProvider,
} from './providers';
import type { SecurityLicenseFeatures } from '../../common';
import {
  AUTH_PROVIDER_HINT_QUERY_STRING_PARAMETER,
  AUTH_URL_HASH_QUERY_STRING_PARAMETER,
  SESSION_ERROR_REASON_HEADER,
} from '../../common/constants';
import { licenseMock } from '../../common/licensing/index.mock';
import { mockAuthenticatedUser } from '../../common/model/authenticated_user.mock';
import { userProfileMock } from '../../common/model/user_profile.mock';
import { LogoutReason } from '../../common/types';
import { auditLoggerMock, auditServiceMock } from '../audit/mocks';
import { ConfigSchema, createConfig } from '../config';
import { securityFeatureUsageServiceMock } from '../feature_usage/index.mock';
import { securityMock } from '../mocks';
import { securityTelemetry } from '../otel/instrumentation';
import {
  SessionConcurrencyLimitError,
  type SessionError,
  SessionExpiredError,
  SessionMissingError,
  SessionUnexpectedError,
  type SessionValue,
} from '../session_management';
import { sessionMock } from '../session_management/index.mock';
import type { UserProfileGrant } from '../user_profile';
import { userProfileServiceMock } from '../user_profile/user_profile_service.mock';
jest.mock('../otel/instrumentation', () => ({
  securityTelemetry: {
    recordLoginDuration: jest.fn(),
    recordSessionCreationDuration: jest.fn(),
    recordUserProfileActivationDuration: jest.fn(),
  },
}));

let auditLogger: AuditLogger;
function getMockOptions({
  providers,
  http = {},
  selector,
  accessAgreementMessage,
  customLogoutURL,
  configContext = {},
}: {
  providers?: Record<string, unknown> | string[];
  http?: Partial<AuthenticatorOptions['config']['authc']['http']>;
  selector?: AuthenticatorOptions['config']['authc']['selector'];
  accessAgreementMessage?: string;
  customLogoutURL?: string;
  configContext?: Record<string, unknown>;
} = {}) {
  const auditService = auditServiceMock.create();
  auditLogger = auditLoggerMock.create();
  auditService.asScoped.mockReturnValue(auditLogger);

  const accessAgreementObj = accessAgreementMessage
    ? { accessAgreement: { message: accessAgreementMessage } }
    : null;

  return {
    audit: auditService,
    getCurrentUser: jest.fn(),
    clusterClient: elasticsearchServiceMock.createClusterClient(),
    basePath: httpServiceMock.createSetupContract().basePath,
    license: licenseMock.create(),
    loggers: loggingSystemMock.create(),
    getServerBaseURL: jest.fn(),
    config: createConfig(
      ConfigSchema.validate(
        { authc: { selector, providers, http }, ...accessAgreementObj },
        configContext
      ),
      loggingSystemMock.create().get(),
      { isTLSEnabled: false }
    ),
    session: sessionMock.create(),
    featureUsageService: securityFeatureUsageServiceMock.createStartContract(),
    userProfileService: userProfileServiceMock.createStart(),
    isElasticCloudDeployment: jest.fn().mockReturnValue(false),
    customLogoutURL,
    userActivity: { trackUserAction: jest.fn() },
  };
}

interface ExpectedAuditEvent {
  action: string;
  outcome?: string;
  kibana?: Record<string, unknown>;
}

function expectAuditEvents(...events: ExpectedAuditEvent[]) {
  expect(auditLogger.log).toHaveBeenCalledTimes(events.length);
  for (let i = 0; i < events.length; i++) {
    const { action, outcome, kibana } = events[i];
    expect(auditLogger.log).toHaveBeenNthCalledWith(
      i + 1,
      expect.objectContaining({
        event: { action, category: ['authentication'], ...(outcome && { outcome }) },
        ...(kibana && { kibana }),
      })
    );
  }
}

describe('Authenticator', () => {
  let mockHTTPAuthenticationProvider: jest.Mocked<PublicMethodsOf<HTTPAuthenticationProvider>>;
  let mockBasicAuthenticationProvider: jest.Mocked<PublicMethodsOf<BasicAuthenticationProvider>>;
  let mockSamlAuthenticationProvider: jest.Mocked<PublicMethodsOf<SAMLAuthenticationProvider>>;

  beforeEach(() => {
    mockHTTPAuthenticationProvider = {
      login: jest.fn(),
      authenticate: jest.fn().mockResolvedValue(AuthenticationResult.notHandled()),
      logout: jest.fn().mockResolvedValue(DeauthenticationResult.notHandled()),
      getHTTPAuthenticationScheme: jest.fn(),
      shouldInvalidateIntermediateSessionAfterLogin: jest.fn().mockReturnValue(true),
    };

    mockBasicAuthenticationProvider = {
      login: jest.fn(),
      authenticate: jest.fn().mockResolvedValue(AuthenticationResult.notHandled()),
      logout: jest.fn().mockResolvedValue(DeauthenticationResult.notHandled()),
      getHTTPAuthenticationScheme: jest.fn(),
      shouldInvalidateIntermediateSessionAfterLogin: jest.fn().mockReturnValue(true),
    };

    mockSamlAuthenticationProvider = {
      login: jest.fn(),
      authenticate: jest.fn().mockResolvedValue(AuthenticationResult.notHandled()),
      logout: jest.fn().mockResolvedValue(DeauthenticationResult.notHandled()),
      getHTTPAuthenticationScheme: jest.fn(),
      shouldInvalidateIntermediateSessionAfterLogin: jest.fn().mockReturnValue(true),
    };

    jest.requireMock('./providers/http').HTTPAuthenticationProvider.mockImplementation(() => ({
      type: 'http',
      ...mockHTTPAuthenticationProvider,
    }));

    jest.requireMock('./providers/basic').BasicAuthenticationProvider.mockImplementation(() => ({
      type: 'basic',
      ...mockBasicAuthenticationProvider,
    }));

    jest.requireMock('./providers/saml').SAMLAuthenticationProvider.mockImplementation(() => ({
      type: 'saml',
      ...mockSamlAuthenticationProvider,
    }));
  });

  afterEach(() => jest.clearAllMocks());

  describe('initialization', () => {
    it('fails if authentication providers are not configured.', () => {
      expect(
        () => new Authenticator(getMockOptions({ providers: {}, http: { enabled: false } }))
      ).toThrowError(
        'No authentication provider is configured. Verify `xpack.security.authc.*` config value.'
      );
    });

    it('fails if configured authentication provider is not known.', () => {
      expect(() => new Authenticator(getMockOptions({ providers: ['super-basic'] }))).toThrowError(
        'Unsupported authentication provider name: super-basic.'
      );
    });

    it('fails if any of the user specified provider uses reserved __http__ name.', () => {
      expect(
        () =>
          new Authenticator(getMockOptions({ providers: { basic: { __http__: { order: 0 } } } }))
      ).toThrowError('Provider name "__http__" is reserved.');
    });

    describe('#options.urls.loggedOut', () => {
      it('points to /login if provider requires login form', () => {
        const authenticationProviderMock =
          jest.requireMock(`./providers/basic`).BasicAuthenticationProvider;
        authenticationProviderMock.mockClear();
        new Authenticator(getMockOptions());
        const getLoggedOutURL = authenticationProviderMock.mock.calls[0][0].urls.loggedOut;

        expect(getLoggedOutURL(httpServerMock.createKibanaRequest())).toBe(
          '/mock-server-basepath/login?msg=LOGGED_OUT'
        );

        expect(
          getLoggedOutURL(
            httpServerMock.createKibanaRequest({
              query: { next: '/app/ml/encode me', msg: 'SESSION_EXPIRED' },
            })
          )
        ).toBe('/mock-server-basepath/login?next=%2Fapp%2Fml%2Fencode+me&msg=SESSION_EXPIRED');
      });

      it('points to /login if login selector is enabled', () => {
        const authenticationProviderMock =
          jest.requireMock(`./providers/saml`).SAMLAuthenticationProvider;
        authenticationProviderMock.mockClear();
        new Authenticator(
          getMockOptions({
            selector: { enabled: true },
            providers: { saml: { saml1: { order: 0, realm: 'realm' } } },
          })
        );
        const getLoggedOutURL = authenticationProviderMock.mock.calls[0][0].urls.loggedOut;

        expect(getLoggedOutURL(httpServerMock.createKibanaRequest())).toBe(
          '/mock-server-basepath/login?msg=LOGGED_OUT'
        );

        expect(
          getLoggedOutURL(
            httpServerMock.createKibanaRequest({
              query: { next: '/app/ml/encode me', msg: 'SESSION_EXPIRED' },
            })
          )
        ).toBe('/mock-server-basepath/login?next=%2Fapp%2Fml%2Fencode+me&msg=SESSION_EXPIRED');
      });

      it('points to /security/logged_out if login selector is NOT enabled', () => {
        const authenticationProviderMock =
          jest.requireMock(`./providers/saml`).SAMLAuthenticationProvider;
        authenticationProviderMock.mockClear();
        new Authenticator(
          getMockOptions({
            selector: { enabled: false },
            providers: { saml: { saml1: { order: 0, realm: 'realm' } } },
          })
        );
        const getLoggedOutURL = authenticationProviderMock.mock.calls[0][0].urls.loggedOut;

        expect(getLoggedOutURL(httpServerMock.createKibanaRequest())).toBe(
          '/mock-server-basepath/security/logged_out?msg=LOGGED_OUT'
        );

        expect(
          getLoggedOutURL(
            httpServerMock.createKibanaRequest({
              query: { next: '/app/ml/encode me', msg: 'SESSION_EXPIRED' },
            })
          )
        ).toBe(
          '/mock-server-basepath/security/logged_out?next=%2Fapp%2Fml%2Fencode+me&msg=SESSION_EXPIRED'
        );
      });

      describe('custom URL', () => {
        it('points to a custom URL if `customLogoutURL` is specified and logout reason is not SESSION_EXPIRED', () => {
          const authenticationProviderMock =
            jest.requireMock(`./providers/saml`).SAMLAuthenticationProvider;
          authenticationProviderMock.mockClear();
          new Authenticator(
            getMockOptions({
              selector: { enabled: false },
              providers: { saml: { saml1: { order: 0, realm: 'realm' } } },
              customLogoutURL: 'https://some-logout-origin/logout',
            })
          );
          const getLoggedOutURL = authenticationProviderMock.mock.calls[0][0].urls.loggedOut;

          expect(getLoggedOutURL(httpServerMock.createKibanaRequest())).toBe(
            'https://some-logout-origin/logout'
          );

          // We don't forward any Kibana specific query string parameters to the external logout URL.
          expect(
            getLoggedOutURL(
              httpServerMock.createKibanaRequest({
                query: { next: '/app/ml/encode me', msg: LogoutReason.LOGGED_OUT },
              })
            )
          ).toBe('https://some-logout-origin/logout');
        });

        it('does not point to a custom URL if `customLogoutURL` is specified and logout reason is SESSION_EXPIRED', () => {
          const authenticationProviderMock =
            jest.requireMock(`./providers/saml`).SAMLAuthenticationProvider;
          authenticationProviderMock.mockClear();
          new Authenticator(
            getMockOptions({
              selector: { enabled: false },
              providers: { saml: { saml1: { order: 0, realm: 'realm' } } },
              customLogoutURL: 'https://some-logout-origin/logout',
            })
          );
          const getLoggedOutURL = authenticationProviderMock.mock.calls[0][0].urls.loggedOut;

          expect(
            getLoggedOutURL(
              httpServerMock.createKibanaRequest({ query: { msg: LogoutReason.SESSION_EXPIRED } })
            )
          ).toBe('/mock-server-basepath/security/logged_out?msg=SESSION_EXPIRED');
        });

        it('does not point to a custom URL if `customLogoutURL` is specified and logout reason is SESSION_IDLE_TIMEOUT', () => {
          const authenticationProviderMock =
            jest.requireMock(`./providers/saml`).SAMLAuthenticationProvider;
          authenticationProviderMock.mockClear();
          new Authenticator(
            getMockOptions({
              selector: { enabled: false },
              providers: { saml: { saml1: { order: 0, realm: 'realm' } } },
              customLogoutURL: 'https://some-logout-origin/logout',
            })
          );
          const getLoggedOutURL = authenticationProviderMock.mock.calls[0][0].urls.loggedOut;

          expect(
            getLoggedOutURL(
              httpServerMock.createKibanaRequest({
                query: { msg: LogoutReason.SESSION_IDLE_TIMEOUT },
              })
            )
          ).toBe('/mock-server-basepath/security/logged_out?msg=SESSION_IDLE_TIMEOUT');
        });

        it('does not point to a custom URL if `customLogoutURL` is specified and logout reason is SESSION_LIFESPAN_TIMEOUT', () => {
          const authenticationProviderMock =
            jest.requireMock(`./providers/saml`).SAMLAuthenticationProvider;
          authenticationProviderMock.mockClear();
          new Authenticator(
            getMockOptions({
              selector: { enabled: false },
              providers: { saml: { saml1: { order: 0, realm: 'realm' } } },
              customLogoutURL: 'https://some-logout-origin/logout',
            })
          );
          const getLoggedOutURL = authenticationProviderMock.mock.calls[0][0].urls.loggedOut;

          expect(
            getLoggedOutURL(
              httpServerMock.createKibanaRequest({
                query: { msg: LogoutReason.SESSION_LIFESPAN_TIMEOUT },
              })
            )
          ).toBe('/mock-server-basepath/security/logged_out?msg=SESSION_LIFESPAN_TIMEOUT');
        });
      });
    });

    describe('HTTP authentication provider', () => {
      beforeEach(() => {
        jest
          .requireMock('./providers/basic')
          .BasicAuthenticationProvider.mockImplementation(() => ({
            type: 'basic',
            getHTTPAuthenticationScheme: jest.fn().mockReturnValue('basic'),
          }));
      });

      afterEach(() => jest.resetAllMocks());

      it('enabled by default', () => {
        new Authenticator(getMockOptions());

        expect(
          jest.requireMock('./providers/http').HTTPAuthenticationProvider
        ).toHaveBeenCalledWith(expect.anything(), {
          supportedSchemes: new Set(['apikey', 'bearer', 'basic']),
        });
      });

      it('includes all required schemes if `autoSchemesEnabled` is enabled', () => {
        new Authenticator(
          getMockOptions({
            providers: { basic: { basic1: { order: 0 } }, kerberos: { kerberos1: { order: 1 } } },
          })
        );

        expect(
          jest.requireMock('./providers/http').HTTPAuthenticationProvider
        ).toHaveBeenCalledWith(expect.anything(), {
          supportedSchemes: new Set(['apikey', 'basic', 'bearer']),
        });
      });

      it('includes JWT options if specified', () => {
        new Authenticator(
          getMockOptions({
            providers: { basic: { basic1: { order: 0 } } },
            http: { jwt: { taggedRoutesOnly: true } },
            configContext: { serverless: true },
          })
        );

        expect(
          jest.requireMock('./providers/http').HTTPAuthenticationProvider
        ).toHaveBeenCalledWith(expect.anything(), {
          supportedSchemes: new Set(['apikey', 'bearer', 'basic']),
          jwt: { taggedRoutesOnly: true },
        });
      });

      it('does not include additional schemes if `autoSchemesEnabled` is disabled', () => {
        new Authenticator(
          getMockOptions({
            providers: { basic: { basic1: { order: 0 } }, kerberos: { kerberos1: { order: 1 } } },
            http: { autoSchemesEnabled: false },
          })
        );

        expect(
          jest.requireMock('./providers/http').HTTPAuthenticationProvider
        ).toHaveBeenCalledWith(expect.anything(), {
          supportedSchemes: new Set(['apikey', 'bearer']),
        });
      });

      it('disabled if explicitly disabled', () => {
        new Authenticator(
          getMockOptions({
            providers: { basic: { basic1: { order: 0 } } },
            http: { enabled: false },
          })
        );

        expect(
          jest.requireMock('./providers/http').HTTPAuthenticationProvider
        ).not.toHaveBeenCalled();
      });
    });
  });

  describe('`login` method', () => {
    let authenticator: Authenticator;
    let mockOptions: ReturnType<typeof getMockOptions>;
    let mockSessVal: SessionValue;

    beforeEach(() => {
      mockOptions = getMockOptions({
        providers: {
          basic: { basic1: { order: 0 } },
          oidc: { oidc1: { order: 1, realm: 'oidc' } },
        },
      });
      mockSessVal = sessionMock.createValue({ state: { authorization: 'Basic xxx' } });

      authenticator = new Authenticator(mockOptions);
    });

    it('fails if login attempt is not provided or invalid.', async () => {
      await expect(
        authenticator.login(httpServerMock.createKibanaRequest(), undefined as any)
      ).rejects.toThrowError(
        'Login attempt should be an object with non-empty "provider.type" or "provider.name" property.'
      );

      await expect(
        authenticator.login(httpServerMock.createKibanaRequest(), {} as any)
      ).rejects.toThrowError(
        'Login attempt should be an object with non-empty "provider.type" or "provider.name" property.'
      );

      await expect(
        authenticator.login(httpServerMock.createKibanaRequest(), {
          provider: 'basic',
          value: {},
        } as any)
      ).rejects.toThrowError(
        'Login attempt should be an object with non-empty "provider.type" or "provider.name" property.'
      );

      await expect(
        authenticator.login(httpServerMock.createKibanaRequest(), {
          provider: { type: 'oidc' },
          value: undefined,
        } as any)
      ).rejects.toThrowError('Login "attempt.value" should not be empty.');
      expect(auditLogger.log).not.toHaveBeenCalled();
    });

    it('fails if an authentication provider fails.', async () => {
      const request = httpServerMock.createKibanaRequest();
      const failureReason = new Error('Not Authorized');

      mockBasicAuthenticationProvider.login.mockResolvedValue(
        AuthenticationResult.failed(failureReason)
      );

      await expect(
        authenticator.login(request, { provider: { type: 'basic' }, value: {} })
      ).resolves.toEqual(AuthenticationResult.failed(failureReason));
      expectAuditEvents({ action: 'user_login', outcome: 'failure' });
    });

    it('returns user that authentication provider returns.', async () => {
      const request = httpServerMock.createKibanaRequest();
      mockOptions.session.create.mockResolvedValue(mockSessVal);

      const user = mockAuthenticatedUser();
      mockBasicAuthenticationProvider.login.mockResolvedValue(
        AuthenticationResult.succeeded(user, {
          authHeaders: { authorization: 'Basic .....' },
          state: {}, // to ensure a new session is created
        })
      );

      await expect(
        authenticator.login(request, { provider: { type: 'basic' }, value: {} })
      ).resolves.toEqual(
        AuthenticationResult.succeeded(user, {
          authHeaders: { authorization: 'Basic .....' },
          state: {},
        })
      );

      expect(securityTelemetry.recordLoginDuration).toHaveBeenCalledWith(expect.any(Number), {
        providerType: 'basic',
        outcome: 'success',
      });
      expectAuditEvents({ action: 'user_login', outcome: 'success' });
    });

    it('returns user enriched with user profile id.', async () => {
      const request = httpServerMock.createKibanaRequest();
      const user = mockAuthenticatedUser({ profile_uid: undefined });
      mockOptions.session.create.mockResolvedValue(
        sessionMock.createValue({
          userProfileId: 'PROFILE_ID',
        })
      );

      mockBasicAuthenticationProvider.login.mockResolvedValue(
        AuthenticationResult.succeeded(user, {
          state: {}, // to ensure a new session is created
        })
      );

      const result = await authenticator.login(request, { provider: { type: 'basic' }, value: {} });
      expect(result.user).toEqual(
        expect.objectContaining({
          profile_uid: 'PROFILE_ID',
        })
      );
    });

    describe('security telemetry', () => {
      it('records login duration when successful', async () => {
        const request = httpServerMock.createKibanaRequest();
        const user = mockAuthenticatedUser();
        mockBasicAuthenticationProvider.login.mockResolvedValue(
          AuthenticationResult.succeeded(user, { state: { authorization: 'Basic .....' } })
        );
        await authenticator.login(request, { provider: { type: 'basic' }, value: {} });
        expect(securityTelemetry.recordLoginDuration).toHaveBeenCalledWith(expect.any(Number), {
          providerType: 'basic',
          outcome: 'success',
        });
      });

      it('records login duration when not successful', async () => {
        const request = httpServerMock.createKibanaRequest();
        mockBasicAuthenticationProvider.login.mockResolvedValue(AuthenticationResult.notHandled());
        await authenticator.login(request, { provider: { type: 'basic' }, value: {} });
        expect(securityTelemetry.recordLoginDuration).toHaveBeenCalledWith(expect.any(Number), {
          providerType: 'basic',
          outcome: 'failure',
        });
      });

      it('records session creation duration when successful', async () => {
        const request = httpServerMock.createKibanaRequest();
        const user = mockAuthenticatedUser();
        mockBasicAuthenticationProvider.login.mockResolvedValue(
          AuthenticationResult.succeeded(user, { state: { authorization: 'Basic .....' } })
        );
        await authenticator.login(request, { provider: { type: 'basic' }, value: {} });
        expect(securityTelemetry.recordSessionCreationDuration).toHaveBeenCalledWith(
          expect.any(Number),
          {
            providerType: 'basic',
            outcome: 'success',
          }
        );
      });

      it('records user profile activation duration when successful', async () => {
        const user = mockAuthenticatedUser();
        const request = httpServerMock.createKibanaRequest();
        const authorization = `Basic ${Buffer.from('foo:bar').toString('base64')}`;
        const userProfileGrant: UserProfileGrant = {
          type: 'password',
          username: 'some-user',
          password: 'some-password',
        };

        mockBasicAuthenticationProvider.login.mockResolvedValue(
          AuthenticationResult.succeeded(user, { userProfileGrant, state: { authorization } })
        );

        await expect(
          authenticator.login(request, { provider: { type: 'basic' }, value: {} })
        ).resolves.toEqual(
          AuthenticationResult.succeeded(user, { userProfileGrant, state: { authorization } })
        );

        expect(securityTelemetry.recordUserProfileActivationDuration).toHaveBeenCalledWith(
          expect.any(Number),
          {
            providerType: 'basic',
            outcome: 'success',
          }
        );
      });
    });

    describe('user_login audit events', () => {
      // Every other test case includes audit event assertions, but the user_login event is a bit special.
      // We have these separate, detailed test cases to ensure that the session ID is included for user_login success events.
      // This allows us to keep audit event assertions in the other test cases simpler.

      it('adds audit event with session ID when successful.', async () => {
        const request = httpServerMock.createKibanaRequest();
        const user = mockAuthenticatedUser();
        mockBasicAuthenticationProvider.login.mockResolvedValue(
          AuthenticationResult.succeeded(user, {
            authHeaders: { authorization: 'Basic .....' },
            state: 'foo', // to ensure a new session is created
          })
        );
        mockOptions.session.create.mockResolvedValue({ ...mockSessVal, sid: '123' });
        await authenticator.login(request, { provider: { type: 'basic' }, value: {} });

        expect(mockOptions.session.create).toHaveBeenCalledTimes(1);
        expectAuditEvents({
          action: 'user_login',
          outcome: 'success',
          kibana: expect.objectContaining({ authentication_type: 'basic', session_id: '123' }),
        });
      });

      it('adds audit event without session ID when not successful.', async () => {
        const request = httpServerMock.createKibanaRequest();
        const failureReason = new Error('Not Authorized');
        mockBasicAuthenticationProvider.login.mockResolvedValue(
          AuthenticationResult.failed(failureReason)
        );
        await authenticator.login(request, { provider: { type: 'basic' }, value: {} });

        expect(mockOptions.session.create).not.toHaveBeenCalled();
        expectAuditEvents({
          action: 'user_login',
          outcome: 'failure',
          kibana: expect.objectContaining({ authentication_type: 'basic', session_id: undefined }),
        });
      });
    });

    describe('user activity tracking', () => {
      it('tracks log_in_user action on successful login', async () => {
        const request = httpServerMock.createKibanaRequest();
        const user = mockAuthenticatedUser();
        mockBasicAuthenticationProvider.login.mockResolvedValue(
          AuthenticationResult.succeeded(user, { state: { authorization: 'Basic .....' } })
        );
        mockOptions.session.create.mockResolvedValue(mockSessVal);

        await authenticator.login(request, { provider: { type: 'basic' }, value: {} });

        expect(mockOptions.userActivity.trackUserAction).toHaveBeenCalledTimes(1);
        expect(mockOptions.userActivity.trackUserAction).toHaveBeenCalledWith({
          message: 'User logged in via basic provider "basic1".',
          event: { action: 'log_in_user', type: 'start' },
          object: {
            id: user.username,
            name: user.username,
            type: 'user',
            tags: [],
          },
          metadata: {
            authenticationProvider: 'basic1',
            authenticationType: 'basic',
          },
        });
      });

      it('uses userProfileId as object id when profile is activated', async () => {
        const request = httpServerMock.createKibanaRequest();
        const user = mockAuthenticatedUser();
        const userProfileGrant: UserProfileGrant = {
          type: 'password',
          username: 'some-user',
          password: 'some-password',
        };

        mockBasicAuthenticationProvider.login.mockResolvedValue(
          AuthenticationResult.succeeded(user, {
            userProfileGrant,
            state: { authorization: 'Basic .....' },
          })
        );
        mockOptions.session.create.mockResolvedValue(mockSessVal);

        await authenticator.login(request, { provider: { type: 'basic' }, value: {} });

        expect(mockOptions.userActivity.trackUserAction).toHaveBeenCalledTimes(1);
        expect(mockOptions.userActivity.trackUserAction).toHaveBeenCalledWith(
          expect.objectContaining({
            object: expect.objectContaining({ id: 'some-profile-uid' }),
          })
        );
      });

      it('does not track user activity on failed login', async () => {
        const request = httpServerMock.createKibanaRequest();
        mockBasicAuthenticationProvider.login.mockResolvedValue(
          AuthenticationResult.failed(new Error('Not Authorized'))
        );

        await authenticator.login(request, { provider: { type: 'basic' }, value: {} });

        expect(mockOptions.userActivity.trackUserAction).not.toHaveBeenCalled();
      });

      it('does not track user activity when not handled', async () => {
        const request = httpServerMock.createKibanaRequest();

        await authenticator.login(request, { provider: { type: 'token' }, value: {} });

        expect(mockOptions.userActivity.trackUserAction).not.toHaveBeenCalled();
      });

      it('does not track log_out_user when invalidating an intermediate session during login', async () => {
        const request = httpServerMock.createKibanaRequest();
        mockOptions.session.get.mockResolvedValue({
          error: null,
          value: { ...mockSessVal, username: undefined },
        });

        const user = mockAuthenticatedUser();
        mockBasicAuthenticationProvider.login.mockResolvedValue(
          AuthenticationResult.succeeded(user, { state: { authorization: 'Basic .....' } })
        );

        await authenticator.login(request, { provider: { type: 'basic' }, value: {} });

        expect(mockOptions.userActivity.trackUserAction).toHaveBeenCalledTimes(1);
        expect(mockOptions.userActivity.trackUserAction).toHaveBeenCalledWith(
          expect.objectContaining({ event: { action: 'log_in_user', type: 'start' } })
        );
      });

      it('tracks log_out_user when login overwrites an existing session with a different username', async () => {
        const request = httpServerMock.createKibanaRequest();
        const user = mockAuthenticatedUser();
        mockOptions.session.get.mockResolvedValue({
          error: null,
          value: { ...mockSessVal, username: 'old-username' },
        });
        mockOptions.session.create.mockResolvedValue(mockSessVal);

        mockBasicAuthenticationProvider.login.mockResolvedValue(
          AuthenticationResult.succeeded(user, { state: { authorization: 'Basic .....' } })
        );

        await authenticator.login(request, { provider: { type: 'basic' }, value: {} });

        expect(mockOptions.userActivity.trackUserAction).toHaveBeenCalledTimes(2);
        expect(mockOptions.userActivity.trackUserAction).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({ event: { action: 'log_out_user', type: 'end' } })
        );
        expect(mockOptions.userActivity.trackUserAction).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({ event: { action: 'log_in_user', type: 'start' } })
        );
      });
    });

    it('does not add audit event when not handled.', async () => {
      const request = httpServerMock.createKibanaRequest();
      await expect(
        authenticator.login(request, { provider: { type: 'token' }, value: {} })
      ).resolves.toEqual(AuthenticationResult.notHandled());

      await authenticator.login(request, { provider: { name: 'basic2' }, value: {} });

      expect(auditLogger.log).not.toHaveBeenCalled();
    });

    it('creates session whenever authentication provider returns state', async () => {
      const user = mockAuthenticatedUser();
      const request = httpServerMock.createKibanaRequest();
      const authorization = `Basic ${Buffer.from('foo:bar').toString('base64')}`;

      mockBasicAuthenticationProvider.login.mockResolvedValue(
        AuthenticationResult.succeeded(user, { state: { authorization } })
      );

      await expect(
        authenticator.login(request, { provider: { type: 'basic' }, value: {} })
      ).resolves.toEqual(AuthenticationResult.succeeded(user, { state: { authorization } }));

      expect(mockOptions.session.create).toHaveBeenCalledTimes(1);
      expect(mockOptions.session.create).toHaveBeenCalledWith(
        request,
        {
          username: user.username,
          userProfileId: undefined,
          provider: mockSessVal.provider,
          state: { authorization },
        },
        undefined
      );
      expectAuditEvents({ action: 'user_login', outcome: 'success' });
      expect(mockOptions.userProfileService.activate).not.toHaveBeenCalled();
    });

    it('activates profile whenever authentication provider returns user profile grant', async () => {
      const user = mockAuthenticatedUser();
      const request = httpServerMock.createKibanaRequest();
      const authorization = `Basic ${Buffer.from('foo:bar').toString('base64')}`;
      const userProfileGrant: UserProfileGrant = {
        type: 'password',
        username: 'some-user',
        password: 'some-password',
      };

      mockBasicAuthenticationProvider.login.mockResolvedValue(
        AuthenticationResult.succeeded(user, { userProfileGrant, state: { authorization } })
      );

      await expect(
        authenticator.login(request, { provider: { type: 'basic' }, value: {} })
      ).resolves.toEqual(
        AuthenticationResult.succeeded(user, { userProfileGrant, state: { authorization } })
      );

      expect(mockOptions.session.create).toHaveBeenCalledTimes(1);
      expect(mockOptions.session.create).toHaveBeenCalledWith(
        request,
        {
          username: user.username,
          userProfileId: 'some-profile-uid',
          provider: mockSessVal.provider,
          state: { authorization },
        },
        undefined
      );
      expectAuditEvents({ action: 'user_login', outcome: 'success' });
      expect(mockOptions.userProfileService.activate).toHaveBeenCalledTimes(1);
      expect(mockOptions.userProfileService.activate).toHaveBeenCalledWith(userProfileGrant);
    });

    it('activates profiles for the Elastic Cloud users if profile grant is provided', async () => {
      const user = mockAuthenticatedUser({ elastic_cloud_user: true });
      const request = httpServerMock.createKibanaRequest();
      const authorization = `Basic ${Buffer.from('foo:bar').toString('base64')}`;
      const userProfileGrant: UserProfileGrant = {
        type: 'password',
        username: 'some-user',
        password: 'some-password',
      };

      mockBasicAuthenticationProvider.login.mockResolvedValue(
        AuthenticationResult.succeeded(user, { userProfileGrant, state: { authorization } })
      );

      await expect(
        authenticator.login(request, { provider: { type: 'basic' }, value: {} })
      ).resolves.toEqual(
        AuthenticationResult.succeeded(user, { userProfileGrant, state: { authorization } })
      );

      expect(mockOptions.session.create).toHaveBeenCalledTimes(1);
      expect(mockOptions.session.create).toHaveBeenCalledWith(
        request,
        {
          userProfileId: 'some-profile-uid',
          username: user.username,
          provider: mockSessVal.provider,
          state: { authorization },
        },
        undefined
      );
      expectAuditEvents({ action: 'user_login', outcome: 'success' });
      expect(mockOptions.userProfileService.activate).toHaveBeenCalledTimes(1);
      expect(mockOptions.userProfileService.activate).toHaveBeenCalledWith(userProfileGrant);
    });

    it('returns `notHandled` if login attempt is targeted to not configured provider.', async () => {
      const request = httpServerMock.createKibanaRequest();
      await expect(
        authenticator.login(request, { provider: { type: 'token' }, value: {} })
      ).resolves.toEqual(AuthenticationResult.notHandled());

      await expect(
        authenticator.login(request, { provider: { name: 'basic2' }, value: {} })
      ).resolves.toEqual(AuthenticationResult.notHandled());
    });

    describe('multi-provider scenarios', () => {
      let mockSAMLAuthenticationProvider1: jest.Mocked<PublicMethodsOf<SAMLAuthenticationProvider>>;
      let mockSAMLAuthenticationProvider2: jest.Mocked<PublicMethodsOf<SAMLAuthenticationProvider>>;

      beforeEach(() => {
        mockSAMLAuthenticationProvider1 = {
          login: jest.fn().mockResolvedValue(AuthenticationResult.notHandled()),
          authenticate: jest.fn(),
          logout: jest.fn(),
          getHTTPAuthenticationScheme: jest.fn(),
          shouldInvalidateIntermediateSessionAfterLogin: jest.fn().mockReturnValue(true),
        };

        mockSAMLAuthenticationProvider2 = {
          login: jest.fn().mockResolvedValue(AuthenticationResult.notHandled()),
          authenticate: jest.fn(),
          logout: jest.fn(),
          getHTTPAuthenticationScheme: jest.fn(),
          shouldInvalidateIntermediateSessionAfterLogin: jest.fn().mockReturnValue(true),
        };

        jest
          .requireMock('./providers/saml')
          .SAMLAuthenticationProvider.mockImplementationOnce(() => ({
            type: 'saml',
            ...mockSAMLAuthenticationProvider1,
          }))
          .mockImplementationOnce(() => ({
            type: 'saml',
            ...mockSAMLAuthenticationProvider2,
          }));

        mockOptions = getMockOptions({
          providers: {
            basic: { basic1: { order: 0 } },
            saml: {
              saml1: { realm: 'saml1-realm', order: 1 },
              saml2: { realm: 'saml2-realm', order: 2 },
            },
          },
        });

        authenticator = new Authenticator(mockOptions);
      });

      it('tries to login only with the provider that has specified name', async () => {
        const user = mockAuthenticatedUser();
        const request = httpServerMock.createKibanaRequest();

        mockSAMLAuthenticationProvider2.login.mockResolvedValue(
          AuthenticationResult.succeeded(user, { state: { token: 'access-token' } })
        );

        await expect(
          authenticator.login(request, { provider: { name: 'saml2' }, value: {} })
        ).resolves.toEqual(
          AuthenticationResult.succeeded(user, { state: { token: 'access-token' } })
        );

        expect(mockOptions.session.create).toHaveBeenCalledTimes(1);
        expect(mockOptions.session.create).toHaveBeenCalledWith(
          request,
          {
            username: user.username,
            userProfileId: undefined,
            provider: { type: 'saml', name: 'saml2' },
            state: { token: 'access-token' },
          },
          undefined
        );

        expect(mockBasicAuthenticationProvider.login).not.toHaveBeenCalled();
        expect(mockSAMLAuthenticationProvider1.login).not.toHaveBeenCalled();
        expectAuditEvents({ action: 'user_login', outcome: 'success' });
      });

      it('tries to login only with the provider that has specified type', async () => {
        const request = httpServerMock.createKibanaRequest();

        await expect(
          authenticator.login(request, { provider: { type: 'saml' }, value: {} })
        ).resolves.toEqual(AuthenticationResult.notHandled());

        expect(mockOptions.session.create).not.toHaveBeenCalled();

        expect(mockBasicAuthenticationProvider.login).not.toHaveBeenCalled();
        expect(mockSAMLAuthenticationProvider1.login).toHaveBeenCalledTimes(1);
        expect(mockSAMLAuthenticationProvider2.login).toHaveBeenCalledTimes(1);
        expect(mockSAMLAuthenticationProvider1.login.mock.invocationCallOrder[0]).toBeLessThan(
          mockSAMLAuthenticationProvider2.login.mock.invocationCallOrder[0]
        );
        expect(auditLogger.log).not.toHaveBeenCalled();
      });

      it('returns as soon as provider handles request', async () => {
        const request = httpServerMock.createKibanaRequest();
        const user = mockAuthenticatedUser();

        const authenticationResults = [
          AuthenticationResult.failed(new Error('Fail')),
          AuthenticationResult.succeeded(user, { state: { result: '200' } }),
          AuthenticationResult.redirectTo('/some/url', { state: { result: '302' } }),
        ];

        for (const result of authenticationResults) {
          mockSAMLAuthenticationProvider1.login.mockResolvedValue(result);

          await expect(
            authenticator.login(request, { provider: { type: 'saml' }, value: {} })
          ).resolves.toEqual(result);
        }

        expect(mockOptions.session.create).toHaveBeenCalledTimes(2);
        expect(mockOptions.session.create).toHaveBeenCalledWith(
          request,
          {
            username: user.username,
            userProfileId: undefined,
            provider: { type: 'saml', name: 'saml1' },
            state: { result: '200' },
          },
          undefined
        );
        expect(mockOptions.session.create).toHaveBeenCalledWith(
          request,
          {
            username: undefined,
            userProfileId: undefined,
            provider: { type: 'saml', name: 'saml1' },
            state: { result: '302' },
          },
          undefined
        );

        expect(mockBasicAuthenticationProvider.login).not.toHaveBeenCalled();
        expect(mockSAMLAuthenticationProvider2.login).not.toHaveBeenCalled();
        expect(mockSAMLAuthenticationProvider1.login).toHaveBeenCalledTimes(3);
        expectAuditEvents(
          { action: 'user_login', outcome: 'failure' },
          { action: 'user_login', outcome: 'success' }
        );
      });

      it('passes stateCookieOptions to session.create when provider returns custom cookie options', async () => {
        const request = httpServerMock.createKibanaRequest();
        const customCookieOptions = { sameSite: 'None' as const, isSecure: true };

        mockSAMLAuthenticationProvider1.login.mockResolvedValue(
          AuthenticationResult.redirectTo('/some/url', {
            state: { result: '302' },
            stateCookieOptions: customCookieOptions,
          })
        );

        await expect(
          authenticator.login(request, { provider: { type: 'saml' }, value: {} })
        ).resolves.toEqual(
          AuthenticationResult.redirectTo('/some/url', {
            state: { result: '302' },
            stateCookieOptions: customCookieOptions,
          })
        );

        expect(mockOptions.session.create).toHaveBeenCalledTimes(1);
        expect(mockOptions.session.create).toHaveBeenCalledWith(
          request,
          {
            username: undefined,
            userProfileId: undefined,
            provider: { type: 'saml', name: 'saml1' },
            state: { result: '302' },
          },
          customCookieOptions
        );

        expect(mockSAMLAuthenticationProvider1.login).toHaveBeenCalledTimes(1);
        expect(auditLogger.log).not.toHaveBeenCalled();
      });

      it('provides session only if provider name matches', async () => {
        const request = httpServerMock.createKibanaRequest();

        mockOptions.session.get.mockResolvedValue({
          error: null,
          value: {
            ...mockSessVal,
            provider: { type: 'saml', name: 'saml2' },
          },
        });

        const loginAttemptValue = Symbol('attempt');
        await expect(
          authenticator.login(request, { provider: { type: 'saml' }, value: loginAttemptValue })
        ).resolves.toEqual(AuthenticationResult.notHandled());

        expect(mockBasicAuthenticationProvider.login).not.toHaveBeenCalled();

        expect(mockSAMLAuthenticationProvider1.login).toHaveBeenCalledTimes(1);
        expect(mockSAMLAuthenticationProvider1.login).toHaveBeenCalledWith(
          request,
          loginAttemptValue,
          null
        );

        expect(mockSAMLAuthenticationProvider2.login).toHaveBeenCalledTimes(1);
        expect(mockSAMLAuthenticationProvider2.login).toHaveBeenCalledWith(
          request,
          loginAttemptValue,
          { ...mockSessVal, provider: { type: 'saml', name: 'saml2' } }
        );

        // Presence of the session has precedence over order.
        expect(mockSAMLAuthenticationProvider2.login.mock.invocationCallOrder[0]).toBeLessThan(
          mockSAMLAuthenticationProvider1.login.mock.invocationCallOrder[0]
        );
        expect(auditLogger.log).not.toHaveBeenCalled();
      });
    });

    it('clears session if it belongs to a not configured provider or with the name that is registered but has different type.', async () => {
      const user = mockAuthenticatedUser();
      const credentials = { username: 'user', password: 'password' };
      const request = httpServerMock.createKibanaRequest();

      // Re-configure authenticator with `token` provider that uses the name of `basic`.
      const loginMock = jest.fn().mockResolvedValue(AuthenticationResult.succeeded(user));
      jest.requireMock('./providers/token').TokenAuthenticationProvider.mockImplementation(() => ({
        type: 'token',
        login: loginMock,
        getHTTPAuthenticationScheme: jest.fn(),
      }));
      mockOptions = getMockOptions({ providers: { token: { basic1: { order: 0 } } } });
      authenticator = new Authenticator(mockOptions);

      mockBasicAuthenticationProvider.login.mockResolvedValue(AuthenticationResult.succeeded(user));
      mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });

      await expect(
        authenticator.login(request, { provider: { name: 'basic1' }, value: credentials })
      ).resolves.toEqual(AuthenticationResult.succeeded(user));

      expect(loginMock).toHaveBeenCalledWith(request, credentials, null);

      expect(mockOptions.session.create).not.toHaveBeenCalled();
      expect(mockOptions.session.update).not.toHaveBeenCalled();
      expect(mockOptions.session.extend).not.toHaveBeenCalled();
      expect(mockOptions.session.invalidate).toHaveBeenCalledTimes(1);
      expect(mockOptions.session.invalidate).toHaveBeenCalledWith(request, { match: 'current' });
      expectAuditEvents({ action: 'user_logout', outcome: 'unknown' });
    });

    it('clears session if provider asked to do so in `succeeded` result.', async () => {
      const user = mockAuthenticatedUser();
      const request = httpServerMock.createKibanaRequest();
      mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });

      mockBasicAuthenticationProvider.login.mockResolvedValue(
        AuthenticationResult.succeeded(user, { state: null })
      );

      await expect(
        authenticator.login(request, { provider: { type: 'basic' }, value: {} })
      ).resolves.toEqual(AuthenticationResult.succeeded(user, { state: null }));

      expect(mockOptions.session.create).not.toHaveBeenCalled();
      expect(mockOptions.session.update).not.toHaveBeenCalled();
      expect(mockOptions.session.extend).not.toHaveBeenCalled();
      expect(mockOptions.session.invalidate).toHaveBeenCalledTimes(1);
      expect(mockOptions.session.invalidate).toHaveBeenCalledWith(request, { match: 'current' });
      expectAuditEvents({ action: 'user_logout', outcome: 'unknown' });
    });

    it('clears session if provider asked to do so in `redirected` result.', async () => {
      const request = httpServerMock.createKibanaRequest();
      mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });

      mockBasicAuthenticationProvider.login.mockResolvedValue(
        AuthenticationResult.redirectTo('some-url', { state: null })
      );

      await expect(
        authenticator.login(request, { provider: { type: 'basic' }, value: {} })
      ).resolves.toEqual(AuthenticationResult.redirectTo('some-url', { state: null }));

      expect(mockOptions.session.create).not.toHaveBeenCalled();
      expect(mockOptions.session.update).not.toHaveBeenCalled();
      expect(mockOptions.session.extend).not.toHaveBeenCalled();
      expect(mockOptions.session.invalidate).toHaveBeenCalledTimes(1);
      expect(mockOptions.session.invalidate).toHaveBeenCalledWith(request, { match: 'current' });
      expectAuditEvents({ action: 'user_logout', outcome: 'unknown' });
    });

    describe('with Access Agreement', () => {
      const mockUser = mockAuthenticatedUser();
      beforeEach(() => {
        mockOptions = getMockOptions({
          providers: {
            basic: { basic1: { order: 0, accessAgreement: { message: 'some notice' } } },
          },
        });

        mockOptions.session.update.mockImplementation(async (request, value) => value);
        mockOptions.session.extend.mockImplementation(async (request, value) => value);
        mockOptions.session.create.mockImplementation(async (request, value) => ({
          ...mockSessVal,
          ...value,
        }));

        mockOptions.license.getFeatures.mockReturnValue({
          allowAccessAgreement: true,
        } as SecurityLicenseFeatures);

        authenticator = new Authenticator(mockOptions);
      });

      it('does not redirect to Access Agreement if authenticated session is not created', async () => {
        const request = httpServerMock.createKibanaRequest();

        mockBasicAuthenticationProvider.login.mockResolvedValue(
          AuthenticationResult.succeeded(mockUser)
        );

        await expect(
          authenticator.login(request, { provider: { type: 'basic' }, value: {} })
        ).resolves.toEqual(AuthenticationResult.succeeded(mockUser));
        expect(auditLogger.log).not.toHaveBeenCalled();
      });

      it('does not redirect to Access Agreement if request cannot be handled', async () => {
        const request = httpServerMock.createKibanaRequest();
        mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });

        mockBasicAuthenticationProvider.login.mockResolvedValue(AuthenticationResult.notHandled());

        await expect(
          authenticator.login(request, { provider: { type: 'basic' }, value: {} })
        ).resolves.toEqual(AuthenticationResult.notHandled());
        expect(auditLogger.log).not.toHaveBeenCalled();
      });

      it('does not redirect to Access Agreement if authentication fails', async () => {
        const request = httpServerMock.createKibanaRequest();

        const failureReason = new Error('something went wrong');
        mockBasicAuthenticationProvider.login.mockResolvedValue(
          AuthenticationResult.failed(failureReason)
        );

        await expect(
          authenticator.login(request, { provider: { type: 'basic' }, value: {} })
        ).resolves.toEqual(AuthenticationResult.failed(failureReason));
        expectAuditEvents({ action: 'user_login', outcome: 'failure' });
      });

      it('does not redirect to Access Agreement if redirect is required to complete login', async () => {
        const request = httpServerMock.createKibanaRequest();

        mockBasicAuthenticationProvider.login.mockResolvedValue(
          AuthenticationResult.redirectTo('/some-url', { state: 'some-state' })
        );

        await expect(
          authenticator.login(request, { provider: { type: 'basic' }, value: {} })
        ).resolves.toEqual(AuthenticationResult.redirectTo('/some-url', { state: 'some-state' }));
        expect(auditLogger.log).not.toHaveBeenCalled();
      });

      it('does not redirect to Access Agreement if user has already acknowledged it', async () => {
        const request = httpServerMock.createKibanaRequest();
        mockOptions.session.get.mockResolvedValue({
          error: null,
          value: {
            ...mockSessVal,
            accessAgreementAcknowledged: true,
          },
        });

        mockBasicAuthenticationProvider.login.mockResolvedValue(
          AuthenticationResult.succeeded(mockUser, { state: 'some-state' })
        );

        await expect(
          authenticator.login(request, { provider: { type: 'basic' }, value: {} })
        ).resolves.toEqual(AuthenticationResult.succeeded(mockUser, { state: 'some-state' }));
        expect(auditLogger.log).not.toHaveBeenCalled();
      });

      it('does not redirect to Access Agreement its own requests', async () => {
        const request = httpServerMock.createKibanaRequest({ path: '/security/access_agreement' });
        mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });

        mockBasicAuthenticationProvider.login.mockResolvedValue(
          AuthenticationResult.succeeded(mockUser, { state: 'some-state' })
        );

        await expect(
          authenticator.login(request, { provider: { type: 'basic' }, value: {} })
        ).resolves.toEqual(AuthenticationResult.succeeded(mockUser, { state: 'some-state' }));
        expect(auditLogger.log).not.toHaveBeenCalled();
      });

      it('does not redirect to Access Agreement if it is not configured', async () => {
        mockOptions = getMockOptions({ providers: { basic: { basic1: { order: 0 } } } });
        mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });
        authenticator = new Authenticator(mockOptions);

        mockBasicAuthenticationProvider.login.mockResolvedValue(
          AuthenticationResult.succeeded(mockUser, { state: 'some-state' })
        );

        const request = httpServerMock.createKibanaRequest();
        await expect(
          authenticator.login(request, { provider: { type: 'basic' }, value: {} })
        ).resolves.toEqual(AuthenticationResult.succeeded(mockUser, { state: 'some-state' }));
        expect(auditLogger.log).not.toHaveBeenCalled();
      });

      it('does not redirect to Access Agreement if license doesnt allow it.', async () => {
        const request = httpServerMock.createKibanaRequest();
        mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });
        mockOptions.license.getFeatures.mockReturnValue({
          allowAccessAgreement: false,
        } as SecurityLicenseFeatures);

        mockBasicAuthenticationProvider.login.mockResolvedValue(
          AuthenticationResult.succeeded(mockUser, { state: 'some-state' })
        );

        await expect(
          authenticator.login(request, { provider: { type: 'basic' }, value: {} })
        ).resolves.toEqual(AuthenticationResult.succeeded(mockUser, { state: 'some-state' }));
        expect(auditLogger.log).not.toHaveBeenCalled();
      });

      it('redirects to Access Agreement when needed.', async () => {
        mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });

        mockBasicAuthenticationProvider.login.mockResolvedValue(
          AuthenticationResult.succeeded(mockUser, {
            state: 'some-state',
            authResponseHeaders: { 'WWW-Authenticate': 'Negotiate' },
          })
        );

        const request = httpServerMock.createKibanaRequest();
        await expect(
          authenticator.login(request, { provider: { type: 'basic' }, value: {} })
        ).resolves.toEqual(
          AuthenticationResult.redirectTo(
            '/mock-server-basepath/security/access_agreement?next=%2Fmock-server-basepath%2Fpath',
            {
              user: mockUser,
              state: 'some-state',
              authResponseHeaders: { 'WWW-Authenticate': 'Negotiate' },
            }
          )
        );
        expect(auditLogger.log).not.toHaveBeenCalled();
      });

      it('redirects to Access Agreement preserving redirect URL specified in login attempt.', async () => {
        mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });

        mockBasicAuthenticationProvider.login.mockResolvedValue(
          AuthenticationResult.succeeded(mockUser, {
            state: 'some-state',
            authResponseHeaders: { 'WWW-Authenticate': 'Negotiate' },
          })
        );

        const request = httpServerMock.createKibanaRequest();
        await expect(
          authenticator.login(request, {
            provider: { type: 'basic' },
            value: {},
            redirectURL: '/some-url',
          })
        ).resolves.toEqual(
          AuthenticationResult.redirectTo(
            '/mock-server-basepath/security/access_agreement?next=%2Fsome-url',
            {
              user: mockUser,
              state: 'some-state',
              authResponseHeaders: { 'WWW-Authenticate': 'Negotiate' },
            }
          )
        );
        expect(auditLogger.log).not.toHaveBeenCalled();
      });

      it('redirects to Access Agreement preserving redirect URL specified in the authentication result.', async () => {
        mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });

        mockBasicAuthenticationProvider.login.mockResolvedValue(
          AuthenticationResult.redirectTo('/some-url', {
            user: mockUser,
            state: 'some-state',
            authResponseHeaders: { 'WWW-Authenticate': 'Negotiate' },
          })
        );

        const request = httpServerMock.createKibanaRequest();
        await expect(
          authenticator.login(request, { provider: { type: 'basic' }, value: {} })
        ).resolves.toEqual(
          AuthenticationResult.redirectTo(
            '/mock-server-basepath/security/access_agreement?next=%2Fsome-url',
            {
              user: mockUser,
              state: 'some-state',
              authResponseHeaders: { 'WWW-Authenticate': 'Negotiate' },
            }
          )
        );
        expect(auditLogger.log).not.toHaveBeenCalled();
      });

      it('redirects AJAX requests to Access Agreement when needed.', async () => {
        mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });

        mockBasicAuthenticationProvider.login.mockResolvedValue(
          AuthenticationResult.succeeded(mockUser, {
            state: 'some-state',
            authResponseHeaders: { 'WWW-Authenticate': 'Negotiate' },
          })
        );

        const request = httpServerMock.createKibanaRequest({ headers: { 'kbn-xsrf': 'xsrf' } });
        await expect(
          authenticator.login(request, { provider: { type: 'basic' }, value: {} })
        ).resolves.toEqual(
          AuthenticationResult.redirectTo(
            '/mock-server-basepath/security/access_agreement?next=%2Fmock-server-basepath%2Fpath',
            {
              user: mockUser,
              state: 'some-state',
              authResponseHeaders: { 'WWW-Authenticate': 'Negotiate' },
            }
          )
        );
        expect(auditLogger.log).not.toHaveBeenCalled();
      });
    });

    describe('with Overwritten Session', () => {
      const mockUser = mockAuthenticatedUser();
      beforeEach(() => {
        mockOptions = getMockOptions({
          providers: {
            basic: { basic1: { order: 0 } },
            saml: { saml1: { order: 1, realm: 'saml1' } },
          },
        });
        mockOptions.session.update.mockImplementation(async (request, value) => value);
        mockOptions.session.extend.mockImplementation(async (request, value) => value);
        mockOptions.session.create.mockImplementation(async (request, value) => ({
          ...mockSessVal,
          ...value,
        }));

        authenticator = new Authenticator(mockOptions);
      });

      it('does not redirect to Overwritten Session its own requests', async () => {
        const request = httpServerMock.createKibanaRequest({
          path: '/security/overwritten_session',
        });
        mockOptions.session.get.mockResolvedValue({
          error: null,
          value: { ...mockSessVal, username: 'old-username' },
        });

        mockBasicAuthenticationProvider.login.mockResolvedValue(
          AuthenticationResult.succeeded(mockUser, { state: 'some-state' })
        );

        await expect(
          authenticator.login(request, { provider: { type: 'basic' }, value: {} })
        ).resolves.toEqual(AuthenticationResult.succeeded(mockUser, { state: 'some-state' }));
        expectAuditEvents(
          { action: 'user_logout', outcome: 'unknown' },
          { action: 'user_login', outcome: 'success' }
        );
      });

      it('does not redirect to Overwritten Session if username and provider did not change', async () => {
        const request = httpServerMock.createKibanaRequest();
        mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });

        mockBasicAuthenticationProvider.login.mockResolvedValue(
          AuthenticationResult.succeeded(mockUser, {
            state: 'some-state',
            authResponseHeaders: { 'WWW-Authenticate': 'Negotiate' },
          })
        );

        await expect(
          authenticator.login(request, { provider: { type: 'basic' }, value: {} })
        ).resolves.toEqual(
          AuthenticationResult.succeeded(mockUser, {
            state: 'some-state',
            authResponseHeaders: { 'WWW-Authenticate': 'Negotiate' },
          })
        );
        expect(auditLogger.log).not.toHaveBeenCalled();
      });

      it('does not redirect to Overwritten Session if session was unauthenticated before login', async () => {
        const request = httpServerMock.createKibanaRequest();
        mockOptions.session.get.mockResolvedValue({
          error: null,
          value: { ...mockSessVal, username: undefined },
        });

        const newMockUser = mockAuthenticatedUser({ username: 'new-username' });
        mockBasicAuthenticationProvider.login.mockResolvedValue(
          AuthenticationResult.succeeded(newMockUser, {
            state: 'some-state',
            authResponseHeaders: { 'WWW-Authenticate': 'Negotiate' },
          })
        );

        await expect(
          authenticator.login(request, { provider: { type: 'basic' }, value: {} })
        ).resolves.toEqual(
          AuthenticationResult.succeeded(newMockUser, {
            state: 'some-state',
            authResponseHeaders: { 'WWW-Authenticate': 'Negotiate' },
          })
        );
        expectAuditEvents(
          // We do not record a user_logout event for "intermediate" sessions that are deleted, only user_login for the new session
          { action: 'user_login', outcome: 'success' }
        );
      });

      it('redirects to Overwritten Session when username changes', async () => {
        const request = httpServerMock.createKibanaRequest();
        mockOptions.session.get.mockResolvedValue({
          error: null,
          value: { ...mockSessVal, username: 'old-username' },
        });

        mockBasicAuthenticationProvider.login.mockResolvedValue(
          AuthenticationResult.succeeded(mockUser, {
            state: 'some-state',
            authResponseHeaders: { 'WWW-Authenticate': 'Negotiate' },
          })
        );

        await expect(
          authenticator.login(request, { provider: { type: 'basic' }, value: {} })
        ).resolves.toEqual(
          AuthenticationResult.redirectTo(
            '/mock-server-basepath/security/overwritten_session?next=%2Fmock-server-basepath%2Fpath',
            {
              user: mockUser,
              state: 'some-state',
              authResponseHeaders: { 'WWW-Authenticate': 'Negotiate' },
            }
          )
        );
        expectAuditEvents(
          { action: 'user_logout', outcome: 'unknown' },
          { action: 'user_login', outcome: 'success' }
        );
      });

      it('redirects to Overwritten Session when provider changes', async () => {
        const request = httpServerMock.createKibanaRequest();
        mockOptions.session.get.mockResolvedValue({
          error: null,
          value: {
            ...mockSessVal,
            provider: { type: 'saml', name: 'saml1' },
          },
        });

        mockBasicAuthenticationProvider.login.mockResolvedValue(
          AuthenticationResult.succeeded(mockUser, {
            state: 'some-state',
            authResponseHeaders: { 'WWW-Authenticate': 'Negotiate' },
          })
        );

        await expect(
          authenticator.login(request, { provider: { type: 'basic' }, value: {} })
        ).resolves.toEqual(
          AuthenticationResult.redirectTo(
            '/mock-server-basepath/security/overwritten_session?next=%2Fmock-server-basepath%2Fpath',
            {
              user: mockUser,
              state: 'some-state',
              authResponseHeaders: { 'WWW-Authenticate': 'Negotiate' },
            }
          )
        );
        expectAuditEvents(
          { action: 'user_logout', outcome: 'unknown' },
          { action: 'user_login', outcome: 'success' }
        );
      });

      it('redirects to Overwritten Session preserving redirect URL specified in login attempt.', async () => {
        const request = httpServerMock.createKibanaRequest();
        mockOptions.session.get.mockResolvedValue({
          error: null,
          value: { ...mockSessVal, username: 'old-username' },
        });

        mockBasicAuthenticationProvider.login.mockResolvedValue(
          AuthenticationResult.succeeded(mockUser, {
            state: 'some-state',
            authResponseHeaders: { 'WWW-Authenticate': 'Negotiate' },
          })
        );

        await expect(
          authenticator.login(request, {
            provider: { type: 'basic' },
            value: {},
            redirectURL: '/some-url',
          })
        ).resolves.toEqual(
          AuthenticationResult.redirectTo(
            '/mock-server-basepath/security/overwritten_session?next=%2Fsome-url',
            {
              user: mockUser,
              state: 'some-state',
              authResponseHeaders: { 'WWW-Authenticate': 'Negotiate' },
            }
          )
        );
        expectAuditEvents(
          { action: 'user_logout', outcome: 'unknown' },
          { action: 'user_login', outcome: 'success' }
        );
      });

      it('redirects to Overwritten Session preserving redirect URL specified in the authentication result.', async () => {
        const request = httpServerMock.createKibanaRequest();
        mockOptions.session.get.mockResolvedValue({
          error: null,
          value: { ...mockSessVal, username: 'old-username' },
        });

        mockBasicAuthenticationProvider.login.mockResolvedValue(
          AuthenticationResult.redirectTo('/some-url', {
            user: mockUser,
            state: 'some-state',
            authResponseHeaders: { 'WWW-Authenticate': 'Negotiate' },
          })
        );

        await expect(
          authenticator.login(request, { provider: { type: 'basic' }, value: {} })
        ).resolves.toEqual(
          AuthenticationResult.redirectTo(
            '/mock-server-basepath/security/overwritten_session?next=%2Fsome-url',
            {
              user: mockUser,
              state: 'some-state',
              authResponseHeaders: { 'WWW-Authenticate': 'Negotiate' },
            }
          )
        );
        expectAuditEvents(
          { action: 'user_logout', outcome: 'unknown' },
          { action: 'user_login', outcome: 'success' }
        );
      });

      it('redirects AJAX requests to Overwritten Session when needed.', async () => {
        const request = httpServerMock.createKibanaRequest({ headers: { 'kbn-xsrf': 'xsrf' } });
        mockOptions.session.get.mockResolvedValue({
          error: null,
          value: { ...mockSessVal, username: 'old-username' },
        });

        mockBasicAuthenticationProvider.login.mockResolvedValue(
          AuthenticationResult.succeeded(mockUser, {
            state: 'some-state',
            authResponseHeaders: { 'WWW-Authenticate': 'Negotiate' },
          })
        );

        await expect(
          authenticator.login(request, { provider: { type: 'basic' }, value: {} })
        ).resolves.toEqual(
          AuthenticationResult.redirectTo(
            '/mock-server-basepath/security/overwritten_session?next=%2Fmock-server-basepath%2Fpath',
            {
              user: mockUser,
              state: 'some-state',
              authResponseHeaders: { 'WWW-Authenticate': 'Negotiate' },
            }
          )
        );
        expectAuditEvents(
          { action: 'user_logout', outcome: 'unknown' },
          { action: 'user_login', outcome: 'success' }
        );
      });
    });

    describe('preserves state if provider is type `SAML` and there are remaining requestIds', () => {
      const userProfileGrant: UserProfileGrant = {
        type: 'accessToken',
        accessToken: 'some-token',
      };

      beforeEach(() => {
        mockOptions = getMockOptions({
          providers: {
            basic: { basic1: { order: 0 } },
            saml: { saml1: { order: 1, realm: 'saml1' } },
          },
        });

        authenticator = new Authenticator(mockOptions);
      });

      it('does not invalidate the intermediate session if there are requestIds in the state', async () => {
        const request = httpServerMock.createKibanaRequest();
        const user = mockAuthenticatedUser();

        const samlState = {
          requestIdMap: { 'id-1': '/request-path-1', 'id-2': '/request-path-2' },
        };

        const mockExistingSessionValue = sessionMock.createValue({
          username: undefined,
          provider: { type: 'saml', name: 'saml1' },
          state: samlState,
        });

        mockOptions.session.get.mockResolvedValue({
          error: null,
          value: { ...mockExistingSessionValue },
        });

        // Mock to indicate that session needs to be kept alive for pending request IDs
        mockSamlAuthenticationProvider.shouldInvalidateIntermediateSessionAfterLogin.mockReturnValue(
          false
        );

        mockSamlAuthenticationProvider.login.mockResolvedValue(
          AuthenticationResult.redirectTo('/test/url', { user, userProfileGrant, state: samlState })
        );

        await expect(
          authenticator.login(request, { provider: { type: 'saml' }, value: {} })
        ).resolves.toEqual(
          AuthenticationResult.redirectTo('/test/url', { user, userProfileGrant, state: samlState })
        );

        // Verify the provider method was called with the session state
        expect(
          mockSamlAuthenticationProvider.shouldInvalidateIntermediateSessionAfterLogin
        ).toHaveBeenCalledWith(samlState);

        // Intermediate session should not be invalidated since we're keeping it alive for pending requests
        expect(mockOptions.session.invalidate).not.toHaveBeenCalled();

        // When intermediate session still needs to exist (due to pending request IDs),
        // a new session is created instead of updating the existing one
        expect(mockOptions.session.create).toHaveBeenCalledTimes(1);
        expect(mockOptions.session.create).toHaveBeenCalledWith(
          request,
          {
            username: user.username,
            userProfileId: 'some-profile-uid',
            provider: { type: 'saml', name: 'saml1' },
            state: samlState,
          },
          undefined
        );
      });

      it('does invalidate intermediate session if there are no requestIds in the state', async () => {
        const request = httpServerMock.createKibanaRequest();
        const user = mockAuthenticatedUser();

        const samlState = {
          requestIdMap: {},
        };

        const mockExistingSessionValue = sessionMock.createValue({
          username: undefined,
          provider: { type: 'saml', name: 'saml1' },
          state: samlState,
        });

        mockOptions.session.get.mockResolvedValue({
          error: null,
          value: { ...mockExistingSessionValue },
        });

        mockSamlAuthenticationProvider.login.mockResolvedValue(
          AuthenticationResult.redirectTo('/test/url', {
            user,
            userProfileGrant,
            state: samlState,
          })
        );

        await expect(
          authenticator.login(request, { provider: { type: 'saml' }, value: {} })
        ).resolves.toEqual(
          AuthenticationResult.redirectTo('/test/url', { user, userProfileGrant, state: samlState })
        );

        // Verify the provider method was called with the session state
        expect(
          mockSamlAuthenticationProvider.shouldInvalidateIntermediateSessionAfterLogin
        ).toHaveBeenCalledWith(samlState);

        // Intermediate session should be invalidated
        expect(mockOptions.session.invalidate).toHaveBeenCalled();

        expect(mockOptions.session.create).toHaveBeenCalledTimes(1);
        expect(mockOptions.session.create).toHaveBeenCalledWith(
          request,
          {
            username: user.username,
            userProfileId: 'some-profile-uid',
            provider: { type: 'saml', name: 'saml1' },
            state: samlState,
          },
          undefined
        );
      });
    });
  });

  describe('`authenticate` method', () => {
    let authenticator: Authenticator;
    let mockOptions: ReturnType<typeof getMockOptions>;
    let mockSessVal: SessionValue;

    beforeEach(() => {
      mockOptions = getMockOptions({ providers: { basic: { basic1: { order: 0 } } } });
      mockSessVal = sessionMock.createValue({ state: { authorization: 'Basic xxx' } });

      authenticator = new Authenticator(mockOptions);
    });

    it('fails if an authentication provider fails.', async () => {
      const request = httpServerMock.createKibanaRequest();
      const failureReason = new Error('Not Authorized');

      mockBasicAuthenticationProvider.authenticate.mockResolvedValue(
        AuthenticationResult.failed(failureReason)
      );

      const authenticationResult = await authenticator.authenticate(request);
      expect(authenticationResult.failed()).toBe(true);
      expect(authenticationResult.error).toBe(failureReason);
      expectAuditEvents({ action: 'user_login', outcome: 'failure' });
    });

    for (const FailureClass of [
      SessionMissingError,
      SessionExpiredError,
      SessionConcurrencyLimitError,
      SessionUnexpectedError,
    ]) {
      describe(`session.get results in ${FailureClass.name}`, () => {
        it('fails as expected for redirectable requests', async () => {
          const request = httpServerMock.createKibanaRequest();
          const failureReason = new FailureClass();

          mockOptions.session.get.mockResolvedValue({ error: failureReason, value: null });

          await expect(authenticator.authenticate(request)).resolves.toEqual(
            failureReason instanceof SessionMissingError
              ? AuthenticationResult.notHandled()
              : AuthenticationResult.failed(failureReason)
          );
          expect(auditLogger.log).not.toHaveBeenCalled();
        });

        it('fails as expected for non-redirectable requests', async () => {
          const request = httpServerMock.createKibanaRequest({ headers: { 'kbn-xsrf': 'xsrf' } });
          const failureReason = new FailureClass();

          mockOptions.session.get.mockResolvedValue({ error: failureReason, value: null });

          await expect(authenticator.authenticate(request)).resolves.toEqual(
            failureReason instanceof SessionMissingError
              ? AuthenticationResult.notHandled()
              : AuthenticationResult.failed(failureReason, {
                  authResponseHeaders: {
                    [SESSION_ERROR_REASON_HEADER]: (failureReason as SessionError).code,
                  },
                })
          );
          expect(auditLogger.log).not.toHaveBeenCalled();
        });

        it('should get expected reponse headers for non-redirectable requests where the authentication succeeds', async () => {
          const request = httpServerMock.createKibanaRequest({ headers: { 'kbn-xsrf': 'xsrf' } });
          const failureReason = new FailureClass();

          mockOptions.session.get.mockResolvedValue({ error: failureReason, value: null });

          const user = mockAuthenticatedUser();
          mockBasicAuthenticationProvider.authenticate.mockResolvedValue(
            AuthenticationResult.succeeded(user)
          );

          const authenticationResult = await authenticator.authenticate(request);
          const expectedResult =
            failureReason instanceof SessionExpiredError
              ? AuthenticationResult.succeeded(user, {
                  authResponseHeaders: {
                    [SESSION_ERROR_REASON_HEADER]: (failureReason as SessionError).code,
                  },
                })
              : AuthenticationResult.succeeded(user);
          expect(authenticationResult).toEqual(expectedResult);
          expect(auditLogger.log).not.toHaveBeenCalled();
        });

        it('should get expected reponse headers for non-redirectable requests where the authentication fails', async () => {
          const request = httpServerMock.createKibanaRequest({ headers: { 'kbn-xsrf': 'xsrf' } });
          const failureReason = new FailureClass();

          mockOptions.session.get.mockResolvedValue({ error: failureReason, value: null });

          const authError = new Error('foo');
          mockHTTPAuthenticationProvider.authenticate.mockResolvedValue(
            AuthenticationResult.failed(authError)
          );

          const authenticationResult = await authenticator.authenticate(request);
          const expectedResult =
            failureReason instanceof SessionExpiredError
              ? AuthenticationResult.failed(authError, {
                  authResponseHeaders: {
                    [SESSION_ERROR_REASON_HEADER]: (failureReason as SessionError).code,
                  },
                })
              : AuthenticationResult.failed(authError);
          expect(authenticationResult).toEqual(expectedResult);
          expectAuditEvents({ action: 'user_login', outcome: 'failure' });
        });

        it('expected message is attached to the URL when authentication provider redirects to login page', async () => {
          const request = httpServerMock.createKibanaRequest();
          const redirectUrl = '/mock-server-basepath/login?foo=bar';
          const failureReason: SessionError = new FailureClass();

          mockOptions.session.get.mockResolvedValue({ error: failureReason, value: null });

          mockBasicAuthenticationProvider.authenticate.mockResolvedValue(
            AuthenticationResult.redirectTo(redirectUrl)
          );

          const authenticationResult = await authenticator.authenticate(request);
          expect(authenticationResult.redirected()).toBe(true);
          if (
            failureReason instanceof SessionExpiredError ||
            failureReason instanceof SessionConcurrencyLimitError
          ) {
            expect(authenticationResult.redirectURL).toBe(
              redirectUrl + '&msg=' + failureReason.code
            );
          } else {
            expect(authenticationResult.redirectURL).toBe(redirectUrl);
          }
          expect(auditLogger.log).not.toHaveBeenCalled();
        });

        it('should not get a message attached to the redirect URL when authentication provider redirects to something that is not the login page', async () => {
          const request = httpServerMock.createKibanaRequest();
          const redirectUrl = '/mock-server-basepath/some-other-page?foo=bar';
          const failureReason = new FailureClass();

          mockOptions.session.get.mockResolvedValue({ error: failureReason, value: null });

          mockBasicAuthenticationProvider.authenticate.mockResolvedValue(
            AuthenticationResult.redirectTo(redirectUrl)
          );

          const authenticationResult = await authenticator.authenticate(request);
          expect(authenticationResult.redirected()).toBe(true);
          expect(authenticationResult.redirectURL).toBe(redirectUrl);
          expect(auditLogger.log).not.toHaveBeenCalled();
        });
      });
    }

    it('returns user that authentication provider returns.', async () => {
      const request = httpServerMock.createKibanaRequest({
        headers: { authorization: 'Basic ***' },
      });

      const user = mockAuthenticatedUser();
      mockBasicAuthenticationProvider.authenticate.mockResolvedValue(
        AuthenticationResult.succeeded(user, { authHeaders: { authorization: 'Basic .....' } })
      );

      await expect(authenticator.authenticate(request)).resolves.toEqual(
        AuthenticationResult.succeeded(user, { authHeaders: { authorization: 'Basic .....' } })
      );
      expect(auditLogger.log).not.toHaveBeenCalled();
    });

    it('creates session whenever authentication provider returns state for system API requests', async () => {
      const user = mockAuthenticatedUser();
      const request = httpServerMock.createKibanaRequest({
        headers: { 'kbn-system-request': 'true' },
      });
      const authorization = `Basic ${Buffer.from('foo:bar').toString('base64')}`;

      mockBasicAuthenticationProvider.authenticate.mockResolvedValue(
        AuthenticationResult.succeeded(user, { state: { authorization } })
      );

      await expect(authenticator.authenticate(request)).resolves.toEqual(
        AuthenticationResult.succeeded(user, { state: { authorization } })
      );

      expect(mockOptions.session.create).toHaveBeenCalledTimes(1);
      expect(mockOptions.session.create).toHaveBeenCalledWith(
        request,
        {
          username: user.username,
          provider: mockSessVal.provider,
          state: { authorization },
        },
        undefined
      );
      expectAuditEvents({ action: 'user_login', outcome: 'success' });
      expect(mockOptions.userProfileService.activate).not.toHaveBeenCalled();
    });

    it('creates session whenever authentication provider returns state for non-system API requests', async () => {
      const user = mockAuthenticatedUser();
      const request = httpServerMock.createKibanaRequest({
        headers: { 'kbn-system-request': 'false' },
      });
      const authorization = `Basic ${Buffer.from('foo:bar').toString('base64')}`;

      mockBasicAuthenticationProvider.authenticate.mockResolvedValue(
        AuthenticationResult.succeeded(user, { state: { authorization } })
      );

      await expect(authenticator.authenticate(request)).resolves.toEqual(
        AuthenticationResult.succeeded(user, { state: { authorization } })
      );

      expect(mockOptions.session.create).toHaveBeenCalledTimes(1);
      expect(mockOptions.session.create).toHaveBeenCalledWith(
        request,
        {
          username: user.username,
          provider: mockSessVal.provider,
          state: { authorization },
        },
        undefined
      );
      expectAuditEvents({ action: 'user_login', outcome: 'success' });
      expect(mockOptions.userProfileService.activate).not.toHaveBeenCalled();
    });

    it('activates user profile whenever authentication provider returns user profile grant for non-system API requests', async () => {
      const user = mockAuthenticatedUser();
      const request = httpServerMock.createKibanaRequest({
        headers: { 'kbn-system-request': 'false' },
      });
      const authorization = `Basic ${Buffer.from('foo:bar').toString('base64')}`;
      const userProfileGrant: UserProfileGrant = {
        type: 'password',
        username: 'some-user',
        password: 'some-password',
      };

      mockBasicAuthenticationProvider.authenticate.mockResolvedValue(
        AuthenticationResult.succeeded(user, { userProfileGrant, state: { authorization } })
      );

      await expect(authenticator.authenticate(request)).resolves.toEqual(
        AuthenticationResult.succeeded(user, { userProfileGrant, state: { authorization } })
      );

      expect(mockOptions.session.create).toHaveBeenCalledTimes(1);
      expect(mockOptions.session.create).toHaveBeenCalledWith(
        request,
        {
          username: user.username,
          userProfileId: 'some-profile-uid',
          provider: mockSessVal.provider,
          state: { authorization },
        },
        undefined
      );
      expectAuditEvents({ action: 'user_login', outcome: 'success' });
      expect(mockOptions.userProfileService.activate).toHaveBeenCalledTimes(1);
      expect(mockOptions.userProfileService.activate).toHaveBeenCalledWith(userProfileGrant);
    });

    it('does not extend session for system API calls.', async () => {
      const user = mockAuthenticatedUser();
      const request = httpServerMock.createKibanaRequest({
        headers: { 'kbn-system-request': 'true' },
      });

      mockBasicAuthenticationProvider.authenticate.mockResolvedValue(
        AuthenticationResult.succeeded(user)
      );
      mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });

      await expect(authenticator.authenticate(request)).resolves.toEqual(
        AuthenticationResult.succeeded(user)
      );

      expect(mockOptions.session.create).not.toHaveBeenCalled();
      expect(mockOptions.session.update).not.toHaveBeenCalled();
      expect(mockOptions.session.extend).not.toHaveBeenCalled();
      expect(mockOptions.session.invalidate).not.toHaveBeenCalled();
      expect(auditLogger.log).not.toHaveBeenCalled();
    });

    it('extends session for non-system API calls.', async () => {
      const user = mockAuthenticatedUser();
      const request = httpServerMock.createKibanaRequest({
        headers: { 'kbn-system-request': 'false' },
      });

      mockBasicAuthenticationProvider.authenticate.mockResolvedValue(
        AuthenticationResult.succeeded(user)
      );
      mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });

      await expect(authenticator.authenticate(request)).resolves.toEqual(
        AuthenticationResult.succeeded(user)
      );

      expect(mockOptions.session.extend).toHaveBeenCalledTimes(1);
      expect(mockOptions.session.extend).toHaveBeenCalledWith(request, mockSessVal);
      expect(mockOptions.session.create).not.toHaveBeenCalled();
      expect(mockOptions.session.update).not.toHaveBeenCalled();
      expect(mockOptions.session.invalidate).not.toHaveBeenCalled();
      expect(auditLogger.log).not.toHaveBeenCalled();
    });

    it('does not touch session for system API calls if authentication fails with non-401 reason.', async () => {
      const request = httpServerMock.createKibanaRequest({
        headers: { 'kbn-system-request': 'true' },
      });

      const failureReason = new Error('some error');
      mockBasicAuthenticationProvider.authenticate.mockResolvedValue(
        AuthenticationResult.failed(failureReason)
      );
      mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });

      await expect(authenticator.authenticate(request)).resolves.toEqual(
        AuthenticationResult.failed(failureReason)
      );

      expect(mockOptions.session.create).not.toHaveBeenCalled();
      expect(mockOptions.session.update).not.toHaveBeenCalled();
      expect(mockOptions.session.extend).not.toHaveBeenCalled();
      expect(mockOptions.session.invalidate).not.toHaveBeenCalled();
      expect(auditLogger.log).not.toHaveBeenCalled();
    });

    it('does not touch session for non-system API calls if authentication fails with non-401 reason.', async () => {
      const request = httpServerMock.createKibanaRequest({
        headers: { 'kbn-system-request': 'false' },
      });

      const failureReason = new Error('some error');
      mockBasicAuthenticationProvider.authenticate.mockResolvedValue(
        AuthenticationResult.failed(failureReason)
      );
      mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });

      await expect(authenticator.authenticate(request)).resolves.toEqual(
        AuthenticationResult.failed(failureReason)
      );

      expect(mockOptions.session.create).not.toHaveBeenCalled();
      expect(mockOptions.session.update).not.toHaveBeenCalled();
      expect(mockOptions.session.extend).not.toHaveBeenCalled();
      expect(mockOptions.session.invalidate).not.toHaveBeenCalled();
      expect(auditLogger.log).not.toHaveBeenCalled();
    });

    it('replaces existing session with the one returned by authentication provider for system API requests', async () => {
      const user = mockAuthenticatedUser();
      const newState = { authorization: 'Basic yyy' };
      const request = httpServerMock.createKibanaRequest({
        headers: { 'kbn-system-request': 'true' },
      });

      mockBasicAuthenticationProvider.authenticate.mockResolvedValue(
        AuthenticationResult.succeeded(user, { state: newState })
      );
      mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });

      await expect(authenticator.authenticate(request)).resolves.toEqual(
        AuthenticationResult.succeeded(user, { state: newState })
      );

      expect(mockOptions.session.update).toHaveBeenCalledTimes(1);
      expect(mockOptions.session.update).toHaveBeenCalledWith(request, {
        ...mockSessVal,
        state: newState,
      });
      expect(mockOptions.session.create).not.toHaveBeenCalled();
      expect(mockOptions.session.extend).not.toHaveBeenCalled();
      expect(mockOptions.session.invalidate).not.toHaveBeenCalled();
      expect(auditLogger.log).not.toHaveBeenCalled();
      expect(mockOptions.userProfileService.activate).not.toHaveBeenCalled();
    });

    it('replaces existing session with the one returned by authentication provider for non-system API requests', async () => {
      const user = mockAuthenticatedUser();
      const newState = { authorization: 'Basic yyy' };
      const request = httpServerMock.createKibanaRequest({
        headers: { 'kbn-system-request': 'false' },
      });

      mockBasicAuthenticationProvider.authenticate.mockResolvedValue(
        AuthenticationResult.succeeded(user, { state: newState })
      );
      mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });

      await expect(authenticator.authenticate(request)).resolves.toEqual(
        AuthenticationResult.succeeded(user, { state: newState })
      );

      expect(mockOptions.session.update).toHaveBeenCalledTimes(1);
      expect(mockOptions.session.update).toHaveBeenCalledWith(request, {
        ...mockSessVal,
        state: newState,
      });
      expect(mockOptions.session.create).not.toHaveBeenCalled();
      expect(mockOptions.session.extend).not.toHaveBeenCalled();
      expect(mockOptions.session.invalidate).not.toHaveBeenCalled();
      expect(auditLogger.log).not.toHaveBeenCalled();
      expect(mockOptions.userProfileService.activate).not.toHaveBeenCalled();
    });

    it('re-activates user profile if authentication provider returns a user profile grant for non-system API requests', async () => {
      const user = mockAuthenticatedUser();
      const newState = { authorization: 'Basic yyy' };
      const request = httpServerMock.createKibanaRequest({
        headers: { 'kbn-system-request': 'false' },
      });
      const userProfileGrant: UserProfileGrant = {
        type: 'password',
        username: 'some-user',
        password: 'some-password',
      };
      mockOptions.userProfileService.activate.mockResolvedValue({
        ...userProfileMock.createWithSecurity(),
        uid: 'new-profile-uid',
      });

      mockBasicAuthenticationProvider.authenticate.mockResolvedValue(
        AuthenticationResult.succeeded(user, { userProfileGrant, state: newState })
      );
      mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });

      await expect(authenticator.authenticate(request)).resolves.toEqual(
        AuthenticationResult.succeeded(user, { userProfileGrant, state: newState })
      );

      expect(mockOptions.session.update).toHaveBeenCalledTimes(1);
      expect(mockOptions.session.update).toHaveBeenCalledWith(request, {
        ...mockSessVal,
        userProfileId: 'new-profile-uid',
        state: newState,
      });
      expect(mockOptions.session.create).not.toHaveBeenCalled();
      expect(mockOptions.session.extend).not.toHaveBeenCalled();
      expect(mockOptions.session.invalidate).not.toHaveBeenCalled();
      expect(auditLogger.log).not.toHaveBeenCalled();
      expect(mockOptions.userProfileService.activate).toHaveBeenCalledTimes(1);
      expect(mockOptions.userProfileService.activate).toHaveBeenCalledWith(userProfileGrant);
    });

    it('clears session if provider failed to authenticate system API request with 401 with active session.', async () => {
      const request = httpServerMock.createKibanaRequest({
        headers: { 'kbn-system-request': 'true' },
      });

      const failureReason = new errors.ResponseError(
        securityMock.createApiResponse({ statusCode: 401, body: {} })
      );
      mockBasicAuthenticationProvider.authenticate.mockResolvedValue(
        AuthenticationResult.failed(failureReason)
      );
      mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });

      await expect(authenticator.authenticate(request)).resolves.toEqual(
        AuthenticationResult.failed(failureReason)
      );

      expect(mockOptions.session.create).not.toHaveBeenCalled();
      expect(mockOptions.session.update).not.toHaveBeenCalled();
      expect(mockOptions.session.extend).not.toHaveBeenCalled();
      expect(mockOptions.session.invalidate).toHaveBeenCalledTimes(1);
      expect(mockOptions.session.invalidate).toHaveBeenCalledWith(request, { match: 'current' });
      expectAuditEvents({ action: 'user_logout', outcome: 'unknown' });
    });

    it('clears session if provider failed to authenticate non-system API request with 401 with active session.', async () => {
      const request = httpServerMock.createKibanaRequest({
        headers: { 'kbn-system-request': 'false' },
      });

      const failureReason = new errors.ResponseError(
        securityMock.createApiResponse({ statusCode: 401, body: {} })
      );
      mockBasicAuthenticationProvider.authenticate.mockResolvedValue(
        AuthenticationResult.failed(failureReason)
      );
      mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });

      await expect(authenticator.authenticate(request)).resolves.toEqual(
        AuthenticationResult.failed(failureReason)
      );

      expect(mockOptions.session.create).not.toHaveBeenCalled();
      expect(mockOptions.session.update).not.toHaveBeenCalled();
      expect(mockOptions.session.extend).not.toHaveBeenCalled();
      expect(mockOptions.session.invalidate).toHaveBeenCalledTimes(1);
      expect(mockOptions.session.invalidate).toHaveBeenCalledWith(request, { match: 'current' });
      expectAuditEvents({ action: 'user_logout', outcome: 'unknown' });
    });

    it('clears session if provider requested it via setting state to `null`.', async () => {
      const request = httpServerMock.createKibanaRequest();

      mockBasicAuthenticationProvider.authenticate.mockResolvedValue(
        AuthenticationResult.redirectTo('some-url', { state: null })
      );
      mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });

      await expect(authenticator.authenticate(request)).resolves.toEqual(
        AuthenticationResult.redirectTo('some-url', { state: null })
      );

      expect(mockOptions.session.create).not.toHaveBeenCalled();
      expect(mockOptions.session.update).not.toHaveBeenCalled();
      expect(mockOptions.session.extend).not.toHaveBeenCalled();
      expect(mockOptions.session.invalidate).toHaveBeenCalledTimes(1);
      expect(mockOptions.session.invalidate).toHaveBeenCalledWith(request, { match: 'current' });
      expectAuditEvents({ action: 'user_logout', outcome: 'unknown' });
    });

    it('does not clear session if provider can not handle system API request authentication with active session.', async () => {
      const request = httpServerMock.createKibanaRequest({
        headers: { 'kbn-system-request': 'true' },
      });

      mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });

      await expect(authenticator.authenticate(request)).resolves.toEqual(
        AuthenticationResult.notHandled()
      );

      expect(mockOptions.session.create).not.toHaveBeenCalled();
      expect(mockOptions.session.update).not.toHaveBeenCalled();
      expect(mockOptions.session.extend).not.toHaveBeenCalled();
      expect(mockOptions.session.invalidate).not.toHaveBeenCalled();
      expect(auditLogger.log).not.toHaveBeenCalled();
    });

    it('does not clear session if provider can not handle non-system API request authentication with active session.', async () => {
      const request = httpServerMock.createKibanaRequest({
        headers: { 'kbn-system-request': 'false' },
      });

      mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });

      await expect(authenticator.authenticate(request)).resolves.toEqual(
        AuthenticationResult.notHandled()
      );

      expect(mockOptions.session.create).not.toHaveBeenCalled();
      expect(mockOptions.session.update).not.toHaveBeenCalled();
      expect(mockOptions.session.extend).not.toHaveBeenCalled();
      expect(mockOptions.session.invalidate).not.toHaveBeenCalled();
      expect(auditLogger.log).not.toHaveBeenCalled();
    });

    describe('with Login Selector', () => {
      beforeEach(() => {
        mockOptions = getMockOptions({
          selector: { enabled: true },
          providers: { basic: { basic1: { order: 0 } } },
        });

        authenticator = new Authenticator(mockOptions);
      });

      it('does not redirect to Login Selector if there is an active session', async () => {
        const request = httpServerMock.createKibanaRequest();
        mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });

        await expect(authenticator.authenticate(request)).resolves.toEqual(
          AuthenticationResult.notHandled()
        );
        expect(mockBasicAuthenticationProvider.authenticate).toHaveBeenCalled();
        expect(auditLogger.log).not.toHaveBeenCalled();
      });

      it('does not redirect AJAX requests to Login Selector', async () => {
        const request = httpServerMock.createKibanaRequest({ headers: { 'kbn-xsrf': 'xsrf' } });

        await expect(authenticator.authenticate(request)).resolves.toEqual(
          AuthenticationResult.notHandled()
        );
        expect(mockBasicAuthenticationProvider.authenticate).toHaveBeenCalled();
        expect(auditLogger.log).not.toHaveBeenCalled();
      });

      it('does not redirect to Login Selector if request has `Authorization` header', async () => {
        const request = httpServerMock.createKibanaRequest({
          headers: { authorization: 'Basic ***' },
        });

        await expect(authenticator.authenticate(request)).resolves.toEqual(
          AuthenticationResult.notHandled()
        );
        expect(mockBasicAuthenticationProvider.authenticate).toHaveBeenCalled();
        expect(auditLogger.log).not.toHaveBeenCalled();
      });

      it('does not redirect to Login Selector if it is not enabled', async () => {
        mockOptions = getMockOptions({ providers: { basic: { basic1: { order: 0 } } } });
        authenticator = new Authenticator(mockOptions);

        const request = httpServerMock.createKibanaRequest();
        await expect(authenticator.authenticate(request)).resolves.toEqual(
          AuthenticationResult.notHandled()
        );
        expect(mockBasicAuthenticationProvider.authenticate).toHaveBeenCalled();
        expect(auditLogger.log).not.toHaveBeenCalled();
      });

      it('redirects to the Login Selector when needed.', async () => {
        const request = httpServerMock.createKibanaRequest();
        await expect(authenticator.authenticate(request)).resolves.toEqual(
          AuthenticationResult.redirectTo(
            '/mock-server-basepath/login?next=%2Fmock-server-basepath%2Fpath'
          )
        );

        // Unauthenticated session should be treated as non-existent one.
        mockOptions.session.get.mockResolvedValue({
          error: null,
          value: { ...mockSessVal, username: undefined },
        });
        await expect(authenticator.authenticate(request)).resolves.toEqual(
          AuthenticationResult.redirectTo(
            '/mock-server-basepath/login?next=%2Fmock-server-basepath%2Fpath'
          )
        );
        expect(mockBasicAuthenticationProvider.authenticate).not.toHaveBeenCalled();
        expect(auditLogger.log).not.toHaveBeenCalled();
      });

      it('redirects to the Login Selector with auth provider hint when needed.', async () => {
        const request = httpServerMock.createKibanaRequest({
          query: { [AUTH_PROVIDER_HINT_QUERY_STRING_PARAMETER]: 'custom1' },
        });

        // Includes hint if there is no active session.
        await expect(authenticator.authenticate(request)).resolves.toEqual(
          AuthenticationResult.redirectTo(
            '/mock-server-basepath/login?next=%2Fmock-server-basepath%2Fpath%3Fauth_provider_hint%3Dcustom1&auth_provider_hint=custom1'
          )
        );

        // Includes hint if session is unauthenticated.
        mockOptions.session.get.mockResolvedValue({
          error: null,
          value: { ...mockSessVal, username: undefined },
        });
        await expect(authenticator.authenticate(request)).resolves.toEqual(
          AuthenticationResult.redirectTo(
            '/mock-server-basepath/login?next=%2Fmock-server-basepath%2Fpath%3Fauth_provider_hint%3Dcustom1&auth_provider_hint=custom1'
          )
        );

        expect(mockBasicAuthenticationProvider.authenticate).not.toHaveBeenCalled();
        expect(auditLogger.log).not.toHaveBeenCalled();
      });
    });

    describe('with Access Agreement', () => {
      const mockUser = mockAuthenticatedUser();
      beforeEach(() => {
        mockOptions = getMockOptions({
          providers: {
            basic: { basic1: { order: 0, accessAgreement: { message: 'some notice' } } },
          },
        });
        mockOptions.license.getFeatures.mockReturnValue({
          allowAccessAgreement: true,
        } as SecurityLicenseFeatures);

        mockBasicAuthenticationProvider.authenticate.mockResolvedValue(
          AuthenticationResult.succeeded(mockUser)
        );

        authenticator = new Authenticator(mockOptions);
      });

      it('does not redirect to Access Agreement if there is no active session', async () => {
        const request = httpServerMock.createKibanaRequest();

        await expect(authenticator.authenticate(request)).resolves.toEqual(
          AuthenticationResult.succeeded(mockUser)
        );
        expect(auditLogger.log).not.toHaveBeenCalled();
      });

      it('does not redirect AJAX requests to Access Agreement', async () => {
        const request = httpServerMock.createKibanaRequest({ headers: { 'kbn-xsrf': 'xsrf' } });
        mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });

        await expect(authenticator.authenticate(request)).resolves.toEqual(
          AuthenticationResult.succeeded(mockUser)
        );
        expect(auditLogger.log).not.toHaveBeenCalled();
      });

      it('does not redirect to Access Agreement if request cannot be handled', async () => {
        const request = httpServerMock.createKibanaRequest();
        mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });

        mockBasicAuthenticationProvider.authenticate.mockResolvedValue(
          AuthenticationResult.notHandled()
        );

        await expect(authenticator.authenticate(request)).resolves.toEqual(
          AuthenticationResult.notHandled()
        );
        expect(auditLogger.log).not.toHaveBeenCalled();
      });

      it('does not redirect to Access Agreement if authentication fails', async () => {
        const request = httpServerMock.createKibanaRequest();
        mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });

        const failureReason = new Error('something went wrong');
        mockBasicAuthenticationProvider.authenticate.mockResolvedValue(
          AuthenticationResult.failed(failureReason)
        );

        await expect(authenticator.authenticate(request)).resolves.toEqual(
          AuthenticationResult.failed(failureReason)
        );
        expect(auditLogger.log).not.toHaveBeenCalled();
      });

      it('does not redirect to Access Agreement if redirect is required to complete authentication', async () => {
        const request = httpServerMock.createKibanaRequest();
        mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });

        mockBasicAuthenticationProvider.authenticate.mockResolvedValue(
          AuthenticationResult.redirectTo('/some-url')
        );

        await expect(authenticator.authenticate(request)).resolves.toEqual(
          AuthenticationResult.redirectTo('/some-url')
        );
        expect(auditLogger.log).not.toHaveBeenCalled();
      });

      it('does not redirect to Access Agreement if user has already acknowledged it', async () => {
        const request = httpServerMock.createKibanaRequest();
        mockOptions.session.get.mockResolvedValue({
          error: null,
          value: {
            ...mockSessVal,
            accessAgreementAcknowledged: true,
          },
        });

        await expect(authenticator.authenticate(request)).resolves.toEqual(
          AuthenticationResult.succeeded(mockUser)
        );
        expect(auditLogger.log).not.toHaveBeenCalled();
      });

      it('does not redirect to Access Agreement its own requests', async () => {
        const request = httpServerMock.createKibanaRequest({ path: '/security/access_agreement' });
        mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });

        await expect(authenticator.authenticate(request)).resolves.toEqual(
          AuthenticationResult.succeeded(mockUser)
        );
        expect(auditLogger.log).not.toHaveBeenCalled();
      });

      it('does not redirect to Access Agreement if it is not configured', async () => {
        mockOptions = getMockOptions({ providers: { basic: { basic1: { order: 0 } } } });
        mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });
        authenticator = new Authenticator(mockOptions);

        const request = httpServerMock.createKibanaRequest();
        await expect(authenticator.authenticate(request)).resolves.toEqual(
          AuthenticationResult.succeeded(mockUser)
        );
        expect(auditLogger.log).not.toHaveBeenCalled();
      });

      it('does not redirect to Access Agreement if license doesnt allow it.', async () => {
        const request = httpServerMock.createKibanaRequest();
        mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });
        mockOptions.license.getFeatures.mockReturnValue({
          allowAccessAgreement: false,
        } as SecurityLicenseFeatures);

        await expect(authenticator.authenticate(request)).resolves.toEqual(
          AuthenticationResult.succeeded(mockUser)
        );
        expect(auditLogger.log).not.toHaveBeenCalled();
      });

      it('redirects to Access Agreement when needed.', async () => {
        mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });
        mockOptions.session.extend.mockResolvedValue(mockSessVal);

        mockBasicAuthenticationProvider.authenticate.mockResolvedValue(
          AuthenticationResult.succeeded(mockUser, {
            authResponseHeaders: { 'WWW-Authenticate': 'Negotiate' },
          })
        );

        const request = httpServerMock.createKibanaRequest();
        await expect(authenticator.authenticate(request)).resolves.toEqual(
          AuthenticationResult.redirectTo(
            '/mock-server-basepath/security/access_agreement?next=%2Fmock-server-basepath%2Fpath',
            { user: mockUser, authResponseHeaders: { 'WWW-Authenticate': 'Negotiate' } }
          )
        );
        expect(auditLogger.log).not.toHaveBeenCalled();
      });

      it('redirects to global Access Agreement when provider specific Access Agreement is not configured.', async () => {
        mockOptions = getMockOptions({
          providers: {
            basic: { basic1: { order: 0 } },
          },
          accessAgreementMessage: 'Foo',
        });

        mockOptions.license.getFeatures.mockReturnValue({
          allowAccessAgreement: true,
        } as SecurityLicenseFeatures);

        authenticator = new Authenticator(mockOptions);

        mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });
        mockOptions.session.extend.mockResolvedValue(mockSessVal);

        mockBasicAuthenticationProvider.authenticate.mockResolvedValue(
          AuthenticationResult.succeeded(mockUser, {
            authResponseHeaders: { 'WWW-Authenticate': 'Negotiate' },
          })
        );

        const request = httpServerMock.createKibanaRequest();
        await expect(authenticator.authenticate(request)).resolves.toEqual(
          AuthenticationResult.redirectTo(
            '/mock-server-basepath/security/access_agreement?next=%2Fmock-server-basepath%2Fpath',
            { user: mockUser, authResponseHeaders: { 'WWW-Authenticate': 'Negotiate' } }
          )
        );
        expect(auditLogger.log).not.toHaveBeenCalled();
      });
    });

    describe('with Overwritten Session', () => {
      const mockUser = mockAuthenticatedUser();
      beforeEach(() => {
        mockOptions = getMockOptions({
          providers: {
            basic: { basic1: { order: 0 } },
            saml: { saml1: { order: 1, realm: 'saml1' } },
          },
        });
        mockOptions.session.update.mockImplementation(async (request, value) => value);
        mockOptions.session.extend.mockImplementation(async (request, value) => value);
        mockOptions.session.create.mockImplementation(async (request, value) => ({
          ...mockSessVal,
          ...value,
        }));

        authenticator = new Authenticator(mockOptions);
      });

      it('does not redirect to Overwritten Session its own requests', async () => {
        const request = httpServerMock.createKibanaRequest({
          path: '/security/overwritten_session',
        });
        mockOptions.session.get.mockResolvedValue({
          error: null,
          value: { ...mockSessVal, username: 'old-username' },
        });

        mockBasicAuthenticationProvider.authenticate.mockResolvedValue(
          AuthenticationResult.succeeded(mockUser)
        );

        await expect(authenticator.authenticate(request)).resolves.toEqual(
          AuthenticationResult.succeeded(mockUser)
        );
        expectAuditEvents(
          { action: 'user_logout', outcome: 'unknown' },
          { action: 'user_login', outcome: 'success' }
        );
      });

      it('does not redirect AJAX requests to Overwritten Session', async () => {
        const request = httpServerMock.createKibanaRequest({ headers: { 'kbn-xsrf': 'xsrf' } });
        mockOptions.session.get.mockResolvedValue({
          error: null,
          value: { ...mockSessVal, username: 'old-username' },
        });

        mockBasicAuthenticationProvider.authenticate.mockResolvedValue(
          AuthenticationResult.succeeded(mockUser, {
            state: 'some-state',
            authResponseHeaders: { 'WWW-Authenticate': 'Negotiate' },
          })
        );

        await expect(authenticator.authenticate(request)).resolves.toEqual(
          AuthenticationResult.succeeded(mockUser, {
            state: 'some-state',
            authResponseHeaders: { 'WWW-Authenticate': 'Negotiate' },
          })
        );
        expectAuditEvents(
          { action: 'user_logout', outcome: 'unknown' },
          { action: 'user_login', outcome: 'success' }
        );
      });

      it('does not redirect to Overwritten Session if username and provider did not change', async () => {
        const request = httpServerMock.createKibanaRequest();
        mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });

        mockBasicAuthenticationProvider.authenticate.mockResolvedValue(
          AuthenticationResult.succeeded(mockUser, {
            state: 'some-state',
            authResponseHeaders: { 'WWW-Authenticate': 'Negotiate' },
          })
        );

        await expect(authenticator.authenticate(request)).resolves.toEqual(
          AuthenticationResult.succeeded(mockUser, {
            state: 'some-state',
            authResponseHeaders: { 'WWW-Authenticate': 'Negotiate' },
          })
        );
        expect(auditLogger.log).not.toHaveBeenCalled();
      });

      it('redirects to Overwritten Session when username changes', async () => {
        const request = httpServerMock.createKibanaRequest();
        mockOptions.session.get.mockResolvedValue({
          error: null,
          value: { ...mockSessVal, username: 'old-username' },
        });

        mockBasicAuthenticationProvider.authenticate.mockResolvedValue(
          AuthenticationResult.succeeded(mockUser, {
            state: 'some-state',
            authResponseHeaders: { 'WWW-Authenticate': 'Negotiate' },
          })
        );

        await expect(authenticator.authenticate(request)).resolves.toEqual(
          AuthenticationResult.redirectTo(
            '/mock-server-basepath/security/overwritten_session?next=%2Fmock-server-basepath%2Fpath',
            {
              user: mockUser,
              state: 'some-state',
              authResponseHeaders: { 'WWW-Authenticate': 'Negotiate' },
            }
          )
        );
        expectAuditEvents(
          { action: 'user_logout', outcome: 'unknown' },
          { action: 'user_login', outcome: 'success' }
        );
      });

      it('redirects to Overwritten Session when provider changes', async () => {
        const request = httpServerMock.createKibanaRequest();
        mockOptions.session.get.mockResolvedValue({
          error: null,
          value: {
            ...mockSessVal,
            provider: { type: 'saml', name: 'saml1' },
          },
        });

        mockBasicAuthenticationProvider.authenticate.mockResolvedValue(
          AuthenticationResult.succeeded(mockUser, {
            state: 'some-state',
            authResponseHeaders: { 'WWW-Authenticate': 'Negotiate' },
          })
        );

        await expect(authenticator.authenticate(request)).resolves.toEqual(
          AuthenticationResult.redirectTo(
            '/mock-server-basepath/security/overwritten_session?next=%2Fmock-server-basepath%2Fpath',
            {
              user: mockUser,
              state: 'some-state',
              authResponseHeaders: { 'WWW-Authenticate': 'Negotiate' },
            }
          )
        );
        expectAuditEvents(
          { action: 'user_logout', outcome: 'unknown' },
          { action: 'user_login', outcome: 'success' }
        );
      });

      it('redirects to Overwritten Session preserving redirect URL specified in the authentication result.', async () => {
        const request = httpServerMock.createKibanaRequest();
        mockOptions.session.get.mockResolvedValue({
          error: null,
          value: { ...mockSessVal, username: 'old-username' },
        });

        mockBasicAuthenticationProvider.authenticate.mockResolvedValue(
          AuthenticationResult.redirectTo('/some-url', {
            user: mockUser,
            state: 'some-state',
            authResponseHeaders: { 'WWW-Authenticate': 'Negotiate' },
          })
        );

        await expect(authenticator.authenticate(request)).resolves.toEqual(
          AuthenticationResult.redirectTo(
            '/mock-server-basepath/security/overwritten_session?next=%2Fsome-url',
            {
              user: mockUser,
              state: 'some-state',
              authResponseHeaders: { 'WWW-Authenticate': 'Negotiate' },
            }
          )
        );
        expectAuditEvents(
          { action: 'user_logout', outcome: 'unknown' },
          { action: 'user_login', outcome: 'success' }
        );
      });
    });
  });

  describe('`reauthenticate` method', () => {
    let authenticator: Authenticator;
    let mockOptions: ReturnType<typeof getMockOptions>;
    let mockSessVal: SessionValue;

    beforeEach(() => {
      mockOptions = getMockOptions({ providers: { basic: { basic1: { order: 0 } } } });
      mockSessVal = sessionMock.createValue({ state: { authorization: 'Basic xxx' } });

      authenticator = new Authenticator(mockOptions);
    });

    it('does not try to reauthenticate request if session is not available.', async () => {
      const request = httpServerMock.createKibanaRequest();

      await expect(authenticator.reauthenticate(request)).resolves.toEqual(
        AuthenticationResult.notHandled()
      );

      expect(mockOptions.session.create).not.toHaveBeenCalled();
      expect(mockOptions.session.update).not.toHaveBeenCalled();
      expect(mockOptions.session.extend).not.toHaveBeenCalled();
      expect(mockOptions.session.invalidate).not.toHaveBeenCalled();
      expect(mockBasicAuthenticationProvider.authenticate).not.toHaveBeenCalled();
      expect(auditLogger.log).not.toHaveBeenCalled();
    });

    it('does not redirect to Login Selector even if it is enabled if session is not available.', async () => {
      const request = httpServerMock.createKibanaRequest();

      authenticator = new Authenticator(
        getMockOptions({
          selector: { enabled: true },
          providers: { basic: { basic1: { order: 0 } } },
        })
      );

      await expect(authenticator.reauthenticate(request)).resolves.toEqual(
        AuthenticationResult.notHandled()
      );

      expect(mockOptions.session.create).not.toHaveBeenCalled();
      expect(mockOptions.session.update).not.toHaveBeenCalled();
      expect(mockOptions.session.extend).not.toHaveBeenCalled();
      expect(mockOptions.session.invalidate).not.toHaveBeenCalled();
      expect(mockBasicAuthenticationProvider.authenticate).not.toHaveBeenCalled();
      expect(auditLogger.log).not.toHaveBeenCalled();
    });

    it('does not clear session if provider cannot handle authentication', async () => {
      const request = httpServerMock.createKibanaRequest();
      mockOptions.session.getSID.mockResolvedValue(mockSessVal.sid);
      mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });

      mockBasicAuthenticationProvider.authenticate.mockResolvedValue(
        AuthenticationResult.notHandled()
      );

      await expect(authenticator.reauthenticate(request)).resolves.toEqual(
        AuthenticationResult.notHandled()
      );

      expect(mockOptions.session.create).not.toHaveBeenCalled();
      expect(mockOptions.session.update).not.toHaveBeenCalled();
      expect(mockOptions.session.extend).not.toHaveBeenCalled();
      expect(mockOptions.session.invalidate).not.toHaveBeenCalled();
      expect(mockBasicAuthenticationProvider.authenticate).toHaveBeenCalledTimes(1);
      expect(mockBasicAuthenticationProvider.authenticate).toBeCalledWith(request, mockSessVal);
      expect(auditLogger.log).not.toHaveBeenCalled();
    });

    it('does not clear session if authentication fails with non-401 reason.', async () => {
      const request = httpServerMock.createKibanaRequest();

      const failureReason = new Error('some error');
      mockBasicAuthenticationProvider.authenticate.mockResolvedValue(
        AuthenticationResult.failed(failureReason)
      );
      mockOptions.session.getSID.mockResolvedValue(mockSessVal.sid);
      mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });

      await expect(authenticator.reauthenticate(request)).resolves.toEqual(
        AuthenticationResult.failed(failureReason)
      );

      expect(mockOptions.session.create).not.toHaveBeenCalled();
      expect(mockOptions.session.update).not.toHaveBeenCalled();
      expect(mockOptions.session.extend).not.toHaveBeenCalled();
      expect(mockOptions.session.invalidate).not.toHaveBeenCalled();
      expect(auditLogger.log).not.toHaveBeenCalled();
    });

    it('extends session if no update is needed.', async () => {
      const user = mockAuthenticatedUser();
      const request = httpServerMock.createKibanaRequest();

      mockBasicAuthenticationProvider.authenticate.mockResolvedValue(
        AuthenticationResult.succeeded(user)
      );
      mockOptions.session.getSID.mockResolvedValue(mockSessVal.sid);
      mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });

      await expect(authenticator.reauthenticate(request)).resolves.toEqual(
        AuthenticationResult.succeeded(user)
      );

      expect(mockOptions.session.create).not.toHaveBeenCalled();
      expect(mockOptions.session.update).not.toHaveBeenCalled();
      expect(mockOptions.session.extend).toHaveBeenCalledTimes(1);
      expect(mockOptions.session.extend).toHaveBeenCalledWith(request, mockSessVal);
      expect(mockOptions.session.invalidate).not.toHaveBeenCalled();
      expect(auditLogger.log).not.toHaveBeenCalled();
    });

    it('replaces existing session with the one returned by authentication provider', async () => {
      const user = mockAuthenticatedUser();
      const newState = { authorization: 'Basic yyy' };
      const request = httpServerMock.createKibanaRequest();

      mockBasicAuthenticationProvider.authenticate.mockResolvedValue(
        AuthenticationResult.succeeded(user, { state: newState })
      );
      mockOptions.session.getSID.mockResolvedValue(mockSessVal.sid);
      mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });

      await expect(authenticator.reauthenticate(request)).resolves.toEqual(
        AuthenticationResult.succeeded(user, { state: newState })
      );

      expect(mockOptions.session.create).not.toHaveBeenCalled();
      expect(mockOptions.session.update).toHaveBeenCalledTimes(1);
      expect(mockOptions.session.update).toHaveBeenCalledWith(request, {
        ...mockSessVal,
        state: newState,
      });
      expect(mockOptions.session.extend).not.toHaveBeenCalled();
      expect(mockOptions.session.invalidate).not.toHaveBeenCalled();
      expect(auditLogger.log).not.toHaveBeenCalled();
    });

    it('clears session if provider failed to authenticate request with 401.', async () => {
      const request = httpServerMock.createKibanaRequest();

      const failureReason = new errors.ResponseError(
        securityMock.createApiResponse({ statusCode: 401, body: {} })
      );
      mockBasicAuthenticationProvider.authenticate.mockResolvedValue(
        AuthenticationResult.failed(failureReason)
      );
      mockOptions.session.getSID.mockResolvedValue(mockSessVal.sid);
      mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });

      await expect(authenticator.reauthenticate(request)).resolves.toEqual(
        AuthenticationResult.failed(failureReason)
      );

      expect(mockOptions.session.create).not.toHaveBeenCalled();
      expect(mockOptions.session.update).not.toHaveBeenCalled();
      expect(mockOptions.session.extend).not.toHaveBeenCalled();
      expect(mockOptions.session.invalidate).toHaveBeenCalledTimes(1);
      expect(mockOptions.session.invalidate).toHaveBeenCalledWith(request, { match: 'current' });
      expectAuditEvents({ action: 'user_logout', outcome: 'unknown' });
    });
  });

  describe('`logout` method', () => {
    let authenticator: Authenticator;
    let mockOptions: ReturnType<typeof getMockOptions>;
    let mockSessVal: SessionValue;

    beforeEach(() => {
      mockOptions = getMockOptions({ providers: { basic: { basic1: { order: 0 } } } });
      mockSessVal = sessionMock.createValue({ state: { authorization: 'Basic xxx' } });

      authenticator = new Authenticator(mockOptions);
    });

    it('redirects to login form if session does not exist.', async () => {
      const request = httpServerMock.createKibanaRequest();
      mockBasicAuthenticationProvider.logout.mockResolvedValue(DeauthenticationResult.notHandled());

      await expect(authenticator.logout(request)).resolves.toEqual(
        DeauthenticationResult.redirectTo('/mock-server-basepath/login?msg=LOGGED_OUT')
      );

      expect(mockOptions.session.invalidate).not.toHaveBeenCalled();
      expect(auditLogger.log).not.toHaveBeenCalled();
    });

    it('clears session and returns whatever authentication provider returns.', async () => {
      const request = httpServerMock.createKibanaRequest();
      mockBasicAuthenticationProvider.logout.mockResolvedValue(
        DeauthenticationResult.redirectTo('some-url')
      );
      mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });

      await expect(authenticator.logout(request)).resolves.toEqual(
        DeauthenticationResult.redirectTo('some-url')
      );

      expect(mockBasicAuthenticationProvider.logout).toHaveBeenCalledTimes(1);
      expect(mockOptions.session.invalidate).toHaveBeenCalled();
      expectAuditEvents({ action: 'user_logout', outcome: 'unknown' });
    });

    it('if session does not exist but provider name is valid, returns whatever authentication provider returns.', async () => {
      const request = httpServerMock.createKibanaRequest({
        query: { provider: 'basic1' },
      });

      mockBasicAuthenticationProvider.logout.mockResolvedValue(
        DeauthenticationResult.redirectTo('some-url')
      );

      await expect(authenticator.logout(request)).resolves.toEqual(
        DeauthenticationResult.redirectTo('some-url')
      );

      expect(mockBasicAuthenticationProvider.logout).toHaveBeenCalledTimes(1);
      expect(mockBasicAuthenticationProvider.logout).toHaveBeenCalledWith(request, null);
      expect(mockOptions.session.invalidate).toHaveBeenCalled();
      expect(auditLogger.log).not.toHaveBeenCalled();
    });

    it('if session does not exist and provider name is not available, returns whatever authentication provider returns.', async () => {
      const request = httpServerMock.createKibanaRequest();

      mockBasicAuthenticationProvider.logout.mockResolvedValue(
        DeauthenticationResult.redirectTo('some-url')
      );

      await expect(authenticator.logout(request)).resolves.toEqual(
        DeauthenticationResult.redirectTo('some-url')
      );

      expect(mockBasicAuthenticationProvider.logout).toHaveBeenCalledTimes(1);
      expect(mockBasicAuthenticationProvider.logout).toHaveBeenCalledWith(request);
      expect(mockOptions.session.invalidate).not.toHaveBeenCalled();
      expect(auditLogger.log).not.toHaveBeenCalled();
    });

    it('if session does not exist and providers is empty, redirects to default logout path.', async () => {
      const request = httpServerMock.createKibanaRequest();

      mockOptions = getMockOptions({
        providers: { basic: { basic1: { order: 0, enabled: false } } },
      });
      authenticator = new Authenticator(mockOptions);

      await expect(authenticator.logout(request)).resolves.toEqual(
        DeauthenticationResult.redirectTo(
          '/mock-server-basepath/security/logged_out?msg=LOGGED_OUT'
        )
      );

      expect(mockBasicAuthenticationProvider.logout).not.toHaveBeenCalled();
      expect(mockOptions.session.invalidate).not.toHaveBeenCalled();
      expect(auditLogger.log).not.toHaveBeenCalled();
    });

    describe('user activity tracking', () => {
      it('tracks log_out_user action on logout with an active session', async () => {
        const request = httpServerMock.createKibanaRequest();
        mockBasicAuthenticationProvider.logout.mockResolvedValue(
          DeauthenticationResult.redirectTo('some-url')
        );
        mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessVal });

        await authenticator.logout(request);

        expect(mockOptions.userActivity.trackUserAction).toHaveBeenCalledTimes(1);
        expect(mockOptions.userActivity.trackUserAction).toHaveBeenCalledWith({
          message: 'User logged out via basic provider "basic1".',
          event: { action: 'log_out_user', type: 'end' },
          object: {
            id: mockSessVal.userProfileId,
            name: mockSessVal.username,
            type: 'user',
            tags: [],
          },
          metadata: {
            authenticationProvider: 'basic1',
            authenticationType: 'basic',
          },
        });
      });

      it('does not track user activity on logout without an active session', async () => {
        const request = httpServerMock.createKibanaRequest();
        mockBasicAuthenticationProvider.logout.mockResolvedValue(
          DeauthenticationResult.redirectTo('some-url')
        );

        await authenticator.logout(request);

        expect(mockOptions.userActivity.trackUserAction).not.toHaveBeenCalled();
      });
    });

    it('redirects to login form if session does not exist and provider name is invalid', async () => {
      const request = httpServerMock.createKibanaRequest({ query: { provider: 'foo' } });

      await expect(authenticator.logout(request)).resolves.toEqual(
        DeauthenticationResult.redirectTo('/mock-server-basepath/login?msg=LOGGED_OUT')
      );

      expect(mockBasicAuthenticationProvider.logout).not.toHaveBeenCalled();
      expect(mockOptions.session.invalidate).toHaveBeenCalled();
      expect(auditLogger.log).not.toHaveBeenCalled();
    });
  });

  describe('`acknowledgeAccessAgreement` method', () => {
    let authenticator: Authenticator;
    let mockOptions: ReturnType<typeof getMockOptions>;
    let mockSessionValue: SessionValue;

    beforeEach(() => {
      mockOptions = getMockOptions({ providers: { basic: { basic1: { order: 0 } } } });
      mockSessionValue = sessionMock.createValue({ state: { authorization: 'Basic xxx' } });
      mockOptions.session.get.mockResolvedValue({ error: null, value: mockSessionValue });
      mockOptions.getCurrentUser.mockReturnValue(mockAuthenticatedUser());
      mockOptions.license.getFeatures.mockReturnValue({
        allowAccessAgreement: true,
      } as SecurityLicenseFeatures);

      authenticator = new Authenticator(mockOptions);
    });

    it('fails if user is not authenticated', async () => {
      mockOptions.getCurrentUser.mockReturnValue(null);

      await expect(
        authenticator.acknowledgeAccessAgreement(httpServerMock.createKibanaRequest())
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Cannot acknowledge access agreement for unauthenticated user."`
      );

      expect(mockOptions.session.update).not.toHaveBeenCalled();
      expect(mockOptions.featureUsageService.recordPreAccessAgreementUsage).not.toHaveBeenCalled();
      expect(auditLogger.log).not.toHaveBeenCalled();
    });

    it('fails if cannot retrieve user session', async () => {
      mockOptions.session.get.mockResolvedValue({ error: new SessionMissingError(), value: null });

      await expect(
        authenticator.acknowledgeAccessAgreement(httpServerMock.createKibanaRequest())
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Cannot acknowledge access agreement for unauthenticated user."`
      );

      expect(mockOptions.session.update).not.toHaveBeenCalled();
      expect(mockOptions.featureUsageService.recordPreAccessAgreementUsage).not.toHaveBeenCalled();
      expect(auditLogger.log).not.toHaveBeenCalled();
    });

    it('fails if license does not allow access agreement acknowledgement', async () => {
      mockOptions.license.getFeatures.mockReturnValue({
        allowAccessAgreement: false,
      } as SecurityLicenseFeatures);

      await expect(
        authenticator.acknowledgeAccessAgreement(httpServerMock.createKibanaRequest())
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Current license does not allow access agreement acknowledgement."`
      );

      expect(mockOptions.session.update).not.toHaveBeenCalled();
      expect(auditLogger.log).not.toHaveBeenCalled();
      expect(mockOptions.featureUsageService.recordPreAccessAgreementUsage).not.toHaveBeenCalled();
    });

    it('properly acknowledges access agreement for the authenticated user', async () => {
      const request = httpServerMock.createKibanaRequest();
      await authenticator.acknowledgeAccessAgreement(request);

      expect(mockOptions.session.update).toHaveBeenCalledTimes(1);
      expect(mockOptions.session.update).toHaveBeenCalledWith(request, {
        ...mockSessionValue,
        accessAgreementAcknowledged: true,
      });
      expect(mockOptions.featureUsageService.recordPreAccessAgreementUsage).toHaveBeenCalledTimes(
        1
      );
      expectAuditEvents({ action: 'access_agreement_acknowledged' });
    });
  });

  describe('`getRequestOriginalURL` method', () => {
    let authenticator: Authenticator;
    let mockOptions: ReturnType<typeof getMockOptions>;
    beforeEach(() => {
      mockOptions = getMockOptions({ providers: { basic: { basic1: { order: 0 } } } });
      authenticator = new Authenticator(mockOptions);
    });

    it('filters out auth specific query parameters', () => {
      expect(authenticator.getRequestOriginalURL(httpServerMock.createKibanaRequest())).toBe(
        '/mock-server-basepath/path'
      );

      expect(
        authenticator.getRequestOriginalURL(
          httpServerMock.createKibanaRequest({
            query: {
              [AUTH_PROVIDER_HINT_QUERY_STRING_PARAMETER]: 'saml1',
            },
          })
        )
      ).toBe('/mock-server-basepath/path');

      expect(
        authenticator.getRequestOriginalURL(
          httpServerMock.createKibanaRequest({
            query: {
              [AUTH_PROVIDER_HINT_QUERY_STRING_PARAMETER]: 'saml1',
              [AUTH_URL_HASH_QUERY_STRING_PARAMETER]: '#some-hash',
            },
          })
        )
      ).toBe('/mock-server-basepath/path');
    });

    it('allows to include additional query parameters', () => {
      expect(
        authenticator.getRequestOriginalURL(httpServerMock.createKibanaRequest(), [
          ['some-param', 'some-value'],
          ['some-param2', 'some-value2'],
        ])
      ).toBe('/mock-server-basepath/path?some-param=some-value&some-param2=some-value2');

      expect(
        authenticator.getRequestOriginalURL(
          httpServerMock.createKibanaRequest({
            query: {
              [AUTH_PROVIDER_HINT_QUERY_STRING_PARAMETER]: 'saml1',
              [AUTH_URL_HASH_QUERY_STRING_PARAMETER]: '#some-hash',
            },
          }),
          [
            ['some-param', 'some-value'],
            [AUTH_PROVIDER_HINT_QUERY_STRING_PARAMETER, 'oidc1'],
          ]
        )
      ).toBe('/mock-server-basepath/path?some-param=some-value&auth_provider_hint=oidc1');
    });
  });
});

describe('enrichWithUserProfileId', () => {
  it('should enrich succeeded authentication results with user profile id', () => {
    const authenticationResult = AuthenticationResult.succeeded(
      mockAuthenticatedUser({ profile_uid: undefined })
    );
    const sessionValue = sessionMock.createValue({ userProfileId: 'uid' });
    expect(enrichWithUserProfileId(authenticationResult, sessionValue)).toEqual(
      expect.objectContaining({
        user: expect.objectContaining({
          profile_uid: 'uid',
        }),
      })
    );
  });

  it('should enrich redirected authentication results with user profile id', () => {
    const authenticationResult = AuthenticationResult.redirectTo('/redirect/to', {
      user: mockAuthenticatedUser({ profile_uid: undefined }),
    });
    const sessionValue = sessionMock.createValue({ userProfileId: 'uid' });
    expect(enrichWithUserProfileId(authenticationResult, sessionValue)).toEqual(
      expect.objectContaining({
        user: expect.objectContaining({
          profile_uid: 'uid',
        }),
      })
    );
  });

  it('should not change unhandled authentication results', () => {
    const authenticationResult = AuthenticationResult.notHandled();
    const sessionValue = sessionMock.createValue();
    expect(enrichWithUserProfileId(authenticationResult, sessionValue)).toBe(authenticationResult);
  });

  it('should not change failed authentication results', () => {
    const authenticationResult = AuthenticationResult.failed(new Error('Authentication error'));
    const sessionValue = sessionMock.createValue();
    expect(enrichWithUserProfileId(authenticationResult, sessionValue)).toBe(authenticationResult);
  });

  it('should not change redirected authentication results without user', () => {
    const authenticationResult = AuthenticationResult.redirectTo('/redirect/to');
    const sessionValue = sessionMock.createValue();
    expect(enrichWithUserProfileId(authenticationResult, sessionValue)).toBe(authenticationResult);
  });

  it('should not change succeeded authentication result if session has no user profile id', () => {
    const authenticationResult = AuthenticationResult.succeeded(mockAuthenticatedUser());
    const sessionValue = sessionMock.createValue({ userProfileId: undefined });
    expect(enrichWithUserProfileId(authenticationResult, sessionValue)).toBe(authenticationResult);
  });

  it('should not change succeeded authentication result if user profile ids already match', () => {
    const authenticationResult = AuthenticationResult.succeeded(
      mockAuthenticatedUser({ profile_uid: 'uid' })
    );
    const sessionValue = sessionMock.createValue({ userProfileId: 'uid' });
    expect(enrichWithUserProfileId(authenticationResult, sessionValue)).toBe(authenticationResult);
  });
});
