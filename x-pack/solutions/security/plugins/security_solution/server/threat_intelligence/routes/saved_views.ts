/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import {
  SAVED_VIEWS_API_PATH,
  SAVED_VIEW_SO_TYPE,
  THREAT_CATEGORIES,
  THREAT_INTELLIGENCE_API_PRIVILEGES,
  THREAT_REGIONS,
  TIME_RANGE_PRESET_IDS,
  type SavedViewAttributes,
  type SavedViewSummary,
} from '../../../common/threat_intelligence/hub';
import type { RouteRegistrationDeps } from '.';

const filtersSchema = schema.object({
  regions: schema.maybe(
    schema.arrayOf(
      schema.string({
        validate: (value) =>
          (THREAT_REGIONS as readonly string[]).includes(value)
            ? undefined
            : `unknown region: ${value}`,
      })
    )
  ),
  categories: schema.maybe(
    schema.arrayOf(
      schema.string({
        validate: (value) =>
          (THREAT_CATEGORIES as readonly string[]).includes(value)
            ? undefined
            : `unknown category: ${value}`,
      })
    )
  ),
  time_range_preset: schema.maybe(
    schema.oneOf([
      schema.literal(TIME_RANGE_PRESET_IDS[0]),
      schema.literal(TIME_RANGE_PRESET_IDS[1]),
      schema.literal(TIME_RANGE_PRESET_IDS[2]),
      schema.literal(TIME_RANGE_PRESET_IDS[3]),
    ])
  ),
  time_range: schema.maybe(
    schema.object({
      from: schema.string(),
      to: schema.string(),
    })
  ),
});

const createBodySchema = schema.object({
  name: schema.string({ minLength: 1, maxLength: 120 }),
  description: schema.maybe(schema.string({ maxLength: 2000 })),
  filters: filtersSchema,
});

const updateBodySchema = schema.object({
  name: schema.maybe(schema.string({ minLength: 1, maxLength: 120 })),
  description: schema.maybe(schema.string({ maxLength: 2000 })),
  filters: schema.maybe(filtersSchema),
});

const toSummary = (id: string, attributes: SavedViewAttributes): SavedViewSummary => ({
  id,
  ...attributes,
});

/**
 * CRUD routes for `threat-intelligence-saved-view` saved objects. Reads
 * (`GET` list, `GET` one) gate on the `read` privilege; writes (`POST`,
 * `PUT`, `DELETE`) gate on `writeSubscriptions` because saved views are
 * user-owned artifacts (same authoring tier as subscriptions). Power
 * users with the `manageSources` admin sub-feature get the full
 * management UI via the saved-objects management plugin.
 */
