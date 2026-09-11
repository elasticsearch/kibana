/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import Boom from '@hapi/boom';
import { asCodeIdSchema } from '@kbn/as-code-shared-schemas';
import type { RequestTiming } from '@kbn/core-http-server';
import type { SavedObjectsUpdateResponse } from '@kbn/core-saved-objects-api-server';
import type { SavedObjectAccessControl } from '@kbn/core-saved-objects-common';
import type { RequestHandlerContext } from '@kbn/core/server';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import type { DashboardState } from '@kbn/as-code-dashboard-schema';
import { DASHBOARD_SAVED_OBJECT_TYPE } from '../../../common/constants';
import type { DashboardSavedObjectAttributes } from '../../dashboard_saved_object';
import type { DashboardCreateResponseBody } from '../create';
import { create } from '../create';
import type { getDashboardStateSchema } from '../dashboard_state_schemas';
import { getDashboardCRUResponseBody } from '../get_cru_response_body';
import { transformDashboardIn } from '../transforms';
import type { Operation } from '../types';
import type { DashboardUpdateResponseBody } from './types';

/**
 * Upserts a dashboard by id — creates it if it doesn't exist, or updates it if it does.
 *
 * @remarks
 * This cannot use a simple `client.update({ upsert })` because the Saved Objects `update` API
 * does not accept `accessControl` options. To explicitly set `accessControl` on a new document,
 * or to change the access mode of an existing document, we must use `create()` and
 * `changeAccessMode()` respectively.
 *
 */
export async function update(
  requestCtx: RequestHandlerContext,
  strictValidationSchema: ReturnType<typeof getDashboardStateSchema>,
  id: string,
  updateBody: DashboardState,
  serverTiming?: RequestTiming,
  isDashboardAppRequest: boolean = false
): Promise<{
  body: DashboardCreateResponseBody | DashboardUpdateResponseBody;
  operation: Operation;
}> {
  const { core } = await requestCtx.resolve(['core']);

  const { access_control: accessControl, ...restOfBody } = updateBody;
  const { attributes: soAttributes, references: soReferences } = transformDashboardIn(
    restOfBody,
    isDashboardAppRequest,
    serverTiming
  );

  const supportsAccessControl = core.savedObjects.typeRegistry.supportsAccessControl(
    DASHBOARD_SAVED_OBJECT_TYPE
  );

  if (accessControl?.access_mode && !supportsAccessControl) {
    throw Boom.badRequest('Dashboard does not support access control.');
  }

  let existingAccessMode: SavedObjectAccessControl['accessMode'] | undefined;
  let isNewDocument = false;

  // Determine whether the document already exists.
  try {
    const existing = await core.savedObjects.client.get<DashboardSavedObjectAttributes>(
      DASHBOARD_SAVED_OBJECT_TYPE,
      id
    );
    existingAccessMode = existing.accessControl?.accessMode;
  } catch (e) {
    if (!SavedObjectsErrorHelpers.isNotFoundError(e)) {
      throw e;
    }
    isNewDocument = true;
  }

  // Create path
  if (isNewDocument) {
    asCodeIdSchema.parse(id);

    const body = await create(
      requestCtx,
      strictValidationSchema,
      updateBody,
      serverTiming,
      isDashboardAppRequest,
      id
    );
    return { body, operation: 'create' };
  }

  // Update path (existing document)
  const desiredAccessMode = accessControl?.access_mode;
  const currentAccessMode = existingAccessMode ?? 'default';
  const shouldChangeAccessMode =
    desiredAccessMode !== undefined && desiredAccessMode !== currentAccessMode;

  if (shouldChangeAccessMode) {
    const changeAccessModeResponse = await core.savedObjects.client.changeAccessMode(
      [{ type: DASHBOARD_SAVED_OBJECT_TYPE, id }],
      {
        accessMode: desiredAccessMode,
      }
    );

    if (changeAccessModeResponse.objects[0]?.error) {
      throw changeAccessModeResponse.objects[0].error;
    }
  }

  let savedObject: SavedObjectsUpdateResponse<DashboardSavedObjectAttributes>;
  try {
    savedObject = await core.savedObjects.client.update<DashboardSavedObjectAttributes>(
      DASHBOARD_SAVED_OBJECT_TYPE,
      id,
      soAttributes,
      {
        references: soReferences,
        /** perform a "full" update instead, where the provided attributes will fully replace the existing ones */
        mergeAttributes: false,
      }
    );
  } catch (e) {
    // if update failed, let's attempt to roll back the access mode change if we changed it
    if (shouldChangeAccessMode) {
      try {
        await core.savedObjects.client.changeAccessMode(
          [{ type: DASHBOARD_SAVED_OBJECT_TYPE, id }],
          {
            accessMode: currentAccessMode,
          }
        );
      } catch {
        // best-effort rollback only
      }
    }
    throw e;
  }

  const updated = await core.savedObjects.client.get<DashboardSavedObjectAttributes>(
    DASHBOARD_SAVED_OBJECT_TYPE,
    savedObject.id
  );

  return {
    body: getDashboardCRUResponseBody(
      updated,
      'update',
      strictValidationSchema,
      isDashboardAppRequest,
      serverTiming
    ),
    operation: 'update',
  };
}
