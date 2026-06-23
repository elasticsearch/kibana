/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ManagementSection } from '@kbn/management-plugin/public';

/**
 * Hides the alerting v2 management UI when the engine is disabled.
 *
 * Disables the registered section and every app underneath it so the
 * `V2 Alerting Preview` entry — together with its `Rules`, `Alerts`,
 * `Action Policies`, and `Execution history` items — is filtered out of
 * the management navigation by `ManagementSectionsService.getSectionsEnabled`.
 */
export const disableAlertingManagementUi = (section: ManagementSection): void => {
  section.disable();
  section.apps.forEach((app) => app.disable());
};
