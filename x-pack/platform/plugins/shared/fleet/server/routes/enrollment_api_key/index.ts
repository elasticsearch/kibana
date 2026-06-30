/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import path from 'path';

import { schema } from '@kbn/config-schema';

import type { FleetAuthzRouter } from '../../services/security';

import { ENROLLMENT_API_KEY_ROUTES } from '../../constants';
import { API_VERSIONS } from '../../../common/constants';

import {
  GetEnrollmentAPIKeysRequestSchema,
  GetOneEnrollmentAPIKeyRequestSchema,
  DeleteEnrollmentAPIKeyRequestSchema,
  PostEnrollmentAPIKeyRequestSchema,
  BulkDeleteEnrollmentAPIKeysRequestSchema,
  EnrollmentAPIKeySchema,
  EnrollmentAPIKeyResponseSchema,
  DeleteEnrollmentAPIKeyResponseSchema,
  BulkDeleteEnrollmentAPIKeysResponseSchema,
} from '../../types';

import { genericErrorResponse } from '../schema/errors';
import { FLEET_API_PRIVILEGES } from '../../constants/api_privileges';
import { ListResponseSchema } from '../schema/utils';

import {
  getEnrollmentApiKeysHandler,
  getOneEnrollmentApiKeyHandler,
  deleteEnrollmentApiKeyHandler,
  postEnrollmentApiKeyHandler,
  bulkDeleteEnrollmentApiKeysHandler,
} from './handler';

export const registerRoutes = (router: FleetAuthzRouter) => {
  router.versioned
    .get({
      path: ENROLLMENT_API_KEY_ROUTES.INFO_PATTERN,
      security: {
        authz: {
          requiredPrivileges: [
            {
              anyRequired: [FLEET_API_PRIVILEGES.AGENTS.ALL, FLEET_API_PRIVILEGES.SETUP],
            },
          ],
        },
      },
      summary: `Get an enrollment API key`,
      description: `Get an enrollment API key by ID.`,
      options: {
        tags: ['oas-tag:Fleet enrollment API keys'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        options: {
          oasOperationObject: () => path.join(__dirname, 'examples/get_enrollment_api_key.yaml'),
        },
        validate: {
          request: GetOneEnrollmentAPIKeyRequestSchema,
          response: {
            200: {
              description: 'OK: A successful request.',
              body: () => EnrollmentAPIKeyResponseSchema,
            },
            400: {
              description: 'A bad request.',
              body: genericErrorResponse,
            },
          },
        },
      },
      getOneEnrollmentApiKeyHandler
    );

  router.versioned
    .delete({
      path: ENROLLMENT_API_KEY_ROUTES.DELETE_PATTERN,
      security: {
        authz: {
          requiredPrivileges: [FLEET_API_PRIVILEGES.AGENTS.ALL],
        },
      },
      summary: 'Revoke or delete an enrollment API key',
      description:
        'Revoke or delete an enrollment API key by ID. Use `forceDelete=true` to remove the document.',
      options: {
        tags: ['oas-tag:Fleet enrollment API keys'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        options: {
          oasOperationObject: () => path.join(__dirname, 'examples/delete_enrollment_api_key.yaml'),
        },
        validate: {
          request: DeleteEnrollmentAPIKeyRequestSchema,
          response: {
            200: {
              description: 'OK: A successful request.',
              body: () => DeleteEnrollmentAPIKeyResponseSchema,
            },
            400: {
              description: 'A bad request.',
              body: genericErrorResponse,
            },
          },
        },
      },
      deleteEnrollmentApiKeyHandler
    );

  router.versioned
    .get({
      path: ENROLLMENT_API_KEY_ROUTES.LIST_PATTERN,
      security: {
        authz: {
          requiredPrivileges: [
            {
              anyRequired: [FLEET_API_PRIVILEGES.AGENTS.ALL, FLEET_API_PRIVILEGES.SETUP],
            },
          ],
        },
      },
      summary: `Get enrollment API keys`,
      description: `List all enrollment API keys.`,
      options: {
        tags: ['oas-tag:Fleet enrollment API keys'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        options: {
          oasOperationObject: () => path.join(__dirname, 'examples/get_enrollment_api_keys.yaml'),
        },
        validate: {
          request: GetEnrollmentAPIKeysRequestSchema,
          response: {
            200: {
              description: 'OK: A successful request.',
              body: () =>
                ListResponseSchema(EnrollmentAPIKeySchema).extends(
                  {
                    list: schema.arrayOf(EnrollmentAPIKeySchema, {
                      meta: { deprecated: true },
                      maxSize: 10000,
                    }),
                  },
                  { meta: { id: 'get_enrollment_api_keys_response' } }
                ),
            },
            400: {
              description: 'A bad request.',
              body: genericErrorResponse,
            },
          },
        },
      },
      getEnrollmentApiKeysHandler
    );

  router.versioned
    .post({
      path: ENROLLMENT_API_KEY_ROUTES.BULK_DELETE_PATTERN,
      security: {
        authz: {
          requiredPrivileges: [FLEET_API_PRIVILEGES.AGENTS.ALL],
        },
      },
      summary: `Bulk revoke or delete enrollment API keys`,
      description: `Revoke or delete multiple enrollment API keys.`,
      options: {
        tags: ['oas-tag:Fleet enrollment API keys'],
        availability: {
          stability: 'stable',
          since: '9.5.0',
        },
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        options: {
          oasOperationObject: () =>
            path.join(__dirname, 'examples/bulk_delete_enrollment_api_keys.yaml'),
        },
        validate: {
          request: BulkDeleteEnrollmentAPIKeysRequestSchema,
          response: {
            200: {
              description: 'OK: A successful request',
              body: () => BulkDeleteEnrollmentAPIKeysResponseSchema,
            },
            400: {
              description: 'A bad request',
              body: genericErrorResponse,
            },
          },
        },
      },
      bulkDeleteEnrollmentApiKeysHandler
    );

  router.versioned
    .post({
      path: ENROLLMENT_API_KEY_ROUTES.CREATE_PATTERN,
      security: {
        authz: {
          requiredPrivileges: [FLEET_API_PRIVILEGES.AGENTS.ALL],
        },
      },
      summary: `Create an enrollment API key`,
      description: `Create an enrollment API key for a given agent policy.`,
      options: {
        tags: ['oas-tag:Fleet enrollment API keys'],
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        options: {
          oasOperationObject: () => path.join(__dirname, 'examples/post_enrollment_api_key.yaml'),
        },
        validate: {
          request: PostEnrollmentAPIKeyRequestSchema,
          response: {
            200: {
              description: 'OK: A successful request.',
              body: () =>
                EnrollmentAPIKeyResponseSchema.extends(
                  {
                    action: schema.literal('created'),
                  },
                  { meta: { id: 'create_enrollment_api_key_response' } }
                ),
            },
            400: {
              description: 'A bad request.',
              body: genericErrorResponse,
            },
          },
        },
      },
      postEnrollmentApiKeyHandler
    );
};
