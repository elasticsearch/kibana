/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { ruleResponseInternalSchema } from '../../../../response/schemas/v1';
import { MAX_ID_LENGTH } from '../../../../../../constants';

export const getInternalRuleRequestParamsSchema = schema.object({
  id: schema.string({
    maxLength: MAX_ID_LENGTH,
    meta: {
      description: 'The identifier for the rule.',
    },
  }),
});

export const getInternalRuleResponseSchema = ruleResponseInternalSchema;
