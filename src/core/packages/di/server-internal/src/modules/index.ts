/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { KibanaContainerModule } from '@kbn/core-di';
import { loadCapabilities } from './capabilities';
import { loadElasticsearch } from './elasticsearch';
import { loadHttp } from './http';
import { loadSavedObjects } from './saved_objects';
import { loadSecurity } from './security';
import { loadUiSettings } from './ui_settings';
import { loadUserProfile } from './user_profile';

export const core = new KibanaContainerModule((options) => {
  loadCapabilities(options);
  loadElasticsearch(options);
  loadHttp(options);
  loadSavedObjects(options);
  loadSecurity(options);
  loadUiSettings(options);
  loadUserProfile(options);
});
