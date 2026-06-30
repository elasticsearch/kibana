/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';

import { elasticsearchRoleSchema, getKibanaRoleSchema } from '../../authorization';

export const restApiKeySchema = schema.object({
  type: schema.maybe(schema.literal('rest')),
  name: schema.string(),
  expiration: schema.maybe(schema.string()),
  role_descriptors: schema.recordOf(schema.string(), schema.object({}, { unknowns: 'allow' }), {
    defaultValue: {},
  }),
  metadata: schema.maybe(schema.object({}, { unknowns: 'allow' })),
});

export const getRestApiKeyWithKibanaPrivilegesSchema = (
  getBasePrivilegeNames: Parameters<typeof getKibanaRoleSchema>[0]
) =>
  schema.object({
    type: schema.maybe(schema.literal('rest')),
    name: schema.string(),
    expiration: schema.maybe(schema.string()),
    metadata: schema.maybe(schema.object({}, { unknowns: 'allow' })),
    kibana_role_descriptors: schema.recordOf(
      schema.string(),
      schema.object({
        elasticsearch: elasticsearchRoleSchema.extends({}, { unknowns: 'allow' }),
        kibana: getKibanaRoleSchema(getBasePrivilegeNames),
      })
    ),
  });

export const crossClusterApiKeySchema = schema.object({
  type: schema.literal('cross_cluster'),
  name: schema.string(),
  expiration: schema.maybe(schema.string()),
  metadata: schema.maybe(schema.object({}, { unknowns: 'allow' })),
  certificate_identity: schema.maybe(schema.string()),
  access: schema.object(
    {
      search: schema.maybe(
        schema.arrayOf(
          schema.object({
            names: schema.arrayOf(schema.string(), { maxSize: 100 }),
            query: schema.maybe(schema.any()),
            field_security: schema.maybe(schema.any()),
            allow_restricted_indices: schema.maybe(schema.boolean()),
          }),
          { maxSize: 100 }
        )
      ),
      replication: schema.maybe(
        schema.arrayOf(
          schema.object({
            names: schema.arrayOf(schema.string(), { maxSize: 100 }),
            allow_restricted_indices: schema.maybe(schema.boolean()),
          }),
          { maxSize: 100 }
        )
      ),
    },
    { unknowns: 'allow' }
  ),
});

export const updateRestApiKeySchema = schema.object({
  id: schema.string(),
  type: schema.maybe(schema.literal('rest')),
  expiration: schema.maybe(schema.string()),
  role_descriptors: schema.recordOf(schema.string(), schema.object({}, { unknowns: 'allow' }), {
    defaultValue: {},
  }),
  metadata: schema.maybe(schema.object({}, { unknowns: 'allow' })),
});

export const updateCrossClusterApiKeySchema = schema.object({
  id: schema.string(),
  type: schema.literal('cross_cluster'),
  expiration: schema.maybe(schema.string()),
  metadata: schema.maybe(schema.object({}, { unknowns: 'allow' })),
  // `null` explicitly clears a previously assigned certificate identity.
  certificate_identity: schema.maybe(schema.nullable(schema.string())),
  access: schema.object(
    {
      search: schema.maybe(
        schema.arrayOf(
          schema.object({
            names: schema.arrayOf(schema.string(), { maxSize: 100 }),
            query: schema.maybe(schema.any()),
            field_security: schema.maybe(schema.any()),
            allow_restricted_indices: schema.maybe(schema.boolean()),
          }),
          { maxSize: 100 }
        )
      ),
      replication: schema.maybe(
        schema.arrayOf(
          schema.object({
            names: schema.arrayOf(schema.string(), { maxSize: 100 }),
            allow_restricted_indices: schema.maybe(schema.boolean()),
          }),
          { maxSize: 100 }
        )
      ),
    },
    { unknowns: 'allow' }
  ),
});

export const getUpdateRestApiKeyWithKibanaPrivilegesSchema = (
  getBasePrivilegeNames: Parameters<typeof getKibanaRoleSchema>[0]
) =>
  schema.object({
    type: schema.maybe(schema.literal('rest')),
    expiration: schema.maybe(schema.string()),
    metadata: schema.maybe(schema.object({}, { unknowns: 'allow' })),
    id: schema.string(),
    kibana_role_descriptors: schema.recordOf(
      schema.string(),
      schema.object({
        elasticsearch: elasticsearchRoleSchema.extends({}, { unknowns: 'allow' }),
        kibana: getKibanaRoleSchema(getBasePrivilegeNames),
      })
    ),
  });
