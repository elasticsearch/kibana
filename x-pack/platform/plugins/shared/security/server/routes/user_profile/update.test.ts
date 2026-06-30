/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ObjectType } from '@kbn/config-schema';
import type { RequestHandler, RouteConfig } from '@kbn/core/server';
import { kibanaResponseFactory } from '@kbn/core/server';
import { httpServerMock } from '@kbn/core/server/mocks';
import type { PublicMethodsOf } from '@kbn/utility-types';
import type { DeeplyMockedKeys } from '@kbn/utility-types-jest';

import { defineUpdateUserProfileDataRoute } from './update';
import { mockAuthenticatedUser } from '../../../common/model/authenticated_user.mock';
import type { InternalAuthenticationServiceStart } from '../../authentication';
import { authenticationServiceMock } from '../../authentication/authentication_service.mock';
import type { Session } from '../../session_management';
import { sessionMock } from '../../session_management/session.mock';
import type { SecurityRequestHandlerContext, SecurityRouter } from '../../types';
import type { UserProfileServiceStartInternal } from '../../user_profile';
import { userProfileServiceMock } from '../../user_profile/user_profile_service.mock';
import { routeDefinitionParamsMock, securityRequestHandlerContextMock } from '../index.mock';

function getMockContext() {
  return {
    licensing: {
      license: { check: jest.fn().mockReturnValue({ check: 'valid' }) },
    },
  } as unknown as SecurityRequestHandlerContext;
}

