/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MlSavedObjectType } from '@kbn/ml-common-types/saved_objects';
import { ML_EXTERNAL_BASE_PATH, ML_INTERNAL_BASE_PATH } from '../../common/constants/app';
import { wrapError } from '../client/error_wrapper';
import type { RouteInitialization, SavedObjectsRouteDeps } from '../types';
import { checksFactory, syncSavedObjectsFactory } from '../saved_objects';
import {
  updateJobsSpaces,
  updateTrainedModelsSpaces,
  itemsAndCurrentSpace,
  syncJobObjects,
  syncCheckSchema,
  canDeleteMLSpaceAwareItemsSchema,
  itemTypeSchema,
} from './schemas/saved_objects';
import { spacesUtilsProvider } from '../lib/spaces_utils';

/**
 * Routes for job saved object management
 */
export function savedObjectsRoutes(
  { router, routeGuard }: RouteInitialization,
  { getSpaces, resolveMlCapabilities }: SavedObjectsRouteDeps
) {
  router.versioned
    .get({
      path: `${ML_INTERNAL_BASE_PATH}/saved_objects/status`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canGetJobs', 'ml:canGetTrainedModels'],
        },
      },
      summary: 'Get job and trained model saved object status',
      description:
        'Lists all jobs, trained models and saved objects to view the relationship status between them',
    })
    .addVersion(
      {
        version: '1',
        validate: false,
      },
      routeGuard.fullLicenseAPIGuard(async ({ client, response, mlSavedObjectService }) => {
        try {
          const { checkStatus } = checksFactory(client, mlSavedObjectService);
          const status = await checkStatus();

          return response.ok({
            body: status,
          });
        } catch (e) {
          return response.customError(wrapError(e));
        }
      })
    );

  router.versioned
    .get({
      path: `${ML_EXTERNAL_BASE_PATH}/saved_objects/sync`,
      access: 'public',
      summary: 'Synchronize machine learning saved objects',
      security: {
        authz: {
          requiredPrivileges: [
            'ml:canCreateJob',
            'ml:canCreateDataFrameAnalytics',
            'ml:canCreateTrainedModels',
          ],
        },
      },
      options: {
        tags: ['oas-tag:machine learning'],
      },
      description:
        'Synchronizes Kibana saved objects for machine learning jobs and trained models. This API runs automatically when you start Kibana and periodically thereafter.',
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: {
          request: {
            query: syncJobObjects,
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(
        async ({ client, request, response, mlSavedObjectService }) => {
          try {
            const { simulate, addToAllSpaces } = request.query;
            const { syncSavedObjects } = syncSavedObjectsFactory(client, mlSavedObjectService);
            const savedObjects = await syncSavedObjects(simulate, addToAllSpaces ?? true);

            return response.ok({
              body: savedObjects,
            });
          } catch (e) {
            return response.customError(wrapError(e));
          }
        }
      )
    );

  router.versioned
    .get({
      path: `${ML_INTERNAL_BASE_PATH}/saved_objects/initialize`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: [
            'ml:canCreateJob',
            'ml:canCreateDataFrameAnalytics',
            'ml:canCreateTrainedModels',
          ],
        },
      },
      summary: 'Create saved objects for all job and trained models',
      description:
        'Creates saved objects for machine learning jobs and trained models which are missing them.',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            query: syncJobObjects,
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(
        async ({ client, request, response, mlSavedObjectService }) => {
          try {
            const { simulate } = request.query;
            const { initSavedObjects } = syncSavedObjectsFactory(client, mlSavedObjectService);
            const savedObjects = await initSavedObjects(simulate);

            return response.ok({
              body: savedObjects,
            });
          } catch (e) {
            return response.customError(wrapError(e));
          }
        }
      )
    );

  router.versioned
    .post({
      path: `${ML_INTERNAL_BASE_PATH}/saved_objects/sync_check`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: [
            'ml:canGetJobs',
            'ml:canGetDataFrameAnalytics',
            'ml:canGetTrainedModels',
          ],
        },
      },
      summary: 'Check whether job and trained model saved objects need synchronizing',
      description: 'Check whether job and trained model saved objects need synchronizing.',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: syncCheckSchema,
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(
        async ({ client, request, response, mlSavedObjectService }) => {
          try {
            const { mlSavedObjectType } = request.body;
            const { isSyncNeeded } = syncSavedObjectsFactory(client, mlSavedObjectService);
            const result = await isSyncNeeded(mlSavedObjectType as MlSavedObjectType);

            return response.ok({
              body: { result },
            });
          } catch (e) {
            return response.customError(wrapError(e));
          }
        }
      )
    );

  router.versioned
    .post({
      path: `${ML_INTERNAL_BASE_PATH}/saved_objects/update_jobs_spaces`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canCreateJob', 'ml:canCreateDataFrameAnalytics'],
        },
      },
      summary: 'Update what spaces jobs are assigned to',
      description: 'Update a list of jobs to add and/or remove them from given spaces.',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: updateJobsSpaces,
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(async ({ request, response, mlSavedObjectService }) => {
        try {
          const { jobType, jobIds, spacesToAdd, spacesToRemove } = request.body;

          const body = await mlSavedObjectService.updateJobsSpaces(
            jobType,
            jobIds,
            spacesToAdd,
            spacesToRemove
          );

          return response.ok({
            body,
          });
        } catch (e) {
          return response.customError(wrapError(e));
        }
      })
    );

  router.versioned
    .post({
      path: `${ML_EXTERNAL_BASE_PATH}/saved_objects/update_jobs_spaces`,
      access: 'public',
      security: {
        authz: {
          requiredPrivileges: ['ml:canCreateJob', 'ml:canCreateDataFrameAnalytics'],
        },
      },
      summary: 'Update what spaces jobs are assigned to',
      description: 'Update a list of jobs to add and/or remove them from given spaces.',
      options: {
        tags: ['oas-tag:machine learning'],
        availability: {
          since: '9.3.0',
          stability: 'stable',
        },
      },
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: {
          request: {
            body: updateJobsSpaces,
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(async ({ request, response, mlSavedObjectService }) => {
        try {
          const { jobType, jobIds, spacesToAdd, spacesToRemove } = request.body;

          const body = await mlSavedObjectService.updateJobsSpaces(
            jobType,
            jobIds,
            spacesToAdd,
            spacesToRemove
          );

          return response.ok({
            body,
          });
        } catch (e) {
          return response.customError(wrapError(e));
        }
      })
    );

  router.versioned
    .post({
      path: `${ML_INTERNAL_BASE_PATH}/saved_objects/update_trained_models_spaces`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canCreateTrainedModels'],
        },
      },
      summary: 'Update what spaces trained models are assigned to',
      description: 'Update a list of trained models to add and/or remove them from given spaces.',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: updateTrainedModelsSpaces,
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(async ({ request, response, mlSavedObjectService }) => {
        try {
          const { modelIds, spacesToAdd, spacesToRemove } = request.body;

          const body = await mlSavedObjectService.updateTrainedModelsSpaces(
            modelIds,
            spacesToAdd,
            spacesToRemove
          );

          return response.ok({
            body,
          });
        } catch (e) {
          return response.customError(wrapError(e));
        }
      })
    );

  router.versioned
    .post({
      path: `${ML_EXTERNAL_BASE_PATH}/saved_objects/update_trained_models_spaces`,
      access: 'public',
      security: {
        authz: {
          requiredPrivileges: ['ml:canCreateTrainedModels'],
        },
      },
      summary: 'Update what spaces trained models are assigned to',
      description: 'Update a list of trained models to add and/or remove them from given spaces.',
      options: {
        tags: ['oas-tag:machine learning'],
        availability: {
          since: '9.3.0',
          stability: 'stable',
        },
      },
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: {
          request: {
            body: updateTrainedModelsSpaces,
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(async ({ request, response, mlSavedObjectService }) => {
        try {
          const { modelIds, spacesToAdd, spacesToRemove } = request.body;

          const body = await mlSavedObjectService.updateTrainedModelsSpaces(
            modelIds,
            spacesToAdd,
            spacesToRemove
          );

          return response.ok({
            body,
          });
        } catch (e) {
          return response.customError(wrapError(e));
        }
      })
    );

  router.versioned
    .post({
      path: `${ML_INTERNAL_BASE_PATH}/saved_objects/remove_item_from_current_space`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canCreateJob', 'ml:canCreateDataFrameAnalytics'],
        },
      },
      summary: 'Remove jobs or trained models from the current space',
      description: 'Remove a list of jobs or trained models from the current space.',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: itemsAndCurrentSpace,
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(async ({ request, response, mlSavedObjectService }) => {
        try {
          const { mlSavedObjectType, ids } = request.body;
          const { getCurrentSpaceId } = spacesUtilsProvider(getSpaces, request);

          const currentSpaceId = await getCurrentSpaceId();
          if (currentSpaceId === null) {
            return response.ok({
              body: ids.map((id) => ({
                [id]: {
                  success: false,
                  error: 'Cannot remove current space. Spaces plugin is disabled.',
                },
              })),
            });
          }

          if (mlSavedObjectType === 'trained-model') {
            const body = await mlSavedObjectService.updateTrainedModelsSpaces(
              ids,
              [], // spacesToAdd
              [currentSpaceId] // spacesToRemove
            );

            return response.ok({
              body,
            });
          }

          const body = await mlSavedObjectService.updateJobsSpaces(
            mlSavedObjectType,
            ids,
            [], // spacesToAdd
            [currentSpaceId] // spacesToRemove
          );

          return response.ok({
            body,
          });
        } catch (e) {
          return response.customError(wrapError(e));
        }
      })
    );

  router.versioned
    .get({
      path: `${ML_INTERNAL_BASE_PATH}/saved_objects/jobs_spaces`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canGetJobs', 'ml:canGetDataFrameAnalytics'],
        },
      },
      summary: 'Get all jobs and their spaces',
      description: 'List all jobs and their spaces.',
    })
    .addVersion(
      {
        version: '1',
        validate: false,
      },
      routeGuard.fullLicenseAPIGuard(async ({ response, mlSavedObjectService, client }) => {
        try {
          const { jobsSpaces } = checksFactory(client, mlSavedObjectService);
          const jobsStatus = await jobsSpaces();

          return response.ok({
            body: jobsStatus,
          });
        } catch (e) {
          return response.customError(wrapError(e));
        }
      })
    );

  router.versioned
    .get({
      path: `${ML_INTERNAL_BASE_PATH}/saved_objects/trained_models_spaces`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canGetTrainedModels'],
        },
      },
      summary: 'Get all trained models and their spaces',
      description: 'List all trained models and their spaces.',
    })
    .addVersion(
      {
        version: '1',
        validate: false,
      },
      routeGuard.fullLicenseAPIGuard(async ({ response, mlSavedObjectService, client }) => {
        try {
          const { trainedModelsSpaces } = checksFactory(client, mlSavedObjectService);
          const modelStatus = await trainedModelsSpaces();

          return response.ok({
            body: modelStatus,
          });
        } catch (e) {
          return response.customError(wrapError(e));
        }
      })
    );

  router.versioned
    .post({
      path: `${ML_INTERNAL_BASE_PATH}/saved_objects/can_delete_ml_space_aware_item/{jobType}`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: [
            'ml:canGetJobs',
            'ml:canGetDataFrameAnalytics',
            'ml:canGetTrainedModels',
          ],
        },
      },
      summary: 'Check whether user can delete a job or trained model',
      description: `Check the user's ability to delete jobs or trained models. Returns whether they are able to fully delete the job or trained model and whether they are able to remove it from the current space. Note, this is only for enabling UI controls. A user calling endpoints directly will still be able to delete or remove the job or trained model from a space.`,
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            params: itemTypeSchema,
            body: canDeleteMLSpaceAwareItemsSchema,
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(
        async ({ request, response, mlSavedObjectService, client }) => {
          try {
            const { jobType } = request.params;
            const { ids } = request.body;

            const { canDeleteMLSpaceAwareItems } = checksFactory(client, mlSavedObjectService);
            const body = await canDeleteMLSpaceAwareItems(
              request,
              jobType,
              ids,
              getSpaces !== undefined,
              resolveMlCapabilities
            );

            return response.ok({
              body,
            });
          } catch (e) {
            return response.customError(wrapError(e));
          }
        }
      )
    );

  router.versioned
    .get({
      path: `${ML_INTERNAL_BASE_PATH}/saved_objects/can_sync_to_all_spaces/{mlSavedObjectType?}`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: [
            'ml:canGetJobs',
            'ml:canGetDataFrameAnalytics',
            'ml:canGetTrainedModels',
          ],
        },
      },
      summary: 'Check whether user can sync a job or trained model to the * space',
      description: `Check the user's ability to sync jobs or trained models to the * space. Returns whether they are able to sync the job or trained model to the * space.`,
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            params: syncCheckSchema,
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(async ({ request, response, mlSavedObjectService }) => {
        try {
          const { mlSavedObjectType } = request.params;
          const canSync = await mlSavedObjectService.canCreateGlobalMlSavedObjects(
            request,
            mlSavedObjectType as MlSavedObjectType
          );

          return response.ok({
            body: { canSync },
          });
        } catch (e) {
          return response.customError(wrapError(e));
        }
      })
    );
}
