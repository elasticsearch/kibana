/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';

import { clientAuth } from '../../../common/types';

const secretRefSchema = schema.oneOf([
  schema.object({
    id: schema.string(),
  }),
  schema.string(),
]);

export const FleetServerHostBaseSchema = schema.object({
  name: schema.maybe(schema.string()),
  host_urls: schema.maybe(schema.arrayOf(schema.string(), { minSize: 1, maxSize: 10 })),
  is_default: schema.maybe(schema.boolean({ defaultValue: false })),
  is_internal: schema.maybe(schema.boolean()),
  allow_edit: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 100 })),
  proxy_id: schema.nullable(schema.string()),
  secrets: schema.maybe(
    schema.object({
      ssl: schema.maybe(
        schema.object({
          key: schema.maybe(secretRefSchema),
          es_key: schema.maybe(secretRefSchema),
          agent_key: schema.maybe(secretRefSchema),
        })
      ),
    })
  ),
  ssl: schema.maybe(
    schema.oneOf([
      schema.literal(null),
      schema.object({
        certificate_authorities: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 10 })),
        certificate: schema.maybe(schema.string()),
        key: schema.maybe(schema.string()),
        es_certificate_authorities: schema.maybe(schema.arrayOf(schema.string(), { maxSize: 10 })),
        es_certificate: schema.maybe(schema.string()),
        es_key: schema.maybe(schema.string()),
        agent_certificate_authorities: schema.maybe(
          schema.arrayOf(schema.string(), { maxSize: 10 })
        ),
        agent_certificate: schema.maybe(schema.string()),
        agent_key: schema.maybe(schema.string()),
        client_auth: schema.maybe(
          schema.oneOf([
            schema.literal(clientAuth.Optional),
            schema.literal(clientAuth.Required),
            schema.literal(clientAuth.None),
          ])
        ),
      }),
    ])
  ),
});

export const FleetServerHostSchema = FleetServerHostBaseSchema.extends({
  id: schema.string(),
  name: schema.string(),
  host_urls: schema.arrayOf(schema.string(), { minSize: 1, maxSize: 10 }),
  is_default: schema.boolean({ defaultValue: false }),
  is_internal: schema.maybe(schema.boolean()),
  is_preconfigured: schema.boolean({ defaultValue: false }),
  proxy_id: schema.maybe(schema.oneOf([schema.literal(null), schema.string()])),
});

export const FleetServerHostResponseSchema = schema.object({
  item: FleetServerHostSchema,
});

export const PostFleetServerHostRequestSchema = {
  body: FleetServerHostSchema.extends({
    id: schema.maybe(schema.string()),
  }),
};

export const GetOneFleetServerHostRequestSchema = {
  params: schema.object({
    itemId: schema.string({ meta: { description: 'The ID of the Fleet Server host' } }),
  }),
};

export const PutFleetServerHostRequestSchema = {
  params: schema.object({
    itemId: schema.string({ meta: { description: 'The ID of the Fleet Server host' } }),
  }),
  body: FleetServerHostBaseSchema,
};

export const GetAllFleetServerHostRequestSchema = {};
