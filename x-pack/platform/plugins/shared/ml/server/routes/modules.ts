/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TypeOf } from '@kbn/config-schema';

import { type CompatibleModule, ML_INTERNAL_BASE_PATH } from '../../common/constants/app';
import { wrapError } from '../client/error_wrapper';
import { dataRecognizerFactory } from '../models/data_recognizer';
import {
  moduleIdParamSchema,
  moduleFilterSchema,
  optionalModuleIdParamSchema,
  optionalSizeQuerySchema,
  recognizeModulesSchema,
  setupModuleBodySchema,
  recognizeModulesSchemaResponse,
  getModulesSchemaResponse,
  dataRecognizerConfigResponse,
  jobExistsResponse,
} from './schemas/modules';
import type { RouteInitialization } from '../types';

/**
 * Recognizer routes.
 */
export function dataRecognizer(
  { router, routeGuard }: RouteInitialization,
  compatibleModuleType: CompatibleModule | null
) {
  router.versioned
    .get({
      path: `${ML_INTERNAL_BASE_PATH}/modules/recognize/{indexPatternTitle}`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canCreateJob'],
        },
      },
      summary: 'Recognize index pattern',
      description:
        'By supplying an index pattern, discover if any of the modules are a match for data in that index.',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            params: recognizeModulesSchema,
            query: moduleFilterSchema,
          },
          response: {
            200: {
              body: recognizeModulesSchemaResponse,
            },
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(
        async ({
          client,
          mlClient,
          request,
          response,
          context,
          mlSavedObjectService,
          getDataViewsService,
          serverless,
        }) => {
          try {
            const { indexPatternTitle } = request.params;
            const filter = request.query.filter?.split(',');
            const soClient = (await context.core).savedObjects.client;
            const dataViewsService = await getDataViewsService();

            const dr = dataRecognizerFactory(
              client,
              mlClient,
              soClient,
              dataViewsService,
              mlSavedObjectService,
              request,
              compatibleModuleType,
              serverless
            );
            const results = await dr.findMatches(indexPatternTitle, filter);

            return response.ok({ body: results });
          } catch (e) {
            return response.customError(wrapError(e));
          }
        }
      )
    );

  router.versioned
    .get({
      path: `${ML_INTERNAL_BASE_PATH}/modules/recognize_by_module/{moduleId}`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canCreateJob'],
        },
      },
      summary: 'Recognize module',
      description:
        'By supplying a module id, discover if any of the data views contain data that is a match for that module.',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            params: moduleIdParamSchema,
            query: optionalSizeQuerySchema,
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(
        async ({
          client,
          mlClient,
          request,
          response,
          context,
          mlSavedObjectService,
          getDataViewsService,
          serverless,
        }) => {
          try {
            const { moduleId } = request.params;
            const { size } = request.query;
            const soClient = (await context.core).savedObjects.client;
            const dataViewsService = await getDataViewsService();

            const dr = dataRecognizerFactory(
              client,
              mlClient,
              soClient,
              dataViewsService,
              mlSavedObjectService,
              request,
              compatibleModuleType,
              serverless
            );
            const results = await dr.findIndexMatches(moduleId, size);

            return response.ok({ body: results });
          } catch (e) {
            return response.customError(wrapError(e));
          }
        }
      )
    );

  router.versioned
    .get({
      path: `${ML_INTERNAL_BASE_PATH}/modules/get_module/{moduleId?}`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canGetJobs'],
        },
      },
      summary: 'Get module',
      description:
        'Retrieve a whole ML module, containing jobs, datafeeds and saved objects. If no module ID is supplied, returns all modules.',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            params: optionalModuleIdParamSchema,
            query: moduleFilterSchema,
          },
          response: {
            200: {
              body: getModulesSchemaResponse,
              description:
                'When a module ID is specified, returns a module object containing all of the jobs, datafeeds and saved objects which will be created when the module is setup. If no module ID is supplied, an array of all modules will be returned.',
            },
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(
        async ({
          client,
          mlClient,
          request,
          response,
          context,
          mlSavedObjectService,
          getDataViewsService,
          serverless,
        }) => {
          try {
            let { moduleId } = request.params;
            const filter = request.query.filter?.split(',');
            if (moduleId === '') {
              // if the endpoint is called with a trailing /
              // the moduleId will be an empty string.
              moduleId = undefined;
            }
            const soClient = (await context.core).savedObjects.client;
            const dataViewsService = await getDataViewsService();

            const dr = dataRecognizerFactory(
              client,
              mlClient,
              soClient,
              dataViewsService,
              mlSavedObjectService,
              request,
              compatibleModuleType,
              serverless
            );

            const results =
              moduleId === undefined
                ? await dr.listModules(filter)
                : await dr.getModule(moduleId, filter);

            return response.ok({ body: results });
          } catch (e) {
            return response.customError(wrapError(e));
          }
        }
      )
    );

  router.versioned
    .post({
      path: `${ML_INTERNAL_BASE_PATH}/modules/setup/{moduleId}`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canCreateJob'],
        },
      },
      summary: 'Setup module',
      description:
        'Runs the module setup process. This creates jobs, datafeeds and kibana saved objects. It allows for customization of the module, overriding the default configuration. It also allows the user to start the datafeed.',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            params: moduleIdParamSchema,
            body: setupModuleBodySchema,
          },
          response: {
            200: {
              body: dataRecognizerConfigResponse,
              description:
                'An object containing the results of creating the items in a module, i.e. the jobs, datafeeds and saved objects. Each item is listed by id with a success flag signifying whether the creation was successful. If the item creation failed, an error object will also be supplied containing the error.',
            },
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(
        async ({
          client,
          mlClient,
          request,
          response,
          context,
          mlSavedObjectService,
          getDataViewsService,
          serverless,
        }) => {
          try {
            const { moduleId } = request.params;

            const {
              prefix,
              groups,
              indexPatternName,
              query,
              useDedicatedIndex,
              startDatafeed,
              start,
              end,
              jobOverrides,
              datafeedOverrides,
              estimateModelMemory,
              applyToAllSpaces,
              projectRouting,
            } = request.body as TypeOf<typeof setupModuleBodySchema>;
            const soClient = (await context.core).savedObjects.client;
            const dataViewsService = await getDataViewsService();

            const dr = dataRecognizerFactory(
              client,
              mlClient,
              soClient,
              dataViewsService,
              mlSavedObjectService,
              request,
              compatibleModuleType,
              serverless
            );
            const result = await dr.setup(
              moduleId,
              prefix,
              groups,
              indexPatternName,
              query,
              useDedicatedIndex,
              startDatafeed,
              start,
              end,
              jobOverrides,
              datafeedOverrides,
              estimateModelMemory,
              applyToAllSpaces,
              projectRouting
            );

            return response.ok({ body: result });
          } catch (e) {
            return response.customError(wrapError(e));
          }
        }
      )
    );

  /**

   * @apiSuccess {boolean} jobsExist <code>true</code> if all the jobs in the module have a matching job with an
   *      ID which ends with the job ID specified in the module, <code>false</code> otherwise.
   * @apiSuccess {Object[]} jobs  present if the jobs do all exist, with each object having keys of <code>id</code>,
   *      and optionally <code>earliestTimestampMs</code>, <code>latestTimestampMs</code>, <code>latestResultsTimestampMs</code>
   *      properties if the job has processed any data.
   */
  router.versioned
    .get({
      path: `${ML_INTERNAL_BASE_PATH}/modules/jobs_exist/{moduleId}`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canGetJobs'],
        },
      },
      summary: 'Check if module jobs exist',
      description: `Check whether the jobs in the module with the specified ID exist in the current list of jobs. The check runs a test to see if any of the jobs in existence have an ID which ends with the ID of each job in the module. This is done as a prefix may be supplied in the setup endpoint which is added to the start of the ID of every job in the module.`,
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            params: moduleIdParamSchema,
          },
          response: {
            200: {
              body: jobExistsResponse,
              description:
                'jobs  present if the jobs do all exist, with each object having keys of <code>id</code>, and optionally <code>earliestTimestampMs</code>, <code>latestTimestampMs</code>, <code>latestResultsTimestampMs</code> properties if the job has processed any data.',
            },
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(
        async ({
          client,
          mlClient,
          request,
          response,
          context,
          mlSavedObjectService,
          getDataViewsService,
          serverless,
        }) => {
          try {
            const { moduleId } = request.params;
            const soClient = (await context.core).savedObjects.client;
            const dataViewsService = await getDataViewsService();

            const dr = dataRecognizerFactory(
              client,
              mlClient,
              soClient,
              dataViewsService,
              mlSavedObjectService,
              request,
              compatibleModuleType,
              serverless
            );
            const result = await dr.dataRecognizerJobsExist(moduleId);

            return response.ok({ body: result });
          } catch (e) {
            return response.customError(wrapError(e));
          }
        }
      )
    );
}
