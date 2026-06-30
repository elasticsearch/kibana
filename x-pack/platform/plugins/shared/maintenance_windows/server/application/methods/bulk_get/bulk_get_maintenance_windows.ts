/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import { isSavedObjectErrorResult } from '@kbn/core/server';
import type {
  BulkGetMaintenanceWindowsParams,
  BulkGetMaintenanceWindowsError,
  BulkGetMaintenanceWindowsResult,
} from './types';
import type { MaintenanceWindow } from '../../types';
import { bulkGetMaintenanceWindowsParamsSchema } from './schemas';
import type { MaintenanceWindowClientContext } from '../../../../common';
import { transformMaintenanceWindowAttributesToMaintenanceWindow } from '../../transforms';
import { bulkGetMaintenanceWindowSo } from '../../../data';

export async function bulkGetMaintenanceWindows(
  context: MaintenanceWindowClientContext,
  params: BulkGetMaintenanceWindowsParams
): Promise<BulkGetMaintenanceWindowsResult> {
  const { savedObjectsClient, logger } = context;
  const { ids } = params;

  try {
    bulkGetMaintenanceWindowsParamsSchema.validate(params);
  } catch (error) {
    throw Boom.badRequest(`Error validating bulk get maintenance window data - ${error.message}`);
  }

  const bulkGetObjects = ids.map((id) => ({ id }));

  try {
    const { saved_objects: savedObjects } = await bulkGetMaintenanceWindowSo({
      objects: bulkGetObjects,
      savedObjectsClient,
    });

    const maintenanceWindows: MaintenanceWindow[] = [];
    const errors: BulkGetMaintenanceWindowsError[] = [];

    savedObjects.forEach((so) => {
      if (isSavedObjectErrorResult(so)) {
        errors.push({
          id: so.id,
          error: so.error.error,
          message: so.error.message,
          statusCode: so.error.statusCode,
        });
      } else {
        maintenanceWindows.push(
          transformMaintenanceWindowAttributesToMaintenanceWindow({
            id: so.id,
            attributes: so.attributes,
          })
        );
      }
    });

    return {
      maintenanceWindows,
      errors,
    };
  } catch (e) {
    const errorMessage = `Failed to bulk get maintenance window for ids: ${ids}, Error: ${e}`;
    logger.error(errorMessage);
    throw Boom.boomify(e, { message: errorMessage });
  }
}
