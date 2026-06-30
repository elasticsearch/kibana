/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema, type TypeOf } from '@kbn/config-schema';
import { AgentTypeSchemaLiteral } from '..';

const AgentStatusAgentIdSchema = schema.string({
  minLength: 1,
  maxLength: 256,
  validate: (id) => {
    if (id.trim() === '') {
      return 'actionIds can not be empty strings';
    }
  },
});

export const EndpointAgentStatusRequestSchema = {
  query: schema.object({
    agentIds: schema.oneOf([
      schema.arrayOf(AgentStatusAgentIdSchema, { minSize: 1, maxSize: 50 }),
      AgentStatusAgentIdSchema,
    ]),

    agentType: schema.maybe(
      schema.oneOf(
        // @ts-expect-error TS2769: No overload matches this call
        AgentTypeSchemaLiteral,
        {
          defaultValue: 'endpoint',
        }
      )
    ),
  }),
};

export type EndpointAgentStatusRequestQueryParams = TypeOf<
  typeof EndpointAgentStatusRequestSchema.query
>;
