/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { ML_INTERNAL_BASE_PATH } from '../../common/constants/app';
import type { RouteInitialization } from '../types';
import { wrapError } from '../client/error_wrapper';

import { MemoryUsageService } from '../models/model_management';
import { itemTypeLiterals } from './schemas/saved_objects';

export function modelManagementRoutes({
  router,
  routeGuard,
  getEnabledFeatures,
}: RouteInitialization) {
  router.versioned
    .get({
      path: `${ML_INTERNAL_BASE_PATH}/model_management/nodes_overview`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: [
            'ml:canViewMlNodes',
            'ml:canGetDataFrameAnalytics',
            'ml:canGetJobs',
            'ml:canGetTrainedModels',
          ],
        },
      },
      summary: 'Get node overview about the models allocation',
      description: 'Retrieves the list of ML nodes with memory breakdown and allocated models info',
    })
    .addVersion(
      {
        version: '1',
        validate: {},
      },
      routeGuard.fullLicenseAPIGuard(async ({ client, mlClient, response }) => {
        try {
          const memoryUsageService = new MemoryUsageService(mlClient, getEnabledFeatures());
          const result = await memoryUsageService.getNodesOverview();
          return response.ok({
            body: result,
          });
        } catch (e) {
          return response.customError(wrapError(e));
        }
      })
    );

  router.versioned
    .get({
      path: `${ML_INTERNAL_BASE_PATH}/model_management/memory_usage`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: [
            'ml:canGetDataFrameAnalytics',
            'ml:canGetJobs',
            'ml:canGetTrainedModels',
          ],
        },
      },
      summary: 'Get memory usage for jobs and trained models',
      description: 'Retrieves the memory usage for jobs and trained models',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            query: schema.object({
              type: schema.maybe(itemTypeLiterals),
              node: schema.maybe(schema.string({ maxLength: 10000 })),
              showClosedJobs: schema.maybe(schema.boolean()),
            }),
          },
        },
      },

      routeGuard.fullLicenseAPIGuard(async ({ mlClient, response, request }) => {
        try {
          const memoryUsageService = new MemoryUsageService(mlClient, getEnabledFeatures());
          return response.ok({
            body: await memoryUsageService.getMemorySizes(
              request.query.type,
              request.query.node,
              request.query.showClosedJobs
            ),
          });
        } catch (e) {
          return response.customError(wrapError(e));
        }
      })
    );
}
