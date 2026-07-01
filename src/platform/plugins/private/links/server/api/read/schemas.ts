/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { schema } from '@kbn/config-schema';
import { asCodeMetaSchema, MAX_ID_LENGTH } from '@kbn/as-code-shared-schemas';
import { linksApiStateSchema } from '../schemas';
import { LINKS_ID_DESCRIPTION } from '../constants';

export const readResponseBodySchema = schema.object({
  id: schema.string({
    maxLength: MAX_ID_LENGTH,
    meta: {
      description: LINKS_ID_DESCRIPTION,
    },
  }),
  data: linksApiStateSchema,
  meta: asCodeMetaSchema,
});
