/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { schema } from '@kbn/config-schema';
import { MAX_ID_LENGTH } from '../../constants';

export const MAX_TAG_C0UNT = 1_000;

export const getAsCodeTagsSchema = (customDescrption?: string, customMaxSize?: number) =>
  schema.maybe(
    schema.arrayOf(schema.string({ maxLength: MAX_ID_LENGTH }), {
      maxSize: customMaxSize ?? MAX_TAG_C0UNT,
      defaultValue: [] as string[],
      meta: { description: customDescrption ?? 'Tag IDs associated with this library item.' },
    })
  );
