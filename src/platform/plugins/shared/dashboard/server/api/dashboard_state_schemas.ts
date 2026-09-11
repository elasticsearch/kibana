/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  getPanelSchema as getPanelSchemaFromPackage,
  getDashboardDataSchema,
} from '@kbn/as-code-dashboard-schema';
import { embeddableService } from '../kibana_services';

export function getPanelSchema() {
  const embeddableSchemas = embeddableService ? embeddableService.getAllEmbeddableSchemas() : {};
  return getPanelSchemaFromPackage(embeddableSchemas);
}

export function getDashboardStateSchema(
  isDashboardAppRequest: boolean,
  isReadRequest: boolean = false
) {
  const embeddableSchemas = embeddableService ? embeddableService.getAllEmbeddableSchemas() : {};
  return getDashboardDataSchema(embeddableSchemas, { isDashboardAppRequest, isReadRequest });
}
