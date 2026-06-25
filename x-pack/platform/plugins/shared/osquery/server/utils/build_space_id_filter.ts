/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';

/**
 * Builds the `space_id` filter clause for osquery ES reads.
 *
 * `spaceId` is required and the function always returns a clause. Callers that
 * lack an active space resolve it to {@link DEFAULT_SPACE_ID} before reaching
 * here — never pass `undefined`.
 *
 * In the default space we also match documents with a missing `space_id`
 * field, because agent-emitted osquerybeat documents (results / action
 * responses) may not carry the field. Named spaces match the `space_id` term
 * exactly and never include field-less documents.
 */
export const buildSpaceIdFilter = (spaceId: string): estypes.QueryDslQueryContainer => {
  if (spaceId === DEFAULT_SPACE_ID) {
    return {
      bool: {
        should: [
          { term: { space_id: DEFAULT_SPACE_ID } },
          { bool: { must_not: { exists: { field: 'space_id' } } } },
        ],
      },
    };
  }

  return { term: { space_id: spaceId } };
};
