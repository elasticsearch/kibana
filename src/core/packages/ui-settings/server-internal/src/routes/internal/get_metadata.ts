/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { SavedObjectsErrorHelpers } from '@kbn/core-saved-objects-server';
import type { IUiSettingsClient } from '@kbn/core-ui-settings-server';
import type { KibanaRequest, KibanaResponseFactory } from '@kbn/core-http-server';
import type { InternalUiSettingsRequestHandlerContext } from '../../internal_types';
import type { InternalUiSettingsRouter } from '../../internal_types';

export function registerInternalGetMetadataRoute(router: InternalUiSettingsRouter) {
  const getFromRequest = async (
    uiSettingsClient: IUiSettingsClient,
    _context: InternalUiSettingsRequestHandlerContext,
    _request: KibanaRequest<unknown, unknown, unknown, 'get'>,
    response: KibanaResponseFactory
  ) => {
    try {
      const [registered, userProvided] = await Promise.all([
        uiSettingsClient.getRegistered(),
        uiSettingsClient.getUserProvided(),
      ]);

      const merged: Record<string, Record<string, unknown>> = {};
      for (const [key, def] of Object.entries(registered)) {
        merged[key] = { ...def, ...(userProvided[key] ?? {}) };
      }
      for (const [key, userValues] of Object.entries(userProvided)) {
        if (!merged[key]) {
          merged[key] = { ...userValues };
        }
      }

      return response.ok({
        body: { settings: merged },
      });
    } catch (error) {
      if (SavedObjectsErrorHelpers.isSavedObjectsClientError(error)) {
        return response.customError({
          body: error,
          statusCode: error.output.statusCode,
        });
      }

      throw error;
    }
  };

  router.get(
    {
      path: '/internal/kibana/settings/metadata',
      validate: false,
      options: { access: 'internal' },
      security: {
        authz: {
          enabled: false,
          reason: 'This route delegates authorization to the UI Settings Client',
        },
      },
    },
    async (context, request, response) => {
      const uiSettingsClient = (await context.core).uiSettings.client;
      return await getFromRequest(uiSettingsClient, context, request, response);
    }
  );

  router.get(
    {
      path: '/internal/kibana/global_settings/metadata',
      validate: false,
      options: { access: 'internal' },
      security: {
        authz: {
          enabled: false,
          reason: 'This route delegates authorization to the UI Settings Client',
        },
      },
    },
    async (context, request, response) => {
      const uiSettingsClient = (await context.core).uiSettings.globalClient;
      return await getFromRequest(uiSettingsClient, context, request, response);
    }
  );
}
