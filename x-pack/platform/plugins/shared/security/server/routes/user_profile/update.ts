/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { UserProfileData } from '@kbn/core-user-profile-common';
import { isValidUserProfileAvatarColor } from '@kbn/user-profile-components';
import type { DotKeysOf } from '@kbn/utility-types';

import type { RouteDefinitionParams } from '..';
import { IMAGE_FILE_TYPES } from '../../../common/constants';
import { wrapIntoCustomErrorResponse } from '../../errors';
import { flattenObject } from '../../lib';
import { getPrintableSessionId } from '../../session_management';
import { createLicensedRouteHandler } from '../licensed_route_handler';

type UserProfileUpdatePayload = Pick<UserProfileData, 'userSettings'>;
type UserProfileUpdatePaths = DotKeysOf<UserProfileUpdatePayload>;

/** User profile data keys that are allowed to be updated by Cloud users */
const ALLOWED_KEYS_UPDATE_CLOUD = [
  'userSettings.darkMode',
  'userSettings.contrastMode',
  'userSettings.agentBuilderAnnouncementModalSeen',
  'userSettings.agentBuilderAnnouncementModalSeenBySpaceJson',
  'userSettings.locale',
  'userSettings.rememberSelectedSpace',
] as const satisfies readonly UserProfileUpdatePaths[];

const MAX_STRING_FIELD_LENGTH = 1024;

const MAX_USER_PROFILE_DATA_SIZE_BYTES = 1000 * 1024;

/** Stringified JSON map (space id → seen); cap is defensive and stays well under {@link MAX_USER_PROFILE_DATA_SIZE_BYTES}. */
const MAX_AGENT_BUILDER_ANNOUNCEMENT_SPACE_JSON_CHARS = 64 * 1024;

const userProfileUpdateSchema = schema.object({
  avatar: schema.maybe(
    schema.object({
      initials: schema.nullable(schema.string({ maxLength: MAX_STRING_FIELD_LENGTH })),
      color: schema.nullable(schema.string({ maxLength: MAX_STRING_FIELD_LENGTH })),
      imageUrl: schema.nullable(schema.string()),
    })
  ),
  userSettings: schema.maybe(
    schema.object({
      darkMode: schema.maybe(
        schema.oneOf([
          schema.literal('system'),
          schema.literal('dark'),
          schema.literal('light'),
          schema.literal('space_default'),
        ])
      ),
      contrastMode: schema.maybe(
        schema.oneOf([schema.literal('system'), schema.literal('standard'), schema.literal('high')])
      ),
      agentBuilderAnnouncementModalSeen: schema.maybe(schema.boolean()),
      agentBuilderAnnouncementModalSeenBySpaceJson: schema.maybe(
        schema.string({ maxLength: MAX_AGENT_BUILDER_ANNOUNCEMENT_SPACE_JSON_CHARS })
      ),
      locale: schema.maybe(schema.string({ maxLength: MAX_STRING_FIELD_LENGTH })),
      rememberSelectedSpace: schema.maybe(schema.boolean()),
      lastSelectedSpaceId: schema.maybe(
        schema.nullable(schema.string({ maxLength: MAX_STRING_FIELD_LENGTH }))
      ),
    })
  ),
});

export function defineUpdateUserProfileDataRoute({
  router,
  getSession,
  getUserProfileService,
  logger,
  getAuthenticationService,
  i18n: i18nService,
}: RouteDefinitionParams) {
  router.post(
    {
      path: '/internal/security/user_profile/_data',
      security: {
        authz: {
          enabled: false,
          reason:
            'This route delegates authorization to the internal authorization service; an authenticated user and valid session are required',
        },
      },
      validate: {
        body: userProfileUpdateSchema,
      },
      options: {
        body: {
          maxBytes: MAX_USER_PROFILE_DATA_SIZE_BYTES,
        },
      },
    },
    createLicensedRouteHandler(async (context, request, response) => {
      const session = await getSession().get(request);
      if (session.error) {
        logger.warn('User profile requested without valid session.');
        return response.notFound();
      }

      if (!session.value.userProfileId) {
        logger.warn(
          `User profile missing from current session. (sid: ${getPrintableSessionId(
            session.value.sid
          )})`
        );
        return response.notFound();
      }

      const currentUser = getAuthenticationService().getCurrentUser(request);

      const userProfileData = request.body;
      const imageDataUrl = userProfileData.avatar?.imageUrl;
      if (imageDataUrl && typeof imageDataUrl === 'string') {
        const matches = imageDataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
          return response.customError({
            body: 'Unsupported media type',
            statusCode: 415,
          });
        }

        const [, mimeType] = matches;

        if (!IMAGE_FILE_TYPES.includes(mimeType)) {
          return response.customError({
            body: 'Unsupported media type',
            statusCode: 415,
          });
        }
      }

      const avatarColor = userProfileData.avatar?.color;
      if (avatarColor) {
        const isValidColor = isValidUserProfileAvatarColor(avatarColor);
        if (!isValidColor) {
          return response.customError({
            body: 'Invalid hex color',
            statusCode: 400,
          });
        }
      }

      const requestedLocale = userProfileData.userSettings?.locale;
      if (requestedLocale) {
        const allowedLocales = i18nService.getLocales();
        if (!allowedLocales.includes(requestedLocale)) {
          const { i18n: i18nClient } = await context.core;
          return response.customError({
            body: await i18nClient.translate('xpack.security.userProfile.localeNotEnabled', {
              defaultMessage: 'Locale "{locale}" is not enabled for this deployment',
              values: { locale: requestedLocale },
            }),
            statusCode: 400,
          });
        }
      }

      const keysToUpdate = Object.keys(flattenObject(userProfileData));

      if (currentUser?.elastic_cloud_user) {
        // We only allow specific user profile data to be updated by Elastic Cloud SSO users.
        const isUpdateAllowed = keysToUpdate.every((key) =>
          (ALLOWED_KEYS_UPDATE_CLOUD as readonly string[]).includes(key)
        );

        if (keysToUpdate.length === 0 || !isUpdateAllowed) {
          logger.warn(
            `Elastic Cloud SSO users aren't allowed to update profiles in Kibana. (sid: ${getPrintableSessionId(
              session.value.sid
            )})`
          );
          return response.forbidden();
        }
      }

      const userProfileService = getUserProfileService();
      try {
        await userProfileService.update(session.value.userProfileId, userProfileData);
        return response.ok();
      } catch (error) {
        return response.customError(wrapIntoCustomErrorResponse(error));
      }
    })
  );
}
