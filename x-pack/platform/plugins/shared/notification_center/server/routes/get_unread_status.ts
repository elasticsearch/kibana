/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { GET_UNREAD_STATUS_PATH, NOTIFICATION_CENTER_API_VERSION } from '../../common/routes';
import { queryUnreadStatus } from '../lib/query_unread_status';
import { getReadState } from '../lib/read_state';
import { NC_AUTHZ_OPT_OUT_REASON, type NotificationRouteDeps } from './route_deps';

/** Register the unread-status endpoint for callers with profile-scoped read state. */
export const registerGetUnreadStatusRoute = ({
  router,
  core,
  logger,
}: NotificationRouteDeps): void => {
  router.versioned
    .get({
      access: 'internal',
      path: GET_UNREAD_STATUS_PATH,
      security: { authz: { enabled: false, reason: NC_AUTHZ_OPT_OUT_REASON } },
    })
    .addVersion(
      { version: NOTIFICATION_CENTER_API_VERSION, validate: false },
      async (_context, request, response) => {
        const [{ dataStreams, userStorage }] = await core.getStartServices();
        const client = userStorage.asScoped(request);
        if (!client) {
          return response.forbidden({
            body: { message: 'A user profile is required to check unread status.' },
          });
        }

        const readState = await getReadState(client, logger);
        if (!readState) {
          return response.customError({
            statusCode: 500,
            body: { message: 'Failed to load unread status.' },
          });
        }

        const result = await queryUnreadStatus({ dataStreams, logger }, readState);
        return response.ok({ body: result });
      }
    );
};
