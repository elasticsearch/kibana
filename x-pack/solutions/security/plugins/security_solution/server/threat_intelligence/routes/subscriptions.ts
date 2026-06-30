/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import {
  DELETE_SUBSCRIPTION_API_PATH,
  LIST_SUBSCRIPTIONS_API_PATH,
  SEVERITY_LEVELS,
  SUBMIT_SUBSCRIPTION_API_PATH,
  THREAT_INTELLIGENCE_API_PRIVILEGES,
  type SeverityLevel,
} from '../../../common/threat_intelligence/hub';
import { deleteSubscription, listSubscriptions, persistSubscription } from '../services';
import { resolveCurrentSpaceId } from '../lib/space_filter';
import type { RouteRegistrationDeps } from '.';

const submitBodySchema = schema.object({
  tags: schema.arrayOf(schema.string({ minLength: 1 }), { minSize: 1 }),
  severity_threshold: schema.string({
    validate: (value) =>
      (SEVERITY_LEVELS as readonly string[]).includes(value)
        ? undefined
        : `severity_threshold must be one of: ${SEVERITY_LEVELS.join(', ')}`,
  }),
  schedule_rrule: schema.string({ minLength: 1 }),
  delivery: schema.object({
    type: schema.oneOf([schema.literal('email'), schema.literal('slack')]),
    target: schema.string({ minLength: 1 }),
    connector_id: schema.maybe(schema.string({ minLength: 1 })),
  }),
  template_id: schema.maybe(schema.string({ minLength: 1 })),
});

const listBodySchema = schema.object({
  size: schema.maybe(schema.number({ min: 1, max: 100 })),
});

const deleteBodySchema = schema.object({
  subscription_id: schema.string({ minLength: 1 }),
});

/**
 * Subscription routes — the canonical execution surface for the
 * `manage_subscriptions` domain action plus the legacy `submit` path used
 * by the editable confirmation attachment.
 *
 * - POST `/api/threat_intelligence/subscriptions/submit` — preserved for the
 *   interactive confirmation card. Posts directly from the browser-side
 *   renderer so a follow-up agent round-trip isn't required.
 * - POST `/api/threat_intelligence/subscriptions/list` — list subscriptions
 *   visible from the current space.
 * - POST `/api/threat_intelligence/subscriptions/delete` — remove a
 *   subscription by id.
 *
 * All three delegate to shared service helpers in `services/manage_subscriptions.ts`.
 * (POST is used for list/delete to keep payload validation symmetrical
 *  with the `manage_subscriptions` tool action shape.)
 */
export const registerSubscriptionRoutes = ({
  router,
  logger,
  getSpacesService,
}: RouteRegistrationDeps): void => {
  router.versioned
    .post({
      path: SUBMIT_SUBSCRIPTION_API_PATH,
      access: 'public',
      security: {
        authz: {
          requiredPrivileges: [THREAT_INTELLIGENCE_API_PRIVILEGES.writeSubscriptions],
        },
      },
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: { request: { body: submitBodySchema } },
      },
      async (context, request, response) => {
        const core = await context.core;
        const esClient = core.elasticsearch.client.asCurrentUser;
        const spaceId = resolveCurrentSpaceId(getSpacesService(), request);
        try {
          const result = await persistSubscription(esClient, {
            tags: request.body.tags,
            severity_threshold: request.body.severity_threshold as SeverityLevel,
            schedule_rrule: request.body.schedule_rrule,
            delivery: request.body.delivery,
            template_id: request.body.template_id,
            space_id: spaceId,
          });
          return response.ok({
            body: {
              status: 'created',
              subscription_id: result.subscription_id,
              human_summary: result.human_summary,
              template_id: request.body.template_id,
            },
          });
        } catch (err) {
          logger.warn(`submit_subscription failed: ${(err as Error).message}`);
          return response.customError({
            statusCode: 500,
            body: { message: `Failed to persist subscription: ${(err as Error).message}` },
          });
        }
      }
    );

  router.versioned
    .post({
      path: LIST_SUBSCRIPTIONS_API_PATH,
      access: 'public',
      security: {
        authz: {
          requiredPrivileges: [THREAT_INTELLIGENCE_API_PRIVILEGES.read],
        },
      },
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: { request: { body: listBodySchema } },
      },
      async (context, request, response) => {
        const core = await context.core;
        const esClient = core.elasticsearch.client.asCurrentUser;
        const spaceId = resolveCurrentSpaceId(getSpacesService(), request);
        try {
          const result = await listSubscriptions(
            esClient,
            logger,
            spaceId,
            request.body.size ?? 20
          );
          return response.ok({ body: result });
        } catch (err) {
          logger.warn(`list_subscriptions failed: ${(err as Error).message}`);
          return response.customError({
            statusCode: 500,
            body: { message: `Failed to list subscriptions: ${(err as Error).message}` },
          });
        }
      }
    );

  router.versioned
    .post({
      path: DELETE_SUBSCRIPTION_API_PATH,
      access: 'public',
      security: {
        authz: {
          requiredPrivileges: [THREAT_INTELLIGENCE_API_PRIVILEGES.writeSubscriptions],
        },
      },
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: { request: { body: deleteBodySchema } },
      },
      async (context, request, response) => {
        const core = await context.core;
        const esClient = core.elasticsearch.client.asCurrentUser;
        const spaceId = resolveCurrentSpaceId(getSpacesService(), request);
        try {
          const result = await deleteSubscription(esClient, request.body.subscription_id, spaceId);
          if (result.status === 'not_found') {
            return response.notFound({
              body: { message: `Subscription not found in the current space` },
            });
          }
          return response.ok({ body: result });
        } catch (err) {
          logger.warn(`delete_subscription failed: ${(err as Error).message}`);
          return response.customError({
            statusCode: 500,
            body: { message: `Failed to delete subscription: ${(err as Error).message}` },
          });
        }
      }
    );
};
