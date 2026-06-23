/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { IRouter, StartServicesAccessor } from '@kbn/core/server';
import { schema } from '@kbn/config-schema';

import { getDataViewsAsCodeService, handleErrors } from './utils';
import { BASE_PATH, INITIAL_REST_VERSION } from './constants';
import type { DataViewsAsCodeServerPluginStartDependencies } from '../types';

const DELETE_DATA_VIEW_AS_CODE_PATH = BASE_PATH + '/{id}';

export const registerDeleteDataViewAsCodeRoute = (
  router: IRouter,
  getStartServices: StartServicesAccessor<DataViewsAsCodeServerPluginStartDependencies, void>
) =>
  router.versioned
    .delete({
      path: DELETE_DATA_VIEW_AS_CODE_PATH,
      access: 'public',
      description: 'Delete a data view by id',
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
            params: schema.object({
              id: schema.string({
                minLength: 1,
                maxLength: 1_000,
              }),
            }),
          },
          response: {
            200: {
              description: 'deleted',
            },
            403: {
              description: 'forbidden',
            },
            404: {
              description: 'not found',
            },
          },
        },
      },
      handleErrors(async (ctx, req, res) => {
        const id = req.params.id;

        const dataViewsAsCodeService = await getDataViewsAsCodeService(ctx, getStartServices, req);
        await dataViewsAsCodeService.delete(id);

        return res.ok();
      })
    );
