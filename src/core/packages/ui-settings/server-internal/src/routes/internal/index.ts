/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { InternalUiSettingsRouter } from '../../internal_types';
import { registerInternalDeleteRoute } from './delete';
import { registerInternalGetRoute } from './get';
import { registerInternalGetMetadataRoute } from './get_metadata';
import { registerInternalSetManyRoute } from './set_many';
import { registerInternalSetRoute } from './set';
import { registerInternalValidateRoute } from './validate';

export function registerInternalRoutes(router: InternalUiSettingsRouter) {
  registerInternalGetRoute(router);
  registerInternalGetMetadataRoute(router);
  registerInternalDeleteRoute(router);
  registerInternalSetRoute(router);
  registerInternalSetManyRoute(router);
  registerInternalValidateRoute(router);
}
