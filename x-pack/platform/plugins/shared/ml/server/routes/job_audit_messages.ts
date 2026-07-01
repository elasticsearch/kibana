/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ML_INTERNAL_BASE_PATH } from '../../common/constants/app';
import { wrapError } from '../client/error_wrapper';
import type { RouteInitialization } from '../types';
import { jobAuditMessagesProvider } from '../models/job_audit_messages';
import {
  jobAuditMessagesQuerySchema,
  jobAuditMessagesJobIdSchema,
  clearJobAuditMessagesBodySchema,
} from './schemas/job_audit_messages_schema';

/**
 * Routes for job audit message routes
 */
export function jobAuditMessagesRoutes({ router, routeGuard }: RouteInitialization) {
  router.versioned
    .get({
      path: `${ML_INTERNAL_BASE_PATH}/job_audit_messages/messages/{jobId}`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canGetJobs'],
        },
      },
      summary: 'Gets audit messages',
      description: 'Retrieves the audit messages for the specified job ID.',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            params: jobAuditMessagesJobIdSchema,
            query: jobAuditMessagesQuerySchema,
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(
        async ({ client, mlClient, request, response, mlSavedObjectService, serverless }) => {
          try {
            const { getJobAuditMessages } = jobAuditMessagesProvider(client, mlClient, serverless);
            const { jobId } = request.params;
            const { from, start, end } = request.query;
            const resp = await getJobAuditMessages(mlSavedObjectService, {
              jobId,
              from,
              start,
              end,
            });

            return response.ok({
              body: resp,
            });
          } catch (e) {
            return response.customError(wrapError(e));
          }
        }
      )
    );

  router.versioned
    .get({
      path: `${ML_INTERNAL_BASE_PATH}/job_audit_messages/messages`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canGetJobs'],
        },
      },
      summary: 'Gets all audit messages',
      description: 'Retrieves all audit messages.',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            query: jobAuditMessagesQuerySchema,
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(
        async ({ client, mlClient, request, response, mlSavedObjectService, serverless }) => {
          try {
            const { getJobAuditMessages } = jobAuditMessagesProvider(client, mlClient, serverless);
            const { from } = request.query;
            const resp = await getJobAuditMessages(mlSavedObjectService, { from });

            return response.ok({
              body: resp,
            });
          } catch (e) {
            return response.customError(wrapError(e));
          }
        }
      )
    );

  router.versioned
    .put({
      path: `${ML_INTERNAL_BASE_PATH}/job_audit_messages/clear_messages`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canCreateJob'],
        },
      },
      summary: 'Clear messages',
      description: 'Clear the job audit messages.',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            body: clearJobAuditMessagesBodySchema,
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(
        async ({ client, mlClient, request, response, serverless }) => {
          try {
            const { clearJobAuditMessages } = jobAuditMessagesProvider(
              client,
              mlClient,
              serverless
            );
            const { jobId, notificationIndices } = request.body;
            const resp = await clearJobAuditMessages(jobId, notificationIndices);

            return response.ok({
              body: resp,
            });
          } catch (e) {
            return response.customError(wrapError(e));
          }
        }
      )
    );
}
