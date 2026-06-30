/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { schema } from '@kbn/config-schema';
import { isValidId } from './is_valid_id';
import { ID_MAX_LENGTH } from '../../constants';

export const asCodeIdSchema = schema.string({
  meta: {
    description:
      'A unique identifier. Must contain only lowercase letters, numbers, hyphens, and underscores.',
  },
  validate: (value) => {
    if (!isValidId(value)) {
      return 'ID must contain only lowercase letters, numbers, hyphens, and underscores.';
    }
  },
  minLength: 1,
  maxLength: ID_MAX_LENGTH,
});
