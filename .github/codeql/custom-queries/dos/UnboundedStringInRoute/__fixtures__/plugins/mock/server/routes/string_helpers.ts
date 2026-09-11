/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { schema, unboundedString as unboundedConfigString, spaceId } from '@kbn/config-schema';
import { z, unboundedString as unboundedZodString, savedObjectId } from '@kbn/zod';
import * as zNs from '@kbn/zod/v4';

interface TestRouter {
  post(config: object, handler: () => void): void;
}

export const registerStringHelperRoutes = (router: TestRouter, handler: () => void): void => {
  // Intentional unbounded and reporting helpers must not produce alerts.

  router.post(
    {
      path: '/api/helpers/config',
      validate: {
        body: schema.object({
          id: schema.savedObjectId(),
          type: schema.savedObjectType(),
          version: schema.savedObjectVersion(),
          space: spaceId(),
          name: schema.displayName.warn({ label: 'test.name' }),
          description: schema.description(),
          filter: schema.searchFilter(),
          aggregation: schema.aggregation(),
          sort: schema.querySortField(),
          trusted: schema.unboundedString({ reason: 'Size enforced upstream' }),
          aliased: unboundedConfigString({ reason: 'Size enforced upstream' }),
        }),
      },
    },
    handler
  );

  router.post(
    {
      path: '/api/helpers/zod',
      validate: {
        body: z.object({
          id: savedObjectId(),
          warned: savedObjectId.warn({ label: 'test.id' }).optional(),
          trusted: unboundedZodString({ reason: 'Size enforced upstream' }).optional(),
          versioned: zNs.unboundedString({ reason: 'Size enforced upstream' }),
          versionedWarn: zNs.spaceId.warn(),
        }),
      },
    },
    handler
  );

  // Unrelated functions with these names must not suppress unbounded strings.
  const otherHelpers = {
    unboundedString: (value: z.ZodString) => value,
    warn: (value: z.ZodString) => value,
  };
  router.post(
    {
      path: '/api/helpers/unrelated',
      validate: {
        body: z.object({
          first: otherHelpers.unboundedString(z.string()), // $ Alert
          second: otherHelpers.warn(z.string()), // $ Alert
        }),
      },
    },
    handler
  );
};
