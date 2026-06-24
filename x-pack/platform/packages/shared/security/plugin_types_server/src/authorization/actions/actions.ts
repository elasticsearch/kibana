/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AlertingActions } from './alerting';
import type { AlertsActions } from './alerts';
import type { ApiActions } from './api';
import type { AppActions } from './app';
import type { CasesActions } from './cases';
import type { SavedObjectActions } from './saved_object';
import type { SpaceActions } from './space';
import type { UIActions } from './ui';

/** Actions are used to create the "actions" that are associated with Elasticsearch's
 * application privileges, and are used to perform the authorization checks implemented
 * by the various `checkPrivilegesWithRequest` derivatives.
 */
export interface Actions {
  readonly alerts: AlertsActions;
  readonly api: ApiActions;
  readonly app: AppActions;
  readonly cases: CasesActions;
  readonly login: string;
  readonly savedObject: SavedObjectActions;
  readonly alerting: AlertingActions;
  readonly space: SpaceActions;
  readonly ui: UIActions;
}