export const registerSavedViewsRoutes = ({ router, logger }: RouteRegistrationDeps): void => {
  // -------- LIST --------
  router.versioned
    .get({
      path: SAVED_VIEWS_API_PATH,
      access: 'public',
      security: {
        authz: { requiredPrivileges: [THREAT_INTELLIGENCE_API_PRIVILEGES.read] },
      },
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: {
          request: {
            query: schema.object({
              perPage: schema.maybe(schema.number({ min: 1, max: 100, defaultValue: 50 })),
              search: schema.maybe(schema.string({ maxLength: 200 })),
            }),
          },
        },
      },
      async (context, request, response) => {
        const core = await context.core;
        try {
          const result = await core.savedObjects.client.find<SavedViewAttributes>({
            type: SAVED_VIEW_SO_TYPE,
            perPage: request.query.perPage ?? 50,
            search: request.query.search,
            searchFields: ['name', 'description'],
            sortField: 'updated_at',
            sortOrder: 'desc',
          });
          return response.ok({
            body: {
              total: result.total,
              views: result.saved_objects.map((so) => toSummary(so.id, so.attributes)),
            },
          });
        } catch (err) {
          logger.warn(`saved_views list failed: ${(err as Error).message}`);
          return response.customError({
            statusCode: 500,
            body: { message: `Failed to list saved views: ${(err as Error).message}` },
          });
        }
      }
    );

  // -------- GET ONE --------
  router.versioned
    .get({
      path: `${SAVED_VIEWS_API_PATH}/{id}`,
      access: 'public',
      security: {
        authz: { requiredPrivileges: [THREAT_INTELLIGENCE_API_PRIVILEGES.read] },
      },
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: {
          request: {
            params: schema.object({ id: schema.string({ minLength: 1 }) }),
          },
        },
      },
      async (context, request, response) => {
        const core = await context.core;
        try {
          const so = await core.savedObjects.client.get<SavedViewAttributes>(
            SAVED_VIEW_SO_TYPE,
            request.params.id
          );
          return response.ok({ body: toSummary(so.id, so.attributes) });
        } catch (err) {
          const status = (err as { output?: { statusCode?: number } }).output?.statusCode;
          if (status === 404) {
            return response.notFound({ body: { message: 'Saved view not found' } });
          }
          logger.warn(`saved_views get failed: ${(err as Error).message}`);
          return response.customError({
            statusCode: 500,
            body: { message: `Failed to get saved view: ${(err as Error).message}` },
          });
        }
      }
    );

  // -------- CREATE --------
  router.versioned
    .post({
      path: SAVED_VIEWS_API_PATH,
      access: 'public',
      security: {
        authz: { requiredPrivileges: [THREAT_INTELLIGENCE_API_PRIVILEGES.writeSubscriptions] },
      },
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: { request: { body: createBodySchema } },
      },
      async (context, request, response) => {
        const core = await context.core;
        const now = new Date().toISOString();
        try {
          // The config-schema validators above guarantee each string in
          // `regions` / `categories` is a valid enum value at runtime; the
          // narrower TS type isn't inferred so we cast at the boundary.
          const filtersTyped = request.body.filters as SavedViewAttributes['filters'];
          const so = await core.savedObjects.client.create<SavedViewAttributes>(
            SAVED_VIEW_SO_TYPE,
            {
              name: request.body.name,
              description: request.body.description,
              filters: filtersTyped,
              created_at: now,
              updated_at: now,
            }
          );
          return response.ok({ body: toSummary(so.id, so.attributes) });
        } catch (err) {
          logger.warn(`saved_views create failed: ${(err as Error).message}`);
          return response.customError({
            statusCode: 500,
            body: { message: `Failed to create saved view: ${(err as Error).message}` },
          });
        }
      }
    );

  // -------- UPDATE --------
  router.versioned
    .put({
      path: `${SAVED_VIEWS_API_PATH}/{id}`,
      access: 'public',
      security: {
        authz: { requiredPrivileges: [THREAT_INTELLIGENCE_API_PRIVILEGES.writeSubscriptions] },
      },
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: {
          request: {
            params: schema.object({ id: schema.string({ minLength: 1 }) }),
            body: updateBodySchema,
          },
        },
      },
      async (context, request, response) => {
        const core = await context.core;
        const now = new Date().toISOString();
        try {
          const patch: Partial<SavedViewAttributes> = {
            updated_at: now,
            ...(request.body.name !== undefined && { name: request.body.name }),
            ...(request.body.description !== undefined && {
              description: request.body.description,
            }),
            ...(request.body.filters !== undefined && {
              // Same boundary cast as the create path — the runtime values
              // are validated by config-schema, only the TS narrowing is
              // missing.
              filters: request.body.filters as SavedViewAttributes['filters'],
            }),
          };
          const so = await core.savedObjects.client.update<SavedViewAttributes>(
            SAVED_VIEW_SO_TYPE,
            request.params.id,
            patch
          );
          // `update` returns Partial<T> attributes — backfill to a full
          // summary by fetching the current doc only if needed; here it's
          // fine to return the partial cast back to the wire shape.
          return response.ok({
            body: toSummary(so.id, so.attributes as SavedViewAttributes),
          });
        } catch (err) {
          const status = (err as { output?: { statusCode?: number } }).output?.statusCode;
          if (status === 404) {
            return response.notFound({ body: { message: 'Saved view not found' } });
          }
          logger.warn(`saved_views update failed: ${(err as Error).message}`);
          return response.customError({
            statusCode: 500,
            body: { message: `Failed to update saved view: ${(err as Error).message}` },
          });
        }
      }
    );

  // -------- DELETE --------
  router.versioned
    .delete({
      path: `${SAVED_VIEWS_API_PATH}/{id}`,
      access: 'public',
      security: {
        authz: { requiredPrivileges: [THREAT_INTELLIGENCE_API_PRIVILEGES.writeSubscriptions] },
      },
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: {
          request: {
            params: schema.object({ id: schema.string({ minLength: 1 }) }),
          },
        },
      },
      async (context, request, response) => {
        const core = await context.core;
        try {
          await core.savedObjects.client.delete(SAVED_VIEW_SO_TYPE, request.params.id);
          return response.ok({ body: { id: request.params.id, deleted: true } });
        } catch (err) {
          const status = (err as { output?: { statusCode?: number } }).output?.statusCode;
          if (status === 404) {
            return response.notFound({ body: { message: 'Saved view not found' } });
          }
          logger.warn(`saved_views delete failed: ${(err as Error).message}`);
          return response.customError({
            statusCode: 500,
            body: { message: `Failed to delete saved view: ${(err as Error).message}` },
          });
        }
      }
    );
};