describe('Update profile routes', () => {
  let router: jest.Mocked<SecurityRouter>;
  let session: jest.Mocked<PublicMethodsOf<Session>>;
  let userProfileService: jest.Mocked<UserProfileServiceStartInternal>;
  let authc: DeeplyMockedKeys<InternalAuthenticationServiceStart>;
  beforeEach(() => {
    const routeParamsMock = routeDefinitionParamsMock.create();
    router = routeParamsMock.router;

    session = sessionMock.create();
    routeParamsMock.getSession.mockReturnValue(session);

    userProfileService = userProfileServiceMock.createStart();
    routeParamsMock.getUserProfileService.mockReturnValue(userProfileService);

    authc = authenticationServiceMock.createStart();
    routeParamsMock.getAuthenticationService.mockReturnValue(authc);

    defineUpdateUserProfileDataRoute(routeParamsMock);
  });

  describe('update profile data', () => {
    let routeHandler: RequestHandler<any, any, any, SecurityRequestHandlerContext>;
    let routeConfig: RouteConfig<any, any, any, any>;
    beforeEach(() => {
      const [updateRouteConfig, updateRouteHandler] = router.post.mock.calls.find(
        ([{ path }]) => path === '/internal/security/user_profile/_data'
      )!;

      routeConfig = updateRouteConfig;
      routeHandler = updateRouteHandler;
    });

    it('correctly defines route.', () => {
      const bodySchema = (routeConfig.validate as any).body as ObjectType;
      expect(() => bodySchema.validate(0)).toThrowErrorMatchingInlineSnapshot(
        `"expected a plain object value, but found [number] instead."`
      );
      expect(() => bodySchema.validate('avatar')).toThrowErrorMatchingInlineSnapshot(
        `"could not parse object value from json input"`
      );
      expect(() => bodySchema.validate(true)).toThrowErrorMatchingInlineSnapshot(
        `"expected a plain object value, but found [boolean] instead."`
      );

      expect(bodySchema.validate({})).toEqual({});
      expect(
        bodySchema.validate({
          avatar: { initials: 'some-initials', color: 'some-color', imageUrl: 'some-image-url' },
          userSettings: {
            darkMode: 'dark',
            contrastMode: 'high',
            agentBuilderAnnouncementModalSeen: true,
            agentBuilderAnnouncementModalSeenBySpaceJson: '{}',
          },
        })
      ).toEqual({
        avatar: { initials: 'some-initials', color: 'some-color', imageUrl: 'some-image-url' },
        userSettings: {
          darkMode: 'dark',
          contrastMode: 'high',
          agentBuilderAnnouncementModalSeen: true,
          agentBuilderAnnouncementModalSeenBySpaceJson: '{}',
        },
      });
    });

    it('rejects invalid darkMode enum values.', () => {
      const bodySchema = (routeConfig.validate as any).body as ObjectType;

      // Valid values should pass
      expect(
        bodySchema.validate({
          userSettings: { darkMode: 'system' },
        })
      ).toEqual({ userSettings: { darkMode: 'system' } });

      expect(
        bodySchema.validate({
          userSettings: { darkMode: 'dark' },
        })
      ).toEqual({ userSettings: { darkMode: 'dark' } });

      expect(
        bodySchema.validate({
          userSettings: { darkMode: 'light' },
        })
      ).toEqual({ userSettings: { darkMode: 'light' } });

      expect(
        bodySchema.validate({
          userSettings: { darkMode: 'space_default' },
        })
      ).toEqual({ userSettings: { darkMode: 'space_default' } });

      // Invalid values should fail
      expect(() =>
        bodySchema.validate({
          userSettings: { darkMode: 'invalid' },
        })
      ).toThrow();

      expect(() =>
        bodySchema.validate({
          userSettings: { darkMode: 'INVALID' },
        })
      ).toThrow();

      expect(() =>
        bodySchema.validate({
          userSettings: { darkMode: 123 },
        })
      ).toThrow();
    });

    it('rejects invalid contrastMode enum values.', () => {
      const bodySchema = (routeConfig.validate as any).body as ObjectType;

      // Valid values should pass
      expect(
        bodySchema.validate({
          userSettings: { contrastMode: 'system' },
        })
      ).toEqual({ userSettings: { contrastMode: 'system' } });

      expect(
        bodySchema.validate({
          userSettings: { contrastMode: 'standard' },
        })
      ).toEqual({ userSettings: { contrastMode: 'standard' } });

      expect(
        bodySchema.validate({
          userSettings: { contrastMode: 'high' },
        })
      ).toEqual({ userSettings: { contrastMode: 'high' } });

      // Invalid values should fail
      expect(() =>
        bodySchema.validate({
          userSettings: { contrastMode: 'invalid' },
        })
      ).toThrow();

      expect(() =>
        bodySchema.validate({
          userSettings: { contrastMode: 'INVALID' },
        })
      ).toThrow();

      expect(() =>
        bodySchema.validate({
          userSettings: { contrastMode: 123 },
        })
      ).toThrow();
    });

    it('rejects avatar initials exceeding max length.', () => {
      const bodySchema = (routeConfig.validate as any).body as ObjectType;
      const MAX_STRING_FIELD_LENGTH = 1024;

      // Valid length should pass
      const validInitials = 'a'.repeat(MAX_STRING_FIELD_LENGTH);
      expect(
        bodySchema.validate({
          avatar: { initials: validInitials },
        })
      ).toEqual({ avatar: { color: null, imageUrl: null, initials: validInitials } });

      const invalidInitials = 'a'.repeat(MAX_STRING_FIELD_LENGTH + 1);
      expect(() =>
        bodySchema.validate({
          avatar: { initials: invalidInitials },
        })
      ).toThrowErrorMatchingInlineSnapshot(`
        "[avatar.initials]: types that failed validation:
        - [avatar.initials.0]: value has length [1025] but it must have a maximum length of [1024].
        - [avatar.initials.1]: expected value to equal [null]"
      `);
    });

    it('rejects avatar color exceeding max length.', () => {
      const bodySchema = (routeConfig.validate as any).body as ObjectType;
      const MAX_STRING_FIELD_LENGTH = 1024;

      const validColor = 'a'.repeat(MAX_STRING_FIELD_LENGTH);
      expect(
        bodySchema.validate({
          avatar: { color: validColor },
        })
      ).toEqual({ avatar: { color: validColor, imageUrl: null, initials: null } });

      const invalidColor = 'a'.repeat(MAX_STRING_FIELD_LENGTH + 1);
      expect(() =>
        bodySchema.validate({
          avatar: { color: invalidColor },
        })
      ).toThrowErrorMatchingInlineSnapshot(`
        "[avatar.color]: types that failed validation:
        - [avatar.color.0]: value has length [1025] but it must have a maximum length of [1024].
        - [avatar.color.1]: expected value to equal [null]"
      `);
    });

    it('allows null values for avatar initials and color.', () => {
      const bodySchema = (routeConfig.validate as any).body as ObjectType;

      expect(
        bodySchema.validate({
          avatar: { initials: null, color: null },
        })
      ).toEqual({ avatar: { imageUrl: null, initials: null, color: null } });
    });

    it('validates body size limit is configured correctly.', () => {
      const MAX_USER_PROFILE_DATA_SIZE_BYTES = 1000 * 1024;

      expect(routeConfig.options?.body?.maxBytes).toBe(MAX_USER_PROFILE_DATA_SIZE_BYTES);
    });

    it('fails if session is not found.', async () => {
      await expect(
        routeHandler(
          getMockContext(),
          httpServerMock.createKibanaRequest({ body: {} }),
          kibanaResponseFactory
        )
      ).resolves.toEqual(expect.objectContaining({ status: 404 }));

      expect(userProfileService.update).not.toHaveBeenCalled();
    });

    it('fails if session does not have profile ID.', async () => {
      session.get.mockResolvedValue({
        error: null,
        value: sessionMock.createValue({ userProfileId: undefined }),
      });

      await expect(
        routeHandler(
          getMockContext(),
          httpServerMock.createKibanaRequest({ body: {} }),
          kibanaResponseFactory
        )
      ).resolves.toEqual(expect.objectContaining({ status: 404 }));

      expect(userProfileService.update).not.toHaveBeenCalled();
    });

    it('fails for Elastic Cloud users.', async () => {
      session.get.mockResolvedValue({ error: null, value: sessionMock.createValue() });
      authc.getCurrentUser.mockReturnValue(mockAuthenticatedUser({ elastic_cloud_user: true }));

      await expect(
        routeHandler(
          getMockContext(),
          httpServerMock.createKibanaRequest({ body: {} }),
          kibanaResponseFactory
        )
      ).resolves.toEqual(expect.objectContaining({ status: 403 }));

      expect(userProfileService.update).not.toHaveBeenCalled();
    });

    it('only allow specific user profile data keys to be updated for Elastic Cloud users.', async () => {
      session.get.mockResolvedValue({
        error: null,
        value: sessionMock.createValue({ userProfileId: 'u_some_id' }),
      });
      authc.getCurrentUser.mockReturnValue(mockAuthenticatedUser({ elastic_cloud_user: true }));

      const ALLOWED_SETTINGS = {
        userSettings: {
          darkMode: 'dark',
          contrastMode: 'high',
          rememberSelectedSpace: true,
        },
      };

      await expect(
        routeHandler(
          getMockContext(),
          httpServerMock.createKibanaRequest({
            body: ALLOWED_SETTINGS,
          }),
          kibanaResponseFactory
        )
      ).resolves.toEqual(expect.objectContaining({ status: 200, payload: undefined }));

      expect(userProfileService.update).toBeCalledTimes(1);
      expect(userProfileService.update).toBeCalledWith('u_some_id', ALLOWED_SETTINGS);

      await expect(
        routeHandler(
          getMockContext(),
          httpServerMock.createKibanaRequest({
            body: {
              ...ALLOWED_SETTINGS,
              NOT_ALLOWED_KEY: 'some value',
            },
          }),
          kibanaResponseFactory
        )
      ).resolves.toEqual(expect.objectContaining({ status: 403 }));
    });

    it('allows Elastic Cloud users to update agentBuilderAnnouncementModalSeenBySpaceJson.', async () => {
      session.get.mockResolvedValue({
        error: null,
        value: sessionMock.createValue({ userProfileId: 'u_some_id' }),
      });
      authc.getCurrentUser.mockReturnValue(mockAuthenticatedUser({ elastic_cloud_user: true }));

      await expect(
        routeHandler(
          getMockContext(),
          httpServerMock.createKibanaRequest({
            body: {
              userSettings: {
                agentBuilderAnnouncementModalSeenBySpaceJson: '{}',
              },
            },
          }),
          kibanaResponseFactory
        )
      ).resolves.toEqual(expect.objectContaining({ status: 200, payload: undefined }));

      expect(userProfileService.update).toHaveBeenCalledWith('u_some_id', {
        userSettings: {
          agentBuilderAnnouncementModalSeenBySpaceJson: '{}',
        },
      });
    });

    it('allows Elastic Cloud users to update agentBuilderAnnouncementModalSeen.', async () => {
      session.get.mockResolvedValue({
        error: null,
        value: sessionMock.createValue({ userProfileId: 'u_some_id' }),
      });
      authc.getCurrentUser.mockReturnValue(mockAuthenticatedUser({ elastic_cloud_user: true }));

      await expect(
        routeHandler(
          getMockContext(),
          httpServerMock.createKibanaRequest({
            body: {
              userSettings: {
                agentBuilderAnnouncementModalSeen: true,
              },
            },
          }),
          kibanaResponseFactory
        )
      ).resolves.toEqual(expect.objectContaining({ status: 200, payload: undefined }));

      expect(userProfileService.update).toHaveBeenCalledWith('u_some_id', {
        userSettings: {
          agentBuilderAnnouncementModalSeen: true,
        },
      });
    });

    it('updates profile.', async () => {
      session.get.mockResolvedValue({
        error: null,
        value: sessionMock.createValue({ userProfileId: 'u_some_id' }),
      });
      authc.getCurrentUser.mockReturnValue(mockAuthenticatedUser());

      await expect(
        routeHandler(
          getMockContext(),
          httpServerMock.createKibanaRequest({ body: { some: 'property' } }),
          kibanaResponseFactory
        )
      ).resolves.toEqual(expect.objectContaining({ status: 200, payload: undefined }));

      expect(userProfileService.update).toBeCalledTimes(1);
      expect(userProfileService.update).toBeCalledWith('u_some_id', { some: 'property' });
    });

    it('rejects invalid avatar color.', async () => {
      session.get.mockResolvedValue({
        error: null,
        value: sessionMock.createValue({ userProfileId: 'u_some_id' }),
      });
      authc.getCurrentUser.mockReturnValue(mockAuthenticatedUser());
      await expect(
        routeHandler(
          getMockContext(),
          httpServerMock.createKibanaRequest({ body: { avatar: { color: 'invalid' } } }),
          kibanaResponseFactory
        )
      ).resolves.toEqual(expect.objectContaining({ status: 400 }));

      expect(userProfileService.update).not.toHaveBeenCalled();
    });
    it('accepts valid avatar color.', async () => {
      session.get.mockResolvedValue({
        error: null,
        value: sessionMock.createValue({ userProfileId: 'u_some_id' }),
      });
      authc.getCurrentUser.mockReturnValue(mockAuthenticatedUser());
      await expect(
        routeHandler(
          getMockContext(),
          httpServerMock.createKibanaRequest({ body: { avatar: { color: '#000000' } } }),
          kibanaResponseFactory
        )
      ).resolves.toEqual(expect.objectContaining({ status: 200, payload: undefined }));

      expect(userProfileService.update).toBeCalledTimes(1);
    });

    it('rejects a locale that is not enabled with a request-scoped translated error.', async () => {
      session.get.mockResolvedValue({
        error: null,
        value: sessionMock.createValue({ userProfileId: 'u_some_id' }),
      });
      authc.getCurrentUser.mockReturnValue(mockAuthenticatedUser());

      const context = securityRequestHandlerContextMock.create();
      const { i18n: i18nClient } = await context.core;

      await expect(
        routeHandler(
          context,
          httpServerMock.createKibanaRequest({ body: { userSettings: { locale: 'fr-FR' } } }),
          kibanaResponseFactory
        )
      ).resolves.toEqual(expect.objectContaining({ status: 400 }));

      expect(i18nClient.translate).toHaveBeenCalledWith(
        'xpack.security.userProfile.localeNotEnabled',
        {
          defaultMessage: 'Locale "{locale}" is not enabled for this deployment',
          values: { locale: 'fr-FR' },
        }
      );
      expect(userProfileService.update).not.toHaveBeenCalled();
    });
  });
});
