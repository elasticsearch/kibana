/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { CoreSetup, Plugin } from '@kbn/core/server';
import { SavedObjectsErrorHelpers } from '@kbn/core-saved-objects-server';

export const ACCESS_CONTROL_TYPE = 'access_control_type';
export const NON_ACCESS_CONTROL_TYPE = 'non_access_control_type';

export class AccessControlTestPlugin implements Plugin {
  public setup(core: CoreSetup) {
    core.savedObjects.registerType({
      name: ACCESS_CONTROL_TYPE,
      hidden: false,
      namespaceType: 'multiple-isolated',
      supportsAccessControl: true,
      management: {
        importableAndExportable: true,
      },
      mappings: {
        dynamic: false,
        properties: {
          description: { type: 'text' },
        },
      },
    });

    core.savedObjects.registerType({
      name: NON_ACCESS_CONTROL_TYPE,
      hidden: false,
      namespaceType: 'multiple-isolated',
      management: {
        importableAndExportable: true,
      },
      mappings: {
        dynamic: false,
        properties: {
          description: { type: 'text' },
        },
      },
    });

    const router = core.http.createRouter();
    // Create
    router.post(
      {
        path: '/access_control_objects/create',
        security: {
          authz: {
            enabled: false,
            reason: 'This route is opted out from authorization',
          },
        },
        validate: {
          query: schema.object({
            overwrite: schema.boolean({
              defaultValue: false,
            }),
          }),
          body: schema.object({
            id: schema.maybe(schema.string()),
            type: schema.maybe(
              schema.oneOf([
                schema.literal(ACCESS_CONTROL_TYPE),
                schema.literal(NON_ACCESS_CONTROL_TYPE),
              ])
            ),
            isWriteRestricted: schema.maybe(schema.boolean()),
            description: schema.maybe(schema.string()),
          }),
        },
      },
      async (context, request, response) => {
        const soClient = (await context.core).savedObjects.getClient();
        const objType = request.body.type || ACCESS_CONTROL_TYPE;
        const { isWriteRestricted, description } = request.body;

        const options = {
          overwrite: request.query.overwrite ?? false,
          ...(request.body.id ? { id: request.body.id } : {}),
          ...(isWriteRestricted
            ? { accessControl: { accessMode: 'write_restricted' as const } }
            : {}),
        };
        try {
          const result = await soClient.create(
            objType,
            {
              description: description ?? 'test',
            },
            options
          );

          return response.ok({
            body: result,
          });
        } catch (error) {
          if (SavedObjectsErrorHelpers.isSavedObjectsClientError(error)) {
            return response.customError({
              statusCode: error.output.statusCode,
              body: {
                message: error.message,
              },
            });
          }
          throw error;
        }
      }
    );

    // Bulk Create
    router.post(
      {
        path: '/access_control_objects/bulk_create',
        security: {
          authz: {
            enabled: false,
            reason: 'This route is opted out from authorization',
          },
        },
        validate: {
          request: {
            query: schema.object({
              overwrite: schema.boolean({
                defaultValue: false,
              }),
            }),
            body: schema.object({
              objects: schema.arrayOf(
                schema.object({
                  id: schema.maybe(schema.string()),
                  type: schema.maybe(
                    schema.oneOf([
                      schema.literal(ACCESS_CONTROL_TYPE),
                      schema.literal(NON_ACCESS_CONTROL_TYPE),
                    ])
                  ),
                  isWriteRestricted: schema.maybe(schema.boolean()),
                  description: schema.maybe(schema.string()),
                })
              ),
              force: schema.maybe(schema.boolean({ defaultValue: false })),
            }),
          },
        },
      },
      async (context, request, response) => {
        const soClient = (await context.core).savedObjects.client;
        const overwrite = request.query.overwrite ?? false;
        try {
          const createObjects = request.body.objects.map((obj) => ({
            type: obj.type || ACCESS_CONTROL_TYPE,
            ...(obj.id ? { id: obj.id } : {}),
            ...(obj.isWriteRestricted
              ? { accessControl: { accessMode: 'write_restricted' as const } }
              : {}),
            attributes: {
              description: obj.description ?? 'description',
            },
          }));
          const result = await soClient.bulkCreate(createObjects, { overwrite });
          return response.ok({
            body: result,
          });
        } catch (error) {
          if (SavedObjectsErrorHelpers.isSavedObjectsClientError(error)) {
            return response.customError({
              statusCode: error.output.statusCode,
              body: {
                message: error.message,
              },
            });
          }
          throw error;
        }
      }
    );

    router.get(
      {
        path: '/access_control_objects/_find',
        security: {
          authz: {
            enabled: false,
            reason: 'This route is opted out from authorization',
          },
        },
        validate: false,
      },
      async (context, request, response) => {
        const soClient = (await context.core).savedObjects.client;
        const result = await soClient.find({
          type: ACCESS_CONTROL_TYPE,
        });
        return response.ok({
          body: result,
        });
      }
    );
    router.get(
      {
        path: '/access_control_objects/{objectId}',
        security: {
          authz: {
            enabled: false,
            reason: 'This route is opted out from authorization',
          },
        },
        validate: {
          params: schema.object({
            objectId: schema.string(),
          }),
        },
      },
      async (context, request, response) => {
        try {
          const soClient = (await context.core).savedObjects.client;
          const result = await soClient.get(ACCESS_CONTROL_TYPE, request.params.objectId);
          return response.ok({
            body: result,
          });
        } catch (error) {
          if (SavedObjectsErrorHelpers.isSavedObjectsClientError(error)) {
            return response.customError({
              statusCode: error.output.statusCode,
              body: {
                message: error.message,
              },
            });
          }
          throw error;
        }
      }
    );

    router.put(
      {
        path: '/access_control_objects/update',
        security: {
          authz: {
            enabled: false,
            reason: 'This route is opted out from authorization',
          },
        },
        validate: {
          body: schema.object({
            type: schema.oneOf([
              schema.literal(ACCESS_CONTROL_TYPE),
              schema.literal(NON_ACCESS_CONTROL_TYPE),
            ]),
            objectId: schema.string(),
            upsert: schema.boolean({ defaultValue: false }),
          }),
        },
      },
      async (context, request, response) => {
        const soClient = (await context.core).savedObjects.client;
        try {
          const objectType = request.body.type || ACCESS_CONTROL_TYPE;
          const upsert = request.body.upsert ?? false;
          const result = await soClient.update(
            objectType,
            request.body.objectId,
            { description: 'updated description' },
            { upsert: upsert ? { description: 'updated description' } : undefined }
          );

          return response.ok({
            body: result,
          });
        } catch (error) {
          if (SavedObjectsErrorHelpers.isSavedObjectsClientError(error)) {
            return response.customError({
              statusCode: error.output.statusCode,
              body: {
                message: error.message,
              },
            });
          }
          throw error;
        }
      }
    );
    router.put(
      {
        path: '/access_control_objects/change_owner',
        security: {
          authz: {
            enabled: false,
            reason: 'This route is opted out from authorization',
          },
        },
        validate: {
          body: schema.object({
            newOwnerProfileUid: schema.string(),
            objects: schema.arrayOf(
              schema.object({
                type: schema.oneOf([
                  schema.literal(ACCESS_CONTROL_TYPE),
                  schema.literal(NON_ACCESS_CONTROL_TYPE),
                ]),
                id: schema.string(),
              })
            ),
          }),
        },
      },
      async (context, request, response) => {
        const soClient = (await context.core).savedObjects.client;

        try {
          const result = await soClient.changeOwnership(request.body.objects, {
            newOwnerProfileUid: request.body.newOwnerProfileUid,
          });
          return response.ok({
            body: result,
          });
        } catch (error) {
          if (SavedObjectsErrorHelpers.isSavedObjectsClientError(error)) {
            return response.customError({
              statusCode: error.output.statusCode,
              body: {
                message: error.message,
              },
            });
          }
          throw error;
        }
      }
    );
    router.put(
      {
        path: '/access_control_objects/change_access_mode',
        security: {
          authz: {
            enabled: false,
            reason: 'This route is opted out from authorization',
          },
        },
        validate: {
          body: schema.object({
            objects: schema.arrayOf(
              schema.object({
                id: schema.string(),
                type: schema.oneOf([
                  schema.literal(ACCESS_CONTROL_TYPE),
                  schema.literal(NON_ACCESS_CONTROL_TYPE),
                ]),
              })
            ),
            newAccessMode: schema.oneOf([
              schema.literal('write_restricted'),
              schema.literal('default'),
            ]),
          }),
        },
      },
      async (context, request, response) => {
        const soClient = (await context.core).savedObjects.client;
        try {
          const result = await soClient.changeAccessMode(request.body.objects, {
            accessMode: request.body.newAccessMode,
          });
          return response.ok({
            body: result,
          });
        } catch (error) {
          if (SavedObjectsErrorHelpers.isSavedObjectsClientError(error)) {
            return response.customError({
              statusCode: error.output.statusCode,
              body: {
                message: error.message,
              },
            });
          }
          throw error;
        }
      }
    );

    router.delete(
      {
        path: '/access_control_objects/{objectId}',
        security: {
          authz: {
            enabled: false,
            reason: 'This route is opted out from authorization',
          },
        },
        validate: {
          params: schema.object({
            objectId: schema.string(),
          }),
        },
      },
      async (context, request, response) => {
        try {
          const soClient = (await context.core).savedObjects.client;
          const result = await soClient.delete(ACCESS_CONTROL_TYPE, request.params.objectId);
          return response.ok({
            body: result,
          });
        } catch (error) {
          if (SavedObjectsErrorHelpers.isSavedObjectsClientError(error)) {
            return response.customError({
              statusCode: error.output.statusCode,
              body: {
                message: error.message,
              },
            });
          }
          throw error;
        }
      }
    );

    router.post(
      {
        path: '/access_control_objects/bulk_delete',
        security: {
          authz: {
            enabled: false,
            reason: 'This route is opted out from authorization',
          },
        },
        validate: {
          body: schema.object({
            objects: schema.arrayOf(
              schema.object({
                id: schema.string(),
                type: schema.oneOf([
                  schema.literal(ACCESS_CONTROL_TYPE),
                  schema.literal(NON_ACCESS_CONTROL_TYPE),
                ]),
              })
            ),
            force: schema.maybe(schema.boolean({ defaultValue: false })),
          }),
        },
      },
      async (context, request, response) => {
        const soClient = (await context.core).savedObjects.client;
        try {
          const result = await soClient.bulkDelete(request.body.objects, {
            force: request.body.force,
          });
          return response.ok({
            body: result,
          });
        } catch (error) {
          if (SavedObjectsErrorHelpers.isSavedObjectsClientError(error)) {
            return response.customError({
              statusCode: error.output.statusCode,
              body: {
                message: error.message,
              },
            });
          }
          throw error;
        }
      }
    );
    router.post(
      {
        path: '/access_control_objects/bulk_update',
        security: {
          authz: {
            enabled: false,
            reason: 'This route is opted out from authorization',
          },
        },
        validate: {
          body: schema.object({
            objects: schema.arrayOf(
              schema.object({
                id: schema.string(),
                type: schema.oneOf([
                  schema.literal(ACCESS_CONTROL_TYPE),
                  schema.literal(NON_ACCESS_CONTROL_TYPE),
                ]),
              })
            ),
            force: schema.maybe(schema.boolean({ defaultValue: false })),
          }),
        },
      },
      async (context, request, response) => {
        const soClient = (await context.core).savedObjects.client;
        try {
          const updateObjects = request.body.objects.map((obj) => ({
            ...obj,
            attributes: {
              description: 'updated description',
            },
          }));
          const result = await soClient.bulkUpdate(updateObjects);
          return response.ok({
            body: result,
          });
        } catch (error) {
          if (SavedObjectsErrorHelpers.isSavedObjectsClientError(error)) {
            return response.customError({
              statusCode: error.output.statusCode,
              body: {
                message: error.message,
              },
            });
          }
          throw error;
        }
      }
    );

    // Get NON_ACCESS_CONTROL_TYPE
    router.get(
      {
        path: '/non_access_control_objects/{objectId}',
        security: {
          authz: {
            enabled: false,
            reason: 'This route is opted out from authorization',
          },
        },
        validate: {
          params: schema.object({
            objectId: schema.string(),
          }),
        },
      },
      async (context, request, response) => {
        try {
          const soClient = (await context.core).savedObjects.client;
          const result = await soClient.get(NON_ACCESS_CONTROL_TYPE, request.params.objectId);
          return response.ok({
            body: result,
          });
        } catch (error) {
          if (error.output && error.output.statusCode === 404) {
            return response.notFound({
              body: error.message,
            });
          }
          return response.forbidden({
            body: error.message,
          });
        }
      }
    );

    // FIND NON_ACCESS_CONTROL_TYPE
    router.get(
      {
        path: '/non_access_control_objects/_find',
        security: {
          authz: {
            enabled: false,
            reason: 'This route is opted out from authorization',
          },
        },
        validate: false,
      },
      async (context, request, response) => {
        const soClient = (await context.core).savedObjects.client;
        const result = await soClient.find({
          type: NON_ACCESS_CONTROL_TYPE,
        });
        return response.ok({
          body: result,
        });
      }
    );
  }
  public start() {}
}
