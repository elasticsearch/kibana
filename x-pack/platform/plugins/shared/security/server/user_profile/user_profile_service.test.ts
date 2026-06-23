/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { errors } from '@elastic/elasticsearch';
import type {
  SecurityActivateUserProfileResponse,
  SecurityGetUserProfileResponse,
  SecuritySuggestUserProfilesResponse,
} from '@elastic/elasticsearch/lib/api/types';

import {
  elasticsearchServiceMock,
  httpServerMock,
  loggingSystemMock,
} from '@kbn/core/server/mocks';
import type { FakeRawRequest } from '@kbn/core-http-server';
import { kibanaRequestFactory } from '@kbn/core-http-server-utils';
import { nextTick } from '@kbn/test-jest-helpers';

import { prefixCommaSeparatedValues, UserProfileService } from './user_profile_service';
import type { UserProfileWithSecurity } from '../../common';
import { licenseMock } from '../../common/licensing/index.mock';
import { userProfileMock } from '../../common/model/user_profile.mock';
import { authorizationMock } from '../authorization/index.mock';
import { securityMock } from '../mocks';
import { securityTelemetry } from '../otel/instrumentation';
import { sessionMock } from '../session_management/session.mock';

jest.mock('../otel/instrumentation', () => ({
  securityTelemetry: {
    recordGetCurrentProfileInvocation: jest.fn(),
  },
}));

