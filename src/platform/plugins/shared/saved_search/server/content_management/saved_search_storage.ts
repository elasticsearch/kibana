/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { SOContentStorage } from '@kbn/content-management-utils';
import type { Logger } from '@kbn/logging';
import { SavedSearchType } from '@kbn/discover-session-constants';
import type { SavedSearchCrudTypes } from '../../common/content_management';
import { cmServicesDefinition } from './schema/cm_services';

export class SavedSearchStorage extends SOContentStorage<SavedSearchCrudTypes> {
  constructor({
    logger,
    throwOnResultValidationError,
  }: {
    logger: Logger;
    throwOnResultValidationError: boolean;
  }) {
    super({
      savedObjectType: SavedSearchType,
      cmServicesDefinition,
      enableMSearch: true,
      allowedSavedObjectAttributes: ['title', 'description', 'tabs'],
      logger,
      throwOnResultValidationError,
    });
  }
}
