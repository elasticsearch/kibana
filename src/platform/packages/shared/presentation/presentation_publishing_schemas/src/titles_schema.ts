/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { schema } from '@kbn/config-schema';

export const serializedTitlesSchema = schema.object({
  description: schema.maybe(
    schema.string({
      meta: {
        description: 'A short description of the panel.',
      },
    })
  ),
  hide_title: schema.maybe(
    schema.boolean({
      meta: {
        description: 'When true, the panel title is hidden. Defaults to false.',
      },
    })
  ),
  title: schema.maybe(
    schema.string({
      meta: {
        description: 'The panel title.',
      },
    })
  ),
  hide_border: schema.maybe(
    schema.boolean({
      meta: {
        description: 'When true, the panel border is hidden. Defaults to false.',
      },
    })
  ),
});
