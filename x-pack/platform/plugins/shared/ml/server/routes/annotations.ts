/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import { i18n } from '@kbn/i18n';

import type { SecurityPluginSetup } from '@kbn/security-plugin/server';
import { ML_INTERNAL_BASE_PATH } from '../../common/constants/app';
import { isAnnotationsFeatureAvailable } from '../lib/check_annotations';
import { annotationServiceProvider } from '../models/annotation_service';
import { wrapError } from '../client/error_wrapper';
import type { RouteInitialization } from '../types';
import {
  annotationsResponseSchema,
  deleteAnnotationSchema,
  getAnnotationsSchema,
  indexAnnotationSchema,
} from './schemas/annotations_schema';

import { ANNOTATION_USER_UNKNOWN } from '../../common/constants/annotations';

function getAnnotationsFeatureUnavailableErrorMessage() {
  return Boom.badRequest(
    i18n.translate('xpack.ml.routes.annotations.annotationsFeatureUnavailableErrorMessage', {
      defaultMessage:
        'Index and aliases required for the annotations feature have not been' +
        ' created or are not accessible for the current user.',
    })
  );
}
/**
 * Routes for annotations
 */
export function annotationRoutes(
  { router, routeGuard }: RouteInitialization,
  securityPlugin?: SecurityPluginSetup
) {
  /**
   * @apiGroup Annotations
   */
  router.versioned
    .post({
      path: `${ML_INTERNAL_BASE_PATH}/annotations`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canGetAnnotations'],
        },
      },
      summary: 'Gets annotations',
      description: 'Gets annotations.',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: { body: getAnnotationsSchema },
          response: {
            200: { body: annotationsResponseSchema, description: 'Get annotations response' },
          },
        },
      },
      routeGuard.fullLicenseAPIGuard(async ({ client, request, response, serverless }) => {
        try {
          const { getAnnotations } = annotationServiceProvider(client, serverless);
          const resp = await getAnnotations(request.body);

          return response.ok({
            body: resp,
          });
        } catch (e) {
          return response.customError(wrapError(e));
        }
      })
    );

  /**
   * @apiGroup Annotations
   */
  router.versioned
    .put({
      path: `${ML_INTERNAL_BASE_PATH}/annotations/index`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canCreateAnnotation'],
        },
      },
      summary: 'Indexes annotation',
      description: 'Indexes the annotation.',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: { body: indexAnnotationSchema },
        },
      },
      routeGuard.fullLicenseAPIGuard(async ({ client, request, response, serverless }) => {
        try {
          const annotationsFeatureAvailable = await isAnnotationsFeatureAvailable(client);
          if (annotationsFeatureAvailable === false) {
            throw getAnnotationsFeatureUnavailableErrorMessage();
          }

          const { indexAnnotation } = annotationServiceProvider(client, serverless);

          const currentUser =
            securityPlugin !== undefined ? securityPlugin.authc.getCurrentUser(request) : {};
          // @ts-expect-error username doesn't exist on {}
          const username = currentUser?.username ?? ANNOTATION_USER_UNKNOWN;
          const resp = await indexAnnotation(request.body, username);

          return response.ok({
            body: resp,
          });
        } catch (e) {
          return response.customError(wrapError(e));
        }
      })
    );

  /**
   * @apiGroup Annotations
   */
  router.versioned
    .delete({
      path: `${ML_INTERNAL_BASE_PATH}/annotations/delete/{annotationId}`,
      access: 'internal',
      security: {
        authz: {
          requiredPrivileges: ['ml:canDeleteAnnotation'],
        },
      },
      summary: 'Deletes annotation',
      description: 'Deletes the specified annotation.',
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: { params: deleteAnnotationSchema },
        },
      },
      routeGuard.fullLicenseAPIGuard(async ({ client, request, response, serverless }) => {
        try {
          const annotationsFeatureAvailable = await isAnnotationsFeatureAvailable(client);
          if (annotationsFeatureAvailable === false) {
            throw getAnnotationsFeatureUnavailableErrorMessage();
          }

          const annotationId = request.params.annotationId;
          const { deleteAnnotation } = annotationServiceProvider(client, serverless);
          const resp = await deleteAnnotation(annotationId);

          return response.ok({
            body: resp,
          });
        } catch (e) {
          return response.customError(wrapError(e));
        }
      })
    );
}
