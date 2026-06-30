/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { MAX_FEATURE_ID_LENGTH } from '../../../../..';

export const connectorTypesQuerySchema = schema.object({
  feature_id: schema.maybe(
    schema.string({
      meta: {
        description:
          'A filter to limit the retrieved connector types to those that support a specific feature (such as alerting or cases).',
      },
      maxLength: MAX_FEATURE_ID_LENGTH,
    })
  ),
});
