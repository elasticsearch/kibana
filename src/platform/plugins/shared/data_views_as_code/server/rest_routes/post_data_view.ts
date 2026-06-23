/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { IRouter, StartServicesAccessor } from '@kbn/core/server';
import { asCodeResponseSchema, savedDataViewSpecSchemaWithoutId } from './schema';
import { getDataViewsAsCodeService, handleErrors } from './utils';
import { BASE_PATH, INITIAL_REST_VERSION } from './constants';
import type { DataViewsAsCodeServerPluginStartDependencies } from '../types';

const CREATE_DATA_VIEW_AS_CODE_PATH = BASE_PATH;

export const registerPostDataViewAsCodeRoute = (
  router: IRouter,
  getStartServices: StartServicesAccessor<DataViewsAsCodeServerPluginStartDependencies, void>
) =>
  router.versioned
    .post({
      path: CREATE_DATA_VIEW_AS_CODE_PATH,
      access: 'public',
      description: 'Create a data view',
      security: {
        authz: {
          requiredPrivileges: ['indexPatterns:manage'],
        },
      },
    })
    .addVersion(
      {
        version: INITIAL_REST_VERSION,
        validate: {
          request: {
            body: savedDataViewSpecSchemaWithoutId,
          },
          response: {
            201: {
              body: () => asCodeResponseSchema,
            },
            400: {
              description: 'invalid request',
            },
            403: {
              description: 'forbidden',
            },
            409: {
              description: 'conflict',
            },
          },
        },
      },
      handleErrors(async (ctx, req, res) => {
        const dataViewsAsCodeService = await getDataViewsAsCodeService(ctx, getStartServices, req);
        const storedDataView = await dataViewsAsCodeService.create(req.body);

        return res.created({ body: storedDataView });
      })
    );
