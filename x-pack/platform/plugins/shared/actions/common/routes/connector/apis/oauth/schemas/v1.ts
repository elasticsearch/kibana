/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { CONNECTOR_ID_MAX_LENGTH } from '../../../../..';

export const startOAuthFlowRequestBodySchema = schema.object({
  returnUrl: schema.maybe(schema.uri({ scheme: ['http', 'https'] })),
});

export const startOAuthFlowPathParamsSchema = schema.object({
  connectorId: schema.string({ maxLength: CONNECTOR_ID_MAX_LENGTH }),
});

export const disconnectOAuthPathParamsSchema = schema.object({
  connectorId: schema.string({ maxLength: CONNECTOR_ID_MAX_LENGTH }),
});

export const cancelOAuthPathParamsSchema = schema.object({
  connectorId: schema.string({ maxLength: CONNECTOR_ID_MAX_LENGTH }),
});

export const cancelOAuthBodySchema = schema.object({
  state: schema.string({ maxLength: 256 }),
});
