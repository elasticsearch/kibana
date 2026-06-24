/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Actions as ActionsType } from '@kbn/security-plugin-types-server';

import { AlertingActions } from './alerting';
import { AlertsActions } from './alerts';
import { ApiActions } from './api';
import { AppActions } from './app';
import { CasesActions } from './cases';
import { SavedObjectActions } from './saved_object';
import { SpaceActions } from './space';
import { UIActions } from './ui';

/** Actions are used to create the "actions" that are associated with Elasticsearch's
 * application privileges, and are used to perform the authorization checks implemented
 * by the various `checkPrivilegesWithRequest` derivatives.
 */
export class Actions implements ActionsType {
  public readonly alerts: AlertsActions;
  public readonly api: ApiActions;
  public readonly app: AppActions;
  public readonly cases: CasesActions;
  public readonly login: string;
  public readonly savedObject: SavedObjectActions;
  public readonly alerting: AlertingActions;
  public readonly space: SpaceActions;
  public readonly ui: UIActions;

  constructor() {
    this.alerts = new AlertsActions();
    this.api = new ApiActions();
    this.app = new AppActions();
    this.cases = new CasesActions();
    this.login = 'login:';
    this.savedObject = new SavedObjectActions();
    this.alerting = new AlertingActions();
    this.space = new SpaceActions();
    this.ui = new UIActions();
  }
}