const logger = loggingSystemMock.createLogger();
describe('UserProfileService', () => {
  let mockStartParams: {
    clusterClient: ReturnType<typeof elasticsearchServiceMock.createClusterClient>;
    session: ReturnType<typeof sessionMock.create>;
    getCurrentUser: jest.Mock;
  };
  let mockAuthz: ReturnType<typeof authorizationMock.create>;
  let userProfileService: UserProfileService;
  beforeEach(() => {
    mockStartParams = {
      clusterClient: elasticsearchServiceMock.createClusterClient(),
      session: sessionMock.create(),
      getCurrentUser: jest.fn().mockReturnValue(null),
    };
    mockAuthz = authorizationMock.create();

    userProfileService = new UserProfileService(logger);

    userProfileService.setup({
      authz: mockAuthz,
      license: licenseMock.create({ allowUserProfileCollaboration: true }),
    });
  });

  afterEach(() => {
    logger.error.mockClear();
  });

  it('should expose correct start contract', () => {
    const startContract = userProfileService.start(mockStartParams);
    expect(startContract).toMatchInlineSnapshot(`
      Object {
        "activate": [Function],
        "bulkGet": [Function],
        "getCurrent": [Function],
        "suggest": [Function],
        "update": [Function],
      }
    `);
  });

  describe('#getCurrent', () => {
    let mockUserProfile: UserProfileWithSecurity;
    let mockRequest: ReturnType<typeof httpServerMock.createKibanaRequest>;
    beforeEach(() => {
      mockRequest = httpServerMock.createKibanaRequest({
        headers: { sid: 'some-cookie' },
      });

      mockUserProfile = userProfileMock.createWithSecurity({
        uid: 'UID',
        user: {
          username: 'user-1',
          full_name: 'full-name-1',
          realm_name: 'some-realm',
          realm_domain: 'some-domain',
          roles: ['role-1'],
        },
      });

      mockStartParams.clusterClient.asInternalUser.security.getUserProfile.mockResolvedValue({
        profiles: [mockUserProfile],
      } as unknown as SecurityGetUserProfileResponse);
    });

    describe(`with session`, () => {
      beforeEach(() => {
        mockStartParams.session.getSID.mockResolvedValue('some-session-id');
      });

      afterEach(() => {
        mockStartParams.session.getSID.mockReset();
      });

      it('returns `null` if session is not available', async () => {
        const startContract = userProfileService.start(mockStartParams);
        await expect(startContract.getCurrent({ request: mockRequest })).resolves.toBeNull();

        expect(mockStartParams.session.get).toHaveBeenCalledTimes(1);
        expect(mockStartParams.session.get).toHaveBeenCalledWith(mockRequest);

        expect(
          mockStartParams.clusterClient.asInternalUser.security.getUserProfile
        ).not.toHaveBeenCalled();

        expect(securityTelemetry.recordGetCurrentProfileInvocation).toHaveBeenLastCalledWith({
          outcome: 'failure',
        });
      });

      it('returns `null` if session available, but not user profile id', async () => {
        mockStartParams.session.get.mockResolvedValue({
          error: null,
          value: sessionMock.createValue({ userProfileId: undefined }),
        });

        const startContract = userProfileService.start(mockStartParams);
        await expect(startContract.getCurrent({ request: mockRequest })).resolves.toBeNull();

        expect(mockStartParams.session.get).toHaveBeenCalledTimes(1);
        expect(mockStartParams.session.get).toHaveBeenCalledWith(mockRequest);

        expect(
          mockStartParams.clusterClient.asInternalUser.security.getUserProfile
        ).not.toHaveBeenCalled();

        expect(securityTelemetry.recordGetCurrentProfileInvocation).toHaveBeenLastCalledWith({
          outcome: 'failure',
        });
      });

      it('fails if session retrieval fails', async () => {
        const failureReason = new errors.ResponseError(
          securityMock.createApiResponse({ statusCode: 500, body: 'some message' })
        );
        mockStartParams.session.get.mockRejectedValue(failureReason);

        const startContract = userProfileService.start(mockStartParams);
        await expect(startContract.getCurrent({ request: mockRequest })).rejects.toBe(
          failureReason
        );

        expect(mockStartParams.session.get).toHaveBeenCalledTimes(1);
        expect(mockStartParams.session.get).toHaveBeenCalledWith(mockRequest);

        expect(
          mockStartParams.clusterClient.asInternalUser.security.getUserProfile
        ).not.toHaveBeenCalled();

        expect(securityTelemetry.recordGetCurrentProfileInvocation).toHaveBeenLastCalledWith({
          outcome: 'failure',
        });
      });

      it('fails if profile retrieval fails', async () => {
        mockStartParams.session.get.mockResolvedValue({
          error: null,
          value: sessionMock.createValue({ userProfileId: mockUserProfile.uid }),
        });

        const failureReason = new errors.ResponseError(
          securityMock.createApiResponse({ statusCode: 500, body: 'some message' })
        );
        mockStartParams.clusterClient.asInternalUser.security.getUserProfile.mockRejectedValue(
          failureReason
        );

        const startContract = userProfileService.start(mockStartParams);
        await expect(startContract.getCurrent({ request: mockRequest })).rejects.toBe(
          failureReason
        );

        expect(mockStartParams.session.get).toHaveBeenCalledTimes(1);
        expect(mockStartParams.session.get).toHaveBeenCalledWith(mockRequest);

        expect(
          mockStartParams.clusterClient.asInternalUser.security.getUserProfile
        ).toHaveBeenCalledTimes(1);
        expect(
          mockStartParams.clusterClient.asInternalUser.security.getUserProfile
        ).toHaveBeenCalledWith({
          uid: 'UID',
        });

        expect(securityTelemetry.recordGetCurrentProfileInvocation).toHaveBeenLastCalledWith({
          outcome: 'failure',
        });
      });

      it('fails if cannot find user profile', async () => {
        mockStartParams.session.get.mockResolvedValue({
          error: null,
          value: sessionMock.createValue({ userProfileId: mockUserProfile.uid }),
        });

        mockStartParams.clusterClient.asInternalUser.security.getUserProfile.mockResolvedValue({
          profiles: [],
        } as unknown as SecurityGetUserProfileResponse);

        const startContract = userProfileService.start(mockStartParams);
        await expect(
          startContract.getCurrent({ request: mockRequest })
        ).rejects.toMatchInlineSnapshot(`[Error: User profile is not found.]`);

        expect(mockStartParams.session.get).toHaveBeenCalledTimes(1);
        expect(mockStartParams.session.get).toHaveBeenCalledWith(mockRequest);

        expect(
          mockStartParams.clusterClient.asInternalUser.security.getUserProfile
        ).toHaveBeenCalledTimes(1);
        expect(
          mockStartParams.clusterClient.asInternalUser.security.getUserProfile
        ).toHaveBeenCalledWith({
          uid: 'UID',
        });

        expect(securityTelemetry.recordGetCurrentProfileInvocation).toHaveBeenLastCalledWith({
          outcome: 'failure',
        });
      });

      it('properly parses returned profile', async () => {
        mockStartParams.session.get.mockResolvedValue({
          error: null,
          value: sessionMock.createValue({ userProfileId: mockUserProfile.uid }),
        });

        const startContract = userProfileService.start(mockStartParams);
        await expect(startContract.getCurrent({ request: mockRequest })).resolves
          .toMatchInlineSnapshot(`
              Object {
                "data": Object {},
                "enabled": true,
                "labels": Object {},
                "uid": "UID",
                "user": Object {
                  "email": undefined,
                  "full_name": "full-name-1",
                  "realm_domain": "some-domain",
                  "realm_name": "some-realm",
                  "roles": Array [
                    "role-1",
                  ],
                  "username": "user-1",
                },
              }
            `);

        expect(mockStartParams.session.get).toHaveBeenCalledTimes(1);
        expect(mockStartParams.session.get).toHaveBeenCalledWith(mockRequest);

        expect(
          mockStartParams.clusterClient.asInternalUser.security.getUserProfile
        ).toHaveBeenCalledTimes(1);
        expect(
          mockStartParams.clusterClient.asInternalUser.security.getUserProfile
        ).toHaveBeenCalledWith({
          uid: 'UID',
        });

        expect(securityTelemetry.recordGetCurrentProfileInvocation).toHaveBeenLastCalledWith({
          outcome: 'success',
        });
      });

      it('should get user profile and application data scoped to Kibana', async () => {
        mockStartParams.session.get.mockResolvedValue({
          error: null,
          value: sessionMock.createValue({ userProfileId: mockUserProfile.uid }),
        });

        mockStartParams.clusterClient.asInternalUser.security.getUserProfile.mockResolvedValue({
          profiles: [
            userProfileMock.createWithSecurity({
              ...mockUserProfile,
              data: { kibana: { avatar: 'fun.gif' }, other_app: { secret: 'data' } },
            }),
          ],
        } as unknown as SecurityGetUserProfileResponse);

        const startContract = userProfileService.start(mockStartParams);
        await expect(startContract.getCurrent({ request: mockRequest, dataPath: 'one,two' }))
          .resolves.toMatchInlineSnapshot(`
              Object {
                "data": Object {
                  "avatar": "fun.gif",
                },
                "enabled": true,
                "labels": Object {},
                "uid": "UID",
                "user": Object {
                  "email": undefined,
                  "full_name": "full-name-1",
                  "realm_domain": "some-domain",
                  "realm_name": "some-realm",
                  "roles": Array [
                    "role-1",
                  ],
                  "username": "user-1",
                },
              }
            `);

        expect(mockStartParams.session.get).toHaveBeenCalledTimes(1);
        expect(mockStartParams.session.get).toHaveBeenCalledWith(mockRequest);

        expect(
          mockStartParams.clusterClient.asInternalUser.security.getUserProfile
        ).toHaveBeenCalledTimes(1);
        expect(
          mockStartParams.clusterClient.asInternalUser.security.getUserProfile
        ).toHaveBeenCalledWith({
          uid: 'UID',
          data: 'kibana.one,kibana.two',
        });

        expect(securityTelemetry.recordGetCurrentProfileInvocation).toHaveBeenLastCalledWith({
          outcome: 'success',
        });
      });
    });

    describe(`with basic authentication`, () => {
      const testUsername = 'some-username';
      const testPassword = 'some-password';
      let mockBasicRequest: ReturnType<typeof httpServerMock.createKibanaRequest>;

      beforeEach(() => {
        mockBasicRequest = httpServerMock.createKibanaRequest({
          headers: {
            authorization: `basic ${Buffer.from(`${testUsername}:${testPassword}`).toString(
              'base64'
            )}`,
          },
        });
      });

      it('fails if profile cannot be activated', async () => {
        const failureReason = new errors.ResponseError(
          securityMock.createApiResponse({ statusCode: 500, body: 'some message' })
        );
        mockStartParams.clusterClient.asInternalUser.security.activateUserProfile.mockRejectedValue(
          failureReason
        );

        const startContract = userProfileService.start(mockStartParams);
        await expect(startContract.getCurrent({ request: mockBasicRequest })).rejects.toBe(
          failureReason
        );

        expect(
          mockStartParams.clusterClient.asInternalUser.security.activateUserProfile
        ).toHaveBeenCalledTimes(1);
        expect(
          mockStartParams.clusterClient.asInternalUser.security.activateUserProfile
        ).toHaveBeenCalledWith({
          grant_type: 'password',
          username: testUsername,
          password: testPassword,
        });

        expect(mockStartParams.session.get).not.toHaveBeenCalled();

        expect(securityTelemetry.recordGetCurrentProfileInvocation).toHaveBeenLastCalledWith({
          outcome: 'failure',
          profileActivationRequired: true,
        });
      });

      it('should get user profile and application data scoped to Kibana', async () => {
        const mockedProfile =
          userProfileMock.createWithSecurity() as unknown as SecurityActivateUserProfileResponse;

        mockStartParams.clusterClient.asInternalUser.security.activateUserProfile.mockResolvedValue(
          mockedProfile
        );

        mockStartParams.clusterClient.asInternalUser.security.getUserProfile.mockResolvedValue({
          profiles: [mockedProfile],
        } as unknown as SecurityGetUserProfileResponse);

        const startContract = userProfileService.start(mockStartParams);
        await expect(startContract.getCurrent({ request: mockBasicRequest, dataPath: 'one,two' }))
          .resolves.toMatchInlineSnapshot(`
              Object {
                "data": Object {},
                "enabled": true,
                "labels": Object {},
                "uid": "some-profile-uid",
                "user": Object {
                  "email": "some@email",
                  "full_name": undefined,
                  "realm_domain": "some-realm-domain",
                  "realm_name": "some-realm",
                  "roles": Array [],
                  "username": "some-username",
                },
              }
            `);

        expect(
          mockStartParams.clusterClient.asInternalUser.security.activateUserProfile
        ).toHaveBeenCalledTimes(1);
        expect(
          mockStartParams.clusterClient.asInternalUser.security.activateUserProfile
        ).toHaveBeenCalledWith({
          grant_type: 'password',
          username: testUsername,
          password: testPassword,
        });

        expect(mockStartParams.session.get).not.toHaveBeenCalled();

        expect(
          mockStartParams.clusterClient.asInternalUser.security.getUserProfile
        ).toHaveBeenCalledTimes(1);
        expect(
          mockStartParams.clusterClient.asInternalUser.security.getUserProfile
        ).toHaveBeenCalledWith({
          uid: mockedProfile.uid,
          data: 'kibana.one,kibana.two',
        });

        expect(securityTelemetry.recordGetCurrentProfileInvocation).toHaveBeenLastCalledWith({
          outcome: 'success',
          profileActivationRequired: true,
        });
      });

      it('returns `null` when es-security-runas-user header is present', async () => {
        (securityTelemetry.recordGetCurrentProfileInvocation as jest.Mock).mockClear();

        const runAsRequest = httpServerMock.createKibanaRequest({
          headers: {
            authorization: `basic ${Buffer.from(`${testUsername}:${testPassword}`).toString(
              'base64'
            )}`,
            'es-security-runas-user': 'effective-user',
          },
        });

        const startContract = userProfileService.start(mockStartParams);
        await expect(startContract.getCurrent({ request: runAsRequest })).resolves.toBeNull();

        expect(
          mockStartParams.clusterClient.asInternalUser.security.activateUserProfile
        ).not.toHaveBeenCalled();
        expect(
          mockStartParams.clusterClient.asInternalUser.security.getUserProfile
        ).not.toHaveBeenCalled();

        expect(securityTelemetry.recordGetCurrentProfileInvocation).not.toHaveBeenCalled();
      });
    });

    describe('with enriched fake request (profile_uid on authenticated user)', () => {
      let enrichedFakeRequest: ReturnType<typeof httpServerMock.createFakeKibanaRequest>;

      beforeEach(() => {
        enrichedFakeRequest = httpServerMock.createFakeKibanaRequest({});
      });

      afterEach(() => {
        logger.warn.mockClear();
      });

      it('resolves the profile directly via profile_uid without session or API key lookup', async () => {
        const mockCurrentUser = securityMock.createMockAuthenticatedUser({
          profile_uid: 'enriched-profile-uid',
        });
        mockStartParams.getCurrentUser.mockReturnValue(mockCurrentUser);

        const startContract = userProfileService.start(mockStartParams);
        await expect(
          startContract.getCurrent({ request: enrichedFakeRequest })
        ).resolves.toMatchObject({
          uid: 'UID',
        });

        expect(
          mockStartParams.clusterClient.asInternalUser.security.getUserProfile
        ).toHaveBeenCalledWith({ uid: 'enriched-profile-uid', data: undefined });
        expect(mockStartParams.session.getSID).not.toHaveBeenCalled();

        expect(securityTelemetry.recordGetCurrentProfileInvocation).toHaveBeenLastCalledWith({
          outcome: 'success',
          fakeRequestProfileResolution: true,
        });
      });

      it('passes dataPath when resolving profile via profile_uid', async () => {
        const mockCurrentUser = securityMock.createMockAuthenticatedUser({
          profile_uid: 'enriched-profile-uid',
        });
        mockStartParams.getCurrentUser.mockReturnValue(mockCurrentUser);

        const startContract = userProfileService.start(mockStartParams);
        await expect(
          startContract.getCurrent({ request: enrichedFakeRequest, dataPath: 'some.path' })
        ).resolves.toMatchObject({ uid: 'UID' });

        expect(
          mockStartParams.clusterClient.asInternalUser.security.getUserProfile
        ).toHaveBeenCalledWith({
          uid: 'enriched-profile-uid',
          data: 'kibana.some.path',
        });

        expect(securityTelemetry.recordGetCurrentProfileInvocation).toHaveBeenLastCalledWith({
          outcome: 'success',
          fakeRequestProfileResolution: true,
        });
      });

      it('skips the fast path (without warning) when the fake request has no profile_uid on the current user', async () => {
        mockStartParams.getCurrentUser.mockReturnValue(
          securityMock.createMockAuthenticatedUser({ profile_uid: undefined })
        );

        const authenticatedEnrichedFakeRequest = kibanaRequestFactory({
          headers: {},
          path: '/',
          auth: { isAuthenticated: true },
        } as FakeRawRequest);

        mockStartParams.session.getSID.mockResolvedValue('some-session-id');
        mockStartParams.session.get.mockResolvedValue({
          error: null,
          value: sessionMock.createValue({ userProfileId: mockUserProfile.uid }),
        });

        const startContract = userProfileService.start(mockStartParams);
        await expect(
          startContract.getCurrent({ request: authenticatedEnrichedFakeRequest })
        ).resolves.toMatchObject({ uid: 'UID' });

        expect(logger.warn).not.toHaveBeenCalled();
        expect(mockStartParams.session.getSID).toHaveBeenCalled();
      });

      it('surfaces the error when the enriched profile_uid is not found in Elasticsearch', async () => {
        const mockCurrentUser = securityMock.createMockAuthenticatedUser({
          profile_uid: 'missing-uid',
        });
        mockStartParams.getCurrentUser.mockReturnValue(mockCurrentUser);
        mockStartParams.clusterClient.asInternalUser.security.getUserProfile.mockResolvedValue({
          profiles: [],
        } as unknown as SecurityGetUserProfileResponse);

        const startContract = userProfileService.start(mockStartParams);
        await expect(
          startContract.getCurrent({ request: enrichedFakeRequest })
        ).rejects.toThrowError(/User profile is not found/);

        expect(
          mockStartParams.clusterClient.asInternalUser.security.getUserProfile
        ).toHaveBeenCalledWith({ uid: 'missing-uid', data: undefined });
        expect(mockStartParams.session.getSID).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('[fake=true]'));
        expect(securityTelemetry.recordGetCurrentProfileInvocation).toHaveBeenLastCalledWith({
          outcome: 'failure',
          fakeRequestProfileResolution: true,
        });
      });

      it('surfaces the error when the cluster getUserProfile call rejects on a fake-request lookup', async () => {
        const mockCurrentUser = securityMock.createMockAuthenticatedUser({
          profile_uid: 'enriched-profile-uid',
        });
        mockStartParams.getCurrentUser.mockReturnValue(mockCurrentUser);
        mockStartParams.clusterClient.asInternalUser.security.getUserProfile.mockRejectedValueOnce(
          new Error('boom')
        );

        const startContract = userProfileService.start(mockStartParams);
        await expect(
          startContract.getCurrent({ request: enrichedFakeRequest })
        ).rejects.toThrowError(/boom/);

        expect(mockStartParams.session.getSID).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('[fake=true]'));
        expect(securityTelemetry.recordGetCurrentProfileInvocation).toHaveBeenLastCalledWith({
          outcome: 'failure',
          fakeRequestProfileResolution: true,
        });
      });
    });

    it('does not use the profile_uid fast path for real requests (uses session / API key resolution instead)', async () => {
      const mockCurrentUser = securityMock.createMockAuthenticatedUser({
        profile_uid: 'enriched-profile-uid',
      });
      mockStartParams.getCurrentUser.mockReturnValue(mockCurrentUser);
      mockStartParams.session.getSID.mockResolvedValue('some-session-id');
      mockStartParams.session.get.mockResolvedValue({
        error: null,
        value: sessionMock.createValue({ userProfileId: mockUserProfile.uid }),
      });

      const startContract = userProfileService.start(mockStartParams);
      await expect(startContract.getCurrent({ request: mockRequest })).resolves.toMatchObject({
        uid: 'UID',
      });

      expect(
        mockStartParams.clusterClient.asInternalUser.security.getUserProfile
      ).toHaveBeenCalledTimes(1);
      expect(
        mockStartParams.clusterClient.asInternalUser.security.getUserProfile
      ).toHaveBeenCalledWith({ uid: 'UID', data: undefined });
      expect(
        mockStartParams.clusterClient.asInternalUser.security.getUserProfile
      ).not.toHaveBeenCalledWith(expect.objectContaining({ uid: 'enriched-profile-uid' }));

      expect(securityTelemetry.recordGetCurrentProfileInvocation).toHaveBeenLastCalledWith({
        outcome: 'success',
      });
    });

    describe(`with api key`, () => {
      const testApiKeyValue = 'some-api-key-value';
      const testApiKeyId = 'some-api-key-id';
      const testEncodedApiKey = Buffer.from(`${testApiKeyId}:${testApiKeyValue}`).toString(
        'base64'
      );
      let mockApiKeyRequest: ReturnType<typeof httpServerMock.createKibanaRequest>;

      beforeEach(() => {
        mockApiKeyRequest = httpServerMock.createKibanaRequest({
          headers: { authorization: `apikey ${testEncodedApiKey}` },
        });
      });

      it('returns `null` if api key retrieval fails (e.g. forbidden)', async () => {
        const failureReason = new errors.ResponseError(
          securityMock.createApiResponse({ statusCode: 500, body: 'some message' })
        );
        mockStartParams.clusterClient
          .asScoped()
          .asCurrentUser.security.getApiKey.mockRejectedValue(failureReason);

        const startContract = userProfileService.start(mockStartParams);
        await expect(startContract.getCurrent({ request: mockApiKeyRequest })).resolves.toBeNull();

        expect(
          mockStartParams.clusterClient.asScoped().asCurrentUser.security.getApiKey
        ).toHaveBeenCalledTimes(1);
        expect(
          mockStartParams.clusterClient.asScoped().asCurrentUser.security.getApiKey
        ).toHaveBeenCalledWith({
          with_profile_uid: true,
          id: testApiKeyId,
        });

        expect(
          mockStartParams.clusterClient.asInternalUser.security.activateUserProfile
        ).not.toHaveBeenCalled();
        expect(mockStartParams.session.get).not.toHaveBeenCalled();

        expect(securityTelemetry.recordGetCurrentProfileInvocation).toHaveBeenLastCalledWith({
          outcome: 'failure',
          apiKeyRetrievalRequired: true,
        });
      });

      it('returns `null` if api key is not found', async () => {
        mockStartParams.clusterClient
          .asScoped()
          .asCurrentUser.security.getApiKey.mockResolvedValue({
            api_keys: [], // no API keys in response
          } as any);

        const startContract = userProfileService.start(mockStartParams);
        await expect(startContract.getCurrent({ request: mockApiKeyRequest })).resolves.toBeNull();

        expect(
          mockStartParams.clusterClient.asScoped().asCurrentUser.security.getApiKey
        ).toHaveBeenCalledTimes(1);
        expect(mockStartParams.clusterClient.asScoped).toHaveBeenCalled();
        expect(mockStartParams.clusterClient.asScoped).toBeCalledWith(mockApiKeyRequest);
        expect(
          mockStartParams.clusterClient.asScoped().asCurrentUser.security.getApiKey
        ).toHaveBeenCalledWith({
          with_profile_uid: true,
          id: testApiKeyId,
        });

        expect(
          mockStartParams.clusterClient.asInternalUser.security.activateUserProfile
        ).not.toHaveBeenCalled();
        expect(mockStartParams.session.get).not.toHaveBeenCalled();

        expect(securityTelemetry.recordGetCurrentProfileInvocation).toHaveBeenLastCalledWith({
          outcome: 'failure',
          apiKeyRetrievalRequired: true,
        });
      });

      it('returns `null` if api key is found, but has no associated user profile id', async () => {
        mockStartParams.clusterClient
          .asScoped()
          .asCurrentUser.security.getApiKey.mockResolvedValue({
            api_keys: [
              {
                profile_uid: undefined, // no profile ID in response
              },
            ],
          } as any);

        const startContract = userProfileService.start(mockStartParams);
        await expect(startContract.getCurrent({ request: mockApiKeyRequest })).resolves.toBeNull();

        expect(
          mockStartParams.clusterClient.asScoped().asCurrentUser.security.getApiKey
        ).toHaveBeenCalledTimes(1);
        expect(mockStartParams.clusterClient.asScoped).toHaveBeenCalled();
        expect(mockStartParams.clusterClient.asScoped).toBeCalledWith(mockApiKeyRequest);
        expect(
          mockStartParams.clusterClient.asScoped().asCurrentUser.security.getApiKey
        ).toHaveBeenCalledWith({
          with_profile_uid: true,
          id: testApiKeyId,
        });

        expect(
          mockStartParams.clusterClient.asInternalUser.security.activateUserProfile
        ).not.toHaveBeenCalled();
        expect(mockStartParams.session.get).not.toHaveBeenCalled();

        expect(securityTelemetry.recordGetCurrentProfileInvocation).toHaveBeenLastCalledWith({
          outcome: 'failure',
          apiKeyRetrievalRequired: true,
        });
      });

      it('returns `null` when es-security-runas-user header is present', async () => {
        (securityTelemetry.recordGetCurrentProfileInvocation as jest.Mock).mockClear();

        const runAsRequest = httpServerMock.createKibanaRequest({
          headers: {
            authorization: `apikey ${testEncodedApiKey}`,
            'es-security-runas-user': 'effective-user',
          },
        });

        const startContract = userProfileService.start(mockStartParams);
        await expect(startContract.getCurrent({ request: runAsRequest })).resolves.toBeNull();

        expect(
          mockStartParams.clusterClient.asScoped().asCurrentUser.security.getApiKey
        ).not.toHaveBeenCalled();
        expect(
          mockStartParams.clusterClient.asInternalUser.security.getUserProfile
        ).not.toHaveBeenCalled();

        expect(securityTelemetry.recordGetCurrentProfileInvocation).not.toHaveBeenCalled();
      });

      it('should get user profile and application data scoped to Kibana', async () => {
        mockStartParams.clusterClient
          .asScoped()
          .asCurrentUser.security.getApiKey.mockResolvedValue({
            api_keys: [
              {
                profile_uid: 'UID',
              },
            ],
          } as any);

        mockStartParams.clusterClient.asInternalUser.security.getUserProfile.mockResolvedValue({
          profiles: [
            userProfileMock.createWithSecurity({
              ...mockUserProfile,
              data: { kibana: { avatar: 'fun.gif' }, other_app: { secret: 'data' } },
            }),
          ],
        } as unknown as SecurityGetUserProfileResponse);

        const startContract = userProfileService.start(mockStartParams);
        await expect(startContract.getCurrent({ request: mockApiKeyRequest, dataPath: 'one,two' }))
          .resolves.toMatchInlineSnapshot(`
              Object {
                "data": Object {
                  "avatar": "fun.gif",
                },
                "enabled": true,
                "labels": Object {},
                "uid": "UID",
                "user": Object {
                  "email": undefined,
                  "full_name": "full-name-1",
                  "realm_domain": "some-domain",
                  "realm_name": "some-realm",
                  "roles": Array [
                    "role-1",
                  ],
                  "username": "user-1",
                },
              }
            `);

        expect(
          mockStartParams.clusterClient.asScoped().asCurrentUser.security.getApiKey
        ).toHaveBeenCalledTimes(1);
        expect(mockStartParams.clusterClient.asScoped).toHaveBeenCalled();
        expect(mockStartParams.clusterClient.asScoped).toBeCalledWith(mockApiKeyRequest);
        expect(
          mockStartParams.clusterClient.asScoped().asCurrentUser.security.getApiKey
        ).toHaveBeenCalledWith({
          with_profile_uid: true,
          id: testApiKeyId,
        });

        expect(
          mockStartParams.clusterClient.asInternalUser.security.getUserProfile
        ).toHaveBeenCalledTimes(1);
        expect(
          mockStartParams.clusterClient.asInternalUser.security.getUserProfile
        ).toHaveBeenCalledWith({
          uid: 'UID',
          data: 'kibana.one,kibana.two',
        });

        expect(
          mockStartParams.clusterClient.asInternalUser.security.activateUserProfile
        ).not.toHaveBeenCalled();
        expect(mockStartParams.session.get).not.toHaveBeenCalled();

        expect(securityTelemetry.recordGetCurrentProfileInvocation).toHaveBeenLastCalledWith({
          outcome: 'success',
          apiKeyRetrievalRequired: true,
        });
      });
    });

    describe(`when security is disabled`, () => {
      beforeEach(() => {
        userProfileService = new UserProfileService(logger);
        const license = licenseMock.create({ allowUserProfileCollaboration: true });
        license.isEnabled.mockReturnValue(false);
        userProfileService.setup({ authz: mockAuthz, license });
      });

      it('returns `null` for basic auth requests without calling any ES APIs or recording telemetry', async () => {
        (securityTelemetry.recordGetCurrentProfileInvocation as jest.Mock).mockClear();

        const request = httpServerMock.createKibanaRequest({
          headers: {
            authorization: `basic ${Buffer.from('user:pass').toString('base64')}`,
          },
        });

        const startContract = userProfileService.start(mockStartParams);
        await expect(startContract.getCurrent({ request })).resolves.toBeNull();

        expect(
          mockStartParams.clusterClient.asInternalUser.security.activateUserProfile
        ).not.toHaveBeenCalled();
        expect(
          mockStartParams.clusterClient.asInternalUser.security.getUserProfile
        ).not.toHaveBeenCalled();
        expect(securityTelemetry.recordGetCurrentProfileInvocation).not.toHaveBeenCalled();
      });

      it('returns `null` for API key requests without calling any ES APIs or recording telemetry', async () => {
        (securityTelemetry.recordGetCurrentProfileInvocation as jest.Mock).mockClear();

        const testApiKeyId = 'some-api-key-id';
        const testApiKeyValue = 'some-api-key-value';
        const request = httpServerMock.createKibanaRequest({
          headers: {
            authorization: `apikey ${Buffer.from(`${testApiKeyId}:${testApiKeyValue}`).toString(
              'base64'
            )}`,
          },
        });

        const startContract = userProfileService.start(mockStartParams);
        await expect(startContract.getCurrent({ request })).resolves.toBeNull();

        expect(
          mockStartParams.clusterClient.asScoped().asCurrentUser.security.getApiKey
        ).not.toHaveBeenCalled();
        expect(
          mockStartParams.clusterClient.asInternalUser.security.getUserProfile
        ).not.toHaveBeenCalled();
        expect(securityTelemetry.recordGetCurrentProfileInvocation).not.toHaveBeenCalled();
      });

      it('returns `null` for session-authenticated requests without calling any ES APIs or recording telemetry', async () => {
        (securityTelemetry.recordGetCurrentProfileInvocation as jest.Mock).mockClear();
        mockStartParams.session.getSID.mockResolvedValue('some-session-id');

        const startContract = userProfileService.start(mockStartParams);
        await expect(startContract.getCurrent({ request: mockRequest })).resolves.toBeNull();

        expect(mockStartParams.session.getSID).not.toHaveBeenCalled();
        expect(mockStartParams.session.get).not.toHaveBeenCalled();
        expect(
          mockStartParams.clusterClient.asInternalUser.security.getUserProfile
        ).not.toHaveBeenCalled();
        expect(securityTelemetry.recordGetCurrentProfileInvocation).not.toHaveBeenCalled();
      });

      it('returns `null` for requests with runas header without calling any ES APIs or recording telemetry', async () => {
        (securityTelemetry.recordGetCurrentProfileInvocation as jest.Mock).mockClear();

        const request = httpServerMock.createKibanaRequest({
          headers: { 'es-security-runas-user': 'some-user' },
        });

        const startContract = userProfileService.start(mockStartParams);
        await expect(startContract.getCurrent({ request })).resolves.toBeNull();

        expect(mockStartParams.session.getSID).not.toHaveBeenCalled();
        expect(
          mockStartParams.clusterClient.asInternalUser.security.activateUserProfile
        ).not.toHaveBeenCalled();
        expect(
          mockStartParams.clusterClient.asInternalUser.security.getUserProfile
        ).not.toHaveBeenCalled();
        expect(securityTelemetry.recordGetCurrentProfileInvocation).not.toHaveBeenCalled();
      });
    });
  });

  describe('#update', () => {
    it('should update application data scoped to Kibana', async () => {
      const startContract = userProfileService.start(mockStartParams);
      await startContract.update('UID', {
        avatar: {
          imageUrl: 'boring.png',
        },
      });
      expect(
        mockStartParams.clusterClient.asInternalUser.security.updateUserProfileData
      ).toHaveBeenCalledWith({
        uid: 'UID',
        data: {
          kibana: {
            avatar: {
              imageUrl: 'boring.png',
            },
          },
        },
      });
    });

    it('should handle errors when update user profile fails', async () => {
      mockStartParams.clusterClient.asInternalUser.security.updateUserProfileData.mockRejectedValue(
        new Error('Fail')
      );
      const startContract = userProfileService.start(mockStartParams);
      await expect(
        startContract.update('UID', {
          avatar: {
            imageUrl: 'boring.png',
          },
        })
      ).rejects.toMatchInlineSnapshot(`[Error: Fail]`);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('#activate', () => {
    beforeEach(() => {
      mockStartParams.clusterClient.asInternalUser.security.activateUserProfile.mockResolvedValue(
        userProfileMock.createWithSecurity() as unknown as SecurityActivateUserProfileResponse
      );
    });

    it('should activate user profile with password grant', async () => {
      const startContract = userProfileService.start(mockStartParams);
      await expect(
        startContract.activate({
          type: 'password',
          username: 'some-username',
          password: 'password',
        })
      ).resolves.toMatchInlineSnapshot(`
              Object {
                "data": Object {},
                "enabled": true,
                "labels": Object {},
                "uid": "some-profile-uid",
                "user": Object {
                  "email": "some@email",
                  "full_name": undefined,
                  "realm_domain": "some-realm-domain",
                  "realm_name": "some-realm",
                  "roles": Array [],
                  "username": "some-username",
                },
              }
            `);
      expect(
        mockStartParams.clusterClient.asInternalUser.security.activateUserProfile
      ).toHaveBeenCalledTimes(1);
      expect(
        mockStartParams.clusterClient.asInternalUser.security.activateUserProfile
      ).toHaveBeenCalledWith({
        grant_type: 'password',
        password: 'password',
        username: 'some-username',
      });
    });

    it('should activate user profile with access token grant', async () => {
      const startContract = userProfileService.start(mockStartParams);
      await expect(startContract.activate({ type: 'accessToken', accessToken: 'some-token' }))
        .resolves.toMatchInlineSnapshot(`
              Object {
                "data": Object {},
                "enabled": true,
                "labels": Object {},
                "uid": "some-profile-uid",
                "user": Object {
                  "email": "some@email",
                  "full_name": undefined,
                  "realm_domain": "some-realm-domain",
                  "realm_name": "some-realm",
                  "roles": Array [],
                  "username": "some-username",
                },
              }
            `);
      expect(
        mockStartParams.clusterClient.asInternalUser.security.activateUserProfile
      ).toHaveBeenCalledTimes(1);
      expect(
        mockStartParams.clusterClient.asInternalUser.security.activateUserProfile
      ).toHaveBeenCalledWith({ grant_type: 'access_token', access_token: 'some-token' });
    });

    it('should activate user profile with UIAM access token grant', async () => {
      const startContract = userProfileService.start(mockStartParams);
      await expect(
        startContract.activate({
          type: 'uiamAccessToken',
          accessToken: 'some-token',
          clientAuthentication: { scheme: 'SharedSecret', value: 'some-shared-secret' },
        })
      ).resolves.toMatchInlineSnapshot(`
        Object {
          "data": Object {},
          "enabled": true,
          "labels": Object {},
          "uid": "some-profile-uid",
          "user": Object {
            "email": "some@email",
            "full_name": undefined,
            "realm_domain": "some-realm-domain",
            "realm_name": "some-realm",
            "roles": Array [],
            "username": "some-username",
          },
        }
      `);
      expect(
        mockStartParams.clusterClient.asInternalUser.security.activateUserProfile
      ).toHaveBeenCalledTimes(1);
      expect(
        mockStartParams.clusterClient.asInternalUser.security.activateUserProfile
      ).toHaveBeenCalledWith({
        grant_type: 'access_token',
        access_token: 'some-token',
        client_authentication: { scheme: 'SharedSecret', value: 'some-shared-secret' },
      });
    });

    it('fails if activation fails with non-409 error', async () => {
      const failureReason = new errors.ResponseError(
        securityMock.createApiResponse({ statusCode: 500, body: 'some message' })
      );
      mockStartParams.clusterClient.asInternalUser.security.activateUserProfile.mockRejectedValue(
        failureReason
      );

      const startContract = userProfileService.start(mockStartParams);
      await expect(
        startContract.activate({ type: 'accessToken', accessToken: 'some-token' })
      ).rejects.toBe(failureReason);
      expect(
        mockStartParams.clusterClient.asInternalUser.security.activateUserProfile
      ).toHaveBeenCalledTimes(1);
      expect(
        mockStartParams.clusterClient.asInternalUser.security.activateUserProfile
      ).toHaveBeenCalledWith({ grant_type: 'access_token', access_token: 'some-token' });
    });

    it('retries activation if initially fails with 409 error', async () => {
      jest.useFakeTimers({ legacyFakeTimers: true });

      const failureReason = new errors.ResponseError(
        securityMock.createApiResponse({ statusCode: 409, body: 'some message' })
      );
      mockStartParams.clusterClient.asInternalUser.security.activateUserProfile
        .mockRejectedValueOnce(failureReason)
        .mockResolvedValueOnce(
          userProfileMock.createWithSecurity() as unknown as SecurityActivateUserProfileResponse
        );

      const startContract = userProfileService.start(mockStartParams);
      const activatePromise = startContract.activate({
        type: 'accessToken',
        accessToken: 'some-token',
      });
      await nextTick();
      jest.runAllTimers();

      await expect(activatePromise).resolves.toMatchInlineSnapshot(`
              Object {
                "data": Object {},
                "enabled": true,
                "labels": Object {},
                "uid": "some-profile-uid",
                "user": Object {
                  "email": "some@email",
                  "full_name": undefined,
                  "realm_domain": "some-realm-domain",
                  "realm_name": "some-realm",
                  "roles": Array [],
                  "username": "some-username",
                },
              }
            `);
      expect(
        mockStartParams.clusterClient.asInternalUser.security.activateUserProfile
      ).toHaveBeenCalledTimes(2);
      expect(
        mockStartParams.clusterClient.asInternalUser.security.activateUserProfile
      ).toHaveBeenCalledWith({ grant_type: 'access_token', access_token: 'some-token' });
    });

    it('fails if activation max retries exceeded', async () => {
      jest.useFakeTimers({ legacyFakeTimers: true });

      const failureReason = new errors.ResponseError(
        securityMock.createApiResponse({ statusCode: 409, body: 'some message' })
      );
      mockStartParams.clusterClient.asInternalUser.security.activateUserProfile.mockRejectedValue(
        failureReason
      );

      const startContract = userProfileService.start(mockStartParams);

      // Initial activation attempt.
      const activatePromise = startContract.activate({
        type: 'accessToken',
        accessToken: 'some-token',
      });

      // Re-try 9 more times.
      for (const _ of Array.from({ length: 9 })) {
        await nextTick();
        jest.runAllTimers();
      }

      await expect(activatePromise).rejects.toBe(failureReason);
      expect(
        mockStartParams.clusterClient.asInternalUser.security.activateUserProfile
      ).toHaveBeenCalledTimes(10);
      expect(
        mockStartParams.clusterClient.asInternalUser.security.activateUserProfile
      ).toHaveBeenCalledWith({ grant_type: 'access_token', access_token: 'some-token' });
    });

    it('retries activation if initially fails with 503 error', async () => {
      jest.useFakeTimers({ legacyFakeTimers: true });

      const failureReason = new errors.ResponseError(
        securityMock.createApiResponse({ statusCode: 503, body: 'some message' })
      );
      mockStartParams.clusterClient.asInternalUser.security.activateUserProfile
        .mockRejectedValueOnce(failureReason)
        .mockResolvedValueOnce(
          userProfileMock.createWithSecurity() as unknown as SecurityActivateUserProfileResponse
        );

      const startContract = userProfileService.start(mockStartParams);
      const activatePromise = startContract.activate({
        type: 'accessToken',
        accessToken: 'some-token',
      });
      await nextTick();
      jest.runAllTimers();

      await expect(activatePromise).resolves.toMatchInlineSnapshot(`
              Object {
                "data": Object {},
                "enabled": true,
                "labels": Object {},
                "uid": "some-profile-uid",
                "user": Object {
                  "email": "some@email",
                  "full_name": undefined,
                  "realm_domain": "some-realm-domain",
                  "realm_name": "some-realm",
                  "roles": Array [],
                  "username": "some-username",
                },
              }
            `);
      expect(
        mockStartParams.clusterClient.asInternalUser.security.activateUserProfile
      ).toHaveBeenCalledTimes(2);
      expect(
        mockStartParams.clusterClient.asInternalUser.security.activateUserProfile
      ).toHaveBeenCalledWith({ grant_type: 'access_token', access_token: 'some-token' });
    });

    it('fails if activation with 503 error exceeds max retries', async () => {
      jest.useFakeTimers({ legacyFakeTimers: true });

      const failureReason = new errors.ResponseError(
        securityMock.createApiResponse({ statusCode: 503, body: 'service unavailable' })
      );
      mockStartParams.clusterClient.asInternalUser.security.activateUserProfile.mockRejectedValue(
        failureReason
      );

      const startContract = userProfileService.start(mockStartParams);

      // Initial activation attempt.
      const activatePromise = startContract.activate({
        type: 'accessToken',
        accessToken: 'some-token',
      });

      // Re-try 9 more times.
      for (const _ of Array.from({ length: 9 })) {
        await nextTick();
        jest.runAllTimers();
      }

      await expect(activatePromise).rejects.toBe(failureReason);
      expect(
        mockStartParams.clusterClient.asInternalUser.security.activateUserProfile
      ).toHaveBeenCalledTimes(10);
      expect(
        mockStartParams.clusterClient.asInternalUser.security.activateUserProfile
      ).toHaveBeenCalledWith({ grant_type: 'access_token', access_token: 'some-token' });
    });

    it('retries activation if fails with both 409 and 503 errors', async () => {
      jest.useFakeTimers({ legacyFakeTimers: true });

      const conflict409 = new errors.ResponseError(
        securityMock.createApiResponse({ statusCode: 409, body: 'conflict' })
      );
      const serviceUnavailable503 = new errors.ResponseError(
        securityMock.createApiResponse({ statusCode: 503, body: 'service unavailable' })
      );
      mockStartParams.clusterClient.asInternalUser.security.activateUserProfile
        .mockRejectedValueOnce(conflict409)
        .mockRejectedValueOnce(serviceUnavailable503)
        .mockResolvedValueOnce(
          userProfileMock.createWithSecurity() as unknown as SecurityActivateUserProfileResponse
        );

      const startContract = userProfileService.start(mockStartParams);
      const activatePromise = startContract.activate({
        type: 'accessToken',
        accessToken: 'some-token',
      });

      // Wait for first retry (409)
      await nextTick();
      jest.runAllTimers();

      // Wait for second retry (503)
      await nextTick();
      jest.runAllTimers();

      await expect(activatePromise).resolves.toMatchInlineSnapshot(`
              Object {
                "data": Object {},
                "enabled": true,
                "labels": Object {},
                "uid": "some-profile-uid",
                "user": Object {
                  "email": "some@email",
                  "full_name": undefined,
                  "realm_domain": "some-realm-domain",
                  "realm_name": "some-realm",
                  "roles": Array [],
                  "username": "some-username",
                },
              }
            `);
      expect(
        mockStartParams.clusterClient.asInternalUser.security.activateUserProfile
      ).toHaveBeenCalledTimes(3);
      expect(
        mockStartParams.clusterClient.asInternalUser.security.activateUserProfile
      ).toHaveBeenCalledWith({ grant_type: 'access_token', access_token: 'some-token' });
    });
  });

  describe('#bulkGet', () => {
    it('properly parses and sorts returned profiles', async () => {
      mockStartParams.clusterClient.asInternalUser.security.getUserProfile.mockResolvedValue({
        profiles: [
          userProfileMock.createWithSecurity({
            uid: 'UID-1',
            user: {
              username: 'user-1',
              full_name: 'full-name-1',
              realm_name: 'some-realm',
              realm_domain: 'some-domain',
              roles: ['role-1'],
            },
          }),
          userProfileMock.createWithSecurity({
            uid: 'UID-2',
            user: {
              username: 'user-2',
              full_name: 'full-name-2',
              realm_name: 'some-realm',
              realm_domain: 'some-domain',
              roles: ['role-2'],
            },
          }),
        ],
      } as unknown as SecurityGetUserProfileResponse);

      const startContract = userProfileService.start(mockStartParams);
      await expect(startContract.bulkGet({ uids: new Set(['UID-1', 'UID-2']) })).resolves
        .toMatchInlineSnapshot(`
                        Array [
                          Object {
                            "data": Object {},
                            "enabled": true,
                            "uid": "UID-1",
                            "user": Object {
                              "email": undefined,
                              "full_name": "full-name-1",
                              "username": "user-1",
                            },
                          },
                          Object {
                            "data": Object {},
                            "enabled": true,
                            "uid": "UID-2",
                            "user": Object {
                              "email": undefined,
                              "full_name": "full-name-2",
                              "username": "user-2",
                            },
                          },
                        ]
                    `);
      expect(
        mockStartParams.clusterClient.asInternalUser.security.getUserProfile
      ).toHaveBeenCalledTimes(1);
      expect(
        mockStartParams.clusterClient.asInternalUser.security.getUserProfile
      ).toHaveBeenCalledWith({
        uid: 'UID-1,UID-2',
      });
    });

    it('should request data if data path is specified', async () => {
      mockStartParams.clusterClient.asInternalUser.security.getUserProfile.mockResolvedValue({
        profiles: [
          userProfileMock.createWithSecurity({
            uid: 'UID-1',
            data: { some: 'data', kibana: { some: 'kibana-data' } },
          }),
        ],
      } as unknown as SecurityGetUserProfileResponse);

      const startContract = userProfileService.start(mockStartParams);
      await expect(startContract.bulkGet({ uids: new Set(['UID-1']), dataPath: 'one,two' }))
        .resolves.toMatchInlineSnapshot(`
              Array [
                Object {
                  "data": Object {
                    "some": "kibana-data",
                  },
                  "enabled": true,
                  "uid": "UID-1",
                  "user": Object {
                    "email": "some@email",
                    "full_name": undefined,
                    "username": "some-username",
                  },
                },
              ]
            `);
      expect(
        mockStartParams.clusterClient.asInternalUser.security.getUserProfile
      ).toHaveBeenCalledTimes(1);
      expect(
        mockStartParams.clusterClient.asInternalUser.security.getUserProfile
      ).toHaveBeenCalledWith({
        uid: 'UID-1',
        data: 'kibana.one,kibana.two',
      });
    });

    it('fails if Elasticsearch returns error', async () => {
      const failureReason = new errors.ResponseError(
        securityMock.createApiResponse({ statusCode: 500, body: 'some message' })
      );
      mockStartParams.clusterClient.asInternalUser.security.getUserProfile.mockRejectedValue(
        failureReason
      );

      const startContract = userProfileService.start(mockStartParams);
      await expect(startContract.bulkGet({ uids: new Set(['UID-1', 'UID-2']) })).rejects.toBe(
        failureReason
      );
      expect(
        mockStartParams.clusterClient.asInternalUser.security.getUserProfile
      ).toHaveBeenCalledTimes(1);
      expect(
        mockStartParams.clusterClient.asInternalUser.security.getUserProfile
      ).toHaveBeenCalledWith({
        uid: 'UID-1,UID-2',
      });
    });

    it('splits large requests into batches with concurrency control', async () => {
      // Create 75 UIDs to trigger batching (should create 2 batches: 50 + 25)
      const uids = Array.from({ length: 75 }, (_, i) => `UID-${i + 1}`);

      // Mock the first batch (UIDs 1-50)
      const firstBatchProfiles = Array.from({ length: 50 }, (_, i) =>
        userProfileMock.createWithSecurity({
          uid: `UID-${i + 1}`,
          user: {
            username: `user-${i + 1}`,
            full_name: `full-name-${i + 1}`,
            realm_name: 'some-realm',
            realm_domain: 'some-domain',
            roles: ['role-1'],
          },
        })
      );

      // Mock the second batch (UIDs 51-75)
      const secondBatchProfiles = Array.from({ length: 25 }, (_, i) =>
        userProfileMock.createWithSecurity({
          uid: `UID-${i + 51}`,
          user: {
            username: `user-${i + 51}`,
            full_name: `full-name-${i + 51}`,
            realm_name: 'some-realm',
            realm_domain: 'some-domain',
            roles: ['role-1'],
          },
        })
      );

      // Mock getUserProfile to return different responses based on the UID string
      mockStartParams.clusterClient.asInternalUser.security.getUserProfile
        .mockImplementationOnce(() => Promise.resolve({ profiles: firstBatchProfiles } as any))
        .mockImplementationOnce(() => Promise.resolve({ profiles: secondBatchProfiles } as any));

      const startContract = userProfileService.start(mockStartParams);
      const result = await startContract.bulkGet({ uids: new Set(uids) });

      // Verify that getUserProfile was called twice (once for each batch)
      expect(
        mockStartParams.clusterClient.asInternalUser.security.getUserProfile
      ).toHaveBeenCalledTimes(2);

      // Verify the first batch call (UIDs 1-50)
      expect(
        mockStartParams.clusterClient.asInternalUser.security.getUserProfile
      ).toHaveBeenNthCalledWith(1, {
        uid: uids.slice(0, 50).join(','),
      });

      // Verify the second batch call (UIDs 51-75)
      expect(
        mockStartParams.clusterClient.asInternalUser.security.getUserProfile
      ).toHaveBeenNthCalledWith(2, {
        uid: uids.slice(50, 75).join(','),
      });

      // Verify all 75 profiles are returned
      expect(result).toHaveLength(75);

      // Verify the results contain profiles from both batches
      expect(result[0].uid).toBe('UID-1');
      expect(result[49].uid).toBe('UID-50');
      expect(result[50].uid).toBe('UID-51');
      expect(result[74].uid).toBe('UID-75');
    });

    it('handles single batch requests efficiently when at batch limit', async () => {
      // Test with exactly 50 UIDs (should not trigger batching)
      const uids = Array.from({ length: 50 }, (_, i) => `UID-${i + 1}`);
      const profiles = uids.map((uid, i) =>
        userProfileMock.createWithSecurity({
          uid,
          user: {
            username: `user-${i + 1}`,
            full_name: `full-name-${i + 1}`,
            realm_name: 'some-realm',
            realm_domain: 'some-domain',
            roles: ['role-1'],
          },
        })
      );

      mockStartParams.clusterClient.asInternalUser.security.getUserProfile.mockResolvedValue({
        profiles,
      } as unknown as SecurityGetUserProfileResponse);

      const startContract = userProfileService.start(mockStartParams);
      const result = await startContract.bulkGet({ uids: new Set(uids) });

      // Verify that getUserProfile was called only once
      expect(
        mockStartParams.clusterClient.asInternalUser.security.getUserProfile
      ).toHaveBeenCalledTimes(1);

      // Verify the single call contains all 50 UIDs
      expect(
        mockStartParams.clusterClient.asInternalUser.security.getUserProfile
      ).toHaveBeenCalledWith({
        uid: uids.join(','),
      });

      // Verify all 50 profiles are returned
      expect(result).toHaveLength(50);
    });

    it('handles errors during batched requests', async () => {
      // Create 75 UIDs to trigger batching (should create 2 batches: 50 + 25)
      const uids = Array.from({ length: 75 }, (_, i) => `UID-${i + 1}`);

      const failureReason = new errors.ResponseError(
        securityMock.createApiResponse({ statusCode: 500, body: 'batch request failed' })
      );

      // Mock the first batch to succeed and second batch to fail
      mockStartParams.clusterClient.asInternalUser.security.getUserProfile
        .mockImplementationOnce(() => Promise.resolve({ profiles: [] } as any))
        .mockImplementationOnce(() => Promise.reject(failureReason));

      const startContract = userProfileService.start(mockStartParams);

      // The entire operation should fail if any batch fails
      await expect(startContract.bulkGet({ uids: new Set(uids) })).rejects.toBe(failureReason);

      // Verify that both batches were attempted
      expect(
        mockStartParams.clusterClient.asInternalUser.security.getUserProfile
      ).toHaveBeenCalledTimes(2);
    });
  });

  describe('#suggest', () => {
    it('properly parses returned profiles without privileges check', async () => {
      mockStartParams.clusterClient.asInternalUser.security.suggestUserProfiles.mockResolvedValue({
        profiles: [
          userProfileMock.createWithSecurity({
            uid: 'UID-1',
            user: {
              username: 'user-1',
              full_name: 'full-name-1',
              realm_name: 'some-realm',
              realm_domain: 'some-domain',
              roles: ['role-1'],
            },
          }),
          userProfileMock.createWithSecurity({
            uid: 'UID-2',
            user: {
              username: 'user-2',
              full_name: 'full-name-2',
              realm_name: 'some-realm',
              realm_domain: 'some-domain',
              roles: ['role-2'],
            },
          }),
        ],
      } as unknown as SecuritySuggestUserProfilesResponse);

      const startContract = userProfileService.start(mockStartParams);
      await expect(startContract.suggest({ size: 50, name: 'some' })).resolves
        .toMatchInlineSnapshot(`
              Array [
                Object {
                  "data": Object {},
                  "enabled": true,
                  "uid": "UID-1",
                  "user": Object {
                    "email": undefined,
                    "full_name": "full-name-1",
                    "username": "user-1",
                  },
                },
                Object {
                  "data": Object {},
                  "enabled": true,
                  "uid": "UID-2",
                  "user": Object {
                    "email": undefined,
                    "full_name": "full-name-2",
                    "username": "user-2",
                  },
                },
              ]
            `);
      expect(
        mockStartParams.clusterClient.asInternalUser.security.suggestUserProfiles
      ).toHaveBeenCalledTimes(1);
      expect(
        mockStartParams.clusterClient.asInternalUser.security.suggestUserProfiles
      ).toHaveBeenCalledWith({
        name: 'some',
        size: 50,
      });
      expect(mockAuthz.checkUserProfilesPrivileges).not.toHaveBeenCalled();
    });

    it('should request data if data path is specified', async () => {
      mockStartParams.clusterClient.asInternalUser.security.suggestUserProfiles.mockResolvedValue({
        profiles: [
          userProfileMock.createWithSecurity({
            uid: 'UID-1',
            data: { some: 'data', kibana: { some: 'kibana-data' } },
          }),
        ],
      } as unknown as SecuritySuggestUserProfilesResponse);

      const startContract = userProfileService.start(mockStartParams);
      await expect(startContract.suggest({ name: 'some', dataPath: 'one,two' })).resolves
        .toMatchInlineSnapshot(`
              Array [
                Object {
                  "data": Object {
                    "some": "kibana-data",
                  },
                  "enabled": true,
                  "uid": "UID-1",
                  "user": Object {
                    "email": "some@email",
                    "full_name": undefined,
                    "username": "some-username",
                  },
                },
              ]
            `);
      expect(
        mockStartParams.clusterClient.asInternalUser.security.suggestUserProfiles
      ).toHaveBeenCalledTimes(1);
      expect(
        mockStartParams.clusterClient.asInternalUser.security.suggestUserProfiles
      ).toHaveBeenCalledWith({
        name: 'some',
        size: 10,
        data: 'kibana.one,kibana.two',
      });
      expect(mockAuthz.checkUserProfilesPrivileges).not.toHaveBeenCalled();
    });

    it('should request data if uid hints are specified', async () => {
      mockStartParams.clusterClient.asInternalUser.security.suggestUserProfiles.mockResolvedValue({
        profiles: [
          userProfileMock.createWithSecurity({
            uid: 'UID-1',
          }),
        ],
      } as unknown as SecuritySuggestUserProfilesResponse);

      const startContract = userProfileService.start(mockStartParams);
      await expect(startContract.suggest({ hint: { uids: ['UID-1'] } })).resolves
        .toMatchInlineSnapshot(`
              Array [
                Object {
                  "data": Object {},
                  "enabled": true,
                  "uid": "UID-1",
                  "user": Object {
                    "email": "some@email",
                    "full_name": undefined,
                    "username": "some-username",
                  },
                },
              ]
            `);
      expect(
        mockStartParams.clusterClient.asInternalUser.security.suggestUserProfiles
      ).toHaveBeenCalledTimes(1);
      expect(
        mockStartParams.clusterClient.asInternalUser.security.suggestUserProfiles
      ).toHaveBeenCalledWith({
        size: 10,
        hint: { uids: ['UID-1'] },
      });
      expect(mockAuthz.checkUserProfilesPrivileges).not.toHaveBeenCalled();
    });

    it('fails if requested too many suggestions', async () => {
      const startContract = userProfileService.start(mockStartParams);
      await expect(startContract.suggest({ name: 'som', size: 101 })).rejects.toMatchInlineSnapshot(
        `[Error: Can return up to 100 suggestions, but 101 suggestions were requested.]`
      );
      expect(
        mockStartParams.clusterClient.asInternalUser.security.suggestUserProfiles
      ).not.toHaveBeenCalled();
      expect(mockAuthz.checkUserProfilesPrivileges).not.toHaveBeenCalled();
    });

    it('fails if license does not allow profile collaboration features', async () => {
      userProfileService = new UserProfileService(logger);
      userProfileService.setup({
        authz: mockAuthz,
        license: licenseMock.create({ allowUserProfileCollaboration: false }),
      });

      const startContract = userProfileService.start(mockStartParams);
      await expect(startContract.suggest({ name: 'som' })).rejects.toMatchInlineSnapshot(
        `[Error: Current license doesn't support user profile collaboration APIs.]`
      );
      expect(
        mockStartParams.clusterClient.asInternalUser.security.suggestUserProfiles
      ).not.toHaveBeenCalled();
      expect(mockAuthz.checkUserProfilesPrivileges).not.toHaveBeenCalled();
    });

    it('fails if Elasticsearch suggest API returns error', async () => {
      const failureReason = new errors.ResponseError(
        securityMock.createApiResponse({ statusCode: 500, body: 'some message' })
      );
      mockStartParams.clusterClient.asInternalUser.security.suggestUserProfiles.mockRejectedValue(
        failureReason
      );

      const startContract = userProfileService.start(mockStartParams);
      await expect(startContract.suggest({ name: 'some' })).rejects.toBe(failureReason);
      expect(
        mockStartParams.clusterClient.asInternalUser.security.suggestUserProfiles
      ).toHaveBeenCalledTimes(1);
      expect(
        mockStartParams.clusterClient.asInternalUser.security.suggestUserProfiles
      ).toHaveBeenCalledWith({
        name: 'some',
        size: 10,
      });
    });

    it('properly handles privileges checks when privileges can be checked in one go', async () => {
      // In this test we'd like to simulate the following case:
      // 1. User requests 3 results with privileges check
      // 2. Kibana will fetch 10 (min batch) results
      // 3. Only UID-0, UID-1 and UID-8 profiles will have necessary privileges
      mockStartParams.clusterClient.asInternalUser.security.suggestUserProfiles.mockResolvedValue({
        profiles: Array.from({ length: 10 }).map((_, index) =>
          userProfileMock.createWithSecurity({
            uid: `UID-${index}`,
            data: { some: 'data', kibana: { some: `kibana-data-${index}` } },
          })
        ),
      } as unknown as SecuritySuggestUserProfilesResponse);

      const mockAtSpacePrivilegeCheck = { atSpace: jest.fn() };
      mockAtSpacePrivilegeCheck.atSpace.mockResolvedValue({
        hasPrivilegeUids: ['UID-0', 'UID-1', 'UID-8'],
      });
      mockAuthz.checkUserProfilesPrivileges.mockReturnValue(mockAtSpacePrivilegeCheck);

      const startContract = userProfileService.start(mockStartParams);
      await expect(
        startContract.suggest({
          name: 'some',
          size: 3,
          dataPath: 'one,two',
          requiredPrivileges: {
            spaceId: 'some-space',
            privileges: { kibana: ['privilege-1', 'privilege-2'] },
          },
        })
      ).resolves.toMatchInlineSnapshot(`
              Array [
                Object {
                  "data": Object {
                    "some": "kibana-data-0",
                  },
                  "enabled": true,
                  "uid": "UID-0",
                  "user": Object {
                    "email": "some@email",
                    "full_name": undefined,
                    "username": "some-username",
                  },
                },
                Object {
                  "data": Object {
                    "some": "kibana-data-1",
                  },
                  "enabled": true,
                  "uid": "UID-1",
                  "user": Object {
                    "email": "some@email",
                    "full_name": undefined,
                    "username": "some-username",
                  },
                },
                Object {
                  "data": Object {
                    "some": "kibana-data-8",
                  },
                  "enabled": true,
                  "uid": "UID-8",
                  "user": Object {
                    "email": "some@email",
                    "full_name": undefined,
                    "username": "some-username",
                  },
                },
              ]
            `);
      expect(
        mockStartParams.clusterClient.asInternalUser.security.suggestUserProfiles
      ).toHaveBeenCalledTimes(1);
      expect(
        mockStartParams.clusterClient.asInternalUser.security.suggestUserProfiles
      ).toHaveBeenCalledWith({
        name: 'some',
        size: 10,
        data: 'kibana.one,kibana.two',
      });

      expect(mockAuthz.checkUserProfilesPrivileges).toHaveBeenCalledTimes(1);
      expect(mockAuthz.checkUserProfilesPrivileges).toHaveBeenCalledWith(
        new Set(Array.from({ length: 10 }).map((_, index) => `UID-${index}`))
      );

      expect(mockAtSpacePrivilegeCheck.atSpace).toHaveBeenCalledTimes(1);
      expect(mockAtSpacePrivilegeCheck.atSpace).toHaveBeenCalledWith('some-space', {
        kibana: ['privilege-1', 'privilege-2'],
      });
    });

    it('properly handles privileges checks when privileges have to be checked in multiple steps', async () => {
      // In this test we'd like to simulate the following case:
      // 1. User requests 11 results with privileges check
      // 2. Kibana will fetch 22 (two times more than requested) results
      // 3. Only UID-0 and UID-21 profiles will have necessary privileges
      mockStartParams.clusterClient.asInternalUser.security.suggestUserProfiles.mockResolvedValue({
        profiles: Array.from({ length: 22 }).map((_, index) =>
          userProfileMock.createWithSecurity({
            uid: `UID-${index}`,
            data: { some: 'data', kibana: { some: `kibana-data-${index}` } },
          })
        ),
      } as unknown as SecuritySuggestUserProfilesResponse);

      const mockAtSpacePrivilegeCheck = { atSpace: jest.fn() };
      mockAtSpacePrivilegeCheck.atSpace
        .mockResolvedValueOnce({
          hasPrivilegeUids: ['UID-0'],
        })
        .mockResolvedValueOnce({
          hasPrivilegeUids: ['UID-20'],
        })
        .mockResolvedValueOnce({
          hasPrivilegeUids: [],
        });
      mockAuthz.checkUserProfilesPrivileges.mockReturnValue(mockAtSpacePrivilegeCheck);

      const startContract = userProfileService.start(mockStartParams);
      await expect(
        startContract.suggest({
          name: 'some',
          size: 11,
          dataPath: 'one,two',
          requiredPrivileges: {
            spaceId: 'some-space',
            privileges: { kibana: ['privilege-1', 'privilege-2'] },
          },
        })
      ).resolves.toMatchInlineSnapshot(`
              Array [
                Object {
                  "data": Object {
                    "some": "kibana-data-0",
                  },
                  "enabled": true,
                  "uid": "UID-0",
                  "user": Object {
                    "email": "some@email",
                    "full_name": undefined,
                    "username": "some-username",
                  },
                },
                Object {
                  "data": Object {
                    "some": "kibana-data-20",
                  },
                  "enabled": true,
                  "uid": "UID-20",
                  "user": Object {
                    "email": "some@email",
                    "full_name": undefined,
                    "username": "some-username",
                  },
                },
              ]
            `);
      expect(
        mockStartParams.clusterClient.asInternalUser.security.suggestUserProfiles
      ).toHaveBeenCalledTimes(1);
      expect(
        mockStartParams.clusterClient.asInternalUser.security.suggestUserProfiles
      ).toHaveBeenCalledWith({
        name: 'some',
        size: 22,
        data: 'kibana.one,kibana.two',
      });

      expect(mockAuthz.checkUserProfilesPrivileges).toHaveBeenCalledTimes(3);
      // UID-0 -- UID-10 (11 UIDs - number of requested profiles)
      expect(mockAuthz.checkUserProfilesPrivileges).toHaveBeenNthCalledWith(
        1,
        new Set(Array.from({ length: 11 }).map((_, index) => `UID-${index}`))
      );
      // UID-11 -- UID-20 (10 UIDs - min batch size)
      expect(mockAuthz.checkUserProfilesPrivileges).toHaveBeenNthCalledWith(
        2,
        new Set(
          Array.from({ length: 21 })
            .map((_, index) => `UID-${index}`)
            .slice(-10)
        )
      );
      // UID-21 - remaining profile id
      expect(mockAuthz.checkUserProfilesPrivileges).toHaveBeenNthCalledWith(3, new Set(['UID-21']));

      expect(mockAtSpacePrivilegeCheck.atSpace).toHaveBeenCalledTimes(3);
      expect(mockAtSpacePrivilegeCheck.atSpace).toHaveBeenNthCalledWith(1, 'some-space', {
        kibana: ['privilege-1', 'privilege-2'],
      });
      expect(mockAtSpacePrivilegeCheck.atSpace).toHaveBeenNthCalledWith(2, 'some-space', {
        kibana: ['privilege-1', 'privilege-2'],
      });
      expect(mockAtSpacePrivilegeCheck.atSpace).toHaveBeenNthCalledWith(3, 'some-space', {
        kibana: ['privilege-1', 'privilege-2'],
      });
    });

    it('properly handles privileges checks when privileges have to be checked in multiple steps and user requested less users than have required privileges', async () => {
      // In this test we'd like to simulate the following case:
      // 1. User requests 2 results with privileges check
      // 2. Kibana will fetch 10 (min batch) results
      // 3. Only UID-0, UID-1 and UID-8 profiles will have necessary privileges
      mockStartParams.clusterClient.asInternalUser.security.suggestUserProfiles.mockResolvedValue({
        profiles: Array.from({ length: 10 }).map((_, index) =>
          userProfileMock.createWithSecurity({
            uid: `UID-${index}`,
            data: { some: 'data', kibana: { some: `kibana-data-${index}` } },
          })
        ),
      } as unknown as SecuritySuggestUserProfilesResponse);

      const mockAtSpacePrivilegeCheck = { atSpace: jest.fn() };
      mockAtSpacePrivilegeCheck.atSpace.mockResolvedValue({
        hasPrivilegeUids: ['UID-0', 'UID-1', 'UID-8'],
      });
      mockAuthz.checkUserProfilesPrivileges.mockReturnValue(mockAtSpacePrivilegeCheck);

      const startContract = userProfileService.start(mockStartParams);
      await expect(
        startContract.suggest({
          name: 'some',
          size: 2,
          dataPath: 'one,two',
          requiredPrivileges: {
            spaceId: 'some-space',
            privileges: { kibana: ['privilege-1', 'privilege-2'] },
          },
        })
      ).resolves.toMatchInlineSnapshot(`
              Array [
                Object {
                  "data": Object {
                    "some": "kibana-data-0",
                  },
                  "enabled": true,
                  "uid": "UID-0",
                  "user": Object {
                    "email": "some@email",
                    "full_name": undefined,
                    "username": "some-username",
                  },
                },
                Object {
                  "data": Object {
                    "some": "kibana-data-1",
                  },
                  "enabled": true,
                  "uid": "UID-1",
                  "user": Object {
                    "email": "some@email",
                    "full_name": undefined,
                    "username": "some-username",
                  },
                },
              ]
            `);
      expect(
        mockStartParams.clusterClient.asInternalUser.security.suggestUserProfiles
      ).toHaveBeenCalledTimes(1);
      expect(
        mockStartParams.clusterClient.asInternalUser.security.suggestUserProfiles
      ).toHaveBeenCalledWith({
        name: 'some',
        size: 10,
        data: 'kibana.one,kibana.two',
      });

      expect(mockAuthz.checkUserProfilesPrivileges).toHaveBeenCalledTimes(1);
      expect(mockAuthz.checkUserProfilesPrivileges).toHaveBeenCalledWith(
        new Set(Array.from({ length: 10 }).map((_, index) => `UID-${index}`))
      );

      expect(mockAtSpacePrivilegeCheck.atSpace).toHaveBeenCalledTimes(1);
      expect(mockAtSpacePrivilegeCheck.atSpace).toHaveBeenCalledWith('some-space', {
        kibana: ['privilege-1', 'privilege-2'],
      });
    });

    it('properly handles privileges checks and logs errors when errors with reasons are returned from the privilege check', async () => {
      // In this test we'd like to simulate the following case:
      // 1. User requests 2 results with privileges check
      // 2. Kibana will fetch 10 (min batch) results
      // 3. Only UID-0, UID-1 and UID-8 profiles will have necessary privileges
      mockStartParams.clusterClient.asInternalUser.security.suggestUserProfiles.mockResolvedValue({
        profiles: Array.from({ length: 10 }).map((_, index) =>
          userProfileMock.createWithSecurity({
            uid: `UID-${index}`,
            data: { some: 'data', kibana: { some: `kibana-data-${index}` } },
          })
        ),
      } as unknown as SecuritySuggestUserProfilesResponse);

      const mockAtSpacePrivilegeCheck = { atSpace: jest.fn() };

      mockAtSpacePrivilegeCheck.atSpace.mockResolvedValue({
        hasPrivilegeUids: ['UID-0', 'UID-1', 'UID-8'],
        errors: {
          count: 2,
          details: {
            'UID-3': { type: 'some type 3', reason: 'some reason 3' },
            'UID-4': { type: 'some type 4', reason: 'some reason 4' },
          },
        },
      });

      mockAuthz.checkUserProfilesPrivileges.mockReturnValue(mockAtSpacePrivilegeCheck);

      const startContract = userProfileService.start(mockStartParams);

      await expect(
        startContract.suggest({
          name: 'some',
          size: 2,
          dataPath: 'one,two',
          requiredPrivileges: {
            spaceId: 'some-space',
            privileges: { kibana: ['privilege-1', 'privilege-2'] },
          },
        })
      ).resolves.toMatchInlineSnapshot(`
              Array [
                Object {
                  "data": Object {
                    "some": "kibana-data-0",
                  },
                  "enabled": true,
                  "uid": "UID-0",
                  "user": Object {
                    "email": "some@email",
                    "full_name": undefined,
                    "username": "some-username",
                  },
                },
                Object {
                  "data": Object {
                    "some": "kibana-data-1",
                  },
                  "enabled": true,
                  "uid": "UID-1",
                  "user": Object {
                    "email": "some@email",
                    "full_name": undefined,
                    "username": "some-username",
                  },
                },
              ]
            `);

      expect(
        mockStartParams.clusterClient.asInternalUser.security.suggestUserProfiles
      ).toHaveBeenCalledTimes(1);

      expect(
        mockStartParams.clusterClient.asInternalUser.security.suggestUserProfiles
      ).toHaveBeenCalledWith({
        name: 'some',
        size: 10,
        data: 'kibana.one,kibana.two',
      });

      expect(mockAuthz.checkUserProfilesPrivileges).toHaveBeenCalledTimes(1);

      expect(mockAuthz.checkUserProfilesPrivileges).toHaveBeenCalledWith(
        new Set(Array.from({ length: 10 }).map((_, index) => `UID-${index}`))
      );

      expect(mockAtSpacePrivilegeCheck.atSpace).toHaveBeenCalledTimes(1);

      expect(mockAtSpacePrivilegeCheck.atSpace).toHaveBeenCalledWith('some-space', {
        kibana: ['privilege-1', 'privilege-2'],
      });

      expect(logger.error).toHaveBeenCalledWith(
        'Privileges check API failed for UID UID-3 because some reason 3.'
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Privileges check API failed for UID UID-4 because some reason 4.'
      );
    });
  });
});

describe('prefixCommaSeparatedValues', () => {
  it('should prefix each value', () => {
    expect(prefixCommaSeparatedValues('one,two,three', '_')).toBe('_.one,_.two,_.three');
  });

  it('should trim whitespace', () => {
    expect(prefixCommaSeparatedValues('one , two,  three   ', '_')).toBe('_.one,_.two,_.three');
  });

  it('should ignore empty values', () => {
    expect(prefixCommaSeparatedValues('', '_')).toBe('');
    expect(prefixCommaSeparatedValues(' ', '_')).toBe('');
    expect(prefixCommaSeparatedValues(' ,, ', '_')).toBe('');
  });
});
