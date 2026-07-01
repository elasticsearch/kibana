/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { TypeOf } from '@kbn/config-schema';
import type { asCodeSearchRequestSchema } from '@kbn/as-code-shared-schemas';
import type { searchResponseBodySchema } from './schemas';

export type LinksSearchRequestParams = TypeOf<typeof asCodeSearchRequestSchema>;
export type LinksSearchResponseBody = TypeOf<typeof searchResponseBodySchema>;
